// Партия ботов до конца: кто ходит — первое место в порядке «ходящий, затем по часовой стрелке»,
// у которого есть законные действия (docs/02-architecture.md, «Как ходят действия», п. 5).
import { apply, legalActions, newGame, observe, RULES_V1 } from '../../src/engine';
import type { Action, Card, RuleSet, State, Variant } from '../../src/engine';
import type { Rng } from '../../src/bot';

export type Chooser = (s: State, seat: number) => Action;

export function actorOf(s: State): number {
  for (let k = 0; k < s.seats; k++) {
    const seat = (s.attacker + k) % s.seats;
    if (legalActions(s, seat).length > 0) return seat;
  }
  return -1;
}

export interface Played {
  final: State;
  actions: { seat: number; action: Action }[];
}

/** Сыграть партию: `choose` получает позицию и место, но боты внутри видят только `observe`. */
export function playGame(deck: Card[], seats: number, first: number, variant: Variant, choose: Chooser, rules: RuleSet = RULES_V1, maxSteps = 5000): Played {
  let s = newGame({ rules, variant, seats, first }, deck);
  const actions: { seat: number; action: Action }[] = [];
  for (let step = 0; s.phase !== 'end'; step++) {
    if (step > maxSteps) throw new Error('партия не кончилась');
    const seat = actorOf(s);
    if (seat < 0) throw new Error('никто не может ходить');
    const action = choose(s, seat);
    s = apply(s, seat, action);
    actions.push({ seat, action });
  }
  return { final: s, actions };
}

/** Колода из генератора с зерном — для арены и проверок (в игре колода — из `deckFrom`). */
export function shuffled(rng: Rng): Card[] {
  const d = Array.from({ length: 36 }, (_, i) => i);
  for (let i = 35; i > 0; i--) {
    const j = rng.int(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export { observe };
