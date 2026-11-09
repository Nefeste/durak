// Выбор одного из длинного ряда одной строкой: «‹ Средний ›» (аудит 08.11.2026, находка 12). Стрелки — кнопки 48 × 48,
// между ними — выбранное золотом на стекле, как у `Chips`. Ряд не кольцевой: на краю стрелка гаснет, чтобы было видно,
// где начало и конец. Последний шаг может быть закрытым (`locked`): его можно показать, но не выбрать — подпись бледная,
// рамка штрихом, касание середины объясняет почему.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, RADIUS, SPACE, TYPE } from './theme';

export function Stepper<V extends string>({ id, items, value, label, onChange, locked, onLocked, prevLabel, nextLabel }: {
  id: string; items: readonly V[]; value: V; label: (v: V) => string; onChange: (v: V) => void;
  /** Закрытый последний шаг: показан, когда `value` — его ключ. */
  locked?: { key: V; label: string };
  /** Касание закрытого шага. */
  onLocked?: () => void;
  /** Подписи стрелок для чтения с экрана. */
  prevLabel: string; nextLabel: string;
}) {
  const all = locked ? [...items, locked.key] : [...items];
  const i = Math.max(0, all.indexOf(value));
  const isLocked = !!locked && value === locked.key;
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
    <View style={styles.row} accessibilityRole="adjustable" accessibilityValue={{ min: 1, max: all.length, now: i + 1, text: isLocked ? locked?.label : label(value) }}>
      {arrow(-1)}
      <Pressable testID={`${id}-value`} onPress={isLocked ? onLocked : undefined} disabled={!isLocked}
        accessibilityState={{ disabled: isLocked }} style={[styles.value, isLocked && styles.valueLocked]}>
        <Text style={[styles.valueText, isLocked && styles.valueTextLocked]} maxFontSizeMultiplier={1.3}>{isLocked ? locked?.label : label(value)}</Text>
        {/* где мы в ряду: точки шагов, текущая — золотом */}
        <View style={styles.dots}>
          {all.map((k, n) => <View key={k} style={[styles.dot, n === i && (isLocked ? styles.dotLocked : styles.dotOn)]} />)}
        </View>
      </Pressable>
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
  valueLocked: { borderColor: C.glassLine, borderStyle: 'dashed', borderWidth: 1 },
  valueText: { color: C.accent, fontSize: TYPE.button, fontWeight: '700', textAlign: 'center' },
  valueTextLocked: { color: C.dim, fontWeight: '400' },
  dots: { flexDirection: 'row', gap: SPACE.xs },
  dot: { width: DOT, height: DOT, borderRadius: RADIUS.pill, backgroundColor: C.glassLine },
  dotOn: { backgroundColor: C.accent },
  dotLocked: { backgroundColor: C.dim },
});
