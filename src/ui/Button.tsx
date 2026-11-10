// Кнопка: золотая капсула — главное действие, стекло — остальные (как в «Нардах», ADR 0012). По верхней кромке —
// блик `shine` (13-art.md §5): свет лампы сверху ложится и на золото, и на стекло.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, RADIUS, SPACE, TYPE } from './theme';

/** `small` — для верхней полосы и помощников у руки: ниже и уже, зона касания та же (hitSlop). */
export function Button({ label, onPress, kind = 'main', disabled, testID, small }: {
  label: string; onPress?: () => void; kind?: 'main' | 'ghost'; disabled?: boolean; testID?: string; small?: boolean;
}) {
  const main = kind === 'main' && !disabled;
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
      style={({ pressed }) => [styles.base, small && styles.small, main ? styles.main : styles.ghost,
        pressed && !disabled && styles.pressed, disabled && styles.off]}
    >
      <View pointerEvents="none" style={[styles.shine, main && styles.shineGold]} />
      {/* подпись — заново, когда кнопка меняет вид (стекло или недоступная → золото): на Android у той же подписи менялся
          фон кнопки, а цвет оставался прежним, светлым, — светлое на золоте, «жёлтая кнопка без надписи» (игра владельца
          10.11.2026: «Поделиться» в задаче дня, «Повторить замер») */}
      <Text key={main ? 'main' : 'ghost'} style={[styles.label, small && styles.smallLabel, main ? styles.mainText : styles.ghostText]} maxFontSizeMultiplier={1.3}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, paddingHorizontal: SPACE.l, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  main: { backgroundColor: C.accent },
  ghost: { backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine },
  // поле 12: на 360 точках крупным шрифтом в полосе стола помещаются «В меню», название стола и «Вышедшие» (13-art.md, §3)
  small: { minHeight: 40, paddingHorizontal: SPACE.m },
  pressed: { opacity: 0.85, transform: [{ translateY: 1 }] },
  off: { opacity: 0.4 },
  /** блик по верхней кромке капсулы, не заходит на скругления */
  shine: { position: 'absolute', top: 0, left: SPACE.xl, right: SPACE.xl, height: 1, backgroundColor: C.shine },
  shineGold: { backgroundColor: C.face, opacity: 0.55 },
  // подпись целиком (13-art.md, §3): не помещается в строку — переносится, кнопка становится выше
  label: { fontSize: TYPE.button, fontWeight: '700', textAlign: 'center' },
  smallLabel: { fontSize: TYPE.body },
  mainText: { color: C.accentText },
  ghostText: { color: C.text },
});
