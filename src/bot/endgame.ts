// Точный расчёт концовки вдвоём (docs/10-bot.md, «Точный расчёт концовки»). Когда колода пуста и в
// партии остались двое, скрытых карт нет: всё, чего нет у тебя, на столе и в сбросе, — у соперника.
// Это игра с полной информацией; её решает перебор с памятью позиций. Ходы — тем же порядком, что у
// стола (`actorOf`): действует первое место от ходящего, у которого есть законные действия.
import { apply, applyInPlace, cloneState, legalActions, stateFrom, suitOf } from '../engine';
import { costOf } from './rules';
import type { Action, Card, Observation, State } from '../engine';
import { layout, unseen } from './legal';
import { actorOf, outcome } from './sim';
import { thinkSync } from './think';
import type { Thinking } from './think';

/** Значение позиции для места: 1 — выходит, 0,5 — ничья, 0 — остаётся с картами. */
export type Value = 0 | 0.5 | 1;

export class TooDeep extends Error {
  constructor() {
    super('endgame: node budget exceeded');
  }
}

/** Двое в партии и колода пуста — концовка с полной информацией. Если кто-то сдался, его карты ушли из игры
 *  рубашкой вверх (docs/08-rules.md, п. 8.2): невидимые карты уже не все у соперника — точного расчёта нет. */
export function isEndgame(o: { talonSize: number; seats: number; out: number[]; phase: string; resigned?: number[] }): boolean {
  return o.phase !== 'end' && o.talonSize === 0 && o.seats - o.out.length === 2 && !o.resigned?.length;
}

/** Позиция концовки из наблюдения: все невидимые карты — у второго оставшегося. */
export function endgameState(o: Observation): State {
  const { hidden, talon } = layout(o, unseen(o));
  return stateFrom(o, hidden, talon);
}

const mask = (cs: Card[]) => cs.reduce((m, c) => m + 2 ** c, 0);

function keyOf(s: State): string {
  // порядок пар на столе вдвоём ничего не решает: подкидывает только ходящий, перевод — одного
  // достоинства; поэтому пары сортируются — так переставленные подкидывания и покрытия сходятся
  const t = s.table.map(([a, d]) => a * 37 + (d === null ? 36 : d)).sort((x, y) => x - y).join(',');
  return `${mask(s.hands[0])}|${mask(s.hands[1])}|${s.seats > 2 ? s.hands.map(mask).join('.') : ''}|${t}|${s.attacker}${s.defender}|${s.passed.map(Number).join('')}|${s.phase}|${s.boutLimit}|${s.bout === 0 ? 0 : 1}`;
}

export interface Solver {
  /** Значение позиции для места `me`; `TooDeep`, если перебор длиннее бюджета. */
  value(s: State): Value;
  nodes: number;
}

/** Действия для перебора. Атака и перевод — по одной карте: ходящий действует первым (`actorOf`), и
 *  набор одного достоинства ничем не лучше одной карты с тут же подкинутыми остальными — позиция та
 *  же. Это сокращает перебор, а точность держит тест сверкой с полным перебором всех действий.
 *  Порядок: дешёвые раньше, «беру» и «пас» — последними (раньше находится выигрыш — раньше отсечка). */
export function moves(s: State, who: number): Action[] {
  const ts = suitOf(s.trump);
  const price = (a: Action) => (a.type === 'take' || a.type === 'pass' || a.type === 'resign' ? 100
    : a.type === 'beat' ? costOf(a.card, ts) : costOf(a.cards[0], ts));
  return legalActions(s, who)
    .filter(a => (a.type !== 'attack' && a.type !== 'transfer') || a.cards.length === 1)
    .sort((x, y) => price(x) - price(y));
}

/** Повтор позиции. В дураке партия может ходить по кругу: оба берут карты друг друга и отдают их
 *  обратно. Правил о повторе нет; для расчёта круг — «никто не выигрывает» (0,5). Значения,
 *  которые зависели от такого круга, не запоминаются: они верны только на этом пути. */
const LOOP: Value = 0.5;

