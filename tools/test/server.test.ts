// Сервер в процессе (как tools/test/server.test.ts «Нард»): база в памяти, поддельные часы, свой
// генератор. Главное — ADR 0008: ни один ответ и ни одно сообщение WebSocket не несёт чужой руки и
// порядка колоды; вид места совпадает с `observe` той же позиции, пересобранной из доказательства.
import { describe, expect, test } from 'bun:test';
import { apply, checkDeck, newGame, observe, RULES_V1, serverDeck } from '../../src/engine';
import type { Action, Observation, State } from '../../src/engine';
import { chooseAction, legalFor, makeRng } from '../../src/bot';
import { ONLINE, PROTOCOL } from '../../src/state/protocol';
import type { CodeInfo, ProofView, QuickView, TableView } from '../../src/state/protocol';
import { createApp } from '../../server/src/app';
import { FakeClock } from '../../server/src/clock';
import { parseAction, simplest, waitingOf } from '../../server/src/core';
import { heldView } from '../../src/game/hold';

const V = '0.2.0';

function setup(seed = 7) {
  const clock = new FakeClock();
  const rng = makeRng(seed);
  const app = createApp({ db: ':memory:', clock, random: n => Uint8Array.from({ length: n }, () => rng.int(256)) });
  const call = async (method: string, path: string, key?: string, body?: unknown) => {
    const headers: Record<string, string> = { 'x-durak-version': V };
    if (key) headers.authorization = `Bearer ${key}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await app.http.handle(new Request(`http://durak.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), '10.0.0.1');
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, text };
  };
  const player = async (name: string) => {
    const { body } = await call('POST', '/v1/device');
    await call('POST', '/v1/session', body.key, { name });
    return body.key as string;
  };
  const seed16 = () => Array.from({ length: 16 }, () => rng.int(256).toString(16).padStart(2, '0')).join('');
  return { app, clock, call, player, seed16, rng };
}

type Env = ReturnType<typeof setup>;

/** Войти по коду в два шага: отпечаток, потом зерно. */
async function joinByCode(e: Env, key: string, code: string) {
  const info = await e.call('GET', `/v1/tables/code/${code}`, key);
  expect(info.status).toBe(200);
  const seed = e.seed16();
  const r = await e.call('POST', '/v1/tables/join', key, { code, seed, commit: info.body.commit });
  expect(r.status).toBe(200);
  return { table: r.body.table as TableView, seed, commit: info.body.commit as string };
}

/** Проверка ADR 0008 на одном ответе: в виде нет ничего, кроме наблюдения своего места. */
function noLeak(t: TableView): void {
  const g = t.game;
  if (!g) return;
  if (g.view) {
    const keys = Object.keys(g.view).sort();
    expect(keys).toEqual(Object.keys(observe(newGame({ rules: RULES_V1, variant: 'podkidnoy', seats: 2, first: 0 }, [...Array(36).keys()]), 0)).sort());
    expect(g.view.seat).toBe(t.you);
    expect(g.view.hand.length).toBe(g.view.handSizes[t.you]);
  }
  // стол паузы перед «бито» — тоже наблюдение своего места: те же поля, своя рука
  if (g.held) {
    expect(Object.keys(g.held).sort()).toEqual(Object.keys(observe(newGame({ rules: RULES_V1, variant: 'podkidnoy', seats: 2, first: 0 }, [...Array(36).keys()]), 0)).sort());
    expect(g.held.seat).toBe(t.you);
    expect(g.held.hand.length).toBe(g.held.handSizes[t.you]);
  }
  // доказательство (колода, зёрна) — только у законченной партии
  if (g.proof) expect(g.result).not.toBeNull();
  const raw = JSON.stringify(t);
  expect(raw.includes('"hands"')).toBe(false);
  expect(raw.includes('"talon"')).toBe(false);
}

