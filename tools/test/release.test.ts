// Версия и картинки сборки (docs/05-process.md, «Версии»; ADR устава 0023, правило 3): номер один в
// app.json, package.json, package-lock.json и STATUS.md; значок и заставка — те, что нарисовал
// tools/art/icon.ts (паспорт assets/LICENSES.md); плагин окна заставки — перед expo-splash-screen.
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import app from '../../app.json';
import pkg from '../../package.json';
import lock from '../../package-lock.json';

describe('сборка', () => {
  test('номер версии — один в четырёх местах', () => {
    const v = app.expo.version;
    expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.version).toBe(v);
    expect(lock.version).toBe(v);
    expect((lock.packages as Record<string, { version?: string }>)[''].version).toBe(v);
    expect(readFileSync('STATUS.md', 'utf8')).toContain(`**Версия:** ${v}`);
    expect(readFileSync('README.md', 'utf8')).toMatch(new RegExp(`### ${v.replace(/\./g, '\\.')}( |$)`, 'm'));
  });
  test('значок и заставка совпадают с паспортом', () => {
    const pass = readFileSync('assets/LICENSES.md', 'utf8');
    const rows = [...pass.matchAll(/\| `(assets\/[^`]+)` \| [^|]+ \| `([0-9a-f]{64})` \|/g)];
    expect(rows.length).toBe(3);
    for (const [, file, sha] of rows) expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(sha);
  });
  test('окно заставки — перед expo-splash-screen (моды идут в обратном порядке)', () => {
    const names = app.expo.plugins.map(p => (Array.isArray(p) ? p[0] : p));
    const w = names.indexOf('./plugins/with-splash-window'), s = names.indexOf('expo-splash-screen');
    expect(w).toBeGreaterThanOrEqual(0);
    expect(w).toBeLessThan(s);
  });
});

// Страница игры на сайте собирается из store/site/ (Nefeste/gornitsagames, tools/games.py): снимков от 3 до 8,
// каждый — файл из store/. Девятый снимок однажды остановил обновление сайта (09.11.2026).
describe('страница на сайте', () => {
  for (const lang of ['ru', 'en']) {
    test(`page.${lang}.md: от 3 до 8 снимков, файлы на месте`, () => {
      const md = readFileSync(`store/site/page.${lang}.md`, 'utf8');
      const files = [...md.matchAll(/^ {2}- file: (\S+)$/gm)].map(m => m[1]);
      expect(files.length).toBeGreaterThanOrEqual(3);
      expect(files.length).toBeLessThanOrEqual(8);
      for (const f of files) expect(existsSync(`store/${f}`)).toBe(true);
    });
  }
});
