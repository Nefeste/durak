// Место соперника над его веером (аудит 08.11.2026, находка 11; разбор соперников, раздел 6): стеклянная плашка
// с именем, числом карт и ролью. Кто ходит или отбивается — золотая кромка плашки, её видно краем глаза, не читая
// подпись. Бот всегда назван ботом: «Бот 1 · Средний» (устав «Честность», ADR 0011).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';

export function SeatPlate({ name, info, role, active, testID, left, top, width }: {
  name: string; info: string; role: string | null; active: boolean; testID: string; left: number; top: number; width: number;
}) {
  return (
    <View pointerEvents="none" testID={testID} accessibilityState={{ selected: active }}
      style={[styles.plate, active && styles.active, { left, top, width }]}>
      <Text style={styles.name} numberOfLines={1}>{name}</Text>
      <Text style={styles.info} testID={`${testID}-cards`} numberOfLines={1}>{info}</Text>
      <Text style={[styles.role, !role && styles.hidden]} numberOfLines={1}>{role ?? '\u00A0'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    position: 'absolute', alignItems: 'center', paddingHorizontal: SPACE.s, paddingVertical: SPACE.xs,
    borderRadius: RADIUS.small, backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine,
  },
  // кромка в 2 точки, а размер плашки тот же: поле на точку уже
  active: { borderColor: C.accent, borderWidth: 2, paddingHorizontal: SPACE.s - 1, paddingVertical: SPACE.xs - 1 },
  name: { color: C.text, fontSize: TYPE.body, fontWeight: '700' },
  info: { color: C.dim, fontSize: TYPE.caption },
  role: { color: C.accent, fontSize: TYPE.caption, fontWeight: '700' },
  hidden: { opacity: 0 },
});
