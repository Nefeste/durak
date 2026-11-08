// Уровни ботов (docs/10-bot.md, «Уровни»): четыре — по правилам, три — поиск по раскладам; «Сильный» и
// «Мастер» решают концовку вдвоём точно. Вход у всех — только наблюдение места (ADR 0005).
import type { Action, Observation } from '../engine';
import { legalFor } from './legal';
import { chooseByRules } from './rules';
import type { RuleParams } from './rules';
import type { Rng } from './rng';
import { searchThink } from './search';
import type { SearchParams } from './search';
import { thinkSync } from './think';
import type { Thinking } from './think';

export type Level = 'novice' | 'beginner' | 'amateur' | 'average' | 'experienced' | 'strong' | 'master';

export const LEVELS: Level[] = ['novice', 'beginner', 'amateur', 'average', 'experienced', 'strong', 'master'];
export const RULE_LEVELS: Level[] = ['novice', 'beginner', 'amateur', 'average'];
export const SEARCH_LEVELS: Level[] = ['experienced', 'strong', 'master'];

const RULES: Partial<Record<Level, RuleParams>> = {
  novice: { random: 0.6, saveTrumps: false, pressure: false },
  beginner: { random: 0.3, saveTrumps: false, pressure: false },
  amateur: { random: 0.12, saveTrumps: true, pressure: false },
  average: { random: 0, saveTrumps: true, pressure: true },
};

export const SEARCH: Partial<Record<Level, SearchParams>> = {
  experienced: { samples: 4, endgame: 0 },
  strong: { samples: 32, endgame: 8_000 },
  master: { samples: 128, endgame: 15_000 },
};

/** Сколько уровень думает самое большее в приложении, мс (docs/10-bot.md, «Скорость»): на медленном
 *  телефоне бот чуть слабее, а не медленнее. В арене бюджет — число раскладов, а не время. */
export const THINK_MS: Record<Level, number> = {
  novice: 50, beginner: 50, amateur: 50, average: 50, experienced: 300, strong: 1000, master: 1500,
};

/** С какого отбоя партии бот рвёт круг (обычная партия вдвоём — 15–25 отбоев). */
export const LOOP_BOUT = 60;

export const isLevel = (x: unknown): x is Level => typeof x === 'string' && (LEVELS as string[]).includes(x);

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
