// Уровни ботов (docs/10-bot.md, «Уровни»): четыре — по правилам, два — поиск по раскладам; «Мастер» решает
// концовку вдвоём точно. Седьмое место — «Нейросеть», закрыто, пока её нет (решение владельца #15).
// Вход у всех — только наблюдение места (ADR 0005).
import type { Action, Observation } from '../engine';
import { legalFor } from './legal';
import { chooseByRules } from './rules';
import type { RuleParams } from './rules';
import type { Rng } from './rng';
import { searchThink } from './search';
import type { SearchParams } from './search';
import { thinkSync } from './think';
import type { Thinking } from './think';

export type Level = 'novice' | 'beginner' | 'amateur' | 'average' | 'experienced' | 'master';

export const LEVELS: Level[] = ['novice', 'beginner', 'amateur', 'average', 'experienced', 'master'];
export const RULE_LEVELS: Level[] = ['novice', 'beginner', 'amateur', 'average'];
export const SEARCH_LEVELS: Level[] = ['experienced', 'master'];
/** Сильнейший уровень: подсказка, разбор, бот за отключившегося онлайн. */
export const TOP: Level = 'master';
/** Седьмое место в меню — закрыто: откроется вместе с нейросетью (docs/10-bot.md, «Нейросеть»). Не
 *  продаётся и ничем не открывается, кроме новой версии игры: сила за деньги не продаётся (устав). */
export const LOCKED_LEVEL = 'neural' as const;

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
  novice: 50, beginner: 50, amateur: 50, average: 50, experienced: 300, master: 1500,
};

/** С какого отбоя партии бот рвёт круг (обычная партия вдвоём — 15–25 отбоев). */
export const LOOP_BOUT = 60;

export const isLevel = (x: unknown): x is Level => typeof x === 'string' && (LEVELS as string[]).includes(x);

/** Уровень из сохранения, настроек или базы сервера. До 0.5.0 был седьмой уровень `strong` («Сильный»);
 *  его слили с «Мастером» (#15) — старые записи с ним открываются за «Мастером». Номера уровней вечные:
 *  `strong` больше не выдаётся, но читается. */
export function levelOf(x: unknown): Level | null {
  if (x === 'strong') return 'master';
  return isLevel(x) ? x : null;
}

/** Размышление уровня кусками (`think.ts`): для приложения — `thinkSliced`, для арены — `thinkSync`. */
export function think(o: Observation, level: Level, rng: Rng): Thinking<Action> {
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
export { adviseThink } from './search';
export type { Advice } from './search';
export { reviewThink, sameAction, gradeOf, whyOf, ERROR_PTS, INACCURATE_PTS, REVIEW_SAMPLES } from './review';
export type { Review, Decision, Grade, Why, Move } from './review';
