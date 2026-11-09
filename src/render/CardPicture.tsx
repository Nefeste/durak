// Картинка из карт для «Правил» и окна «Что такое перевод» (docs/09-game-design.md, «Первая партия»): несколько
// мест на полоске сукна, на каждом — карта, пара «атака — защита», колода с козырем, сброс или веер. Лица — те же,
// что за столом (faces.ts, ADR 0010), один холст Skia на картинку, без движения и касаний. Подписи мест — текстом
// под холстом, ровно под своим местом.
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, Group, LinearGradient, Picture, RoundedRect, useFont, vec } from '@shopify/react-native-skia';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import { nameOf } from '../engine';
import type { Card } from '../engine';
import { useSettings } from '../state/store';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';
import { makeFaces } from './faces';
import type { Faces } from './faces';
import { placePicture } from './picture';
import type { Placed, PictureSpec } from './picture';

export type { PictureSpec, Slot } from './picture';

function Sprite({ p, faces }: { p: Placed; faces: Faces }) {
  return (
    <Group transform={[{ translateX: p.x }, { translateY: p.y }, { rotate: (p.rot * Math.PI) / 180 }]}>
      <Picture picture={p.card === null ? faces.back : faces.face(p.card)} />
      {p.glow ? <Picture picture={faces.glow} /> : null}
    </Group>
  );
}

export function CardPicture({ spec, width, testID }: { spec: PictureSpec; width: number; testID?: string }) {
  const settings = useSettings();
  const placed = useMemo(() => placePicture(spec.slots, width), [spec, width]);
  const { cw, ch, height } = placed;
  // размер индекса — как за столом: 15 точек на карту 66
  const font = useFont(Onest_700Bold, Math.round(cw * 0.23));
  const small = useFont(Onest_700Bold, Math.round(cw * 0.39));
  const faces = useMemo(() => (font && small ? makeFaces(cw, ch, font, small, settings.fourColor) : null), [cw, ch, font, small, settings.fourColor]);
  // для чтения с экрана: карты картинки по порядку
  const said = placed.cards.filter(p => p.card !== null).map(p => nameOf(p.card as Card)).join(' ');
  // подписи стоят под своими местами и переносятся сколько нужно (13-art.md, §3 «Надписи целиком»): высота ряда — по
  // самой высокой подписи, а не две строки заранее (крупным шрифтом «старшей той же масти» уходила в третью и обрезалась)
  const [hs, setHs] = useState<number[]>([]);
  const labelH = hs.some(Boolean) ? Math.ceil(Math.max(...hs.filter(Boolean))) : TYPE.caption * 2 + SPACE.s;
  const onLabel = (i: number, h: number) => setHs(prev => (prev[i] === h ? prev : Object.assign([...prev], { [i]: h })));
  return (
    <View style={styles.wrap} testID={testID} accessible accessibilityLabel={said}>
      <View style={{ width, height }}>
        {faces ? (
          <Canvas style={StyleSheet.absoluteFill}>
            <RoundedRect x={0} y={0} width={width} height={height} r={RADIUS.small}>
              <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={[C.feltLight, C.felt]} />
            </RoundedRect>
            {placed.cards.map(p => <Sprite key={p.key} p={p} faces={faces} />)}
          </Canvas>
        ) : null}
      </View>
      {spec.labels ? (
        <View style={{ width, height: labelH }}>
          {spec.labels.map((l, i) => {
            // подпись не шире места до соседней: под тремя парами три подписи не налезают друг на друга
            const m = placed.mids, w = Math.min(cw * 2.4, i > 0 ? m[i] - m[i - 1] - SPACE.xs : Infinity, i < m.length - 1 ? m[i + 1] - m[i] - SPACE.xs : Infinity);
            return <Text key={i} style={[styles.label, { left: Math.max(0, Math.min(width - w, m[i] - w / 2)), width: w }]} onLayout={e => onLabel(i, e.nativeEvent.layout.height)}>{l}</Text>;
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.xs },
  label: { position: 'absolute', top: 0, color: C.dim, fontSize: TYPE.caption, textAlign: 'center' },
});
