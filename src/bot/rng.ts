// Генератор с зерном для ботов и арены: бот своей случайности не берёт, её передают (чистота, как в «Нардах»).

export interface Rng {
  /** Число в [0, 1). */
  next(): number;
  /** Целое в [0, n). */
  int(n: number): number;
}

/** mulberry32 — короткий и одинаковый в Bun, Node и Hermes. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n: number) => Math.floor(next() * n) };
}
