// Незаконченная партия в хранилище: пишется после каждого действия, стирается в конце партии;
// разбор и восстановление — src/state/saved.ts.
import { KEYS, loadJson, remove, saveJson } from './storage';
import { logError } from './crashlog';
import { isOldSave, restoreGame } from './saved';
import type { SavedGame } from './saved';
import type { State } from '../engine';

export type { SavedGame } from './saved';

export async function saveGame(g: SavedGame): Promise<void> {
  await saveJson(KEYS.current, g);
}

export async function loadGame(): Promise<{ saved: SavedGame; state: State } | null> {
  const raw = await loadJson<unknown>(KEYS.current);
  if (raw === null) return null;
  const r = restoreGame(raw);
  if (!r) {
    if (!isOldSave(raw)) logError('save', new Error('saved game did not restore'), 'loadGame');
    await remove(KEYS.current);
  }
  return r;
}

export const dropGame = (): Promise<void> => remove(KEYS.current);
