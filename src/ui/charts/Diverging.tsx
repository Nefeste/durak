// из nardy: src/ui/charts/Diverging.tsx @ 1d2bdff — «Против уровней»: расходящиеся полосы, «бот раньше» влево, «вы
// раньше» вправо от общей нулевой линии, одна длина на встречу для всех строк. Числа — на концах полос цветом текста;
// справа — доля «вы раньше». Подпись уровня переносится, а не обрезается.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import { C, CHART, SPACE, TYPE } from '../theme';
import { armUnit, BAR, barPath, GAP, LABEL_PAD, textWidth } from './geometry';

export interface DivRow {
  id: string;
  label: string;
  /** влево: бот вышел раньше */
  left: number;
  /** вправо: вы вышли раньше */
  right: number;
  /** справа от полосы */
  note: string;
  /** для чтения с экрана: всё то же словами */
  spoken: string;
}

const ROW = 28, LABEL = 96, NOTE = 48;

export function Diverging({ rows, width }: { rows: readonly DivRow[]; width: number }) {
  const plot = Math.max(80, width - LABEL - NOTE - 2 * SPACE.s);
  const half = plot / 2;
  const unit = armUnit(Math.max(...rows.map(r => Math.max(r.left, r.right))), half - GAP, TYPE.caption);
  const y = (ROW - BAR) / 2, base = ROW / 2 + TYPE.caption * 0.35;
  return (
    <View>
      {rows.map(r => {
        const l = half - GAP / 2 - r.left * unit, rt = half + GAP / 2 + r.right * unit;
        return (
          <View key={r.id} style={styles.row} testID={`stats-vs-${r.id}`} accessible accessibilityLabel={r.spoken}>
            <Text style={styles.label} maxFontSizeMultiplier={1.3}>{r.label}</Text>
            <Svg width={plot} height={ROW}>
              {r.left > 0 ? <Path d={barPath(half - GAP / 2, l, y, BAR, true)} fill={CHART.fool} /> : null}
              {r.right > 0 ? <Path d={barPath(half + GAP / 2, rt, y, BAR, true)} fill={CHART.first} /> : null}
              <Line x1={half} y1={0} x2={half} y2={ROW} stroke={CHART.axis} strokeWidth={1} />
              <SvgText fontFamily={CHART.font} x={Math.max(textWidth(String(r.left), TYPE.caption), l - LABEL_PAD)} y={base} fontSize={TYPE.caption} fill={C.text} textAnchor="end">{String(r.left)}</SvgText>
              <SvgText fontFamily={CHART.font} x={rt + LABEL_PAD} y={base} fontSize={TYPE.caption} fill={C.text} textAnchor="start">{String(r.right)}</SvgText>
            </Svg>
            <Text style={styles.note} maxFontSizeMultiplier={1.3}>{r.note}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: ROW, gap: SPACE.s },
  label: { width: LABEL, color: C.text, fontSize: TYPE.caption },
  note: { width: NOTE, color: C.dim, fontSize: TYPE.caption, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
