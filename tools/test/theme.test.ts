// Свой облик «Козыря» (ADR 0012; критерий ADR устава 0023): текст читается — контраст не ниже AA
// (4,5 : 1) на фоне, на сукне и на стекле, индексы мастей на лице карты — в обеих колодах, надпись
// на золотой кнопке. Счёт контраста — из nardy: tools/test/theme.test.ts @ 1d2bdff.
import { describe, expect, test } from 'bun:test';
import { C, suitColors } from '../../src/ui/theme';

type RGB = [number, number, number];
function parse(c: string): { rgb: RGB; a: number } {
  if (c.startsWith('#')) return { rgb: [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16)) as RGB, a: 1 };
  const m = c.match(/rgba\(([^)]+)\)/);
  if (!m) throw new Error(c);
  const [r, g, b, a] = m[1].split(',').map(Number);
  return { rgb: [r, g, b], a };
}
const over = (under: RGB, top: string): RGB => { const t = parse(top); return under.map((u, k) => t.a * t.rgb[k] + (1 - t.a) * u) as RGB; };
const lum = (c: RGB) => {
  const v = c.map(x => x / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const contrast = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const solid = (c: string) => parse(c).rgb;

describe('контраст', () => {
  const grounds: [string, RGB][] = [
    ['фон', solid(C.bg)], ['стекло', over(solid(C.bg), C.glass)], ['окно', solid(C.sheet)],
    ['сукно', solid(C.felt)], ['сукно в середине', solid(C.feltLight)],
  ];
  for (const [where, bg] of grounds) {
    test(`текст и подписи: ${where}`, () => {
      expect(contrast(solid(C.text), bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(solid(C.dim), bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
  test('золото на фоне и надпись на золотой кнопке', () => {
    expect(contrast(solid(C.accent), solid(C.bg))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(solid(C.accentText), solid(C.accent))).toBeGreaterThanOrEqual(4.5);
  });
  test('масти на лице карты — обычная и четырёхцветная колода', () => {
    for (const four of [false, true]) {
      for (const color of suitColors(four)) expect(contrast(solid(color), solid(C.face))).toBeGreaterThanOrEqual(4.5);
    }
  });
  test('четыре цвета мастей различимы между собой', () => {
    const cols = suitColors(true).map(solid);
    expect(new Set(suitColors(true)).size).toBe(4);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const d = Math.hypot(...cols[i].map((v, k) => v - cols[j][k]));
      expect(d).toBeGreaterThan(60);
    }
  });
});

// Шкалы листа стиля (13-art.md §3–4; аудит 08.11.2026, находки 5 и 14): экраны берут размеры текста, отступы,
// скругления и цвета только из src/ui/theme.ts. Рисунок карт (src/render) — своя геометрия, его здесь не проверяем.
describe('токены вместо чисел на глаз', () => {
  const { readdirSync, readFileSync } = require('node:fs') as typeof import('node:fs');
  const files = ['src/screens', 'src/game', 'src/ui'].flatMap(dir => readdirSync(dir).filter(f => f.endsWith('.tsx')).map(f => `${dir}/${f}`));
  const bad = (re: RegExp) => files.flatMap(f => readFileSync(f, 'utf8').split('\n').map((l, i) => [f, i + 1, l] as const).filter(([, , l]) => re.test(l)).map(([f, i, l]) => `${f}:${i}: ${l.trim()}`));
  test('шкалы — как в листе стиля', async () => {
    const { TYPE, SPACE, RADIUS } = await import('../../src/ui/theme');
    expect(Object.values(TYPE)).toEqual([13, 15, 17, 20, 28, 40]);
    expect(Object.values(SPACE)).toEqual([4, 8, 12, 16, 24, 32, 48]);
    expect(RADIUS).toMatchObject({ playing: 8, small: 12, panel: 20 });
  });
  test('размер текста — только TYPE', () => expect(bad(/fontSize: \d/)).toEqual([]));
  test('отступы и скругления — только SPACE и RADIUS (сдвиг внахлёст отрицательным числом можно)', () => {
    expect(bad(/\b(gap|rowGap|columnGap|padding\w*|margin\w*|borderRadius): \d/)).toEqual([]);
    expect(bad(/insets\.\w+ \+ \d/)).toEqual([]);
  });
  test('цвета — только C', () => expect(bad(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)).toEqual([]));
});
