// из nardy: src/ui/charts/Ladder.tsx @ 1d2bdff — лестница уровней: шкала рейтинга с отметками семи уровней и вашей
// точкой. Подписаны только края — соседи названы строкой под шкалой: семь подписей на 300 px налезали бы друг на друга.
import React from 'react';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { LEVELS } from '../../bot';
import type { Level } from '../../bot';
import { C, CHART, TYPE } from '../theme';
import { ladderScale } from './geometry';

export function Ladder({ rating, width, elo, near, names }: {
  rating: number;
  width: number;
  elo: Record<Level, number>;
  /** соседи по лестнице — их отметки ярче */
  near: readonly (Level | null)[];
  names: Record<Level, string>;
}) {
  const first = LEVELS[0], last = LEVELS[LEVELS.length - 1];
  const x = ladderScale(LEVELS.map(l => elo[l]), rating, width);
  const y = 9;
  return (
    <Svg width={width} height={y + 8 + TYPE.caption + 4}>
      <Line x1={x(elo[first]) - 6} y1={y} x2={x(elo[last]) + 6} y2={y} stroke={CHART.axis} strokeWidth={1} />
      {LEVELS.map(id => {
        const lit = near.includes(id);
        return <Line key={id} x1={x(elo[id])} y1={y - (lit ? 6 : 4)} x2={x(elo[id])} y2={y + (lit ? 6 : 4)}
          stroke={lit ? C.dim : CHART.axis} strokeWidth={lit ? 2 : 1} />;
      })}
      <SvgText fontFamily={CHART.font} x={x(elo[first])} y={y + 8 + TYPE.caption} fontSize={TYPE.caption} fill={C.dim} textAnchor="start">{names[first]}</SvgText>
      <SvgText fontFamily={CHART.font} x={x(elo[last])} y={y + 8 + TYPE.caption} fontSize={TYPE.caption} fill={C.dim} textAnchor="end">{names[last]}</SvgText>
      <Circle cx={x(rating)} cy={y} r={5} fill={CHART.focus} stroke={CHART.ring} strokeWidth={2} />
    </Svg>
  );
}
