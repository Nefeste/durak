// Арена: сила уровней один на один на зеркальных раздачах (docs/10-bot.md, «Арена»).
// Каждая колода играется дважды, места меняются. Итог — доля партий, где первый уровень не остался
// с картами (ничья — половина), и 95-процентный интервал.
//   bun tools/sim/arena.ts 1000 average novice [podkidnoy|perevodnoy] [зерно]
import { firstOf, dealOf, observe } from '../../src/engine';
import type { Variant } from '../../src/engine';
import { chooseAction, isLevel, makeRng } from '../../src/bot';
import type { Level } from '../../src/bot';
import { playGame, shuffled } from './play';

export interface ArenaResult { a: Level; b: Level; games: number; score: number; share: number; low: number; high: number }

export function arena(pairs: number, a: Level, b: Level, variant: Variant, seed = 1): ArenaResult {
  const deckRng = makeRng(seed);
  const botRng = makeRng(seed ^ 0x9e3779b9);
  let score = 0, games = 0;
  for (let p = 0; p < pairs; p++) {
    const deck = shuffled(deckRng);
    const { hands, trump } = dealOf(deck, 2);
    const first = firstOf(hands, trump).seat;
    for (const aSeat of [0, 1]) {
      const levels: Level[] = aSeat === 0 ? [a, b] : [b, a];
      const { final } = playGame(deck, 2, first, variant, (s, seat) => chooseAction(observe(s, seat), levels[seat], botRng));
      const r = final.result!;
      score += r.draw ? 0.5 : r.fool === aSeat ? 0 : 1;
      games++;
    }
  }
  const share = score / games;
  const se = Math.sqrt(Math.max(share * (1 - share), 1e-9) / games);
  return { a, b, games, score, share, low: share - 1.96 * se, high: share + 1.96 * se };
}

if (import.meta.main) {
  const [n = '500', a = 'average', b = 'novice', variant = 'podkidnoy', seed = '1'] = process.argv.slice(2);
  if (!isLevel(a) || !isLevel(b)) throw new Error('уровни: novice beginner amateur average');
  const r = arena(Number(n), a, b, variant as Variant, Number(seed));
  const pct = (x: number) => (x * 100).toFixed(1) + ' %';
  console.log(`${a} против ${b}, ${variant}: ${r.games} партий, ${pct(r.share)} [${pct(r.low)} … ${pct(r.high)}]`);
}
