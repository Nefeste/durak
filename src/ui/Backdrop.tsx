// из nardy: src/ui/Backdrop.tsx @ 1d2bdff — своя палитра: ночная хвоя и одна тёплая лампа над столом.
// Фон комнаты (13-art.md §5, specs/2026-11-art-premium.md §2): небо сверху вниз, тёплое пятно лампы в верхней
// трети и холодный отсвет внизу. Один рисунок под всеми экранами, рисуется один раз и не двигается: экраны поверх
// него прозрачны, панели — стекло (src/ui/Glass.tsx).
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { GLOWS, SKY } from './theme';

export const Backdrop = memo(function Backdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="backdrop">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="bd-sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={SKY[0]} />
            <Stop offset="1" stopColor={SKY[1]} />
          </LinearGradient>
          {GLOWS.map(g => (
            <RadialGradient key={g.id} id={`bd-${g.id}`} cx={g.cx} cy={g.cy} r={g.r} fx={g.cx} fy={g.cy}>
              <Stop offset="0" stopColor={g.color} stopOpacity={g.opacity} />
              <Stop offset="0.55" stopColor={g.color} stopOpacity={g.opacity * 0.35} />
              <Stop offset="1" stopColor={g.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#bd-sky)" />
        {GLOWS.map(g => <Rect key={g.id} x="0" y="0" width="100%" height="100%" fill={`url(#bd-${g.id})`} />)}
      </Svg>
    </View>
  );
});
