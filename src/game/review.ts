// Разбор партии по записи: запись разворачивается в наблюдения игрока (ADR 0005 — бот колоды не видит), их судит
// `reviewThink` из `src/bot/` (docs/10-bot.md, «Разбор»).
import { reviewThink, REVIEW_SAMPLES } from '../bot';
import type { Move, Review, Thinking } from '../bot';
import { apply, newGame, observe } from '../engine';
import type { GameRecord } from '../engine';

/** Решения места `seat` в партии: наблюдение до каждого его действия. */
export function movesOf(r: GameRecord, seat: number): Move[] {
  let s = newGame({ rules: r.rules, variant: r.variant, seats: r.seats, first: r.first }, r.deck);
  const out: Move[] = [];
  r.actions.forEach(({ seat: who, action }, at) => {
    if (who === seat) out.push({ at, o: observe(s, seat), played: action });
    s = apply(s, who, action);
  });
  return out;
}

export const reviewGame = (r: GameRecord, seat: number, samples = REVIEW_SAMPLES): Thinking<Review> => reviewThink(movesOf(r, seat), seat, samples);
