// Законченные партии с ботами (docs/04-data-model.md, «История»): запись партии, уровень, была ли подсказка
// и разбор, когда он досчитан. Отсюда — статистика, рейтинг тренировок и разборы старых партий.
// Хранится 200 последних; чистая часть — разбор записи (`normalizeHistory`).
import { RULES_V1 } from '../engine';
import type { GameRecord } from '../engine';
import { levelOf } from '../bot';
import type { Level, Review } from '../bot';
import { KEYS, loadJson, saveJson } from './storage';

export const KEEP_GAMES = 200;

export interface FinishedGame {
  record: GameRecord;
  level: Level;
  /** Начало партии, мс: им же разбор помечается открытым рекламой (src/money/rights.ts). */
  at: number;
  /** Конец партии, мс. */
  end: number;
  /** Брали подсказку — партия не идёт в рейтинг тренировок (docs/09-game-design.md). */
  hinted: boolean;
  review: Review | null;
}

/** Разобрать сохранённый список; битые записи пропускаются, а не роняют игру. */
export function normalizeHistory(raw: unknown): FinishedGame[] {
  if (!Array.isArray(raw)) return [];
  const out: FinishedGame[] = [];
  for (const x of raw) {
    const g = x as Partial<FinishedGame>;
    const level = levelOf(g?.level);
    if (!g || !g.record || g.record.v !== 1 || g.record.rules?.id !== RULES_V1.id || !level) continue;
    if (typeof g.at !== 'number' || typeof g.end !== 'number' || !g.record.result) continue;
    out.push({ record: g.record, level, at: g.at, end: g.end, hinted: g.hinted === true, review: g.review ?? null });
  }
  return out.slice(-KEEP_GAMES);
}

let games: FinishedGame[] | null = null;

export async function loadHistory(): Promise<FinishedGame[]> {
  games ??= normalizeHistory(await loadJson<unknown>(KEYS.games));
  return games;
}

export async function addFinished(g: FinishedGame): Promise<void> {
  const list = await loadHistory();
  games = [...list.filter(x => x.at !== g.at), g].slice(-KEEP_GAMES);
  await saveJson(KEYS.games, games);
}

/** Разбор досчитан — к партии. */
export async function setReview(at: number, review: Review): Promise<void> {
  const list = await loadHistory();
  games = list.map(g => (g.at === at ? { ...g, review } : g));
  await saveJson(KEYS.games, games);
}

/** Последняя законченная партия сегодня (по местному дню телефона): её полный разбор — бесплатно. */
export function lastToday(list: FinishedGame[], now: number): number | null {
  const day = (t: number) => new Date(t).toDateString();
  const today = list.filter(g => day(g.end) === day(now));
  return today.length ? today[today.length - 1].at : null;
}
