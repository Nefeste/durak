// из nardy: src/money/adsSdk.web.ts @ 1d2bdff
// Реклама в браузере — подделка для проверок (tools/e2e): веб-сборка в магазин не идёт. Реклама
// «загружается» сразу, «показ» записывается в `globalThis.__kozyrAds` (и в localStorage — прогон
// перезагружает страницу), чтобы прогон мог сверить, когда полноэкранная показалась бы на телефоне;
// реклама за вознаграждение сразу даёт награду.
import type { AdsSdk } from './types';

interface Log { shown: ('interstitial' | 'rewarded')[]; personal: boolean | null }
const KEY = 'durak.test-ads';
const g = globalThis as unknown as { __kozyrAds?: Log };
function log(): Log {
  if (!g.__kozyrAds) {
    let saved: Partial<Log> | null = null;
    try { saved = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as Partial<Log> | null; } catch { /* нет — начнём с пустого */ }
    g.__kozyrAds = { shown: Array.isArray(saved?.shown) ? saved.shown : [], personal: null };
  }
  return g.__kozyrAds;
}
function note(f: (l: Log) => void) {
  const l = log();
  f(l);
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(l)); } catch { /* проверке хватит памяти страницы */ }
}

let interstitial = false, rewarded = false;

export const adsSdk: AdsSdk = {
  init: async personal => note(l => { l.personal = personal; }),
  setPersonal: personal => note(l => { l.personal = personal; }),
  loadInterstitial: () => { interstitial = true; },
  interstitialReady: () => interstitial,
  showInterstitial(onShown) {
    if (!interstitial) return false;
    interstitial = false;
    note(l => { l.shown.push('interstitial'); });
    onShown();
    return true;
  },
  loadRewarded: onReady => { rewarded = true; onReady?.(); },
  rewardedReady: () => rewarded,
  async showRewarded() {
    if (!rewarded) return 'failed';
    rewarded = false;
    note(l => { l.shown.push('rewarded'); });
    return 'rewarded';
  },
};
