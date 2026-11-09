// Бот на сети (седьмой уровень, `neural`, docs/specs/2026-11-neural.md, «Как сеть играет»). Вход — только наблюдение
// места (ADR 0005): невидимые карты бот раскладывает сам (`layout`, как поиск по раскладам), на каждом раскладе делает
// своё действие, доигрывает отбой правилами «Среднего» (`decideFast`) и оценивает сетью то, что увидит потом. В концовке
// вдвоём — точный расчёт, как у «Опытного». Случайность — свой генератор с зерном, не колода.
import { applyInPlace, cloneState, observe, stateFrom } from '../../engine';
import type { Action, Card, Observation, State } from '../../engine';
import { isEndgame, solveThink } from '../endgame';
import { actorFast, decideFast } from '../fast';
import { layout, legalFor, unseen } from '../legal';
import { makeRng } from '../rng';
import type { Rng } from '../rng';
import { chooseByRules } from '../rules';
import { candidates, same } from '../search';
import { ROLLOUT, outcome } from '../sim';
import type { Thinking } from '../think';
import { features } from './features';
import type { Net } from './model';
import { valueOf } from './model';

export interface NetParams {
  /** Раскладов на решение (самое большее; в приложении бюджет — ещё и время). */
  samples: number;
  /** `now` — оценить сразу после своего действия; `bout` — доиграть отбой правилами «Среднего» и оценить после. */
  horizon: 'now' | 'bout';
  /** Точная концовка вдвоём: бюджет узлов (0 — не решать). */
  endgame: number;
}

/** Параметры уровня по умолчанию (замер скорости — в спецификации). */
export const NET_PARAMS: NetParams = { samples: 24, horizon: 'bout', endgame: 15_000 };

/** С какого отбоя рвать круг — как `LOOP_BOUT` уровней (docs/10-bot.md, «Круг»). */
const LOOP_BOUT = 60;

/** Оценка места `seat` в позиции `s`: исход, если партия кончилась или место вышло; иначе — сеть по наблюдению. */
export function valueAt(net: Net, s: State, seat: number, x?: Float32Array): number {
  if (s.phase === 'end') return outcome(s, seat);
  if (s.out.includes(seat)) return 1;
  return valueOf(net, features(observe(s, seat), x));
}

function shuffle(xs: Card[], rng: Rng): Card[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface NetScored { action: Action; score: number }

/** Оценки действий-кандидатов (`candidates` поиска: первым — выбор «Среднего»). `yield` — после каждого расклада. */
export function* netScores(o: Observation, net: Net, p: NetParams, rng: Rng, legal: Action[] = legalFor(o)): Thinking<{ scored: NetScored[]; samples: number }> {
  const cands = candidates(o, legal, rng);
  const sum = new Array<number>(cands.length).fill(0);
  const x = new Float32Array(net.sizes[0]);
  const pool = unseen(o);
  // в концовке скрытых карт нет: все расклады одинаковы
  const samples = isEndgame(o) ? 1 : Math.max(1, p.samples);
  // `now`: если действие не кончило отбой, наблюдение после него одно на всех раскладах — считается один раз
  const fixed: (number | null)[] = new Array<number | null>(cands.length).fill(null);
  let n = 0;
  while (n < samples) {
    const { hidden, talon } = layout(o, shuffle(pool, rng));
    const base = stateFrom(o, hidden, talon);
    const seed = rng.int(2 ** 31);
    for (let i = 0; i < cands.length; i++) {
      const known = fixed[i];
      if (known !== null) { sum[i] += known; continue; }
      const s = cloneState(base);
      applyInPlace(s, o.seat, cands[i]);
      if (p.horizon === 'bout') {
        const r = makeRng(seed);
        for (let step = 0; step < 200 && s.phase !== 'end' && s.bout === o.bout; step++) {
          const who = actorFast(s);
          if (who < 0) break;
          applyInPlace(s, who, decideFast(s, who, r));
        }
      }
      const v = valueAt(net, s, o.seat, x);
      if (p.horizon === 'now' && s.phase !== 'end' && s.bout === o.bout) fixed[i] = v;
      sum[i] += v;
    }
    n++;
    if (n < samples && (yield)) break;
  }
  return { scored: cands.map((action, i) => ({ action, score: sum[i] / n })), samples: n };
}

const top = (xs: NetScored[]): NetScored => xs.reduce((b, x) => (x.score > b.score + 1e-9 ? x : b));

/** Решение бота на сети кусками (`think.ts`). */
export function* netThink(o: Observation, net: Net, p: NetParams, rng: Rng): Thinking<Action> {
  const legal = legalFor(o);
  if (legal.length === 0) throw new Error('bot has no legal action');
  if (legal.length === 1) return legal[0];
  if (o.bout >= LOOP_BOUT && rng.next() < 0.25) return legal[rng.int(legal.length)];
  if (p.endgame > 0 && isEndgame(o)) {
    const rule = chooseByRules(o, ROLLOUT, rng, legal);
    const solving = solveThink(o, p.endgame);
    let r = solving.next();
    while (!r.done) {
      if (yield) return rule;
      r = solving.next(false);
    }
    const solved = r.value;
    if (solved) {
      const best = Math.max(...solved.map(x => x.value));
      const winners = solved.filter(x => x.value === best).map(x => x.action);
      // доказанный выигрыш — как «Опытный»; ничья и проигрыш при лучшей игре — по сети: живой соперник ошибается
      if (best === 1) return winners.find(a => same(a, rule)) ?? candidates(o, winners, rng)[0];
    }
  }
  const { scored } = yield* netScores(o, net, p, rng, legal);
  return top(scored).action;
}
