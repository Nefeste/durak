// из nardy: src/i18n/plural.ts @ 1d2bdff (из votchina) — пока только русский.
// Свои правила, а не Intl.PluralRules: на него в Hermes под Android полагаться нельзя.

/** Русский: 1 очко, 2 очка, 5 очков; 11–14 — «много», 21 — снова «один». */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
