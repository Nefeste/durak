// Векторы колоды durak-deck-v1 для Bun, Node и Hermes (docs/specs/2026-11-v1.md, раздел 12).
//   bun tools/test/make-deck-fixture.ts > tools/test/fixtures/deck-v1.json
import { commitOf, serverDeck, deckFrom, fromHex } from '../../src/engine';

const cases = [
  { serverSeed: '00'.repeat(32), seeds: [] as string[] },
  { serverSeed: '01'.repeat(32), seeds: ['ab'.repeat(16), 'cd'.repeat(16)] },
  { serverSeed: '8f3a'.repeat(16), seeds: ['00112233445566778899aabbccddeeff', 'ffeeddccbbaa99887766554433221100', '0123456789abcdef0123456789abcdef'] },
  { serverSeed: 'deadbeef'.repeat(8), seeds: ['11'.repeat(16), '22'.repeat(16), '33'.repeat(16), '44'.repeat(16)] },
];
const out = cases.map(c => ({ ...c, commit: commitOf(c.serverSeed), deck: c.seeds.length ? serverDeck(c.serverSeed, c.seeds) : deckFrom(fromHex(c.serverSeed)) }));
console.log(JSON.stringify(out, null, 1));
