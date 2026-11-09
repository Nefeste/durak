// Скорость сети на Hermes — движке JavaScript телефона (docs/specs/2026-11-neural.md, «Телефон»). Как bots.ts: сборка
// в ES5 и Hermes 0.12 из npm без JIT — порядок чисел телефона, не точное число.
//
//   bun tools/hermes/net.ts ['256,128;128,64'] [путь к hermes]
import { existsSync, mkdirSync } from 'node:fs';

const sizes = process.argv[2] ?? '256,128;128,64';
const hermes = process.argv[3] ?? '/tmp/hermes/package/linux64-bin/hermes';
mkdirSync('dist', { recursive: true });
const built = await Bun.build({ entrypoints: ['tools/hermes/net-entry.ts'], outdir: 'dist', naming: 'hermes-net.js', target: 'browser', format: 'iife' });
if (!built.success) { console.error(built.logs); process.exit(1); }
const ts = (await import('typescript')).default;
const es5 = ts.transpileModule(await Bun.file('dist/hermes-net.js').text(), {
  compilerOptions: { target: ts.ScriptTarget.ES5, downlevelIteration: true, allowJs: true, module: ts.ModuleKind.None },
}).outputText;
await Bun.write('dist/hermes-net-es5.js', `var NET_SIZES = ${JSON.stringify(sizes)};\n` + es5);
if (!existsSync(hermes) && hermes.startsWith('/tmp/hermes/')) {
  console.log('скачиваю hermes-engine-cli@0.12.0 в /tmp/hermes…');
  mkdirSync('/tmp/hermes', { recursive: true });
  await Bun.spawn(['npm', 'pack', 'hermes-engine-cli@0.12.0', '--pack-destination', '/tmp/hermes'], { stdout: 'ignore', stderr: 'inherit' }).exited;
  await Bun.spawn(['tar', 'xzf', '/tmp/hermes/hermes-engine-cli-0.12.0.tgz', '-C', '/tmp/hermes'], { stderr: 'inherit' }).exited;
  await Bun.spawn(['chmod', '+x', hermes]).exited;
}
if (!existsSync(hermes)) { console.error(`Hermes не найден: ${hermes}`); process.exit(1); }
const p = Bun.spawn([hermes, '-O', 'dist/hermes-net-es5.js'], { stdout: 'pipe', stderr: 'inherit' });
const out = await new Response(p.stdout).text();
await p.exited;
console.log(out.trim());
process.exit(/^OK$/m.test(out) && p.exitCode === 0 ? 0 : 1);
