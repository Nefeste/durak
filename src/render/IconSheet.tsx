// Значок, заставка и баннер магазина — те же карты, что за столом (ADR 0010; ADR устава 0023, правило 3): туз червей
// нового лица (`makeFaces`) поверх рубашки «Бордо» (`makeBack`), веером на прозрачном или на сукне. Только в веб-сборке
// по `?icon=1&size=<px>&scale=<доля>[&bg=felt]` (как `?deck=1`): игроку её не показать. Снимают `tools/art/icon.ts` и
// `tools/store/shots.ts` (решение владельца 12.11.2026: «обнови иконку, заставку и баннер на новый дизайн карты туз
// червей, рубашку можно оставить Бордо»).
import React, { useMemo } from 'react';
import { Platform, View } from 'react-native';
import { Canvas, Group, Picture, Rect, useFont } from '@shopify/react-native-skia';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import { C } from '../ui/theme';
import { makeBack } from './backArt';
import { makeFaces } from './faces';

const query = (k: string): string | null =>
  typeof location === 'undefined' ? null : new URLSearchParams(location.search).get(k);

export const iconSheetWanted = (): boolean => Platform.OS === 'web' && query('icon') === '1';

/** Туз червей (масть 3 — ♥, достоинство 8 — туз). */
const ACE_HEARTS = 3 * 9 + 8;

/** Геометрия значка — как была у рисунка SVG до 12.11.2026: рубашка −12° левее середины, туз +9° правее. */
export function iconLayout(size: number, scale: number): { w: number; h: number; back: { x: number; rot: number }; face: { x: number; rot: number } } {
  const h = size * scale, w = (h * 63) / 88;
  return { w, h, back: { x: size / 2 - w * 0.22, rot: -12 }, face: { x: size / 2 + w * 0.2, rot: 9 } };
}

export function IconSheet() {
  const size = Number(query('size') ?? 1024), scale = Number(query('scale') ?? 0.62), bg = query('bg') === 'felt';
  const L = iconLayout(size, scale);
  // шрифт индекса — в той же доле карты, что за столом (15 при ширине карты 66)
  const font = useFont(Onest_700Bold, (15 * L.w) / 66);
  const faces = useMemo(() => (font ? makeFaces(L.w, L.h, font, false, 'classic') : null), [font, L.w, L.h]);
  const back = useMemo(() => makeBack(L.w, L.h, 'classic'), [L.w, L.h]);
  const at = (x: number, rot: number) => [{ translateX: x }, { translateY: size / 2 }, { rotate: (rot * Math.PI) / 180 }];
  return (
    <View style={{ width: size, height: size }} testID={faces ? 'icon-ready' : 'icon-sheet'}>
      {faces ? (
        <Canvas style={{ width: size, height: size }}>
          {bg ? <Rect x={0} y={0} width={size} height={size} color={C.felt} /> : null}
          <Group transform={at(L.back.x, L.back.rot)}><Picture picture={back} /></Group>
          <Group transform={at(L.face.x, L.face.rot)}><Picture picture={faces.face(ACE_HEARTS)} /></Group>
        </Canvas>
      ) : null}
    </View>
  );
}
