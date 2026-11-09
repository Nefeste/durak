// из nardy: src/ui/charts/Sparkline.tsx @ 1d2bdff — линия рейтинга в плитке: второстепенная — серая, 2 px; текущая
// точка — золотая, с кольцом цвета колодца. Осей нет: число — рядом крупно.
import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { CHART } from '../theme';
import { sparkPoints } from './geometry';

export function Sparkline({ values, width, height }: { values: readonly number[]; width: number; height: number }) {
  const pts = sparkPoints(values, width, height);
  if (pts.length < 2) return null;
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
  const end = pts[pts.length - 1];
  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={CHART.muted} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill="none" />
      <Circle cx={end.x} cy={end.y} r={4.5} fill={CHART.focus} stroke={CHART.ring} strokeWidth={2} />
    </Svg>
  );
}
