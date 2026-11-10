// «Рубашки» (docs/09-game-design.md, «Рубашки»; docs/13-art.md §11): наверху — просматриваемая рубашка на сукне, как
// за столом (веер соперника, карта крупно, колода с козырем); ниже — десять рубашек плиткой 5 × 2 на одном холсте
// Skia; под ней — название, состояние одной строкой и кнопки. Бесплатная или купленная выбирается касанием сразу;
// у платной — «Купить» и, если правила разрешают, «Примерить за рекламу» (на одну партию, только этой кнопкой).
// Деньги — только через src/money.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Canvas, Circle, Group, LinearGradient, Path, Picture, RoundedRect, Skia, useFont, vec } from '@shopify/react-native-skia';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import { useInsets } from '../ui/insets';
import { Button } from '../ui/Button';
import { Glass } from '../ui/Glass';
import { Header } from '../ui/Header';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';
import { T } from '../i18n';
import {
  billing, buy, getRights, getTryOn, onRights, onTryOn, ownsBack, prepareRewarded, syncRights, themeProduct, tryOnOffered,
  useBack, watchToTryOn,
} from '../money';
import type { Availability, Product, ProductId, Unavailable } from '../money';
import { setSettings, useSettings } from '../state/store';
import { makeBack } from '../render/backArt';
import { ALL_BACKS, PAID_BACKS, isPaidBack } from '../render/backs';
import type { BackId } from '../render/backs';
import { makeFaces } from '../render/faces';

const COLS = 5;
/** Туз червей — открытый козырь под колодой на картинке. */
const TRUMP = 3 * 9 + 8;

/** Плитка и картинка сверху по ширине экрана. Чистая функция. */
export function backsLayout(width: number): { tile: number; cw: number; ch: number; rows: number; gridH: number; stripH: number; big: number } {
  const tile = (width - SPACE.s * (COLS - 1)) / COLS;
  const cw = Math.floor(tile - SPACE.s), ch = Math.round((cw * 88) / 63);
  const rows = Math.ceil(ALL_BACKS.length / COLS);
  const big = Math.round(cw * 1.5);
  return { tile, cw, ch, rows, gridH: rows * (ch + SPACE.s) + (rows - 1) * SPACE.s, stripH: Math.round((big * 88) / 63) + SPACE.xl, big };
}

/** Замочек на платной некупленной рубашке: кружок листа с дужкой. */
function lock(x: number, y: number) {
  const p = Skia.Path.Make();
  p.addRRect(Skia.RRectXY(Skia.XYWHRect(x - 4, y - 1, 8, 6), 1.5, 1.5));
  const bow = Skia.Path.Make();
  bow.addArc(Skia.XYWHRect(x - 2.5, y - 5, 5, 6), 180, 180);
  return { body: p, bow };
}

