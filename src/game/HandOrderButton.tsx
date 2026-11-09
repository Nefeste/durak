// Кнопка порядка руки слева от руки (docs/09-game-design.md, «Управление»; игра владельца 09.11.2026): круг стекла
// 40 точек, цель касания 48; касание меняет `Settings.handOrder` — ту же настройку, что в «Настройках». Значок — каким
// порядком рука лежит сейчас: две масти или ступеньки; слово — голосом.
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { T } from '../i18n';
import type { HandOrder } from '../state/settings';
import { C, RADIUS } from '../ui/theme';
import { HandOrderIcon } from '../ui/RoleIcon';

export const nextOrder = (o: HandOrder): HandOrder => (o === 'suit' ? 'rank' : 'suit');

export function HandOrderButton({ order, x, y, onChange }: { order: HandOrder; x: number; y: number; onChange: (o: HandOrder) => void }) {
  const word = order === 'suit' ? T.settings.bySuit : T.settings.byRank;
  // testID не начинается с «hand-»: так сценарии находят карты руки (`[data-testid^="hand-"]`)
  return (
    <Pressable testID="order-hand" accessibilityRole="button" accessibilityLabel={T.game.handOrderButton(word.toLowerCase())}
      accessibilityHint={T.game.handOrderHint} onPress={() => onChange(nextOrder(order))} hitSlop={4}
      style={({ pressed }) => [styles.button, { left: x - SIZE / 2, top: y - SIZE / 2 }, pressed && styles.pressed]}>
      <HandOrderIcon order={order} />
    </Pressable>
  );
}

const SIZE = 40;

const styles = StyleSheet.create({
  button: {
    position: 'absolute', width: SIZE, height: SIZE, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.glass, borderColor: C.glassLine, borderWidth: 1,
  },
  pressed: { opacity: 0.85, transform: [{ translateY: 1 }] },
});
