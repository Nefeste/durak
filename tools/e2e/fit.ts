/**
 * «Ни одной обрезанной надписи» (docs/13-art.md, §3 «Надписи целиком»; владелец 09.11.2026): прогон по экранам и
 * состояниям стола на двух телефонах — 360 × 740 и 412 × 915 — с обычным шрифтом и крупным ×1,3 (шрифт телефона
 * в браузере не меняется — проверка увеличивает шрифт каждой надписи на месте, меряет и возвращает). У каждой видимой
 * надписи: текст помещается в свою рамку (`scrollWidth ≤ clientWidth`, `scrollHeight ≤ clientHeight`), не уходит
 * за край родителя, который обрезает (`overflow: hidden`), и за край экрана; многоточие (`text-overflow: ellipsis`)
 * не действует. Падает с экраном, шириной, шрифтом и самой надписью.
 *
 *   EXPO_OFFLINE=1 npm run export:web
 *   NODE_PATH=/opt/node22/lib/node_modules bun tools/e2e/fit.ts            # без сети: меню, стол на 2–4, итог, разбор, …
 *   EXPO_PUBLIC_DURAK_SERVER=http://127.0.0.1:8796 EXPO_OFFLINE=1 npx expo export -p web --output-dir dist-web-online --clear
 *   DURAK_WEB_DIR=dist-web-online NODE_PATH=/opt/node22/lib/node_modules bun tools/e2e/fit.ts --online   # онлайн: профиль, столы, схема мест
 *
 * `--shots <папка>` — снимок каждого состояния (для аудита и листа «до — после»).
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { serveWeb } from './serve';

/** Крупный шрифт телефона, при котором надписи обязаны помещаться (`maxFontSizeMultiplier` кнопок — тот же). */
export const FONT_SCALES = [1, 1.3] as const;
export const PHONES = [{ width: 360, height: 740 }, { width: 412, height: 915 }] as const;

export type Misfit = { text: string; why: string };

/** Надписи, чей рост с шрифтом телефона приложение ограничивает сильнее ×1,3 (`maxFontSizeMultiplier`; в браузер он
 *  не доходит, поэтому — список по testID). */
export const FONT_CAPS: Record<string, number> = { 'game-title': 1.15, 'online-title': 1.15 };

/** Ждёт, пока раскладка перестанет меняться: высоты всех прокручиваемых областей одинаковы два замера подряд через 500 мс. */
async function settle(page: Page, limit = 6000) {
  const sig = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('*')]
    .filter(e => e.scrollHeight > e.clientHeight + 1).map(e => e.scrollHeight).join(','));
  let last = await sig();
  for (let t = 0; t < limit; t += 500) {
    await page.waitForTimeout(500);
    const now = await sig();
    if (now === last) return;
    last = now;
  }
}

/** Все обрезанные надписи на странице при шрифте ×`scale`: шрифт каждой надписи растёт на месте, раскладка, которая
 *  меряет себя сама (`onLayout`), успевает подстроиться, потом проверка, и шрифт возвращается. */
