// из nardy: src/money/rustoreRules.ts @ 1d2bdff — оформления — рубашки.
// Ответы RuStore Pay → права и причины, и сама покупка: модуль оплаты ей передают параметром, поэтому
// всё здесь гоняют тесты под Bun без телефона. Коды и тексты ошибок SDK, их причины и сама покупка —
// из общего набора `@gornitsa/kit` (ADR студии 0022, с 2026-10-31); здесь — что они значат для «Козыря»:
// причины в словах игры (`Unavailable`), исход покупки (`BuyResult`) и права по списку покупок.
import { buy, causeReasonOf, reasonOf, rsCode, rsDetail, rsText } from '@gornitsa/kit/rustore-pay/rules';
import type { RsReason } from '@gornitsa/kit/rustore-pay/rules';
import type { PayNative, RsPurchase } from '@gornitsa/kit/rustore-pay';
import { isPaidBack } from '../render/backs';
import type { PaidBackId } from '../render/backs';
import type { BuyResult, Owned, Unavailable } from './types';

export { rsCode, rsDetail, rsText };

/**
 * Причина набора → почему покупки недоступны, словами игры. Старый RuStore — как нет RuStore; без номера
 * приложения или схемы — «подключаются». Нет сети (`RuStorePaymentNetworkException`) у игры своей
 * причины не имеет — «RuStore отказал или не ответил», как и неверная подпись ответа (её в наборе нет:
 * это защита RuStore от подмены ответа, а не недоделанная сборка).
 */
const WHY: Readonly<Record<RsReason, Unavailable>> = {
  'no-rustore': 'no-rustore',
  outdated: 'no-rustore',
  'not-signed-in': 'not-signed-in',
  'no-app-id': 'not-ready',
  'no-scheme': 'not-ready',
  offline: 'error',
};

/** Ошибка RuStore (отказ промиса обёртки) → почему покупки недоступны. */
export function unavailableOf(e: unknown): Unavailable {
  const r = reasonOf(e);
  return r ? WHY[r] : 'error';
}

/**
 * Отказ `getPurchaseAvailability` → почему покупки недоступны; `null` — текст незнакомый.
 * Любую ошибку по дороге — сеть, отказ сервера RuStore, номер приложения, нет RuStore — SDK
 * отдаёт не исключением, а ответом «недоступно», и обёртка для React Native передаёт из неё
 * только текст (`cause`). Поэтому причина узнаётся по тексту (`causeReasonOf` набора).
 */
export function causeOf(cause: string): Unavailable | null {
  const r = causeReasonOf(cause);
  return r ? WHY[r] : null;
}

/** Подписка даёт «Про», пока действует; PAUSED — не прошло списание, доступ приостановлен. */
const ACTIVE_SUB = new Set(['ACTIVE']);
/** Разовая покупка оплачена: одностадийная — CONFIRMED (двухстадийных у нас нет). */
const PAID_PRODUCT = new Set(['CONFIRMED']);

/** Что куплено, по списку покупок RuStore. */
export function ownedOf(list: readonly RsPurchase[], now: number): Owned {
  let noAds = false, proUntil = 0, backsAll = false;
  const backs = new Set<PaidBackId>();
  for (const p of list) {
    const product = p.productPurchase, sub = p.subscriptionPurchase;
    if (product && PAID_PRODUCT.has(product.status)) {
      const id = product.productId, back = id.slice('theme_'.length);
      if (id === 'no_ads') noAds = true;
      else if (id === 'themes_all') backsAll = true;
      else if (id.startsWith('theme_') && isPaidBack(back)) backs.add(back);
    }
    if (sub && (sub.productId === 'pro_month' || sub.productId === 'pro_year') && ACTIVE_SUB.has(sub.status)) {
      const until = Date.parse(sub.expirationDate);
      // дата не разобралась — считаем, что подписка действует ещё сутки: сверка при запуске продлит
      proUntil = Math.max(proUntil, Number.isFinite(until) ? until : now + 24 * 3600_000);
    }
  }
  return { noAds, proUntil, backs: [...backs], backsAll };
}

/** Что покупке нужно от Pay SDK — только оплата. */
export type PayPurchase = Pick<PayNative, 'purchase'>;

/**
 * Покупка: одностадийная оплата в тёмной шторке RuStore — и всё (`buy` набора). Отметки «товар выдан»
 * (`updateAcknowledgementState`) нет: она необязательна и на оплату не влияет (RuStore,
 * «Признак выдачи товара»), права игра берёт из списка покупок без неё, а в обёртке 11.1.0 её успех
 * роняет приложение — модуль отдаёт в JS объект `AcknowledgementState`, который React Native не
 * переводит, и исключение летит в главном потоке (тестовая покупка владельца в `v1.1.2`, 2026-10-28).
 * До 1.1.1 та же отметка шла с двумя аргументами вместо трёх и превращала прошедшую оплату в «Оплата
 * не прошла» (`v1.1.0`). Нет RuStore или входа — «недоступно» (игроку — «Открыть RuStore»), прочее — «не прошла».
 */
export async function purchaseVia(pay: PayPurchase, id: string): Promise<BuyResult> {
  const r = await buy(pay, id, 'DARK');
  if (r.ok) return { ok: true };
  const { code, detail } = r;
  if (r.cancelled) return { ok: false, why: 'cancelled' };
  if (code === 'RuStoreNotInstalledException' || code === 'RuStoreUserUnauthorizedException') return { ok: false, why: 'unavailable', code, detail };
  return { ok: false, why: 'failed', code: code ?? undefined, detail };
}
