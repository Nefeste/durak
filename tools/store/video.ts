// из nardy: tools/store/video.ts @ 1d2bdff — плёнка (`Reel`) и склейка ffmpeg те же; свой сценарий, телефон в
// портрете посреди кадра 16:9, подписи — сбоку, а не поверх стола; без петли и фонового видео.
/**
 * Короткий ролик для карточки RuStore и страницы игры (спецификация 1.0, §5): 1920 × 1080, около 45 с, без звука
 * (в веб-сборке звука нет). Снимается с веб-сборки, как снимки карточки (tools/store/shots.ts): экран телефона
 * 412 × 732 в портрете (ADR 0007) — посреди кадра, слева название, справа подпись к тому, что сейчас на столе.
 * Кадры — экранной записью Chromium (CDP `Page.startScreencast`), склейка — ffmpeg (H.264, 30 кадров в секунду).
 *
 *   EXPO_OFFLINE=1 npm run export:web
 *   NODE_PATH=/opt/node22/lib/node_modules bun tools/store/video.ts [файл.mp4]
 *
 * По умолчанию пишет store/video/kozyr-ru.mp4 — в git он не кладётся: ролик живёт на видеохостинге, ссылку
 * владелец вписывает в карточку. Партии — касаниями против ботов, раздачи случайные: от прогона к прогону ролик
 * разный. Итог и разбор — партия, доигранная за кадром в быстром режиме (`?fast=1`). Генераторов нет: всё в кадре
 * нарисовано кодом игры.
 */
