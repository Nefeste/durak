// Итог партии — лист снизу над рукой (аудит 08.11.2026, находка 3; specs/2026-11-art-premium.md §3): стол и
// последние карты остаются видны. Конец партии — событие: исход заголовком, строка «кто вышел и кто остался»,
// строка разбора или проверки колоды, главное действие золотом во всю ширину и два стеклянных рядом. Лист
// выезжает снизу 250 мс (13-art.md §7); с «Меньше движения» — появляется на месте.
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useLessMotion } from '../state/store';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';

/** Выезд листа, мс. */
export const SHEET_MS = 250;

export function ResultSheet({ title, subtitle, lines, main, rest, bottom }: {
  title: string; subtitle?: string | null; lines: React.ReactNode; main: React.ReactNode; rest: React.ReactNode[]; bottom: number;
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
      {subtitle ? <Text style={styles.subtitle} testID="result-order" maxFontSizeMultiplier={1.3}>{subtitle}</Text> : null}
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
  subtitle: { color: C.accent, fontSize: TYPE.body, fontWeight: '700', textAlign: 'center' },
  row: { flexDirection: 'row', gap: SPACE.s },
  cell: { flex: 1 },
});
