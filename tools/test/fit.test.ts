// «Ни одной обрезанной надписи» (docs/13-art.md, §3 «Надписи целиком»; владелец 09.11.2026): в коде экранов нет средств,
// которые прячут конец надписи, — многоточия по числу строк и ужимания шрифта. Не помещается — переносится, а раскладка
// подстраивается. Как это выглядит на экранах, меряет прогон в браузере `tools/e2e/fit.ts` (две ширины, шрифт ×1 и ×1,3).
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [];
});
const files = [...walk('src'), 'App.tsx'];

describe('надписи целиком', () => {
  test('ни numberOfLines, ни ellipsizeMode, ни adjustsFontSizeToFit', () => {
    const bad = files.flatMap(f => readFileSync(f, 'utf8').split('\n').map((l, i) => [f, i + 1, l] as const)
      .filter(([, , l]) => /\b(numberOfLines|ellipsizeMode|adjustsFontSizeToFit|minimumFontScale)\b/.test(l) && !/^\s*(\/\/|\*)/.test(l))
      .map(([f, i, l]) => `${f}:${i}: ${l.trim()}`));
    expect(bad).toEqual([]);
  });
  test('плашка соперника: высота под строки растёт с шрифтом телефона до ×1,3', async () => {
    const { plateHeight, PLATE } = await import('../../src/render/layout');
    expect(plateHeight(4)).toBe(PLATE.name + PLATE.line * 3 + PLATE.pad * 2);
    expect(plateHeight(4, 1.3)).toBeGreaterThan(plateHeight(4));
    expect(plateHeight(4, 2)).toBe(plateHeight(4, 1.3));
    expect(plateHeight(4, 0.85)).toBe(plateHeight(4));
  });
  // соперники с портретами (#20, docs/13-art.md §11): широкая плашка — прежней высоты, узкая — выше на одну строку
  test('плашка с портретом: сбоку — та же высота, вчетвером — на строку выше, и обе растут с шрифтом', async () => {
    const { plateHeight, plateOf, PLATE } = await import('../../src/render/layout');
    expect(plateHeight(3, 1, 'side')).toBe(plateHeight(3));
    expect(plateHeight(3, 1, 'top')).toBe(plateHeight(3) + PLATE.line);
    expect(plateHeight(3, 1.3, 'top')).toBeGreaterThan(plateHeight(3, 1, 'top'));
    expect(plateHeight(3, 2, 'side')).toBe(plateHeight(3, 1.3, 'side'));
    // стол 360 и 412 точек (поля экрана — по 8): один-два соперника — портрет сбоку, три — в верхнем ряду
    for (const W of [344, 396]) {
      expect(plateOf(W, 1, 3, 1, true).face).toBe('side');
      expect(plateOf(W, 2, 3, 1, true).face).toBe('side');
      expect(plateOf(W, 3, 3, 1, true).face).toBe('top');
      // надписям рядом с портретом — не меньше 110 точек: «Начинающий» шрифтом ×1,3
      for (const n of [1, 2]) {
        const w = plateOf(W, n, 3, 1, true).w;
        expect(w - 10 - (w >= PLATE.sideBigFrom ? PLATE.side : PLATE.sideSmall) - PLATE.gap).toBeGreaterThanOrEqual(110);
      }
    }
  });
});
