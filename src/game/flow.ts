// Чистые правила экрана партии против ботов (docs/09-game-design.md): «бито» само, отмена своего
// действия до ответа бота, таблица вышедших карт. Без React — проверяется тестами.
import { cardOf, legalActions, RANKS, SUITS } from '../engine';
import type { GameRecord, Observation, State } from '../engine';

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
