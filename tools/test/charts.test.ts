// «Статистика» подробно и графиками (решение владельца 09.11.2026; docs/09-game-design.md, «Статистика»;
// docs/04-data-model.md, «Подробная статистика»): выведение чисел из записи партии, геометрия графиков и палитра.
// Палитра проверяется тем же счётом, что `validate_palette.js` навыка dataviz: OKLab (×100), нарушения цветового
// зрения — матрицы Machado, Oliveira, Fernandes (2009) при полной силе, контраст — WCAG 2.
import { describe, expect, test } from 'bun:test';
import { apply, newGame } from '../../src/engine';
import { LEVELS } from '../../src/bot';
import { normalizeHistory } from '../../src/state/history';
import type { FinishedGame } from '../../src/state/history';
import {
  avgOf, computeStats, ELO_LINE, factsOf, FORM_GAMES, LEVEL_ELO, ME, pairOf, placeOf, PLACES, RECENT, replayed, START_ELO, trumpsDealt, weekStart, WEEKS,
} from '../../src/state/stats';
import { barPath, cells, GAP, labelFits, ladderScale, neighbours, segments, sparkPoints } from '../../src/ui/charts/geometry';
import { C, CHART } from '../../src/ui/theme';
import { fakeHistory } from '../design/history';

const NOW = Date.UTC(2026, 10, 9, 12);
const games = fakeHistory(60, NOW, 7, 4);

