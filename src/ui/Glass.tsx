// из nardy: src/ui/Glass.tsx @ 1d2bdff — токены «Козыря» (ADR 0012).
// Стеклянная панель (13-art.md §5): полупрозрачная светлая заливка, кромка 1 px, отсвет на верхней половине и блик
// по верхней кромке. Размытия нет: под стеклом неподвижный фон комнаты (src/ui/Backdrop.tsx).
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { C, RADIUS, SPACE } from './theme';

export function Glass({ children, style, testID, radius = RADIUS.panel, selected }: {
  children?: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string; radius?: number;
  /** Выделенная панель (плашка ходящего): для чтения с экрана и сценария, вид задаёт стиль снаружи. */
  selected?: boolean;
}) {
  return (
    <View testID={testID} style={[styles.glass, { borderRadius: radius }, style]}
      accessibilityState={selected === undefined ? undefined : { selected }} aria-selected={selected}>
      <View pointerEvents="none" style={styles.sheen} />
      <View pointerEvents="none" style={[styles.shine, { left: radius, right: radius }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  glass: { backgroundColor: C.glass, borderColor: C.glassLine, borderWidth: 1, overflow: 'hidden' },
  /** отсвет на верхней половине — стекло светлее там, где на него падает свет лампы */
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: C.sheen },
  /** блик по верхней кромке, не заходит на скругления */
  shine: { position: 'absolute', top: 0, height: 1, backgroundColor: C.shine, marginHorizontal: SPACE.xs },
});
