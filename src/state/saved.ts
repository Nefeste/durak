// Незаконченная партия с ботами (ADR 0002, docs/04-data-model.md): чистая часть — разбор и
// восстановление переигрыванием. Битая или чужая запись не роняет игру: её нет. Хранилище — save.ts.
// Уровни — по местам ботов (`levels`); партию прошлых версий с одним `level` не переносим (решение владельца
// 09.11.2026): её просто нет, меню без «Продолжить партию».
import { replay, knownRules } from '../engine';
import type { Action, GameRecord, Result, State } from '../engine';
import { levelsOf } from '../bot';
import type { Level } from '../bot';

export interface SavedGame {
  record: GameRecord;
  /** Уровни ботов по местам 1 … seats − 1. */
  levels: Level[];
  /** Итоги прошлых партий за этим столом — кто ходит первым в следующей (п. 3.3). */
  history: (Result | null)[];
}

const isAction = (a: unknown): a is Action => {
  if (!a || typeof a !== 'object') return false;
  const t = (a as { type?: unknown }).type;
  return ['attack', 'throwIn', 'give', 'transfer', 'beat', 'take', 'pass', 'resign'].includes(t as string);
};

/** Разобрать и проверить сохранение: та же версия свода, законные действия до конца записи.
 *  Возвращает партию и позицию или `null` — если что-то не сходится. */
export function restoreGame(raw: unknown): { saved: SavedGame; state: State } | null {
  try {
    const s = raw as SavedGame;
    if (!s || typeof s !== 'object' || !s.record || s.record.v !== 1) return null;
    if (!knownRules(s.record.rules)) return null;
    const levels = levelsOf(s.levels, s.record.seats - 1);
    if (!levels) return null;
    if (!Array.isArray(s.record.actions) || !s.record.actions.every(x => x && Number.isInteger(x.seat) && isAction(x.action))) return null;
    const state = replay(s.record);
    if (state.phase === 'end') return null;
    return { saved: { record: s.record, levels, history: Array.isArray(s.history) ? s.history : [] }, state };
  } catch {
    return null;
  }
}


/** Незаконченная партия прошлой версии — с одним `level` вместо `levels`: её стирают молча, это не сбой. */
export function isOldSave(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && 'level' in raw && !('levels' in raw);
}
