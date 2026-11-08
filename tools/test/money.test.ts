// из nardy: tools/test/money.test.ts @ 1d2bdff — без оформлений, схема своя.
// Реклама и права (docs/11-money.md, docs/09-game-design.md «Реклама и покупки»): каждое правило частоты
// полноэкранной рекламы и их сочетания; «Про» с тремя сутками без сети; что открыто в разборе; ответы
// RuStore Pay; что «Про» не продаётся, пока нет разбора.
import { expect, test } from 'bun:test';
import { AD_RULES, EMPTY_COUNTERS, afterGame, afterShown, canShowInterstitial, dayOf, normalizeCounters } from '../../src/money/ads';
import type { AdCounters } from '../../src/money/ads';
import { GRACE_MS, NO_RIGHTS, adsOff, normalizeRights, proActive, reviewAccess, withOwned } from '../../src/money/rights';

const MIN = 60_000, HOUR = 3600_000, DAY = 24 * HOUR;
const NOON = new Date(2026, 8, 28, 12, 0, 0).getTime();

/** Счётчики, при которых реклама разрешена: 6 партий, последняя 5 минут, показов не было. */
function ready(extra: Partial<AdCounters> = {}): AdCounters {
  let c = EMPTY_COUNTERS;
  for (let i = 0; i < 6; i++) c = afterGame(c, 5 * MIN);
  return { ...c, ...extra };
}

test('всё выполнено — можно', () => {
  expect(canShowInterstitial(ready(), NOON, false)).toBe(true);
});

test('первые партии — без рекламы', () => {
  let c = EMPTY_COUNTERS;
  for (let i = 1; i <= AD_RULES.firstGames; i++) {
    expect(canShowInterstitial(c, NOON, false)).toBe(false);
    c = afterGame(c, 10 * MIN);
  }
  expect(c.games).toBe(AD_RULES.firstGames);
  expect(canShowInterstitial(c, NOON, false)).toBe(true);
});

test('не чаще, чем через партию', () => {
  let c = afterShown(ready(), NOON, 'interstitial');
  const later = NOON + HOUR;                     // время не мешает
  expect(canShowInterstitial(c, later, false)).toBe(false);
  c = afterGame(c, 5 * MIN);
  expect(canShowInterstitial(c, later, false)).toBe(false);
  c = afterGame(c, 5 * MIN);
  expect(canShowInterstitial(c, later, false)).toBe(true);
});

test('4 минуты с прошлого показа любой рекламы, в том числе за вознаграждение', () => {
  const c = afterShown(ready(), NOON, 'rewarded');
  expect(c.sinceInterstitial).toBe(6);           // за вознаграждение не обнуляет счёт партий
  expect(canShowInterstitial(c, NOON + AD_RULES.minGapMs - 1, false)).toBe(false);
  expect(canShowInterstitial(c, NOON + AD_RULES.minGapMs, false)).toBe(true);
});

test('после короткой партии (быстрой сдачи) — нет', () => {
  const c = afterGame(ready(), AD_RULES.minGameMs - 1);
  expect(canShowInterstitial(c, NOON, false)).toBe(false);
  expect(canShowInterstitial(afterGame(ready(), AD_RULES.minGameMs), NOON, false)).toBe(true);
});

test('дневной предел — по местному календарю, новый день начинает счёт заново', () => {
  let c = ready();
  let now = NOON - 11 * HOUR;                    // 01:00
  for (let i = 0; i < AD_RULES.perDay; i++) {
    expect(canShowInterstitial(c, now, false)).toBe(true);
    c = afterShown(c, now, 'interstitial');
    c = afterGame(afterGame(c, 5 * MIN), 5 * MIN);
    now += 5 * MIN;
  }
  expect(c.today).toBe(AD_RULES.perDay);
  expect(canShowInterstitial(c, now, false)).toBe(false);
  const tomorrow = new Date(2026, 8, 29, 0, 1).getTime();
  expect(dayOf(tomorrow)).not.toBe(c.day);
  expect(canShowInterstitial(c, tomorrow, false)).toBe(true);
  expect(afterShown(c, tomorrow, 'interstitial').today).toBe(1);
});

test('«Без рекламы» и «Про» — никогда', () => {
  expect(canShowInterstitial(ready(), NOON, true)).toBe(false);
  const now = NOON;
  expect(adsOff({ ...NO_RIGHTS, noAds: true }, now)).toBe(true);
  expect(adsOff({ ...NO_RIGHTS, proUntil: now + DAY }, now)).toBe(true);
  expect(adsOff(NO_RIGHTS, now)).toBe(false);
});