export async function misfits(page: Page, scale: number): Promise<Misfit[]> {
  if (scale !== 1) {
    await page.evaluate(([k, caps]: [number, Record<string, number>]) => {
      const all = [...document.querySelectorAll<HTMLElement>('[dir="auto"], [dir="auto"] span')];
      const sizes = all.map(e => { const s = getComputedStyle(e); return [parseFloat(s.fontSize), s.lineHeight] as const; });
      (window as unknown as { __fit: [HTMLElement, string, string][] }).__fit = all.map(e => [e, e.style.fontSize, e.style.lineHeight]);
      all.forEach((e, i) => {
        const [fs, lh] = sizes[i];
        const id = e.closest('[data-testid]')?.getAttribute('data-testid') ?? '';
        const kk = Math.min(k, caps[id] ?? k);
        e.style.fontSize = `${fs * kk}px`;
        if (lh !== 'normal') e.style.lineHeight = `${parseFloat(lh) * kk}px`;
      });
    }, [scale, FONT_CAPS] as [number, Record<string, number>]);
    // подписи картинок «Правил» меряют себя через onLayout: на тяжёлом экране под нагрузкой (другие прогоны в том же
    // контейнере) и секунды не хватало. Ждём, пока раскладка успокоится: высоты прокрутки не меняются полсекунды
    // (не дольше 6 с) — проверка та же, только не раньше, чем экран дорисован
    await page.waitForTimeout(1000);
    await settle(page);
  }
  const out = await page.evaluate(() => {
    const texts = [...document.querySelectorAll<HTMLElement>('[dir="auto"]')].filter(e => e.tagName !== 'INPUT' && e.tagName !== 'TEXTAREA');
    const out: { text: string; why: string }[] = [];
    const W = window.innerWidth;
    const hands = [...document.querySelectorAll<HTMLElement>('[data-testid^="hand-"]')].filter(h => h.checkVisibility()).map(h => h.getBoundingClientRect());
    for (const e of texts) {
      const text = (e.innerText || '').trim();
      if (!text || text === '\u00A0') continue;
      if (!e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const box = e.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      const s = getComputedStyle(e);
      const range = document.createRange();
      range.selectNodeContents(e);
      const glyphs = range.getBoundingClientRect();
      // рамка букв включает пробел в конце перенесённой строки: по ширине допуск — 0,4 кегля
      const tx = Math.max(2, parseFloat(s.fontSize) * 0.4);
      const reasons: string[] = [];
      if (e.scrollWidth > e.clientWidth + 1) reasons.push(`шире своей рамки: ${e.scrollWidth} > ${e.clientWidth}`);
      if (e.scrollHeight > e.clientHeight + 1) reasons.push(`выше своей рамки: ${e.scrollHeight} > ${e.clientHeight}`);
      if (s.textOverflow === 'ellipsis' && reasons.length) reasons.push('многоточие');
      // родитель, который обрезает: надпись уходит за его край
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        const as = getComputedStyle(a);
        const clipX = as.overflowX === 'hidden' || as.overflowX === 'clip';
        const clipY = as.overflowY === 'hidden' || as.overflowY === 'clip';
        if (!clipX && !clipY) continue;
        const r = a.getBoundingClientRect();
        if (clipX && (glyphs.left < r.left - tx || glyphs.right > r.right + tx)) { reasons.push(`уходит за край ${a.getAttribute('data-testid') ?? a.tagName.toLowerCase()} по ширине: ${Math.round(glyphs.left)}…${Math.round(glyphs.right)} при ${Math.round(r.left)}…${Math.round(r.right)}`); break; }
        if (clipY && (glyphs.top < r.top - 1 || glyphs.bottom > r.bottom + 1)) { reasons.push(`уходит за край ${a.getAttribute('data-testid') ?? a.tagName.toLowerCase()} по высоте`); break; }
      }
      // вылезает из своего места (плашки, ячейки), даже если оно не обрезает
      const par = e.parentElement?.getBoundingClientRect();
      if (par && par.width > 0 && !reasons.length && (glyphs.left < par.left - tx || glyphs.right > par.right + tx || glyphs.top < par.top - 2 || glyphs.bottom > par.bottom + 2)) {
        reasons.push(`вылезает из ${e.parentElement?.getAttribute('data-testid') ?? 'своего места'}: ${Math.round(glyphs.left)}…${Math.round(glyphs.right)} × ${Math.round(glyphs.top)}…${Math.round(glyphs.bottom)} при ${Math.round(par.left)}…${Math.round(par.right)} × ${Math.round(par.top)}…${Math.round(par.bottom)}`);
      }
      // лежит на карте руки (подсказка над рукой, растущая вниз; строка задачи дня)
      // окно и лист итога лежат поверх стола вместе с рукой — их надписи не на картах, а над ними
      const above = !!e.closest('[aria-modal="true"], [role="dialog"], [data-testid="result"]');
      for (const h of above ? [] : hands) {
        if (Math.min(glyphs.right, h.right) - Math.max(glyphs.left, h.left) > 2 && Math.min(glyphs.bottom, h.bottom) - Math.max(glyphs.top, h.top) > 2) {
          reasons.push(`на карте руки: низ надписи ${Math.round(glyphs.bottom)}, верх карты ${Math.round(h.top)}`); break;
        }
      }
      // за край экрана — если не внутри прокрутки вбок
      let sideScroll = false;
      for (let a = e.parentElement; a; a = a.parentElement) { const ox = getComputedStyle(a).overflowX; if (ox === 'auto' || ox === 'scroll') { sideScroll = true; break; } }
      if (!sideScroll && (glyphs.left < -1 || glyphs.right > W + tx)) reasons.push(`за краем экрана: ${Math.round(glyphs.left)}…${Math.round(glyphs.right)} из ${W}`);
      if (reasons.length) out.push({ text: text.replace(/[\s\u200B]+/g, ' ').slice(0, 80), why: reasons.join('; ') });
    }
    return out;
  });
  if (scale !== 1) {
    await page.evaluate(() => {
      const w = window as unknown as { __fit?: [HTMLElement, string, string][] };
      for (const [e, fs, lh] of w.__fit ?? []) { e.style.fontSize = fs; e.style.lineHeight = lh; }
      delete w.__fit;
    });
    await page.waitForTimeout(300);
  }
  return out;
}

