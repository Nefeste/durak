// «Замер» (спецификация 1.0, §4, §8, критерий 9; docs/06-testing.md, «Замер»): сцены для настоящего стола и
// сводка кадров. Сцены — наблюдения, из которых раскладка (src/render/layout.ts) строит стол: раздача
// вчетвером (все 36 карт на столе), «беру» с 12 картами (стол уходит в вашу руку) и все 36 карт в полёте разом
// (стол зеркально, туда и обратно). Позиции для «Мастера» — из партий «Среднего» против себя, как в
// tools/hermes/bots.ts. Без React и часов — проверяется тестом (tools/test/bench.test.ts).
import { apply, newGame, observe, RULES_V1 } from '../engine';
import type { Card, Observation } from '../engine';
import { chooseAction, isEndgame, makeRng } from '../bot';
import { actorOf } from '../bot/sim';
import type { Layout } from '../render/layout';

/** Колода из чисел `rng`: Фишер — Йетс (для замера, не для игры). */
function deckOf(rng: { int(n: number): number }): Card[] {
  const d = Array.from({ length: 36 }, (_, i) => i);
  for (let i = 35; i > 0; i--) { const j = rng.int(i + 1); const t = d[i]; d[i] = d[j]; d[j] = t; }
  return d;
}

/** Раздача вчетвером глазами места 0: 6 своих карт лицом, 18 рубашкой у соперников, 12 в колоде. */
export function dealScene(seed = 7): Observation {
  return observe(newGame({ rules: RULES_V1, variant: 'podkidnoy', seats: 4, first: 1 }, deckOf(makeRng(seed))), 0);
}

/**
 * «Беру» с 12 картами: вдвоём, вы отбиваетесь, на столе шесть пар; после — все двенадцать у вас в руке.
 * Карты стола взяты из колоды, чтобы рука и колода остались честными по числу.
 */
export function takeScene(seed = 11): { before: Observation; after: Observation } {
  const o = observe(newGame({ rules: RULES_V1, variant: 'podkidnoy', seats: 2, first: 1 }, deckOf(makeRng(seed))), 0);
  // карты стола — из тех, которых место не видит: колода без козыря
  const shown = new Set([...o.hand, o.trump]);
  const free = Array.from({ length: 36 }, (_, c) => c).filter(c => !shown.has(c)).slice(0, 12);
  const table: [Card, Card | null][] = Array.from({ length: 6 }, (_, i) => [free[2 * i], free[2 * i + 1]]);
  const before: Observation = { ...o, table, talonSize: o.talonSize - 12, attacker: 1, defender: 0, bout: 1 };
  const after: Observation = {
    ...before, table: [], hand: [...o.hand, ...free].sort((a, b) => a - b),
    handSizes: before.handSizes.map((n, s) => (s === 0 ? n + 12 : n)),
  };
  return { before, after };
}

/** Тот же стол зеркально по ширине сукна: каждая карта меняет место — все разом летят. */
export function mirrored(l: Layout): Layout {
  const mx = (x: number) => 2 * l.felt.x + l.felt.w - x;
  return { ...l, sprites: l.sprites.map(s => ({ ...s, x: mx(s.x), rot: -s.rot })) };
}

/** Позиции, где решает бот: из `games` партий «Среднего» против себя вдвоём, каждая четвёртая, без точной концовки. */
export function botPositions(n: number, games = 6): Observation[] {
  const rng = makeRng(42);
  const out: Observation[] = [];
  for (let g = 0; g < games && out.length < n; g++) {
    let s = newGame({ rules: RULES_V1, variant: g % 2 ? 'perevodnoy' : 'podkidnoy', seats: 2, first: 0 }, deckOf(rng));
    let k = 0;
    while (s.phase !== 'end') {
      const who = actorOf(s);
      const o = observe(s, who);
      if (k++ % 4 === 0 && !isEndgame(o) && out.length < n) out.push(o);
      s = apply(s, who, chooseAction(o, 'average', rng));
    }
  }
  return out;
}

export interface FrameSummary {
  /** Кадров. */
  n: number;
  /** Медиана, мс. */
  p50: number;
  p95: number;
  /** Доля кадров дольше 25 мс, %. */
  long: number;
  /** Самый долгий, мс. */
  worst: number;
}

/** Сводка длительностей кадров, мс (как `frameSummary` «Узоров»; порог 25 мс — устав, ADR 0023). */
export function frameSummary(a: readonly number[]): FrameSummary {
  if (!a.length) return { n: 0, p50: 0, p95: 0, long: 0, worst: 0 };
  const s = [...a].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return {
    n: s.length,
    p50: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2,
    p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))],
    long: (s.filter(x => x > 25).length * 100) / s.length,
    worst: s[s.length - 1],
  };
}

/** Медиана и наибольшее, мс. */
export function msSummary(a: readonly number[]): { n: number; p50: number; worst: number } {
  const f = frameSummary(a);
  return { n: f.n, p50: f.p50, worst: f.worst };
}

/** Проходит ли сцена бюджет спецификации: 60 к/с по медиане (≤ 16,7 мс) и долгих кадров не больше 1 %. */
export const withinBudget = (f: FrameSummary): boolean => f.n > 0 && f.p50 <= 1000 / 60 + 0.05 && f.long <= 1;
