/**
 * Лист «до — после» из снимков экранов (ADR устава 0023, правило 5): пары снимков в ряд, над каждой парой — подпись.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules bun tools/design/pair.ts out.png "подпись 1" до1.png после1.png ["подпись 2" до2.png после2.png …]
 *
 * Снимки — любые PNG одного размера телефона (`tools/e2e/fit.ts --shots`, `tools/design/flow.ts`); на листе каждый —
 * шириной 300 точек.
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { C } from '../../src/ui/theme';

const [out, ...rest] = process.argv.slice(2);
if (!out || rest.length < 3 || rest.length % 3 !== 0) {
  console.log('pair.ts out.png "подпись" до.png после.png [ещё тройки]');
  process.exit(2);
}
const img = (f: string) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const groups = Array.from({ length: rest.length / 3 }, (_, i) => rest.slice(i * 3, i * 3 + 3));
const html = `<body style="margin:0;background:${C.bg};font:600 15px sans-serif;color:${C.text}">
  <div id="sheet" style="display:inline-flex;gap:32px;padding:24px;align-items:flex-start">
    ${groups.map(([title, a, b]) => `<div>
      <div style="margin-bottom:12px;max-width:612px">${esc(title)}</div>
      <div style="display:flex;gap:12px">
        <div><div style="color:${C.dim};margin-bottom:6px">до</div><img width="300" src="${img(a)}"></div>
        <div><div style="color:${C.accent};margin-bottom:6px">после</div><img width="300" src="${img(b)}"></div>
      </div></div>`).join('')}
  </div></body>`;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 700 * groups.length, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(html);
  await page.waitForTimeout(300);
  const box = await page.locator('#sheet').boundingBox();
  await page.screenshot({ path: out, clip: box ?? undefined });
  console.log(out);
} finally {
  await browser.close();
}
