// Путь к Мастеру в хранилище (`durak.path`, docs/specs/2026-11-path.md): прогресс по вариантам и счёт с соперниками.
// Чистая часть — src/game/path.ts. Экраны подписываются `usePath()`; запись — сразу после партии.
import { useSyncExternalStore } from 'react';
import type { Variant } from '../engine';
import { EMPTY_PATH, normalizePath, scoreGame } from '../game/path';
import type { Outcome, PathLog, Scored } from '../game/path';
import type { RivalId } from '../game/rivals';
import { KEYS, loadJson, saveJson } from './storage';

let log: PathLog = EMPTY_PATH;
let loading: Promise<PathLog> | null = null;
const subs = new Set<() => void>();
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** Прочитать путь один раз (при запуске меню). */
export function loadPath(): Promise<PathLog> {
  loading ??= loadJson<unknown>(KEYS.path).then(raw => { log = normalizePath(raw); subs.forEach(f => f()); return log; });
  return loading;
}

export const getPath = (): PathLog => log;
export const usePath = (): PathLog => useSyncExternalStore(subscribe, getPath, getPath);

/** Партия матча кончилась: записать и сказать, что стало с матчем. */
export async function recordPathGame(variant: Variant, rival: RivalId, outcome: Outcome): Promise<Scored> {
  await loadPath();
  const s = scoreGame(log, variant, rival, outcome, Date.now());
  log = s.log;
  subs.forEach(f => f());
  await saveJson(KEYS.path, log);
  return s;
}
