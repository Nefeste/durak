// из nardy: src/money/ads.ts @ 1d2bdff — числа те же (docs/09-game-design.md, «Реклама и покупки»), ключ свой.
// Правила частоты полноэкранной рекламы (docs/09-game-design.md, «Реклама и покупки»)
// и её счётчики (`durak.ads`, docs/04-data-model.md). `canShowInterstitial` — единственное место,
// где эти правила записаны в коде; числа меняются только вместе с геймдизайном.
import { KEYS, loadJson, saveJson } from '../state/storage';

export const AD_RULES = {
  /** первые партии после установки — без рекламы: нужно завершить не меньше стольких */
  firstGames: 4,
  /** с прошлой полноэкранной — не меньше стольких партий («не чаще, чем через партию») */
  gamesBetween: 2,
  /** с прошлого показа любой рекламы, мс */
  minGapMs: 4 * 60_000,
  /** партия шла не меньше, мс: после быстрой сдачи рекламы нет */
  minGameMs: 2 * 60_000,
  /** полноэкранных в день, не больше */
  perDay: 12,
} as const;

export interface AdCounters {
  /** законченных партий всего (после установки) */
  games: number;
  /** законченных партий с прошлой полноэкранной рекламы */
  sinceInterstitial: number;
  /** длина последней законченной партии, мс */
  lastGameMs: number;
  /** время последнего показа любой рекламы (полноэкранной или за вознаграждение); 0 — не было */
  lastShown: number;
  /** день (местный, «2026-09-28») и сколько полноэкранных в этот день */
  day: string;
  today: number;
  /** показов всего, для статистики */
  shown: { interstitial: number; rewarded: number };
}

export const EMPTY_COUNTERS: AdCounters = {
  games: 0, sinceInterstitial: 0, lastGameMs: 0, lastShown: 0, day: '', today: 0, shown: { interstitial: 0, rewarded: 0 },
};

/** Местный день: дневной предел считается по календарю игрока, а не по UTC. */
export function dayOf(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Можно ли показать полноэкранную рекламу при уходе с экрана итога. `paid` — есть «Без рекламы»
 * или «Про». Седьмое правило («реклама загружена заранее») проверяет вызывающий: чистой функции
 * о загрузке знать нечего.
 */
export function canShowInterstitial(c: AdCounters, now: number, paid: boolean): boolean {
  if (paid) return false;
  if (c.games < AD_RULES.firstGames) return false;
  if (c.sinceInterstitial < AD_RULES.gamesBetween) return false;
  if (c.lastShown && now - c.lastShown < AD_RULES.minGapMs) return false;
  if (c.lastGameMs < AD_RULES.minGameMs) return false;
  const today = c.day === dayOf(now) ? c.today : 0;
  return today < AD_RULES.perDay;
}

/** Партия закончилась (любая: с ботами и онлайн). */
export function afterGame(c: AdCounters, durationMs: number): AdCounters {
  return { ...c, games: c.games + 1, sinceInterstitial: c.sinceInterstitial + 1, lastGameMs: Math.max(0, durationMs) };
}

/** Реклама показана. Полноэкранная обнуляет счёт партий и идёт в дневной предел. */
export function afterShown(c: AdCounters, now: number, kind: 'interstitial' | 'rewarded'): AdCounters {
  const day = dayOf(now);
  const today = c.day === day ? c.today : 0;
  return kind === 'interstitial'
    ? { ...c, lastShown: now, sinceInterstitial: 0, day, today: today + 1, shown: { ...c.shown, interstitial: c.shown.interstitial + 1 } }
    : { ...c, lastShown: now, day, today, shown: { ...c.shown, rewarded: c.shown.rewarded + 1 } };
}

/** Сохранённое — поверх пустых счётчиков; битое не проходит. */
export function normalizeCounters(raw: unknown): AdCounters {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  const s = (r.shown && typeof r.shown === 'object' ? r.shown : {}) as Record<string, unknown>;
  return {
    games: num(r.games), sinceInterstitial: num(r.sinceInterstitial), lastGameMs: num(r.lastGameMs), lastShown: num(r.lastShown),
    day: typeof r.day === 'string' ? r.day : '', today: num(r.today),
    shown: { interstitial: num(s.interstitial), rewarded: num(s.rewarded) },
  };
}

let counters: AdCounters = EMPTY_COUNTERS;
let loading: Promise<AdCounters> | null = null;

/** Прочитать счётчики один раз (при запуске). */
export function loadAdCounters(): Promise<AdCounters> {
  loading ??= loadJson<unknown>(KEYS.ads).then(raw => (counters = normalizeCounters(raw)));
  return loading;
}

export const getAdCounters = (): AdCounters => counters;

/** Изменить и сохранить — после чтения, чтобы ранняя запись не затёрла сохранённое. */
export function updateAdCounters(f: (c: AdCounters) => AdCounters): Promise<void> {
  return loadAdCounters().then(() => {
    counters = f(counters);
    return saveJson(KEYS.ads, counters);
  });
}
