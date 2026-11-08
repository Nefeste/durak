// из nardy: server/src/glicko.ts @ 1d2bdff
// Рейтинг онлайна — Glicko-2 (M. Glickman, «Example of the Glicko-2 system», 2013;
// docs/specs/2026-10-quick-match.md, ADR 0022). Период рейтинга — одна партия: каждая законченная
// быстрая партия обновляет обоих игроков.

export interface Glicko {
  rating: number;
  /** Отклонение: насколько рейтинг не устоялся (350 — новичок). */
  rd: number;
  /** Волатильность: насколько игрок «скачет». */
  vol: number;
}

export const GLICKO_START: Glicko = { rating: 1500, rd: 350, vol: 0.06 };
/** Сжатие шкалы Glicko-2: 400 / ln 10. */
const SCALE = 173.7178;
/** Насколько быстро может меняться волатильность (в статье — от 0,3 до 1,2). */
export const TAU = 0.5;
const EPS = 1e-6;

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expect = (mu: number, muj: number, phij: number) => 1 / (1 + Math.exp(-g(phij) * (mu - muj)));

/** Рейтинг после периода с партиями `games` (счёт 1 — победа, 0 — поражение). Без партий растёт только отклонение. */
export function glicko2(p: Glicko, games: readonly { opp: Glicko; score: number }[], tau = TAU): Glicko {
  const mu = (p.rating - 1500) / SCALE, phi = p.rd / SCALE, sigma = p.vol;
  if (!games.length) return { rating: p.rating, rd: Math.min(350, SCALE * Math.sqrt(phi * phi + sigma * sigma)), vol: sigma };
  let vInv = 0, sum = 0;
  for (const { opp, score } of games) {
    const muj = (opp.rating - 1500) / SCALE, phij = opp.rd / SCALE;
    const gj = g(phij), e = expect(mu, muj, phij);
    vInv += gj * gj * e * (1 - e);
    sum += gj * (score - e);
  }
  const v = 1 / vInv, delta = v * sum;
  // новая волатильность — корень f(x) = 0 методом Иллинойса (шаг 5 статьи)
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x), d = phi * phi + v + ex;
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * d * d) - (x - a) / (tau * tau);
  };
  let A = a, B: number;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A), fB = f(B);
  while (Math.abs(B - A) > EPS) {
    const C = A + ((A - B) * fA) / (fB - fA), fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C;
    fB = fC;
  }
  const vol = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + vol * vol);
  const phi2 = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  return { rating: SCALE * (mu + phi2 * phi2 * sum) + 1500, rd: Math.min(350, SCALE * phi2), vol };
}
