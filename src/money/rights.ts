// из nardy: src/money/rights.ts @ 1d2bdff — без оформлений.
// Права игрока: «Без рекламы», «Про» и открытые рекламой разборы (docs/09-game-design.md, «Реклама и
// покупки»). Правда — у RuStore Pay; на телефоне — кэш `durak.purchases`, чтобы без сети всё купленное
// работало. Что открывает «Про» в разборе — `reviewAccess`; разбор — этап Д (docs/07-roadmap.md).
import { KEYS, loadJson, saveJson } from '../state/storage';
import type { Owned } from './types';

/** «Про» без сверки с магазином живёт ещё трое суток после оплаченного срока. */
export const GRACE_MS = 3 * 24 * 3600_000;
/** Сколько открытых рекламой разборов помнить (по началу партии). */
export const KEEP_UNLOCKED = 300;

export interface Rights {
  noAds: boolean;
  /** до какого времени оплачена «Про»; 0 — не было */
  proUntil: number;
  /** когда права последний раз сверены с магазином; 0 — никогда */
  checkedAt: number;
}

export const NO_RIGHTS: Rights = { noAds: false, proUntil: 0, checkedAt: 0 };

export const proActive = (r: Rights, now: number): boolean => r.proUntil > 0 && now < r.proUntil + GRACE_MS;
/** Полноэкранной рекламы нет: «Без рекламы» или «Про» («Про» включает «Без рекламы»). */
export const adsOff = (r: Rights, now: number): boolean => r.noAds || proActive(r, now);

/**
 * Ответ магазина поверх кэша. Магазин — правда: что он не назвал, того нет. Подписка, которая
 * по словам магазина уже кончилась, выключается сразу — трое суток даются только тому, кто без сети.
 */
export function withOwned(owned: Owned, now: number): Rights {
  return { noAds: owned.noAds, proUntil: owned.proUntil > now ? owned.proUntil : 0, checkedAt: now };
}

export function normalizeRights(raw: unknown): Rights {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  return { noAds: r.noAds === true, proUntil: num(r.proUntil), checkedAt: num(r.checkedAt) };
}

/** Насколько открыт разбор партии. */
export type ReviewAccess =
  | 'full'    // всё: «Про», разбор этой партии открыт рекламой или это последняя партия дня
  | 'worst';  // бесплатно у любой партии: итог и главная ошибка

/**
 * Единственное место, где решается, что открыто в разборе (docs/09-game-design.md, «Итог партии и
 * разбор»): бесплатно — итог и главная ошибка каждой партии и полный разбор последней партии за день;
 * полный разбор любой — за рекламу по желанию (одна партия) или с «Про». Подсказка, «Помощь памяти» и
 * отмена хода против ботов сюда не ходят: они бесплатны всем — устав запрещает продавать силу.
 */
export function reviewAccess(pro: boolean, unlocked: boolean, lastToday: boolean): ReviewAccess {
  return pro || unlocked || lastToday ? 'full' : 'worst';
}

let rights: Rights = NO_RIGHTS;
let unlocked: number[] = [];
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Прочитать кэш прав и открытых разборов один раз (при запуске). */
export function loadRights(): Promise<void> {
  loading ??= Promise.all([loadJson<unknown>(KEYS.purchases), loadJson<unknown>(KEYS.unlocked)]).then(([p, u]) => {
    rights = normalizeRights(p);
    unlocked = Array.isArray(u) ? u.filter((x): x is number => typeof x === 'number') : [];
    emit();
  });
  return loading;
}

export const getRights = (): Rights => rights;
export const isPro = (now = Date.now()): boolean => proActive(rights, now);
export const isAdsOff = (now = Date.now()): boolean => adsOff(rights, now);
export const isUnlocked = (at: number): boolean => unlocked.includes(at);

/** Подписаться на перемены прав: экраны перерисовываются после покупки и сверки. */
export function onRights(f: () => void): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}
function emit() { for (const f of listeners) f(); }

export async function setRights(next: Rights): Promise<void> {
  await loadRights();
  rights = next;
  emit();
  await saveJson(KEYS.purchases, rights);
}

/** Реклама за вознаграждение досмотрена: полный разбор этой партии открыт навсегда. */
export async function unlockReview(at: number): Promise<void> {
  await loadRights();
  if (unlocked.includes(at)) return;
  unlocked = [at, ...unlocked].slice(0, KEEP_UNLOCKED);
  emit();
  await saveJson(KEYS.unlocked, unlocked);
}
