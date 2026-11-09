// Место соперника над его веером (аудит 08.11.2026, находка 11; разбор соперников, раздел 6): стеклянная плашка
// с именем, уровнем, числом карт и ролью. Кто ходит или отбивается — золотая кромка плашки, её видно краем глаза, не
// читая подпись. Бот всегда назван ботом: «Бот 1» и его уровень (устав «Честность», ADR 0011).
// Каждая надпись — своей строкой и целиком (docs/13-art.md, §3 «Надписи целиком»; владелец 09.11.2026): втроём строка
// «Опытный · 6 карт» обрезалась до «Опытный · 6 ка…». Длинное имя переносится, плашка растёт вниз; высоту под плашку
// раскладка стола держит по числу строк и шрифту телефона (`plateHeight` в src/render/layout.ts).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PLATE } from '../render/layout';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';

/** Длинное слово имени (ник до 16 знаков) может переноситься между любыми буквами: невидимый пробел нулевой ширины
 *  после каждой буквы слов длиннее восьми знаков. Многоточия нет — ник виден целиком, плашка растёт вниз. */
export const breakable = (name: string) => name.replace(/\S{9,}/g, w => [...w].join('\u200B'));

/** Сколько строк у плашки: имя, `lines` и строка роли. */
export const plateLines = (lines: number) => lines + 2;

export function SeatPlate({ name, lines, role, active, testID, left, top, width, height }: {
  name: string; lines: string[]; role: string | null; active: boolean; testID: string;
  left: number; top: number; width: number; height: number;
}) {
  return (
    <View pointerEvents="none" testID={testID} accessibilityState={{ selected: active }} aria-selected={active}
      style={[styles.plate, active && styles.active, { left, top, width, minHeight: height }]}>
      <Text style={styles.name} maxFontSizeMultiplier={PLATE.maxScale}>{breakable(name)}</Text>
      {lines.map((l, i) => (
        <Text key={i} style={styles.info} testID={i === lines.length - 1 ? `${testID}-cards` : undefined} maxFontSizeMultiplier={PLATE.maxScale}>{l}</Text>
      ))}
      <Text style={[styles.role, !role && styles.hidden]} maxFontSizeMultiplier={PLATE.maxScale}>{role ?? ' '}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.xs, paddingVertical: PLATE.pad - 1,
    borderRadius: RADIUS.small, backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine,
  },
  // кромка в 2 точки, а размер плашки тот же: поле на точку уже
  active: { borderColor: C.accent, borderWidth: 2, paddingHorizontal: SPACE.xs - 1, paddingVertical: PLATE.pad - 2 },
  name: { color: C.text, fontSize: TYPE.body, lineHeight: PLATE.name, fontWeight: '700', textAlign: 'center' },
  info: { color: C.dim, fontSize: TYPE.caption, lineHeight: PLATE.line, textAlign: 'center' },
  role: { color: C.accent, fontSize: TYPE.caption, lineHeight: PLATE.line, fontWeight: '700', textAlign: 'center' },
  hidden: { opacity: 0 },
});
