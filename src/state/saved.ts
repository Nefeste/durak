// Незаконченная партия с ботами (ADR 0002, docs/04-data-model.md): чистая часть — разбор и
// восстановление переигрыванием. Битая или чужая запись не роняет игру: её нет. Хранилище — save.ts.
import { replay, RULES_V1 } from '../engine';
import type { Action, GameRecord, Result, State } from '../engine';
import { levelOf } from '../bot';
import type { Level } from '../bot';

export interface SavedGame {
  record: GameRecord;
  level: Level;
  /** Итоги прошлых партий за этим столом — кто ходит первым в следующей (п. 3.3). */
  history: (Result | null)[];
}

const isAction = (a: unknown): a is Action => {
  if (!a || typeof a !== 'object') return false;
  const t = (a as { type?: unknown }).type;
  return ['attack', 'throwIn', 'give', 'transfer', 'beat', 'take', 'pass'].includes(t as string);
};

/** Разобрать и проверить сохранение: та же версия свода, законные действия до конца записи.
 *  Возвращает партию и позицию или `null` — если что-то не сходится. */
export function restoreGame(raw: unknown): { saved: SavedGame; state: State } | null {
  try {
    const s = raw as SavedGame;
    if (!s || typeof s !== 'object' || !s.record || s.record.v !== 1) return null;
    if (s.record.rules?.id !== RULES_V1.id) return null;
    const level = levelOf(s.level);
    if (!level) return null;
    if (!Array.isArray(s.record.actions) || !s.record.actions.every(x => x && Number.isInteger(x.seat) && isAction(x.action))) return null;
    const state = replay(s.record);
    if (state.phase === 'end') return null;
    return { saved: { record: s.record, level, history: Array.isArray(s.history) ? s.history : [] }, state };
  } catch {
    return null;
  }
}

