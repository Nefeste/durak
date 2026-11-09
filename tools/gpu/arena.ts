// Арена сети для обучения (tools/gpu/README.md, «Как понять, что всё идёт хорошо»): сеть против уровней приложения один
// на один на зеркальных раздачах — каждая колода дважды, места меняются; поровну подкидной и переводной. Настоящие боты
// приложения, настоящий движок. Части считаются параллельно (`--jobs`). Печатает одну строку JSON.
//
//   bun tools/gpu/arena.ts --net best.bin --vs experienced,master --pairs 200 [--jobs 8] [--samples 24] [--seed 1]
import { makeRng } from '../../src/bot';
import type { Variant } from '../../src/engine';
import { playOut, playerOf, shuffled, startOf, trainingRules } from './play';

function args(): Record<string, string> {
  const a = process.argv.slice(2), out: Record<string, string> = {};
  for (let i = 0; i < a.length; i += 2) out[a[i].replace(/^--/, '')] = a[i + 1];
  return out;
}

const A = args();
const pairs = Number(A.pairs ?? 100);
const seed = Number(A.seed ?? 1);
const vs = (A.vs ?? 'experienced').split(',');
const net = `net:${A.net}:${A.samples ?? 24}:${A.horizon ?? 'bout'}`;

/** Часть арены: пары `from … to − 1`. */
async function part(rival: string, from: number, to: number) {
  const rules = await trainingRules();
  const me = playerOf(net), other = playerOf(rival);
  let score = 0, games = 0, loops = 0;
  for (let p = from; p < to; p++) {
    const deckRng = makeRng(seed * 1_000_003 + p);
    const deck = shuffled(deckRng);
    const variant: Variant = p % 2 ? 'perevodnoy' : 'podkidnoy';
    for (const mine of [0, 1]) {
      const players = mine === 0 ? [me, other] : [other, me];
      const end = playOut(startOf(deck, 2, variant, rules), players, makeRng(seed * 7 + p * 2 + mine));
      games++;
      if (!end) { loops++; score += 0.5; continue; }
      score += end.result!.draw ? 0.5 : end.result!.fool === mine ? 0 : 1;
    }
  }
  return { score, games, loops };
}

/** Доля, интервал 95 % и Эло с интервалом. */
function summary(score: number, games: number) {
  const share = score / games;
  const se = Math.sqrt(Math.max(share * (1 - share), 1e-9) / games);
  const elo = (p: number) => -400 * Math.log10(1 / Math.min(0.999, Math.max(0.001, p)) - 1);
  return { share, ci: 1.96 * se, elo: elo(share), elo_lo: elo(share - 1.96 * se), elo_hi: elo(share + 1.96 * se) };
}

if (A.from !== undefined) {
  console.log(JSON.stringify(await part(A.rival, Number(A.from), Number(A.to))));
} else {
  const jobs = Math.max(1, Number(A.jobs ?? 1));
  const t0 = Date.now();
  const out: Record<string, unknown> = { net: A.net, samples: Number(A.samples ?? 24), pairs };
  for (const rival of vs) {
    const chunks = Array.from({ length: jobs }, (_, i) => [Math.floor((pairs * i) / jobs), Math.floor((pairs * (i + 1)) / jobs)]).filter(([a, b]) => b > a);
    const runs = chunks.map(([from, to]) => Bun.spawn([process.execPath, import.meta.path, ...process.argv.slice(2), '--rival', rival, '--from', String(from), '--to', String(to)], { stdout: 'pipe', stderr: 'inherit' }));
    let score = 0, games = 0, loops = 0;
    for (const r of runs) {
      const text = await new Response(r.stdout).text();
      if ((await r.exited) !== 0) throw new Error(`арена: часть упала (${rival})`);
      const j = JSON.parse(text.trim().split('\n').pop()!);
      score += j.score; games += j.games; loops += j.loops;
    }
    out[rival] = { games, loops, ...summary(score, games) };
  }
  out.seconds = (Date.now() - t0) / 1000;
  console.log(JSON.stringify(out));
}
