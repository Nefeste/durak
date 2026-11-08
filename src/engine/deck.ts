// Порядок колоды `durak-deck-v1` (docs/specs/2026-11-v1.md, раздел 12): поток HMAC-SHA-256 от
// зерна сервера и зёрен мест, тасовка Фишера — Йетса с отбрасыванием. С ботами — то же
// построение от 32 байт телефона без зёрен мест.
import { DECK_SIZE } from './cards';
import type { Card } from './cards';
import { ascii, fromHex, hmacSha256, sha256, toHex } from './sha256';

export const DECK_VERSION = 'durak-deck-v1';

class Stream {
  private block: Uint8Array = new Uint8Array(0);
  private pos = 0;
  private k = 0;
  constructor(private key: Uint8Array, private prefix: string) {}
  byte(): number {
    if (this.pos >= this.block.length) {
      this.block = hmacSha256(this.key, ascii(this.prefix + this.k++));
      this.pos = 0;
    }
    return this.block[this.pos++];
  }
}

/** Колода из ключа (зерна сервера или 32 байт телефона) и зёрен мест по порядку мест. */
export function deckFrom(key: Uint8Array, seeds: string[] = []): Card[] {
  const stream = new Stream(key, `${DECK_VERSION}|${seeds.join('|')}|`);
  const deck = Array.from({ length: DECK_SIZE }, (_, i) => i);
  for (let i = DECK_SIZE - 1; i >= 1; i--) {
    const n = i + 1;
    const bound = 65536 - (65536 % n);
    let x: number;
    do x = (stream.byte() << 8) | stream.byte();
    while (x >= bound);
    const j = x % n;
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Колода онлайна: зерно сервера (hex, 32 байта) и зёрна мест (hex, 16 байт). */
export const serverDeck = (serverSeed: string, seeds: string[]): Card[] => deckFrom(fromHex(serverSeed), seeds);

/** Отпечаток зерна сервера, который телефон получает до раздачи. */
export const commitOf = (serverSeed: string): string => toHex(sha256(fromHex(serverSeed)));

/** Сверка после партии: отпечаток совпал и каждая увиденная карта стоит на своём месте колоды. */
export function checkDeck(serverSeed: string, seeds: string[], commit: string, seen: { index: number; card: Card }[]): boolean {
  if (commitOf(serverSeed) !== commit) return false;
  const deck = serverDeck(serverSeed, seeds);
  return seen.every(({ index, card }) => deck[index] === card);
}
