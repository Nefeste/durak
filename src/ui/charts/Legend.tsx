// из nardy: src/ui/charts/Diverging.tsx @ 1d2bdff (`DivLegend`) — легенда: какой цвет что значит, всегда, когда рядов
// больше одного. Ключ повторяет отметку (квадрат — для полос и клеток), подпись — цветом текста, не цветом ряда.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C, SPACE, TYPE } from '../theme';

export function Legend({ items }: { items: readonly { color: string; label: string }[] }) {
  return (
    <View style={styles.legend}>
      {items.map(i => (
        <View key={i.label} style={styles.key}>
          <View style={[styles.swatch, { backgroundColor: i.color }]} />
          <Text style={styles.text} maxFontSizeMultiplier={1.3}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: SPACE.m, rowGap: SPACE.xs },
  key: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s - 2 },
  swatch: { width: SPACE.m, height: SPACE.m, borderRadius: SPACE.xs / 2 },
  text: { color: C.dim, fontSize: TYPE.caption },
});
