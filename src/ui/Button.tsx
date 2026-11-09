// Кнопка: золотая капсула — главное действие, стекло — остальные (как в «Нардах», ADR 0012).
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { C, RADIUS, SPACE, TYPE } from './theme';

/** `small` — для верхней полосы и помощников у руки: ниже и уже, зона касания та же (hitSlop). */
export function Button({ label, onPress, kind = 'main', disabled, testID, small }: {
  label: string; onPress?: () => void; kind?: 'main' | 'ghost'; disabled?: boolean; testID?: string; small?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={small ? 4 : undefined}
      // нажатие и недоступность — разные (аудит 08.11.2026, находка 13): нажатая чуть темнее и опускается на точку,
      // недоступная — стекло без золота и бледная, даже если она главная
      style={({ pressed }) => [styles.base, small && styles.small, kind === 'main' && !disabled ? styles.main : styles.ghost,
        pressed && !disabled && styles.pressed, disabled && styles.off]}
    >
      <Text style={[styles.label, small && styles.smallLabel, kind === 'main' && !disabled ? styles.mainText : styles.ghostText]} maxFontSizeMultiplier={1.3}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, paddingHorizontal: SPACE.l, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  main: { backgroundColor: C.accent },
  ghost: { backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine },
  // поле 12: на 360 точках крупным шрифтом в полосе стола помещаются «В меню», название стола и «Вышедшие» (13-art.md, §3)
  small: { minHeight: 40, paddingHorizontal: SPACE.m },
  pressed: { opacity: 0.85, transform: [{ translateY: 1 }] },
  off: { opacity: 0.4 },
  // подпись целиком (13-art.md, §3): не помещается в строку — переносится, кнопка становится выше
  label: { fontSize: TYPE.button, fontWeight: '700', textAlign: 'center' },
  smallLabel: { fontSize: TYPE.body },
  mainText: { color: C.accentText },
  ghostText: { color: C.text },
});
