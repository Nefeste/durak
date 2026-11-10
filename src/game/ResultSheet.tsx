// Итог партии — лист снизу над рукой (аудит 08.11.2026, находка 3; specs/2026-11-art-premium.md, «Круг 2»): стол и
// последние карты остаются видны. Конец партии — событие, но спокойное (устав «Без давления»): строка-герой об
// исходе, золотая линия знака, ряд мест по порядку выхода — стеклянные плашки, своя с золотой кромкой, последняя
// («с картами») без золота; строка разбора или проверки колоды текстом; главное действие золотом во всю ширину и
// стеклянные рядом. Лист выезжает снизу 250 мс (13-art.md §7); с «Меньше движения» — появляется на месте.
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { T } from '../i18n';
import { breakable } from './SeatPlate';
import { FACE, Face } from './Portrait';
import type { ResultPlace } from './outcome';
import { useLessMotion } from '../state/store';
import { Glass } from '../ui/Glass';
import { Ornament } from '../ui/Ornament';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';

/** Выезд листа, мс. */
export const SHEET_MS = 250;

export function ResultSheet({ title, places, lines, main, rest, bottom }: {
  title: string; places?: ResultPlace[]; lines: React.ReactNode; main: React.ReactNode; rest: React.ReactNode[]; bottom: number;
}) {
  const less = useLessMotion();
  const t = useSharedValue(less ? 1 : 0);
  useEffect(() => {
    if (less) { t.set(1); return; }
    t.set(withTiming(1, { duration: SHEET_MS, easing: Easing.out(Easing.cubic) }));
  }, [less, t]);
  const slide = useAnimatedStyle(() => ({ opacity: t.get(), transform: [{ translateY: (1 - t.get()) * 48 }] }));
  return (
    <Animated.View style={[styles.sheet, { paddingBottom: bottom + SPACE.l }, slide]} testID="result" accessibilityViewIsModal>
      <View pointerEvents="none" style={styles.shine} />
      <View style={styles.grip} />
      <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{title}</Text>
      <View style={styles.ornament}><Ornament width={160} /></View>
      {places && places.length ? (
        <View style={styles.places} testID="result-places" accessibilityLabel={places.map(p => `${p.n}. ${p.name}${p.fool ? ` — ${T.result.withCards}` : ''}`).join('; ')}>
          {places.map(p => (
            // своё место — золотой кромкой, но не когда остались с картами: итог спокойный, без «награды» за проигрыш
            // медальон места слева (портрет бота с подписью «бот» или первая буква имени), справа — место и имя;
            // уровень бота — строкой ниже во всю ширину плашки: рядом с медальоном «Начинающий» шрифтом ×1,3 не помещается
            <Glass key={p.n} radius={RADIUS.small} style={[styles.place, places.length > 2 && styles.placeHalf, p.you && !p.fool && styles.mine]} testID={`place-${p.n}`}>
              <View style={styles.placeHead}>
                <Face rival={p.rival} name={p.name} size={FACE.tile} testID={`place-${p.n}-face`} />
                <View style={styles.placeText}>
                  <Text style={[styles.placeN, p.fool && styles.foolText]} maxFontSizeMultiplier={1.3}>{p.fool ? T.result.withCards : T.result.placeN(p.n)}</Text>
                  <Text style={[styles.placeName, p.fool && styles.foolText]} maxFontSizeMultiplier={1.3}>{breakable(p.name)}</Text>
                </View>
              </View>
              {p.sub ? <Text style={styles.placeSub} maxFontSizeMultiplier={1.3}>{p.sub}</Text> : null}
            </Glass>
          ))}
        </View>
      ) : null}
      {lines}
      {main}
      <View style={styles.row}>{rest.map((r, i) => <View key={i} style={styles.cell}>{r}</View>)}</View>
    </Animated.View>
  );
}

export const sheetText = StyleSheet.create({
  line: { color: C.dim, fontSize: TYPE.body, textAlign: 'center' },
});

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, gap: SPACE.m, paddingTop: SPACE.s, paddingHorizontal: SPACE.l,
    borderTopLeftRadius: RADIUS.panel, borderTopRightRadius: RADIUS.panel, backgroundColor: C.sheet,
    borderWidth: 1, borderBottomWidth: 0, borderColor: C.glassLine, overflow: 'hidden',
  },
  /** блик по верхней кромке листа — свет лампы */
  shine: { position: 'absolute', top: 0, left: RADIUS.panel, right: RADIUS.panel, height: 1, backgroundColor: C.shine },
  grip: { alignSelf: 'center', width: 36, height: 4, borderRadius: RADIUS.pill, backgroundColor: C.glassLine },
  title: { color: C.text, fontSize: TYPE.title, fontWeight: '700', textAlign: 'center' },
  ornament: { alignItems: 'center', marginTop: -SPACE.xs },
  // не больше двух плашек в ряд: рядом с медальоном «Начинающий» в ряду из трёх на 360 точках не помещается
  // (13-art.md, §3 «Надписи целиком»); втроём третья плашка — вторым рядом, вчетвером — два ряда по два
  places: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s, justifyContent: 'center' },
  placeHalf: { flexBasis: '45%' },
  place: { flex: 1, maxWidth: 200, minHeight: 64, paddingHorizontal: SPACE.s, paddingVertical: SPACE.s, alignItems: 'center', justifyContent: 'center', gap: SPACE.xs / 2 },
  placeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s },
  placeText: { flexShrink: 1, alignItems: 'flex-start', gap: SPACE.xs / 2 },
  // своё место — золотая кромка в 2 точки, размер тот же
  mine: { borderColor: C.accent, borderWidth: 2, paddingHorizontal: SPACE.s - 1, paddingVertical: SPACE.s - 1 },
  placeN: { color: C.accent, fontSize: TYPE.caption, fontWeight: '700' },
  placeName: { color: C.text, fontSize: TYPE.body, fontWeight: '700' },
  placeSub: { color: C.dim, fontSize: TYPE.caption, textAlign: 'center' },
  foolText: { color: C.dim, fontWeight: '400' },
  row: { flexDirection: 'row', gap: SPACE.s },
  cell: { flex: 1 },
});
