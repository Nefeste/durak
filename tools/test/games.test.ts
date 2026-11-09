// Случайные партии: инварианты движка на 2–4 местах, обоих столах (docs/specs/2026-11-v1.md,
// критерий 1). По умолчанию 3 000 партий; DURAK_LONG=1 — 100 000.
import { describe, expect, test } from 'bun:test';
import { allCards, apply, legalActions, newGame, queueOf, reasonOf, RULES, RULES_V1, throwerOf } from '../../src/engine';
import type { State, Variant } from '../../src/engine';
import { makeRng } from '../../src/bot';
import { actorOf, shuffled } from '../sim/play';

const GAMES = process.env.DURAK_LONG ? 100_000 : 3_000;

function check(s: State) {
  const all = allCards(s);
  expect(all.length).toBe(36);
  expect(new Set(all).size).toBe(36);
  expect(s.table.length).toBeLessThanOrEqual(s.boutLimit);
  expect(s.boutLimit).toBeLessThanOrEqual(s.bout === 0 ? RULES_V1.firstBoutAttack : RULES_V1.maxAttack);
  for (const seat of s.out) expect(s.hands[seat].length).toBe(0);
  for (let seat = 0; seat < s.seats; seat++) for (const c of s.openly[seat]) expect(s.hands[seat]).toContain(c);
  if (s.phase !== 'end') {
    expect(s.attacker).not.toBe(s.defender);
    expect(s.out).not.toContain(s.defender);
  }
  // по очереди (п. 4.3): подкинуть или сказать «пас» может только тот, у кого право
  if (s.rules.order === 'queue' && s.phase !== 'end' && s.table.length > 0) {
    const t = throwerOf(s);
    for (const seat of queueOf(s)) if (seat !== t) expect(legalActions(s, seat)).toEqual([]);
  }
}

describe('случайные партии', () => {
  test(`${GAMES} партий наугад среди законных: карты не теряются, партия кончается`, () => {
    const rng = makeRng(7);
    let draws = 0, steps = 0;
    for (let g = 0; g < GAMES; g++) {
      const seats = 2 + (g % 3);
      const variant: Variant = g % 2 ? 'perevodnoy' : 'podkidnoy';
      // очередь и «кто успел» — на каждом сочетании мест и варианта
      const rules = Math.floor(g / 6) % 2 ? RULES : RULES_V1;
      let s = newGame({ rules, variant, seats, first: rng.int(seats) }, shuffled(rng));
      for (let n = 0; s.phase !== 'end'; n++) {
        expect(n).toBeLessThan(2000);
        const seat = actorOf(s);
        const legal = legalActions(s, seat);
        if (g < 300) for (const a of legal) expect(reasonOf(s, seat, a)).toBeNull();
        s = apply(s, seat, legal[rng.int(legal.length)]);
        steps++;
        if (g < 300) check(s);
      }
      check(s);
      expect(s.result!.order.length + (s.result!.draw ? 0 : 1)).toBe(seats);
      if (s.result!.draw) draws++;
    }
    expect(steps).toBeGreaterThan(GAMES * 10);
    expect(draws).toBeLessThan(GAMES);
  }, process.env.DURAK_LONG ? 3_600_000 : 60_000);
});