interface Frame { key: string; s: State; who: number; mine: boolean; moves: Action[]; i: number; best: Value; outer: boolean }

/** Общее для одного расчёта: память позиций и счёт узлов (бюджет — на весь расчёт). */
export interface Memo { values: Map<string, Value>; nodes: number; budget: number }

export const newMemo = (budget: number): Memo => ({ values: new Map(), nodes: 0, budget });

/** Значение позиции `root` для места `me` — перебор без рекурсии, кусками: `yield` каждые `every`
 *  узлов (`think.ts`), `true` в ответ — прервать (тогда `null`). `TooDeep` — бюджет узлов кончился. */
export function* valueOf(root: State, me: number, memo: Memo, every = 48): Thinking<Value | null> {
  const stack: Frame[] = [];
  const path = new Set<string>();
  let tainted = false;
  const enter = (s: State): Value | null => {
    if (s.phase === 'end') return outcome(s, me) as Value;
    const key = keyOf(s);
    const hit = memo.values.get(key);
    if (hit !== undefined) return hit;
    if (path.has(key)) { tainted = true; return LOOP; }
    if (++memo.nodes > memo.budget) throw new TooDeep();
    const who = actorOf(s);
    const mine = who === me;
    stack.push({ key, s, who, mine, moves: moves(s, who), i: 0, best: mine ? 0 : 1, outer: tainted });
    tainted = false;
    path.add(key);
    return null;
  };
  let ret = enter(root);
  if (ret !== null) return ret;
  let since = 0;
  while (stack.length > 0) {
    const f = stack[stack.length - 1];
    if (ret !== null) {
      if (f.mine ? ret > f.best : ret < f.best) f.best = ret;
      ret = null;
      if (f.best === (f.mine ? 1 : 0)) f.i = f.moves.length; // лучше не бывает — дальше не смотреть
    }
    if (f.i < f.moves.length) {
      const next = cloneState(f.s);
      applyInPlace(next, f.who, f.moves[f.i++]); // законно: из `legalActions`
      ret = enter(next);
      if (++since >= every) { since = 0; if (yield) return null; }
      continue;
    }
    stack.pop();
    path.delete(f.key);
    if (!tainted) memo.values.set(f.key, f.best);
    tainted = tainted || f.outer;
    ret = f.best;
  }
  return ret;
}

/** Решатель для места `me` с памятью позиций и бюджетом узлов — синхронно (тесты, арена). */
export function solver(me: number, budget = 400_000): Solver {
  const memo = newMemo(budget);
  return {
    get nodes() { return memo.nodes; },
    value: (s: State) => thinkSync(valueOf(s, me, memo)) as Value,
  };
}

export type Solved = { action: Action; value: Value }[];

/** Значение каждого законного действия места в концовке — кусками; `null`, если не концовка,
 *  бюджет узлов кончился или расчёт прервали. */
export function* solveThink(o: Observation, budget: number): Thinking<Solved | null> {
  if (!isEndgame(o)) return null;
  const s = endgameState(o);
  const memo = newMemo(budget);
  const out: Solved = [];
  try {
    for (const action of legalActions(s, o.seat)) {
      const v = yield* valueOf(apply(s, o.seat, action), o.seat, memo);
      if (v === null) return null;
      out.push({ action, value: v });
    }
  } catch (e) {
    if (e instanceof TooDeep) return null;
    throw e;
  }
  return out;
}

/** То же синхронно. */
export function solveActions(o: Observation, budget = 400_000): Solved | null {
  return thinkSync(solveThink(o, budget));
}

/** Перебор без памяти и без отсечений — эталон для проверки решателя на маленьких позициях;
 *  круг — так же 0,5. */
export function bruteValue(s: State, me: number, path: Set<string> = new Set()): Value {
  if (s.phase === 'end') return outcome(s, me) as Value;
  const key = keyOf(s);
  if (path.has(key)) return LOOP;
  path.add(key);
  const who = actorOf(s);
  const vals = legalActions(s, who).map(a => bruteValue(apply(s, who, a), me, path));
  path.delete(key);
  return (who === me ? Math.max(...vals) : Math.min(...vals)) as Value;
}
