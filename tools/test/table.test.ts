// Стол этапа Б: раскладка (src/render/layout.ts), «бито» само, отмена, вышедшие карты
// (src/game/flow.ts), настройки и сохранение партии (src/state/settings.ts, saved.ts).
import { describe, expect, test } from 'bun:test';
import { apply, deckFrom, dealOf, firstOf, legalActions, newGame, observe, replay, RULES_V1 } from '../../src/engine';
import type { Card, GameRecord, State } from '../../src/engine';
import { chooseAction, makeRng } from '../../src/bot';
import { handCardAt, inTable, layoutTable, sortHand, tableCardAt } from '../../src/render/layout';
import { autoPass, canUndo, seenGrid } from '../../src/game/flow';
import { botDelay, DEFAULT_SETTINGS, lessMotionOf, parseSettings } from '../../src/state/settings';
import { restoreGame } from '../../src/state/saved';
import { c, cs, pos } from './helpers';

const SIZE = { width: 412, height: 760 };
const opt = { ...SIZE, order: 'suit' as const, picked: null, targets: [] as Card[] };

/** Случайная партия до конца ботами; позиции по пути. */
function playGame(seed: number, seats: number, variant: 'podkidnoy' | 'perevodnoy'): { record: GameRecord; states: State[] } {
  const deck = deckFrom(new Uint8Array(32).map((_, i) => (seed * 31 + i * 7) & 255));
  const { hands, trump } = dealOf(deck, seats);
  const first = firstOf(hands, trump);
  const record: GameRecord = { v: 1, rules: RULES_V1, variant, seats, first: first.seat, firstWhy: first.why, deck, actions: [], result: null };
  let s = newGame({ rules: RULES_V1, variant, seats, first: first.seat }, deck);
  const rng = makeRng(seed);
  const states = [s];
  for (let k = 0; k < 2000 && s.phase !== 'end'; k++) {
    let moved = false;
    for (let i = 0; i < seats && !moved; i++) {
      const seat = (s.attacker + i) % seats;
      if (legalActions(s, seat).length === 0) continue;
      const a = chooseAction(observe(s, seat), 'average', rng);
      s = apply(s, seat, a);
      record.actions.push({ seat, action: a, at: 0 });
      states.push(s);
      moved = true;
    }
    if (!moved) break;
  }
  record.result = s.result;
  return { record, states };
}