test('сочетания: не хватает одного правила — нельзя', () => {
  const base = ready();
  const broken: [string, AdCounters, number][] = [
    ['мало партий', { ...base, games: 3 }, NOON],
    ['только что была', { ...base, sinceInterstitial: 1 }, NOON],
    ['недавний показ', { ...base, lastShown: NOON - MIN }, NOON],
    ['короткая партия', { ...base, lastGameMs: 30_000 }, NOON],
    ['дневной предел', { ...base, day: dayOf(NOON), today: AD_RULES.perDay }, NOON],
  ];
  for (const [, c, now] of broken) expect(canShowInterstitial(c, now, false)).toBe(false);
  // вчерашний предел сегодня не мешает
  expect(canShowInterstitial({ ...base, day: dayOf(NOON - DAY), today: AD_RULES.perDay }, NOON, false)).toBe(true);
});

test('счётчики из хранилища: битое не проходит', () => {
  expect(normalizeCounters(null)).toEqual(EMPTY_COUNTERS);
  expect(normalizeCounters({ games: -1, today: 'x', shown: { interstitial: 3 } })).toEqual({ ...EMPTY_COUNTERS, shown: { interstitial: 3, rewarded: 0 } });
});

test('«Про»: до конца срока и ещё трое суток без сверки', () => {
  const until = NOON;
  const r = { ...NO_RIGHTS, proUntil: until };
  expect(proActive(r, until - 1)).toBe(true);
  expect(proActive(r, until + GRACE_MS - 1)).toBe(true);
  expect(proActive(r, until + GRACE_MS)).toBe(false);
  expect(proActive(NO_RIGHTS, NOON)).toBe(false);
});

test('сверка с магазином — правда: кончилась подписка — выключено сразу, без трёх суток', () => {
  expect(withOwned({ noAds: true, proUntil: NOON + DAY }, NOON)).toEqual({ noAds: true, proUntil: NOON + DAY, checkedAt: NOON });
  const expired = withOwned({ noAds: false, proUntil: NOON - HOUR }, NOON);
  expect(expired.proUntil).toBe(0);
  expect(proActive(expired, NOON)).toBe(false);
  expect(normalizeRights({ noAds: 'да', proUntil: -5 })).toEqual(NO_RIGHTS);
});

test('разбор: «Про» или реклама — всё; без них — главная ошибка последней партии', () => {
  expect(reviewAccess(true, false, false)).toBe('full');
  expect(reviewAccess(false, true, false)).toBe('full');
  expect(reviewAccess(false, false, true)).toBe('worst');
  expect(reviewAccess(false, false, false)).toBe('locked');
});

// ── Е2: ответы RuStore Pay, просьба об оценке, плагин сборки ──

import { causeOf, ownedOf, purchaseVia, rsDetail, rsText, unavailableOf } from '../../src/money/rustoreRules';
import type { PayPurchase } from '../../src/money/rustoreRules';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RATE_RULES, shouldAskRating } from '../../src/money/review';

test('RuStore Pay: что куплено — по статусам покупок', () => {
  const now = NOON;
  const sub = (productId: string, status: string, expirationDate: string) =>
    ({ subscriptionPurchase: { purchaseId: 'p', productId, status, expirationDate, gracePeriodEnabled: false, sandbox: true } });
  const product = (productId: string, status: string) =>
    ({ productPurchase: { purchaseId: 'q', productId, status, productType: 'NON_CONSUMABLE_PRODUCT' as const, sandbox: true } });
  expect(ownedOf([], now)).toEqual({ noAds: false, proUntil: 0 });
  expect(ownedOf([product('no_ads', 'CONFIRMED')], now).noAds).toBe(true);
  expect(ownedOf([product('no_ads', 'REFUNDED')], now).noAds).toBe(false);
  const until = '2026-10-28T12:00:00+03:00';
  expect(ownedOf([sub('pro_month', 'ACTIVE', until)], now).proUntil).toBe(Date.parse(until));
  expect(ownedOf([sub('pro_year', 'PAUSED', until)], now).proUntil).toBe(0);
  expect(ownedOf([sub('pro_month', 'CLOSED', until)], now).proUntil).toBe(0);
  // две подписки — берётся дальняя дата; непонятная дата — ещё сутки до следующей сверки
  expect(ownedOf([sub('pro_month', 'ACTIVE', until), sub('pro_year', 'ACTIVE', '2027-09-28T12:00:00Z')], now).proUntil).toBe(Date.parse('2027-09-28T12:00:00Z'));
  expect(ownedOf([sub('pro_month', 'ACTIVE', 'когда-нибудь')], now).proUntil).toBe(now + DAY);
  // чужой товар ничего не даёт
  expect(ownedOf([product('coins', 'CONFIRMED')], now)).toEqual({ noAds: false, proUntil: 0 });
});

