// Место соперника над его веером (аудит 08.11.2026, находка 11; разбор соперников, раздел 6): стеклянная плашка
// с именем, уровнем, числом карт и ролью. Кто ходит или отбивается — золотая кромка плашки, её видно краем глаза, не
// читая подпись. Бот всегда назван ботом: «Бот 1» и его уровень (устав «Честность», ADR 0011).
// Каждая надпись — своей строкой и целиком (docs/13-art.md, §3 «Надписи целиком»; владелец 09.11.2026): втроём строка
// «Опытный · 6 карт» обрезалась до «Опытный · 6 ка…». Длинное имя переносится, плашка растёт вниз; высоту под плашку
// раскладка стола держит по числу строк и шрифту телефона (`plateOf`, `plateHeight` в src/render/layout.ts).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { T } from '../i18n';
import { PLATE } from '../render/layout';
import { Glass } from '../ui/Glass';
import { RoleIcon } from '../ui/RoleIcon';
import type { Role } from '../ui/RoleIcon';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';

/** Длинное слово имени (ник до 16 знаков) может переноситься между любыми буквами: невидимый пробел нулевой ширины
 *  после каждой буквы слов длиннее восьми знаков. Многоточия нет — ник виден целиком, плашка растёт вниз. */
export const breakable = (name: string) => name.replace(/\S{9,}/g, w => [...w].join('​'));

/** Сколько строк у плашки: имя и `lines`. Роль — значком в последней строке, своей строки у неё нет (владелец
 *  09.11.2026: пустая строка роли у неходящего места не нужна). */
export const plateLines = (lines: number) => lines + 1;

/** Роль места: значок (стрелка к столу или щит) и его слово для чтения с экрана. */
export interface PlateRole { icon: Role; label: string }

/** Роль места в отбое: ходящий — стрелка к столу, отбивающийся — щит, чья очередь подкидывать (`thrower`, п. 4.3) —
 *  плюс; после партии — ничего. Один язык значков — без строк «ходит», «отбивается», «подкидывает». */
export function roleOf(o: { phase: string; attacker: number; defender: number }, seat: number, thrower: number | null = null): PlateRole | null {
  if (o.phase === 'end') return null;
  if (o.attacker === seat) return { icon: 'attack', label: T.game.attacking };
  if (o.defender === seat) return { icon: 'defend', label: T.game.defending };
  if (thrower === seat) return { icon: 'throw', label: T.game.throwing };
  return null;
}

export function SeatPlate({ name, lines, role, active, testID, left, top, width, height }: {
  name: string; lines: string[]; role: PlateRole | null; active: boolean; testID: string;
  left: number; top: number; width: number; height: number;
}) {
  return (
    <Glass radius={RADIUS.small} testID={testID} selected={active}
      style={[styles.plate, active && styles.active, { left, top, width, minHeight: height }]}>
      <View pointerEvents="none" style={styles.col}>
        <Text style={styles.name} maxFontSizeMultiplier={PLATE.maxScale}>{breakable(name)}</Text>
        {lines.map((l, i) => i < lines.length - 1 ? (
          <Text key={i} style={styles.info} maxFontSizeMultiplier={PLATE.maxScale}>{l}</Text>
        ) : (
          // последняя строка — число карт; слева от неё значок роли: ходит — стрелка к столу, отбивается — щит
          <View key={i} style={styles.last}>
            {role ? (
              <View accessible accessibilityLabel={role.label} testID={`${testID}-role-${role.icon}`} style={styles.icon}>
                <RoleIcon role={role.icon} />
              </View>
            ) : null}
            <Text style={styles.info} testID={`${testID}-cards`} maxFontSizeMultiplier={PLATE.maxScale}>{l}</Text>
          </View>
        ))}
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  // поле 4 и кромка 1 — `PLATE.pad`; плашка растёт вниз, если ник перенёсся
  plate: { position: 'absolute', justifyContent: 'center', paddingHorizontal: SPACE.xs, paddingVertical: PLATE.pad - 1 },
  col: { alignItems: 'center' },
  // кромка в 2 точки, а размер плашки тот же: поле на точку уже
  active: { borderColor: C.accent, borderWidth: 2, paddingHorizontal: SPACE.xs - 1, paddingVertical: PLATE.pad - 2 },
  name: { color: C.text, fontSize: TYPE.body, lineHeight: PLATE.name, fontWeight: '700', textAlign: 'center' },
  info: { color: C.dim, fontSize: TYPE.caption, lineHeight: PLATE.line, textAlign: 'center' },
  last: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.xs },
  icon: { width: 14, height: 14 },
});
