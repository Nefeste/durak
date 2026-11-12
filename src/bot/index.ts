// Уровни ботов (docs/10-bot.md, «Уровни»): четыре — по правилам, два — поиск по раскладам; «Опытный» решает
// концовку вдвоём точно; седьмой — «Мастер», нейросеть (docs/specs/2026-11-neural.md; был закрыт до сети, решение
// владельца #15, открыт по #83). Вход у всех — только наблюдение места (ADR 0005).
import type { Action, Observation } from '../engine';
import { legalFor } from './legal';
import { loadMaster } from './net/embedded';
import { NET_PARAMS, netThink } from './net/bot';
import { chooseByRules } from './rules';
import type { RuleParams } from './rules';
import type { Rng } from './rng';
import { searchThink } from './search';
import { ROLLOUT } from './sim';
import type { SearchParams } from './search';
import { thinkSync } from './think';
import type { Thinking } from './think';

export type Level = 'novice' | 'beginner' | 'amateur' | 'average' | 'experienced' | 'master' | 'neural';

export const LEVELS: Level[] = ['novice', 'beginner', 'amateur', 'average', 'experienced', 'master', 'neural'];
export const RULE_LEVELS: Level[] = ['novice', 'beginner', 'amateur', 'average'];
export const SEARCH_LEVELS: Level[] = ['experienced', 'master'];
/** Уровень на сети (docs/specs/2026-11-neural.md): «Мастер». */
export const NET_LEVEL: Level = 'neural';
/** Уровень подсказки, разбора и бота за отключившегося онлайн — «Опытный», а не сеть: шанс подсказки и падение шанса
 *  разбора меряет поиск по раскладам до конца партии; сеть сменит его только после отдельной проверки точности
 *  (спецификация сети, §11 п. 4). */
export const TOP: Level = 'master';

const RULES: Partial<Record<Level, RuleParams>> = {
  novice: { random: 0.6, saveTrumps: false, pressure: false },
  beginner: { random: 0.3, saveTrumps: false, pressure: false },
  amateur: { random: 0.12, saveTrumps: true, pressure: false },
  average: { random: 0, saveTrumps: true, pressure: true },
};

export const SEARCH: Partial<Record<Level, SearchParams>> = {
  experienced: { samples: 4, endgame: 0 },
  master: { samples: 128, endgame: 15_000 },
};

/** Сколько уровень думает самое большее в приложении, мс (docs/10-bot.md, «Скорость»): на медленном
 *  телефоне бот чуть слабее, а не медленнее. В арене бюджет — число раскладов, а не время. */
export const THINK_MS: Record<Level, number> = {
  novice: 50, beginner: 50, amateur: 50, average: 50, experienced: 300, master: 1500, neural: 1500,
};

/** С какого отбоя партии бот рвёт круг (обычная партия вдвоём — 15–25 отбоев). */
export const LOOP_BOUT = 60;

export const isLevel = (x: unknown): x is Level => typeof x === 'string' && (LEVELS as string[]).includes(x);

/** Уровень из сохранения, настроек или базы сервера. До 0.5.0 был седьмой уровень `strong` (тогда «Сильный»);
 *  его слили с `master` (#15) — старые записи с ним открываются за `master`. Номера уровней вечные:
 *  `strong` больше не выдаётся, но читается. Названия для игрока — только в `src/i18n` (#45: `experienced` —
 *  «Сильный», `master` — «Опытный», `neural` — «Мастер»). */
export function levelOf(x: unknown): Level | null {
  if (x === 'strong') return 'master';
  return isLevel(x) ? x : null;
}

/** Уровни ботов стола по местам (место 1, 2, …) → один уровень, если он у всех, иначе `null` («разные»). */
export function oneLevel(levels: readonly Level[]): Level | null {
  return levels.length > 0 && levels.every(l => l === levels[0]) ? levels[0] : null;
}

/** Уровни ботов из сохранения или истории: список по местам `1 … seats − 1`, каждый читается `levelOf`;
 *  не тот размер или чужое слово — `null`. */
export function levelsOf(x: unknown, bots: number): Level[] | null {
  if (!Array.isArray(x) || x.length !== bots || bots < 1) return null;
  const out = x.map(levelOf);
  return out.every((l): l is Level => l !== null) ? out : null;
}

/** Размышление уровня кусками (`think.ts`): для приложения — `thinkSliced`, для арены — `thinkSync`. */
export function think(o: Observation, level: Level, rng: Rng): Thinking<Action> {
  // сеть рвёт круг сама (`netThink`) — так уровень в игре ходит ровно как бот `net:` арены и самоигры
  if (level === NET_LEVEL) return neuralThink(o, rng);
  // круг: в концовке оба могут брать карты друг друга без конца. После LOOP_BOUT отбоев бот иногда
  // ходит наугад среди законных — так круг рвётся, а партия кончается (docs/10-bot.md, «Круг»)
  if (o.bout >= LOOP_BOUT && rng.next() < 0.25) {
    const legal = legalFor(o);
    const pick = legal[rng.int(legal.length)];
    return (function* () { return pick; })();
  }
  const s = SEARCH[level];
  if (s) return searchThink(o, s, rng);
  const p = RULES[level]!;
  return (function* () { return chooseByRules(o, p, rng); })();
}

/** «Мастер»: сначала сеть из сборки (кусками, один раз за запуск игры), потом `netThink`. Если время вышло раньше,
 *  чем сеть раскодирована, — ход «Среднего» (правила доигрывания); раскодировка продолжится в следующем решении. */
function* neuralThink(o: Observation, rng: Rng): Thinking<Action> {
  const net = yield* loadMaster();
  if (!net) return chooseByRules(o, ROLLOUT, rng);
  return yield* netThink(o, net, NET_PARAMS, rng);
}

/** Действие бота уровня `level` по наблюдению своего места — синхронно, до конца бюджета раскладов. */
export function chooseAction(o: Observation, level: Level, rng: Rng): Action {
  return thinkSync(think(o, level, rng));
}

export { legalFor, unseen } from './legal';
export { makeRng } from './rng';
export type { Rng } from './rng';
export { thinkSync } from './think';
export type { Thinking } from './think';
export { isEndgame, solveActions } from './endgame';
export { adviseThink, ADVICE_MIN_SAMPLES, shownChance } from './search';
export type { Advice } from './search';
export { reviewThink, sameAction, gradeOf, whyOf, ERROR_PTS, INACCURATE_PTS, REVIEW_SAMPLES } from './review';
export type { Review, Decision, Grade, Why, Move } from './review';
