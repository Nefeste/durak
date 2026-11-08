/**
 * Графика и снимки для RuStore и сайта студии (store/README.md): значок 512, баннер 1024 × 500 и картинка
 * для ссылок 1200 × 630 — кодом, тем же рисунком, что значок игры (tools/art/icon.ts, ADR 0010); снимки
 * экрана 1080 × 1920 (портрет, ADR 0007) — с веб-сборки настоящими касаниями, как tools/e2e/browser.ts.
 *
 *   EXPO_OFFLINE=1 npm run export:web
 *   NODE_PATH=/opt/node22/lib/node_modules bun tools/store/shots.ts
 *
 * Партии играют касаниями против ботов, раздачи случайные — снимки от прогона к прогону разные; на
 * каждом — то, что подписано в store/site/page.*.md. Генераторов изображений нет (ADR 0023 устава,
 * правило 3): всё нарисовано кодом игры.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { C } from '../../src/ui/theme';
import { svg } from '../art/icon';
import { serveWeb } from '../e2e/serve';

const ROOT = join(import.meta.dir, '../..');
const STORE = join(ROOT, 'store');
const SHOTS = join(STORE, 'screenshots/ru');
const FONT = join(ROOT, 'node_modules/@expo-google-fonts/onest/700Bold/Onest_700Bold.ttf');
mkdirSync(SHOTS, { recursive: true });
mkdirSync(join(STORE, 'graphics'), { recursive: true });

const visible = (p: Page, id: string) => p.getByTestId(id).isVisible().catch(() => false);
const handCount = (p: Page) => p.locator('[data-testid^="hand-"]').count();

/** Один свой ход или ответ: карта, которая легла; иначе «бито»/«пас», иначе «беру». */
async function step(p: Page): Promise<void> {
  const before = await handCount(p);
  const cards = p.locator('[data-testid^="hand-"]');
  const n = await cards.count();
  for (let k = 0; k < n; k++) {
    await cards.nth(k).click({ timeout: 1000, force: true }).catch(() => {});
    await p.waitForTimeout(30);
    if (/Какую карту бить|Коснитесь карты/.test(await p.getByTestId('hint').innerText().catch(() => ''))) {
      await p.getByTestId('table').locator('[data-testid^="table-"]').first().click({ force: true }).catch(() => {});
      await p.waitForTimeout(30);
    }
    if ((await handCount(p).catch(() => before)) < before) return;
  }
  if (await visible(p, 'pass')) await p.getByTestId('pass').click().catch(() => {});
  else if (await visible(p, 'take')) await p.getByTestId('take').click().catch(() => {});
}

/** Играть, пока на столе не окажется карт (для снимка «партия идёт») или до итога. */
async function until(p: Page, done: () => Promise<boolean>, max = 600): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    if (await done()) return true;
    if (await visible(p, 'result')) return false;
    await step(p);
    await p.waitForTimeout(120);
  }
  return false;
}
const tableCards = (p: Page) => p.getByTestId('table').locator('[data-testid^="table-"]').count();

async function shot(p: Page, name: string) {
  await p.waitForTimeout(500);
  await p.screenshot({ path: join(SHOTS, `${name}.png`) });
  console.log(`  ${name}.png`);
}

