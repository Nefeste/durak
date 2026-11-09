// Раздача, первый ход и вспомогательные функции позиции (docs/08-rules.md, пп. 1–3).
import { DECK_SIZE, rankOf, suitOf } from './cards';
import type { Card } from './cards';
import type { Result, RuleSet, Setup, State, Variant } from './types';

/** Раздача по колоде (docs/specs/2026-11-v1.md, «Колода»): по одной карте по местам по кругу,
 *  по шесть каждому; следующая карта — козырь, остальные — колода сверху вниз, козырь — последний. */
export function dealOf(deck: Card[], seats: number, handSize = 6): { hands: Card[][]; talon: Card[]; trump: Card } {
  if (deck.length !== DECK_SIZE || new Set(deck).size !== DECK_SIZE || deck.some(c => c < 0 || c >= DECK_SIZE)) {
    throw new Error('deck: 36 distinct cards 0..35');
  }
  if (seats < 2 || seats > 4) throw new Error('seats: 2..4');
  const hands: Card[][] = Array.from({ length: seats }, () => []);
  let i = 0;
  for (let round = 0; round < handSize; round++) {
    for (let s = 0; s < seats; s++) hands[s].push(deck[i++]);
  }
  const trump = deck[i++];
  const talon = [...deck.slice(i), trump];
  return { hands, talon, trump };
}

export type FirstWhy = 'lowestTrump' | 'lowestCard' | 'afterFool';

/** Первый ход первой партии за столом (п. 3): младший козырь на руках; если козырей нет ни
 *  у кого — младшая карта, при равенстве младшая масть в порядке ♠ ♣ ♦ ♥. */
export function firstOf(hands: Card[][], trump: Card): { seat: number; why: FirstWhy; card: Card } {
  const ts = suitOf(trump);
  let seat = -1, card = -1;
  for (let s = 0; s < hands.length; s++) {
    for (const c of hands[s]) {
      if (suitOf(c) === ts && (card < 0 || rankOf(c) < rankOf(card))) { seat = s; card = c; }
    }
  }
  if (card >= 0) return { seat, card, why: 'lowestTrump' };
  const key = (c: Card) => rankOf(c) * 4 + suitOf(c);
  for (let s = 0; s < hands.length; s++) {
    for (const c of hands[s]) {
      if (card < 0 || key(c) < key(card)) { seat = s; card = c; }
    }
  }
  return { seat, card, why: 'lowestCard' };
}

/** Кто ходит в следующей партии (п. 3): слева от дурака. После ничьей — слева от дурака партии
 *  перед ней; если ничьих до сих пор не было дураков — снова младший козырь (`null`). */
export function nextFirst(previous: (Result | null)[], seats: number): number | null {
  for (let i = previous.length - 1; i >= 0; i--) {
    const r = previous[i];
    if (r && r.fool !== null) return (r.fool + 1) % seats;
  }
  return null;
}

/** Есть ли у места карты и не вышло ли оно. */
export const active = (s: State, seat: number): boolean => !s.out.includes(seat) && !s.resigned.includes(seat) && s.hands[seat].length > 0;

/** В партии ли место: не вышло и не сдалось (карт может не быть, пока колода не пуста). */
export const inPlay = (s: Pick<State, 'out' | 'resigned'>, seat: number): boolean => !s.out.includes(seat) && !s.resigned.includes(seat);

/** Следующее по часовой стрелке место с картами, не считая `from`. */
export function nextActive(s: State, from: number): number {
  for (let k = 1; k < s.seats; k++) {
    const seat = (from + k) % s.seats;
    if (active(s, seat)) return seat;
  }
  return -1;
}

/** Предел карт атаки для отбивающегося с `hand` картами в отбое `bout` (п. 4.4). */
export function limitOf(rules: RuleSet, bout: number, hand: number): number {
  return Math.min(bout === 0 ? rules.firstBoutAttack : rules.maxAttack, hand);
}

/** Новая партия: раздача по колоде и первый ход. */
export function newGame(setup: Setup, deck: Card[]): State {
  const { rules, variant, seats, first } = setup;
  if (first < 0 || first >= seats) throw new Error('first: a seat number');
  const { hands, talon, trump } = dealOf(deck, seats, rules.handSize);
  const s: State = {
    rules, variant: variant as Variant, seats, hands, talon, trump,
    table: [], discard: [], openly: Array.from({ length: seats }, () => []),
    starter: first, attacker: first, defender: (first + 1) % seats,
    passed: Array.from({ length: seats }, () => false),
    boutLimit: 0, bout: 0, out: [], resigned: [], buried: [], phase: 'bout', result: null,
  };
  s.boutLimit = limitOf(rules, 0, s.hands[s.defender].length);
  return s;
}

export const copyResult = (r: Result): Result => (r.resigned ? { ...r, order: [...r.order], resigned: [...r.resigned] } : { ...r, order: [...r.order] });

/** Глубокая копия позиции (движок не меняет переданную). */
export function cloneState(s: State): State {
  return {
    ...s,
    hands: s.hands.map(h => [...h]),
    talon: [...s.talon],
    table: s.table.map(([a, d]) => [a, d] as [Card, Card | null]),
    discard: [...s.discard],
    openly: s.openly.map(o => [...o]),
    passed: [...s.passed],
    out: [...s.out],
    resigned: [...s.resigned],
    buried: [...s.buried],
    result: s.result ? copyResult(s.result) : null,
  };
}

/** Все карты позиции — для проверки, что ни одна не пропала и не появилась. */
export function allCards(s: State): Card[] {
  return [...s.hands.flat(), ...s.talon, ...s.table.flatMap(([a, d]) => (d === null ? [a] : [a, d])), ...s.discard, ...s.buried];
}