describe('раскладка стола', () => {
  test('каждая видимая карта — один раз, лица только у того, что видит место (ADR 0005)', () => {
    for (const seats of [2, 3, 4]) {
      const { states } = playGame(seats * 11, seats, seats === 3 ? 'perevodnoy' : 'podkidnoy');
      for (const s of states) {
        const o = observe(s, 0);
        const l = layoutTable(o, { ...opt, showOpenly: true });
        const keys = l.sprites.map(x => x.key);
        expect(new Set(keys).size).toBe(keys.length);
        const faces = l.sprites.filter(x => x.card !== null).map(x => x.card as Card);
        const visible = new Set<Card>([...o.hand, ...o.table.flat().filter((x): x is Card => x !== null), ...o.openly.flat()]);
        if (o.talonSize > 0) visible.add(o.trump);
        for (const f of faces) expect(visible.has(f)).toBe(true);
        // все карты стола на столе: рука + соперники + колода + стол + сброс = 36
        const table = o.table.reduce((n, [, d]) => n + 1 + (d === null ? 0 : 1), 0);
        expect(l.sprites.length).toBe(o.handSizes.reduce((a, b) => a + b, 0) + o.talonSize + table + o.discard.length);
        for (const x of l.sprites) {
          expect(x.x).toBeGreaterThanOrEqual(0);
          expect(x.x).toBeLessThanOrEqual(SIZE.width);
          expect(x.y).toBeGreaterThanOrEqual(0);
          expect(x.y).toBeLessThanOrEqual(SIZE.height);
        }
      }
    }
  });
  test('без «Помощи памяти» у соперников ни одной карты лицом — и взятые в открытую рубашкой (решение владельца 08.11.2026)', () => {
    let openlySeen = 0;
    for (const seats of [2, 3, 4]) {
      const { states } = playGame(seats * 13, seats, seats === 2 ? 'perevodnoy' : 'podkidnoy');
      for (const s of states) {
        const o = observe(s, 0);
        openlySeen += o.openly.reduce((n, cs, seat) => n + (seat === 0 ? 0 : cs.length), 0);
        const l = layoutTable(o, opt);
        const own = new Set<Card>([...o.hand, ...o.table.flat().filter((x): x is Card => x !== null)]);
        if (o.talonSize > 0) own.add(o.trump);
        for (const x of l.sprites) {
          if (x.card !== null) expect(own.has(x.card)).toBe(true);
          if (/^h\d/.test(x.key)) expect(x.card).toBeNull();
        }
        // а карт у соперника столько же, сколько у него в руке
        for (const p of l.opponents) expect(l.sprites.filter(x => x.key.startsWith(`h${p.seat}-`)).length).toBe(o.handSizes[p.seat]);
      }
    }
    expect(openlySeen).toBeGreaterThan(0); // проверка не пустая: в этих партиях брали в открытую
  });
  test('ключи скрытых карт не выдают их номера', () => {
    const s = pos({ hands: ['6♠ 7♠ 8♠ 9♠ 10♠ В♠', '6♥ 7♥ 8♥ 9♥ 10♥ В♥'], trump: 'Т♦', talon: '6♦ 7♦' });
    const l = layoutTable(observe(s, 0), opt);
    for (const x of l.sprites.filter(x => x.card === null)) expect(x.key).toMatch(/^(h\d-\d+|t-\d+|c\d+)$/);
    for (const card of cs('6♥ 7♥ 8♥ 9♥ 10♥ В♥')) expect(l.sprites.some(x => x.key === `c${card}`)).toBe(false);
  });
  test('рука: козыри справа, по мастям или по старшинству', () => {
    const hand = cs('Т♠ 6♥ 7♠ 6♦ К♥');
    expect(sortHand(hand, 3, 'suit')).toEqual(cs('7♠ Т♠ 6♦ 6♥ К♥'));
    expect(sortHand(hand, 3, 'rank')).toEqual(cs('6♦ 7♠ Т♠ 6♥ К♥'));
  });
  test('касание и бросок: карта руки под пальцем, карта атаки, стол', () => {
    const s = pos({ hands: ['6♠ 7♠ 8♠ 9♠ 10♠ В♠', '6♥ 7♥ 8♥ 9♥ 10♥ В♥'], trump: 'Т♦', talon: '6♦ 7♦', attacker: 1, defender: 0 });
    const t = apply(s, 1, { type: 'attack', cards: [c('6♥')] });
    const o = observe(t, 0);
    const l = layoutTable(o, { ...opt, picked: c('6♠'), targets: [c('6♥')] });
    const mine = l.sprites.filter(x => x.card !== null && o.hand.includes(x.card));
    const last = mine[mine.length - 1];
    expect(handCardAt(l, last.x, last.y, o.hand)).toBe(last.card);
    const att = l.sprites.find(x => x.key === `c${c('6♥')}`)!;
    expect(att.glow).toBe(true);
    expect(tableCardAt(l, att.x, att.y, o.table)).toBe(c('6♥'));
    expect(inTable(l, att.x, att.y)).toBe(true);
    expect(inTable(l, last.x, last.y)).toBe(false);
  });
});

