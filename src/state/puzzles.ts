// Задачи дня игрока (docs/09-game-design.md, «Задача дня»): по номеру дня — попытки, решена ли, смотрел ли ответ.
// Пропущенный день ждёт в архиве — ничего не сгорает (устав, «Без давления»).
import { KEYS, loadJson, saveJson } from './storage';

export interface PuzzleDay { tries: number; solved: boolean; shown: boolean }
export type PuzzleLog = Record<number, PuzzleDay>;

export function normalizeLog(raw: unknown): PuzzleLog {
  const out: PuzzleLog = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const day = Number(k), d = v as Partial<PuzzleDay>;
    if (!Number.isInteger(day) || day < 1 || !d || typeof d !== 'object') continue;
    out[day] = { tries: typeof d.tries === 'number' && d.tries >= 0 ? d.tries : 0, solved: d.solved === true, shown: d.shown === true };
  }
  return out;
}

let log: PuzzleLog | null = null;

export async function loadPuzzleLog(): Promise<PuzzleLog> {
  log ??= normalizeLog(await loadJson<unknown>(KEYS.puzzles));
  return log;
}

export async function updateDay(day: number, f: (d: PuzzleDay) => PuzzleDay): Promise<PuzzleLog> {
  const l = await loadPuzzleLog();
  log = { ...l, [day]: f(l[day] ?? { tries: 0, solved: false, shown: false }) };
  await saveJson(KEYS.puzzles, log);
  return log;
}

export const solvedCount = (l: PuzzleLog): number => Object.values(l).filter(d => d.solved).length;

/** Местная дата телефона `ГГГГ-ММ-ДД`; в браузере для проверок — `?date=`. */
export function todayKey(now = new Date()): string {
  const q = typeof globalThis.location !== 'undefined' ? /[?&]date=(\d{4}-\d{2}-\d{2})/.exec(globalThis.location.search) : null;
  if (q) return q[1];
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Дата дня `n` от `start` — для подписи в архиве. */
export function dateOfDay(start: string, n: number): string {
  const [y, m, d] = start.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n - 1));
  return `${String(t.getUTCDate()).padStart(2, '0')}.${String(t.getUTCMonth() + 1).padStart(2, '0')}.${t.getUTCFullYear()}`;
}
