// Колода durak-deck-v1 (docs/specs/2026-11-v1.md, раздел 12; критерий 4): векторы, отпечаток,
// подмена карты ловится. Векторы сверены с Node crypto при записи (tools/test/make-deck-fixture.ts).
import { describe, expect, test } from 'bun:test';
import { checkDeck, commitOf, deckFrom, fromHex, serverDeck } from '../../src/engine';
import fixture from './fixtures/deck-v1.json';

describe('колода durak-deck-v1', () => {
  test('векторы совпадают', () => {
    for (const c of fixture) {
      expect(commitOf(c.serverSeed)).toBe(c.commit);
      const deck = c.seeds.length ? serverDeck(c.serverSeed, c.seeds) : deckFrom(fromHex(c.serverSeed));
      expect(deck).toEqual(c.deck);
      expect(new Set(deck).size).toBe(36);
    }
  });
  test('сверка после партии: верные карты проходят, подмена и чужой отпечаток — нет', () => {
    const c = fixture[2];
    const seen = c.deck.slice(0, 13).map((card, index) => ({ index, card }));
    expect(checkDeck(c.serverSeed, c.seeds, c.commit, seen)).toBe(true);
    const swapped = seen.map((x, i) => (i === 3 ? { ...x, card: seen[4].card } : x));
    expect(checkDeck(c.serverSeed, c.seeds, c.commit, swapped)).toBe(false);
    expect(checkDeck(c.serverSeed, c.seeds, fixture[0].commit, seen)).toBe(false);
  });
  test('зерно любого места меняет колоду', () => {
    const c = fixture[1];
    expect(serverDeck(c.serverSeed, [c.seeds[0], '00'.repeat(16)])).not.toEqual(c.deck);
  });
});
