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
import { T } from '../../src/i18n';
import { C } from '../../src/ui/theme';
import { cards } from '../art/icon';
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
/** Объяснения запрещённого хода — строки движка (src/i18n), кроме «не ваш ход» и «партия кончилась»: им снимок не нужен. */
const WHY = Object.entries(T.reason).filter(([k]) => !['notYourMove', 'gameOver', 'needCards'].includes(k)).map(([, v]) => v);
const tableCards = (p: Page) => p.getByTestId('table').locator('[data-testid^="table-"]').count();

/** Снимок, когда на столе карты: в быстром режиме бот отвечает за 60 мс, и стол успевает опустеть до снимка —
 *  тогда играть дальше и снять в следующий раз. */
async function shotTable(p: Page, name: string) {
  for (let i = 0; i < 20; i++) {
    if (!(await until(p, async () => (await tableCards(p)) >= 2))) break;
    // реплика («Беру», «Бито») на миг встаёт на место подсказки и гаснет 200 мс — снимаем, когда она ушла
    await p.waitForTimeout(1300);
    if ((await tableCards(p)) >= 2) {
      await p.screenshot({ path: join(SHOTS, `${name}.png`) });
      console.log(`  ${name}.png`);
      return;
    }
  }
  await shot(p, name);
}

async function shot(p: Page, name: string) {
  await p.waitForTimeout(500);
  await p.screenshot({ path: join(SHOTS, `${name}.png`) });
  console.log(`  ${name}.png`);
}

