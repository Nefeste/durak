// Знак игры на главном экране (specs/2026-11-art-premium.md §3): веер из трёх карт — две рубашки и козырная
// «Т» лицом впереди. Те же лица, что за столом (faces.ts, ADR 0010), один холст Skia, без движения. Под веером —
// тень карт из их картинок; фона у знака нет — он лежит на комнате.
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Group, Picture, useFont } from '@shopify/react-native-skia';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import { useSettings } from '../state/store';
import { makeFaces } from './faces';

/** Туз червей: масть 3, достоинство 8 (`suit * 9 + rank`). */
const ACE_HEARTS = 3 * 9 + 8;

export function Emblem({ width = 64, testID }: { width?: number; testID?: string }) {
  const settings = useSettings();
  const cw = width, ch = Math.round((cw * 88) / 63);
  const font = useFont(Onest_700Bold, Math.round(cw * 0.23));
  const small = useFont(Onest_700Bold, Math.round(cw * 0.39));
  const faces = useMemo(() => (font && small ? makeFaces(cw, ch, font, small, settings.fourColor) : null), [cw, ch, font, small, settings.fourColor]);
  const W = Math.round(cw * 2.4), H = Math.round(ch * 1.25);
  const cards: { card: number | null; x: number; y: number; rot: number }[] = [
    { card: null, x: -cw * 0.36, y: ch * 0.06, rot: -16 },
    { card: null, x: -cw * 0.04, y: -ch * 0.02, rot: -4 },
    { card: ACE_HEARTS, x: cw * 0.34, y: ch * 0.05, rot: 11 },
  ];
  return (
    <View style={{ width: W, height: H }} testID={testID} accessible accessibilityRole="image">
      {faces ? (
        <Canvas style={StyleSheet.absoluteFill}>
          {cards.map((c, i) => (
            <Group key={i} transform={[{ translateX: W / 2 + c.x }, { translateY: H / 2 + c.y }, { rotate: (c.rot * Math.PI) / 180 }]}>
              <Picture picture={c.card === null ? faces.back : faces.face(c.card)} />
            </Group>
          ))}
        </Canvas>
      ) : null}
    </View>
  );
}
