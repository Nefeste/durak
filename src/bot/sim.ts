// Доигрывание партии на возможном раскладе — для поиска по раскладам (docs/10-bot.md, «Как устроен»).
// Работает с позицией, но эту позицию бот собрал сам из своего наблюдения и выдуманных скрытых карт
// (`stateFrom`): настоящей правды здесь нет. Каждое место в доигрывании ходит по правилам «Среднего»,
// видя только своё наблюдение этой выдуманной позиции.
import { applyInPlace, cloneState, legalActions } from '../engine';
import type { Action, State } from '../engine';
import { decideFast, actorFast } from './fast';
import type { RuleParams } from './rules';
import type { Rng } from './rng';

/** Кто действует: первое место от ходящего по часовой стрелке, у которого есть законные действия
 *  (тот же порядок, что у стола и арены, docs/02-architecture.md, «Как ходят действия», п. 5). */
export function actorOf(s: State): number {
  return actorWith(s).seat;
}

/** То же и сразу законные действия этого места (чтобы не считать их дважды). */
export function actorWith(s: State): { seat: number; legal: Action[] } {
  for (let k = 0; k < s.seats; k++) {
    const seat = (s.attacker + k) % s.seats;
    const legal = legalActions(s, seat);
    if (legal.length > 0) return { seat, legal };
  }
  return { seat: -1, legal: [] };
}

/** Правила доигрывания — «Средний» без случайности. */
export const ROLLOUT: RuleParams = { random: 0, saveTrumps: true, pressure: true };

/** Исход партии для места `seat`: 1 — вышел, 0,5 — ничья, 0 — остался с картами. */
export function outcome(s: State, seat: number): number {
  const r = s.result!;
  if (r.draw) return 0.5;
  return r.fool === seat ? 0 : 1;
}

/** Доиграть до конца партии (или до `maxSteps` действий — тогда оценка, `estimate`). */
export function rollout(start: State, seat: number, rng: Rng, maxSteps = 400): number {
  // одна копия на всё доигрывание, дальше — правка на месте: действия заведомо законны (`decideFast`
  // равен правилам «Среднего», а те выбирают из законных — тест `search.test.ts`)
  const s = cloneState(start);
  for (let step = 0; s.phase !== 'end'; step++) {
    if (step >= maxSteps) return estimate(s, seat);
    const who = actorFast(s);
    if (who < 0) return estimate(s, seat);
    applyInPlace(s, who, decideFast(s, who, rng));
  }
  return outcome(s, seat);
}

/** Грубая оценка незаконченной партии: доля карт в руках соперников. */
export function estimate(s: State, seat: number): number {
  const mine = s.hands[seat].length;
  let others = 0;
  for (let i = 0; i < s.seats; i++) if (i !== seat) others += s.hands[i].length;
  return others + mine === 0 ? 0.5 : others / (others + mine);
}
