/**
 * Браузерный прогон этапов Б и В: меню → «Правила» с картинками → партия с ботом на холсте Skia настоящими касаниями до итога →
 * «Ещё партию» → сохранение: пара ходов, «В меню», перезагрузка страницы, «Продолжить партию» →
 * отмена своего хода → настройки («Меньше движения», четырёхцветная колода, «Помощь памяти») →
 * переводной с двумя ботами до итога → «Опытный» и «Подсказка» до итога → магазин: «Без рекламы» в тестовом
 * магазине, перезагрузка, «Восстановить покупки» (этап Е) → быстрый «Замер» (долгое нажатие на версию в настройках). Сначала — правки 0.5.1 по игре владельца на телефоне:
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

/** Разбор на столе (docs/09-game-design.md, «Итог партии и разбор»): холст позиции, метка «Сыграно», переход между
 *  решениями и «Только неточности и ошибки». */
async function checkReviewTable(p: Page) {
  if (!(await p.locator('[data-testid^="decision-"]').count())) return;
  await p.getByTestId('review-table').waitFor({ timeout: 5000 }).catch(() => {});
  ok(await visible(p, 'review-table'), 'разбор: стол позиции перед решением');
  ok(await p.getByTestId('review-table').locator('canvas').count() > 0, 'разбор: стол нарисован на холсте');
  await p.waitForTimeout(600);
  const marks = async () => p.locator('[data-testid^="mark-played-"], [data-testid="mark-chip-played"]').count();
  ok(await marks() > 0, 'разбор: сыгранный ход отмечен на столе');
  const grade = await p.getByTestId('review-grade').innerText().catch(() => '');
  if (grade !== 'точно') {
    ok(await p.locator('[data-testid^="mark-best-"], [data-testid="mark-chip-best"]').count() > 0, `разбор: у решения «${grade}» отмечен и лучший ход`);
    ok(await p.getByTestId('mark-label-best').isVisible().catch(() => false) || await visible(p, 'mark-chip-best'), 'разбор: подпись «Лучше»');
  }
  if (await visible(p, 'review-next') || await visible(p, 'review-prev')) {
    const before = await p.getByTestId('review-step').innerText();
    const dir = await p.getByTestId('review-next').isEnabled().catch(() => false) ? 'review-next' : 'review-prev';
    await p.getByTestId(dir).click();
    await p.waitForTimeout(300);
    const after = await p.getByTestId('review-step').innerText();
    ok(before !== after, `разбор: переход между решениями — «${before}» → «${after}»`);
    ok(await marks() > 0, 'разбор: метка на столе после перехода');
  }
  if (await visible(p, 'review-only')) {
    await p.getByTestId('review-only').click();
    await p.waitForTimeout(300);
    const g = await p.getByTestId('review-grade').innerText().catch(() => '');
    ok(g !== 'точно', `разбор: «Только неточности и ошибки» — ${g || 'нет решений'}`);
    for (let k = 0; k < 3 && await p.getByTestId('review-next').isEnabled().catch(() => false); k++) {
      await p.getByTestId('review-next').click();
      await p.waitForTimeout(200);
      ok(await p.getByTestId('review-grade').innerText().catch(() => '') !== 'точно', 'разбор: среди неточностей и ошибок «точно» нет');
    }
    await p.getByTestId('review-only').click();
  }
}
mkdirSync(OUT, { recursive: true });
/** Уровень стрелками «‹ ›» до подписи `name`; `id` — строка: `level` — общая, `level-N` — бота N. */
async function setLevel(p: Page, name: string, id = 'level') {
  const order = ['Новичок', 'Начинающий', 'Любитель', 'Средний', 'Сильный', 'Опытный', 'Мастер · скоро'];
  for (let k = 0; k < 8; k++) {
    const now = (await p.getByTestId(`${id}-value`).innerText()).trim();
    if (now === name) return;
    await p.getByTestId(order.indexOf(now) < order.indexOf(name) ? `${id}-next` : `${id}-prev`).click();
  }
}
/** Строки подсказки новичка (T.game.newbie). */
const NEWBIE = /положите любую карту|Бейте старшей|Бейте, переводите|Нечем побить|Подкиньте то же достоинство/;
const visible = (p: Page, id: string) => p.getByTestId(id).isVisible().catch(() => false);
const handCount = (p: Page) => p.locator('[data-testid^="hand-"]').count();

/** Играть до итога: сначала карты руки по очереди (ход, подкидывание, отбой, перевод), если ни одна
 *  не легла — «пас»/«бито», иначе «беру». Возвращает, сколько раз легла своя карта. */