describe('сервер', () => {
  test('пинг и версия', async () => {
    const e = setup();
    const r = await e.call('GET', '/v1/ping');
    expect(r.body.v).toBe(PROTOCOL);
    const key = await e.player('Миша');
    const old = await e.app.http.handle(new Request('http://durak.test/v1/tables', {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'x-durak-version': '0.0.1' }, body: '{}',
    }), 'x');
    expect(old.status).toBe(426);
  });

  test('разбор действия из тела запроса', () => {
    expect(parseAction({ type: 'beat', card: 3, on: 1 })).toEqual({ type: 'beat', card: 3, on: 1 });
    expect(parseAction({ type: 'attack', cards: [1, 1] })).toBeNull();
    expect(parseAction({ type: 'attack', cards: [40] })).toBeNull();
    expect(parseAction({ type: 'take', extra: 1 })).toEqual({ type: 'take' });
    expect(parseAction({ type: 'done' })).toBeNull();
  });

  test('стол на четверых с ботом: партия до конца, вид каждого места — его наблюдение, колода сходится', async () => {
    const e = setup(11);
    const keys = [await e.player('Миша'), await e.player('Саша'), await e.player('Оля')];
    const created = await e.call('POST', '/v1/tables', keys[0], { variant: 'perevodnoy', seats: 4, bots: 'average' });
    expect(created.status).toBe(201);
    const t0 = created.body.table as TableView;
    expect(t0.game?.view).toBeNull();
    const code = t0.code!;
    // хозяин тоже отдаёт зерно после отпечатка
    await joinByCode(e, keys[0], code);
    await joinByCode(e, keys[1], code);
    await joinByCode(e, keys[2], code);
    const start = await e.call('POST', `/v1/tables/${t0.id}/start`, keys[0]);
    expect(start.status).toBe(200);
    const id = t0.id;
    const seen: Map<string, Observation> = new Map();
    const helds: Map<string, Observation> = new Map();
    const pick = makeRng(5);
    let final: TableView | null = null;
    for (let guard = 0; guard < 4000 && !final; guard++) {
      let acted = false;
      for (let i = 0; i < 3; i++) {
        const r = await e.call('GET', `/v1/tables/${id}`, keys[i]);
        const t = r.body.table as TableView;
        noLeak(t);
        if (t.status === 'finished') { final = t; break; }
        const v = t.game!.view!;
        seen.set(`${t.you}:${t.game!.n}`, v);
        if (t.game!.held) helds.set(`${t.you}:${t.game!.n}`, t.game!.held);
        const acts = legalFor(v);
        if (!acts.length) continue;
        const a = chooseAction(v, 'average', pick);
        const res = await e.call('POST', `/v1/tables/${id}/act`, keys[i], { game: t.game!.no, n: t.game!.n, action: a });
        if (res.status === 200) acted = true;
        else expect(res.body.error).toBe('stale');
      }
      if (!acted && !final) e.clock.advance(1000);
    }
    expect(final).not.toBeNull();
    const proof = final!.game!.proof as ProofView;
    expect(final!.seats[3]!.bot).toBe('average');
    // колода: отпечаток и все увиденные карты сходятся
    expect(checkDeck(proof.seed, proof.seeds, proof.commit, proof.deck.map((card, index) => ({ index, card })))).toBe(true);
    expect(serverDeck(proof.seed, proof.seeds)).toEqual(proof.deck);
    // каждый сохранённый вид — ровно наблюдение пересобранной позиции
    let s: State = newGame({ rules: RULES_V1, variant: 'perevodnoy', seats: 4, first: proof.first }, proof.deck);
    const states: State[] = [s];
    for (const a of proof.actions) states.push(s = apply(s, a.seat, a.action));
    expect(s.phase).toBe('end');
    for (const [k, v] of seen) {
      const [seat, n] = k.split(':').map(Number);
      expect(v).toEqual(observe(states[n], seat));
    }
    expect(seen.size).toBeGreaterThan(20);
    // стол паузы — ровно `heldView` пересобранной позиции до последнего действия (ADR 0008)
    expect(helds.size).toBeGreaterThan(0);
    for (const [k, h] of helds) {
      const [seat, n] = k.split(':').map(Number);
      const last = proof.actions[n - 1];
      expect(h).toEqual(heldView(observe(states[n - 1], seat), last.seat, last.action, states[n])!);
    }
    // после партии — стол последнего отбоя, своего места
    const end = final!.game!.held!;
    expect(end).not.toBeNull();
    expect(end.seat).toBe(final!.you);
    expect(end.table.length).toBeGreaterThan(0);
  });

  test('пауза перед «бито»: отбой кончился картой — бот ждёт, пока все разглядят стол', async () => {
    let checked = false;
    // отбой кончается картой не в каждой партии: несколько раздач, пока не встретится такой, а следом ходит бот
    for (let deal = 0; deal < 40 && !checked; deal++) {
      const e = setup(100 + deal);
      const a = await e.player('Аня');
      const t = (await e.call('POST', '/v1/tables', a, { variant: 'podkidnoy', seats: 2, bots: 'novice' })).body.table as TableView;
      await joinByCode(e, a, t.code!);
      await e.call('POST', `/v1/tables/${t.id}/start`, a);
      const pick = makeRng(3 + deal);
      for (let guard = 0; guard < 3000 && !checked; guard++) {
        const v = (await e.call('GET', `/v1/tables/${t.id}`, a)).body.table as TableView;
        if (v.status !== 'playing') break;
        const g = v.game!;
        const botNext = g.waiting.includes(1) && g.view!.table.length === 0;
        if (g.held && botNext) {
          // стол последнего отбоя виден, бот ещё молчит и после своей обычной паузы
          expect(g.held.table.length).toBeGreaterThan(0);
          e.clock.advance(ONLINE.botMs + 50);
          expect(((await e.call('GET', `/v1/tables/${t.id}`, a)).body.table as TableView).game!.n).toBe(g.n);
          e.clock.advance(ONLINE.holdMs);
          const w = (await e.call('GET', `/v1/tables/${t.id}`, a)).body.table as TableView;
          expect(w.game!.n).toBe(g.n + 1);
          expect(w.game!.held).toBeNull();
          checked = true;
          break;
        }
        if (legalFor(g.view!).length && g.waiting.includes(0)) {
          await e.call('POST', `/v1/tables/${t.id}/act`, a, { game: g.no, n: g.n, action: chooseAction(g.view!, 'average', pick) });
        } else e.clock.advance(500);
      }
    }
    expect(checked).toBe(true);
  });

  test('выбор места и уровень каждого бота: напротив, на месте бота, пересесть; хозяин меняет уровни; боты разные', async () => {
    const e = setup(31);
    const a = await e.player('Миша'), b = await e.player('Саша'), c = await e.player('Оля');
    const t = (await e.call('POST', '/v1/tables', a, { variant: 'podkidnoy', seats: 4, bots: 'average' })).body.table as TableView;
    await joinByCode(e, a, t.code!);
    // свободные места сразу за ботами стола, уровень виден
    expect(t.seats.map(x => x?.bot ?? null)).toEqual([null, 'average', 'average', 'average']);
    // кто где сидит — до входа
    const info = (await e.call('GET', `/v1/tables/code/${t.code}`, b)).body as CodeInfo;
    expect(info.places!.map(x => (x ? (x.bot ?? x.name) : null))).toEqual(['Миша', 'average', 'average', 'average']);
    expect(info.places![0]!.host).toBe(true);
    // Саша садится напротив хозяина — на место бота: бот уходит
    const seedB = e.seed16();
    const vb = (await e.call('POST', '/v1/tables/join', b, { code: t.code, seed: seedB, commit: info.commit, seat: 2 })).body.table as TableView;
    expect(vb.you).toBe(2);
    expect(vb.seats[2]!.name).toBe('Саша');
    expect(vb.seats[2]!.bot).toBeNull();
    noLeak(vb);
    // занятое место и чужой номер места
    expect((await e.call('POST', '/v1/tables/join', c, { code: t.code, seed: e.seed16(), commit: info.commit, seat: 2 })).body.error).toBe('seat-taken');
    expect((await e.call('POST', '/v1/tables/join', c, { code: t.code, seed: e.seed16(), commit: info.commit, seat: 4 })).body.error).toBe('bad-seat');
    expect((await e.call('POST', '/v1/tables/join', c, { code: t.code, seed: e.seed16(), commit: info.commit, seat: 'x' })).body.error).toBe('bad-seat');
    // Оля без выбора (телефон до 0.8.0) — на первое место бота, потом пересаживается
    const vc = (await e.call('POST', '/v1/tables/join', c, { code: t.code, seed: e.seed16(), commit: info.commit })).body.table as TableView;
    expect(vc.you).toBe(1);
    const moved = (await e.call('POST', '/v1/tables/join', c, { code: t.code, seed: e.seed16(), commit: info.commit, seat: 3 })).body.table as TableView;
    expect(moved.you).toBe(3);
    // прежнее место — снова за ботом стола
    expect(moved.seats[1]!.bot).toBe('average');
    // уровень бота на месте — только хозяин и только на место без человека
    expect((await e.call('POST', `/v1/tables/${t.id}/bot`, b, { seat: 1, level: 'master' })).body.error).toBe('not-host');
    expect((await e.call('POST', `/v1/tables/${t.id}/bot`, a, { seat: 2, level: 'master' })).body.error).toBe('seat-taken');
    expect((await e.call('POST', `/v1/tables/${t.id}/bot`, a, { seat: 1, level: 'strong' })).body.error).toBe('bad-level');
    // Оля пересела обратно на 1; бот на месте 3 — «Новичок» по выбору хозяина
    await e.call('POST', '/v1/tables/join', c, { code: t.code, seed: e.seed16(), commit: info.commit, seat: 1 });
    const set1 = await e.call('POST', `/v1/tables/${t.id}/bot`, a, { seat: 3, level: 'novice' });
    expect(set1.status).toBe(200);
    expect((set1.body.table as TableView).seats[3]!.bot).toBe('novice');
    const st = await e.call('POST', `/v1/tables/${t.id}/start`, a);
    expect(st.status).toBe(200);
    const view = st.body.table as TableView;
    expect(view.status).toBe('playing');
    expect(view.seats.map(x => x!.bot)).toEqual([null, null, null, 'novice']);
    expect(view.seats.map(x => x!.name)).toEqual(['Миша', 'Оля', 'Саша', '']);
    // после начала уровни не меняются, места не меняются
    expect((await e.call('POST', `/v1/tables/${t.id}/bot`, a, { seat: 3, level: 'master' })).body.error).toBe('not-waiting');
    expect((await e.call('POST', '/v1/tables/join', c, { code: t.code, seed: e.seed16(), commit: info.commit, seat: 3 })).body.error).toBe('not-waiting');
    // каждый — своё наблюдение (ADR 0008)
    for (const [k, seat] of [[a, 0], [c, 1], [b, 2]] as const) {
      const v = (await e.call('GET', `/v1/tables/${t.id}`, k)).body.table as TableView;
      expect(v.you).toBe(seat);
      noLeak(v);
    }
  });

  test('боты разных уровней за одним столом: каждый ходит своим уровнем, зёрна мест — после пересадки', async () => {
    const e = setup(41);
    const a = await e.player('Аня');
    const t = (await e.call('POST', '/v1/tables', a, { variant: 'perevodnoy', seats: 3, bots: 'average' })).body.table as TableView;
    const me = await joinByCode(e, a, t.code!);
    await e.call('POST', `/v1/tables/${t.id}/bot`, a, { seat: 1, level: 'novice' });
    await e.call('POST', `/v1/tables/${t.id}/bot`, a, { seat: 2, level: 'master' });
    // хозяин пересел на место 2 (бот «Опытный» ушёл), прежнее место 0 — за ботом стола
    const moved = (await e.call('POST', '/v1/tables/join', a, { code: t.code, seed: me.seed, commit: me.commit, seat: 2 })).body.table as TableView;
    expect(moved.you).toBe(2);
    expect(moved.host).toBe(2);
    expect(moved.seats.map(x => x?.bot ?? null)).toEqual(['average', 'novice', null]);
    await e.call('POST', `/v1/tables/${t.id}/start`, a);
    for (let i = 0; i < 400; i++) {
      e.clock.advance(5000);
      const v = (await e.call('GET', `/v1/tables/${t.id}`, a)).body.table as TableView;
      if (v.status === 'finished') {
        // своё зерно — на своём новом месте
        expect(v.game!.proof!.seeds[2]).toBe(me.seed);
        expect(v.seats.map(x => x!.bot)).toEqual(['average', 'novice', null]);
        return;
      }
    }
    throw new Error('партия не кончилась');
  });

  test('ошибки: занятый номер действия — stale, незаконное — причина, чужой ход, сменившийся отпечаток', async () => {
    const e = setup(3);
    const a = await e.player('Аня'), b = await e.player('Боря');
    const t = (await e.call('POST', '/v1/tables', a, { variant: 'podkidnoy', seats: 2, bots: null })).body.table as TableView;
    await joinByCode(e, a, t.code!);
    // отпечаток сменился — `commit-changed`
    const bad = await e.call('POST', '/v1/tables/join', b, { code: t.code, seed: e.seed16(), commit: '0'.repeat(64) });
    expect(bad.body.error).toBe('commit-changed');
    expect((await e.call('POST', `/v1/tables/${t.id}/start`, a)).body.error).toBe('not-enough');
    await joinByCode(e, b, t.code!);
    expect((await e.call('POST', `/v1/tables/${t.id}/start`, b)).body.error).toBe('not-host');
    await e.call('POST', `/v1/tables/${t.id}/start`, a);
    const va = (await e.call('GET', `/v1/tables/${t.id}`, a)).body.table as TableView;
    const vb = (await e.call('GET', `/v1/tables/${t.id}`, b)).body.table as TableView;
    const atk = va.game!.view!.attacker === 0 ? { key: a, t: va } : { key: b, t: vb };
    const def = atk.key === a ? { key: b, t: vb } : { key: a, t: va };
    const card = atk.t.game!.view!.hand[0];
    const notMine = await e.call('POST', `/v1/tables/${t.id}/act`, def.key, { game: 0, n: 0, action: { type: 'attack', cards: [def.t.game!.view!.hand[0]] } });
    expect(notMine.body.error).toBe('not-your-turn');
    const ill = await e.call('POST', `/v1/tables/${t.id}/act`, atk.key, { game: 0, n: 0, action: { type: 'attack', cards: [def.t.game!.view!.hand[0]] } });
    expect(ill.body.error).toBe('illegal');
    expect(ill.body.reason).toBe('notInHand');
    const ok = await e.call('POST', `/v1/tables/${t.id}/act`, atk.key, { game: 0, n: 0, action: { type: 'attack', cards: [card] } });
    expect(ok.body).toEqual({ n: 1 });
    // повтор того же действия — тот же ответ, без второго применения
    const again = await e.call('POST', `/v1/tables/${t.id}/act`, atk.key, { game: 0, n: 0, action: { type: 'attack', cards: [card] } });
    expect(again.body).toEqual({ n: 1 });
    const stale = await e.call('POST', `/v1/tables/${t.id}/act`, def.key, { game: 0, n: 0, action: { type: 'take' } });
    expect(stale.body.error).toBe('stale');
    noLeak(stale.body.table);
  });

  test('часы: молчит — за него действует простейшее; нет связи — играет бот за него, вернулся — снова сам', async () => {
    const e = setup(9);
    const a = await e.player('Аня'), b = await e.player('Боря');
    const t = (await e.call('POST', '/v1/tables', a, { variant: 'podkidnoy', seats: 2, bots: null })).body.table as TableView;
    await joinByCode(e, a, t.code!);
    await joinByCode(e, b, t.code!);
    await e.call('POST', `/v1/tables/${t.id}/start`, a);
    const v0 = (await e.call('GET', `/v1/tables/${t.id}`, a)).body.table as TableView;
    expect(v0.game!.n).toBe(0);
    // атакующий молчит 20 с + 60 с запаса: простейшее — ход младшей картой
    e.call('GET', `/v1/tables/${t.id}`, b);
    e.clock.advance(ONLINE.actionMs + ONLINE.bankMs + 10);
    const v1 = (await e.call('GET', `/v1/tables/${t.id}`, a)).body.table as TableView;
    expect(v1.game!.n).toBeGreaterThanOrEqual(1);
    // оба пропали на 30 с — за обоих играют боты, и партия идёт сама
    e.clock.advance(ONLINE.offlineMs + 1);
    e.app.core.sweepPresence();
    const n1 = v1.game!.n;
    e.clock.advance(20_000);
    const v2 = (await e.call('GET', `/v1/tables/${t.id}`, b)).body.table as TableView;
    // Боря вернулся (опрос) — за него больше не бот; за Аню — бот
    if (v2.status === 'playing') {
      expect(v2.seats[1]!.botFor).toBe(false);
      expect(v2.seats[0]!.botFor).toBe(true);
      expect(v2.game!.n).toBeGreaterThan(n1);
    }
  });

  test('простейшее действие и кого ждут', () => {
    const deck = [...Array(36).keys()];
    const s = newGame({ rules: RULES_V1, variant: 'podkidnoy', seats: 2, first: 0 }, deck);
    expect(waitingOf(s)).toEqual([0]);
    const a = simplest(s, 0) as Action;
    expect(a.type).toBe('attack');
    const s2 = apply(s, 0, a);
    expect(waitingOf(s2)).toEqual([1]);
    expect(simplest(s2, 1)).toEqual({ type: 'take' });
  });

  test('WebSocket: каждому соединению — вид его места', async () => {
    const e = setup(4);
    const a = await e.player('Аня'), b = await e.player('Боря');
    const t = (await e.call('POST', '/v1/tables', a, { variant: 'podkidnoy', seats: 2, bots: null })).body.table as TableView;
    await joinByCode(e, a, t.code!);
    await joinByCode(e, b, t.code!);
    const box: Record<string, unknown[]> = { a: [], b: [] };
    const sock = (name: string) => ({ send: (x: string) => { box[name].push(JSON.parse(x)); }, close: () => {} });
    const sa = sock('a'), sb = sock('b');
    e.app.live.open(sa);
    e.app.live.open(sb);
    e.app.live.message(sa, JSON.stringify({ t: 'hello', key: a, v: V, table: t.id }));
    e.app.live.message(sb, JSON.stringify({ t: 'hello', key: b, v: V, table: t.id }));
    await e.call('POST', `/v1/tables/${t.id}/start`, a);
    const last = (n: string) => (box[n].filter(m => (m as { t: string }).t === 'state').at(-1) as { table: TableView }).table;
    expect(last('a').you).toBe(0);
    expect(last('b').you).toBe(1);
    noLeak(last('a'));
    noLeak(last('b'));
    expect(last('a').game!.view!.hand).not.toEqual(last('b').game!.view!.hand);
    const ha = new Set(last('a').game!.view!.hand);
    expect(last('b').game!.view!.hand.some(c => ha.has(c))).toBe(false);
  });

  test('быстрая игра: пара по варианту, вход по коду, рейтинг после партии; через минуту — предложение бота', async () => {
    const e = setup(21);
    const a = await e.player('Аня'), b = await e.player('Боря'), c = await e.player('Вера');
    expect(((await e.call('POST', '/v1/quick', a, { variant: 'podkidnoy' })).body as QuickView).status).toBe('searching');
    // другой вариант — не пара
    expect(((await e.call('POST', '/v1/quick', c, { variant: 'perevodnoy' })).body as QuickView).status).toBe('searching');
    const m = (await e.call('POST', '/v1/quick', b, { variant: 'podkidnoy' })).body as QuickView;
    expect(m.status).toBe('matched');
    const id = (m as { table: string }).table;
    const view = (await e.call('GET', `/v1/tables/${id}`, a)).body.table as TableView;
    expect(view.kind).toBe('quick');
    await joinByCode(e, a, view.code!);
    expect(((await e.call('GET', `/v1/tables/${id}`, a)).body.table as TableView).status).toBe('waiting');
    await joinByCode(e, b, view.code!);
    expect(((await e.call('GET', `/v1/tables/${id}`, a)).body.table as TableView).status).toBe('playing');
    // Аня сдаётся — у Бори рейтинг выше стартового
    await e.call('POST', `/v1/tables/${id}/resign`, a);
    const end = (await e.call('GET', `/v1/tables/${id}`, b)).body.table as TableView;
    expect(end.game!.result!.fool).toBe(0);
    expect(end.seats[1]!.rating!).toBeGreaterThan(1500);
    // Вера ищет минуту — предложение бота; согласилась — стол с ботом «Средний»
    for (let i = 0; i < 61; i++) { e.clock.advance(1000); await e.call('GET', '/v1/quick', c); }
    const offer = (await e.call('GET', '/v1/quick', c)).body as QuickView;
    expect(offer.status === 'searching' && offer.offerBot).toBe(true);
    const bot = (await e.call('POST', '/v1/quick/bot', c)).body as QuickView;
    expect(bot.status).toBe('matched');
    const bv = (await e.call('GET', `/v1/tables/${(bot as { table: string }).table}`, c)).body.table as TableView;
    expect(bv.seats[1]!.bot).toBe('average');
    await joinByCode(e, c, bv.code!);
    expect(((await e.call('GET', `/v1/tables/${bv.id}`, c)).body.table as TableView).status).toBe('playing');
  });

  test('реванш: следующая партия — по показанному после конца отпечатку', async () => {
    const e = setup(13);
    const a = await e.player('Аня'), b = await e.player('Боря');
    const t = (await e.call('POST', '/v1/tables', a, { variant: 'podkidnoy', seats: 2, bots: null })).body.table as TableView;
    await joinByCode(e, a, t.code!);
    await joinByCode(e, b, t.code!);
    await e.call('POST', `/v1/tables/${t.id}/start`, a);
    // оба молчат — партию доигрывают часы (за трижды пропустивших — бот)
    for (let i = 0; i < 400; i++) {
      e.clock.advance(5000);
      const v = (await e.call('GET', `/v1/tables/${t.id}`, a)).body.table as TableView;
      await e.call('GET', `/v1/tables/${t.id}`, b);
      if (v.status === 'finished') break;
    }
    const end = (await e.call('GET', `/v1/tables/${t.id}`, a)).body.table as TableView;
    expect(end.status).toBe('finished');
    const next = end.game!.nextCommit!;
    expect(next).not.toBe(end.game!.commit);
    const r1 = (await e.call('POST', `/v1/tables/${t.id}/rematch`, a, { seed: e.seed16(), commit: next })).body.table as TableView;
    expect(r1.game!.rematch[0]).toBe(true);
    const r2 = (await e.call('POST', `/v1/tables/${t.id}/rematch`, b, { seed: e.seed16(), commit: next })).body.table as TableView;
    expect(r2.status).toBe('playing');
    expect(r2.game!.no).toBe(1);
    expect(r2.game!.commit).toBe(next);
  });

  test('перезапуск сервера: идущая партия переигрывается из записи', async () => {
    const path = `/tmp/durak-test-${process.pid}-${Date.now()}.db`;
    const clock = new FakeClock();
    const rng = makeRng(1);
    const random = (n: number) => Uint8Array.from({ length: n }, () => rng.int(256));
    const app = createApp({ db: path, clock, random });
    const call = async (m: string, p: string, key?: string, body?: unknown) => {
      const res = await app.http.handle(new Request(`http://d${p}`, { method: m, headers: { 'x-durak-version': V, ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: body ? JSON.stringify(body) : undefined }), 'x');
      return res.json() as Promise<Record<string, unknown>>;
    };
    const k = ((await call('POST', '/v1/device')) as { key: string }).key;
    await call('POST', '/v1/session', k, { name: 'Аня' });
    const t = (await call('POST', '/v1/tables', k, { variant: 'podkidnoy', seats: 3, bots: 'novice' })).table as TableView;
    const info = await call('GET', `/v1/tables/code/${t.code}`, k);
    await call('POST', '/v1/tables/join', k, { code: t.code, seed: 'ab'.repeat(16), commit: info.commit });
    await call('POST', `/v1/tables/${t.id}/start`, k);
    clock.advance(5000);
    const before = (await call('GET', `/v1/tables/${t.id}`, k)).table as TableView;
    app.db.close();
    const again = createApp({ db: path, clock, random });
    expect(again.core.restore()).toBe(1);
    const res = await again.http.handle(new Request(`http://d/v1/tables/${t.id}`, { headers: { 'x-durak-version': V, authorization: `Bearer ${k}` } }), 'x');
    const after = ((await res.json()) as { table: TableView }).table;
    expect(after.game!.view).toEqual(before.game!.view);
    again.db.close();
  });
});
