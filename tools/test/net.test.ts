// Сеть седьмого уровня (docs/specs/2026-11-neural.md): признаки — те же, что в tools/gpu/features.py (эталон
// tools/gpu/vectors/features.jsonl.gz, его же проверяет selftest.py), оценка — та же, что в torch; бот на сети видит
// только наблюдение своего места (ADR 0005).
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { apply, legalActions, newGame, observe, RULES_V1, stateFrom } from '../../src/engine';
import type { Observation, State } from '../../src/engine';
import { makeRng, unseen, thinkSync, chooseAction } from '../../src/bot';
import { layout } from '../../src/bot/legal';
import { encode, features, FEATURES_VERSION, INPUTS, NET_PARAMS, netFromBin, netThink, pack, RAW_SIZE, valueOf } from '../../src/bot/net';
import { actorOf, shuffled } from '../sim/play';

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
