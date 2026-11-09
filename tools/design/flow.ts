/**
 * Проход по виду (specs/2026-11-art-premium.md §7): весь путь игрока в браузере — меню → правила → партия с ботом
 * до итога → итог → разбор → настройки → статистика → магазин → «С друзьями» → переводной вчетвером (стол в игре,
 * подсказка) → задача дня; телефон 412 × 915, плотность 2. Снимок каждого экрана — в папку; ошибки консоли и
 * страницы собираются и печатаются в конце — их должно быть ноль (код выхода 1, если нет). Снимки «до — после»
 * для листа стиля и отчёта о проходах (docs/reports/2026-11-09-art-passes.md).
 *
 *   EXPO_OFFLINE=1 npm run export:web
 *   NODE_PATH=/opt/node22/lib/node_modules bun tools/design/flow.ts [папка]   # по умолчанию docs/design/2026-11-art/pass
 *
 * Колода и решения ботов закреплены (`?seed=11`, GameScreen): снимки «до» и «после» ловят один и тот же стол.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { serveWeb } from '../e2e/serve';

const OUT = process.argv[2] ?? 'docs/design/2026-11-art/pass';
mkdirSync(OUT, { recursive: true });
const visible = (p: Page, id: string) => p.getByTestId(id).isVisible().catch(() => false);
const hand = (p: Page) => p.locator('[data-testid^="hand-"]');
const shots: string[] = [];
const shot = async (p: Page, name: string, wait = 500) => {
  await p.waitForTimeout(wait);
  await p.screenshot({ path: `${OUT}/${name}.png`, type: 'png' });
  shots.push(name);
  console.log(`  ${name}.png`);
};

/** Положить одну свою карту, если можно. */
async function playOne(p: Page): Promise<boolean> {
  const n = await hand(p).count();
  for (let k = 0; k < n; k++) {
    await hand(p).nth(k).click({ force: true, timeout: 1000 }).catch(() => {});
    await p.waitForTimeout(40);
    if (/Какую карту бить|Коснитесь карты/.test(await p.getByTestId('hint').innerText().catch(() => ''))) {
      await p.getByTestId('table').locator('[data-testid^="table-"]').first().click({ force: true }).catch(() => {});
    }
    if (await hand(p).count() < n) return true;
  }
  return false;
}

async function step(p: Page) {
  if (!(await playOne(p))) {
    if (await visible(p, 'pass')) await p.getByTestId('pass').click().catch(() => {});
    else if (await visible(p, 'take')) await p.getByTestId('take').click().catch(() => {});
  }
}

async function until(p: Page, re: RegExp, steps = 80): Promise<boolean> {
  for (let i = 0; i < steps; i++) {
    if (re.test(await p.getByTestId('hint').innerText().catch(() => ''))) return true;
    if (await visible(p, 'result')) return false;
    await step(p);
    await p.waitForTimeout(150);
  }
  return false;
}

/** Середина партии: на столе не меньше двух пар, в руке не меньше пяти карт — снимок после того, как карты
 *  долетели. С закреплённой колодой момент один и тот же в каждой сборке. */
async function midGame(p: Page, name: string) {
  for (let i = 0; i < 60 && !(await visible(p, 'result')); i++) {
    const pairs = await p.getByTestId('table').locator('[data-testid^="table-"]').count();
    if (pairs >= 2 && await hand(p).count() >= 5) { await shot(p, name, 900); return; }
    await step(p);
    await p.waitForTimeout(120);
  }
}

/** До итога. */
async function toEnd(p: Page) {
  for (let i = 0; i < 600 && !(await visible(p, 'result')); i++) {
    await step(p);
    await p.waitForTimeout(100);
  }
}

const web = serveWeb();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
const errors: string[] = [];
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`); });
page.on('pageerror', e => errors.push(`page: ${String(e).slice(0, 300)}`));
try {
  await page.goto(`${web.url}?fast=1&seed=11`);
  await page.getByTestId('menu').waitFor({ timeout: 20000 });
  await shot(page, '01-title', 1200);

  await page.getByTestId('rules-open').click();
  await page.getByTestId('rules').waitFor({ timeout: 5000 });
  await shot(page, '02-rules', 800);
  await page.getByTestId('rules-back').click();
  await page.getByTestId('menu').waitFor({ timeout: 5000 });

  await page.getByTestId('play').click();
  await page.getByTestId('game').waitFor({ timeout: 10000 });
  await shot(page, '03-table-deal', 1600);
  await until(page, /Отбивайтесь|Побейте|Переводите|Бейте|Нечем побить/);
  await shot(page, '04-table-defence');
  await until(page, /Подкиньте|Ходите/);
  await shot(page, '05-table-attack');
  await midGame(page, '06-table-mid');
  await toEnd(page);
  await shot(page, '07-result', 700);
  for (let w = 0; w < 120 && /Считаем/.test(await page.getByTestId('result-worst').innerText().catch(() => 'Считаем')); w++) await page.waitForTimeout(250);
  await shot(page, '08-result-review-line', 300);
  await page.getByTestId('result-review').click();
  await page.getByTestId('review').waitFor({ timeout: 5000 });
  await shot(page, '09-review', 1000);
  await page.getByTestId('review-back').click();
  await page.getByTestId('result').waitFor({ timeout: 5000 });
  await page.getByTestId('result-menu').click();
  await page.getByTestId('menu').waitFor({ timeout: 5000 });

  await page.getByTestId('settings-open').click();
  await page.getByTestId('settings').waitFor({ timeout: 5000 });
  await shot(page, '10-settings');
  await page.getByTestId('settings-back').click();
  await page.getByTestId('stats-open').click();
  await page.waitForTimeout(600);
  await shot(page, '11-stats');
  await page.getByTestId('stats-back').click().catch(() => {});
  await page.getByTestId('menu').waitFor({ timeout: 5000 }).catch(() => {});
  await page.getByTestId('store-open').click();
  await page.getByTestId('store').waitFor({ timeout: 5000 });
  await shot(page, '12-store');
  await page.getByTestId('store-back').click();
  await page.getByTestId('friends-open').click().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, '13-online');
  await page.getByTestId('online-back').click().catch(() => page.goBack());
  await page.getByTestId('menu').waitFor({ timeout: 5000 }).catch(() => {});

  // переводной вчетвером: окно о переводе, стол, подсказка
  await page.getByText(/Переводной/).first().click().catch(() => {});
  await page.getByTestId('bots-3').click().catch(() => {});
  await shot(page, '14-menu-four');
  await page.getByTestId('play').click();
  await page.getByTestId('game').waitFor({ timeout: 10000 });
  if (await page.getByTestId('transfer-ok').waitFor({ timeout: 3000 }).then(() => true, () => false)) {
    await shot(page, '15-transfer-what');
    await page.getByTestId('transfer-ok').click();
  }
  await shot(page, '16-table-four', 1500);
  await midGame(page, '17-table-four-mid');
  if (await visible(page, 'advise')) {
    await page.getByTestId('advise').click();
    await page.waitForTimeout(2500);
    await shot(page, '18-hint');
  }
  await page.getByTestId('game-menu').click();
  await page.getByTestId('menu').waitFor({ timeout: 5000 });

  await page.getByTestId('puzzle-open').click().catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, '19-puzzle');
} finally {
  writeFileSync(`${OUT}/errors.json`, JSON.stringify(errors, null, 2));
  await browser.close();
  web.stop();
}
console.log(errors.length ? `\nОшибок консоли: ${errors.length}\n${errors.join('\n')}` : `\nОшибок консоли нет; снимков: ${shots.length}`);
process.exit(errors.length ? 1 : 0);