import { chromium, type Browser, type CDPSession, type FrameLocator, type Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { T } from '../../src/i18n';
import { C } from '../../src/ui/theme';
import { serveWeb } from '../e2e/serve';

const ROOT = join(import.meta.dir, '../..');
const OUT = process.argv.slice(2).find(a => !a.startsWith('--')) ?? join(ROOT, 'store/video/kozyr-ru.mp4');
const FONT = join(ROOT, 'node_modules/@expo-google-fonts/onest/700Bold/Onest_700Bold.ttf');
const FPS = 30;
/** Кадр 960 × 540 при плотности 2 — 1920 × 1080; телефон 412 × 732 уменьшен до высоты кадра. */
const W = 960, H = 540, PW = 412, PH = 732, K = H / PH;

// ——— запись (из «Нард») ———

interface Frame { t: number; jpeg: Buffer }
interface Segment { frames: Frame[]; start: number; end: number }

/** Плёнка: куски экранной записи страниц, склеенные встык. Пока снимаются куски — время идёт, между ними — нет. */
class Reel {
  segments: Segment[] = [];
  private cdp: CDPSession | null = null;
  private seg: Segment | null = null;

  async start(p: Page): Promise<void> {
    this.cdp = await p.context().newCDPSession(p);
    const seg: Segment = { frames: [], start: Date.now() / 1000, end: 0 };
    this.seg = seg;
    const cdp = this.cdp;
    cdp.on('Page.screencastFrame', f => {
      seg.frames.push({ t: f.metadata.timestamp ?? Date.now() / 1000, jpeg: Buffer.from(f.data, 'base64') });
      void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  }

  async stop(): Promise<void> {
    if (!this.cdp || !this.seg) return;
    this.seg.end = Date.now() / 1000;
    await this.cdp.send('Page.stopScreencast').catch(() => {});
    await this.cdp.detach().catch(() => {});
    if (this.seg.frames.length) this.segments.push(this.seg);
    this.cdp = null;
    this.seg = null;
  }

  /** Снять `fn` на странице `p`. */
  async film(p: Page, fn: () => Promise<void>): Promise<void> {
    await this.start(p);
    await p.waitForTimeout(150);
    try { await fn(); } finally { await this.stop(); }
  }

  get seconds(): number {
    return this.segments.reduce((a, s) => a + (s.end - Math.max(s.start, s.frames[0].t)), 0);
  }

  /** Кадры — в файлы, длительность каждого — до следующего; ffmpeg склеивает в MP4. */
  render(out: string, crf = 18): void {
    const dir = mkdtempSync(join(tmpdir(), 'kozyr-video-'));
    const list: string[] = [];
    let n = 0;
    for (const s of this.segments) {
      const fr = s.frames.filter(f => f.t <= s.end);
      fr.forEach((f, i) => {
        const next = i + 1 < fr.length ? fr[i + 1].t : s.end;
        const file = join(dir, `${String(n++).padStart(6, '0')}.jpg`);
        writeFileSync(file, f.jpeg);
        list.push(`file '${file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
      });
    }
    // у concat длительность последнего кадра учитывается, только если он повторён
    list.push(list[list.length - 2]);
    writeFileSync(join(dir, 'list.txt'), list.join('\n'));
    mkdirSync(dirname(out), { recursive: true });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'),
      '-vf', `scale=1920:1080:flags=lanczos,fps=${FPS},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf),
      '-profile:v', 'high', '-movflags', '+faststart', '-an', out], { stdio: 'inherit' });
    rmSync(dir, { recursive: true, force: true });
  }
}

// ——— кадр: название, телефон, подпись ———

const FACE = `@font-face{font-family:Onest;font-weight:700;src:url(data:font/ttf;base64,${readFileSync(FONT).toString('base64')})}`;

/** Страница кадра: слева название, посреди — игра в рамке телефона, справа — подпись (`#cap`). */
function frameHtml(src: string): string {
  const side = (W - PW * K) / 2;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FACE}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${C.bg};font-family:Onest,sans-serif;font-weight:700}
#phone{position:absolute;left:${side}px;top:0;width:${PW}px;height:${PH}px;border:0;transform:scale(${K});transform-origin:0 0;
  box-shadow:0 0 0 1px ${C.glassLine},0 18px 60px rgba(0,0,0,.55)}
.side{position:absolute;top:0;width:${side - 48}px;height:${H}px;display:flex;flex-direction:column;justify-content:center}
#name{left:32px} #name b{display:block;color:${C.accent};font-size:46px} #name span{display:block;color:${C.dim};font-size:17px;margin-top:8px}
#cap{right:32px;color:${C.text};font-size:24px;line-height:1.3;opacity:0;transition:opacity 300ms ease}
</style></head><body>
<div class="side" id="name"><b>Козырь</b><span>Дурак подкидной<br>и переводной</span></div>
<iframe id="phone" src="${src}"></iframe>
<div class="side" id="cap"></div>
</body></html>`;
}

/** Карточка начала и конца: название, строки, внизу пометка. */
function cardHtml(lines: string[], note: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FACE}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${C.felt};font-family:Onest,sans-serif;font-weight:700;
  display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
b{color:${C.accent};font-size:96px} p{color:${C.text};font-size:24px;margin:10px 0 0} i{position:absolute;bottom:36px;color:${C.dim};font-size:18px;font-style:normal}
body>*{opacity:0;transition:opacity 500ms ease} body.on>*{opacity:1}
</style></head><body><b>Козырь</b>${lines.map(l => `<p>${l}</p>`).join('')}${note ? `<i>${note}</i>` : ''}</body></html>`;
}

async function caption(p: Page, line: string) {
  await p.evaluate((line: string) => {
    const el = document.getElementById('cap')!;
    el.textContent = line;
    el.style.opacity = line ? '1' : '0';
  }, line);
}

// ——— игра касаниями (как tools/store/shots.ts) ———

const visible = (f: FrameLocator, id: string) => f.getByTestId(id).isVisible().catch(() => false);
const handCount = (f: FrameLocator) => f.locator('[data-testid^="hand-"]').count();
const tableCards = (f: FrameLocator) => f.getByTestId('table').locator('[data-testid^="table-"]').count();
const WHY = Object.entries(T.reason).filter(([k]) => !['notYourMove', 'gameOver', 'needCards'].includes(k)).map(([, v]) => v);

/** Один свой ход или ответ: карта, которая легла; иначе «бито»/«пас», иначе «беру». */
async function step(p: Page, f: FrameLocator, pause = 30): Promise<void> {
  const before = await handCount(f);
  const cards = f.locator('[data-testid^="hand-"]');
  const n = await cards.count();
  for (let k = 0; k < n; k++) {
    await cards.nth(k).click({ timeout: 1000, force: true }).catch(() => {});
    await p.waitForTimeout(pause);
    if (/Какую карту бить|Коснитесь карты/.test(await f.getByTestId('hint').innerText().catch(() => ''))) {
      await f.getByTestId('table').locator('[data-testid^="table-"]').first().click({ force: true }).catch(() => {});
      await p.waitForTimeout(pause);
    }
    if ((await handCount(f).catch(() => before)) < before) return;
  }
  if (await visible(f, 'pass')) await f.getByTestId('pass').click().catch(() => {});
  else if (await visible(f, 'take')) await f.getByTestId('take').click().catch(() => {});
}

/** Дождаться своего действия; `false` — партия кончилась или не дождались. */
async function mine(p: Page, f: FrameLocator, ms = 15_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await visible(f, 'result')) return false;
    // «Подсказка» есть, только когда у вас есть действия
    if (await visible(f, 'advise')) return true;
    await p.waitForTimeout(150);
  }
  return false;
}

