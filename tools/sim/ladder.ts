// Лестница уровней (docs/10-bot.md, «Цель лестницы»): каждый уровень против соседа снизу один на один на
// зеркальных раздачах, в обоих вариантах; пары считаются параллельно отдельными процессами.
// Итог — таблица Markdown для отчёта в docs/reports/.
//   bun tools/sim/ladder.ts [раздач на пару для уровней по правилам] [раздач для поиска] [процессов]
import { LEVELS } from '../../src/bot';

const [rulePairs = '1000', searchPairs = '200', jobs = '4'] = process.argv.slice(2);
const SEARCH = new Set(['experienced', 'strong', 'master']);
const tasks: { a: string; b: string; variant: string; pairs: number; seed: number }[] = [];
for (let i = 1; i < LEVELS.length; i++) {
  for (const [k, variant] of ['podkidnoy', 'perevodnoy'].entries()) {
    const a = LEVELS[i], b = LEVELS[i - 1];
    tasks.push({ a, b, variant, pairs: Number(SEARCH.has(a) ? searchPairs : rulePairs), seed: 100 + i * 2 + k });
  }
}

const rows: string[] = [];
let next = 0;
async function worker() {
  while (next < tasks.length) {
    const t = tasks[next++];
    const started = Date.now();
    const p = Bun.spawn(['bun', 'tools/sim/arena.ts', String(t.pairs), t.a, t.b, t.variant, String(t.seed)], { stdout: 'pipe', stderr: 'inherit' });
    const out = (await new Response(p.stdout).text()).trim();
    await p.exited;
    const line = `${out} — ${Math.round((Date.now() - started) / 1000)} с`;
    console.log(line);
    rows.push(line);
  }
}
await Promise.all(Array.from({ length: Number(jobs) }, worker));
