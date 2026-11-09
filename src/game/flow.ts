// Чистые правила экрана партии против ботов (docs/09-game-design.md): «бито» само, отмена своего
// действия до ответа бота, таблица вышедших карт. Без React — проверяется тестами.
import { apply, cardOf, legalActions, observe, RANKS, SUITS } from '../engine';
import type { Action, GameRecord, Observation, State } from '../engine';
import { chooseAction } from '../bot';
import type { Rng } from '../bot';
import { actorOf } from '../bot/sim';

/** Всё покрыто (или соперник берёт), подкинуть нечего — единственное действие места «пас»:
 *  экран скажет его сам через 1,5 с («Темп»). */
export function autoPass(s: State, seat: number): boolean {
  if (s.phase === 'end' || s.table.length === 0) return false;
  if (s.phase === 'bout' && !s.table.every(([, d]) => d !== null)) return false;
  const acts = legalActions(s, seat);
  return acts.length === 1 && acts[0].type === 'pass';
}

/** Отмена — только своё последнее действие и только пока бот не ответил («Управление»). */
export function canUndo(r: GameRecord, seat: number): boolean {
  const last = r.actions[r.actions.length - 1];
  return !!last && last.seat === seat && r.result === null;
}

export type Seen = 'discard' | 'openly' | null;

/** Вышедшие карты 4 × 9 (масти ♠ ♣ ♦ ♥ по строкам, 6 … Т по столбцам): что ушло в сброс и что
 *  соперники взяли в открытую. Только из наблюдения места — то, что видел за столом каждый. */
export function seenGrid(o: Observation): Seen[][] {
  const discard = new Set(o.discard);
  const openly = new Set(o.openly.flatMap((cs, seat) => (seat === o.seat ? [] : cs)));
  return Array.from({ length: SUITS }, (_, suit) => Array.from({ length: RANKS }, (_, rank) => {
    const c = cardOf(suit, rank);
    return discard.has(c) ? 'discard' : openly.has(c) ? 'openly' : null;
  }));
}

/** С ботами вы сдались, а за столом остались два бота и больше (docs/08-rules.md, п. 8.7): они доигрывают сразу,
 *  без показа, по правилам «Среднего» — итог виден тут же. Действия идут в запись: партия переигрывается до конца. */
export function finishWithoutYou(s: State, rng: Rng, maxSteps = 5000): { state: State; actions: { seat: number; action: Action }[] } {
  const actions: { seat: number; action: Action }[] = [];
  for (let step = 0; s.phase !== 'end' && step < maxSteps; step++) {
    const seat = actorOf(s);
    if (seat < 0) break;
    const action = chooseAction(observe(s, seat), 'average', rng);
    s = apply(s, seat, action);
    actions.push({ seat, action });
  }
  return { state: s, actions };
}
