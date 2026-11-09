// из nardy: src/ui/charts/geometry.ts @ 1d2bdff — `barPath`, `sparkPoints`; свои — части высокой полосы, клетки
// формы, место под подпись и лестница уровней.
// Геометрия графиков «Статистики» (docs/09-game-design.md, «Как оформлено») — чистые функции без React Native: их
// проверяет tools/test/charts.test.ts. Отметки — по навыку dataviz: полоса не толще 24 px, конец данных скруглён на
// 4 px, у основания — прямой; между соседними заливками — зазор 2 px.

/** Зазор между соседними заливками, px. */
export const GAP = 2;
/** Толщина полосы против уровней и высота высокой полосы «Итога», px (навык: полоса ≤ 24, высокая полоса — 28). */
export const BAR = 16;
export const TALL = 28;
/** Внутренний отступ подписи в части полосы, px. */
export const LABEL_PAD = 6;

/**
 * Контур полосы от основания `x0` до конца данных `x1` (в любую сторону), сверху `y`, толщиной `h`:
 * конец данных скруглён (`round`), основание прямое. Короче радиуса — радиус меньше.
 */
export function barPath(x0: number, x1: number, y: number, h: number, round: boolean, r = 4): string {
  const len = Math.abs(x1 - x0), dir = x1 >= x0 ? 1 : -1;
  const q = round ? Math.min(r, len, h / 2) : 0;
  const n = (v: number) => Math.round(v * 100) / 100;
  if (q <= 0) return `M${n(x0)} ${n(y)}H${n(x1)}V${n(y + h)}H${n(x0)}Z`;
  const sweep = dir > 0 ? 1 : 0;
  return `M${n(x0)} ${n(y)}H${n(x1 - dir * q)}A${n(q)} ${n(q)} 0 0 ${sweep} ${n(x1)} ${n(y + q)}`
    + `V${n(y + h - q)}A${n(q)} ${n(q)} 0 0 ${sweep} ${n(x1 - dir * q)} ${n(y + h)}H${n(x0)}Z`;
}

/** Линия по точкам: x — равномерно по ширине, y — от меньшего к большему снизу вверх, с полями `pad`. */
export function sparkPoints(values: readonly number[], width: number, height: number, pad = 5): { x: number; y: number }[] {
  if (!values.length) return [];
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo;
  const step = values.length > 1 ? (width - 2 * pad) / (values.length - 1) : 0;
  return values.map((v, k) => ({
    x: values.length > 1 ? pad + k * step : width / 2,
    y: span > 0 ? pad + (1 - (v - lo) / span) * (height - 2 * pad) : height / 2,
  }));
}

/** Ширина строки подписи на глаз (цифры и буквы шрифта без засечек — около 0,6 кегля), px. */
export const textWidth = (text: string, size: number): number => text.length * size * 0.6;

/** Подпись помещается внутри части шириной `room` с отступами с обеих сторон. */
export const labelFits = (text: string, room: number, size: number): boolean => textWidth(text, size) + 2 * LABEL_PAD <= room;

/**
 * Части высокой полосы: ширина пропорциональна числу, нулевые не рисуются, между частями — зазор, вся полоса —
 * `width`. Часть не уже 2 px, чтобы одна партия из многих была видна.
 */
export function segments(values: readonly number[], width: number): { index: number; x: number; w: number }[] {
  const parts = values.map((v, index) => ({ v, index })).filter(p => p.v > 0);
  const total = parts.reduce((a, p) => a + p.v, 0);
  if (!total) return [];
  const room = width - GAP * (parts.length - 1);
  const raw = parts.map(p => Math.max(2, (p.v / total) * room));
  const k = room / raw.reduce((a, b) => a + b, 0);
  let x = 0;
  return parts.map((p, i) => {
    const w = raw[i] * k;
    const s = { index: p.index, x, w };
    x += w + GAP;
    return s;
  });
}

/** Клетки формы: `n` клеток во всю ширину с зазором, не шире `max`; ряд прижат влево. */
export function cells(n: number, width: number, max = 24): { x: number; w: number }[] {
  if (n <= 0) return [];
  const w = Math.min(max, (width - GAP * (n - 1)) / n);
  return Array.from({ length: n }, (_, k) => ({ x: k * (w + GAP), w }));
}

/** Длина на одну встречу у расходящихся полос: место под число на конце растёт с числом цифр. */
export function armUnit(max: number, half: number, size: number): number {
  const room = LABEL_PAD + textWidth(String(Math.max(1, max)), size);
  return Math.max(0, half - room) / Math.max(1, max);
}

/** Шкала лестницы уровней: от слабейшего − 100 до сильнейшего + 100, и ваша точка внутри. */
export function ladderScale(levels: readonly number[], rating: number, width: number, pad = 6): (r: number) => number {
  const lo = Math.min(Math.min(...levels) - 100, rating - 40), hi = Math.max(Math.max(...levels) + 100, rating + 40);
  return (r: number) => pad + ((r - lo) / (hi - lo)) * (width - 2 * pad);
}

/** Соседи по лестнице: ближайший уровень ниже (или равный) и выше рейтинга; `null` — за краем. */
export function neighbours<T extends string>(ids: readonly T[], value: (id: T) => number, rating: number): [T | null, T | null] {
  let below: T | null = null, above: T | null = null;
  for (const id of ids) {
    if (value(id) <= rating && (below === null || value(id) > value(below))) below = id;
    if (value(id) > rating && (above === null || value(id) < value(above))) above = id;
  }
  return [below, above];
}
