/**
 * Браузерный прогон этапов Б и В: меню → партия с ботом на холсте Skia настоящими касаниями до итога →
 * «Ещё партию» → сохранение: пара ходов, «В меню», перезагрузка страницы, «Продолжить партию» →
 * отмена своего хода → настройки («Меньше движения», четырёхцветная колода, «Помощь памяти») →
 * переводной с двумя ботами до итога → «Мастер» и «Подсказка» до итога → магазин: «Без рекламы» в тестовом
 * магазине, перезагрузка, «Восстановить покупки» (этап Е). Сначала — правки 0.5.1 по игре владельца на телефоне:
 * экран 412 × 780 с отступом снизу 48 (`?inset=48`, как кнопки «Назад / Домой / Недавние»): нижние кнопки меню
 * и стола над ним; стол и карты одного размера в свой ход и в чужой; «колода N»; «Помощь памяти» выключена. Карты руки — прозрачные «кнопки» поверх холста: касание
 * идёт в обработчик стола, поэтому щелчки — `force`. Ловит пустой экран, неработающие касания,
 * зависшую партию, потерянное сохранение и ошибки в консоли. Снимки — в tools/e2e/out/.
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
const handCount = (p: Page) => p.locator('[data-testid^="hand-"]').count();

/** Играть до итога: сначала карты руки по очереди (ход, подкидывание, отбой, перевод), если ни одна
 *  не легла — «пас»/«бито», иначе «беру». Возвращает, сколько раз легла своя карта. */
