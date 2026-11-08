// из nardy: src/ui/variants.ts @ 1d2bdff — без изменений.
// Выбор варианта звука (docs/specs/2026-10-look-and-sound.md): случайный, но не тот же, что
// прозвучал только что, — шаги хода звучат как разные удары, а не как один и тот же файл.
// Отдельно от feedback.ts: без модулей Expo, проверяется тестом.

/** Номер варианта из `n`, кроме `last`; `rnd` — случайное в [0, 1). */
export function pickVariant(n: number, last: number | undefined, rnd: () => number = Math.random): number {
  if (n <= 1) return 0;
  const free = last === undefined || last < 0 || last >= n ? n : n - 1;
  const k = Math.min(free - 1, Math.floor(rnd() * free));
  return free < n && k >= (last as number) ? k + 1 : k;
}

/** Громкость удара: как у руки, чуть разная — от 0,85 до 1. */
export const strength = (rnd: () => number = Math.random): number => 0.85 + 0.15 * rnd();
