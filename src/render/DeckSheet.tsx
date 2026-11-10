// Лист колоды для снимков «до — после» (ADR устава 0023, правило 5; docs/13-art.md): все 36 лиц тем же
// `makeFaces`, что за столом, карта стола и карта крупно, и все десять рубашек (`makeBack`) — картой и веером. Только в веб-сборке по `?deck=1` (как `?inset=`, `?fast=`):
// игроку его не показать. Снимает `tools/design/deck.ts`.
import React, { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Canvas, Group, Picture, Rect, useFont } from '@shopify/react-native-skia';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import { DECK_SIZE } from '../engine';
import { C } from '../ui/theme';
import { makeBack } from './backArt';
import { ALL_BACKS } from './backs';
import { makeFaces } from './faces';

export const deckSheetWanted = (): boolean =>
  Platform.OS === 'web' && typeof location !== 'undefined' && /[?&]deck=1\b/.test(location.search);

/** Карта стола (412 точек ширины) — 66; крупно — в 1,7 раза, чтобы рассмотреть рисунок. */
const CW = 66, CH = Math.round((CW * 88) / 63), BIG = 1.7, GAP = 10;
/** Рубашки в ряд — чуть мельче карты стола (десять в ширину листа) и как в веере соперника (×0,55). */
const BACK = 0.86, FAN = 0.55;

export function DeckSheet() {
  const four = typeof location !== 'undefined' && /[?&]four=1\b/.test(location.search);
  const font = useFont(Onest_700Bold, 15);
  const faces = useMemo(() => (font ? makeFaces(CW, CH, font, four) : null), [font, four]);
  const backs = useMemo(() => ALL_BACKS.map(id => makeBack(CW, CH, id)), []);
  const cols = 9, w = cols * (CW + GAP) + GAP;
  const deckH = 4 * (CH + GAP) + GAP;
  // крупно: В, Д, К червей, туз пик и десятка бубён — картинки, туз и самое плотное поле мастей
  const big = [3 * 9 + 5, 3 * 9 + 6, 1 * 9 + 7, 0 * 9 + 8, 2 * 9 + 4];
  const bigW = CW * BIG, bigH = CH * BIG;
  const backsY = deckH + bigH + GAP * 2, backH = CH * BACK, fanY = backsY + backH + GAP, fanH = CH * FAN;
  const h = fanY + fanH + GAP;
  const step = (w - GAP) / ALL_BACKS.length;
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
            {backs.map((b, i) => (
              <Group key={`k${i}`} transform={[{ translateX: GAP + i * step + (CW * BACK) / 2 }, { translateY: backsY + backH / 2 }, { scale: BACK }]}>
                <Picture picture={b} />
              </Group>
            ))}
            {/* как в веере соперника: три рубашки внахлёст, ×0,55 */}
            {backs.flatMap((b, i) => [0, 1, 2].map(k => (
              <Group key={`f${i}-${k}`} transform={[{ translateX: GAP + i * step + (CW * FAN) / 2 + k * 9 }, { translateY: fanY + fanH / 2 }, { rotate: ((k - 1) * 3 * Math.PI) / 180 }, { scale: FAN }]}>
                <Picture picture={b} />
              </Group>
            )))}
          </Canvas>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: C.bg, alignItems: 'flex-start' } });
