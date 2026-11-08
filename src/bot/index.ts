// Уровни ботов (docs/10-bot.md, «Уровни»). Этап А — четыре уровня по правилам; «Опытный»,
// «Сильный» и «Мастер» — поиск по раскладам, этап Б.
import type { Action, Observation } from '../engine';
import { chooseByRules } from './rules';
import type { RuleParams } from './rules';
import type { Rng } from './rng';

export type Level = 'novice' | 'beginner' | 'amateur' | 'average';

export const LEVELS: Level[] = ['novice', 'beginner', 'amateur', 'average'];

const PARAMS: Record<Level, RuleParams> = {
  novice: { random: 0.5, saveTrumps: false, pressure: false },
  beginner: { random: 0.2, saveTrumps: false, pressure: false },
  amateur: { random: 0.05, saveTrumps: true, pressure: false },
  average: { random: 0, saveTrumps: true, pressure: true },
};

export const isLevel = (x: unknown): x is Level => typeof x === 'string' && (LEVELS as string[]).includes(x);

/** Действие бота уровня `level` по наблюдению своего места. Генератор — снаружи. */
export function chooseAction(o: Observation, level: Level, rng: Rng): Action {
  return chooseByRules(o, PARAMS[level], rng);
}

export { legalFor, unseen } from './legal';
export { makeRng } from './rng';
export type { Rng } from './rng';
