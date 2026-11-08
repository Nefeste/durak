// Таблица вышедших карт против ботов (docs/09-game-design.md, «Подсказки и счёт карт»): включается в
// настройках, по умолчанию выключена; онлайн её нет (ADR 0006).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { T } from '../i18n';
import { Button } from '../ui/Button';
import { C, RADIUS, suitColors } from '../ui/theme';
import type { Seen } from './flow';

export function SeenCards({ grid, fourColor, onClose }: { grid: Seen[][]; fourColor: boolean; onClose: () => void }) {
  const colors = suitColors(fourColor);
  return (
    <View style={styles.sheet} testID="seen-sheet">
      <Text style={styles.title}>{T.seen.title}</Text>
      {grid.map((row, suit) => (
        <View key={suit} style={styles.row}>
          <Text style={[styles.suit, { color: colors[suit] === C.black ? C.text : colors[suit] }]}>{T.suits[suit]}</Text>
          {row.map((x, rank) => (
            <View key={rank} style={[styles.cell, x === 'discard' && styles.gone, x === 'openly' && styles.openly]}
              accessibilityLabel={`${T.ranks[rank]}${T.suits[suit]}: ${x === null ? T.seen.unknown : T.seen[x]}`}>
              <Text style={[styles.rank, x !== null && styles.rankGone]}>{T.ranks[rank]}</Text>
            </View>
          ))}
        </View>
      ))}
      <Text style={styles.legend}>{T.seen.legend}</Text>
      <Button label={T.seen.close} kind="ghost" onPress={onClose} testID="seen-close" />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 12, right: 12, top: '18%', gap: 6, padding: 14, borderRadius: RADIUS.card, backgroundColor: C.sheet, borderWidth: 1, borderColor: C.glassLine },
  title: { color: C.text, fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  suit: { width: 22, fontSize: 18, textAlign: 'center' },
  cell: { flex: 1, height: 28, borderRadius: 6, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  gone: { backgroundColor: C.line },
  openly: { borderColor: C.accent },
  rank: { color: C.text, fontSize: 13, fontWeight: '700' },
  rankGone: { color: C.dim },
  legend: { color: C.dim, fontSize: 13, marginTop: 4 },
});