describe('ход партии на экране', () => {
  test('«бито» само: всё покрыто, а подкинуть нечего', () => {
    const s = pos({ hands: ['6♠ 7♣', '7♠ 8♥'], trump: 'Т♦', talon: '6♦' });
    const a = apply(s, 0, { type: 'attack', cards: [c('6♠')] });
    expect(autoPass(a, 0)).toBe(false);
    const b = apply(a, 1, { type: 'beat', card: c('7♠'), on: c('6♠') });
    // 7♣ подкинуть можно — по достоинству 7, значит не само
    expect(autoPass(b, 0)).toBe(false);
    const s2 = pos({ hands: ['6♠ 9♣', '7♠ 8♥'], trump: 'Т♦', talon: '6♦' });
    const b2 = apply(apply(s2, 0, { type: 'attack', cards: [c('6♠')] }), 1, { type: 'beat', card: c('7♠'), on: c('6♠') });
    expect(autoPass(b2, 0)).toBe(true);
  });
  test('отмена — только своё последнее действие до ответа бота', () => {
    const { record } = playGame(5, 2, 'podkidnoy');
    const mine = record.actions.findIndex(a => a.seat === 0);
    const cut: GameRecord = { ...record, actions: record.actions.slice(0, mine + 1), result: null };
    expect(canUndo(cut, 0)).toBe(true);
    const after: GameRecord = { ...record, actions: record.actions.slice(0, mine + 2), result: null };
    if (after.actions[after.actions.length - 1].seat !== 0) expect(canUndo(after, 0)).toBe(false);
    expect(canUndo({ ...cut, actions: [] }, 0)).toBe(false);
  });
  test('вышедшие карты: сброс и взятые в открытую, без своих', () => {
    const { states } = playGame(9, 3, 'podkidnoy');
    for (const s of states) {
      const o = observe(s, 0);
      const g = seenGrid(o);
      const n = g.flat().filter(x => x === 'discard').length;
      expect(n).toBe(o.discard.length);
      for (const card of o.hand) expect(g[Math.floor(card / 9)][card % 9]).not.toBe('openly');
    }
  });
});

describe('настройки', () => {
  test('мусор и пусто — по умолчанию, «Меньше движения» — как в системе, пока не выбрано', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{oops')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2]')).toEqual(DEFAULT_SETTINGS);
    const s = parseSettings(JSON.stringify({ sound: false, botSpeed: 'warp', handOrder: 'rank', fourColor: true }));
    expect(s).toEqual({ ...DEFAULT_SETTINGS, sound: false, handOrder: 'rank', fourColor: true });
    expect(lessMotionOf(s, true)).toBe(true);
    expect(DEFAULT_SETTINGS.memoryAid).toBe(false);
    // до 0.5.1 «Помощь памяти» звалась seenCards — выбор игрока сохраняется
    expect(parseSettings(JSON.stringify({ seenCards: true })).memoryAid).toBe(true);
    expect(parseSettings(JSON.stringify({ memoryAid: false, seenCards: true })).memoryAid).toBe(false);
    expect(lessMotionOf({ ...s, lessMotion: false }, true)).toBe(false);
  });
  test('пауза бота: «Обычно» 0,5–0,9 с, «Быстро» 0,2–0,4 с', () => {
    expect(botDelay('normal', 0)).toBe(500);
    expect(botDelay('normal', 1)).toBe(900);
    expect(botDelay('fast', 0.5)).toBe(300);
  });
});

describe('сохранение партии', () => {
  const { record } = playGame(3, 3, 'perevodnoy');
  const mid: GameRecord = { ...record, actions: record.actions.slice(0, Math.floor(record.actions.length / 2)), result: null };
  test('восстановление — переигрывание той же записи', () => {
    const r = restoreGame(JSON.parse(JSON.stringify({ record: mid, level: 'amateur', history: [] })));
    expect(r).not.toBeNull();
    expect(r!.state).toEqual(replay(mid));
  });
  test('битая, чужая или законченная запись — нет партии, без исключения', () => {
    expect(restoreGame(null)).toBeNull();
    expect(restoreGame('мусор')).toBeNull();
    expect(restoreGame({ record: { ...mid, v: 2 }, level: 'amateur', history: [] })).toBeNull();
    expect(restoreGame({ record: { ...mid, rules: { ...RULES_V1, id: 'other' } }, level: 'amateur', history: [] })).toBeNull();
    expect(restoreGame({ record: mid, level: 'grandmaster', history: [] })).toBeNull();
    const bad = { ...mid, actions: [...mid.actions, { seat: 0, action: { type: 'take' }, at: 0 }, { seat: 0, action: { type: 'take' }, at: 0 }] };
    expect(restoreGame({ record: bad, level: 'amateur', history: [] })).toBeNull();
    expect(restoreGame({ record, level: 'amateur', history: [] })).toBeNull();
  });
});
