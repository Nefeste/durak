/**
 * Снимки экранов для аудита вида и листа стиля (docs/reports/2026-11-08-design-audit.md, docs/13-art.md):
 * телефон 412 × 915, плотность 2, веб-сборка. Каждый экран — один файл в docs/design/; разбор на столе — 16 и 17, «Правила» — 18–20, окно «Что такое перевод» — 21, отчёт с раскрытой партией — 22, закрытый уровень — 23.
 *
 *   EXPO_OFFLINE=1 npm run export:web
 *   NODE_PATH=/opt/node22/lib/node_modules bun tools/design/shots.ts [папка]   # по умолчанию docs/design
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { serveWeb } from '../e2e/serve';

const OUT = process.argv[2] ?? 'docs/design'; // папка снимков «после» — аргументом
mkdirSync(OUT, { recursive: true });
const visible = (p: Page, id: string) => p.getByTestId(id).isVisible().catch(() => false);
const hand = (p: Page) => p.locator('[data-testid^="hand-"]');
const shot = async (p: Page, name: string) => {
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${name}.png`, type: 'png' });
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

async function until(p: Page, re: RegExp, steps = 80): Promise<boolean> {
  for (let i = 0; i < steps; i++) {
    if (re.test(await p.getByTestId('hint').innerText().catch(() => ''))) return true;
    if (await visible(p, 'result')) return false;
    if (!(await playOne(p))) {
      if (await visible(p, 'pass')) await p.getByTestId('pass').click().catch(() => {});
      else if (await visible(p, 'take')) await p.getByTestId('take').click().catch(() => {});
    }
    await p.waitForTimeout(150);
  }
  return false;
}

async function toEnd(p: Page) {
  for (let i = 0; i < 600 && !(await visible(p, 'result')); i++) {
    if (!(await playOne(p))) {
      if (await visible(p, 'pass')) await p.getByTestId('pass').click().catch(() => {});
      else if (await visible(p, 'take')) await p.getByTestId('take').click().catch(() => {});
    }
    await p.waitForTimeout(100);
  }
}

const web = serveWeb();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
try {
  await page.goto(`${web.url}?fast=1`);
  await page.getByTestId('menu').waitFor({ timeout: 20000 });
  await shot(page, '01-menu');
  await page.getByTestId('rules-open').click();
  await page.getByTestId('rules').waitFor({ timeout: 5000 });
  await page.waitForTimeout(800);
  await shot(page, '18-rules');
  await page.getByTestId('rules-throw').scrollIntoViewIfNeeded();
  await shot(page, '19-rules-throw');
  await page.getByTestId('rules-transfer').scrollIntoViewIfNeeded();
  await shot(page, '20-rules-transfer');
  await page.getByTestId('rules-back').click();
  await page.getByTestId('menu').waitFor({ timeout: 5000 });

  await page.getByTestId('play').click();
  await page.getByTestId('game').waitFor({ timeout: 10000 });
  await page.waitForTimeout(1500);
  await shot(page, '02-table-start');
  await until(page, /Отбивайтесь|Побейте|Переводите|Бейте|Нечем побить/);
  await shot(page, '03-table-defence');
  await until(page, /Подкиньте|Ходите/);
  await shot(page, '04-table-attack');
  await toEnd(page);
  await shot(page, '05-result');
  // разбор на столе: открывается на главной ошибке; дальше — следующая неточность или ошибка
  for (let w = 0; w < 120 && /Считаем/.test(await page.getByTestId('result-worst').innerText().catch(() => 'Считаем')); w++) await page.waitForTimeout(250);
  await page.getByTestId('result-review').click();
  await page.getByTestId('review').waitFor({ timeout: 5000 });
  await page.waitForTimeout(1000);
  await shot(page, '16-review');
  if (await visible(page, 'review-only')) {
    await page.getByTestId('review-only').click();
    if (await page.getByTestId('review-next').isEnabled().catch(() => false)) await page.getByTestId('review-next').click();
    else if (await page.getByTestId('review-prev').isEnabled().catch(() => false)) await page.getByTestId('review-prev').click();
    await shot(page, '17-review-next');
  }
  await page.getByTestId('review-back').click();
  await page.getByTestId('result').waitFor({ timeout: 5000 });

  await page.getByTestId('result-menu').click();
  await page.getByTestId('menu').waitFor({ timeout: 5000 });
  await page.getByTestId('settings-open').click();
  await page.getByTestId('settings').waitFor({ timeout: 5000 });
  await shot(page, '06-settings');
  await page.mouse.wheel(0, 900);
  await shot(page, '07-settings-more');
  await page.getByTestId('settings-back').click();

  await page.getByTestId('store-open').click();
  await page.getByTestId('store').waitFor({ timeout: 5000 });
  await shot(page, '08-store');
  await page.getByTestId('store-back').click();

  // переводной, трое соперников, вышедшие карты
  await page.getByText(/Переводной/).first().click().catch(() => {});
  await page.getByTestId('bots-3').click().catch(() => {});
  await shot(page, '09-menu-choice');
  await page.getByTestId('play').click();
  await page.getByTestId('game').waitFor({ timeout: 10000 });
  if (await page.getByTestId('transfer-ok').waitFor({ timeout: 3000 }).then(() => true, () => false)) {
    await shot(page, '21-transfer-what');
    await page.getByTestId('transfer-ok').click();
  }
  await page.waitForTimeout(1500);
  await shot(page, '10-table-four');
  await until(page, /Переводите|Переведите|Отбивайтесь/);
  await shot(page, '11-table-four-defence');
  if (await visible(page, 'seen')) {
    await page.getByTestId('seen').click();
    await shot(page, '12-seen');
    await page.getByTestId('seen-close').click();
  }
  if (await visible(page, 'advise')) {
    await page.getByTestId('advise').click();
    await page.waitForTimeout(2500);
    await shot(page, '13-hint');
  }
  await page.getByTestId('game-menu').click();
  await page.getByTestId('menu').waitFor({ timeout: 5000 });

  await page.getByTestId('friends-open').click().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, '14-online');
  await page.getByTestId('online-back').click().catch(() => page.goBack());
  await page.getByTestId('menu').waitFor({ timeout: 5000 }).catch(() => {});

  await page.getByTestId('settings-open').click();
  await page.getByTestId('settings').waitFor({ timeout: 5000 });
  await page.getByTestId('report').click().catch(() => {});
  await page.waitForTimeout(500);
  if (await visible(page, 'report-screen')) await shot(page, '15-report');
  if (await visible(page, 'report-game')) {
    await page.getByTestId('report-game').click();
    await shot(page, '22-report-open');
  }
  await page.getByTestId('report-back').click().catch(() => {});
  await page.getByTestId('settings-back').click().catch(() => {});
  await page.getByTestId('menu').waitFor({ timeout: 5000 }).catch(() => {});
  // седьмой, закрытый шаг уровня: «Нейросеть · скоро», «Играть» недоступна
  for (let k = 0; k < 6 && await page.getByTestId('level-next').isEnabled().catch(() => false); k++) await page.getByTestId('level-next').click();
  await shot(page, '23-level-locked');
} finally {
  await browser.close();
  web.stop();
}
