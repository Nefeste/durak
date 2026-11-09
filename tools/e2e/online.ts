/**
 * Браузерный прогон онлайна (этап Г): сервер «Козыря» в этом же процессе, два браузера — два
 * телефона. Отметка «Мне есть 14 лет» и имя, стол на троих с ботом «Новичок», вход по коду, партия
 * настоящими касаниями до итога, «Колода проверена» у обоих, «Реванш» — новая партия; затем быстрая
 * игра: оба ищут подкидного, пара найдена, сдача — итог у соперника. Сначала — сервер отвечает 502 (как на
 * машине 08.11.2026): «Сервер недоступен, попробуйте позже», «Повторить» после починки проходит, «Назад» открыт. Ловит пустой экран, утечку
 * чужих карт в DOM (на руке — только свои), зависшую партию и ошибки в консоли. Снимки — в
 * tools/e2e/out/online-*.png.
 *
 *   EXPO_PUBLIC_DURAK_SERVER=http://127.0.0.1:8796 EXPO_OFFLINE=1 npx expo export -p web --output-dir dist-web-online --clear
 *   DURAK_WEB_DIR=dist-web-online NODE_PATH=/opt/node22/lib/node_modules bun tools/e2e/online.ts
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createApp } from '../../server/src/app';
import { serveWeb } from './serve';

const PORT = 8796;
let failures = 0;
function ok(cond: boolean, what: string, detail?: unknown) {
  if (cond) { console.log(`  ✓ ${what}`); return; }
  failures++;
  console.log(`  ✗ ${what}${detail === undefined ? '' : `\n      ${String(detail).slice(0, 300)}`}`);
}
const OUT = 'tools/e2e/out';
mkdirSync(OUT, { recursive: true });
const visible = (p: Page, id: string) => p.getByTestId(id).isVisible().catch(() => false);
const hand = (p: Page) => p.locator('[data-testid^="hand-"]');

/** Одно своё действие, если оно есть: карта руки, «перевести», цель на столе, иначе «пас»/«беру». */
async function step(p: Page): Promise<boolean> {
  // пауза перед «бито»: стол не трогаем, пока его разглядывают (касание своей карты её кончает)
  if (await visible(p, 'held')) return false;
  const before = await hand(p).count();
  const n = before;
  for (let k = 0; k < n; k++) {
    if (await visible(p, 'held')) return false;
    await hand(p).nth(k).click({ timeout: 800, force: true }).catch(() => {});
    await p.waitForTimeout(40);
    if (await visible(p, 'transfer')) await p.getByTestId('transfer').click().catch(() => {});
    if (/Какую карту бить|Коснитесь карты/.test(await p.getByTestId('hint').innerText().catch(() => ''))) {
      await p.getByTestId('table').locator('[data-testid^="table-"]').first().click({ force: true }).catch(() => {});
    }
    await p.waitForTimeout(250);
    if ((await hand(p).count().catch(() => before)) !== before) return true;
  }
  if (await visible(p, 'pass')) { await p.getByTestId('pass').click().catch(() => {}); return true; }
  if (await visible(p, 'take')) { await p.getByTestId('take').click().catch(() => {}); return true; }
  return false;
}

async function playOut(ps: Page[], label: string): Promise<boolean> {
  for (let i = 0; i < 900; i++) {
    if ((await Promise.all(ps.map(p => visible(p, 'result')))).every(Boolean)) return true;
    let any = false;
    for (const p of ps) if (!(await visible(p, 'result'))) any = (await step(p)) || any;
    if (!any) await ps[0].waitForTimeout(300);
  }
  console.log(`  … ${label}: партия не кончилась`);
  return false;
}

