// из nardy: src/money/adsSdk.ts @ 1d2bdff
// Рекламная сеть Яндекса на телефоне (официальный плагин `yandex-mobile-ads`; docs/11-money.md,
// «Реклама»). Номера блоков — переменные сборки; без них — демонстрационные блоки Яндекса, которые
// показывают тестовую рекламу и денег не приносят (так собираются сборки без номеров блоков).
import { InterstitialAdLoader, MobileAds, RewardedAdLoader } from 'yandex-mobile-ads';
import type { InterstitialAd, RewardedAd } from 'yandex-mobile-ads';
import type { AdsSdk } from './types';

const UNITS = {
  interstitial: process.env.EXPO_PUBLIC_YANDEX_ADS_INTERSTITIAL || 'demo-interstitial-yandex',
  rewarded: process.env.EXPO_PUBLIC_YANDEX_ADS_REWARDED || 'demo-rewarded-yandex',
};

let interstitial: InterstitialAd | null = null;
let rewarded: RewardedAd | null = null;
let loadingI = false, loadingR = false;
let iLoader: Promise<InterstitialAdLoader> | null = null;
let rLoader: Promise<RewardedAdLoader> | null = null;

export const adsSdk: AdsSdk = {
  async init(personal) {
    MobileAds.setUserConsent(personal);
    await MobileAds.initialize();
  },
  setPersonal(personal) { MobileAds.setUserConsent(personal); },

  loadInterstitial() {
    if (interstitial || loadingI) return;
    loadingI = true;
    iLoader ??= InterstitialAdLoader.create();
    iLoader
      .then(l => l.loadAd({ adUnitId: UNITS.interstitial }))
      .then(ad => { interstitial = ad; })
      .catch(() => { iLoader = null; })         // не загрузилась — не показываем; попробуем в следующей партии
      .finally(() => { loadingI = false; });
  },
  interstitialReady: () => !!interstitial,
  showInterstitial(onShown) {
    const ad = interstitial;
    if (!ad) return false;
    interstitial = null;                         // показанная реклама второй раз не показывается
    ad.onAdShown = onShown;
    ad.onAdFailedToShow = () => {};
    ad.onAdDismissed = () => {};
    ad.show().catch(() => {});
    return true;
  },

  loadRewarded(onReady) {
    if (rewarded) { onReady?.(); return; }
    if (loadingR) return;
    loadingR = true;
    rLoader ??= RewardedAdLoader.create();
    rLoader
      .then(l => l.loadAd({ adUnitId: UNITS.rewarded }))
      .then(ad => { rewarded = ad; onReady?.(); })
      .catch(() => { rLoader = null; })
      .finally(() => { loadingR = false; });
  },
  rewardedReady: () => !!rewarded,
  showRewarded() {
    const ad = rewarded;
    if (!ad) return Promise.resolve('failed' as const);
    rewarded = null;
    return new Promise(resolve => {
      let got = false;
      ad.onRewarded = () => { got = true; };
      ad.onAdFailedToShow = () => resolve('failed');
      ad.onAdDismissed = () => resolve(got ? 'rewarded' : 'closed');
      ad.show().catch(() => resolve('failed'));
    });
  },
};
