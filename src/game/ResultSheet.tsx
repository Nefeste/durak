// Итог партии — лист снизу над рукой (аудит 08.11.2026, находка 3; разбор соперников, раздел 6): стол и последние
// карты остаются видны. Сверху — итог одной строкой, ниже — строка разбора или проверки колоды, затем главное
// действие золотом во всю ширину и два стеклянных рядом.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';

export function ResultSheet({ title, lines, main, rest, bottom }: {
  title: string; lines: React.ReactNode; main: React.ReactNode; rest: React.ReactNode[]; bottom: number;
}) {
  return (
    <View style={[styles.sheet, { paddingBottom: bottom + SPACE.l }]} testID="result" accessibilityViewIsModal>
      <View style={styles.grip} />
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {lines}
      {main}
      <View style={styles.row}>{rest.map((r, i) => <View key={i} style={styles.cell}>{r}</View>)}</View>
    </View>
  );
}

export const sheetText = StyleSheet.create({
  line: { color: C.dim, fontSize: TYPE.body, textAlign: 'center' },
});

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, gap: SPACE.m, paddingTop: SPACE.s, paddingHorizontal: SPACE.l,
    borderTopLeftRadius: RADIUS.panel, borderTopRightRadius: RADIUS.panel, backgroundColor: C.sheet,
    borderWidth: 1, borderBottomWidth: 0, borderColor: C.glassLine,
  },
  grip: { alignSelf: 'center', width: 36, height: 4, borderRadius: RADIUS.pill, backgroundColor: C.glassLine },
  title: { color: C.text, fontSize: TYPE.section, fontWeight: '700', textAlign: 'center' },
  row: { flexDirection: 'row', gap: SPACE.s },
  cell: { flex: 1 },
});
