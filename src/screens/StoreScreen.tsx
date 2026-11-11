// «Магазин» — по образцу StoreScreen «Нард» (nardy @ 1d2bdff), в портрете; оформления (рубашки) — своим экраном
// (docs/09-game-design.md, «Реклама и покупки»): товары на витрине — что даёт, цена из магазина,
// кнопка; внизу — «Восстановить покупки». Покупки недоступны — строка почему и, где поможет,
// «Открыть RuStore»; товары всё равно видны, чтобы было понятно, что есть. «Про» на витрине
// появляется вместе с разбором (PRO_ON_SALE, src/money/types.ts).
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useInsets } from '../ui/insets';
import { Button } from '../ui/Button';
import { Glass } from '../ui/Glass';
import { Header } from '../ui/Header';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';
import { T } from '../i18n';
import { ON_SALE, billing, buy, getRights, isPro, onRights, openRuStore, syncRights } from '../money';
import type { Availability, MainProductId, Product, Unavailable } from '../money';

/** Где кнопка «Открыть RuStore» помогает. */
const OPEN_RUSTORE: Unavailable[] = ['other-build', 'no-rustore', 'not-signed-in'];

/** Итог покупки или сверки и, если RuStore отказал, его ответ как есть. */
interface Msg { text: string; detail?: string }

export function StoreScreen({ onBack, onBacks }: { onBack: () => void; onBacks: () => void }) {
  const insets = useInsets();
  // `undefined` — ещё спрашиваем магазин; `null` — покупки доступны; иначе — почему нет
  const [why, setWhy] = useState<Unavailable | null | undefined>(undefined);
  const [detail, setDetail] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState<MainProductId | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => onRights(() => setTick(t => t + 1)), []);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const a = await billing.availability().catch((): Availability => ({ ok: false, why: 'error' }));
      if (!alive) return;
      setWhy(a.ok ? null : a.why);
      if (!a.ok) { setDetail(a.detail ?? null); return; }
      const p = await billing.products().catch(() => []);
      if (alive) setProducts(p);
      void syncRights();
    })();
    return () => { alive = false; };
  }, []);

  const pro = isPro(), rights = getRights();
  const priceOf = (id: MainProductId) => products.find(p => p.id === id)?.price ?? null;
  const purchase = async (id: MainProductId) => {
    setBusy(id);
    setMsg(null);
    const r = await buy(id);
    setBusy(null);
    if (r.ok) setMsg({ text: id === 'no_ads' ? T.money.thanksNoAds : T.money.thanksPro(getRights().proUntil) });
    else if (r.why === 'failed') setMsg({ text: T.money.failed, detail: r.detail });
    else if (r.why === 'unavailable') setMsg({ text: T.money.why[why ?? 'error'], detail: r.detail });
    // отменил сам — тихо остаёмся в магазине
  };
  const restore = () => { void syncRights().then(r => setMsg(r.ok ? { text: T.money.restored } : { text: T.money.why[r.why], detail: r.detail })); };

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.pad, { paddingTop: insets.top + SPACE.l, paddingBottom: insets.bottom + SPACE.xl }]} testID="store">
      <Header title={T.money.title} back={T.money.back} onBack={onBack} backTestID="store-back" />
      {billing.test ? <Text style={styles.note} testID="store-test" maxFontSizeMultiplier={1.3}>{T.money.test}</Text> : null}
      {why ? (
        <View style={styles.banner} testID="store-why">
          <Text style={styles.text} maxFontSizeMultiplier={1.3}>{T.money.why[why]}</Text>
          {detail ? <Text style={styles.note} testID="store-detail" selectable maxFontSizeMultiplier={1.3}>{T.money.detail(detail)}</Text> : null}
          {OPEN_RUSTORE.includes(why) ? <Button testID="store-open-rustore" kind="ghost" label={T.money.openRuStore} onPress={() => openRuStore(why)} /> : null}
        </View>
      ) : null}
      {ON_SALE.map(id => {
        const P = T.money.products[id];
        const owned = id === 'no_ads' ? rights.noAds || pro : pro;
        return (
          <Glass key={id} style={styles.card} testID={`product-${id}`}>
            <Text style={styles.name} maxFontSizeMultiplier={1.3}>{P.title}</Text>
            <Text style={styles.note} maxFontSizeMultiplier={1.3}>{P.text}</Text>
            {owned ? (
              <Text style={styles.good} testID={`owned-${id}`} maxFontSizeMultiplier={1.3}>
                {id === 'no_ads' && !pro ? T.money.owned : T.money.proUntil(rights.proUntil)}
              </Text>
            ) : (
              <Button testID={`buy-${id}`} label={T.money.buy(priceOf(id))} disabled={why !== null || busy !== null} onPress={() => { void purchase(id); }} />
            )}
          </Glass>
        );
      })}
      {/* рубашки — своим экраном: там плитка, покупка по одной и всех сразу, примерка */}
      <Glass style={styles.card} testID="product-backs">
        <Text style={styles.name} maxFontSizeMultiplier={1.3}>{T.money.backs.title}</Text>
        <Text style={styles.note} maxFontSizeMultiplier={1.3}>{T.money.backs.text}</Text>
        <Button testID="store-backs" kind="ghost" label={T.money.backs.open} onPress={onBacks} />
      </Glass>
      <Text style={styles.note} maxFontSizeMultiplier={1.3}>{T.money.free}</Text>
      {msg ? <Text style={styles.text} testID="store-msg" maxFontSizeMultiplier={1.3}>{msg.text}</Text> : null}
      {msg?.detail ? <Text style={styles.note} testID="store-msg-detail" selectable maxFontSizeMultiplier={1.3}>{T.money.detail(msg.detail)}</Text> : null}
      <Button testID="store-restore" kind="ghost" label={T.money.restore} onPress={restore} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { paddingHorizontal: SPACE.l, gap: SPACE.l },
  banner: { backgroundColor: C.sheet, borderRadius: RADIUS.panel, padding: SPACE.l, gap: SPACE.m, borderWidth: 1, borderColor: C.glassLine },
  card: { padding: SPACE.l, gap: SPACE.m,  },
  name: { color: C.accent, fontSize: TYPE.section, fontWeight: '800' },
  text: { color: C.text, fontSize: TYPE.body, lineHeight: 20 },
  note: { color: C.dim, fontSize: TYPE.caption, lineHeight: 18 },
  good: { color: C.ok, fontSize: TYPE.body, fontWeight: '700' },
});