test('RuStore Pay: ошибка → почему покупки недоступны', () => {
  expect(unavailableOf({ code: 'RuStoreNotInstalledException', message: '' })).toBe('no-rustore');
  expect(unavailableOf({ code: 'RuStoreOutdatedException', message: '' })).toBe('no-rustore');
  expect(unavailableOf({ code: 'RuStoreUserUnauthorizedException', message: '' })).toBe('not-signed-in');
  expect(unavailableOf({ code: 'RuStorePayInvalidConsoleAppId', message: '' })).toBe('not-ready');
  expect(unavailableOf({ code: 'ApplicationSchemeWasNotProvided', message: '' })).toBe('not-ready');
  // неверная подпись ответа — защита RuStore от подмены, а не недоделанная сборка
  expect(unavailableOf({ code: 'RuStorePaySignatureException', message: '' })).toBe('error');
  // нет сети — у игры своей причины нет (у набора есть: offline)
  expect(unavailableOf({ code: 'RuStorePaymentNetworkException', message: 'Application not found' })).toBe('error');
  expect(unavailableOf(new Error('сеть'))).toBe('error');
  expect(unavailableOf(null)).toBe('error');
});

// 1.0.0-rc1 на телефоне: «недоступно» без причины. Обёртка для React Native кладёт любую ошибку SDK
// в ответ «недоступно» и передаёт только её текст; тексты — из Pay SDK 11.1.0 и core 10.5.0.
test('RuStore Pay: «недоступно» с текстом SDK → почему покупки недоступны', () => {
  expect(causeOf('RuStore not installed')).toBe('no-rustore');
  expect(causeOf('RuStore outdated')).toBe('no-rustore');
  expect(causeOf('RuStore User Not Authorized')).toBe('not-signed-in');
  expect(causeOf('Console application id is not provided. Set "console_app_id_value" into resources')).toBe('not-ready');
  expect(causeOf('Application scheme was not provided. Set app_scheme_value into AndroidManifest.')).toBe('not-ready');
  // остальное — пустой токен, отказ сервера, блокировка, подпись ответа — решает проверка входа
  // в RuStore, а текст идёт игроку строкой «Ответ RuStore» как есть
  for (const t of ['Empty token returned by RuStore app', 'RuStore application banned', 'RuStore user banned', 'Invalid response signature', 'Service Unavailable', '']) {
    expect(causeOf(t)).toBe(null);
  }
});

test('RuStore Pay: строка «Ответ RuStore» — код и текст как пришли, в одну строку, коротко', () => {
  expect(rsText('  Application\n  not found ')).toBe('Application not found');
  expect(rsText('')).toBe(undefined);
  expect(rsText(null)).toBe(undefined);
  expect(rsText('x'.repeat(500))).toHaveLength(200);
  expect(rsDetail({ code: 'RuStorePaymentNetworkException', message: 'Application not found' })).toBe('RuStorePaymentNetworkException: Application not found');
  expect(rsDetail({ code: 'RuStoreNotInstalledException', message: '' })).toBe('RuStoreNotInstalledException');
  expect(rsDetail(new Error('сеть'))).toBe('сеть');
  expect(rsDetail(null)).toBe(undefined);
});

