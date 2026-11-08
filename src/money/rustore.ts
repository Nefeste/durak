// из nardy: src/money/rustore.ts @ 1d2bdff
// Нативные модули RuStore. Оплата — из общего набора студии `@gornitsa/kit` (ADR студии 0022):
// типы обёртки RuStore Pay для React Native 11.1.0 и сам модуль; Android-часть обёртки приходит из
// maven RuStore и регистрируется плагином набора `@gornitsa/kit/rustore-pay/plugin` (app.json).
// Оценка — свой модуль modules/rustore-review.
import { requireOptionalNativeModule } from 'expo';

export { pay } from '@gornitsa/kit/rustore-pay';
export type {
  PayNative, RsErrorCode, RsProduct, RsProductPurchase, RsProductType, RsPurchase, RsPurchaseResult, RsSubscriptionPurchase,
} from '@gornitsa/kit/rustore-pay';

/** Оценка в RuStore (modules/rustore-review): запросить и сразу показать форму. */
interface ReviewNative { ask(): Promise<boolean> }
export const review: ReviewNative | null = requireOptionalNativeModule<ReviewNative>('RuStoreReview');