export function BacksScreen({ onBack }: { onBack: () => void }) {
  const insets = useInsets();
  const { width: winW } = useWindowDimensions();
  const settings = useSettings();
  const chosen = useBack();
  const [look, setLook] = useState<BackId>(chosen);
  const [why, setWhy] = useState<Unavailable | null | undefined>(undefined);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; detail?: string } | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    const again = () => setTick(t => t + 1);
    const a = onRights(again), b = onTryOn(again);
    return () => { a(); b(); };
  }, []);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const a = await billing.availability().catch((): Availability => ({ ok: false, why: 'error' }));
      if (!alive) return;
      setWhy(a.ok ? null : a.why);
      if (!a.ok) return;
      const p = await billing.products().catch(() => []);
      if (alive) setProducts(p);
      void syncRights();
    })();
    // реклама для примерки грузится заранее: ждать её игрок не будет — нет рекламы, нет и кнопки
    prepareRewarded(() => { if (alive) setTick(t => t + 1); });
    return () => { alive = false; };
  }, []);

  const width = Math.min(winW, 520) - SPACE.l * 2;
  const L = useMemo(() => backsLayout(width), [width]);
  const font = useFont(Onest_700Bold, Math.round(L.big * 0.23));
  const tiles = useMemo(() => ALL_BACKS.map(id => makeBack(L.cw, L.ch, id)), [L.cw, L.ch]);
  const big = useMemo(() => (font ? makeFaces(L.big, Math.round((L.big * 88) / 63), font, settings.fourColor, look) : null), [L.big, font, settings.fourColor, look]);
  const at = (i: number) => ({ x: (i % COLS) * (L.tile + SPACE.s) + L.tile / 2, y: L.stripH + SPACE.l + Math.floor(i / COLS) * (L.ch + SPACE.s * 2) + (L.ch + SPACE.s) / 2 });
  const height = L.stripH + SPACE.l + L.gridH;

  const priceOf = (id: ProductId) => products.find(p => p.id === id)?.price ?? null;
  const name = T.backs.names[look];
  const owned = ownsBack(look), paid = isPaidBack(look);
  const tryOn = getTryOn(), canTry = paid && !owned && tryOnOffered();
  const allOwned = getRights().backsAll || PAID_BACKS.every(ownsBack);
  const stateOf = (id: BackId): string =>
    id === chosen ? T.backs.chosen : ownsBack(id) ? (isPaidBack(id) ? T.backs.owned : T.backs.free) : T.backs.locked;

  const pick = (id: BackId) => {
    setLook(id);
    setMsg(null);
    if (ownsBack(id)) setSettings({ back: id });
  };
  const purchase = async (id: ProductId, thanks: string, then?: () => void) => {
    setBusy(true);
    setMsg(null);
    const r = await buy(id);
    setBusy(false);
    if (r.ok) { then?.(); setMsg({ text: thanks }); }
    else if (r.why === 'failed') setMsg({ text: T.money.failed, detail: r.detail });
    else if (r.why === 'unavailable') setMsg({ text: T.money.why[why ?? 'error'], detail: r.detail });
  };
  const tryIt = async () => {
    if (!isPaidBack(look)) return;
    setBusy(true);
    setMsg(null);
    const ok = await watchToTryOn(look);
    setBusy(false);
    setMsg({ text: ok ? T.backs.tried(name) : T.backs.notTried });
    // следующая реклама — заранее
    prepareRewarded(() => setTick(t => t + 1));
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.pad, { paddingTop: insets.top + SPACE.l, paddingBottom: insets.bottom + SPACE.xl }]} testID="backs">
      <Header title={T.backs.title} back={T.backs.back} onBack={onBack} backTestID="backs-back" />
      <View style={{ width, height, alignSelf: 'center' }}>
        <Canvas style={StyleSheet.absoluteFill}>
          <RoundedRect x={0} y={0} width={width} height={L.stripH} r={RADIUS.panel}>
            <LinearGradient start={vec(0, 0)} end={vec(0, L.stripH)} colors={[C.feltLight, C.felt]} />
          </RoundedRect>
          {big ? (
            <>
              {/* веер соперника, ×0,55 */}
              {[0, 1, 2, 3].map(k => (
                <Group key={`f${k}`} transform={[{ translateX: width * 0.2 + (k - 1.5) * L.big * 0.16 }, { translateY: L.stripH / 2 }, { rotate: ((k - 1.5) * 3 * Math.PI) / 180 }, { scale: 0.55 }]}>
                  <Picture picture={big.back} />
                </Group>
              ))}
              <Group transform={[{ translateX: width / 2 }, { translateY: L.stripH / 2 }]}><Picture picture={big.back} /></Group>
              {/* колода с козырем, ×0,7 */}
              <Group transform={[{ translateX: width * 0.8 + L.big * 0.2 }, { translateY: L.stripH / 2 }, { rotate: Math.PI / 2 }, { scale: 0.7 }]}><Picture picture={big.face(TRUMP)} /></Group>
              {[0, 1, 2].map(k => (
                <Group key={`t${k}`} transform={[{ translateX: width * 0.8 - L.big * 0.12 - k * 0.8 }, { translateY: L.stripH / 2 - k * 0.8 }, { scale: 0.7 }]}>
                  <Picture picture={big.back} />
                </Group>
              ))}
            </>
          ) : null}
          {ALL_BACKS.map((id, i) => {
            const p = at(i), ring = id === chosen ? C.accent : id === look ? C.text : null;
            const l = ownsBack(id) ? null : lock(p.x + L.cw / 2 - 7, p.y - L.ch / 2 + 9);
            return (
              <Group key={id}>
                <Group transform={[{ translateX: p.x }, { translateY: p.y }]}><Picture picture={tiles[i]} /></Group>
                {ring ? <RoundedRect x={p.x - L.cw / 2 - 3} y={p.y - L.ch / 2 - 3} width={L.cw + 6} height={L.ch + 6} r={Math.round(L.cw * 0.1) + 3} color={ring} style="stroke" strokeWidth={2} /> : null}
                {l ? (
                  <>
                    <Circle cx={p.x + L.cw / 2 - 7} cy={p.y - L.ch / 2 + 9} r={10} color={C.sheet} />
                    <Path path={l.bow} color={C.text} style="stroke" strokeWidth={1.4} />
                    <Path path={l.body} color={C.text} />
                  </>
                ) : null}
              </Group>
            );
          })}
        </Canvas>
        {ALL_BACKS.map((id, i) => {
          const p = at(i);
          return (
            <Pressable key={id} testID={`back-${id}`} accessibilityRole="button" accessibilityState={{ selected: id === chosen }}
              aria-selected={id === chosen} accessibilityLabel={T.backs.tile(T.backs.names[id], stateOf(id))} onPress={() => pick(id)}
              style={{ position: 'absolute', left: p.x - L.tile / 2, top: p.y - (L.ch + SPACE.s) / 2, width: L.tile, height: L.ch + SPACE.s }} />
          );
        })}
      </View>
      <Glass style={styles.card} testID="back-card">
        <Text style={styles.name} testID="back-name" maxFontSizeMultiplier={1.3}>{name}</Text>
        <Text style={owned ? styles.good : styles.note} testID="back-state" maxFontSizeMultiplier={1.3}>
          {look === chosen ? T.backs.chosen : owned ? (paid ? T.backs.owned : T.backs.free) : canTry ? T.backs.paid : T.backs.paidNoTry}
        </Text>
        {!owned && isPaidBack(look) ? (
          <>
            <Button testID="back-buy" label={T.backs.buy(priceOf(themeProduct(look)))} disabled={why !== null || busy}
              onPress={() => { const id = look; void purchase(themeProduct(id), T.backs.thanks(name), () => setSettings({ back: id })); }} />
            {canTry ? <Button testID="back-try" kind="ghost" label={T.backs.tryOn} disabled={busy} onPress={() => { void tryIt(); }} /> : null}
            {canTry ? <Text style={styles.note} maxFontSizeMultiplier={1.3}>{T.backs.tryOnNote}</Text> : null}
          </>
        ) : null}
        {tryOn && !tryOn.over ? (
          <Text style={styles.text} testID="back-trying" maxFontSizeMultiplier={1.3}>
            {(tryOn.game === null ? T.backs.trying : T.backs.tryingNow)(T.backs.names[tryOn.back])}
          </Text>
        ) : null}
        {why ? <Text style={styles.note} testID="backs-why" maxFontSizeMultiplier={1.3}>{T.money.why[why]}</Text> : null}
      </Glass>
      {msg ? <Text style={styles.text} testID="backs-msg" maxFontSizeMultiplier={1.3}>{msg.text}</Text> : null}
      {msg?.detail ? <Text style={styles.note} selectable maxFontSizeMultiplier={1.3}>{T.money.detail(msg.detail)}</Text> : null}
      {!allOwned ? (
        <>
          <Button testID="backs-all" kind="ghost" label={T.backs.all(priceOf('themes_all'))} disabled={why !== null || busy}
            onPress={() => { void purchase('themes_all', T.backs.thanksAll); }} />
          <Text style={styles.note} maxFontSizeMultiplier={1.3}>{T.backs.allNote}</Text>
        </>
      ) : null}
      <Text style={styles.note} maxFontSizeMultiplier={1.3}>{T.backs.note}</Text>
      {billing.test ? <Text style={styles.note} maxFontSizeMultiplier={1.3}>{T.money.test}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { paddingHorizontal: SPACE.l, gap: SPACE.l },
  card: { padding: SPACE.l, gap: SPACE.m },
  name: { color: C.text, fontSize: TYPE.section, fontWeight: '700' },
  text: { color: C.text, fontSize: TYPE.body, lineHeight: 20 },
  note: { color: C.dim, fontSize: TYPE.caption, lineHeight: 18 },
  good: { color: C.ok, fontSize: TYPE.body, fontWeight: '700' },
});