/** Ход, которого нельзя: касание карты, на которое игра отвечает строкой причины. */
async function illegal(p: Page, f: FrameLocator): Promise<boolean> {
  const cards = f.locator('[data-testid^="hand-"]');
  const n = await cards.count();
  for (let k = 0; k < n; k++) {
    const before = await handCount(f);
    await cards.nth(k).click({ timeout: 1000, force: true }).catch(() => {});
    await p.waitForTimeout(60);
    const hint = await f.getByTestId('hint').innerText().catch(() => '');
    if (WHY.some(w => hint.includes(w))) return true;
    // касание оказалось ходом — дальше искать в следующий раз
    if ((await handCount(f).catch(() => before)) < before) return false;
    if (/Какую карту бить|Коснитесь карты/.test(hint)) await cards.nth(k).click({ timeout: 1000, force: true }).catch(() => {});
  }
  return false;
}

// ——— сценарий ———

async function main() {
  const web = serveWeb();
  const browser: Browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const reel = new Reel();
  const page = async (html: string) => {
    const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    await p.route(`${web.url}__reel.html`, r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await p.goto(`${web.url}__reel.html`);
    await p.evaluate(() => document.fonts.ready);
    return p;
  };
  const phone = async (query = '') => {
    const p = await page(frameHtml(`${web.url}${query}`));
    const f = p.frameLocator('#phone');
    await f.getByTestId('menu').waitFor({ timeout: 30_000 });
    await p.waitForTimeout(800);
    return { p, f };
  };
  const card = async (lines: string[], note: string, ms: number) => {
    const p = await page(cardHtml(lines, note));
    await reel.film(p, async () => {
      await p.evaluate(() => document.body.classList.add('on'));
      await p.waitForTimeout(ms);
    });
    await p.close();
  };

  // 1. начало
  await card(['Дурак подкидной и переводной', 'Честная колода · бот не видит ваших карт'], '', 3500);

  // 2. партия с ботом касаниями: подкидной вдвоём
  {
    const { p, f } = await phone();
    await reel.film(p, async () => {
      await caption(p, 'Подкидной и переводной, на 2–4. С ботами — без интернета');
      await p.waitForTimeout(2600);
      await f.getByTestId('play').click();
      await f.getByTestId('game').waitFor({ timeout: 10_000 });
      await caption(p, 'Тасовка, раздача — и первым ходит младший козырь');
      await p.waitForTimeout(2200);
      const lines = ['Карту — касанием или перетаскиванием', 'Ход нельзя — игра скажет почему', 'Подсказка: что сделал бы «Опытный»', 'Бот видит только свои карты и стол'];
      for (let k = 0; k < lines.length && await mine(p, f); k++) {
        await caption(p, lines[k]);
        if (k === 1) { if (await illegal(p, f)) await p.waitForTimeout(2200); }
        if (k === 2) {
          await f.getByTestId('advise').click();
          for (let w = 0; w < 40 && !/шанс/.test(await f.getByTestId('hint').innerText().catch(() => '')); w++) await p.waitForTimeout(100);
          await p.waitForTimeout(2000);
        }
        await step(p, f, 300);
        await p.waitForTimeout(1300);
      }
      await caption(p, '');
      await p.waitForTimeout(600);
    });
    await p.close();
  }

  // 3. переводной вчетвером
  {
    const { p, f } = await phone();
    await f.getByTestId('variant-perevodnoy').click();
    await f.getByTestId('bots-3').click();
    await p.waitForTimeout(300);
    await reel.film(p, async () => {
      await caption(p, 'Переводной вчетвером: у каждого бота подпись «бот»');
      await f.getByTestId('play').click();
      await f.getByTestId('game').waitFor({ timeout: 10_000 });
      for (let k = 0; k < 3 && await mine(p, f); k++) {
        await step(p, f, 300);
        await p.waitForTimeout(1200);
      }
      await caption(p, '');
      await p.waitForTimeout(500);
    });
    await p.close();
  }

  // 4. итог с главной ошибкой и разбор на столе — партия доиграна за кадром
  {
    const { p, f } = await phone('?fast=1');
    await f.getByTestId('play').click();
    await f.getByTestId('game').waitFor({ timeout: 10_000 });
    for (let i = 0; i < 600 && !(await visible(f, 'result')); i++) { await step(p, f); await p.waitForTimeout(120); }
    await f.getByTestId('result-worst').filter({ hasNotText: T.result.counting }).waitFor({ timeout: 60_000 }).catch(() => {});
    await p.waitForTimeout(400);
    await reel.film(p, async () => {
      await caption(p, 'Итог — с главной ошибкой партии');
      await p.waitForTimeout(3200);
      await f.getByTestId('result-review').click();
      await f.getByTestId('review-table').waitFor({ timeout: 30_000 }).catch(() => {});
      await caption(p, 'Разбор на столе: что сыграно и что было лучше — и почему');
      await p.waitForTimeout(3200);
      for (let k = 0; k < 2; k++) {
        if (!(await f.getByTestId('review-next').isEnabled().catch(() => false))) break;
        await f.getByTestId('review-next').click();
        await p.waitForTimeout(2200);
      }
      await f.getByTestId('review-back').click().catch(() => {});
      await p.waitForTimeout(300);
      if (await visible(f, 'result-menu')) await f.getByTestId('result-menu').click();
      await f.getByTestId('menu').waitFor({ timeout: 5000 }).catch(() => {});
      await f.getByTestId('puzzle-open').click();
      await f.getByTestId('puzzle').waitFor({ timeout: 5000 }).catch(() => {});
      await caption(p, 'Задача дня: найдите ход, после которого выходите без карт');
      await p.waitForTimeout(3600);
      await caption(p, '');
      await p.waitForTimeout(400);
    });
    await p.close();
  }

  // 5. конец
  await card(['Стол с родными по ссылке · проверка колоды', 'Реклама — только между партиями'], 'RuStore', 3800);

  await browser.close();
  web.stop();
  console.log(`снято ${reel.seconds.toFixed(1)} с, кусков ${reel.segments.length}`);
  reel.render(OUT);
  const info = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=width,height', '-of', 'csv=p=0', OUT]).toString().trim();
  console.log(`${OUT}: ${info.replace(/\n/g, ' · ')}`);
}

await main();