// 1.1.0 в тестовом режиме RuStore (2026-10-28): оплата прошла, а игра писала «Оплата не прошла. Деньги не
// списаны» — отметка «товар выдан» шла с двумя аргументами вместо трёх, и модуль бросал исключение сразу.
// 1.1.2 (тот же день): с тремя аргументами отметка прошла, а обёртка 11.1.0 отдала её ответ в JS объектом
// `AcknowledgementState` — React Native его не переводит, и игра вылетела после оплаты. Отметка
// необязательна (RuStore, «Признак выдачи товара»), поэтому её нет совсем.
test('RuStore Pay: оплата прошла — «Оплата прошла», и отметки «товар выдан» нет', async () => {
  const done = { purchaseId: 'p1', productId: 'no_ads', invoiceId: 'i1', productType: 'NON_CONSUMABLE_PRODUCT' as const, sandbox: true };
  const calls: unknown[][] = [];
  let acks = 0;
  // у настоящего модуля метод отметки есть — покупка не должна его трогать
  const native = {
    purchase: async (...a: unknown[]) => { calls.push(a); return done; },
    updateAcknowledgementState: () => { acks++; throw new Error('java.lang.RuntimeException: Cannot convert argument of type class ru.rustore.sdk.pay.model.AcknowledgementState'); },
  };
  expect(await purchaseVia(native, 'no_ads')).toEqual({ ok: true });
  expect(calls).toEqual([['no_ads', null, null, null, null, null, 'ONE_STEP', 'DARK', {}]]);
  expect(acks).toBe(0);
});

test('RuStore Pay: отмена, нет входа, отказ оплаты — как раньше', async () => {
  const refuse = (code: string): PayPurchase => ({ purchase: () => Promise.reject({ code, message: 'm' }) });
  expect(await purchaseVia(refuse('ProductPurchaseCancelled'), 'pro_month')).toEqual({ ok: false, why: 'cancelled' });
  expect(await purchaseVia(refuse('RuStoreUserUnauthorizedException'), 'pro_month'))
    .toEqual({ ok: false, why: 'unavailable', code: 'RuStoreUserUnauthorizedException', detail: 'RuStoreUserUnauthorizedException: m' });
  expect(await purchaseVia(refuse('ProductPurchaseException'), 'pro_month'))
    .toEqual({ ok: false, why: 'failed', code: 'ProductPurchaseException', detail: 'ProductPurchaseException: m' });
  // старый RuStore и нет сети при оплате — «не прошла», как до набора
  expect(await purchaseVia(refuse('RuStoreOutdatedException'), 'pro_month'))
    .toEqual({ ok: false, why: 'failed', code: 'RuStoreOutdatedException', detail: 'RuStoreOutdatedException: m' });
  expect(await purchaseVia(refuse('RuStorePaymentNetworkException'), 'pro_month'))
    .toEqual({ ok: false, why: 'failed', code: 'RuStorePaymentNetworkException', detail: 'RuStorePaymentNetworkException: m' });
  expect(await purchaseVia(refuse('RuStoreNotInstalledException'), 'pro_month'))
    .toEqual({ ok: false, why: 'unavailable', code: 'RuStoreNotInstalledException', detail: 'RuStoreNotInstalledException: m' });
  // исключение сразу, а не отказ промиса (так новая архитектура React Native встречает неверное число аргументов)
  expect(await purchaseVia({ purchase: () => { throw new Error('TurboModule method "purchase" called with 8 arguments'); } }, 'no_ads'))
    .toEqual({ ok: false, why: 'failed', code: undefined, detail: 'TurboModule method "purchase" called with 8 arguments' });
});

test('RuStore Pay: отметку «товар выдан» не зовёт никто — в обёртке 11.1.0 её успех роняет приложение', () => {
  // javap по обёртке: updateAcknowledgementState$lambda$43 делает promise.resolve(AcknowledgementState) —
  // React Native не переводит этот объект и бросает RuntimeException в главном потоке (`v1.1.2`, 2026-10-28)
  const src = join(import.meta.dir, '../../src');
  const callers = (readdirSync(src, { recursive: true }) as string[])
    .filter(f => /\.tsx?$/.test(f) && readFileSync(join(src, f), 'utf8').includes('updateAcknowledgementState('));
  expect(callers).toEqual([]);
});

test('оценка в RuStore: после победы над ботами, с пятой партии, раз в 60 дней', () => {
  const never = { askedAt: 0 };
  expect(shouldAskRating(never, NOON, { wonVsBot: true, games: RATE_RULES.minGames - 1 })).toBe(false);
  expect(shouldAskRating(never, NOON, { wonVsBot: true, games: RATE_RULES.minGames })).toBe(true);
  expect(shouldAskRating(never, NOON, { wonVsBot: false, games: 50 })).toBe(false);
  const asked = { askedAt: NOON };
  expect(shouldAskRating(asked, NOON + RATE_RULES.gapMs - 1, { wonVsBot: true, games: 50 })).toBe(false);
  expect(shouldAskRating(asked, NOON + RATE_RULES.gapMs, { wonVsBot: true, games: 50 })).toBe(true);
});

