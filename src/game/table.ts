// Чистая логика стола для экрана: что можно сделать выбранной картой и кто из ботов ходит
// (docs/02-architecture.md, «Как ходят действия»). Без React — проверяется тестами.
import { deckFrom, dealOf, firstOf, legalActions, newGame, nextFirst, RULES_V1 } from '../engine';
import type { Action, Card, Result, State, Variant } from '../engine';

export const YOU = 0;

/** Действия руки, где участвует карта `c`: ход, подкидывание, вдогонку, перевод, «бить на …». */
export function actionsWith(s: State, seat: number, c: Card): Action[] {
  return legalActions(s, seat).filter(a => {
    if (a.type === 'beat') return a.card === c;
    if (a.type === 'take' || a.type === 'pass') return false;
    return a.cards.length === 1 && a.cards[0] === c;
  });
}

/** Что делает касание карты: сразу действие, если оно одно, или выбор цели. */
export function tapCard(s: State, seat: number, c: Card): { now: Action } | { choose: Action[] } | null {
  const opts = actionsWith(s, seat, c);
  if (opts.length === 0) return null;
  if (opts.length === 1) return { now: opts[0] };
  return { choose: opts };
}

/** Чей ход среди ботов: первое место с действиями от ходящего по часовой стрелке. */
export function botToAct(s: State, isBot: (seat: number) => boolean): number {
  if (s.phase === 'end') return -1;
  for (let k = 0; k < s.seats; k++) {
    const seat = (s.attacker + k) % s.seats;
    if (isBot(seat) && legalActions(s, seat).length > 0) return seat;
  }
  return -1;
}

/** Новая партия против ботов: колода из 32 случайных байт (с ботами — без отпечатка, ADR 0004). */
export function startGame(bytes: Uint8Array, seats: number, variant: Variant, history: (Result | null)[]): State {
  const deck = deckFrom(bytes);
  const { hands, trump } = dealOf(deck, seats);
  const first = nextFirst(history, seats) ?? firstOf(hands, trump).seat;
  return newGame({ rules: RULES_V1, variant, seats, first }, deck);
}