/** Баннер и картинка для ссылок: сукно, две карты значка, название и строка о главном. */
function banner(w: number, h: number): string {
  const s = Math.round(h * 0.98);
  const icon = svg(s, 0.7, null).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="${C.felt}"/>
<g transform="translate(${Math.round(w * 0.04)} ${Math.round((h - s) / 2)})">${icon}</g>
<text x="${Math.round(w * 0.47)}" y="${Math.round(h * 0.46)}" font-family="Onest" font-weight="700" font-size="${Math.round(h * 0.2)}" fill="${C.accent}">Козырь</text>
<text x="${Math.round(w * 0.47)}" y="${Math.round(h * 0.6)}" font-family="Onest" font-weight="700" font-size="${Math.round(h * 0.056)}" fill="${C.text}">Дурак подкидной и переводной</text>
<text x="${Math.round(w * 0.47)}" y="${Math.round(h * 0.7)}" font-family="Onest" font-weight="700" font-size="${Math.round(h * 0.046)}" fill="${C.dim}">Колоду можно проверить после партии</text>
</svg>`;
}

async function graphics(p: Page) {
  const font = readFileSync(FONT).toString('base64');
  const files: { file: string; w: number; h: number; body: string }[] = [
    { file: 'icon-512.png', w: 512, h: 512, body: svg(512, 0.62, C.felt) },
    { file: 'feature-1024x500.png', w: 1024, h: 500, body: banner(1024, 500) },
    { file: 'og-1200x630.png', w: 1200, h: 630, body: banner(1200, 630) },
  ];
  for (const f of files) {
    await p.setViewportSize({ width: f.w, height: f.h });
    await p.setContent(`<html><head><style>@font-face{font-family:Onest;font-weight:700;src:url(data:font/ttf;base64,${font})}html,body{margin:0}</style></head><body>${f.body}</body></html>`);
    await p.evaluate(() => document.fonts.ready);
    writeFileSync(join(STORE, 'graphics', f.file), await p.screenshot({ clip: { x: 0, y: 0, width: f.w, height: f.h } }));
    console.log(`  graphics/${f.file}`);
  }
}

const web = serveWeb();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  console.log('Графика');
  await graphics(await browser.newPage());

  console.log('Снимки');
  // 540 × 960 точек при плотности 2 — 1080 × 1920, как телефон
  const p = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  await p.goto(`${web.url}?fast=1`);
  await p.getByTestId('menu').waitFor({ timeout: 20000 });

  // 1. партия с ботом: на столе карты, своя рука снизу
  await p.getByTestId('play').click();
  await p.getByTestId('game').waitFor({ timeout: 10000 });
  await until(p, async () => (await tableCards(p)) >= 2);
  await shot(p, '01-game');
  // 2. «почему нельзя»: касание карты, которой ходить нельзя, — строка с причиной
  for (let i = 0; i < 200; i++) {
    const cards = p.locator('[data-testid^="hand-"]');
    const n = await cards.count();
    let found = false;
    for (let k = 0; k < n && !found; k++) {
      await cards.nth(k).click({ timeout: 1000, force: true }).catch(() => {});
      await p.waitForTimeout(40);
      found = /нельзя|не бьёт|только|Сейчас не ваш/.test(await p.getByTestId('hint').innerText().catch(() => ''));
    }
    if (found || await visible(p, 'result')) break;
    await step(p);
    await p.waitForTimeout(120);
  }
  await shot(p, '02-why');
  // 3. итог партии
  await until(p, async () => visible(p, 'result'));
  await shot(p, '03-result');
  await p.getByTestId('result-menu').click();
  await p.getByTestId('menu').waitFor({ timeout: 5000 });

  // 4. переводной втроём, четырёхцветная колода, таблица вышедших карт
  await p.getByTestId('settings-open').click();
  await p.getByTestId('four-on').click();
  await p.getByTestId('seencards-on').click();
  await p.getByTestId('settings-back').click();
  await p.getByTestId('variant-perevodnoy').click();
  await p.getByTestId('bots-2').click();
  await p.getByTestId('play').click();
  await p.getByTestId('game').waitFor({ timeout: 10000 });
  await until(p, async () => (await tableCards(p)) >= 2);
  await shot(p, '04-perevodnoy');
  await until(p, async () => (await p.locator('[data-testid^="hand-"]').count()) <= 5 && (await tableCards(p)) === 0, 200);
  await p.getByTestId('seen').click();
  await shot(p, '05-seen');
  await p.getByTestId('seen-close').click();
  await p.getByTestId('game-menu').click();
  await p.getByTestId('menu').waitFor({ timeout: 5000 });

  // 6. главный экран
  await shot(p, '06-menu');
  // 7. настройки
  await p.getByTestId('settings-open').click();
  await shot(p, '07-settings');
} finally {
  await browser.close();
  web.stop();
}
