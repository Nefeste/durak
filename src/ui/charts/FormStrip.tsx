// «Последние партии» — форма (docs/09-game-design.md, «Статистика»): клетка на партию, от давней к последней, цвет —
// место. Клетки не шире 24 dp, зазор 2; числа — строкой под рядом и в `accessibilityLabel`.
import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { cells } from './geometry';

export const CELL = 24;

export function FormStrip({ colors, width, spoken, testID }: { colors: readonly string[]; width: number; spoken: string; testID?: string }) {
  const cs = cells(colors.length, width, CELL);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={spoken} testID={testID}>
      <Svg width={width} height={CELL}>
        {cs.map((c, k) => <Rect key={k} x={c.x} y={0} width={c.w} height={CELL} rx={4} fill={colors[k]} />)}
      </Svg>
    </View>
  );
}
