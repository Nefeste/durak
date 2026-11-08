// Разбор партии (docs/10-bot.md, «Разбор»): каждое решение игрока, у которого был выбор, сравнивается с лучшим.
// В концовке вдвоём — точный расчёт; до неё — шанс не остаться с картами по раскладам. Разбор видит только
// наблюдение игрока в ту минуту (ADR 0005): чужие карты он подставляет так же, как бот, — расклады.
import { apply, legalActions, newGame, observe, suitOf } from '../engine';
import type { Action, Card, GameRecord, Observation } from '../engine';
import { isEndgame, solveThink } from './endgame';
import { makeRng } from './rng';
import { best, scoreActions } from './search';
import type { Thinking } from './think';

/** Падение шанса (в процентных пунктах), с которого решение — «ошибка» и «неточно» (docs/10-bot.md). */
export const ERROR_PTS = 15;
export const INACCURATE_PTS = 5;
/** Раскладов на решение и бюджет узлов точной концовки. */
export const REVIEW_SAMPLES = 256;
export const REVIEW_BUDGET = 15_000;

export type Grade = 'ok' | 'inaccurate' | 'error';

/** Одна строка «почему» — только при своём условии; ни одно не подошло — `better`. */
export type Why =
  | { kind: 'exactLoses' }                              // точно: был выигрыш, ход его отдал
  | { kind: 'trumpWasted'; card: Card; on: Card; plain: Card } // покрыли некозырную козырем, хотя била масть
  | { kind: 'tookCouldBeat'; card: Card; on: Card }     // взяли, хотя отбивались
  | { kind: 'transferToFewer' }                         // перевели на того, у кого карт меньше, чем у вас
  | { kind: 'noThrow'; cards: Card[] }                  // не подкинули, когда было что
  | { kind: 'better' };

export interface Decision {
  /** Номер действия в записи партии. */
  at: number;
  bout: number;
  played: Action;
  best: Action;
  grade: Grade;
  /** Точный расчёт концовки — `value` 1 / 0,5 / 0; иначе — доля раскладов, где не остались с картами. */
  exact: boolean;
  bestChance: number;
  playedChance: number;
  /** Падение в процентных пунктах (у точного — 100 за выигрыш → проигрыш). */
  loss: number;
  why: Why;
}

export interface Review { seat: number; decisions: Decision[]; worst: Decision | null }

const isTrump = (c: Card, ts: number) => suitOf(c) === ts;
const norm = (a: Action): string => JSON.stringify('cards' in a ? { ...a, cards: [...a.cards].sort((x, y) => x - y) } : a);
export const sameAction = (a: Action, b: Action): boolean => norm(a) === norm(b);

export function gradeOf(loss: number): Grade {
  return loss >= ERROR_PTS ? 'error' : loss >= INACCURATE_PTS ? 'inaccurate' : 'ok';
}

/** Строка «почему» по условиям (порядок — от самого конкретного). */
export function whyOf(o: Observation, played: Action, bestA: Action, exact: boolean): Why {
  const ts = suitOf(o.trump);
  if (played.type === 'beat' && bestA.type === 'beat' && isTrump(played.card, ts) && !isTrump(played.on, ts) && !isTrump(bestA.card, ts)) {
    return { kind: 'trumpWasted', card: played.card, on: played.on, plain: bestA.card };
  }
  if (played.type === 'take' && bestA.type === 'beat') return { kind: 'tookCouldBeat', card: bestA.card, on: bestA.on };
  if (played.type === 'transfer' && bestA.type !== 'transfer') {
    const next = (o.defender + 1) % o.seats;
    if (o.handSizes[next] < o.hand.length) return { kind: 'transferToFewer' };
  }
  if (played.type === 'pass' && (bestA.type === 'throwIn' || bestA.type === 'give' || bestA.type === 'attack')) return { kind: 'noThrow', cards: bestA.cards };
  if (exact) return { kind: 'exactLoses' };
  return { kind: 'better' };
}

/** Разбор решений места `seat` — кусками (`yield` после каждой порции поиска). */
export function* reviewThink(r: GameRecord, seat: number, samples = REVIEW_SAMPLES, budget = REVIEW_BUDGET, seed = 1): Thinking<Review> {
  let s = newGame({ rules: r.rules, variant: r.variant, seats: r.seats, first: r.first }, r.deck);
  const decisions: Decision[] = [];
  for (let i = 0; i < r.actions.length; i++) {
    const { seat: who, action } = r.actions[i];
    if (who === seat) {
      const legal = legalActions(s, seat);
      if (legal.length > 1) {
        const o = observe(s, seat);
        const d = yield* judge(o, legal, action, i, samples, budget, seed + i);
        if (d) decisions.push(d);
      }
    }
    s = apply(s, who, action);
  }
  const worst = decisions.filter(d => d.grade !== 'ok').reduce<Decision | null>((w, d) => (!w || d.loss > w.loss ? d : w), null);
  return { seat, decisions, worst };
}

function* judge(o: Observation, legal: Action[], played: Action, at: number, samples: number, budget: number, seed: number): Thinking<Decision | null> {
  if (isEndgame(o)) {
    const solved = yield* solveThink(o, budget);
    if (solved) {
      const mine = solved.find(x => sameAction(x.action, played));
      const top = solved.reduce((b, x) => (x.value > b.value ? x : b));
      if (mine) {
        const loss = Math.round((top.value - mine.value) * 100);
        const bestA = loss > 0 ? top.action : played;
        return {
          at, bout: o.bout, played, best: bestA, grade: loss > 0 ? 'error' : 'ok', exact: true,
          bestChance: top.value, playedChance: mine.value, loss,
          why: loss > 0 ? whyOf(o, played, bestA, true) : { kind: 'better' },
        };
      }
    }
  }
  const rng = makeRng(seed);
  const scored = yield* scoreActions(o, isEndgame(o) ? 1 : samples, rng, legal, played);
  const top = best(scored);
  const mine = scored.find(x => sameAction(x.action, played));
  if (!mine) return null;
  const loss = Math.max(0, Math.round((top.score - mine.score) * 100));
  const grade = gradeOf(loss);
  const bestA = grade === 'ok' ? played : top.action;
  return {
    at, bout: o.bout, played, best: bestA, grade, exact: false,
    bestChance: top.score, playedChance: mine.score, loss,
    why: grade === 'ok' ? { kind: 'better' } : whyOf(o, played, bestA, false),
  };
}
