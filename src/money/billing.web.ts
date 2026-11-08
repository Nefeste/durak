// из nardy: src/money/billing.web.ts @ 1d2bdff — без оформлений.
// Тестовый магазин для браузера: веб-сборка существует только для проверок (tools/e2e), настоящей
// оплаты в ней нет и быть не может. Покупка проходит сразу и запоминается в localStorage, чтобы
// прогон мог проверить витрину и восстановление после перезагрузки.
import { PRODUCT_IDS } from './types';
import type { Billing, Owned, ProductId } from './types';

export const STORE: 'rustore' | 'other' = 'rustore';

const KEY = 'durak.test-store';
const price = (id: ProductId): string => (id === 'no_ads' ? '249 ₽' : id === 'pro_month' ? '199 ₽' : '990 ₽');
const DAY = 24 * 3600_000;

function read(): Owned {
  try {
    const o = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as Partial<Owned> | null;
    return { noAds: o?.noAds === true, proUntil: typeof o?.proUntil === 'number' ? o.proUntil : 0 };
  } catch {
    return { noAds: false, proUntil: 0 };
  }
}

/** Что даёт покупка в тестовом магазине. */
function grant(o: Owned, id: ProductId, now: number): Owned {
  if (id === 'no_ads') return { ...o, noAds: true };
  return { ...o, proUntil: Math.max(o.proUntil, now) + (id === 'pro_year' ? 365 : 30) * DAY };
}

export const billing: Billing = {
  test: true,
  availability: async () => ({ ok: true }),
  products: async () => PRODUCT_IDS.map(id => ({ id, price: price(id) })),
  purchase: async id => {
    const next = grant(read(), id, Date.now());
    try { globalThis.localStorage?.setItem(KEY, JSON.stringify(next)); } catch { /* проверке хватит памяти страницы */ }
    return { ok: true };
  },
  owned: async () => read(),
};
