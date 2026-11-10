// из nardy: src/money/types.ts @ 1d2bdff — оформления «Козыря» — рубашки (src/render/backs.ts, docs/11-money.md).
// Общие типы денег (docs/11-money.md): товары, права, порты оплаты и рекламы. Кода платформ здесь нет:
// реализации — billing.ts / adsSdk.ts (телефон) и *.web.ts (браузер, только для проверок).

import { PAID_BACKS } from '../render/backs';
import type { PaidBackId } from '../render/backs';

/** Оформление (рубашка) навсегда (docs/09-game-design.md, «Рубашки»): `theme_<рубашка>`; `themes_all` — все платные,
 *  в том числе будущие. */
export type ThemeProductId = `theme_${PaidBackId}`;
/** Товары карточками в «Магазине»; рубашки — своим экраном. */
export type MainProductId = 'no_ads' | 'pro_month' | 'pro_year';
/** Идентификаторы товаров — навсегда, как `applicationId` (они же в консоли RuStore). */
export type ProductId = MainProductId | 'themes_all' | ThemeProductId;
export const MAIN_PRODUCTS: readonly MainProductId[] = ['no_ads', 'pro_month', 'pro_year'];
export const themeProduct = (id: PaidBackId): ThemeProductId => `theme_${id}`;
export const PRODUCT_IDS: readonly ProductId[] = [...MAIN_PRODUCTS, 'themes_all', ...PAID_BACKS.map(themeProduct)];

/**
 * «Про» продаётся, только когда есть то, что она даёт: полный разбор и подробная статистика (устав,
 * «Честность»). С этапа Д (0.5.0) они есть — «Про» на витрине.
 */
export const PRO_ON_SALE: boolean = true;
/** Товары на витрине сейчас. */
export const ON_SALE: readonly MainProductId[] = PRO_ON_SALE ? MAIN_PRODUCTS : ['no_ads'];

/** Товар для витрины: цена — строкой из магазина («249 ₽»); `null` — магазин цену не назвал. */
export interface Product { id: ProductId; price: string | null }

/** Что куплено, по словам магазина: «Без рекламы», до какого времени оплачена «Про» (0 — нет), рубашки. */
export interface Owned { noAds: boolean; proUntil: number; backs: PaidBackId[]; backsAll: boolean }

/** Почему покупки недоступны. */
export type Unavailable =
  | 'other-build'     // сборка не для RuStore
  | 'not-ready'       // сборка RuStore, но номер приложения в консоли ещё не задан
  | 'no-rustore'      // RuStore не установлен или не поддерживает платежи
  | 'not-signed-in'   // не выполнен вход в RuStore
  | 'error';          // RuStore отказал или не ответил

/** `detail` — что ответил RuStore, как есть (текст или код ошибки SDK): по нему видно, что чинить. */
export type Availability = { ok: true } | { ok: false; why: Unavailable; detail?: string };

export type BuyResult = { ok: true } | { ok: false; why: 'cancelled' | 'failed' | 'unavailable'; code?: string; detail?: string };

/** Порт оплаты: всё, что приложению нужно от магазина. */
export interface Billing {
  /** Тестовый магазин (браузер): витрина подписывает это, чтобы не путать с настоящим. */
  readonly test: boolean;
  availability(): Promise<Availability>;
  products(): Promise<Product[]>;
  purchase(id: ProductId): Promise<BuyResult>;
  /** Сверка прав с магазином; `null` — сверить не удалось (тогда живём по кэшу). */
  owned(): Promise<Owned | null>;
}

/** Порт рекламной сети: загрузить заранее, показать готовое. Ждать загрузки игрок не должен никогда. */
export interface AdsSdk {
  /** Запуск SDK; `personal` — согласие на персональную рекламу (настройка «Персональная реклама»). */
  init(personal: boolean): Promise<void>;
  setPersonal(personal: boolean): void;
  /** Начать загрузку полноэкранной, если её ещё нет и она не грузится. */
  loadInterstitial(): void;
  interstitialReady(): boolean;
  /** Показать загруженную; `false` — показывать нечего. `onShown` — реклама действительно показана. */
  showInterstitial(onShown: () => void): boolean;
  /** Начать загрузку рекламы за вознаграждение; `onReady` — когда загрузится. */
  loadRewarded(onReady?: () => void): void;
  rewardedReady(): boolean;
  /** Показать рекламу за вознаграждение: `rewarded` — только по событию SDK «награда получена». */
  showRewarded(): Promise<'rewarded' | 'closed' | 'failed'>;
}
