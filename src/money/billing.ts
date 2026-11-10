// из nardy: src/money/billing.ts @ 1d2bdff — оформления — рубашки.
// Оплата на телефоне — RuStore Pay (docs/11-money.md). Сборка `other` покупок не знает вовсе. Сборка
// RuStore без номера приложения в консоли (`EXPO_PUBLIC_RUSTORE_APP_ID`) — «покупки подключаются»: без
// него SDK оплаты не работает, а спрашивать его зря — значит показывать игроку ошибку RuStore.
import { pay } from './rustore';
import { causeOf, ownedOf, purchaseVia, rsDetail, rsText, unavailableOf } from './rustoreRules';
import { PRODUCT_IDS } from './types';
import type { Billing, BuyResult, Product, ProductId } from './types';

/** Для какого магазина сборка: `rustore` (по умолчанию) или `other`. */
export const STORE: 'rustore' | 'other' = process.env.EXPO_PUBLIC_STORE === 'other' ? 'other' : 'rustore';
const APP_ID = (process.env.EXPO_PUBLIC_RUSTORE_APP_ID ?? '').trim();

const isProduct = (id: string): id is ProductId => (PRODUCT_IDS as readonly string[]).includes(id);

export const billing: Billing = {
  test: false,
  async availability() {
    if (STORE === 'other') return { ok: false, why: 'other-build' };
    if (!pay || !APP_ID) return { ok: false, why: 'not-ready' };
    try {
      const a = await pay.getPurchaseAvailability();
      if (a.availability) return { ok: true };
      // любая ошибка SDK по дороге приходит сюда же, только текстом (rustoreRules.ts, causeOf);
      // он и идёт игроку строкой «Ответ RuStore»
      const detail = rsText(a.cause);
      const known = detail ? causeOf(detail) : null;
      if (known) return { ok: false, why: known, detail };
      // нет входа в RuStore — самая частая причина, её видно отдельным методом
      const signed = await pay.getUserAuthorizationStatus().catch(() => true);
      return { ok: false, why: signed ? 'error' : 'not-signed-in', detail };
    } catch (e) {
      return { ok: false, why: unavailableOf(e), detail: rsDetail(e) };
    }
  },
  async products(): Promise<Product[]> {
    if (!pay || !APP_ID || STORE === 'other') return [];
    const list = await pay.getProducts([...PRODUCT_IDS]);
    return list.filter(p => isProduct(p.productId)).map(p => ({ id: p.productId as ProductId, price: p.amountLabel || null }));
  },
  async purchase(id): Promise<BuyResult> {
    if (!pay || !APP_ID || STORE === 'other') return { ok: false, why: 'unavailable' };
    // только оплата: отметка «товар выдан» в обёртке 11.1.0 роняет приложение (purchaseVia)
    return purchaseVia(pay, id);
  },
  async owned() {
    if (!pay || !APP_ID || STORE === 'other') return null;
    try {
      return ownedOf(await pay.getPurchases(null, null, null), Date.now());
    } catch {
      return null;
    }
  },
};