async function playOut(p: Page, label: string): Promise<{ ended: boolean; played: number }> {
  let played = 0;
  const t0 = Date.now();
  for (let i = 0; i < 600; i++) {
    if (await visible(p, 'result')) { console.log(`  … ${label}: ${i} шагов, ${Math.round((Date.now() - t0) / 1000)} с`); return { ended: true, played }; }
    // пауза перед «бито»: стол не трогаем, пока его разглядывают (касание своей карты её кончает)
    if (await visible(p, 'held')) { await p.waitForTimeout(60); continue; }
    const before = await handCount(p);
    // сначала попробовать отбиться или походить картой — так проверяются касания карт
    const cards = p.locator('[data-testid^="hand-"]');
    const n = await cards.count();
    let moved = false;
    for (let k = 0; k < n && !moved; k++) {
      // бот кончил отбой, пока мы перебирали карты, — не трогаем стол паузы (касание кончает её)
      if (await visible(p, 'held')) break;
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
// пауза перед «бито» и «беру» (src/game/hold.ts): когда метка паузы появилась, что на столе и сколько она стояла
await page.addInitScript(() => {
  type Hold = { label: string; at: number; ms: number };
  const w = globalThis as unknown as { __holds: Hold[] };
  w.__holds = [];
  let cur: Hold | null = null;
  new MutationObserver(() => {
    const el = document.querySelector('[data-testid="held"]');
    if (el && !cur) { cur = { label: el.getAttribute('aria-label') ?? '', at: performance.now(), ms: -1 }; w.__holds.push(cur); }
    if (!el && cur) { cur.ms = performance.now() - cur.at; cur = null; }
  }).observe(document, { childList: true, subtree: true });
});
const holds = () => page.evaluate(() => (globalThis as unknown as { __holds: { label: string; ms: number }[] }).__holds);
try {
  await page.goto(`${web.url}?fast=1`);
  await page.getByTestId('menu').waitFor({ timeout: 20000 });
  ok(await page.getByText('Козырь').first().isVisible(), 'главный экран: название «Козырь»');
  // первая партия — подкидной вдвоём против «Начинающего» (спецификация 1.0, §3)
  ok(await page.getByTestId('level-value').innerText() === 'Начинающий', 'первый запуск: уровень «Начинающий»', await page.getByTestId('level-value').innerText());
  await page.screenshot({ path: `${OUT}/01-menu.png` });

  console.log('Правила');
  await page.getByTestId('rules-open').click();
  await page.getByTestId('rules').waitFor({ timeout: 5000 });
  for (const id of ['goal', 'deal', 'beat', 'throw', 'take', 'done', 'draw', 'transfer', 'end', 'draw-game']) {
    ok(await page.getByTestId(`rules-${id}`).count() === 1, `правила: раздел «${id}»`);
  }
  await page.getByTestId('rules-beat').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  ok(await page.getByTestId('rules-picture-beat').locator('canvas').count() === 1, 'правила: картинка отбоя — холст карт');
  ok(/Козырь бьёт только старший козырь/.test(await page.getByTestId('rules-beat').innerText()), 'правила: как бить — своими словами');
  ok(/В первом отбое партии переводить нельзя/.test(await page.getByTestId('rules-transfer').innerText()), 'правила: перевод — по своду (п. 6.6)');
  ok(!/Остались с картами: вы/.test(await page.getByTestId('rules').innerText()), 'правила — не экран итога');
  await page.screenshot({ path: `${OUT}/01-rules.png` });
  await page.getByTestId('rules-back').click();
  await page.getByTestId('menu').waitFor({ timeout: 5000 });

  console.log('Телефон 0.5.1: отступ снизу, постоянный стол, «колода», без помощи памяти');
  {
    const H = 780, INSET = 48;
    const ctx = await browser.newContext({ viewport: { width: 412, height: H } });
    const ph = await ctx.newPage();
    ph.on('pageerror', e => errors.push(String(e)));
    await ph.goto(`${web.url}?inset=${INSET}`); // без ?fast: боты думают как на телефоне
    await ph.getByTestId('menu').waitFor({ timeout: 20000 });
    // меню выше экрана — прокручиваем до конца: нижний ряд должен встать над кнопками телефона, а не под ними
    // (scrollIntoViewIfNeeded не прокручивает, если кнопка видна, пусть и под ними; scrollTo в RN-web — свой)
    await ph.getByTestId('menu').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await ph.waitForTimeout(200);
    const bar = await ph.getByTestId('play-bar').boundingBox();
    for (const id of ['store-open', 'settings-open']) {
      const b = await ph.getByTestId(id).boundingBox();
      ok(!!b && !!bar && b.y + b.height <= bar.y, `меню: «${id}» над полосой «Играть»`, `${JSON.stringify(b)} / ${JSON.stringify(bar)}`);
    }
    const pb = await ph.getByTestId('play').boundingBox();
    ok(!!pb && pb.y + pb.height <= H - INSET, 'меню: «Играть» над кнопками телефона', JSON.stringify(pb));
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

  console.log('Перетаскивание и подсказка (игра владельца 09.11.2026)');
  {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const ph = await ctx.newPage();
    ph.on('pageerror', e => errors.push(String(e)));
    // где карта нарисована на самом деле, кадр за кадром (PROBE в src/render/TableCanvas.tsx)
    await ph.addInitScript(() => {
      const w = globalThis as unknown as { __cardAt: (k: string, x: number, y: number) => void; __trace: Record<string, [number, number][]> };
      w.__trace = {};
      w.__cardAt = (k, x, y) => { (w.__trace[k] ??= []).push([x, y]); };
    });
    await ph.goto(`${web.url}?seed=11&fast=1`);
    await ph.getByTestId('menu').waitFor({ timeout: 20000 });
    await ph.getByTestId('play').click();
    await ph.getByTestId('game').waitFor({ timeout: 10000 });
    for (let i = 0; i < 50 && !(await visible(ph, 'advise')); i++) await ph.waitForTimeout(100);
    await ph.waitForTimeout(1600); // раздача
    // «Подсказка» — совет к этой минуте
    await ph.getByTestId('advise').click();
    let advice = '';
    for (let i = 0; i < 60 && !/^Ходите/.test(advice); i++) { advice = await ph.getByTestId('hint').innerText().catch(() => ''); await ph.waitForTimeout(100); }
    ok(/^Ходите/.test(advice), `подсказка: «${advice}»`, advice);
    const felt = (await ph.getByTestId('felt').boundingBox())!;
    const first = ph.locator('[data-testid^="hand-"]').first();
    const id = Number((await first.getAttribute('data-testid'))!.slice(5));
    const card = (await first.boundingBox())!;
    const plate = (await ph.getByTestId('opp-1').boundingBox())!;
    const clip = { x: plate.x, y: plate.y, width: plate.width, height: plate.height + 40 };
    const plateBefore = await ph.screenshot({ clip });
    // путь пальца: от карты руки через «Подсказку» на середину сукна
    const adv = (await ph.getByTestId('advise').boundingBox())!;
    const path = [
      [card.x + 8, card.y + card.height / 2],
      [adv.x + adv.width / 2, adv.y + adv.height / 2],
      [felt.x + felt.width / 2, felt.y + felt.height * 0.45],
    ];
    await ph.mouse.move(path[0][0], path[0][1]);
    await ph.mouse.down();
    let plateSame = true;
    for (let k = 1; k < path.length; k++) {
      for (let t = 1; t <= 8; t++) {
        const [ax, ay] = path[k - 1], [bx, by] = path[k];
        await ph.mouse.move(ax + ((bx - ax) * t) / 8, ay + ((by - ay) * t) / 8);
        await ph.waitForTimeout(25);
        if (k === 1 && t === 8) plateSame = Buffer.compare(plateBefore, await ph.screenshot({ clip })) === 0;
      }
    }
    ok(plateSame, 'над плашкой соперника нет второй карты, пока палец над кнопкой у руки');
    const drop = { x: path[2][0] - felt.x, y: path[2][1] - felt.y };
    await ph.evaluate(k => { (globalThis as unknown as { __trace: Record<string, unknown[]> }).__trace[k] = []; }, `c${id}`);
    await ph.mouse.up();
    await ph.waitForTimeout(120);
    // ход сделан: карты нет в руке (бот потом может и взять стол — тогда она уйдёт к нему)
    const laid = await ph.getByTestId(`hand-${id}`).count() === 0;
    await ph.waitForTimeout(380);
    const trace = await ph.evaluate(k => (globalThis as unknown as { __trace: Record<string, [number, number][]> }).__trace[k] ?? [], `c${id}`);
    const handY = card.y - felt.y + card.height / 2;
    const back = trace.filter(([, y]) => y > drop.y + 60);
    ok(trace.length > 0 && Math.hypot(trace[0][0] - drop.x, trace[0][1] - drop.y) < 30,
      `отпущенная карта на следующем кадре там, где её отпустили: (${trace[0]?.map(Math.round).join(', ')}) у (${Math.round(drop.x)}, ${Math.round(drop.y)})`, JSON.stringify(trace.slice(0, 4)));
    ok(back.length === 0, `карта не возвращается к руке (y ≈ ${Math.round(handY)}) и не летит оттуда второй раз`, JSON.stringify(back.slice(0, 4)));
    ok(laid, 'брошенная карта легла на стол');
    const after = await ph.getByTestId('hint').innerText().catch(() => '');
    ok(!/^Ходите/.test(after), `подсказка погасла после хода: «${after}»`, after);
    await ph.screenshot({ path: `${OUT}/02-drop.png` });
    await ctx.close();
  }

  console.log('Подкидной, один бот');
  await page.getByTestId('play').click();
  await page.getByTestId('game').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  ok(await page.locator('canvas').count() >= 1, 'стол — холст Skia');
  ok(await handCount(page) === 6, 'на руке шесть карт', await handCount(page));
  ok(await visible(page, 'opp-1'), 'соперник с подписью «бот»', await page.getByTestId('opp-1').innerText().catch(() => ''));
  const seat = await page.getByTestId('opp-1').innerText().catch(() => '');
  ok(/^Бот 1\s+Начинающий\s+\d+ карт/.test(seat.trim()), `место соперника — «Бот 1», «Начинающий», «N карт» строками (первая партия, спецификация §3): ${seat.replace(/\n/g, ' · ')}`, seat);
  // вдвоём бот всегда ходит или отбивается — его плашка с золотой кромкой
  ok(await page.getByTestId('opp-1').getAttribute('aria-selected').catch(() => null) === 'true', 'плашка ходящего соперника выделена');
  // первая партия: строка над рукой учит первые три отбоя (docs/09-game-design.md, «Первая партия»)
  let taught = '';
  for (let w = 0; w < 40 && !NEWBIE.test(taught); w++) {
    taught = await page.getByTestId('hint').innerText().catch(() => '');
    if (!NEWBIE.test(taught)) await page.waitForTimeout(100);
  }
  ok(NEWBIE.test(taught), `первая партия: подсказка новичка над рукой — «${taught}»`, taught);
  ok(!(await visible(page, 'dialog')), 'подсказка новичка — строкой, без окна');
  await page.screenshot({ path: `${OUT}/02-table.png` });
  const first = await playOut(page, 'подкидной');
  ok(first.ended, 'партия дошла до итога');
  ok(first.played > 0, `свои карты ложились касанием: ${first.played}`);
  await page.screenshot({ path: `${OUT}/03-result.png` });
  // итог — лист снизу: прижат к нижнему краю, стол над ним виден
  const sheet = await page.getByTestId('result').boundingBox();
  ok(!!sheet && sheet.y + sheet.height >= 915 - 2 && sheet.y > 915 / 2, `итог — лист снизу: ${sheet ? `${Math.round(sheet.y)}…${Math.round(sheet.y + sheet.height)}` : 'нет'}`, JSON.stringify(sheet));
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
  await checkReviewTable(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/03-review.png` });
  await page.getByTestId('review-back').click();
  await page.getByTestId('result').waitFor({ timeout: 5000 });

  await page.getByTestId('again').click();
  await page.waitForTimeout(400);
  ok(!(await visible(page, 'result')) && await handCount(page) > 0, '«Ещё партию» — новая раздача');
  {
    // вторая партия — без подсказок новичка: строку смотрим несколько раз, пока ходят боты
    const lines = new Set<string>();
    for (let w = 0; w < 15; w++) { lines.add(await page.getByTestId('hint').innerText().catch(() => '')); await page.waitForTimeout(100); }
    ok(![...lines].some(l => NEWBIE.test(l)), `вторая партия — без подсказок новичка: ${[...lines].filter(Boolean).join(' | ')}`);
  }

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
  await page.getByTestId('game-exit').click();
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
  await page.getByTestId('game-exit').click();
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
  // отчёт об ошибке: партия свёрнута одной строкой, касание раскрывает запись (аудит, находка 15)
  await page.getByTestId('report').scrollIntoViewIfNeeded();
  await page.getByTestId('report').click();
  await page.getByTestId('report-screen').waitFor({ timeout: 5000 });
  const gl = await page.getByTestId('report-game').innerText().catch(() => '');
  ok(/Партия: подкидной, 2 места, \d+ ход/.test(gl), `отчёт: партия одной строкой — «${gl.split('\n')[0]}»`, gl);
  ok(!(await visible(page, 'report-game-json')) && !/"deck"/.test(await page.getByTestId('report-preview').innerText()), 'отчёт: запись партии свёрнута');
  await page.getByTestId('report-game').click();
  ok(/"deck"/.test(await page.getByTestId('report-game-json').innerText().catch(() => '')), 'отчёт: касание раскрывает запись целиком');
  await page.screenshot({ path: `${OUT}/05-report.png` });
  await page.getByTestId('report-back').click();
  await page.getByTestId('settings').waitFor({ timeout: 5000 });
  await page.getByTestId('motion-on').click();
  await page.getByTestId('four').click();
  await page.getByTestId('memory').click();
  ok(await page.getByTestId('newbie').getAttribute('aria-checked').catch(() => null) === 'false', '«Подсказки для новичка» погасли после первой партии');
  await page.screenshot({ path: `${OUT}/05-settings.png` });
  await page.reload();
  await page.getByTestId('menu').waitFor({ timeout: 20000 });
  await page.getByTestId('settings-open').click();
  await page.waitForTimeout(300);
  ok(await page.getByTestId('motion-on').getAttribute('aria-selected').catch(() => null) === 'true', 'выбор «Меньше движения» пережил перезагрузку',
    await page.getByTestId('motion-on').getAttribute('aria-selected').catch(() => null));
  // «Подкидывать» (п. 4.3, #57): по умолчанию — по очереди; стол втроём ниже играет по очереди до итога
  ok(await page.getByTestId('throw-queue').getAttribute('aria-selected').catch(() => null) === 'true', 'настройка «Подкидывать»: по умолчанию «По очереди»');
  await page.getByTestId('settings-back').click();

  console.log('Переводной, два бота, четырёхцветная колода, без полёта');
  await page.getByTestId('variant-perevodnoy').click();
  await page.getByTestId('bots-2').click();
  await page.getByTestId('play').click();
  await page.getByTestId('game').waitFor({ timeout: 10000 });
  // перед первым переводным столом — окно «Что такое перевод», один раз; пока оно открыто, боты ждут
  await page.getByTestId('transfer-ok').waitFor({ timeout: 5000 }).catch(() => {});
  ok(await visible(page, 'transfer-ok'), 'первый переводной стол: окно «Что такое перевод»');
  ok(await page.getByTestId('transfer-picture').locator('canvas').count() === 1, 'в окне — картинка перевода из карт');
  const dealt = await handCount(page);
  await page.waitForTimeout(600);
  ok(await handCount(page) === dealt && await page.getByTestId('table').locator('[data-testid^="table-"]').count() === 0, 'пока окно открыто, боты не ходят');
  await page.screenshot({ path: `${OUT}/04-transfer-what.png` });
  await page.getByTestId('transfer-rules').click();
  await page.getByTestId('rules').waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  const tr = await page.getByTestId('rules-transfer').boundingBox();
  ok(!!tr && tr.y >= 0 && tr.y < 915 / 2, `«Правила перевода» открыли правила на разделе «Перевод»: y ${tr ? Math.round(tr.y) : '—'}`, JSON.stringify(tr));
  await page.getByTestId('rules-back').click();
  await page.getByTestId('game').waitFor({ timeout: 5000 });
  ok(!(await visible(page, 'transfer-ok')), 'из правил — обратно за стол, окно больше не показано');
  await page.waitForTimeout(300);
  ok(await visible(page, 'opp-2'), 'два соперника');
  ok(await visible(page, 'seen'), 'кнопка «Вышедшие» — с «Помощью памяти» из настроек');
  await page.getByTestId('seen').click();
  ok(await visible(page, 'seen-sheet'), 'таблица вышедших карт');
  await page.getByTestId('seen-close').click();
  const second = await playOut(page, 'переводной');
  ok(second.ended, 'партия втроём дошла до итога');
  {
    // отбой кончился картой (покрыта последняя, вдогонку — шестая): стол с ней виден, боты ждут паузу
    const hs = (await holds()).filter(h => h.ms >= 0);
    const covered = hs.filter(h => h.label.split(', ').some(pair => pair.includes(' ')));
    ok(hs.length > 0, `пауза перед «бито» и «беру»: ${hs.length} раз за партии`, JSON.stringify(hs.slice(0, 5)));
    ok(covered.length > 0, 'на столе паузы видна покрытая пара', JSON.stringify(hs.slice(0, 5)));
    ok(hs.some(h => h.ms >= 300), 'пауза стоит своё время: боты не ходят поверх неё', JSON.stringify(hs.map(h => Math.round(h.ms))));
  }
  await page.screenshot({ path: `${OUT}/04-perevodnoy.png` });
  await page.getByTestId('result-menu').click();
  await page.waitForTimeout(300);
  ok(!(await visible(page, 'resume')), 'законченной партии нет в «Продолжить»');
  await page.getByTestId('play').click();
  await page.getByTestId('game').waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  ok(!(await visible(page, 'transfer-ok')), 'второй переводной стол — без окна о переводе');
  await page.getByTestId('game-menu').click();
  await page.getByTestId('game-exit').click();
  await page.getByTestId('menu').waitFor({ timeout: 5000 });

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
  // графики (решение владельца 09.11.2026): у каждого — те же числа текстом
  const gamesN = Number((await page.getByTestId('stats-games').innerText()).match(/\d+/)![0]);
  const places = await page.locator('[aria-label^="Итог партий"]').first().getAttribute('aria-label').catch(() => null) ?? '';
  const placeSum = [...places.matchAll(/— (\d+)/g)].reduce((a, m) => a + Number(m[1]), 0);
  ok(await visible(page, 'stats-places') && placeSum === gamesN, `«Итог» — полоса мест, числа частей в подписи дают все партии: ${places}`);
  const formRow = await page.getByTestId('stats-form-row').innerText().catch(() => '');
  const formSum = [...formRow.matchAll(/— (\d+)/g)].reduce((a, m) => a + Number(m[1]), 0);
  ok(formSum === Math.min(20, gamesN), `форма последних партий — строкой: ${formRow}`);
  ok(/Рейтинг тренировок/.test(await page.getByTestId('stats-elo').innerText()), 'рейтинг тренировок');
  const vs = await page.locator('[data-testid^="stats-vs-"]').first().getAttribute('aria-label').catch(() => null) ?? '';
  ok(/вы вышли раньше — \d+, бот раньше — \d+/.test(vs), `против уровней — полосы с числами: ${vs}`);
  ok(/\d,\d/.test(await page.getByTestId('stats-avg-bouts').innerText().catch(() => '')), 'как вы играете — отбоев за партию числом');
  ok(/Козырей приходило/.test(await page.getByTestId('stats-trumps').innerText()), 'козыри вам и боту');
  ok(/Эта неделя/.test(await page.getByTestId('stats-table').innerText().catch(() => '')), 'по столам и неделям — таблица');
  await page.screenshot({ path: `${OUT}/06-stats-pro.png` });
  await page.locator('[data-testid^="stats-review-"]').first().click();
  await page.getByTestId('review').waitFor({ timeout: 5000 });
  ok(!(await visible(page, 'review-locked')), 'с «Про» — разбор любой партии');
  ok(await visible(page, 'review-table') || /не было выбора|Считаем/.test(await page.getByTestId('review').innerText()), 'разбор из статистики — тоже на столе');
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
  // уровень — одной строкой «‹ Средний ›» (аудит, находка 12); седьмой шаг закрыт; выбор запоминается
  await setLevel(page, 'Средний');
  await page.reload();
  await page.getByTestId('menu').waitFor({ timeout: 20000 });
  ok(await page.getByTestId('level-value').innerText() === 'Средний', 'уровень одной строкой: «Средний»', await page.getByTestId('level-value').innerText());
  await page.getByTestId('level-prev').click();
  ok(await page.getByTestId('level-value').innerText() === 'Любитель', '«‹» — уровень слабее: «Любитель»');
  ok(!(await visible(page, 'locked-note')), 'седьмой уровень закрыт');
  await setLevel(page, 'Мастер · скоро');
  ok(await visible(page, 'locked-note'), '«Мастер · скоро»: последний шаг объясняет, выбрать нельзя');
  ok(await page.getByTestId('level-next').isDisabled(), 'дальше седьмого шага стрелки нет');
  ok(await page.getByTestId('play').isDisabled(), 'на закрытом уровне «Играть» недоступна');
  await page.screenshot({ path: `${OUT}/08-level-locked.png` });

  console.log('Разные уровни: два бота, у каждого свой');
  await page.getByTestId('level-prev').click();
  await page.getByTestId('variant-podkidnoy').click();
  await page.getByTestId('bots-1').click();
  ok(!(await visible(page, 'levels-mixed')), 'с одним ботом «Разных уровней» нет');
  await page.getByTestId('bots-2').click();
  ok(await visible(page, 'levels-mixed') && await page.getByTestId('levels-mixed').getAttribute('aria-checked') === 'false', 'с двумя ботами — «Разные уровни», выключено');
  await setLevel(page, 'Любитель');
  await page.getByTestId('levels-mixed').click();
  ok(!(await visible(page, 'level-value')) && await visible(page, 'level-1-value') && await visible(page, 'level-2-value'), 'включили — строка у каждого бота вместо общей');
  ok(await page.getByTestId('level-1-value').innerText() === 'Любитель' && await page.getByTestId('level-2-value').innerText() === 'Любитель', 'строки ботов начинаются с общего уровня');
  await setLevel(page, 'Новичок', 'level-1');
  await setLevel(page, 'Средний', 'level-2');
  await setLevel(page, 'Мастер · скоро', 'level-2');
  ok(await visible(page, 'locked-note') && await page.getByTestId('play').isDisabled(), '«Мастер · скоро» в строке бота закрыт, «Играть» недоступна');
  await page.getByTestId('level-2-prev').click();
  await setLevel(page, 'Средний', 'level-2');
  await page.getByTestId('bots-3').click();
  ok(await visible(page, 'level-3-value'), 'три бота — три строки');
  await page.screenshot({ path: `${OUT}/10-levels-mixed.png` });
  // 360 × 740, три бота с разными уровнями: «Играть» — полосой внизу, на экране без прокрутки (аудит 09.11.2026, находка 7)
  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForTimeout(300);
  {
    const pb = await page.getByTestId('play').boundingBox();
    ok(!!pb && pb.y >= 0 && pb.y + pb.height <= 740, '360 × 740, три бота: «Играть» на экране без прокрутки', JSON.stringify(pb));
    await page.getByTestId('menu').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(200);
    const bar = await page.getByTestId('play-bar').boundingBox();
    const last = await page.getByTestId('settings-open').boundingBox();
    ok(!!bar && !!last && last.y + last.height <= bar.y, 'меню прокручено до конца: нижний ряд над полосой «Играть», а не под ней', `${JSON.stringify(last)} / ${JSON.stringify(bar)}`);
    await page.screenshot({ path: `${OUT}/10b-menu-360-bar.png` });
    await page.getByTestId('menu').evaluate(el => { el.scrollTop = 0; });
  }
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(300);
  await page.getByTestId('bots-2').click();
  await page.reload();
  await page.getByTestId('menu').waitFor({ timeout: 20000 });
  ok(await page.getByTestId('level-1-value').innerText() === 'Новичок' && await page.getByTestId('level-2-value').innerText() === 'Средний', 'разные уровни пережили перезагрузку');
  await page.getByTestId('play').click();
  await page.getByTestId('game').waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  const plate1 = await page.getByTestId('opp-1').innerText().catch(() => '');
  const plate2 = await page.getByTestId('opp-2').innerText().catch(() => '');
  ok(/Новичок/.test(plate1) && !/Средний/.test(plate1), `плашка бота 1 — «Новичок»: ${plate1.replace(/\n/g, ' ')}`);
  ok(/Средний/.test(plate2) && !/Новичок/.test(plate2), `плашка бота 2 — «Средний»: ${plate2.replace(/\n/g, ' ')}`);
  ok(await page.getByTestId('game-title').innerText().catch(() => '') === 'Подкидной', 'в верхней полосе — только стол, уровни — на плашках');
  await page.screenshot({ path: `${OUT}/10-levels-table.png` });
  const mixedGame = await playOut(page, 'разные уровни');
  ok(mixedGame.ended, 'партия с ботами разных уровней дошла до итога');
  await page.getByTestId('result-menu').click();
  await page.getByTestId('menu').waitFor({ timeout: 5000 });
  await page.getByTestId('stats-open').click();
  await page.getByTestId('stats').waitFor({ timeout: 5000 });
  const statsText = await page.getByTestId('stats').innerText().catch(() => '');
  const mixedRow = await page.locator('[aria-label^="Разные уровни:"]').first().getAttribute('aria-label').catch(() => null) ?? '';
  ok(/Разные уровни: 1 партия/.test(mixedRow), 'статистика: стол с разными уровнями — своей строкой таблицы', mixedRow);
  const vsNovice = await page.getByTestId('stats-vs-novice').getAttribute('aria-label').catch(() => null) ?? '';
  ok(/Новичок: вы вышли раньше/.test(vsNovice), `против уровней: бот стола с разными уровнями — под своим уровнем: ${vsNovice}`);
  ok(/Новичок, Средний/.test(statsText), 'последние партии: уровни ботов по местам');
  await page.getByTestId('stats-back').click();
  await page.getByTestId('menu').waitFor({ timeout: 5000 });
  // незаконченная партия прошлой версии (один `level`) не переносится: её нет, меню без «Продолжить», ошибок нет
  await page.evaluate(() => localStorage.setItem('durak.current', JSON.stringify({ record: { v: 1, seats: 2, actions: [] }, level: 'amateur', history: [] })));
  await page.reload();
  await page.getByTestId('menu').waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  ok(!(await visible(page, 'resume')), 'партия прошлой версии стёрта молча: «Продолжить» нет');
  ok(await page.evaluate(() => localStorage.getItem('durak.current')) === null, 'запись прошлой версии удалена из хранилища');

  console.log('«Сдаться» втроём (docs/08-rules.md, п. 8; #58)');
  await page.getByTestId('bots-2').click();
  await page.getByTestId('play').click();
  await page.getByTestId('game').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  await page.getByTestId('game-menu').click();
  ok(await visible(page, 'resign') && await visible(page, 'game-exit'), '«В меню» — окно партии: «В меню» и «Сдаться»');
  await page.getByTestId('resign').click();
  ok(await visible(page, 'resign-ok'), '«Сдаться» спрашивает своим окном');
  const asked = await handCount(page);
  await page.waitForTimeout(500);
  ok(await handCount(page) === asked, 'пока окно открыто, боты ждут');
  await page.screenshot({ path: `${OUT}/11-resign-ask.png` });
  await page.getByTestId('dialog-cancel').click();
  ok(!(await visible(page, 'resign-ok')) && !(await visible(page, 'result')), '«Играть дальше» — партия идёт');
  await page.getByTestId('game-menu').click();
  await page.getByTestId('resign').click();
  await page.getByTestId('resign-ok').click();
  await page.getByTestId('result').waitFor({ timeout: 10000 }).catch(() => {});
  const gaveUp = await page.getByTestId('result').innerText().catch(() => '');
  ok(/Вы сдались — остались с картами/.test(gaveUp), `сдались — итог сразу, боты доиграли без вас: ${gaveUp.split('\n')[0]}`);
  const lastPlace = await page.getByTestId('place-3').innerText().catch(() => '');
  ok(/вы/.test(lastPlace) && /с картами/.test(lastPlace), `в ряду мест вы — последним, «с картами»: ${lastPlace.replace(/\n/g, ' ')}`);
  await page.screenshot({ path: `${OUT}/12-resign-result.png` });
  await page.getByTestId('result-menu').click();
  await page.getByTestId('menu').waitFor({ timeout: 5000 });

  console.log('«Опытный» и подсказка');
  await page.getByTestId('variant-podkidnoy').click();
  await page.getByTestId('bots-1').click();
  await setLevel(page, 'Опытный');
  ok(!(await visible(page, 'locked-note')) && await page.getByTestId('play').isEnabled(), '«‹» с закрытого — «Опытный», можно играть');
  await page.getByTestId('play').click();
  await page.getByTestId('game').waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  ok(/Опытный/.test(await page.getByTestId('game').innerText().catch(() => '')), 'за столом «Опытный»');
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
  ok(/Ходите|Подкиньте|Побейте|Переведите|Берите|Пас|Бито/.test(advised), `подсказка «Опытного»: ${advised}`, advised);
  await page.screenshot({ path: `${OUT}/06-advice.png` });
  const third = await playOut(page, 'против «Опытного»');
  ok(third.ended, 'партия с «Опытным» дошла до итога');

  console.log('«Замер» (быстрый)');
  await page.goto(`${web.url}?fast=1&bench=quick`);
  await page.getByTestId('menu').waitFor({ timeout: 20000 });
  await page.getByTestId('settings-open').click();
  await page.getByTestId('settings').waitFor({ timeout: 5000 });
  await page.getByTestId('version').scrollIntoViewIfNeeded();
  // скрытый вход: долгое нажатие на версию
  const ver = (await page.getByTestId('version').boundingBox())!;
  await page.mouse.move(ver.x + ver.width / 2, ver.y + ver.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1000);
  await page.mouse.up();
  await page.getByTestId('bench').waitFor({ timeout: 5000 }).catch(() => {});
  ok(await visible(page, 'bench'), '«Замер» открывается долгим нажатием на версию');
  await page.getByTestId('bench-run').click();
  await page.getByTestId('bench-copy').waitFor({ timeout: 120000 }).catch(() => {});
  const bench = await page.getByTestId('bench-result').innerText().catch(() => '');
  ok(['Раздача вчетвером', '«Беру» с 12 картами', '36 карт в полёте', '«Опытный» думает'].every(t => bench.includes(t)) && /решение: 1 поз\./.test(bench),
    '«Замер»: четыре сцены и время решения «Опытного»', bench);
  ok(/UI: кадров [1-9]/.test(bench) && /JS: кадров [1-9]/.test(bench), '«Замер»: кадры обоих потоков сосчитаны', bench);
  console.log(bench.split('\n').map(l => `      ${l}`).join('\n'));
  await page.screenshot({ path: `${OUT}/09-bench.png` });
  await page.getByTestId('bench-back').click();
  await page.getByTestId('settings').waitFor({ timeout: 5000 });
} finally {
  ok(errors.length === 0, 'ошибок в консоли нет', errors.join('\n'));
  await browser.close();
  web.stop();
}
console.log(failures ? `Провалов: ${failures}` : 'Сценарий пройден.');
process.exit(failures ? 1 : 0);
