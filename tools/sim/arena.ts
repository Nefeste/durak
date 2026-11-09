// Арена: сила уровней один на один на зеркальных раздачах (docs/10-bot.md, «Арена»).
// Каждая колода играется дважды, места меняются. Итог — доля партий, где первый уровень не остался
// с картами (ничья — половина), и 95-процентный интервал.
//   bun tools/sim/arena.ts 1000 average novice [podkidnoy|perevodnoy] [зерно]
//   bun tools/sim/arena.ts 200 net:tools/gpu/nets/<дата>/best.bin master   — бот на сети (tools/sim/players.ts)
import { firstOf, dealOf, observe } from '../../src/engine';
import type { Variant } from '../../src/engine';
import { makeRng } from '../../src/bot';
import { playGame, shuffled } from './play';
import { playerOf } from './players';

/** Игрок — уровень (`master`) или сеть (`net:<файл.bin>`, `players.ts`). */
type Spec = string;

export interface ArenaResult { a: Spec; b: Spec; games: number; score: number; share: number; low: number; high: number; loops: number }

/** Партия до конца; `null` — не кончилась за 5 000 действий (круг), считается ничьей. */
function tryPlay(deck: number[], seats: number, first: number, variant: Variant, levels: Spec[], rng: ReturnType<typeof makeRng>) {
  const players = levels.map(playerOf);
  try {
    return playGame(deck, seats, first, variant, (s, seat) => players[seat](observe(s, seat), rng)).final;
  } catch (e) {
    if (e instanceof Error && e.message === 'партия не кончилась') return null;
    throw e;
  }
}

export function arena(pairs: number, a: Spec, b: Spec, variant: Variant, seed = 1): ArenaResult {
  const deckRng = makeRng(seed);
  const botRng = makeRng(seed ^ 0x9e3779b9);
  let score = 0, games = 0, loops = 0;
  for (let p = 0; p < pairs; p++) {
    const deck = shuffled(deckRng);
    const { hands, trump } = dealOf(deck, 2);
    const first = firstOf(hands, trump).seat;
    for (const aSeat of [0, 1]) {
      const levels: Spec[] = aSeat === 0 ? [a, b] : [b, a];
      const played = tryPlay(deck, 2, first, variant, levels, botRng);
      if (!played) { loops++; score += 0.5; games++; continue; }
      const r = played.result!;
      score += r.draw ? 0.5 : r.fool === aSeat ? 0 : 1;
      games++;
    }
  }
  const share = score / games;
  const se = Math.sqrt(Math.max(share * (1 - share), 1e-9) / games);
  return { a, b, games, score, share, low: share - 1.96 * se, high: share + 1.96 * se, loops };
}

if (import.meta.main && process.argv[2] === 'table') {
  // bun tools/sim/arena.ts table 100 master average 3 podkidnoy [зерно]
  const [, n = '100', a = 'master', b = 'average', seats = '3', variant = 'podkidnoy', seed = '1'] = process.argv.slice(2);
  const r = tableShare(Number(n), a, b, Number(seats), variant as Variant, Number(seed));
  console.log(`${a} за столом на ${seats} против ${b}, ${variant}: ${r.games} партий, без карт ${(r.share * 100).toFixed(1)} % (как все — ${(r.base * 100).toFixed(1)} %)`);
} else if (import.meta.main) {
  const [n = '500', a = 'average', b = 'novice', variant = 'podkidnoy', seed = '1'] = process.argv.slice(2);
  const r = arena(Number(n), a, b, variant as Variant, Number(seed));
  const pct = (x: number) => (x * 100).toFixed(1) + ' %';
  console.log(`${a} против ${b}, ${variant}: ${r.games} партий, ${pct(r.share)} [${pct(r.low)} … ${pct(r.high)}]${r.loops ? `, не кончились (круг): ${r.loops}` : ''}`);
}

/** За столом на 3–4 места: уровень `a` на одном месте, остальные — `b`; место `a` меняется по кругу
 *  на каждой колоде. Итог — доля партий, где `a` не остался с картами (если играет как все —
 *  около (места − 1) / места). */
export function tableShare(deals: number, a: Spec, b: Spec, seats: number, variant: Variant, seed = 1): { games: number; share: number; base: number } {
  const deckRng = makeRng(seed);
  const botRng = makeRng(seed ^ 0x9e3779b9);
  let score = 0, games = 0;
  for (let d = 0; d < deals; d++) {
    const deck = shuffled(deckRng);
    const { hands, trump } = dealOf(deck, seats);
    const first = firstOf(hands, trump).seat;
    for (let aSeat = 0; aSeat < seats; aSeat++) {
      const levels = Array.from({ length: seats }, (_, i) => (i === aSeat ? a : b));
      const final = tryPlay(deck, seats, first, variant, levels, botRng);
      if (!final) { score += 0.5; games++; continue; }
      const r = final.result!;
      score += r.draw ? 0.5 : r.fool === aSeat ? 0 : 1;
      games++;
    }
  }
  return { games, share: score / games, base: (seats - 1) / seats };
}
