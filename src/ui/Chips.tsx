// Ряд выбора одного из нескольких (меню, настройки).
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, RADIUS, SPACE, TYPE } from './theme';

export function Chips<V extends string | number>({ items, value, label, onChange, id, locked }: {
  items: readonly V[]; value: V; label: (v: V) => string; onChange: (v: V) => void; id: string;
  /** Закрытое место в конце ряда: его нельзя выбрать, касание объясняет почему. */
  locked?: { key: string; label: string; onPress: () => void };
}) {
  return (
    <View style={styles.chips}>
      {items.map(v => (
        <Pressable key={String(v)} testID={`${id}-${v}`} accessibilityRole="button" accessibilityState={{ selected: v === value }} aria-selected={v === value}
          onPress={() => onChange(v)} style={[styles.chip, v === value && styles.chipOn]}>
          <Text style={[styles.chipText, v === value && styles.chipTextOn]}>{label(v)}</Text>
        </Pressable>
      ))}
      {locked ? (
        <Pressable testID={`${id}-${locked.key}`} accessibilityRole="button" accessibilityState={{ disabled: true }}
          onPress={locked.onPress} style={[styles.chip, styles.chipLocked]}>
          <Text style={[styles.chipText, styles.chipTextLocked]}>{locked.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s },
  chip: { paddingHorizontal: SPACE.l, minHeight: 40, justifyContent: 'center', borderRadius: RADIUS.small, borderWidth: 1, borderColor: C.glassLine },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.text, fontSize: TYPE.body },
  chipTextOn: { color: C.accentText, fontWeight: '700' },
  chipLocked: { borderStyle: 'dashed' },
  chipTextLocked: { color: C.dim },
});
