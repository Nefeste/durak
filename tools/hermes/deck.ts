// Колода durak-deck-v1 на Hermes — движке JavaScript телефона (docs/specs/2026-11-v1.md, раздел 12,
// критерий 4). Векторы фикстуры считаются тем же кодом движка, собранным в ES5, как его собрал бы
// Babel приложения. Hermes — консольная сборка из npm (hermes-engine-cli 0.12, как tools/sim/hermes.ts
// «Нард»): старше Hermes в React Native 0.86, но арифметика и типизированные массивы те же.
//
//   bun tools/hermes/deck.ts [путь к hermes]
import { existsSync, mkdirSync } from 'node:fs';

const hermes = process.argv[2] ?? '/tmp/hermes/package/linux64-bin/hermes';
mkdirSync('dist', { recursive: true });
const built = await Bun.build({ entrypoints: ['tools/hermes/deck-entry.ts'], outdir: 'dist', naming: 'hermes-deck.js', target: 'browser', format: 'iife' });
if (!built.success) { console.error(built.logs); process.exit(1); }
const ts = (await import('typescript')).default;
const es5 = ts.transpileModule(await Bun.file('dist/hermes-deck.js').text(), {
  compilerOptions: { target: ts.ScriptTarget.ES5, downlevelIteration: true, allowJs: true, module: ts.ModuleKind.None },
}).outputText;
await Bun.write('dist/hermes-deck-es5.js', es5);
if (!existsSync(hermes) && hermes.startsWith('/tmp/hermes/')) {
  console.log('скачиваю hermes-engine-cli@0.12.0 в /tmp/hermes…');
  mkdirSync('/tmp/hermes', { recursive: true });
  await Bun.spawn(['npm', 'pack', 'hermes-engine-cli@0.12.0', '--pack-destination', '/tmp/hermes'], { stdout: 'ignore', stderr: 'inherit' }).exited;
  await Bun.spawn(['tar', 'xzf', '/tmp/hermes/hermes-engine-cli-0.12.0.tgz', '-C', '/tmp/hermes'], { stderr: 'inherit' }).exited;
  await Bun.spawn(['chmod', '+x', hermes]).exited;
}
if (!existsSync(hermes)) { console.error(`Hermes не найден: ${hermes}`); process.exit(1); }
const p = Bun.spawn([hermes, '-O', 'dist/hermes-deck-es5.js'], { stdout: 'pipe', stderr: 'inherit' });
const out = await new Response(p.stdout).text();
await p.exited;
console.log(out.trim());
process.exit(/^OK:/m.test(out) && p.exitCode === 0 ? 0 : 1);
