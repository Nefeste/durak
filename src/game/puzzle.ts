// Задача дня (docs/09-game-design.md, «Задача дня»; docs/10-bot.md, «Задача дня»): позиция концовки вдвоём, колода
// пуст, все карты известны. Спасает ровно одно первое действие — это проверил точный расчёт при сборке набора
// (`tools/puzzles/collect.ts`). Здесь — чистая часть: позиция из записи, задача на день, проверка хода игрока.
import { apply, legalActions, RULES_V1 } from '../engine';
import type { Action, Card, Phase, State, Variant } from '../engine';
import { solver } from '../bot/endgame';

export interface Puzzle {
  /** Номер — вечный; новые задачи — только в конец набора. */
  id: number;
  variant: Variant;
  /** За кого играет игрок (место в позиции). */
  you: number;
  hands: Card[][];
  trump: Card;
  table: [Card, Card | null][];
  discard: Card[];
  openly: Card[][];
  starter: number;
  attacker: number;
  defender: number;
  passed: boolean[];
  boutLimit: number;
  bout: number;
  phase: Phase;
  /** Единственное спасающее первое действие. */
  answer: Action;
  /** Своих решений на лучшем пути (не меньше трёх). */
  plies: number;
  /** Сложность: сколько правдоподобных неверных первых действий (что выбрал бы «Средний» и т. п.). */
  hard: number;
}

/** Первый день набора; задача дня номер N — `SET[(N − 1) mod длина]`. */
export const START_DAY = '2026-11-09';

export function stateOf(p: Puzzle): State {
  return {
    rules: RULES_V1, variant: p.variant, seats: 2, hands: p.hands.map(h => [...h]), talon: [], trump: p.trump,
    table: p.table.map(([a, d]) => [a, d] as [Card, Card | null]), discard: [...p.discard], openly: p.openly.map(o => [...o]),
    starter: p.starter, attacker: p.attacker, defender: p.defender, passed: [...p.passed], boutLimit: p.boutLimit,
    bout: p.bout, out: [], resigned: [], buried: [], phase: p.phase, result: null,
  };
}

/** Номер дня от первого дня набора по местной дате `ГГГГ-ММ-ДД` (1 — первый день). */
export function dayNumber(date: string): number {
  const ms = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd); };
  return Math.max(1, Math.round((ms(date) - ms(START_DAY)) / 86_400_000) + 1);
}

export function puzzleFor<P>(set: readonly P[], day: number): P {
  return set[(day - 1) % set.length];
}

/** Значение позиции для игрока после его действия: 1 — спасает, иначе — нет (лучшая защита соперника). */
export function valueAfter(p: Puzzle, s: State, action: Action, budget = 200_000): number {
  return solver(p.you, budget).value(apply(s, p.you, action));
}

/** Лучший ответ соперника: действие, после которого значение для игрока наименьшее. */
export function replyOf(p: Puzzle, s: State, who: number, legal: Action[], budget = 200_000): Action {
  const sv = solver(p.you, budget);
  let best = legal[0], bestV = Infinity;
  for (const a of legal) {
    const v = sv.value(apply(s, who, a));
    if (v < bestV) { bestV = v; best = a; }
  }
  return best;
}

/**
 * «Ответ» в любой момент (docs/09-game-design.md, «Задача дня»): спасающее действие игрока в этой позиции — в начале
 * это `p.answer`, дальше — первое по порядку законных, после которого точный расчёт говорит «выходит». `null` — ход
 * не игрока, партия кончилась или спасения уже нет (игрок ошибся раньше).
 */
export function answerOf(p: Puzzle, s: State, budget = 200_000): Action | null {
  if (s.phase === 'end') return null;
  const legal = legalActions(s, p.you);
  if (legal.length === 0) return null;
  const sv = solver(p.you, budget);
  for (const a of legal) if (sv.value(apply(s, p.you, a)) >= 1) return a;
  return null;
}
