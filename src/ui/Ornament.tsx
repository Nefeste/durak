// Золотая линия с мастью по середине под названием игры (13-art.md §1, specs/2026-11-art-premium.md §3): два
// тонких луча, гаснущих к краям, и ромб ♦ между ними. Рисуется кодом, без картинок.
import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { C } from './theme';

export function Ornament({ width = 180 }: { width?: number }) {
  const h = 10, mid = width / 2, gap = 9, d = 4;
  return (
    <View style={{ width, height: h }} pointerEvents="none">
      <Svg width={width} height={h}>
        <Defs>
          <LinearGradient id="orn-l" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={C.accent} stopOpacity={0} />
            <Stop offset="1" stopColor={C.accent} stopOpacity={0.9} />
          </LinearGradient>
          <LinearGradient id="orn-r" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={C.accent} stopOpacity={0.9} />
            <Stop offset="1" stopColor={C.accent} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={h / 2 - 0.5} width={mid - gap} height={1} fill="url(#orn-l)" />
        <Rect x={mid + gap} y={h / 2 - 0.5} width={mid - gap} height={1} fill="url(#orn-r)" />
        <Path d={`M ${mid} ${h / 2 - d} L ${mid + d * 0.75} ${h / 2} L ${mid} ${h / 2 + d} L ${mid - d * 0.75} ${h / 2} Z`} fill={C.accent} />
      </Svg>
    </View>
  );
}
