// из nardy: tools/e2e/serve.ts @ 1d2bdff (из votchina)
/**
 * Раздача веб-сборки для браузерных прогонов — на свободном порту, силами самого прогона.
 *
 * Раньше раздачу поднимали отдельной командой на постоянном порту, и это однажды
 * выдало разрешение не тому коду: `python3 -m http.server 8765` из прошлой сессии остался
 * жив, новая команда молча не заняла порт, и прогон честно показал семь галочек —
 * вчерашней сборке. Здесь порт выбирает система, а раздаётся ровно та папка, что названа.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';

export const WEB_DIR = process.env.DURAK_WEB_DIR ?? 'dist-web';

export function serveWeb(dir = WEB_DIR): { url: string; bundle: string; stop: () => void } {
  const index = join(dir, 'index.html');
  if (!existsSync(index)) {
    console.log(`Нет сборки в ${dir}. Соберите: EXPO_OFFLINE=1 npx expo export -p web --output-dir ${dir}`);
    process.exit(2);
  }
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req) {
      const path = normalize(decodeURIComponent(new URL(req.url).pathname)).replace(/^(\.\.[/\\])+/, '');
      const file = Bun.file(join(dir, path.endsWith('/') ? `${path}index.html` : path));
      // приложение одностраничное: неизвестный путь — та же страница
      return new Response(await file.exists() ? file : Bun.file(index));
    },
  });
  // имя файла сборки — чтобы в выводе было видно, какой именно код проверялся
  const bundle = readFileSync(index, 'utf8').match(/index-[a-f0-9]+\.js/)?.[0] ?? '?';
  return { url: `http://127.0.0.1:${server.port}/`, bundle, stop: () => server.stop(true) };
}
