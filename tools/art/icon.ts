// Значок и заставка «Козыря» — рисунок кодом (ADR устава 0023, правило 3: рисунок — скрипт с паспортом;
// ADR 0010: карты — кодом). Две карты веером на тёмном сукне: рубашка — бордо с золотой рамкой,
// поверх — туз червей с русским индексом «Т». Цвета — токены облика (src/ui/theme.ts, ADR 0012),
// шрифт индекса — Onest (OFL, как в игре). Рисует Chromium без окна (Playwright); паспорт — assets/LICENSES.md.
//
//   bun tools/art/icon.ts   — assets/icon.png, assets/adaptive-icon.png, assets/splash-icon.png и паспорт
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { C } from '../../src/ui/theme';

const ROOT = join(import.meta.dir, '..', '..');
const FONT = join(ROOT, 'node_modules/@expo-google-fonts/onest/700Bold/Onest_700Bold.ttf');

/** Сердце (масть ♥) в квадрате `s` с серединой в (cx, cy) — тот же путь, что src/render/faces.ts. */
function heart(cx: number, cy: number, s: number): string {
  const p = (x: number, y: number) => `${cx + x * s} ${cy + y * s}`;
  return `M ${p(0, 0.45)} C ${p(-0.55, 0.05)} ${p(-0.5, -0.48)} ${p(-0.12, -0.42)} C ${p(-0.04, -0.4)} ${p(0, -0.32)} ${p(0, -0.25)} `
    + `C ${p(0, -0.32)} ${p(0.04, -0.4)} ${p(0.12, -0.42)} C ${p(0.5, -0.48)} ${p(0.55, 0.05)} ${p(0, 0.45)} Z`;
}

/** Две карты веером в квадрате `size`; `scale` — какая доля стороны занята (адаптивный — в безопасном круге). */
export function svg(size: number, scale: number, background: string | null): string {
  const h = size * scale, w = (h * 63) / 88, r = w * 0.1;
  const cx = size / 2, cy = size / 2;
  const card = (rot: number, dx: number, body: string) =>
    `<g transform="translate(${cx + dx} ${cy}) rotate(${rot})"><g transform="translate(${-w / 2} ${-h / 2})">${body}</g></g>`;
  const back = `<rect width="${w}" height="${h}" rx="${r}" fill="${C.back}"/>`
    + `<rect x="${w * 0.07}" y="${w * 0.07}" width="${w * 0.86}" height="${h - w * 0.14}" rx="${r * 0.7}" fill="none" stroke="${C.backLine}" stroke-width="${w * 0.025}"/>`;
  const face = `<rect width="${w}" height="${h}" rx="${r}" fill="${C.face}" stroke="${C.faceLine}" stroke-width="${w * 0.012}"/>`
    + `<text x="${w * 0.1}" y="${w * 0.24}" font-family="Onest" font-weight="700" font-size="${w * 0.22}" fill="${C.red}">Т</text>`
    + `<path d="${heart(w * 0.16, w * 0.36, w * 0.16)}" fill="${C.red}"/>`
    + `<path d="${heart(w / 2, h / 2, w * 0.56)}" fill="${C.red}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : ''}
${card(-12, -w * 0.22, back)}
${card(9, w * 0.2, face)}
</svg>`;
}

const FILES: { file: string; size: number; scale: number; background: string | null }[] = [
  // значок магазина и старых Android — на сукне во весь квадрат
  { file: 'icon.png', size: 1024, scale: 0.62, background: C.felt },
  // передний слой адаптивного значка: 108 dp, безопасный круг — 66 dp (радиус 0,306 стороны); фон слоя — сукно (app.json)
  { file: 'adaptive-icon.png', size: 1024, scale: 0.42, background: null },
  // заставка Android 12+: картинка в круге на фоне приложения
  { file: 'splash-icon.png', size: 512, scale: 0.62, background: null },
];

async function main() {
  const font = readFileSync(FONT).toString('base64');
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const lines: string[] = [];
  try {
    const page = await browser.newPage();
    for (const f of FILES) {
      await page.setViewportSize({ width: f.size, height: f.size });
      await page.setContent(`<html><head><style>@font-face{font-family:Onest;font-weight:700;src:url(data:font/ttf;base64,${font})}html,body{margin:0;background:transparent}</style></head><body>${svg(f.size, f.scale, f.background)}</body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: f.size, height: f.size } });
      writeFileSync(join(ROOT, 'assets', f.file), png);
      lines.push(`| \`assets/${f.file}\` | ${f.size} × ${f.size} | \`${createHash('sha256').update(png).digest('hex')}\` |`);
    }
  } finally {
    await browser.close();
  }
  const pass = `# Паспорт картинок «Козыря»

Значок и заставка нарисованы кодом: \`bun tools/art/icon.ts\` (ADR устава 0023, правило 3; ADR 0010).
Генераторов изображений нет. Шрифт индекса — Onest 700, SIL Open Font License 1.1
(\`@expo-google-fonts/onest\`, текст лицензии — \`assets/fonts/Onest-OFL.txt\`).

| Файл | Размер | SHA-256 |
|---|---|---|
${lines.join('\n')}
`;
  writeFileSync(join(ROOT, 'assets', 'LICENSES.md'), pass);
  console.log(pass);
}

if (import.meta.main) await main();
