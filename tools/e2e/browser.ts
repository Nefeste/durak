/**
 * Браузерный прогон этапа А: меню → партия с ботом настоящими касаниями до итога → «Ещё партию» →
 * переводной с двумя ботами до итога. Ловит пустой экран, неработающие касания, зависшую партию и
 * ошибки в консоли. Снимки — в tools/e2e/out/.
 *
 *   EXPO_OFFLINE=1 npm run export:web
 *   NODE_PATH=/opt/node22/lib/node_modules bun tools/e2e/browser.ts
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { serveWeb } from './serve';

let failures = 0;
function ok(cond: boolean, what: string, detail?: unknown) {
  if (cond) { console.log(`  ✓ ${what}`); return; }
  failures++;
  console.log(`  ✗ ${what}${detail === undefined ? '' : `\n      ${String(detail).slice(0, 300)}`}`);
}
const OUT = 'tools/e2e/out';
mkdirSync(OUT, { recursive: true });
const visible = (p: Page, id: string) => p.getByTestId(id).isVisible().catch(() => false);

/** Играть до итога: сначала карты руки по очереди (ход, подкидывание, отбой, перевод), если ни одна
 *  не легла — «пас»/«бито», иначе «беру». Возвращает, сколько раз легла своя карта. */
async function playOut(p: Page, label: string): Promise<{ ended: boolean; played: number }> {
  let played = 0;
  for (let i = 0; i < 600; i++) {
    if (await visible(p, 'result')) return { ended: true, played };
    const before = await p.getByTestId('hand').locator('[data-testid^="hand-"]').count();
    // сначала попробовать отбиться или походить картой — так проверяются касания карт
    const cards = p.getByTestId('hand').locator('[data-testid^="hand-"]');
    const n = await cards.count();
    let moved = false;
    for (let k = 0; k < n && !moved; k++) {
      await cards.nth(k).click({ timeout: 1000 }).catch(() => {});
      await p.waitForTimeout(30);
      if (await visible(p, 'transfer')) await p.getByTestId('transfer').click().catch(() => {});
      const table = p.getByTestId('table').locator('[data-testid^="table-"]');
      if ((await p.getByTestId('hint').innerText().catch(() => '')).includes('Какую карту бить')) {
        await table.first().click().catch(() => {});
        await p.waitForTimeout(30);
      }
      const after = await p.getByTestId('hand').locator('[data-testid^="hand-"]').count().catch(() => before);
      if (after < before) { moved = true; played++; }
    }
    if (!moved) {
      if (await visible(p, 'pass')) await p.getByTestId('pass').click().catch(() => {});
      else if (await visible(p, 'take')) await p.getByTestId('take').click().catch(() => {});
    }
    await p.waitForTimeout(120);
  }
  console.log(`  … ${label}: партия не кончилась за 600 шагов`);
  return { ended: false, played };
}

const web = serveWeb();
console.log(`Сборка: ${web.bundle}`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
const errors: string[] = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(`${web.url}?fast=1`);
  await page.getByTestId('menu').waitFor({ timeout: 20000 });
  ok(await page.getByText('Козырь').first().isVisible(), 'главный экран: название «Козырь»');
  await page.screenshot({ path: `${OUT}/01-menu.png` });

  console.log('Подкидной, один бот');
  await page.getByTestId('play').click();
  await page.getByTestId('game').waitFor({ timeout: 10000 });
  ok(await page.getByTestId('hand').locator('[data-testid^="hand-"]').count() === 6, 'на руке шесть карт');
  ok(await visible(page, 'opp-1'), 'соперник с подписью «бот»', await page.getByTestId('opp-1').innerText().catch(() => ''));
  await page.screenshot({ path: `${OUT}/02-table.png` });
  const first = await playOut(page, 'подкидной');
  ok(first.ended, 'партия дошла до итога');
  ok(first.played > 0, `свои карты ложились касанием: ${first.played}`);
  await page.screenshot({ path: `${OUT}/03-result.png` });
  const result = await page.getByTestId('result').innerText().catch(() => '');
  ok(!/дурак/i.test(result), 'итог без слова «дурак»', result);

  await page.getByTestId('again').click();
  await page.waitForTimeout(200);
  ok(!(await visible(page, 'result')) && await page.getByTestId('hand').locator('[data-testid^="hand-"]').count() > 0, '«Ещё партию» — новая раздача');

  console.log('Переводной, два бота');
  await page.getByTestId('game-menu').click();
  await page.getByTestId('variant-perevodnoy').click();
  await page.getByTestId('bots-2').click();
  await page.getByTestId('play').click();
  await page.getByTestId('game').waitFor({ timeout: 10000 });
  ok(await visible(page, 'opp-2'), 'два соперника');
  const second = await playOut(page, 'переводной');
  ok(second.ended, 'партия втроём дошла до итога');
  await page.screenshot({ path: `${OUT}/04-perevodnoy.png` });
} finally {
  ok(errors.length === 0, 'ошибок в консоли нет', errors.join('\n'));
  await browser.close();
  web.stop();
}
console.log(failures ? `Провалов: ${failures}` : 'Сценарий пройден.');
process.exit(failures ? 1 : 0);