async function playOut(p: Page, label: string): Promise<{ ended: boolean; played: number }> {
  let played = 0;
  for (let i = 0; i < 600; i++) {
    if (await visible(p, 'result')) return { ended: true, played };
    const before = await handCount(p);
    // сначала попробовать отбиться или походить картой — так проверяются касания карт
    const cards = p.locator('[data-testid^="hand-"]');
    const n = await cards.count();
    let moved = false;
    for (let k = 0; k < n && !moved; k++) {
      await cards.nth(k).click({ timeout: 1000, force: true }).catch(() => {});
      await p.waitForTimeout(30);
      if (await visible(p, 'transfer')) await p.getByTestId('transfer').click().catch(() => {});
      const table = p.getByTestId('table').locator('[data-testid^="table-"]');
      if (/Какую карту бить|Коснитесь карты/.test(await p.getByTestId('hint').innerText().catch(() => ''))) {
        await table.first().click({ force: true }).catch(() => {});
        await p.waitForTimeout(30);
      }
      const after = await handCount(p).catch(() => before);
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

  console.log('Телефон 0.5.1: отступ снизу, постоянный стол, «колода», без помощи памяти');
  {
    const H = 780, INSET = 48;
    const ctx = await browser.newContext({ viewport: { width: 412, height: H } });
    const ph = await ctx.newPage();
    ph.on('pageerror', e => errors.push(String(e)));
    await ph.goto(`${web.url}?inset=${INSET}`); // без ?fast: боты думают как на телефоне
    await ph.getByTestId('menu').waitFor({ timeout: 20000 });
    for (const id of ['store-open', 'settings-open']) {
      await ph.getByTestId(id).scrollIntoViewIfNeeded();
      const b = await ph.getByTestId(id).boundingBox();
      ok(!!b && b.y + b.height <= H - INSET, `меню: «${id}» над кнопками телефона`, JSON.stringify(b));
    }
    await ph.screenshot({ path: `${OUT}/00-menu-inset.png` });
    await ph.getByTestId('settings-open').click();
    await ph.getByTestId('settings').waitFor({ timeout: 5000 });
    ok(await ph.getByTestId('memory').getAttribute('aria-checked').catch(() => null) === 'false', '«Помощь памяти (для учёбы)» по умолчанию выключена');
    // «Назад» — вверху слева под отступом сверху, последняя кнопка списка — над кнопками телефона
    const back = await ph.getByTestId('settings-back').boundingBox();
    ok(!!back && back.y >= INSET / 2 && back.x < 40, 'настройки: «Назад» вверху слева, под отступом сверху', JSON.stringify(back));
    await ph.getByTestId('report').scrollIntoViewIfNeeded();
    const sb = await ph.getByTestId('report').boundingBox();
    ok(!!sb && sb.y + sb.height <= H - INSET, 'настройки: нижняя кнопка над кнопками телефона', JSON.stringify(sb));
    await ph.getByTestId('settings-back').scrollIntoViewIfNeeded();
    await ph.getByTestId('settings-back').click();
    await ph.getByTestId('play').click();
    await ph.getByTestId('game').waitFor({ timeout: 10000 });
    await ph.waitForTimeout(400);
    ok(!(await visible(ph, 'seen')), 'без «Помощи памяти» кнопки «Вышедшие» нет');
    const talon = await ph.getByTestId('talon').innerText().catch(() => '');
    ok(/^колода \d+$/.test(talon.trim()), `у стопки — «${talon}»`, talon);
    // размеры стола и карт руки на каждом шаге: в свой ход (есть «Подсказка») и в чужой (её нет)
    const sizes = new Map<string, number>();
    const seen = { mine: false, theirs: false };
    const sets = new Set<string>();
    let lowest = 0;
    for (let i = 0; i < 400 && !(await visible(ph, 'result')); i++) {
      // boundingBox ждёт элемент до 30 с — меряем только то, что есть
      const box = async (sel: string) => (await ph.locator(sel).count()) > 0 ? ph.locator(sel).first().boundingBox({ timeout: 1000 }).catch(() => null) : null;
      const measure = async () => {
        const felt = await box('[data-testid="felt"]');
        const card = await box('[data-testid^="hand-"]');
        // в 0.5.0 стол сжимался, когда у руки появлялись «Отменить» и «Подсказка»: запоминаем, какие кнопки были
        const shown: string[] = [];
        for (const id of ['undo', 'advise', 'pass', 'take']) if (await visible(ph, id)) shown.push(id);
        sets.add(shown.join('+') || 'нет кнопок');
        seen[shown.includes('advise') ? 'mine' : 'theirs'] = true;
        if (felt && card) {
          const key = `${Math.round(felt.width)}×${Math.round(felt.height)} карта ${Math.round(card.height)}`;
          sizes.set(key, (sizes.get(key) ?? 0) + 1);
        }
      };
      await measure();
      for (const id of ['pass', 'take', 'advise', 'undo']) {
        const b = await box(`[data-testid="${id}"]`);
        if (b) lowest = Math.max(lowest, b.y + b.height);
      }
      const cards = ph.locator('[data-testid^="hand-"]');
      const n = await cards.count();
      const before = n;
      let moved = false;
      for (let k = 0; k < n && !moved; k++) {
        await cards.nth(k).click({ timeout: 1000, force: true }).catch(() => {});
        await ph.waitForTimeout(30);
        if (/Какую карту бить|Коснитесь карты/.test(await ph.getByTestId('hint').innerText().catch(() => ''))) {
          await ph.getByTestId('table').locator('[data-testid^="table-"]').first().click({ force: true }).catch(() => {});
        }
        moved = (await handCount(ph).catch(() => before)) < before;
      }
      // сразу после своей карты бот ещё думает (0,5–0,9 с) — замер в чужой ход
      if (moved) await measure();
      if (!moved) {
        if (await visible(ph, 'pass')) await ph.getByTestId('pass').click().catch(() => {});
        else if (await visible(ph, 'take')) await ph.getByTestId('take').click().catch(() => {});
      }
      await ph.waitForTimeout(100);
      if (i === 2) await ph.screenshot({ path: `${OUT}/02-table-inset.png` });
      if (i >= 40 && seen.mine && seen.theirs && sets.size >= 3) break; // сорок шагов партии хватает
    }
    ok(seen.mine && seen.theirs && sets.size >= 3, `замеры в свой ход (с «Подсказкой») и в чужой (без неё); наборы кнопок: ${[...sets].join(', ')}`, JSON.stringify(seen));
    ok(sizes.size === 1, `стол и карты одного размера всю партию: ${[...sizes.keys()].join(', ')}`, [...sizes.entries()].join('; '));
    ok(lowest > 0 && lowest <= H - INSET, `кнопки у руки над кнопками телефона: низ ${Math.round(lowest)} ≤ ${H - INSET}`, lowest);
    await ctx.close();
  }

  console.log('Подкидной, один бот');
  await page.getByTestId('play').click();
  await page.getByTestId('game').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  ok(await page.locator('canvas').count() >= 1, 'стол — холст Skia');
  ok(await handCount(page) === 6, 'на руке шесть карт', await handCount(page));
  ok(await visible(page, 'opp-1'), 'соперник с подписью «бот»', await page.getByTestId('opp-1').innerText().catch(() => ''));
  ok(/бот/.test(await page.getByTestId('opp-1').innerText().catch(() => '')), 'у соперника значок «бот»');
  await page.screenshot({ path: `${OUT}/02-table.png` });
  const first = await playOut(page, 'подкидной');
  ok(first.ended, 'партия дошла до итога');
  ok(first.played > 0, `свои карты ложились касанием: ${first.played}`);
  await page.screenshot({ path: `${OUT}/03-result.png` });
  const result = await page.getByTestId('result').innerText().catch(() => '');
  ok(!/дурак/i.test(result), 'итог без слова «дурак»', result);
  ok(/Остались с картами|Вы вышли|Ничья/.test(result), 'итог «остались с картами» или «вышли»', result);
  // разбор (этап Д): главная ошибка на итоге, полный разбор последней партии дня — бесплатно
  let worst = '';
  for (let w = 0; w < 120; w++) {
    worst = await page.getByTestId('result-worst').innerText().catch(() => '');
    if (worst && !/Считаем/.test(worst)) break;
    await page.waitForTimeout(250);
  }
  ok(/Главная ошибка|Ошибок не нашли/.test(worst), `итог: главная ошибка партии — ${worst}`, worst);
  await page.getByTestId('result-review').click();
  await page.getByTestId('review').waitFor({ timeout: 5000 });
  ok(!(await visible(page, 'review-locked')), 'полный разбор последней партии дня открыт без «Про»');
  ok(await page.locator('[data-testid^="decision-"]').count() > 0 || /не было выбора/.test(await page.getByTestId('review').innerText()), 'разбор: решения по отбоям');
  await page.screenshot({ path: `${OUT}/03-review.png` });
  await page.getByTestId('review-back').click();
  await page.getByTestId('result').waitFor({ timeout: 5000 });

  await page.getByTestId('again').click();
  await page.waitForTimeout(400);
  ok(!(await visible(page, 'result')) && await handCount(page) > 0, '«Ещё партию» — новая раздача');

  console.log('Сохранение и продолжение');
  // один свой ход, если он есть, — чтобы в записи было действие
  for (let k = 0; k < 6; k++) {
    const before = await handCount(page);
    await page.locator('[data-testid^="hand-"]').nth(k).click({ force: true }).catch(() => {});
    await page.waitForTimeout(40);
    if (await handCount(page) < before) break;
  }
  await page.waitForTimeout(300);
  const handBefore = await handCount(page);
  await page.getByTestId('game-menu').click();
  await page.getByTestId('menu').waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  ok(await visible(page, 'resume'), 'в меню — «Продолжить партию»');
  await page.reload();
  await page.getByTestId('menu').waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  ok(await visible(page, 'resume'), 'после перезагрузки — «Продолжить партию»');
  await page.getByTestId('resume').click();
  await page.getByTestId('game').waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  ok(await handCount(page) === handBefore, `партия продолжилась с той же рукой: ${handBefore}`, await handCount(page));
  // отмена: боты с обычной паузой (0,5–0,9 с) — успеваем отменить свой ход до их ответа
  await page.getByTestId('game-menu').click();
  await page.goto(web.url);
  await page.getByTestId('menu').waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
  await page.getByTestId('resume').click();
  await page.getByTestId('game').waitFor({ timeout: 10000 });
  await page.waitForTimeout(1500);
  let undone = false;
  for (let tries = 0; tries < 40 && !undone; tries++) {
    const n = await handCount(page);
    for (let k = 0; k < n; k++) {
      await page.locator('[data-testid^="hand-"]').nth(k).click({ force: true }).catch(() => {});
      if (await handCount(page) < n) {
        if (await visible(page, 'undo')) {
          await page.getByTestId('undo').click();
          await page.waitForTimeout(100);
          ok(await handCount(page) === n, '«Отменить» вернул карту в руку до ответа бота', await handCount(page));
          undone = true;
        }
        break;
      }
    }
    if (!undone) {
      if (await visible(page, 'pass')) await page.getByTestId('pass').click().catch(() => {});
      else if (await visible(page, 'take')) await page.getByTestId('take').click().catch(() => {});
      await page.waitForTimeout(1200);
    }
  }
  ok(undone, 'отмена своего хода проверена');
  await page.goto(`${web.url}?fast=1`);
  await page.getByTestId('menu').waitFor({ timeout: 20000 });

  console.log('Настройки');
  await page.getByTestId('settings-open').click();
  await page.getByTestId('settings').waitFor({ timeout: 5000 });
  ok(await visible(page, 'motion-system'), '«Меньше движения»: по умолчанию — как в системе');
  await page.getByTestId('motion-on').click();
  await page.getByTestId('four').click();
  await page.getByTestId('memory').click();
  await page.screenshot({ path: `${OUT}/05-settings.png` });
  await page.reload();
  await page.getByTestId('menu').waitFor({ timeout: 20000 });
  await page.getByTestId('settings-open').click();
  await page.waitForTimeout(300);
  ok(await page.getByTestId('motion-on').getAttribute('aria-selected').catch(() => null) === 'true', 'выбор «Меньше движения» пережил перезагрузку',
    await page.getByTestId('motion-on').getAttribute('aria-selected').catch(() => null));
  await page.getByTestId('settings-back').click();

  console.log('Переводной, два бота, четырёхцветная колода, без полёта');
  await page.getByTestId('variant-perevodnoy').click();
  await page.getByTestId('bots-2').click();
  await page.getByTestId('play').click();
  await page.getByTestId('game').waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  ok(await visible(page, 'opp-2'), 'два соперника');
  ok(await visible(page, 'seen'), 'кнопка «Вышедшие» — с «Помощью памяти» из настроек');
  await page.getByTestId('seen').click();
  ok(await visible(page, 'seen-sheet'), 'таблица вышедших карт');
  await page.getByTestId('seen-close').click();
  const second = await playOut(page, 'переводной');
  ok(second.ended, 'партия втроём дошла до итога');
  await page.screenshot({ path: `${OUT}/04-perevodnoy.png` });
  await page.getByTestId('result-menu').click();
  await page.waitForTimeout(300);
  ok(!(await visible(page, 'resume')), 'законченной партии нет в «Продолжить»');

  // в браузере реклама — подделка (src/money/adsSdk.web.ts): после двух коротких первых партий её нет
  const ads = await page.evaluate(() => (globalThis as unknown as { __kozyrAds?: { shown: string[] } }).__kozyrAds?.shown ?? []);
  ok(ads.length === 0, 'первые партии — без рекламы (правило 1 частоты)', ads.join(','));

  console.log('Магазин');
  await page.getByTestId('store-open').click();
  await page.getByTestId('store').waitFor({ timeout: 5000 });
  ok(await visible(page, 'store-test'), 'тестовый магазин подписан');
  ok(await visible(page, 'product-no_ads'), 'на витрине «Без рекламы»');
  ok(await visible(page, 'product-pro_month'), '«Про» в продаже — разбор и статистика есть');
  await page.getByTestId('buy-no_ads').click();
  await page.getByTestId('owned-no_ads').waitFor({ timeout: 5000 }).catch(() => {});
  ok(await visible(page, 'owned-no_ads'), '«Без рекламы» куплена');
  await page.screenshot({ path: `${OUT}/06-store.png` });
  await page.reload();
  await page.getByTestId('menu').waitFor({ timeout: 20000 });
  await page.getByTestId('store-open').click();
  await page.getByTestId('store').waitFor({ timeout: 5000 });
  await page.getByTestId('store-restore').click();
  await page.getByTestId('owned-no_ads').waitFor({ timeout: 5000 }).catch(() => {});
  ok(await visible(page, 'owned-no_ads'), 'покупка пережила перезагрузку и «Восстановить покупки»');
  await page.getByTestId('store-back').click();
  await page.getByTestId('settings-open').click();
  ok(await visible(page, 'personal-ads'), 'настройка «Персональная реклама» на месте');
  await page.getByTestId('settings-back').click();

  console.log('Статистика и «Про»');
  await page.getByTestId('stats-open').click();
  await page.getByTestId('stats').waitFor({ timeout: 5000 });
  ok(/Партий с ботами: [1-9]/.test(await page.getByTestId('stats-games').innerText()), 'статистика: партии посчитаны', await page.getByTestId('stats-games').innerText());
  ok(await visible(page, 'stats-locked'), 'подробная статистика — с «Про»');
  await page.getByTestId('stats-store').click();
  await page.getByTestId('store').waitFor({ timeout: 5000 });
  await page.getByTestId('buy-pro_month').click();
  await page.getByTestId('owned-pro_month').waitFor({ timeout: 5000 }).catch(() => {});
  ok(await visible(page, 'owned-pro_month'), '«Про» куплена в тестовом магазине');
  await page.getByTestId('store-back').click();
  await page.getByTestId('stats-open').click();
  await page.getByTestId('stats').waitFor({ timeout: 5000 });
  ok(await visible(page, 'stats-pro'), 'с «Про» — подробная статистика');
  ok(/Козырей приходило/.test(await page.getByTestId('stats-trumps').innerText()), 'козыри вам и боту');
  ok(/Рейтинг тренировок/.test(await page.getByTestId('stats-elo').innerText()), 'рейтинг тренировок');
  await page.locator('[data-testid^="stats-review-"]').first().click();
  await page.getByTestId('review').waitFor({ timeout: 5000 });
  ok(!(await visible(page, 'review-locked')), 'с «Про» — разбор любой партии');
  await page.screenshot({ path: `${OUT}/06-stats-review.png` });
  await page.getByTestId('review-back').click();
  await page.getByTestId('stats-back').click();
  await page.getByTestId('menu').waitFor({ timeout: 5000 });

  console.log('Задача дня');
  await page.getByTestId('puzzle-open').click();
  await page.getByTestId('puzzle').waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  ok(/Задача \d+/.test(await page.getByTestId('puzzle-number').innerText()), 'задача дня с номером');
  ok(/У соперника:/.test(await page.getByTestId('puzzle-opponent').innerText()), 'карты соперника открыты');
  await page.screenshot({ path: `${OUT}/07-puzzle.png` });
  await page.getByTestId('puzzle-answer').click();
  ok(/Ответ:/.test(await page.getByTestId('puzzle-line').innerText()), 'ответ — по кнопке', await page.getByTestId('puzzle-line').innerText());
  await page.getByTestId('puzzle-share').click();
  ok(/Козырь, задача \d+/.test(await page.getByTestId('puzzle-share-text').innerText().catch(() => '')), 'результат — текстом');
  await page.getByTestId('puzzle-archive').click();
  ok(await visible(page, 'puzzle-archive-list'), 'архив задач');
  await page.getByTestId('puzzle-back').click();
  await page.getByTestId('puzzle-back').click();
  await page.getByTestId('menu').waitFor({ timeout: 5000 });
  ok(!(await visible(page, 'locked-note')), 'седьмой уровень закрыт');
  await page.getByTestId('level-neural').click();
  ok(await visible(page, 'locked-note'), '«Нейросеть · скоро»: касание объясняет, выбрать нельзя');

  console.log('«Мастер» и подсказка');
  await page.getByTestId('variant-podkidnoy').click();
  await page.getByTestId('bots-1').click();
  await page.getByTestId('level-master').click();
  await page.getByTestId('play').click();
  await page.getByTestId('game').waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  ok(/Мастер/.test(await page.getByTestId('game').innerText().catch(() => '')), 'за столом «Мастер»');
  // подсказка — когда есть свой ход
  let advised = '';
  for (let tries = 0; tries < 40 && !advised; tries++) {
    if (await visible(page, 'advise')) {
      await page.getByTestId('advise').click();
      for (let w = 0; w < 40; w++) {
        await page.waitForTimeout(100);
        const t = await page.getByTestId('hint').innerText().catch(() => '');
        if (/Ходите|Подкиньте|Побейте|Переведите|Берите|Пас|Бито/.test(t)) { advised = t; break; }
      }
    } else await page.waitForTimeout(200);
  }
  ok(/Ходите|Подкиньте|Побейте|Переведите|Берите|Пас|Бито/.test(advised), `подсказка «Мастера»: ${advised}`, advised);
  await page.screenshot({ path: `${OUT}/06-advice.png` });
  const third = await playOut(page, 'против «Мастера»');
  ok(third.ended, 'партия с «Мастером» дошла до итога');
} finally {
  ok(errors.length === 0, 'ошибок в консоли нет', errors.join('\n'));
  await browser.close();
  web.stop();
}
console.log(failures ? `Провалов: ${failures}` : 'Сценарий пройден.');
process.exit(failures ? 1 : 0);
