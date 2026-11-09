// Высокая полоса «Итога» (навык dataviz, «Segmented bar — tall»): одно целое из частей одним взглядом. Части — блоки
// со скруглением 4 и зазором 2; число — внутри у переднего края, тёмным по заливке, только если помещается с полями;
// легенда — имена частей, числа — строками под полосой и в `accessibilityLabel`.
import React from 'react';
import { View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { CHART, TYPE } from '../theme';
import { LABEL_PAD, labelFits, segments, TALL } from './geometry';

export function Segmented({ values, colors, width, spoken, testID }: {
  values: readonly number[];
  colors: readonly string[];
  width: number;
  spoken: string;
  testID?: string;
}) {
  const segs = segments(values, width);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={spoken} testID={testID}>
      <Svg width={width} height={TALL}>
        {segs.map(s => {
          const text = String(values[s.index]);
          return (
            <React.Fragment key={s.index}>
              <Rect x={s.x} y={0} width={s.w} height={TALL} rx={4} fill={colors[s.index]} />
              {labelFits(text, s.w, TYPE.caption) ? (
                <SvgText fontFamily={CHART.font} x={s.x + LABEL_PAD} y={TALL / 2 + TYPE.caption * 0.35} fontSize={TYPE.caption} fontWeight="700" fill={CHART.onFill}>{text}</SvgText>
              ) : null}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}
