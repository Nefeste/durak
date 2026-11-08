// из nardy: server/src/limits.ts @ 1d2bdff
// Пределы частоты (docs/03-server-api.md, «Пределы»): ведро жетонов на ключ, адрес или игрока.

import { ApiError } from './errors';

export class Limits {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  private swept = 0;

  constructor(private readonly now: () => number) {}

  /** Взять жетон из ведра `key` ёмкостью `size`, которое наполняется целиком за `perMs`; нет — `too-fast`. */
  take(key: string, size: number, perMs: number): void {
    const now = this.now();
    if (now - this.swept > 600_000) this.sweep(now);
    const b = this.buckets.get(key) ?? { tokens: size, at: now };
    b.tokens = Math.min(size, b.tokens + ((now - b.at) * size) / perMs);
    b.at = now;
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      throw new ApiError('too-fast');
    }
    b.tokens -= 1;
    this.buckets.set(key, b);
  }

  /** Забыть вёдра, которые давно не трогали (они уже полны). */
  private sweep(now: number): void {
    this.swept = now;
    for (const [k, b] of this.buckets) if (now - b.at > 3_600_000) this.buckets.delete(k);
  }
}
