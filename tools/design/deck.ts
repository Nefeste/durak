/**
 * Лист колоды для «до — после» (ADR устава 0023, правило 5): веб-сборка с `?deck=1` рисует все 36 лиц тем же
 * `makeFaces`, что стол, картинки и туз крупно и все десять рубашек. Снимок — в файл; два снимка («до» и «после») складывает в один лист
 * `--pair до.png после.png выход.png`.
 *
 *   EXPO_OFFLINE=1 npm run export:web
 *   NODE_PATH=/opt/node22/lib/node_modules bun tools/design/deck.ts out.png [--four]
 *   NODE_PATH=/opt/node22/lib/node_modules bun tools/design/deck.ts --pair before.png after.png sheet.png
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { serveWeb } from '../e2e/serve';

const args = process.argv.slice(2);
const browser = await chromium.launch();
try {
  if (args[0] === '--pair') {
    const [a, b, out] = args.slice(1);
    const img = (f: string) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
    await page.setContent(`<body style="margin:0;background:#0B1A1E;font:600 28px sans-serif;color:#EEF3F2">
      <div style="display:flex;gap:24px;padding:24px">
        <div><div style="margin-bottom:12px">до</div><img width="694" src="${img(a)}"></div>
        <div><div style="margin-bottom:12px">после</div><img width="694" src="${img(b)}"></div>
      </div></body>`);
    await page.waitForTimeout(200);
    const box = await page.locator('body > div').boundingBox();
    await page.screenshot({ path: out, clip: box ?? undefined });
  } else {
    const web = serveWeb();
    const page = await browser.newPage({ viewport: { width: 720, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(`${web.url}?deck=1${args.includes('--four') ? '&four=1' : ''}`);
    await page.getByTestId('deck-sheet').locator('canvas').waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    // лист — по размеру самого холста: с третьего круга вида под лицами — ряд рубашек
    const box = await page.getByTestId('deck-sheet').locator('canvas').boundingBox();
    await page.screenshot({ path: args[0] ?? 'deck.png', clip: { x: 0, y: 0, width: box?.width ?? 694, height: box?.height ?? 690 } });
    web.stop();
  }
} finally {
  await browser.close();
}
