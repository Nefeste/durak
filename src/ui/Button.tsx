// Кнопка: золотая капсула — главное действие, стекло — остальные (как в «Нардах», ADR 0012).
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { C, RADIUS } from './theme';

export function Button({ label, onPress, kind = 'main', disabled, testID }: {
  label: string; onPress?: () => void; kind?: 'main' | 'ghost'; disabled?: boolean; testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.base, kind === 'main' ? styles.main : styles.ghost, (pressed || disabled) && styles.dim]}
    >
      <Text style={[styles.label, kind === 'main' ? styles.mainText : styles.ghostText]} maxFontSizeMultiplier={1.3}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, paddingHorizontal: 20, borderRadius: RADIUS.button, alignItems: 'center', justifyContent: 'center' },
  main: { backgroundColor: C.accent },
  ghost: { backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine },
  dim: { opacity: 0.55 },
  label: { fontSize: 17, fontWeight: '700' },
  mainText: { color: C.accentText },
  ghostText: { color: C.text },
});
