// Законные действия из наблюдения: они зависят только от своей руки и открытых сведений (числа
// карт у соперников, стола, колоды), поэтому скрытые карты подставляются любые.
import { DECK_SIZE, legalActions, stateFrom } from '../engine';
import type { Action, Card, Observation } from '../engine';

/** Карты, которых место не видит: руки соперников без взятых в открытую и колода без козыря. */
export function unseen(o: Observation): Card[] {
  const known = new Set<Card>([...o.hand, ...o.discard, ...o.openly.flat()]);
  for (const [a, d] of o.table) {
    known.add(a);
    if (d !== null) known.add(d);
  }
  if (o.talonSize > 0) known.add(o.trump);
  const out: Card[] = [];
  for (let c = 0; c < DECK_SIZE; c++) if (!known.has(c)) out.push(c);
  return out;
}

/** Расклад скрытых карт: `pool` по порядку — сначала в руки соперников (после взятых в открытую),
 *  потом в колоду. */
export function layout(o: Observation, pool: Card[]): { hidden: Card[][]; talon: Card[] } {
  let i = 0;
  const hidden = o.handSizes.map((n, seat) => {
    if (seat === o.seat) return [...o.hand];
    const hand = [...o.openly[seat]];
    while (hand.length < n) hand.push(pool[i++]);
    return hand;
  });
  const talon = pool.slice(i, i + Math.max(0, o.talonSize - 1));
  return { hidden, talon };
}

export function legalFor(o: Observation): Action[] {
  const { hidden, talon } = layout(o, unseen(o));
  return legalActions(stateFrom(o, hidden, talon), o.seat);
}
