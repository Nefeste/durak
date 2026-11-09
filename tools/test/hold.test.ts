// Пауза перед «бито» и «беру» (src/game/hold.ts, docs/09-game-design.md, «Темп»): отбой, который кончился картой,
// показывается со всеми картами на столе — и только тогда; в таком виде нет ничего, кроме наблюдения своего места и
// открытых карт стола (ADR 0008).
import { describe, expect, test } from 'bun:test';
import { apply, deckFrom, legalActions, newGame, observe, RULES_V1 } from '../../src/engine';
import type { Card, State } from '../../src/engine';
import { makeRng } from '../../src/bot';
import { heldView, HOLD, holdMs } from '../../src/game/hold';
import { ONLINE } from '../../src/state/protocol';
import { c, cs, pos } from './helpers';

const cardsOnTable = (s: State): Card[] => s.table.flatMap(([a, d]) => (d === null ? [a] : [a, d]));

describe('пауза перед «бито» и «беру»', () => {
  test('покрыта последняя карта и подкинуть нельзя (у отбивающегося кончились карты): стол с покрытой парой', () => {
    let s = pos({ hands: ['6♠ 6♣ 9♦', '7♠'], trump: 'Т♥', talonEmpty: true });
    s = apply(s, 0, { type: 'attack', cards: [c('6♠')] });
    const before = s;
    const after = apply(s, 1, { type: 'beat', card: c('7♠'), on: c('6♠') });
    // движок кончает отбой тем же действием: стол пуст сразу
    expect(after.table).toEqual([]);
    for (const seat of [0, 1]) {
      const h = heldView(observe(before, seat), 1, { type: 'beat', card: c('7♠'), on: c('6♠') }, after)!;
      expect(h).not.toBeNull();
      expect(h.table).toEqual([[c('6♠'), c('7♠')]]);
      expect(h.handSizes).toEqual([2, 0]);
      expect(h.hand).toEqual(observe(before, seat).hand.filter(x => x !== c('7♠')));
      expect(h.seat).toBe(seat);
    }
  });

  test('отбой идёт дальше или кончился «пасом» — паузы нет', () => {
    let s = pos({ hands: ['6♠ 6♣ 9♦', '7♠ 8♣ К♦'], trump: 'Т♥', talon: '' });
    s = apply(s, 0, { type: 'attack', cards: [c('6♠')] });
    const beat = { type: 'beat' as const, card: c('7♠'), on: c('6♠') };
    const s2 = apply(s, 1, beat);
    expect(s2.table.length).toBe(1);
    expect(heldView(observe(s, 0), 1, beat, s2)).toBeNull();
    // подкинуть нечего — «пас» кончает отбой; стол до него все уже видели
    const s3 = apply(apply(s2, 0, { type: 'throwIn', cards: [c('6♣')] }), 1, { type: 'beat', card: c('8♣'), on: c('6♣') });
    const s4 = apply(s3, 0, { type: 'pass' });
    expect(s4.table).toEqual([]);
    expect(heldView(observe(s3, 1), 0, { type: 'pass' }, s4)).toBeNull();
  });

  test('«беру»: шестая вдогонку — стол с ней, потом карты к взявшему', () => {
    let s = pos({ hands: ['6♠ 6♣ 6♦ 7♠ 7♣', '8♥ 9♥'], trump: 'Т♥', talonEmpty: true });
    s = apply(s, 0, { type: 'attack', cards: [c('6♠')] });
    s = apply(s, 1, { type: 'take' });
    const give = { type: 'give' as const, cards: [c('6♣')] };
    const after = apply(s, 0, give);
    // предел — две карты отбивающегося: вдогонку дана последняя, отбой кончился
    expect(after.table).toEqual([]);
    expect(after.hands[1]).toEqual(expect.arrayContaining(cs('6♠ 6♣')));
    const h = heldView(observe(s, 1), 0, give, after)!;
    expect(h.table).toEqual([[c('6♠'), null], [c('6♣'), null]]);
    expect(h.phase).toBe('giving');
  });

  test('случайные партии: пауза ровно у отбоев, кончившихся картой, и на столе — ровно ушедшие карты', () => {
    const rng = makeRng(42);
    let held = 0;
    for (let g = 0; g < 200; g++) {
      const seats = 2 + (g % 3);
      const deck = deckFrom(Uint8Array.from({ length: 32 }, () => rng.int(256)));
      let s = newGame({ rules: RULES_V1, variant: g % 2 ? 'perevodnoy' : 'podkidnoy', seats, first: 0 }, deck);
      for (let k = 0; k < 400 && s.phase !== 'end'; k++) {
        const all = Array.from({ length: seats }, (_, i) => i).flatMap(i => legalActions(s, i).map(a => ({ i, a })));
        const { i, a } = all[rng.int(all.length)];
        const next = apply(s, i, a);
        const ended = next.bout !== s.bout || next.phase === 'end';
        const placed = a.type !== 'take' && a.type !== 'pass';
        for (let seat = 0; seat < seats; seat++) {
          const h = heldView(observe(s, seat), i, a, next);
          expect(h !== null).toBe(ended && placed);
          if (!h) continue;
          held++;
          // на столе паузы — ровно карты, ушедшие в сброс или к взявшему
          const gone = [...cardsOnTable(s), ...(a.type === 'beat' ? [a.card] : 'cards' in a ? a.cards : [])].sort((x, y) => x - y);
          expect(h.table.flatMap(([x, d]) => (d === null ? [x] : [x, d])).sort((x, y) => x - y)).toEqual(gone);
          // своя рука — только своя (ADR 0008): та же, что до действия, без сыгранной
          expect(h.hand.every(x => s.hands[seat].includes(x))).toBe(true);
          expect(h.hand.length).toBe(h.handSizes[seat]);
          expect(Object.keys(h).sort()).toEqual(Object.keys(observe(s, seat)).sort());
        }
        s = next;
      }
    }
    expect(held).toBeGreaterThan(200);
  });

  test('числа: «Меньше движения» короче, сервер ждёт столько же', () => {
    expect(holdMs(false)).toBe(HOLD.ms);
    expect(holdMs(true)).toBeLessThan(HOLD.ms);
    expect(holdMs(true)).toBeGreaterThanOrEqual(600);
    expect(ONLINE.holdMs).toBe(HOLD.ms);
  });
});