/** Кнопки, у которых зона касания меньше 48 × 48 dp (с учётом `hitSlop` не считается — для аудита, не для провала). */
export async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[role="button"], [role="switch"], [role="checkbox"]')]
    // карты руки и стола — полоски над холстом, их касание ловит стол целиком
    .filter(e => e.checkVisibility() && !/^(hand|table)-/.test(e.getAttribute('data-testid') ?? ''))
    .map(e => ({ e, r: e.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.width < 47.5 || r.height < 47.5))
    .map(({ e, r }) => `${e.getAttribute('data-testid') ?? (e.innerText || '?').trim().slice(0, 30)} ${Math.round(r.width)}×${Math.round(r.height)}`));
}

// —— прогон ——

const ONLINE = process.argv.includes('--online');
const SHOTS = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null; })();
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const failures: string[] = [];
const targets = new Map<string, Set<string>>();
let checked = 0;

async function check(page: Page, phone: { width: number }, screen: string) {
  await page.waitForTimeout(350);
  for (const k of FONT_SCALES) {
    for (const m of await misfits(page, k)) failures.push(`${screen} · ${phone.width} dp · шрифт ×${k}: «${m.text}» — ${m.why}`);
  }
  for (const t of await smallTargets(page)) {
    const key = t.split(' ')[0].replace(/-\d+$/, '');
    const set = targets.get(key) ?? new Set();
    set.add(`${screen}: ${t}`);
    targets.set(key, set);
  }
  checked++;
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${phone.width}-${screen.replace(/[^\p{L}\p{N}]+/gu, '-')}.png` });
}

const visible = (p: Page, id: string) => p.getByTestId(id).isVisible().catch(() => false);
const hand = (p: Page) => p.locator('[data-testid^="hand-"]');
/** Лист итога уже на странице, хоть ещё выезжает: дальше руки не касаться — касание попадёт в его «В меню». */
const over = (p: Page) => p.getByTestId('result').count().then(n => n > 0).catch(() => false);

async function playOne(p: Page): Promise<boolean> {
  const n = await hand(p).count();
  for (let k = 0; k < n; k++) {
    if (await visible(p, 'held') || await over(p)) return false;
    await hand(p).nth(k).click({ force: true, timeout: 800 }).catch(() => {});
    await p.waitForTimeout(30);
    if (await visible(p, 'transfer')) await p.getByTestId('transfer').click().catch(() => {});
    if (/Какую карту бить|Коснитесь карты/.test(await p.getByTestId('hint').innerText().catch(() => ''))) {
      await p.getByTestId('table').locator('[data-testid^="table-"]').first().click({ force: true }).catch(() => {});
    }
    if (await hand(p).count() < n) return true;
  }
  return false;
}
async function stepOnce(p: Page) {
  if (await visible(p, 'held')) { await p.waitForTimeout(60); return; }
  if (!(await playOne(p)) && !(await over(p))) {
    if (await visible(p, 'pass')) await p.getByTestId('pass').click().catch(() => {});
    else if (await visible(p, 'take')) await p.getByTestId('take').click().catch(() => {});
  }
  await p.waitForTimeout(100);
}
async function until(p: Page, re: RegExp, steps = 80): Promise<boolean> {
  for (let i = 0; i < steps; i++) {
    if (re.test(await p.getByTestId('hint').innerText().catch(() => ''))) return true;
    if (await over(p)) return false;
    await stepOnce(p);
  }
  return false;
}
async function toEnd(p: Page): Promise<boolean> {
  const t0 = Date.now();
  for (let i = 0; i < 3000 && Date.now() - t0 < 600_000 && !(await over(p)); i++) await stepOnce(p);
  return p.getByTestId('result').waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
}
/** Из партии в меню: «В меню» итога или верхней полосы — что есть (итог мог выйти, пока ждали). */
async function leaveTable(p: Page) {
  for (let i = 0; i < 40; i++) {
    for (const id of ['result-menu', 'game-menu', 'game-exit']) {
      if (await visible(p, id)) { await p.getByTestId(id).click().catch(() => {}); if (await p.getByTestId('menu').isVisible().catch(() => false)) return; }
    }
    if (await p.getByTestId('menu').isVisible().catch(() => false)) return;
    await p.waitForTimeout(250);
  }
}
/** Строка уровня `id` — до самого длинного названия уровня («Начинающий»). */
async function longestLevel(p: Page, id: string) {
  for (let k = 0; k < 8 && (await p.getByTestId(`${id}-value`).innerText()).trim() !== 'Начинающий'; k++) {
    const now = (await p.getByTestId(`${id}-value`).innerText()).trim();
    await p.getByTestId(now === 'Новичок' ? `${id}-next` : `${id}-prev`).click();
  }
}

async function offline(browser: Browser, url: string, phone: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport: phone, locale: 'ru-RU' });
  const p = await ctx.newPage();
  await p.goto(`${url}?fast=1`);
  await p.getByTestId('menu').waitFor({ timeout: 20_000 });
  await check(p, phone, 'меню');

  await p.getByTestId('rules-open').click();
  await p.getByTestId('rules').waitFor({ timeout: 5000 });
  await p.waitForTimeout(600);
  await check(p, phone, 'правила');
  await p.getByTestId('rules-back').click();

  // первая партия: один бот, подсказки новичка
  await p.getByTestId('play').click();
  await p.getByTestId('game').waitFor({ timeout: 10_000 });
  await p.waitForTimeout(1200);
  await check(p, phone, 'стол вдвоём');
  await until(p, /Отбивайтесь|Побейте|Бейте|Нечем побить/);
  await check(p, phone, 'стол вдвоём, отбой');
  if (await toEnd(p)) {
    await check(p, phone, 'итог');
    for (let w = 0; w < 120 && /Считаем/.test(await p.getByTestId('result-worst').innerText().catch(() => 'Считаем')); w++) await p.waitForTimeout(250);
    await check(p, phone, 'итог с главной ошибкой');
    if (await visible(p, 'result-review')) {
      await p.getByTestId('result-review').click();
      await p.getByTestId('review').waitFor({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(800);
      await check(p, phone, 'разбор');
      await p.getByTestId('review-back').click();
    }
    await p.getByTestId('result-menu').click();
  } else failures.push(`стол вдвоём · ${phone.width} dp: партия не дошла до итога`);
  await p.getByTestId('menu').waitFor({ timeout: 5000 });

  // меню: два и три бота, «Разные уровни» с самыми длинными названиями, закрытый седьмой уровень
  await p.getByTestId('bots-2').click();
  await check(p, phone, 'меню, два бота');
  await p.getByTestId('levels-mixed').click();
  for (const r of [1, 2]) await longestLevel(p, `level-${r}`);
  await check(p, phone, 'меню, два бота, разные уровни');
  await p.getByTestId('bots-3').click();
  for (const r of [1, 2, 3]) await longestLevel(p, `level-${r}`);
  await check(p, phone, 'меню, три бота, разные уровни');
  for (let k = 0; k < 7 && await p.getByTestId('level-3-next').isEnabled().catch(() => false); k++) await p.getByTestId('level-3-next').click();
  await check(p, phone, 'меню, закрытый уровень');
  await longestLevel(p, 'level-3');

  // стол вчетвером: три бота «Начинающий» — самые длинные плашки
  await p.getByTestId('play').click();
  await p.getByTestId('game').waitFor({ timeout: 10_000 });
  await p.waitForTimeout(1200);
  await check(p, phone, 'стол вчетвером');
  await until(p, /Отбивайтесь|Побейте|Бейте|Нечем побить|Подкиньте/);
  await check(p, phone, 'стол вчетвером, ход');
  if (await visible(p, 'advise')) { await p.getByTestId('advise').click(); await p.waitForTimeout(1500); await check(p, phone, 'стол вчетвером, подсказка'); }
  await p.getByTestId('game-menu').click();
  await check(p, phone, 'окно «В меню» партии');
  await p.getByTestId('game-exit').click();
  await p.getByTestId('menu').waitFor({ timeout: 5000 });

  // настройки: «Помощь памяти» — для «Вышедших»; отчёт; потом переводной втроём с окном «Что такое перевод»
  await p.getByTestId('settings-open').click();
  await p.getByTestId('settings').waitFor({ timeout: 5000 });
  await check(p, phone, 'настройки');
  await p.getByTestId('memory').click();
  await p.getByTestId('report').click().catch(() => {});
  await p.waitForTimeout(400);
  if (await visible(p, 'report-screen')) {
    await check(p, phone, 'отчёт об ошибке');
    if (await visible(p, 'report-game')) { await p.getByTestId('report-game').click(); await check(p, phone, 'отчёт, партия раскрыта'); }
    await p.getByTestId('report-back').click();
  }
  await p.getByTestId('settings-back').click();
  await p.getByTestId('variant-perevodnoy').click();
  await p.getByTestId('bots-2').click();
  for (const r of [1, 2]) await longestLevel(p, `level-${r}`);
  await p.getByTestId('play').click();
  await p.getByTestId('game').waitFor({ timeout: 10_000 });
  if (await p.getByTestId('transfer-ok').waitFor({ timeout: 3000 }).then(() => true, () => false)) {
    await check(p, phone, 'окно «Что такое перевод»');
    await p.getByTestId('transfer-ok').click();
  }
  await p.waitForTimeout(1000);
  await check(p, phone, 'стол втроём, переводной');
  if (await visible(p, 'seen')) { await p.getByTestId('seen').click(); await check(p, phone, 'вышедшие карты'); await p.getByTestId('seen-close').click(); }
  if (await toEnd(p)) await check(p, phone, 'итог втроём');
  else console.log(`  … ${phone.width} dp: переводной втроём не дошёл до итога за 10 минут — итог втроём не проверен`);
  await leaveTable(p);
  await p.getByTestId('menu').waitFor({ timeout: 5000 });

  await p.getByTestId('store-open').click();
  await p.getByTestId('store').waitFor({ timeout: 5000 });
  await check(p, phone, 'магазин');
  await p.getByTestId('store-back').click();
  await p.getByTestId('stats-open').click();
  await p.getByTestId('stats').waitFor({ timeout: 5000 });
  await check(p, phone, 'статистика');
  await p.getByTestId('stats-back').click();
  await p.getByTestId('puzzle-open').click();
  await p.getByTestId('puzzle').waitFor({ timeout: 5000 });
  await p.waitForTimeout(600);
  await check(p, phone, 'задача дня');
  await p.getByTestId('puzzle-answer').click().catch(() => {});
  await p.waitForTimeout(1500);
  await check(p, phone, 'задача дня, ответ');
  await p.getByTestId('puzzle-archive').click();
  await check(p, phone, 'архив задач');
  await p.getByTestId('puzzle-back').click();
  await p.getByTestId('puzzle-back').click();
  await p.getByTestId('menu').waitFor({ timeout: 5000 });

  // онлайн без сервера: профиль — отметка 14 лет и имя
  await p.getByTestId('friends-open').click();
  await p.getByTestId('online-profile').waitFor({ timeout: 10_000 }).catch(() => {});
  await check(p, phone, 'онлайн: профиль');
  await p.getByTestId('adult').click().catch(() => {});
  await check(p, phone, 'онлайн: профиль, имя');
  await ctx.close();
}

async function online(browser: Browser, url: string, phone: { width: number; height: number }, port: number) {
  const ctx = await browser.newContext({ viewport: phone, locale: 'ru-RU' });
  const a = await ctx.newPage();
  const ctxB = await browser.newContext({ viewport: phone, locale: 'ru-RU' });
  const b = await ctxB.newPage();
  // сервер недоступен: честная ошибка с «Повторить»
  let broken = true;
  await ctx.route(`http://127.0.0.1:${port}/v1/**`, r => (broken ? r.fulfill({ status: 502, body: '502' }) : r.continue()));
  for (const [p, nick] of [[a, 'Константин'], [b, 'Александра123456']] as const) {
    await p.goto(url, { waitUntil: 'networkidle' });
    await p.getByTestId('menu').waitFor({ timeout: 20_000 });
    await p.getByTestId('friends-open').click();
    await p.getByTestId('online-profile').waitFor({ timeout: 10_000 });
    await p.getByTestId('adult').click();
    await p.getByTestId('name').fill(nick);
    await p.getByTestId('name-save').click();
    if (p === a) {
      await p.getByTestId('online-error').waitFor({ timeout: 20_000 }).catch(() => {});
      await check(p, phone, 'онлайн: сервер недоступен');
      broken = false;
      await p.getByTestId('online-retry').click();
    }
    await p.getByTestId('friends').waitFor({ timeout: 15_000 });
  }
  await check(a, phone, 'онлайн: с друзьями');
  await a.getByTestId('f-seats-4').click();
  // самое длинное название уровня — «Начинающий»: с «Среднего» два шага «‹»
  for (let i = 0; i < 2; i++) await a.getByTestId('f-level-prev').click().catch(() => {});
  await check(a, phone, 'онлайн: с друзьями, вчетвером');
  await a.getByTestId('create').click();
  await a.getByTestId('lobby').waitFor({ timeout: 10_000 });
  await a.waitForTimeout(600);
  await check(a, phone, 'онлайн: стол собирается');
  const code = (await a.getByTestId('table-code').innerText()).trim();
  await b.getByTestId('code').fill(code);
  await b.getByTestId('join').click();
  await b.getByTestId('pick-seat').waitFor({ timeout: 10_000 });
  await check(b, phone, 'онлайн: выбор места');
  await b.getByTestId('sit-2').click();
  await b.getByTestId('lobby').waitFor({ timeout: 10_000 });
  await a.waitForTimeout(2000);
  await check(a, phone, 'онлайн: стол собирается, гость сел');
  await check(b, phone, 'онлайн: гость за столом');
  await a.getByTestId('start').click();
  await a.getByTestId('online-game').waitFor({ timeout: 10_000 });
  await b.getByTestId('online-game').waitFor({ timeout: 10_000 });
  await a.waitForTimeout(1500);
  await check(a, phone, 'онлайн: стол вчетвером');
  await check(b, phone, 'онлайн: стол вчетвером, у гостя');
  await a.getByTestId('online-exit').click();
  await a.getByTestId('menu').waitFor({ timeout: 10_000 }).catch(() => {});
  await b.waitForTimeout(2500);
  await check(b, phone, 'онлайн: хозяин ушёл — за него бот');
  await b.getByTestId('online-exit').click().catch(() => {});
  await b.getByTestId('menu').waitFor({ timeout: 10_000 }).catch(() => {});
  await a.getByTestId('quick-open').click();
  await a.getByTestId('quick').waitFor({ timeout: 10_000 });
  await check(a, phone, 'онлайн: быстрая игра');
  await a.getByTestId('quick-find').click();
  await a.waitForTimeout(800);
  await check(a, phone, 'онлайн: быстрая игра, поиск');
  await ctx.close();
  await ctxB.close();
}

