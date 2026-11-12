// Сеть седьмого уровня (docs/specs/2026-11-neural.md): признаки — те же, что в tools/gpu/features.py (эталон
// tools/gpu/vectors/features.jsonl.gz, его же проверяет selftest.py), оценка — та же, что в torch; бот на сети видит
// только наблюдение своего места (ADR 0005).
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { apply, legalActions, newGame, observe, RULES_V1, stateFrom } from '../../src/engine';
import type { Observation, State } from '../../src/engine';
import { createHash } from 'node:crypto';
import { makeRng, unseen, thinkSync, chooseAction, think, NET_LEVEL, THINK_MS } from '../../src/bot';
import { layout } from '../../src/bot/legal';
import { Base64Reader, encode, features, FEATURES_VERSION, fromBase64, INPUTS, MASTER_WEIGHTS, masterNet, NET_PARAMS, netFromBin, netLoader, netThink, pack, RAW_SIZE, valueOf } from '../../src/bot/net';
import { moduleOf, OUT } from '../gpu/embed';
import { actorOf, shuffled } from '../sim/play';
import { netSpec, playerOf } from '../sim/players';

const GPU = join(import.meta.dir, '../gpu/vectors');
const tiny = netFromBin(new Uint8Array(readFileSync(join(GPU, 'tiny.bin'))));
const rows = gunzipSync(readFileSync(join(GPU, 'features.jsonl.gz'))).toString('utf8').trim().split('\n')
  .map(l => JSON.parse(l) as { obs: Observation; raw: number[]; feat: [number, number][]; value: number });

