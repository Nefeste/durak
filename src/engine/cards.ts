// Карта — число 0…35: масть × 9 + достоинство (docs/04-data-model.md, «Карта»).
// Масти: 0 ♠, 1 ♣, 2 ♦, 3 ♥. Достоинство: 0 — шестёрка … 8 — туз.

export type Card = number;

export const SUITS = 4;
export const RANKS = 9;
export const DECK_SIZE = 36;

export const suitOf = (c: Card): number => Math.floor(c / RANKS);
export const rankOf = (c: Card): number => c % RANKS;
export const cardOf = (suit: number, rank: number): Card => suit * RANKS + rank;

/** Бьёт ли `by` карту `on` при козырной масти `trumpSuit` (docs/08-rules.md, п. 4.2). */
export function beats(by: Card, on: Card, trumpSuit: number): boolean {
  const sb = suitOf(by), so = suitOf(on);
  if (sb === so) return rankOf(by) > rankOf(on);
  return sb === trumpSuit;
}

const SUIT_SIGNS = ['♠', '♣', '♦', '♥'];
const RANK_NAMES = ['6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];

/** Запись для людей и тестов: `6♠`, `10♥`, `В♣`, `Д♦`, `К♥`, `Т♠` (русские индексы, ADR 0010). */
export function nameOf(c: Card): string {
  return RANK_NAMES[rankOf(c)] + SUIT_SIGNS[suitOf(c)];
}

/** Обратное к `nameOf`: `'10♥'` → 30. */
export function parseCard(s: string): Card {
  const suit = SUIT_SIGNS.indexOf(s.slice(-1));
  const rank = RANK_NAMES.indexOf(s.slice(0, -1));
  if (suit < 0 || rank < 0) throw new Error(`not a card: ${s}`);
  return cardOf(suit, rank);
}

/** Несколько карт через пробел: `'6♠ 7♠ Т♥'`. */
export const cards = (s: string): Card[] => (s.trim() ? s.trim().split(/\s+/).map(parseCard) : []);
