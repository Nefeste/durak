// Страницы сервера «Козыря» (docs/03-server-api.md, «Страницы сайта»; устройство — как у «Нард»,
// nardy: server/src/pages.ts @ 1d2bdff): приглашение за стол, как проверить колоду, App Links.
// Статичные, без внешних скриптов и шрифтов; цвета — из темы игры (src/ui/theme.ts).
import { isCode } from '../../src/state/protocol';
import { C } from '../../src/ui/theme';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const CSS = `
*{box-sizing:border-box}html{background:${C.bg}}body{margin:0;color:${C.text};font:17px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:20px 16px 48px}.brand{font-weight:700;font-size:18px;margin:4px 0 16px}
.card{background:${C.sheet};border:1px solid ${C.glassLine};border-radius:20px;padding:18px 20px 22px}
h1{font-size:28px;line-height:1.2;margin:4px 0 12px}h2{font-size:20px;margin:26px 0 8px;color:${C.accent}}
.dim{color:${C.dim};font-size:15px}.code{font-size:52px;font-weight:800;letter-spacing:8px;color:${C.accent};margin:4px 0 14px}
.btn{display:inline-block;background:${C.accent};color:${C.accentText};text-decoration:none;font-weight:700;border-radius:999px;padding:12px 24px;margin:4px 8px 4px 0}
.ghost{background:transparent;border:1px solid ${C.glassLine};color:${C.text}}a{color:${C.accent}}footer{margin-top:28px;color:${C.dim};font-size:14px}`;

function page(title: string, body: string, head = '', status = 200): Response {
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="theme-color" content="${C.bg}">${head}<style>${CSS}</style></head>
<body><main><div class="brand">Козырь — дурак подкидной и переводной</div><div class="card">${body}</div>
<footer>«Козырь» — игра студии «Горница», <a href="https://gornitsa.games/">gornitsa.games</a></footer></main></body></html>`;
  const cache: Record<string, string> = status === 200 ? { 'cache-control': 'public, max-age=300' } : {};
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...cache } });
}

export const PACKAGE = 'games.gornitsa.durak';
const GAME_PAGE = 'https://gornitsa.games/';

export const notFound = () => page('Нет такой страницы', '<h1>Нет такой страницы</h1><p><a href="https://gornitsa.games/">gornitsa.games</a></p>', '', 404);

/** Приглашение за стол: открыть приложение (App Link, в Chrome — intent) или поставить его и ввести код. */
export function invitePage(host: string, raw: string): Response {
  const code = raw.toUpperCase();
  if (!isCode(code)) return notFound();
  const intent = `intent://${host}/t/${code}#Intent;scheme=https;package=${PACKAGE};S.browser_fallback_url=${encodeURIComponent(GAME_PAGE)};end`;
  const head = `<meta property="og:title" content="Сыграем в дурака?"><meta property="og:description" content="Код стола: ${code}">`;
  return page('Сыграем в дурака?', `
<h1>Вас зовут за стол — подкидной или переводной дурак</h1>
<p class="dim">Код стола</p><div class="code" id="code">${code}</div>
<p><a class="btn" href="${esc(intent)}">Открыть в приложении</a></p>
<h2>Нет приложения?</h2>
<p>«Козырь» — для Android, скоро в RuStore. Поставьте игру, откройте «С друзьями» → «Войти по коду» и введите код <b>${code}</b>.</p>
<p class="dim">Колода в игре по сети проверяемая: <a href="/fair">как это устроено</a>.</p>`, head);
}

/** Как устроена честная колода (ADR 0004) и как проверить её самому. */
export function fairPage(): Response {
  return page('Как проверить колоду', `
<h1>Колода, которую можно проверить</h1>
<p>До раздачи сервер показывает отпечаток своего зерна — SHA-256. Потом каждый телефон за столом отдаёт своё зерно.
Порядок колоды строится из зерна сервера и зёрен всех мест: ни сервер, ни один из игроков не выбирает его сам.</p>
<p>После партии сервер раскрывает зерно. Телефон пересобирает колоду, сверяет отпечаток и каждую карту, которую видел:
свою руку, козырь, добор и все сыгранные карты. Не совпало — игра скажет об этом красным.</p>
<h2>Как проверить самому</h2>
<p>Алгоритм — <b>durak-deck-v1</b>: тасовка Фишера — Йетса потоком HMAC-SHA-256. Ключ — зерно сервера, сообщение —
<code>durak-deck-v1|зерно1|зерно2|…|k</code> для k = 0, 1, 2…; из каждого блока по два байта, с отбрасыванием,
чтобы не было перекоса. Доказательство партии отдаёт адрес <code>/v1/tables/&lt;стол&gt;/proof?game=&lt;номер&gt;</code>.</p>`);
}

export function assetLinks(certSha256: string): string {
  const fp = certSha256.toUpperCase().match(/../g)!.join(':');
  return JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: PACKAGE, sha256_cert_fingerprints: [fp] },
  }]);
}
