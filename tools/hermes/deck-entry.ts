// Вход сборки для Hermes (tools/hermes/deck.ts): векторы колоды durak-deck-v1 из фикстуры,
// посчитанные движком телефона. Печатает одну строку на вектор и итог.
import { commitOf, deckFrom, fromHex, serverDeck } from '../../src/engine';
import fixture from '../test/fixtures/deck-v1.json';

declare const print: (s: string) => void;
let bad = 0;
for (let i = 0; i < fixture.length; i++) {
  const c = fixture[i];
  const deck = c.seeds.length ? serverDeck(c.serverSeed, c.seeds) : deckFrom(fromHex(c.serverSeed));
  const same = commitOf(c.serverSeed) === c.commit && deck.join(',') === c.deck.join(',');
  if (!same) bad++;
  print(`вектор ${i + 1}: ${same ? 'совпал' : 'НЕ совпал'}`);
}
print(bad ? `ПРОВАЛ: ${bad} из ${fixture.length}` : `OK: ${fixture.length} из ${fixture.length}`);
