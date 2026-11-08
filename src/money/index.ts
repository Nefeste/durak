// из nardy: src/money/index.ts @ 1d2bdff — без оформлений и дневной статистики.
// Деньги в игре (docs/11-money.md, docs/09-game-design.md «Реклама и покупки»): когда грузить и показывать
// рекламу, сверка прав с магазином, покупка. Экраны зовут только эти функции; правила частоты — в ads.ts,
// права — в rights.ts.
import { Linking } from 'react-native';
import { logError } from '../state/crashlog';
import { getSettings } from '../state/store';
import { afterGame, afterShown, canShowInterstitial, getAdCounters, loadAdCounters, updateAdCounters } from './ads';
import { adsSdk } from './adsSdk';
import { billing, STORE } from './billing';
import { isAdsOff, loadRights, setRights, unlockReview, withOwned } from './rights';
import { getRate, loadRate, markAsked, shouldAskRating } from './review';
import { pay, review } from './rustore';
import type { Availability, BuyResult, ProductId, Unavailable } from './types';

export { billing, STORE } from './billing';
export { getRights, isAdsOff, isPro, isUnlocked, onRights, reviewAccess } from './rights';
export type { ReviewAccess } from './rights';
export { MAIN_PRODUCTS, ON_SALE, PRO_ON_SALE } from './types';
export type { Availability, BuyResult, MainProductId, Product, ProductId, Unavailable } from './types';

/** SDK рекламы упал при запуске — реклама выключена до перезапуска приложения. */
let adsBroken = false;
let started: Promise<void> | null = null;

/** При запуске: счётчики, кэш прав, SDK рекламы (без показа), сверка прав с магазином. */
export function startMoney(): Promise<void> {
  started ??= (async () => {
    await Promise.all([loadAdCounters(), loadRights(), loadRate()]);
    try {
      await adsSdk.init(getSettings().personalAds);
    } catch (e) {
      adsBroken = true;
      logError('error', e, 'ads-init');
    }
    void syncRights();
  })();
  return started;
}

/** Сверить права с магазином. `ok` — сверено; иначе — почему нет и что ответил RuStore (права остаются из кэша). */
export async function syncRights(): Promise<Availability> {
  try {
    const a = await billing.availability();
    if (!a.ok) return a;
    const owned = await billing.owned();
    if (!owned) return { ok: false, why: 'error' };
    await setRights(withOwned(owned, Date.now()));
    return { ok: true };
  } catch (e) {
    logError('error', e, 'billing-sync');
    return { ok: false, why: 'error' };
  }
}

export async function buy(id: ProductId): Promise<BuyResult> {
  try {
    const r = await billing.purchase(id);
    // и после отмены: игрок мог заплатить и закрыть шторку — права покажет сверка (так советует RuStore)
    if (r.ok || r.why === 'cancelled') await syncRights();
    // оплата не прошла — ответ RuStore в журнал сбоев: игрок пришлёт его «Сообщить об ошибке»
    else if (r.why === 'failed') logError('error', r.detail ?? r.code ?? 'failed', 'billing-buy');
    return r;
  } catch (e) {
    logError('error', e, 'billing-buy');
    return { ok: false, why: 'failed' };
  }
}

export function setPersonalAds(personal: boolean): void {
  if (!adsBroken) adsSdk.setPersonal(personal);
}

/** Партия началась: загрузить полноэкранную заранее, чтобы к концу партии она была готова. */
export function gameStarted(): void {
  if (adsBroken || isAdsOff()) return;
  adsSdk.loadInterstitial();
}

/** Партия закончилась (любая: с ботами и онлайн): в счётчики. */
export function gameEnded(durationMs: number): void {
  void updateAdCounters(c => afterGame(c, durationMs));
}

/**
 * Игрок уходит с экрана итога («Ещё партию», «В меню»). После победы над ботами, если пора, —
 * форма оценки RuStore (src/money/review.ts), и тогда без рекламы: два окна подряд — много.
 * Иначе — полноэкранная реклама, если правила разрешают и она уже загружена. Не ждёт ничего —
 * переход на следующий экран идёт сразу. Во время партии эту функцию не зовёт никто.
 */
export function leavingEnd(game: { wonVsBot: boolean }): void {
  const now = Date.now();
  if (STORE === 'rustore' && review && shouldAskRating(getRate(), now, { wonVsBot: game.wonVsBot, games: getAdCounters().games })) {
    void markAsked(now);
    review.ask().catch(() => { /* нет RuStore, нет входа, лимит RuStore, уже оценил — молча */ });
    return;
  }
  if (adsBroken || !canShowInterstitial(getAdCounters(), now, isAdsOff()) || !adsSdk.interstitialReady()) return;
  adsSdk.showInterstitial(() => { void updateAdCounters(c => afterShown(c, Date.now(), 'interstitial')); });
}

/** Загрузить рекламу за вознаграждение (экран итога и разбор); `onReady` — когда готова. */
export function prepareRewarded(onReady: () => void): void {
  if (!adsBroken) adsSdk.loadRewarded(onReady);
}

export const rewardedReady = (): boolean => !adsBroken && adsSdk.rewardedReady();

/** Реклама за вознаграждение: досмотрена — полный разбор этой партии открыт навсегда (этап Д). */
export async function watchForReview(at: number): Promise<boolean> {
  if (adsBroken) return false;
  const r = await adsSdk.showRewarded();
  if (r === 'rewarded') {
    await updateAdCounters(c => afterShown(c, Date.now(), 'rewarded'));
    await unlockReview(at);
    return true;
  }
  return false;
}

let offeredFor: number | null = null;
/**
 * Строка «Полный разбор — в „Про“» на экране итога — не чаще раза за запуск приложения
 * (docs/09-game-design.md, «Реклама и покупки»): только у той партии, где она показана впервые.
 */
export function storeOfferFor(at: number): boolean {
  offeredFor ??= at;
  return offeredFor === at;
}

/** Где помочь с покупками: вход в RuStore, сам RuStore или его страница с игрой. */
const RUSTORE_URL = 'https://www.rustore.ru/catalog/app/games.gornitsa.durak';
export function openRuStore(why: Unavailable): void {
  const web = () => { void Linking.openURL(RUSTORE_URL).catch(() => {}); };
  if (!pay || why === 'other-build' || why === 'no-rustore') { web(); return; }
  (why === 'not-signed-in' ? pay.openRuStoreAuthorization() : pay.openRuStore()).catch(web);
}
