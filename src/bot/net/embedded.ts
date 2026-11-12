// Сеть «Мастера» внутри сборки (docs/specs/2026-11-neural.md, «Как сеть попадает в игру»): веса лежат в модуле
// `weights.ts` строкой base64 (его пишет tools/gpu/embed.ts, руками не правят) — так они попадают в бандл без
// загрузки ресурсов. Раскодировка — своя, без `atob` (одинаково в Hermes, Bun и браузере), и кусками: 620 КБ на телефоне
// раскодируются дольше одного куска размышления (≤ 12 мс), поэтому загрузка — тоже `Thinking` с `yield` между кусками.
// Прерванная загрузка не теряется: состояние раскодировки — в модуле, следующее решение продолжает с того же места.
import type { Thinking } from '../think';
import { netFromBin } from './model';
import type { Net } from './model';
import { MASTER_WEIGHTS } from './weights';

// из nardy: src/bot/weights.ts @ bae2eca — `fromBase64`: таблица знаков и сдвиги те же; здесь — с продолжением
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Код знака → 6 бит; −1 — не знак base64 (пропускается, как и «=»). */
const SIXBITS = (() => {
  const t = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) t[ALPHABET.charCodeAt(i)] = i;
  return t;
})();

/** Раскодировка base64 с продолжением: `step(n)` разбирает следующие `n` знаков. */
export class Base64Reader {
  readonly out: Uint8Array;
  private readonly s: string;
  private at = 0;
  private k = 0;
  private bits = 0;
  private acc = 0;
  constructor(s: string) {
    this.s = s;
    this.out = new Uint8Array(Math.floor((s.length * 3) / 4));
  }
  get done(): boolean { return this.at >= this.s.length; }
  step(n: number): void {
    const s = this.s, out = this.out, end = Math.min(s.length, this.at + n);
    let { k, bits, acc } = this;
    for (let i = this.at; i < end; i++) {
      const c = s.charCodeAt(i), v = c < 128 ? SIXBITS[c] : -1;
      if (v < 0) continue;
      acc = ((acc << 6) | v) & 0xffffff;
      bits += 6;
      if (bits >= 8) { bits -= 8; out[k++] = (acc >> bits) & 0xff; }
    }
    this.at = end; this.k = k; this.bits = bits; this.acc = acc;
  }
  bytes(): Uint8Array { return this.out.subarray(0, this.k); }
}

/** Байты из base64 целиком. */
export function fromBase64(s: string): Uint8Array {
  const r = new Base64Reader(s);
  r.step(s.length);
  return r.bytes();
}

/** Знаков base64 на кусок загрузки: на Hermes ПК — около 1 мс, на телефоне втрое медленнее — всё равно в куске. */
export const LOAD_CHUNK = 16_384;

/** Загрузчик сети из строки base64: каждый вызов — `Thinking` загрузки, `yield` после каждого куска раскодировки;
 *  «хватит» в ответ — `null` (сеть ещё не готова, решение берёт запасной ход), а прогресс остаётся до следующего вызова.
 *  Готовая сеть запоминается: раскодировка — один раз за запуск игры. */
export function netLoader(data: string, chunk = LOAD_CHUNK): () => Thinking<Net | null> {
  let reader: Base64Reader | null = null;
  let net: Net | null = null;
  return function* load() {
    if (net) return net;
    reader ??= new Base64Reader(data);
    while (!reader.done) {
      reader.step(chunk);
      if (!reader.done && (yield)) return null;
    }
    net = netFromBin(reader.bytes());
    reader = null;
    return net;
  };
}

/** Сеть «Мастера» кусками (для приложения: `think` уровня `neural`). */
export const loadMaster = netLoader(MASTER_WEIGHTS.data);

/** Сеть «Мастера» сразу, без кусков, — для арены, сервера и тестов. */
export function masterNet(): Net {
  const it = loadMaster();
  for (let r = it.next(); ; r = it.next(false)) if (r.done) return r.value!;
}
