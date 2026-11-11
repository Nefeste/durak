// Место соперника над его веером (аудит 08.11.2026, находка 11; разбор соперников, раздел 6): стеклянная плашка
// с медальоном места, именем, уровнем, числом карт и ролью. Кто ходит или отбивается — золотая кромка плашки, её видно
// краем глаза, не читая подпись. У бота — имя и портрет персонажа (решение владельца #20), и он всегда назван ботом:
// подпись «бот» у портрета и уровень строкой под именем (устав «Честность», ADR 0011). У человека в медальоне — первая
// буква имени. Широкая плашка (один-два соперника): медальон слева, надписи столбцом справа. Узкая (три соперника на
// телефоне): в верхнем ряду медальон, справа от него «бот» и число карт значком карты с цифрой, ниже во всю ширину —
// имя и уровень; так плашка вчетвером выше прежней всего на строку, и стол не теряет высоту (`PlateFace`,
// src/render/layout.ts; tools/test/table.test.ts — шесть пар на 360 × 740).
// Каждая надпись — своей строкой и целиком (docs/13-art.md, §3 «Надписи целиком»; владелец 09.11.2026): втроём строка
// «Опытный · 6 карт» обрезалась до «Опытный · 6 ка…». Длинное имя переносится, плашка растёт вниз; высоту под плашку
// раскладка стола держит по числу строк и шрифту телефона (`plateOf`, `plateHeight` в src/render/layout.ts).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { T } from '../i18n';
import { PLATE } from '../render/layout';
import type { PlateFace } from '../render/layout';
import { BotChip, CardCount, Face } from './Portrait';
import type { Rival } from './rivals';
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

export function SeatPlate({ name, rival, face = 'side', lines, cards, role, active, testID, left, top, width, height }: {
  name: string; role: PlateRole | null; active: boolean; testID: string;
  /** Строки под именем; последняя — число карт словами («6 карт») или «вышел», «сдался». */
  lines: string[];
  /** Число карт цифрой — для узкой плашки (значок карты и цифра); нет — последняя строка словом. */
  cards?: number;
  /** Персонаж бота на месте; человек — `null`. */
  rival?: Rival | null;
  face?: PlateFace;
  left: number; top: number; width: number; height: number;
}) {
  const side = face === 'side';
  const last = lines[lines.length - 1] ?? '';
  const info = lines.slice(0, -1);
  const roleIcon = role ? (
    <View accessible accessibilityLabel={role.label} testID={`${testID}-role-${role.icon}`} style={styles.icon}>
      <RoleIcon role={role.icon} />
    </View>
  ) : null;
  const title = <Text style={[styles.name, side && styles.left]} testID={`${testID}-name`} maxFontSizeMultiplier={PLATE.maxScale}>{breakable(name)}</Text>;
  const infos = info.map((l, i) => <Text key={i} style={[styles.info, side && styles.left]} maxFontSizeMultiplier={PLATE.maxScale}>{l}</Text>);
  return (
    <Glass radius={RADIUS.small} testID={testID} selected={active}
      style={[styles.plate, active && styles.active, { left, top, width, minHeight: height }]}>
      {side ? (
        <View pointerEvents="none" style={styles.row}>
          <Face rival={rival} name={name} size={width >= PLATE.sideBigFrom ? PLATE.side : PLATE.sideSmall} testID={`${testID}-face`} />
          <View style={styles.text}>
            {title}
            {infos}
            {/* последняя строка — число карт; слева от неё значок роли: ходит — стрелка к столу, отбивается — щит */}
            <View style={styles.last}>
              {roleIcon}
              <Text style={styles.info} testID={`${testID}-cards`} maxFontSizeMultiplier={PLATE.maxScale}>{last}</Text>
            </View>
          </View>
        </View>
      ) : (
        <View pointerEvents="none" style={styles.col}>
          <View style={styles.head}>
            <Face rival={rival} name={name} size={PLATE.top} chip={false} testID={`${testID}-face`} />
            <View style={styles.headText}>
              {rival ? <BotChip testID={`${testID}-face-bot`} /> : null}
              <View style={styles.last}>
                {roleIcon}
                {cards === undefined
                  ? <Text style={styles.info} testID={`${testID}-cards`} maxFontSizeMultiplier={PLATE.maxScale}>{last}</Text>
                  : <CardCount n={cards} label={last} testID={`${testID}-cards`} />}
              </View>
            </View>
          </View>
          {title}
          {infos}
        </View>
      )}
    </Glass>
  );
}

const styles = StyleSheet.create({
  // поле 4 и кромка 1 — `PLATE.pad`; плашка растёт вниз, если ник перенёсся
  plate: { position: 'absolute', justifyContent: 'center', paddingHorizontal: SPACE.xs, paddingVertical: PLATE.pad - 1 },
  col: { alignItems: 'center' },
  // узкая плашка: медальон и справа от него «бот» над числом карт
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: PLATE.gap - 2 },
  headText: { alignItems: 'flex-start' },
  // медальон слева, надписи — столбцом от левого края; длинный ник переносится в своём столбце
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: PLATE.gap },
  text: { flexShrink: 1, alignItems: 'flex-start' },
  left: { textAlign: 'left' },
  // кромка в 2 точки, а размер плашки тот же: поле на точку уже
  active: { borderColor: C.accent, borderWidth: 2, paddingHorizontal: SPACE.xs - 1, paddingVertical: PLATE.pad - 2 },
  name: { color: C.text, fontSize: TYPE.body, lineHeight: PLATE.name, fontWeight: '700', textAlign: 'center' },
  info: { color: C.dim, fontSize: TYPE.caption, lineHeight: PLATE.line, textAlign: 'center' },
  last: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.xs },
  icon: { width: 14, height: 14 },
});
