// Лист состава для снимков «до — после» и листа стиля (ADR устава 0023, правило 5; docs/13-art.md, §11): все
// персонажи по уровням — крупно (рассмотреть рисунок) и размерами игры (сбоку от имени 44, над именем 34), с подписью
// «бот» и именем, как на плашке. Только в веб-сборке по `?cast=1` (как `?deck=1`): игроку его не показать.
// Снимает `tools/design/cast.ts`.
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { T } from '../i18n';
import { PLATE } from '../render/layout';
import { Glass } from '../ui/Glass';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';
import { Face } from './Portrait';
import { CAST, CAST_LEVELS } from './rivals';

export const castSheetWanted = (): boolean =>
  Platform.OS === 'web' && typeof location !== 'undefined' && /[?&]cast=1\b/.test(location.search);

const BIG = 96;

export function CastSheet() {
  return (
    <View style={styles.root} testID="cast-sheet">
      {CAST_LEVELS.map(level => (
        <View key={level} style={styles.level}>
          <Text style={styles.title}>{T.rivals.level(level)}</Text>
          <View style={styles.row}>
            {CAST[level].map(r => (
              <Glass key={r.id} radius={RADIUS.small} style={styles.cell}>
                <Face rival={r} size={BIG} />
                <Text style={styles.name}>{T.rival[r.id]}</Text>
                <View style={styles.sizes}>
                  <Face rival={r} size={PLATE.side} />
                  <Face rival={r} size={PLATE.top} />
                </View>
              </Glass>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: SPACE.l, gap: SPACE.m, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start' },
  level: { gap: SPACE.s },
  title: { color: C.dim, fontSize: TYPE.caption },
  row: { flexDirection: 'row', gap: SPACE.s },
  cell: { width: 128, padding: SPACE.s, gap: SPACE.xs, alignItems: 'center' },
  name: { color: C.text, fontSize: TYPE.body, fontWeight: '700' },
  sizes: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.m },
});