/** Баннер и картинка для ссылок: сукно, две карты значка (PNG той же страницы `?icon=1`), название и строка о главном. */
function banner(w: number, h: number, icon: Buffer): string {
  const s = Math.round(h * 0.98);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="${C.felt}"/>
<image x="${Math.round(w * 0.04)}" y="${Math.round((h - s) / 2)}" width="${s}" height="${s}" href="data:image/png;base64,${icon.toString('base64')}"/>
<text x="${Math.round(w * 0.47)}" y="${Math.round(h * 0.46)}" font-family="Onest" font-weight="700" font-size="${Math.round(h * 0.2)}" fill="${C.accent}">Козырь</text>
<text x="${Math.round(w * 0.47)}" y="${Math.round(h * 0.6)}" font-family="Onest" font-weight="700" font-size="${Math.round(h * 0.056)}" fill="${C.text}">Дурак подкидной и переводной</text>
<text x="${Math.round(w * 0.47)}" y="${Math.round(h * 0.7)}" font-family="Onest" font-weight="700" font-size="${Math.round(h * 0.046)}" fill="${C.dim}">Колоду можно проверить после партии</text>
</svg>`;
}

async function graphics(p: Page) {
  const font = readFileSync(FONT).toString('base64');
  // карты значка — со страницы `?icon=1`: тем же кодом, что за столом (туз червей и «Бордо», решение владельца 12.11.2026)
  const icon512 = await cards(p, web.url, 512, 0.62, true);
  writeFileSync(join(STORE, 'graphics', 'icon-512.png'), icon512);
  console.log('  graphics/icon-512.png');
  const files: { file: string; w: number; h: number; body: string }[] = [
    { file: 'feature-1024x500.png', w: 1024, h: 500, body: banner(1024, 500, await cards(p, web.url, 490, 0.7, false)) },
    { file: 'og-1200x630.png', w: 1200, h: 630, body: banner(1200, 630, await cards(p, web.url, 617, 0.7, false)) },
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
  // `--graphics` — только значок и баннеры, без снимков экрана (новый значок — снимки менять незачем)
  if (process.argv.includes('--graphics')) { await browser.close(); web.stop(); process.exit(0); }

  console.log('Снимки');
  // 540 × 960 точек при плотности 2 — 1080 × 1920, как телефон
  const p = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  await p.goto(`${web.url}?fast=1`);
  await p.getByTestId('menu').waitFor({ timeout: 20000 });

  // 1. партия с ботом: на столе карты, своя рука снизу
  await p.getByTestId('play').click();
  await p.getByTestId('game').waitFor({ timeout: 10000 });
  await shotTable(p, '01-game');
  // 2. «почему нельзя»: касание карты, которой ходить нельзя, — строка с причиной
  for (let i = 0; i < 200; i++) {
    const cards = p.locator('[data-testid^="hand-"]');
    const n = await cards.count();
    let found = false;
    for (let k = 0; k < n && !found; k++) {
      await cards.nth(k).click({ timeout: 1000, force: true }).catch(() => {});
      await p.waitForTimeout(40);
      const hint = await p.getByTestId('hint').innerText().catch(() => '');
      found = WHY.some(w => hint.includes(w));
    }
    if (found || await visible(p, 'result')) break;
    await step(p);
    await p.waitForTimeout(120);
  }
  await shot(p, '02-why');
  // 10. подсказка «Опытного» строкой: свой ход и «Подсказка»
  for (let i = 0; i < 200 && !(await visible(p, 'result')); i++) {
    if (await visible(p, 'advise')) {
      await p.getByTestId('advise').click();
      let t = '';
      for (let w = 0; w < 60 && !/шанс/.test(t); w++) { await p.waitForTimeout(100); t = await p.getByTestId('hint').innerText().catch(() => ''); }
      if (/шанс/.test(t)) { await shot(p, '10-advice'); break; }
    }
    await step(p);
    await p.waitForTimeout(120);
  }
  // 3. итог партии с главной ошибкой
  await until(p, async () => visible(p, 'result'));
  await p.getByTestId('result-worst').filter({ hasNotText: T.result.counting }).waitFor({ timeout: 60000 }).catch(() => {});
  await shot(p, '03-result');
  // 8. разбор на столе: решение, «Сыграно» и «Лучше»
  await p.getByTestId('result-review').click();
  await p.getByTestId('review').waitFor({ timeout: 10000 });
  await p.getByTestId('review-table').waitFor({ timeout: 60000 }).catch(() => {});
  await shot(p, '08-review');
  await p.getByTestId('review-back').click().catch(() => {});
  await p.waitForTimeout(300);
  if (await visible(p, 'result-menu')) await p.getByTestId('result-menu').click();
  await p.getByTestId('menu').waitFor({ timeout: 5000 });

  // 9. задача дня
  await p.getByTestId('puzzle-open').click();
  await p.getByTestId('puzzle').waitFor({ timeout: 5000 });
  await shot(p, '09-puzzle');
  await p.getByTestId('puzzle-back').click().catch(() => {});
  await p.getByTestId('menu').waitFor({ timeout: 5000 });

  // 4. переводной втроём, четырёхцветная колода, таблица вышедших карт
  await p.getByTestId('settings-open').click();
  await p.getByTestId('four').click();
  await p.getByTestId('memory').click();
  await p.getByTestId('settings-back').click();
  await p.getByTestId('variant-perevodnoy').click();
  await p.getByTestId('bots-2').click();
  await p.getByTestId('play').click();
  await p.getByTestId('game').waitFor({ timeout: 10000 });
  await shotTable(p, '04-perevodnoy');
  await until(p, async () => (await p.locator('[data-testid^="hand-"]').count()) <= 5 && (await tableCards(p)) === 0, 200);
  await p.getByTestId('seen').click();
  await shot(p, '05-seen');
  await p.getByTestId('seen-close').click();
  // партия ещё идёт — «В меню» открывает окно партии; кончилась — уходит сразу
  await p.getByTestId('game-menu').click();
  if (await p.getByTestId('game-exit').waitFor({ timeout: 1500 }).then(() => true, () => false)) await p.getByTestId('game-exit').click();
  await p.getByTestId('menu').waitFor({ timeout: 5000 });

  // 6. главный экран
  await shot(p, '06-menu');
  // 7. настройки
  await p.getByTestId('settings-open').click();
  await shot(p, '07-settings');
  await p.getByTestId('settings-back').click();
  await p.getByTestId('menu').waitFor({ timeout: 5000 });

  // 11–12. «Путь к Мастеру» (docs/specs/2026-11-path.md): выиграть матч с Асей, затем путь и коллекция
  await p.getByTestId('path-open').click();
  await p.getByTestId('path').waitFor({ timeout: 5000 });
  await p.getByTestId('path-variant-podkidnoy').click();
  await p.getByTestId('path-play').click();
  await p.getByTestId('game').waitFor({ timeout: 10000 });
  for (let g = 0; g < 5; g++) {
    await until(p, async () => visible(p, 'result'));
    await p.getByTestId('result-match').filter({ hasNotText: T.result.counting }).waitFor({ timeout: 10000 }).catch(() => {});
    if (await visible(p, 'path-next')) break;
    if (!(await visible(p, 'again'))) break;
    await p.getByTestId('again').click();
    await p.waitForTimeout(400);
  }
  await p.getByTestId('result-menu').click();
  await p.getByTestId('path').waitFor({ timeout: 5000 });
  await shot(p, '11-path');
  await p.getByTestId('path-tab-collection').click();
  await shot(p, '12-collection');
} finally {
  await browser.close();
  web.stop();
}