function twin(s: State, seat: number, seed: number): State {
  const o = observe(s, seat);
  const pool = unseen(o);
  const rng = makeRng(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const { hidden, talon } = layout(o, pool);
  return stateFrom(o, hidden, talon);
}

describe('сеть', () => {
  test('эталон: сырая запись, входы и оценка — как у tools/gpu (бит в бит)', () => {
    expect(rows.length).toBeGreaterThanOrEqual(1000);
    expect(new Set(rows.map(r => r.obs.seats))).toEqual(new Set([2, 3, 4]));
    for (const r of rows) {
      const raw = pack(r.obs);
      expect(raw.length).toBe(RAW_SIZE);
      expect(Array.from(raw)).toEqual(r.raw);
      const x = encode(raw);
      const feat: [number, number][] = [];
      x.forEach((v, i) => { if (v !== 0) feat.push([i, v]); });
      expect(feat).toEqual(r.feat);
      expect(valueOf(tiny, x)).toBe(r.value);
    }
  });

  test('каждая карта — ровно в одной плоскости; масти считаются от козыря', () => {
    for (const r of rows.slice(0, 300)) {
      const x = features(r.obs);
      expect(x.length).toBe(INPUTS);
      for (let card = 0; card < 36; card++) {
        let n = 0;
        for (const plane of [0, 2, 3, 4, 5, 6, 7, 8, 9, 10]) n += x[plane * 36 + card];
        expect(n).toBe(1);
      }
    }
  });

  test('файл весов: чужой файл и другая версия признаков не читаются', () => {
    const bytes = new Uint8Array(readFileSync(join(GPU, 'tiny.bin')));
    expect(tiny.sizes).toEqual([INPUTS, 16, 1]);
    const bad = bytes.slice();
    bad[0] ^= 1;
    expect(() => netFromBin(bad)).toThrow();
    const other = bytes.slice();
    new Uint32Array(other.buffer)[1] = FEATURES_VERSION + 1;
    expect(() => netFromBin(other)).toThrow();
    expect(() => netFromBin(bytes.slice(0, bytes.length - 4))).toThrow();
  });

  test('бот на сети: законное действие и одно и то же в позиции и в её двойнике (ADR 0005)', () => {
    const rng = makeRng(5);
    const p = { ...NET_PARAMS, samples: 4 };
    let checked = 0;
    for (let g = 0; g < 24; g++) {
      let s = newGame({ rules: RULES_V1, variant: g % 2 ? 'perevodnoy' : 'podkidnoy', seats: 2 + (g % 3), first: 0 }, shuffled(rng));
      for (let n = 0; n < 30 && s.phase !== 'end'; n++) {
        const seat = actorOf(s);
        if (n % 3 === 0) {
          const t = twin(s, seat, g * 1000 + n);
          const a = thinkSync(netThink(observe(s, seat), tiny, p, makeRng(g * 31 + n)));
          const b = thinkSync(netThink(observe(t, seat), tiny, p, makeRng(g * 31 + n)));
          expect(b).toEqual(a);
          expect(legalActions(s, seat).some(x => JSON.stringify(x) === JSON.stringify(a))).toBe(true);
          checked++;
        }
        s = apply(s, seat, chooseAction(observe(s, seat), 'average', rng));
      }
    }
    expect(checked).toBeGreaterThan(150);
  }, 120_000);
});

// Путь к сети на Windows сам содержит «:» (`D:\…`): разбор `net:<файл>[:<раскладов>][:now|bout]` — справа
// (у владельца selftest.py падал: от `net:D:\…\tiny.bin:2:now` оставалось «D»).
test('net:<файл> — путь с двоеточием и без, расклады и горизонт', () => {
  expect(netSpec('net:D:\\gornitsa.games\\durak\\tools\\gpu\\vectors\\tiny.bin:2:now'))
    .toEqual({ path: 'D:\\gornitsa.games\\durak\\tools\\gpu\\vectors\\tiny.bin', samples: 2, horizon: 'now' });
  expect(netSpec('net:D:\\runs\\main\\arena.bin')).toEqual({ path: 'D:\\runs\\main\\arena.bin' });
  expect(netSpec('net:tools/gpu/nets/x/best.bin:24:bout')).toEqual({ path: 'tools/gpu/nets/x/best.bin', samples: 24, horizon: 'bout' });
  expect(netSpec('net:tools/x.bin:24')).toEqual({ path: 'tools/x.bin', samples: 24 });
  expect(netSpec('net:tools/x.bin')).toEqual({ path: 'tools/x.bin' });
});

// «Мастер» в сборке (спецификация сети, §11): веса — из файла снимка генератором, без правки руками; уровень `neural`
// приложения ходит ровно как бот `net:<тот же файл>` арены и самоигры — числа арены верны и для игры.
describe('сеть в сборке', () => {
  const ROOT = join(import.meta.dir, '../..');
  const bin = new Uint8Array(readFileSync(join(ROOT, MASTER_WEIGHTS.source)));

  test('вшитые веса — байт в байт файл снимка: sha256 строки и файла — как в паспорте', () => {
    const bytes = fromBase64(MASTER_WEIGHTS.data);
    const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
    expect(bytes.length).toBe(MASTER_WEIGHTS.bytes);
    expect(sha(bytes)).toBe(MASTER_WEIGHTS.sha256);
    expect(sha(bin)).toBe(MASTER_WEIGHTS.sha256);
    expect(MASTER_WEIGHTS.source).toBe('tools/gpu/nets/2026-11-12-main/last.bin');
    expect(MASTER_WEIGHTS.features).toBe(FEATURES_VERSION);
    const net = netFromBin(bytes);
    expect(net.sizes).toEqual([...MASTER_WEIGHTS.sizes]);
    expect(net.sizes).toEqual([INPUTS, 256, 128, 1]);
    expect(MASTER_WEIGHTS.arena[0]).toMatchObject({ vs: 'master', games: 2000 });
    // порог приёмки — 60 % против «Опытного» нижней границей интервала (§9)
    expect(MASTER_WEIGHTS.arena[0].share - MASTER_WEIGHTS.arena[0].ci).toBeGreaterThan(0.6);
  });

  test('модуль весов — тот, что пишет генератор (tools/gpu/embed.ts): руками не правлен', () => {
    expect(readFileSync(join(ROOT, OUT), 'utf8')).toBe(moduleOf(MASTER_WEIGHTS.source.replace(/\.bin$/, '')));
  });

  test('раскодировка кусками — то же, что целиком; загрузка отдаёт управление и продолжается после «хватит»', () => {
    const data = MASTER_WEIGHTS.data;
    const r = new Base64Reader(data);
    let steps = 0;
    while (!r.done) { r.step(1000 + (steps % 7) * 333); steps++; }
    expect(Buffer.from(r.bytes()).equals(Buffer.from(bin))).toBe(true);
    const load = netLoader(data, 50_000);
    // первый заход: «хватит» после второго куска — сети нет, но работа не потеряна
    const first = load();
    first.next();
    expect(first.next(false).done).toBe(false);
    expect(first.next(true)).toEqual({ done: true, value: null });
    // второй заход дочитывает: кусков меньше, чем с начала
    const second = load();
    let n = 0, res = second.next();
    while (!res.done) { n++; res = second.next(false); }
    expect(n).toBe(Math.ceil(data.length / 50_000) - 3);
    expect(res.value!.sizes).toEqual([...MASTER_WEIGHTS.sizes]);
    // готовая сеть — сразу, без кусков
    expect(load().next()).toEqual({ done: true, value: res.value });
  });

  test('уровень `neural` ходит как `net:<файл снимка>` арены; бюджет — 1,5 с, как у «Опытного»', () => {
    expect(THINK_MS[NET_LEVEL]).toBe(1500);
    expect(THINK_MS[NET_LEVEL]).toBe(THINK_MS.master);
    const arena = playerOf(`net:${MASTER_WEIGHTS.source}`);
    const net = masterNet();
    const rng = makeRng(17);
    let checked = 0;
    for (let g = 0; g < 6; g++) {
      let s = newGame({ rules: RULES_V1, variant: g % 2 ? 'perevodnoy' : 'podkidnoy', seats: 2 + (g % 2), first: 0 }, shuffled(rng));
      for (let n = 0; n < 40 && s.phase !== 'end'; n++) {
        const seat = actorOf(s);
        if (n % 4 === 0) {
          const o = observe(s, seat);
          const app = chooseAction(o, NET_LEVEL, makeRng(n + 1));
          expect(arena(o, makeRng(n + 1))).toEqual(app);
          expect(thinkSync(netThink(o, net, NET_PARAMS, makeRng(n + 1)))).toEqual(app);
          checked++;
        }
        s = apply(s, seat, chooseAction(observe(s, seat), 'average', rng));
      }
    }
    expect(checked).toBeGreaterThan(30);
  }, 120_000);

  test('размышление «Мастера» кусками: «хватит» после первого расклада — уже готовый законный ход', () => {
    const rng = makeRng(23);
    let s = newGame({ rules: RULES_V1, variant: 'podkidnoy', seats: 2, first: 0 }, shuffled(rng));
    for (let n = 0; n < 6; n++) { const seat = actorOf(s); s = apply(s, seat, chooseAction(observe(s, seat), 'average', rng)); }
    const seat = actorOf(s);
    const t = think(observe(s, seat), NET_LEVEL, makeRng(1));
    let r = t.next();
    let steps = 0;
    while (!r.done && steps < 40) { r = t.next(false); steps++; }
    if (!r.done) r = t.next(true);
    while (!r.done) r = t.next(true);
    expect(legalActions(s, seat).some(x => JSON.stringify(x) === JSON.stringify(r.value))).toBe(true);
  });
});
