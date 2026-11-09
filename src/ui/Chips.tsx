// Ряд выбора одного из нескольких (меню, настройки). Выбранное — золотой контур и золотой текст на стекле:
// заливка золотом остаётся только у главного действия экрана (аудит 08.11.2026, находка 7).
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, RADIUS, SPACE, TYPE } from './theme';

export function Chips<V extends string | number>({ items, value, label, onChange, id }: {
  items: readonly V[]; value: V; label: (v: V) => string; onChange: (v: V) => void; id: string;
}) {
  return (
    <View style={styles.chips}>
      {items.map(v => (
        <Pressable key={String(v)} testID={`${id}-${v}`} accessibilityRole="button" accessibilityState={{ selected: v === value }} aria-selected={v === value}
          // зона касания 48 при высоте 40: поле в 4 точки во все стороны, соседи в ряду и рядах — через 8 (аудит 09.11.2026)
          onPress={() => onChange(v)} hitSlop={4} style={({ pressed }) => [styles.chip, v === value && styles.chipOn, pressed && styles.pressed]}>
          <Text style={[styles.chipText, v === value && styles.chipTextOn]}>{label(v)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s },
  chip: { paddingHorizontal: SPACE.l, minHeight: 40, justifyContent: 'center', borderRadius: RADIUS.small, borderWidth: 1, borderColor: C.glassLine },
  // контур в 2 точки, а ширина ряда та же: поле на точку уже
  chipOn: { backgroundColor: C.glass, borderColor: C.accent, borderWidth: 2, paddingHorizontal: SPACE.l - 1 },
  chipText: { color: C.text, fontSize: TYPE.body },
  chipTextOn: { color: C.accent, fontWeight: '700' },
  pressed: { opacity: 0.85, transform: [{ translateY: 1 }] },
});
