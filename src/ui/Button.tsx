// Кнопка: золотая капсула — главное действие, стекло — остальные (как в «Нардах», ADR 0012).
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { C, RADIUS } from './theme';

/** `small` — для верхней полосы и помощников у руки: ниже и уже, зона касания та же (hitSlop). */
export function Button({ label, onPress, kind = 'main', disabled, testID, small }: {
  label: string; onPress?: () => void; kind?: 'main' | 'ghost'; disabled?: boolean; testID?: string; small?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      hitSlop={small ? 4 : undefined}
      style={({ pressed }) => [styles.base, small && styles.small, kind === 'main' ? styles.main : styles.ghost, (pressed || disabled) && styles.dim]}
    >
      <Text style={[styles.label, small && styles.smallLabel, kind === 'main' ? styles.mainText : styles.ghostText]} maxFontSizeMultiplier={1.3} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, paddingHorizontal: 20, borderRadius: RADIUS.button, alignItems: 'center', justifyContent: 'center' },
  main: { backgroundColor: C.accent },
  ghost: { backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine },
  small: { minHeight: 40, paddingHorizontal: 14 },
  dim: { opacity: 0.55 },
  label: { fontSize: 17, fontWeight: '700' },
  smallLabel: { fontSize: 15 },
  mainText: { color: C.accentText },
  ghostText: { color: C.text },
});
