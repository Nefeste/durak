// Лист колоды для снимков «до — после» (ADR устава 0023, правило 5; docs/13-art.md): все 36 лиц и рубашка тем же
// `makeFaces`, что за столом, карта стола и карта крупно. Только в веб-сборке по `?deck=1` (как `?inset=`, `?fast=`):
// игроку его не показать. Снимает `tools/design/deck.ts`.
import React, { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Canvas, Group, Picture, Rect, useFont } from '@shopify/react-native-skia';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import { DECK_SIZE } from '../engine';
import { C } from '../ui/theme';
import { makeFaces } from './faces';

export const deckSheetWanted = (): boolean =>
  Platform.OS === 'web' && typeof location !== 'undefined' && /[?&]deck=1\b/.test(location.search);

/** Карта стола (412 точек ширины) — 66; крупно — вдвое, чтобы рассмотреть узор. */
const CW = 66, CH = Math.round((CW * 88) / 63), BIG = 2, GAP = 10;

export function DeckSheet() {
  const four = typeof location !== 'undefined' && /[?&]four=1\b/.test(location.search);
  const font = useFont(Onest_700Bold, 15), small = useFont(Onest_700Bold, 26);
  const faces = useMemo(() => (font && small ? makeFaces(CW, CH, font, small, four) : null), [font, small, four]);
  const cols = 9, w = cols * (CW + GAP) + GAP;
  const deckH = 4 * (CH + GAP) + GAP;
  // крупно: В, Д, К червей и К♣ — красная и чёрная масть
  const big = [5, 6, 7].map(r => 3 * 9 + r).concat([1 * 9 + 7]);
  const bigW = CW * BIG, bigH = CH * BIG;
  const h = deckH + bigH + GAP * 2;
  return (
    <View style={styles.root} testID="deck-sheet">
      <View style={{ width: w, height: h }}>
        {faces ? (
          <Canvas style={StyleSheet.absoluteFill}>
            <Rect x={0} y={0} width={w} height={h} color={C.felt} />
            {Array.from({ length: DECK_SIZE }, (_, c) => (
              <Group key={c} transform={[{ translateX: GAP + (c % cols) * (CW + GAP) + CW / 2 }, { translateY: GAP + Math.floor(c / cols) * (CH + GAP) + CH / 2 }]}>
                <Picture picture={faces.face(c)} />
              </Group>
            ))}
            {big.map((c, i) => (
              <Group key={`b${c}`} transform={[{ translateX: GAP + i * (bigW + GAP) + bigW / 2 }, { translateY: deckH + GAP + bigH / 2 }, { scale: BIG }]}>
                <Picture picture={faces.face(c)} />
              </Group>
            ))}
          </Canvas>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: C.bg, alignItems: 'flex-start' } });