describe('выведение из записи', () => {
  test('переигрывание: «беру» и переводы — по действиям места, козырей роздано не больше девяти, вышедшие без козырей', () => {
    for (const g of games) {
      const r = g.record, x = replayed(r);
      for (let seat = 0; seat < r.seats; seat++) {
        expect(x.takes[seat]).toBe(r.actions.filter(a => a.seat === seat && a.action.type === 'take').length);
        expect(x.transfers[seat]).toBe(r.actions.filter(a => a.seat === seat && a.action.type === 'transfer').length);
      }
      expect(x.trumps.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(9);
      expect(trumpsDealt(r)).toEqual(x.trumps);
      const final = r.actions.reduce((s, a) => apply(s, a.seat, a.action), newGame({ rules: r.rules, variant: r.variant, seats: r.seats, first: r.first }, r.deck));
      expect(x.bouts).toBe(final.bout);
      for (const o of final.out) expect(x.trumpsLeft[o]).toBe(0);
    }
  });

  test('место и «против бота»: дурак — позже всех, вдвоём «раньше» — это «первым», ничья — «вместе»', () => {
    for (const g of games) {
      const r = g.record, x = replayed(r), p = placeOf(r);
      if (r.result!.fool !== null) for (let s = 0; s < r.seats; s++) if (s !== r.result!.fool) expect(x.exitBout[s]).toBeLessThan(x.exitBout[r.result!.fool]);
      if (r.seats === 2) expect(pairOf(x, 1)).toBe(p === 'first' ? 'before' : p === 'fool' ? 'after' : 'together');
      if (p === 'fool') for (let b = 1; b < r.seats; b++) expect(pairOf(x, b)).toBe('after');
      if (p === 'draw') expect(r.result!.draw).toBe(true);
    }
  });

  test('сводка сходится: места, уровни стола, против уровней, недели, форма', () => {
    const st = computeStats(games, NOW);
    expect(PLACES.reduce((a, p) => a + st.places[p], 0)).toBe(games.length);
    expect(st.total).toMatchObject({ games: games.length, first: st.places.first, kept: st.places.fool, draws: st.places.draw });
    const byLevel = Object.values(st.byLevel).reduce((a, t) => a + t!.games, 0);
    expect(byLevel + st.mixed.games).toBe(games.length);
    expect(st.mixed.games).toBeGreaterThan(0);
    // против уровней — каждый бот каждого стола, и столы с разными уровнями тоже
    const bots = games.reduce((a, g) => a + g.record.seats - 1, 0);
    expect(Object.values(st.vsLevel).reduce((a, v) => a + v!.before + v!.together + v!.after, 0)).toBe(bots);
    expect(st.form).toHaveLength(FORM_GAMES);
    expect(st.form).toEqual(games.slice(-FORM_GAMES).map(g => placeOf(g.record)));
    expect(st.byWeek).toHaveLength(WEEKS);
    expect(st.byWeek[0].start).toBe(weekStart(NOW));
    for (let k = 1; k < WEEKS; k++) expect(st.byWeek[k - 1].start - st.byWeek[k].start).toBeGreaterThanOrEqual(167 * 3600_000);
    expect(st.byWeek.reduce((a, w) => a + w.tally.games, 0)).toBe(games.filter(g => g.end >= st.byWeek[WEEKS - 1].start).length);
    expect(st.reviewed).toBe(4);
    expect(st.avg.errors.n).toBe(4);
    expect(st.avg.transfers.n).toBe(games.filter(g => g.record.variant === 'perevodnoy').length);
    expect(st.avg.trumpsLeft.n).toBe(st.places.fool);
    expect(st.hinted).toBe(games.filter(g => g.hinted).length);
  });

  test('рейтинг по партиям: линия кончается рейтингом, изменение — за последнюю партию в счёте', () => {
    const st = computeStats(games, NOW);
    expect(st.eloLine.length).toBe(Math.min(ELO_LINE, st.eloGames));
    expect(st.eloLine[st.eloLine.length - 1]).toBe(st.elo);
    expect(st.eloDelta).toBe(st.elo - st.eloLine[st.eloLine.length - 2]);
    const two = games.find(g => g.record.seats === 2)!;
    const one = computeStats([{ ...two, levels: ['novice'], hinted: false }], NOW);
    expect(one.eloGames).toBe(1);
    expect(one.eloDelta).toBe(one.elo - START_ELO);
    expect(computeStats([{ ...two, hinted: true }], NOW).eloGames).toBe(0);
    expect(computeStats([], NOW)).toMatchObject({ eloGames: 0, eloLine: [], eloDelta: null, elo: START_ELO, form: [] });
    expect(Object.keys(LEVEL_ELO)).toEqual(LEVELS);
  });

  test('средние: ход — только с 20 партий, последние 10 против прежних', () => {
    expect(avgOf([])).toEqual({ n: 0, mean: 0, recent: null, earlier: null });
    expect(avgOf(Array(19).fill(3))).toMatchObject({ n: 19, mean: 3, recent: null, earlier: null });
    const v = [...Array(RECENT).fill(4), ...Array(RECENT).fill(2)];
    expect(avgOf(v)).toEqual({ n: 20, mean: 3, recent: 2, earlier: 4 });
  });

  test('разбор: ошибки и неточности — по разбору ваших решений; без разбора — нет строки', () => {
    const g = games.find(x => x.review)!;
    const f = factsOf(g);
    expect(f.errors).toBe(g.review!.decisions.filter(d => d.grade === 'error').length);
    expect(f.inaccuracies).toBe(g.review!.decisions.filter(d => d.grade === 'inaccurate').length);
    expect(factsOf({ ...g, review: null }).errors).toBeNull();
    expect(factsOf({ ...g, review: { ...g.review!, seat: 1 } }).errors).toBeNull();
  });

  test('запись прошлой версии (один `level`, без разбора) читается и считается', () => {
    const old = games.filter(g => g.record.seats === 3).slice(0, 1).map(g => ({ record: g.record, level: 'amateur', at: g.at, end: g.end, hinted: false }));
    const [g] = normalizeHistory(old);
    const st = computeStats([g], NOW);
    expect(st.byLevel.amateur?.games).toBe(1);
    expect(st.vsLevel.amateur).toBeDefined();
    expect(st.avg.errors.n).toBe(0);
  });

  test('неделя — с понедельника 00:00 местного времени', () => {
    const d = new Date(weekStart(NOW));
    expect(d.getDay()).toBe(1);
    expect(d.getHours() + d.getMinutes()).toBe(0);
    expect(weekStart(weekStart(NOW))).toBe(weekStart(NOW));
  });

  test('200 партий считаются быстрее, чем открывается экран', () => {
    const many: FinishedGame[] = fakeHistory(200, NOW, 11, 0);
    const t = performance.now();
    computeStats(many, NOW);
    expect(performance.now() - t).toBeLessThan(1500);
  });

  test(`ваше место — место ${ME}`, () => expect(ME).toBe(0));
});

describe('геометрия', () => {
  test('высокая полоса: части пропорциональны, нулевые не рисуются, зазор 2, вся ширина', () => {
    const s = segments([6, 0, 2, 2], 300);
    expect(s.map(x => x.index)).toEqual([0, 2, 3]);
    const last = s[s.length - 1];
    expect(last.x + last.w).toBeCloseTo(300, 6);
    expect(s[1].x - (s[0].x + s[0].w)).toBeCloseTo(GAP, 6);
    expect(s[0].w / s[1].w).toBeCloseTo(3, 6);
    expect(segments([0, 0], 100)).toEqual([]);
    expect(segments([1, 500], 300)[0].w).toBeGreaterThanOrEqual(1.9);
  });
  test('подпись внутри части — только если помещается с полями', () => {
    expect(labelFits('12', 40, 13)).toBe(true);
    expect(labelFits('128', 20, 13)).toBe(false);
  });
  test('клетки формы не шире 24 и не вылезают', () => {
    const c = cells(20, 300);
    expect(c[19].x + c[19].w).toBeLessThanOrEqual(300 + 1e-9);
    expect(cells(3, 300)[0].w).toBe(24);
  });
  test('полоса: конец данных скруглён, основание прямое; линия — по ширине', () => {
    expect(barPath(10, 60, 0, 16, true)).toContain('A4 4');
    expect(barPath(10, 60, 0, 16, false)).not.toContain('A');
    const p = sparkPoints([1, 3, 2], 100, 40);
    expect(p[0].x).toBe(5);
    expect(p[2].x).toBe(95);
    expect(p[1].y).toBe(5);
  });
  test('лестница: соседи рейтинга и шкала с краями', () => {
    const v = (l: keyof typeof LEVEL_ELO) => LEVEL_ELO[l];
    expect(neighbours(LEVELS, v, 1350)).toEqual(['average', 'experienced']);
    expect(neighbours(LEVELS, v, 600)).toEqual([null, 'novice']);
    expect(neighbours(LEVELS, v, 1800)).toEqual(['master', null]);
    const x = ladderScale(Object.values(LEVEL_ELO), 1200, 300);
    expect(x(600)).toBe(6);
    expect(x(1800)).toBe(294);
  });
});

// ——— палитра ———
type RGB = [number, number, number];
const hex = (c: string): RGB => [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16)) as RGB;
const rgba = (c: string): { rgb: RGB; a: number } => {
  if (c.startsWith('#')) return { rgb: hex(c), a: 1 };
  const [r, g, b, a] = c.match(/rgba\(([^)]+)\)/)![1].split(',').map(Number);
  return { rgb: [r, g, b], a };
};
const over = (under: RGB, top: string): RGB => { const t = rgba(top); return under.map((u, k) => t.a * t.rgb[k] + (1 - t.a) * u) as RGB; };
const lin = (c: RGB) => c.map(x => x / 255).map(x => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)) as RGB;
const lum = (c: RGB) => { const v = lin(c); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const contrast = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function oklab([r, g, b]: RGB): RGB {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
// Machado, Oliveira, Fernandes 2009, полная сила, линейный RGB
const MACHADO: Record<'protan' | 'deutan', number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
};
const sim = (c: RGB, kind?: 'protan' | 'deutan'): RGB => {
  const v = lin(c);
  if (!kind) return v;
  return MACHADO[kind].map(row => Math.min(1, Math.max(0, row[0] * v[0] + row[1] * v[1] + row[2] * v[2]))) as RGB;
};
const dE = (a: string, b: string, kind?: 'protan' | 'deutan') => {
  const [x, y] = [oklab(sim(hex(a), kind)), oklab(sim(hex(b), kind))];
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

describe('палитра графиков', () => {
  const glass = over(hex(C.bg), C.glass);
  const well = over(glass, CHART.well);
  const place = [CHART.first, CHART.out, CHART.draw, CHART.fool];

  test('колодец — тот самый, на котором палитру проверял validate_palette.js', () => {
    expect(Math.max(...well.map((v, k) => Math.abs(v - hex(CHART.ring)[k])))).toBeLessThanOrEqual(1.5);
  });
  test('отметки — не ниже 3 : 1 к колодцу; подписи и числа — не ниже 4,5 : 1', () => {
    for (const c of [...place, CHART.focus, CHART.muted]) expect(contrast(hex(c), well)).toBeGreaterThanOrEqual(3);
    for (const c of [C.text, C.dim]) expect(contrast(hex(c), well)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(over(well, CHART.axis), well)).toBeGreaterThan(1.5);
  });
  test('число внутри части полосы — не ниже 4,5 : 1 на каждой заливке', () => {
    for (const c of place) expect(contrast(hex(CHART.onFill), hex(c))).toBeGreaterThanOrEqual(4.5);
  });
  test('любые два места различимы: при протанопии и дейтеранопии ΔE ≥ 8, обычным зрением ≥ 15 (все пары — клетки формы стоят как угодно)', () => {
    for (let i = 0; i < place.length; i++) for (let j = i + 1; j < place.length; j++) {
      expect(Math.min(dE(place[i], place[j], 'protan'), dE(place[i], place[j], 'deutan'))).toBeGreaterThanOrEqual(8);
      expect(dE(place[i], place[j])).toBeGreaterThanOrEqual(15);
    }
  });
  test('хорошее плечо — один тон, светлее на заметный шаг; середина — серая; полюса — синий и оранжевый', () => {
    const [a, b] = [oklab(lin(hex(CHART.first))), oklab(lin(hex(CHART.out)))];
    expect(b[0] - a[0]).toBeGreaterThanOrEqual(0.06);
    const hue = (x: RGB) => Math.atan2(x[2], x[1]) * 180 / Math.PI;
    expect(Math.abs(hue(a) - hue(b))).toBeLessThan(10);
    const g = oklab(lin(hex(CHART.draw)));
    expect(Math.hypot(g[1], g[2])).toBeLessThan(0.03);
    expect(hue(oklab(lin(hex(CHART.fool))))).toBeGreaterThan(20);
    expect(hue(oklab(lin(hex(CHART.fool))))).toBeLessThan(80);
  });
});
