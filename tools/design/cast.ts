/**
 * Лист состава соперников (ADR устава 0023, правило 5; docs/13-art.md, §11): веб-сборка с `?cast=1` рисует всех
 * персонажей по уровням — крупно и размерами игры — тем же `Face`, что плашки стола. Снимок — в файл.
 *
 *   EXPO_OFFLINE=1 npm run export:web
 *   NODE_PATH=/opt/node22/lib/node_modules bun tools/design/cast.ts out.png
 */
import { chromium } from 'playwright';
import { serveWeb } from '../e2e/serve';

const out = process.argv[2] ?? 'cast.png';
const browser = await chromium.launch();
const web = serveWeb();
try {
  const page = await browser.newPage({ viewport: { width: 1320, height: 740 }, deviceScaleFactor: 2 });
  await page.goto(`${web.url}?cast=1`);
  await page.getByTestId('cast-sheet').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: out, fullPage: true });
  console.log(out);
} finally {
  web.stop();
  await browser.close();
}
