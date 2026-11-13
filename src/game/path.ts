// «Путь к Мастеру» (docs/specs/2026-11-path.md; решение владельца #21, вариант 1): 21 соперник по порядку, матч с каждым,
// у подкидного и переводного — свои пути. Здесь — чистая часть: порядок, сколько побед нужно, итог партии в матче,
// пройденные и разбор сохранения. Без React и без хранилища — проверяется tools/test/path.test.ts.
// Устав «Без давления»: проигрыш ничего не отнимает, ничто не сгорает и не ждёт.
import type { Result, Variant } from '../engine';
import { lostBy } from '../engine';
import type { Level } from '../bot';
import { CAST, CAST_LEVELS } from './rivals';
import type { Rival, RivalId } from './rivals';

/** Ступень пути — уровень; в ступени сначала двое, потом «лицо уровня» (первый в составе). */
export const PATH: readonly Rival[] = CAST_LEVELS.flatMap(l => [CAST[l][1], CAST[l][2], CAST[l][0]]);
export const PATH_LEN = PATH.length;
export const PATH_VARIANTS: Variant[] = ['podkidnoy', 'perevodnoy'];

/** Ступени 1–3 — до одной победы, дальше — до двух (спецификация, §2). */
const ONE_WIN: Level[] = ['novice', 'beginner', 'amateur'];
export const winsFor = (level: Level): number => (ONE_WIN.includes(level) ? 1 : 2);

export const pathIndex = (id: RivalId): number => PATH.findIndex(r => r.id === id);
export const rivalById = (id: RivalId): Rival | null => PATH.find(r => r.id === id) ?? null;
export const isRivalId = (x: unknown): x is RivalId => typeof x === 'string' && PATH.some(r => r.id === x);

/** Путь одного варианта: `at` — номер текущего соперника (PATH_LEN — пройден), счёт текущего матча. */
export interface PathRun { at: number; you: number; them: number; doneAt: number | null }
/** Счёт с соперником за все матчи пути (оба варианта) и когда он впервые пройден. */
export interface RivalScore { won: number; lost: number; beatenAt: number | null }
export interface PathLog { runs: Record<Variant, PathRun>; rivals: Partial<Record<RivalId, RivalScore>> }

export const FRESH_RUN: PathRun = { at: 0, you: 0, them: 0, doneAt: null };
export const EMPTY_PATH: PathLog = { runs: { podkidnoy: FRESH_RUN, perevodnoy: FRESH_RUN }, rivals: {} };

/** Кто сейчас соперник пути; `null` — путь пройден. */
export const currentRival = (run: PathRun): Rival | null => PATH[run.at] ?? null;

/** Исход партии для вас (место 0): ничья не считается, сдались — проигрыш (docs/08-rules.md, п. 8). */
export type Outcome = 'win' | 'lose' | 'draw';
export function outcomeOf(r: Result, you = 0): Outcome {
  if ((r.resigned ?? []).includes(you)) return 'lose';
  if (r.draw || r.fool === null) return 'draw';
  return lostBy(r, you) ? 'lose' : 'win';
}

/** Что случилось с матчем после партии. */
export type MatchEvent = 'continue' | 'matchWon' | 'matchLost' | 'pathDone';
export interface Scored { log: PathLog; event: MatchEvent; you: number; them: number; rival: Rival; next: Rival | null }

/**
 * Партия матча кончилась: новый путь и что сказать на итоге. Партия не с текущим соперником (путь ушёл вперёд, пока
 * она лежала сохранённой) счёт пути не меняет — только счёт с соперником. `now` — для дат пройденных.
 */
export function scoreGame(log: PathLog, variant: Variant, rivalId: RivalId, outcome: Outcome, now: number): Scored {
  const rival = rivalById(rivalId) ?? PATH[0];
  const run = log.runs[variant];
  const prev = log.rivals[rival.id] ?? { won: 0, lost: 0, beatenAt: null };
  const score: RivalScore = { ...prev, won: prev.won + (outcome === 'win' ? 1 : 0), lost: prev.lost + (outcome === 'lose' ? 1 : 0) };
  const same = currentRival(run)?.id === rival.id;
  if (!same || outcome === 'draw') {
    return { log: { ...log, rivals: { ...log.rivals, [rival.id]: score } }, event: 'continue', you: run.you, them: run.them, rival, next: same ? rival : currentRival(run) };
  }
  const you = run.you + (outcome === 'win' ? 1 : 0), them = run.them + (outcome === 'lose' ? 1 : 0);
  const need = winsFor(rival.level);
  let next: PathRun = { ...run, you, them };
  let event: MatchEvent = 'continue';
  if (you >= need) {
    const at = run.at + 1;
    next = { at, you: 0, them: 0, doneAt: at >= PATH_LEN ? now : null };
    score.beatenAt ??= now;
    event = at >= PATH_LEN ? 'pathDone' : 'matchWon';
  } else if (them >= need) {
    next = { ...run, you: 0, them: 0 };
    event = 'matchLost';
  }
  return {
    log: { runs: { ...log.runs, [variant]: next }, rivals: { ...log.rivals, [rival.id]: score } },
    event, you, them, rival, next: currentRival(next),
  };
}

/** Пройденные хоть в одном варианте — коллекция. */
export const beatenOf = (log: PathLog): Set<RivalId> =>
  new Set(PATH.filter(r => log.rivals[r.id]?.beatenAt != null).map(r => r.id));

/** Состояние соперника на лестнице варианта. */
export type Step = 'done' | 'now' | 'ahead';
export const stepOf = (run: PathRun, i: number): Step => (i < run.at ? 'done' : i === run.at ? 'now' : 'ahead');

const int = (v: unknown, lo: number, hi: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : lo;
const time = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** Разобрать сохранение: битое поле — как с начала, игра не падает. */
export function normalizePath(raw: unknown): PathLog {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { runs?: Record<string, unknown>; rivals?: Record<string, unknown> };
  const runOf = (x: unknown): PathRun => {
    const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const at = int(r.at, 0, PATH_LEN);
    const need = at < PATH_LEN ? winsFor(PATH[at].level) : 1;
    return { at, you: int(r.you, 0, need - 1), them: int(r.them, 0, need - 1), doneAt: at >= PATH_LEN ? time(r.doneAt) ?? 1 : null };
  };
  const rivals: Partial<Record<RivalId, RivalScore>> = {};
  for (const r of PATH) {
    const s = o.rivals?.[r.id] as Record<string, unknown> | undefined;
    if (!s || typeof s !== 'object') continue;
    rivals[r.id] = { won: int(s.won, 0, 1e6), lost: int(s.lost, 0, 1e6), beatenAt: time(s.beatenAt) };
  }
  return { runs: { podkidnoy: runOf(o.runs?.podkidnoy), perevodnoy: runOf(o.runs?.perevodnoy) }, rivals };
}

/** Места стола с соперником матча: на месте 1 — он, а не «лицо уровня» (`rivalsAt` выбрал бы лицо). */
export function withRival(rivals: (Rival | null)[], id: RivalId | null | undefined): (Rival | null)[] {
  const r = id ? rivalById(id) : null;
  return r && rivals.length === 2 ? [rivals[0], r] : rivals;
}
