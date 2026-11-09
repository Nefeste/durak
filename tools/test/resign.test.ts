// Золотые тесты сдачи — правила приложения docs/08-rules.md, п. 8 (решение владельца #58): по тесту на подпункт.
import { describe, expect, test } from 'bun:test';
import { allCards, apply, legalActions, lostBy, newGame, observe, placesOf, reasonOf, RULES } from '../../src/engine';
import type { Action, State } from '../../src/engine';
import { makeRng } from '../../src/bot';
import { finishWithoutYou } from '../../src/game/flow';
import { placeOf } from '../../src/state/stats';
import { resultPlaces } from '../../src/game/outcome';
import { actorOf, shuffled } from '../sim/play';
import { c, cs, pos } from './helpers';

const act = (s: State, seat: number, a: Action) => apply(s, seat, a);
const attack = (s: State, seat: number, x: string) => act(s, seat, { type: 'attack', cards: cs(x) });
const beat = (s: State, seat: number, card: string, on: string) => act(s, seat, { type: 'beat', card: c(card), on: c(on) });
const pass = (s: State, seat: number) => act(s, seat, { type: 'pass' });
const resign = (s: State, seat: number) => act(s, seat, { type: 'resign' });

describe('8. Сдача — правило приложения', () => {
  test('п. 8.1: сдаться можно в любой момент, и не в свой ход; вышедший и сдавшийся — нет; ботам в законных её нет', () => {
    const s = attack(pos({ hands: ['6♠ 6♣ 8♥', '7♠ 8♠ В♦ 10♥', '6♦ 9♣ Д♣'], trump: 'Т♥', talon: '7♦ 8♦' }), 0, '6♠');
    for (const seat of [0, 1, 2]) expect(reasonOf(s, seat, { type: 'resign' })).toBeNull();
    expect(legalActions(s, 2).some(a => a.type === 'resign')).toBe(false);
    const r = resign(s, 2);
    expect(reasonOf(r, 2, { type: 'resign' })).toBe('notYourMove');
  });
  test('п. 8.2: карты сдавшегося уходят рубашкой вверх — ни в сброс, ни в наблюдение; ни одна не пропала', () => {
    let s = attack(pos({ hands: ['6♠ 6♣ 8♥', '7♠ 8♠ В♦ 10♥', '6♦ 9♣ Д♣'], trump: 'Т♥', talon: '7♦ 8♦' }), 0, '6♠');
    s = resign(s, 2);
    expect(s.hands[2]).toEqual([]);
    expect(s.discard).toEqual([]);
    expect([...s.buried].sort()).toEqual(cs('6♦ 9♣ Д♣').sort());
    for (const seat of [0, 1]) {
      const o = observe(s, seat);
      expect(o.resigned).toEqual([2]);
      expect(JSON.stringify(o)).not.toContain('buried');
      for (const card of cs('6♦ 9♣ Д♣')) expect([...o.hand, ...o.discard, ...o.openly.flat(), ...o.table.flat()]).not.toContain(card);
    }
    // наблюдение без сдавшихся — без поля: то же, что у версий игры до сдачи
    expect('resigned' in observe(pos({ hands: ['6♠', '7♠'], trump: 'Т♥', talon: '7♦' }), 0)).toBe(false);
  });
  test('п. 8.3: сдался отбивающийся — отбой кончается, карты в сброс, добор, ходит следующий за ним', () => {
    let s = pos({ hands: ['6♠ 6♣ 8♥', '7♠ 8♠ В♦ 10♥', '6♦ 9♣ Д♣'], trump: 'Т♥', talon: '7♦ 8♦ 9♦ 10♦' });
    s = beat(attack(s, 0, '6♠'), 1, '7♠', '6♠');
    s = resign(s, 1);
    expect(s.discard.sort()).toEqual(cs('6♠ 7♠').sort());
    // ходивший добрал до шести, сдавшийся — нет
    expect(s.hands[0].length).toBe(6);
    expect([s.attacker, s.defender]).toEqual([2, 0]);
    expect(s.phase).toBe('bout');
  });
  test('п. 8.3: сдался ходящий при пустом столе — ходит следующий за ним, под следующего за тем', () => {
    const s = resign(pos({ hands: ['6♠ 6♣ 8♥', '7♠ 8♠ В♦ 10♥', '6♦ 9♣ Д♣', '7♣ К♦ Д♠'], trump: 'Т♥', talon: '7♦ 8♦' }), 0);
    expect([s.attacker, s.defender, s.starter]).toEqual([1, 2, 1]);
    expect(s.boutLimit).toBe(3);
  });
  test('п. 8.3: сдался ходящий посреди отбоя — ходящий следующий за ним атакующий, у него первое право', () => {
    let s = pos({ hands: ['6♠ 6♣ 8♥', '7♠ 8♠ В♦ 10♥', '6♦ 9♣ Д♣', '6♥ 7♣ К♦'], trump: 'Т♥', talon: '7♦ 8♦' });
    s = beat(attack(s, 0, '6♠'), 1, '7♠', '6♠');
    s = resign(s, 0);
    expect(s.attacker).toBe(2);
    expect(reasonOf(s, 2, { type: 'throwIn', cards: cs('6♦') })).toBeNull();
    expect(reasonOf(s, 3, { type: 'throwIn', cards: cs('6♥') })).toBe('waitTurn');
    expect(s.table.length).toBe(1);
  });
  test('п. 8.3: сдался другой атакующий, а остальные уже сказали «пас» — «бито»', () => {
    let s = pos({ hands: ['6♠ 6♣ 8♥', '7♠ 8♠ В♦ 10♥', '6♦ 9♣ Д♣'], trump: 'Т♥', talon: '7♦ 8♦ 9♦' });
    s = pass(beat(attack(s, 0, '6♠'), 1, '7♠', '6♠'), 0);
    s = resign(s, 2);
    expect(s.table).toEqual([]);
    expect([s.attacker, s.defender]).toEqual([1, 0]);
  });
  test('п. 8.4: вдвоём сдался — партия кончается, сдавшийся — дурак; места: соперник, сдавшийся', () => {
    const s = resign(attack(pos({ hands: ['6♠ 6♣ 8♥', '7♠ 8♠ В♦ 10♥'], trump: 'Т♥', talon: '7♦ 8♦' }), 0, '6♠'), 1);
    expect(s.phase).toBe('end');
    expect(s.result).toEqual({ fool: 1, draw: false, order: [0], resigned: [1] });
    expect(s.discard).toEqual(cs('6♠'));
    expect(placesOf(s.result!)).toEqual([0, 1]);
  });
  test('п. 8.4–8.5: втроём доигрывают без сдавшегося; дурак — оставшийся с картами, сдавшийся ниже него', () => {
    let s = pos({ hands: ['6♠', '7♠ 8♠', '6♦ 9♣ Д♣'], trump: 'Т♥', talonEmpty: true });
    s = resign(s, 2);
    expect(s.phase).toBe('bout');
    s = beat(attack(s, 0, '6♠'), 1, '7♠', '6♠');
    expect(s.phase).toBe('end');
    expect(s.result).toEqual({ fool: 1, draw: false, order: [0], resigned: [2] });
    expect(placesOf(s.result!)).toEqual([0, 1, 2]);
    expect(lostBy(s.result!, 2) && lostBy(s.result!, 1) && !lostBy(s.result!, 0)).toBe(true);
  });
  test('п. 8.4: втроём сдались двое — партия кончается, оставшийся не дурак; кто сдался раньше — ниже', () => {
    let s = pos({ hands: ['6♠ 6♣ 8♥', '7♠ 8♠ В♦ 10♥', '6♦ 9♣ Д♣'], trump: 'Т♥', talon: '7♦ 8♦' });
    s = resign(resign(s, 2), 0);
    expect(s.result).toEqual({ fool: 0, draw: false, order: [1], resigned: [2, 0] });
    expect(placesOf(s.result!)).toEqual([1, 0, 2]);
    const rows = resultPlaces(s.result!, seat => ({ name: `м${seat}` }), 2);
    expect(rows.map(r => [r.name, r.fool, !!r.resigned])).toEqual([['м1', false, false], ['м0', true, true], ['м2', true, true]]);
  });
  test('п. 8.6: следующую партию ходит игрок слева от дурака', async () => {
    const { nextFirst } = await import('../../src/engine');
    expect(nextFirst([{ fool: 0, draw: false, order: [1], resigned: [2, 0] }], 3)).toBe(1);
  });
  test('п. 8.7: с ботами — вы сдались, боты доигрывают сразу; в статистике — «остались с картами»', () => {
    const rng = makeRng(5);
    for (let g = 0; g < 60; g++) {
      const seats = 3 + (g % 2);
      let s = newGame({ rules: RULES, variant: g % 4 < 2 ? 'podkidnoy' : 'perevodnoy', seats, first: g % seats }, shuffled(rng));
      for (let n = 0; n < g % 17 && s.phase !== 'end'; n++) {
        const seat = actorOf(s);
        const legal = legalActions(s, seat);
        s = apply(s, seat, legal[rng.int(legal.length)]);
      }
      if (s.phase === 'end' || s.out.includes(0)) continue;
      s = resign(s, 0);
      const { state, actions } = finishWithoutYou(s, rng);
      expect(state.phase).toBe('end');
      expect(actions.every(a => a.seat !== 0)).toBe(true);
      expect(allCards(state).length).toBe(36);
      expect(placesOf(state.result!).at(-1)).toBe(0);
      const record = { v: 1 as const, rules: RULES, variant: s.variant, seats, first: 0, firstWhy: 'lowestTrump' as const, deck: [], actions: [], result: state.result };
      expect(placeOf(record, 0)).toBe('fool');
    }
  });
  test('случайные партии со сдачей: карты не теряются, партия кончается', () => {
    const rng = makeRng(17);
    for (let g = 0; g < 600; g++) {
      const seats = 2 + (g % 3);
      let s = newGame({ rules: RULES, variant: g % 2 ? 'perevodnoy' : 'podkidnoy', seats, first: rng.int(seats) }, shuffled(rng));
      for (let n = 0; s.phase !== 'end'; n++) {
        expect(n).toBeLessThan(3000);
        if (rng.next() < 0.01) {
          const who = rng.int(seats);
          if (reasonOf(s, who, { type: 'resign' }) === null) { s = resign(s, who); continue; }
        }
        const seat = actorOf(s);
        const legal = legalActions(s, seat);
        s = apply(s, seat, legal[rng.int(legal.length)]);
        expect(allCards(s).length).toBe(36);
        expect(new Set(allCards(s)).size).toBe(36);
      }
      expect(placesOf(s.result!).sort()).toEqual(Array.from({ length: seats }, (_, i) => i));
    }
  });
});
