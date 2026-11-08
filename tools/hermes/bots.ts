// Скорость ботов на Hermes — движке JavaScript телефона (docs/10-bot.md, «Скорость»). Те же уровни,
// собранные в ES5, как их собрал бы Babel приложения; позиции — из партий «Среднего» с зерном.
// Hermes 0.12 из npm без JIT — порядок чисел телефона, не точное число: на телефоне меряет экран «Замер».
//
//   bun tools/hermes/bots.ts [уровни через запятую] [путь к hermes]
import { existsSync, mkdirSync } from 'node:fs';

const levels = process.argv[2] ?? '';
const hermes = process.argv[3] ?? '/tmp/hermes/package/linux64-bin/hermes';
mkdirSync('dist', { recursive: true });
const built = await Bun.build({ entrypoints: ['tools/hermes/bots-entry.ts'], outdir: 'dist', naming: 'hermes-bots.js', target: 'browser', format: 'iife' });
if (!built.success) { console.error(built.logs); process.exit(1); }
const ts = (await import('typescript')).default;
const es5 = ts.transpileModule(await Bun.file('dist/hermes-bots.js').text(), {
  compilerOptions: { target: ts.ScriptTarget.ES5, downlevelIteration: true, allowJs: true, module: ts.ModuleKind.None },
}).outputText;
await Bun.write('dist/hermes-bots-es5.js', `var LEVELS_ARG = ${JSON.stringify(levels)};\n` + es5);
if (!existsSync(hermes) && hermes.startsWith('/tmp/hermes/')) {
  console.log('скачиваю hermes-engine-cli@0.12.0 в /tmp/hermes…');
  mkdirSync('/tmp/hermes', { recursive: true });
  await Bun.spawn(['npm', 'pack', 'hermes-engine-cli@0.12.0', '--pack-destination', '/tmp/hermes'], { stdout: 'ignore', stderr: 'inherit' }).exited;
  await Bun.spawn(['tar', 'xzf', '/tmp/hermes/hermes-engine-cli-0.12.0.tgz', '-C', '/tmp/hermes'], { stderr: 'inherit' }).exited;
  await Bun.spawn(['chmod', '+x', hermes]).exited;
}
if (!existsSync(hermes)) { console.error(`Hermes не найден: ${hermes}`); process.exit(1); }
const p = Bun.spawn([hermes, '-O', 'dist/hermes-bots-es5.js'], { stdout: 'pipe', stderr: 'inherit' });
const out = await new Response(p.stdout).text();
await p.exited;
console.log(out.trim());
process.exit(/^OK:/m.test(out) && p.exitCode === 0 ? 0 : 1);
