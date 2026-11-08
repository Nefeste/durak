// Поиск по раскладам (PIMC, docs/10-bot.md, «Как устроен»): бот раскладывает невидимые карты по рукам
// соперников и прикупу всеми способами, которые не противоречат наблюдению, на каждом раскладе доигрывает
// партию после каждого своего действия и выбирает действие с лучшим средним исходом. Вход — только
// наблюдение (ADR 0005); случайность — свой генератор с зерном, не колода.
import { apply, rankOf, stateFrom, suitOf } from '../engine';
import type { Action, Card, Observation } from '../engine';
import { isEndgame, solveThink } from './endgame';
import { layout, legalFor, unseen } from './legal';
import { makeRng } from './rng';
import type { Rng } from './rng';
import { chooseByRules, costOf } from './rules';
import { ROLLOUT, rollout } from './sim';
import type { Thinking } from './think';

export interface SearchParams {
  /** Сколько раскладов самое большее. */
  samples: number;
  /** Точная концовка вдвоём: бюджет узлов перебора (0 — не решать). */
  endgame: number;
}

export const same = (a: Action, b: Action) => JSON.stringify(a) === JSON.stringify(b);

/** Действия, которые стоит считать: из наборов одного достоинства — по одной карте и весь набор;
 *  первым — то, что выбрал бы «Средний» (при равенстве побеждает он: игра похожа на человеческую). */
export function candidates(o: Observation, legal: Action[], rng: Rng): Action[] {
  const ts = suitOf(o.trump);
  const keep = legal.filter(a => {
    if (a.type !== 'attack' && a.type !== 'transfer') return true;
    if (a.cards.length === 1) return true;
    const group = o.hand.filter(c => rankOf(c) === rankOf(a.cards[0]));
    const plain = (cs: Card[]) => cs.filter(c => suitOf(c) !== ts);
    // весь набор или весь некозырный набор
    return a.cards.length === group.length || a.cards.length === plain(group).length;
  });
  const rule = chooseByRules(o, ROLLOUT, rng, legal);
  const out = [rule, ...keep.filter(a => !same(a, rule))];
  // дешёвые — раньше: при равном счёте бот бережёт старшие карты
  const price = (a: Action) => (a.type === 'beat' ? costOf(a.card, ts) : 'cards' in a ? a.cards.reduce((s, c) => s + costOf(c, ts), 0) : 0);
  return [out[0], ...out.slice(1).sort((x, y) => price(x) - price(y))];
}

function shuffle(xs: Card[], rng: Rng): Card[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Scored { action: Action; score: number; samples: number }

/** Оценки действий по раскладам: `yield` после каждого расклада, `true` в ответ — хватит. */
export function* scoreActions(o: Observation, samples: number, rng: Rng, legal: Action[] = legalFor(o), include?: Action): Thinking<Scored[]> {
  const cands = candidates(o, legal, rng);
  // разбор оценивает и действие игрока, даже если поиск его сам не перебирал бы (часть набора)
  if (include && !cands.some(a => same(a, include))) cands.push(include);
  const sum = new Array<number>(cands.length).fill(0);
  const pool = unseen(o);
  let n = 0;
  if (cands.length > 1) {
    while (n < samples) {
      const { hidden, talon } = layout(o, shuffle(pool, rng));
      const s = stateFrom(o, hidden, talon);
      const seed = rng.int(2 ** 31);
      // одно зерно доигрывания на все действия — сравнение честнее (общие случайные числа). Порция
      // работы — одно доигрывание (на телефоне — единицы миллисекунд), а не весь расклад: так кусок
      // укладывается в 12 мс; прерванный на середине расклад не считается
      const part = new Array<number>(cands.length).fill(0);
      let stopped = false;
      for (let i = 0; i < cands.length; i++) {
        part[i] = rollout(apply(s, o.seat, cands[i]), o.seat, makeRng(seed));
        if (i + 1 < cands.length && (yield)) { stopped = true; break; }
      }
      if (stopped) break;
      for (let i = 0; i < cands.length; i++) sum[i] += part[i];
      n++;
      if (n < samples && (yield)) break;
    }
  }
  return cands.map((action, i) => ({ action, score: n ? sum[i] / n : 0, samples: n }));
}

/** Лучшее из оценённых; при равенстве — раньше в списке. */
export const best = (xs: Scored[]): Scored => xs.reduce((b, x) => (x.score > b.score + 1e-9 ? x : b));

/** Решение уровня с поиском: сначала точная концовка (если умеет и успевает), иначе — расклады. */
export function* searchThink(o: Observation, p: SearchParams, rng: Rng): Thinking<Action> {
  const legal = legalFor(o);
  if (legal.length === 0) throw new Error('bot has no legal action');
  if (legal.length === 1) return legal[0];
  const rule = chooseByRules(o, ROLLOUT, rng, legal);
  if (p.endgame > 0 && isEndgame(o)) {
    // кусками: `yield` из решателя; «хватит» во время расчёта — сразу ход по правилам
    let stopped = false;
    const solving = solveThink(o, p.endgame);
    let r = solving.next();
    while (!r.done) {
      const stop = yield;
      if (stop) { stopped = true; break; }
      r = solving.next(false);
    }
    if (stopped) return rule;
    const solved = r.value;
    if (solved) {
      const top = Math.max(...solved.map(x => x.value));
      const winners = solved.filter(x => x.value === top).map(x => x.action);
      // доказанный выигрыш — среди выигрывающих то, что выбрал бы «Средний», иначе самое дешёвое. Ничья по
      // кругу (0,5) или проигрыш при лучшей игре — не повод: живой соперник ошибается, поэтому — по раскладам
      if (top === 1) return winners.find(a => same(a, rule)) ?? candidates(o, winners, rng)[0];
    }
  }
  // в концовке скрытых карт нет: все расклады одинаковы, хватит одного
  const scored = yield* scoreActions(o, isEndgame(o) ? 1 : p.samples, rng, legal);
  return best(scored).action;
}

/** Совет игроку («Подсказка», docs/09-game-design.md): что сделал бы «Мастер» и его шанс выйти без
 *  карт. В концовке вдвоём — точный расчёт (`exact`), иначе — доля раскладов, где действие ведёт к
 *  выходу. Работает по наблюдению игрока — бот за столом этих расчётов не видит. */
export interface Advice { action: Action; chance: number | null; exact: boolean }

export function* adviseThink(o: Observation, rng: Rng, samples = 128, budget = 15_000): Thinking<Advice> {
  const legal = legalFor(o);
  if (legal.length === 1) return { action: legal[0], chance: null, exact: false };
  if (isEndgame(o)) {
    const solving = solveThink(o, budget);
    let r = solving.next();
    while (!r.done) r = solving.next(yield);
    if (r.value) {
      const top = r.value.reduce((b, x) => (x.value > b.value ? x : b));
      return { action: top.action, chance: top.value, exact: true };
    }
  }
  const scored = yield* scoreActions(o, isEndgame(o) ? 1 : samples, rng, legal);
  const b = best(scored);
  return { action: b.action, chance: b.score, exact: false };
}
