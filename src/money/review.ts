// из nardy: src/money/review.ts @ 1d2bdff — ключ свой; «вдвоём на одном телефоне» в «Козыре» нет.
// Просьба об оценке в RuStore (docs/09-game-design.md):
// после победы над ботом, не раньше пятой законченной партии, не чаще раза в 60 дней; никогда —
// после поражения, вдвоём и онлайн. Кнопки «Оцените нас» нет: форма RuStore появляется сама,
// а сколько раз её можно показать, решает RuStore. Время просьбы — `durak.rate`.
import { KEYS, loadJson, saveJson } from '../state/storage';

export const RATE_RULES = { minGames: 5, gapMs: 60 * 24 * 3600_000 } as const;

export interface RateState { askedAt: number }

/** Пора ли попросить оценку после этой партии. `games` — законченных партий всего, с этой. */
export function shouldAskRating(s: RateState, now: number, game: { wonVsBot: boolean; games: number }): boolean {
  if (!game.wonVsBot || game.games < RATE_RULES.minGames) return false;
  return !s.askedAt || now - s.askedAt >= RATE_RULES.gapMs;
}

let state: RateState = { askedAt: 0 };
let loading: Promise<RateState> | null = null;

export function loadRate(): Promise<RateState> {
  loading ??= loadJson<Partial<RateState>>(KEYS.rate).then(r => (state = { askedAt: typeof r?.askedAt === 'number' ? r.askedAt : 0 }));
  return loading;
}

export const getRate = (): RateState => state;

export async function markAsked(now: number): Promise<void> {
  await loadRate();
  state = { askedAt: now };
  await saveJson(KEYS.rate, state);
}
