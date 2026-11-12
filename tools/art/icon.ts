// Значок и заставка «Козыря» — те же карты, что за столом (ADR устава 0023, правило 3: рисунок — скрипт с паспортом;
// ADR 0010: карты — кодом). Две карты веером: рубашка «Бордо» и поверх — туз червей нового лица (третий круг вида),
// нарисованные самой игрой (`makeBack`, `makeFaces`) на странице веб-сборки `?icon=1` (`src/render/IconSheet.tsx`;
// решение владельца 12.11.2026). Снимает Chromium без окна (Playwright); паспорт — assets/LICENSES.md.
//
//   EXPO_OFFLINE=1 npm run export:web && bun tools/art/icon.ts   — assets/icon.png, adaptive-icon.png, splash-icon.png и паспорт
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import { serveWeb } from '../e2e/serve';

const ROOT = join(import.meta.dir, '..', '..');

/**
 * Две карты значка квадратом `size`: `scale` — какая доля стороны занята картой по высоте (адаптивный — в безопасном
 * круге), `felt` — на сукне, иначе на прозрачном. PNG со страницы `?icon=1` веб-сборки по адресу `url`.
 */
export async function cards(page: Page, url: string, size: number, scale: number, felt: boolean): Promise<Buffer> {
  await page.setViewportSize({ width: size, height: size });
  await page.goto(`${url}?icon=1&size=${size}&scale=${scale}${felt ? '&bg=felt' : ''}`);
  await page.addStyleTag({ content: 'html,body,#root,#root>div{background:transparent!important}' });
  await page.getByTestId('icon-ready').waitFor({ timeout: 20000 });
  await page.waitForTimeout(300);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

const FILES: { file: string; size: number; scale: number; background: string | null }[] = [
  // значок магазина и старых Android — на сукне во весь квадрат
  { file: 'icon.png', size: 1024, scale: 0.62, background: 'felt' },
  // передний слой адаптивного значка: 108 dp, безопасный круг — 66 dp (радиус 0,306 стороны); фон слоя — сукно (app.json)
  { file: 'adaptive-icon.png', size: 1024, scale: 0.42, background: null },
  // заставка Android 12+: картинка в круге на фоне приложения
  { file: 'splash-icon.png', size: 512, scale: 0.62, background: null },
];

async function main() {
  const web = serveWeb();
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const lines: string[] = [];
  try {
    const page = await browser.newPage();
    for (const f of FILES) {
      const png = await cards(page, web.url, f.size, f.scale, f.background !== null);
      writeFileSync(join(ROOT, 'assets', f.file), png);
      lines.push(`| \`assets/${f.file}\` | ${f.size} × ${f.size} | \`${createHash('sha256').update(png).digest('hex')}\` |`);
    }
  } finally {
    await browser.close();
    web.stop();
  }
  const pass = `# Паспорт картинок «Козыря»

Значок и заставка нарисованы кодом самой игры — туз червей и рубашка «Бордо» (\`makeFaces\`, \`makeBack\`) на
странице веб-сборки \`?icon=1\`: \`EXPO_OFFLINE=1 npm run export:web && bun tools/art/icon.ts\` (ADR устава 0023,
правило 3; ADR 0010). Генераторов изображений нет. Шрифт индекса — Onest 700, SIL Open Font License 1.1
(\`@expo-google-fonts/onest\`, текст лицензии — \`assets/fonts/Onest-OFL.txt\`).

| Файл | Размер | SHA-256 |
|---|---|---|
${lines.join('\n')}
`;
  writeFileSync(join(ROOT, 'assets', 'LICENSES.md'), pass);
  console.log(pass);
}

if (import.meta.main) await main();
