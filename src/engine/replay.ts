// Партия — расстановка, колода и список действий (ADR 0002): восстановление — переигрывание.
import type { Card } from './cards';
import { apply } from './apply';
import { newGame } from './deal';
import type { FirstWhy } from './deal';
import type { Action, Result, RuleSet, State, Variant } from './types';

export interface GameRecord {
  v: 1;
  rules: RuleSet;
  variant: Variant;
  seats: number;
  first: number;
  firstWhy: FirstWhy;
  deck: Card[];
  actions: { seat: number; action: Action; at: number }[];
  result: Result | null;
}

/** Позиция после всех действий записи; бросает исключение на первом незаконном действии. */
export function replay(r: GameRecord): State {
  let s = newGame({ rules: r.rules, variant: r.variant, seats: r.seats, first: r.first }, r.deck);
  for (const { seat, action } of r.actions) s = apply(s, seat, action);
  return s;
}
