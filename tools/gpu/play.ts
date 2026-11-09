// Общее для самоигры и арены сети (tools/gpu/README.md): свод, раздача, партия до конца.
import { apply, dealOf, firstOf, newGame, observe, RULES } from '../../src/engine';
import type { RuleSet, State, Variant } from '../../src/engine';
import type { Rng } from '../../src/bot';
import { actorOf } from '../../src/bot/sim';
import type { Player } from '../sim/players';

export { loadNet, playerOf } from '../sim/players';
export type { Player } from '../sim/players';
export { shuffled } from '../sim/play';

/** Свод для арены и эталона — нынешний свод игры: по очереди (#57). */
export async function trainingRules(): Promise<RuleSet> {
  return RULES;
}

export function startOf(deck: number[], seats: number, variant: Variant, rules: RuleSet): State {
  const { hands, trump } = dealOf(deck, seats);
  return newGame({ rules, variant, seats, first: firstOf(hands, trump).seat }, deck);
}

/** Партия до конца; `null` — не кончилась за `maxSteps` действий (круг). */
export function playOut(start: State, players: Player[], rng: Rng, maxSteps = 5000): State | null {
  let s = start;
  for (let step = 0; s.phase !== 'end'; step++) {
    if (step > maxSteps) return null;
    const seat = actorOf(s);
    s = apply(s, seat, players[seat](observe(s, seat), rng));
  }
  return s;
}
