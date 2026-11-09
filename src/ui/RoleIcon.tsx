// Значки стола, нарисованные кодом (docs/13-art.md, §1; docs/09-game-design.md, «Живой стол»): кто ходит — стрелка к
// столу, кто отбивается — щит (без оружия), чья очередь подкидывать — плюс, порядок руки — две масти или ступеньки. Различаются формой, не только
// цветом; слово — их голос для чтения с экрана (подпись ставит тот, кто значок показывает).
import React from 'react';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { C } from './theme';

export type Role = 'attack' | 'defend' | 'throw';

const HEART = 'M5 9 C2 6.5 0.5 5 0.5 3.2 C0.5 1.8 1.6 0.8 2.9 0.8 C3.8 0.8 4.6 1.3 5 2 C5.4 1.3 6.2 0.8 7.1 0.8 C8.4 0.8 9.5 1.8 9.5 3.2 C9.5 5 8 6.5 5 9 Z';
const DIAMOND = 'M5 0.5 L9 5 L5 9.5 L1 5 Z';

/** Роль места на плашке: 14 точек золотом по умолчанию. */
export function RoleIcon({ role, size = 14, color = C.accent }: { role: Role; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      {role === 'attack' ? (
        // стрелка вниз — к столу: плашки соперников стоят над сукном
        <Path d="M10 2.5 V15.5 M4.5 10.5 L10 16 L15.5 10.5" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ) : role === 'throw' ? (
        // плюс — «добавить карту»: очередь подкидывать
        <Path d="M10 3.5 V16.5 M3.5 10 H16.5" stroke={color} strokeWidth={2.8} strokeLinecap="round" fill="none" />
      ) : (
        <Path d="M10 2 L16.5 4.6 V9.6 C16.5 13.6 13.8 16.6 10 18 C6.2 16.6 3.5 13.6 3.5 9.6 V4.6 Z" fill={color} />
      )}
    </Svg>
  );
}

/** Порядок руки на кнопке у руки: «по мастям» — черва и бубна, «по старшинству» — три ступеньки. */
export function HandOrderIcon({ order, size = 20, color = C.text }: { order: 'suit' | 'rank'; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      {order === 'suit' ? (
        <G>
          <G transform="translate(0.5 5)"><Path d={HEART} fill={color} /></G>
          <G transform="translate(10 5)"><Path d={DIAMOND} fill={color} /></G>
        </G>
      ) : (
        <G>
          <Rect x={2} y={12} width={4} height={5} rx={1} fill={color} />
          <Rect x={8} y={8} width={4} height={9} rx={1} fill={color} />
          <Rect x={14} y={3} width={4} height={14} rx={1} fill={color} />
        </G>
      )}
    </Svg>
  );
}