// RuStore Pay — из общего набора студии `@gornitsa/kit` (ADR студии 0022): вставки плагина в шаблоны Expo,
// число аргументов методов обёртки 11.1.0 и покупку без отметки «товар выдан» проверяют тесты набора.
// Здесь — настройки «Козыря»: схема возврата из банка вечная (она в манифесте выпущенных сборок), сборка
// `other` несёт только maven RuStore — из него модуль оценки.
const PLUGIN = '@gornitsa/kit/rustore-pay/plugin';
type Plugin = ((c: object, o: object) => { mods?: { android?: Record<string, unknown> } }) & {
  plan: (env: Record<string, string | undefined>, o: object) => { appId: string; mods: string[] };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withRuStorePay = require(PLUGIN) as Plugin;
const plugins = (JSON.parse(readFileSync(join(import.meta.dir, '../../app.json'), 'utf8')) as { expo: { plugins: (string | [string, object])[] } }).expo.plugins;
const payOptions = (plugins.find(p => Array.isArray(p) && p[0] === PLUGIN) as [string, object] | undefined)?.[1];

test('RuStore Pay в app.json — плагин набора, схема `gornitsadurakpay`, сборке `other` — maven RuStore', () => {
  expect(payOptions).toEqual({ scheme: 'gornitsadurakpay', otherStore: 'maven' });
  // своей копии плагина больше нет
  expect(plugins).not.toContain('./plugins/with-rustore');
  expect(withRuStorePay.plan({}, payOptions!).mods).toHaveLength(5);
});

test('сборка `other` (EXPO_PUBLIC_STORE=other) — без RuStore Pay: только репозиторий в проекте', () => {
  // спецификация денег, критерий 5: сборка для Releases, AppGallery, GetApps не несёт SDK оплаты
  const mods = (store: string | undefined) => {
    const was = process.env.EXPO_PUBLIC_STORE;
    if (store === undefined) delete process.env.EXPO_PUBLIC_STORE; else process.env.EXPO_PUBLIC_STORE = store;
    try {
      return Object.keys(withRuStorePay({ name: 'durak', slug: 'durak' }, payOptions!).mods?.android ?? {}).sort();
    } finally {
      if (was === undefined) delete process.env.EXPO_PUBLIC_STORE; else process.env.EXPO_PUBLIC_STORE = was;
    }
  };
  expect(mods('other')).toEqual(['projectBuildGradle']);
  expect(mods('rustore')).toEqual(['appBuildGradle', 'mainActivity', 'mainApplication', 'manifest', 'projectBuildGradle']);
  expect(mods(undefined)).toEqual(mods('rustore'));
  // без номера приложения SDK всё равно встаёт (с номером 0) — сборка проверяет, что он собирается
  expect(withRuStorePay.plan({ EXPO_PUBLIC_RUSTORE_APP_ID: '' }, payOptions!).mods.sort()).toEqual(mods('rustore'));
  expect(withRuStorePay.plan({ EXPO_PUBLIC_STORE: 'other' }, payOptions!).mods).toEqual(['projectBuildGradle']);
});

import { ON_SALE, PRO_ON_SALE } from '../../src/money/types';

test('«Про» не продаётся, пока нет разбора и статистики (устав, «Честность»): на витрине — одна «Без рекламы»', () => {
  // этап Д включает PRO_ON_SALE одной строкой — вместе с разбором; до этого продавать нечего
  expect(PRO_ON_SALE).toBe(false);
  expect(ON_SALE).toEqual(['no_ads']);
});

test('платное не открывает силу: подсказка, вышедшие карты и отмена не смотрят на права', () => {
  // устав, «Деньги»: деньги не покупают преимущество; права читают только экраны денег и разбора
  const src = join(import.meta.dir, '../../src');
  const readers = (readdirSync(src, { recursive: true }) as string[])
    .filter(f => /\.tsx?$/.test(f) && !f.startsWith('money') && /\b(isPro|isAdsOff|getRights|reviewAccess)\(/.test(readFileSync(join(src, f), 'utf8')));
  expect(readers.sort()).toEqual(['screens/StoreScreen.tsx']);
});
