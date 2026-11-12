// Выбор одного из длинного ряда одной строкой: «‹ Средний ›» (аудит 08.11.2026, находка 12). Стрелки — кнопки 48 × 48,
// между ними — выбранное золотом на стекле, как у `Chips`. Ряд не кольцевой: на краю стрелка гаснет, чтобы было видно,
// где начало и конец. Закрытого шага («Мастер · скоро») больше нет: седьмой уровень открыт.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, RADIUS, SPACE, TYPE } from './theme';

export function Stepper<V extends string>({ id, items, value, label, onChange, prevLabel, nextLabel }: {
  id: string; items: readonly V[]; value: V; label: (v: V) => string; onChange: (v: V) => void;
  /** Подписи стрелок для чтения с экрана. */
  prevLabel: string; nextLabel: string;
}) {
  const all = items;
  const i = Math.max(0, all.indexOf(value));
  const go = (d: number) => { const n = i + d; if (n >= 0 && n < all.length) onChange(all[n]); };
  const arrow = (d: -1 | 1) => {
    const off = d < 0 ? i === 0 : i === all.length - 1;
    return (
      <Pressable testID={`${id}-${d < 0 ? 'prev' : 'next'}`} accessibilityRole="button" accessibilityLabel={d < 0 ? prevLabel : nextLabel}
        accessibilityState={{ disabled: off }} disabled={off} onPress={() => go(d)} hitSlop={4}
        style={({ pressed }) => [styles.arrow, pressed && styles.pressed, off && styles.off]}>
        <Text style={styles.arrowText}>{d < 0 ? '‹' : '›'}</Text>
      </Pressable>
    );
  };
  return (
    <View style={styles.row} accessibilityRole="adjustable" accessibilityValue={{ min: 1, max: all.length, now: i + 1, text: label(value) }}>
      {arrow(-1)}
      <View testID={`${id}-value`} style={styles.value}>
        <Text style={styles.valueText} maxFontSizeMultiplier={1.3}>{label(value)}</Text>
        {/* где мы в ряду: точки шагов, текущая — золотом */}
        <View style={styles.dots}>
          {all.map((k, n) => <View key={k} style={[styles.dot, n === i && styles.dotOn]} />)}
        </View>
      </View>
      {arrow(1)}
    </View>
  );
}

const DOT = 6;
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  arrow: { width: 48, height: 48, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.glassLine, backgroundColor: C.glass, alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: C.text, fontSize: TYPE.title, lineHeight: TYPE.title + SPACE.xs, fontWeight: '700' },
  pressed: { opacity: 0.85, transform: [{ translateY: 1 }] },
  off: { opacity: 0.4 },
  value: { flex: 1, minHeight: 48, borderRadius: RADIUS.small, borderWidth: 2, borderColor: C.accent, backgroundColor: C.glass, alignItems: 'center', justifyContent: 'center', gap: SPACE.xs, paddingVertical: SPACE.xs },
  valueText: { color: C.accent, fontSize: TYPE.button, fontWeight: '700', textAlign: 'center' },
  dots: { flexDirection: 'row', gap: SPACE.xs },
  dot: { width: DOT, height: DOT, borderRadius: RADIUS.pill, backgroundColor: C.glassLine },
  dotOn: { backgroundColor: C.accent },
});