if (import.meta.main) {
  const PORT = 8796;
  const srv = ONLINE ? (await import('../../server/src/app')).createApp({ db: ':memory:' }).serve(PORT) : null;
  const web = serveWeb();
  console.log(`Надписи целиком${ONLINE ? ', онлайн' : ''}: сборка ${web.bundle}`);
  const browser = await chromium.launch();
  try {
    for (const phone of PHONES) {
      console.log(`  телефон ${phone.width} × ${phone.height}`);
      if (ONLINE) await online(browser, web.url, phone, PORT);
      else await offline(browser, web.url, phone);
    }
  } finally {
    await browser.close();
    srv?.stop();
    web.stop();
  }
  if (targets.size) {
    console.log('\nЗоны касания меньше 48 dp (для аудита):');
    for (const set of targets.values()) console.log(`  ${[...set][0]}${set.size > 1 ? ` (и ещё ${set.size - 1})` : ''}`);
  }
  const uniq = [...new Set(failures)];
  console.log(uniq.length ? `\nОбрезано (${uniq.length}):\n${uniq.map(f => `  ✗ ${f}`).join('\n')}` : `\n  ✓ ${checked} состояний × 2 шрифта: ни одной обрезанной надписи`);
  process.exit(uniq.length ? 1 : 0);
}
