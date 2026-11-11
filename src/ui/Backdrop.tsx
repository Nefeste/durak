// Комната с лампой (13-art.md §5, specs/2026-11-art-premium.md §2): фон под всеми экранами — ночная хвоя сверху вниз,
// дощатый пол (третий круг вида), тёплое пятно лампы над столом и холодный отсвет снизу. Рисуется один раз и не
// двигается: экраны поверх него прозрачны, панели — стекло (src/ui/Glass.tsx).
import React, { memo, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { planks } from './floor';
import { C, GLOWS, SKY } from './theme';

export const Backdrop = memo(function Backdrop() {
  const { width, height } = useWindowDimensions();
  const floor = useMemo(() => planks(width, height), [width, height]);
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
        {/* пол: доска — тон поверх фона, щель — тёмная линия справа и по торцу */}
        {floor.map((p, i) => (
          <React.Fragment key={i}>
            <Rect x={p.x} y={p.y} width={p.w} height={p.h} fill={p.light ? C.floorLight : C.floor} />
            <Rect x={p.x + p.w - 1} y={p.y} width={1} height={p.h} fill={C.floorSeam} />
            <Rect x={p.x} y={p.y + p.h - 1} width={p.w - 1} height={1} fill={C.floorSeam} />
          </React.Fragment>
        ))}
        {GLOWS.map(g => <Rect key={g.id} x="0" y="0" width="100%" height="100%" fill={`url(#bd-${g.id})`} />)}
      </Svg>
    </View>
  );
});