async function main() {
  const app = createApp({ db: ':memory:' });
  const srv = app.serve(PORT);
  const web = serveWeb();
  const browser = await chromium.launch();
  const errors: string[] = [];
  const phone = async (name: string) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: 'ru-RU' });
    const page = await ctx.newPage();
    // пауза перед «бито» и «беру» (src/game/hold.ts): что на столе паузы и сколько она стояла
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
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(`${name}: ${m.text()}`); });
    page.on('pageerror', e => errors.push(`${name}: ${e}`));
    await page.goto(web.url, { waitUntil: 'networkidle' });
    await page.getByTestId('menu').waitFor({ timeout: 20_000 });
    return page;
  };
  console.log(`Онлайн в браузере: сервер http://127.0.0.1:${PORT}, сборка ${web.bundle}\n\nсервер отвечает 502`);
  {
    // отдельный телефон без слушателя консоли: браузер сам пишет «Failed to load resource» на 502
    const ctx = await browser.newContext({ viewport: { width: 412, height: 780 }, locale: 'ru-RU' });
    let broken = true;
    await ctx.route(`http://127.0.0.1:${PORT}/v1/**`, r => (broken ? r.fulfill({ status: 502, contentType: 'text/html', body: '<html>502 Bad Gateway</html>' }) : r.continue()));
    const p = await ctx.newPage();
    await p.goto(`${web.url}?inset=48`, { waitUntil: 'networkidle' });
    await p.getByTestId('menu').waitFor({ timeout: 20_000 });
    await p.getByTestId('friends-open').click();
    await p.getByTestId('online-profile').waitFor({ timeout: 10_000 });
    await p.getByTestId('adult').click();
    await p.getByTestId('name').fill('Петя');
    await p.getByTestId('name-save').click();
    await p.getByTestId('online-error').waitFor({ timeout: 20_000 }).catch(() => {});
    const msg = await p.getByTestId('online-error').innerText().catch(() => '');
    ok(/Сервер недоступен, попробуйте позже/.test(msg), `502: «${msg}»`, msg);
    ok(await visible(p, 'online-retry'), '502: есть «Повторить»');
    ok(await visible(p, 'online-back'), '502: «Назад» в меню открыт');
    await p.screenshot({ path: `${OUT}/online-00-down.png` });
    broken = false;
    await p.getByTestId('online-retry').click();
    await p.getByTestId('friends').waitFor({ timeout: 15_000 }).catch(() => {});
    ok(await visible(p, 'friends'), 'сервер ожил: «Повторить» — и стол с друзьями открыт');
    await ctx.close();
  }
  console.log('\nстол с друзьями');
  const a = await phone('Миша'), b = await phone('Саша');

  const profile = async (p: Page, nick: string, open: string) => {
    await p.getByTestId(open).click();
    await p.getByTestId('online-profile').waitFor({ timeout: 10_000 });
    ok(!(await visible(p, 'name')), `${nick}: без отметки «Мне есть 14 лет» имени не спрашиваем`);
    await p.getByTestId('adult').click();
    await p.getByTestId('name').fill(nick);
    await p.getByTestId('name-save').click();
  };
  await profile(a, 'Миша', 'friends-open');
  await a.getByTestId('friends').waitFor({ timeout: 10_000 });
  await a.getByTestId('f-seats-3').click();
  await a.getByTestId('f-bots-novice').click();
  await a.getByTestId('create').click();
  await a.getByTestId('lobby').waitFor({ timeout: 10_000 });
  const code = (await a.getByTestId('table-code').innerText()).trim();
  ok(/^[A-Z2-9]{6}$/.test(code), 'код стола — шесть знаков', code);
  await a.screenshot({ path: `${OUT}/online-01-lobby.png` });

  await profile(b, 'Саша', 'friends-open');
  await b.getByTestId('friends').waitFor({ timeout: 10_000 });
  await b.getByTestId('code').fill(code);
  await b.getByTestId('join').click();
  await b.getByTestId('lobby').waitFor({ timeout: 10_000 });
  await a.waitForTimeout(2000);
  ok(/Саша/.test(await a.getByTestId('lobby-seat-1').innerText()), 'у хозяина за столом видно второго', await a.getByTestId('lobby-seat-1').innerText());
  ok(/бот/.test(await a.getByTestId('lobby-seat-2').innerText()), 'свободное место займёт бот с подписью «бот»');
  await a.getByTestId('start').click();
  await a.getByTestId('online-game').waitFor({ timeout: 10_000 });
  await b.getByTestId('online-game').waitFor({ timeout: 10_000 });
  await a.waitForTimeout(1500);
  ok(await hand(a).count() === 6 && await hand(b).count() === 6, 'у обоих на руке по шесть карт');
  const ha = await hand(a).evaluateAll(es => es.map(e => e.getAttribute('data-testid')));
  const hb = await hand(b).evaluateAll(es => es.map(e => e.getAttribute('data-testid')));
  ok(ha.every(x => !hb.includes(x)), 'в DOM каждого — только свои карты', `${ha} / ${hb}`);
  ok(/бот/.test(await a.getByTestId('opp-2').innerText().catch(() => '')), 'бот за столом подписан');
  await a.screenshot({ path: `${OUT}/online-02-game.png` });

  ok(await playOut([a, b], 'стол'), 'партия на троих дошла до итога');
  {
    // отбой кончился картой — оба телефона видят стол с ней, прежде чем карты уйдут в сброс
    const holds = (p: Page) => p.evaluate(() => (globalThis as unknown as { __holds: { label: string; ms: number }[] }).__holds.filter(h => h.ms >= 0));
    const ha = await holds(a), hb = await holds(b);
    const both = ha.filter(h => hb.some(x => x.label === h.label));
    ok(both.length > 0, `пауза перед «бито» у обоих: Миша ${ha.length}, Саша ${hb.length}, общих ${both.length}`, JSON.stringify([ha, hb]));
    ok(both.some(h => h.label.split(', ').some(pair => pair.includes(' '))), 'на столе паузы у обоих — покрытая пара', JSON.stringify(both));
    ok(ha.concat(hb).some(h => h.ms >= 900), 'пауза стоит своё время (1,2 с)', JSON.stringify(ha.concat(hb).map(h => Math.round(h.ms))));
    ok(await a.getByTestId('table').locator('canvas').count() > 0, 'после партии под итогом — стол последнего отбоя');
  }
  await a.waitForTimeout(500);
  for (const [p, n] of [[a, 'Миша'], [b, 'Саша']] as const) {
    const t = await p.getByTestId('deck-check').innerText().catch(() => '');
    ok(/Колода проверена/.test(t), `${n}: «Колода проверена»`, t);
  }
  await a.screenshot({ path: `${OUT}/online-03-result.png` });

  await a.getByTestId('rematch').click();
  await b.getByTestId('rematch').click();
  await a.waitForTimeout(2500);
  ok(await hand(a).count() === 6, 'реванш: новая партия, снова шесть карт', await hand(a).count());
  await a.getByTestId('online-exit').click();
  await b.getByTestId('online-exit').click();
  await a.getByTestId('menu').waitFor({ timeout: 10_000 });
  await b.getByTestId('menu').waitFor({ timeout: 10_000 });

  console.log('\nбыстрая игра');
  for (const p of [a, b]) {
    await p.getByTestId('quick-open').click();
    await p.getByTestId('quick').waitFor({ timeout: 10_000 });
    await p.getByTestId('quick-find').click();
  }
  await a.getByTestId('online-game').waitFor({ timeout: 20_000 });
  await b.getByTestId('online-game').waitFor({ timeout: 20_000 });
  await a.waitForTimeout(1500);
  ok(await hand(a).count() === 6, 'пара найдена, партия один на один началась');
  await a.screenshot({ path: `${OUT}/online-04-quick.png` });
  await a.getByTestId('online-exit').click();
  await b.getByTestId('result').waitFor({ timeout: 10_000 });
  ok(/Остались с картами: Миша/.test(await b.getByTestId('result').innerText()), 'сдача Миши — итог у Саши');

  ok(errors.length === 0, 'ошибок в консоли нет', errors.join('\n'));
  await browser.close();
  srv.stop();
  web.stop();
  console.log(failures ? `\nНе прошло: ${failures}` : '\nВсё прошло.');
  process.exit(failures ? 1 : 0);
}

void main();
