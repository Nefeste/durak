// Стол на одном холсте Skia (docs/02-architecture.md, «Стол»): сукно и все карты — картинки из
// faces.ts на местах из layout.ts. Карта, которая сменила место, летит туда 180 мс (Reanimated:
// общие значения через .get()/.set()); с «Меньше движения» — сразу на месте (ADR устава 0023,
// правило 6). Касания — один обработчик на весь стол: касание карты руки, перетаскивание на
// стол или на карту атаки. Поверх — прозрачные «кнопки» карт для чтения с экрана и сценария.
import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { Canvas, Group, Picture } from '@shopify/react-native-skia';
import type { SkFont } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { Card } from '../engine';
import { nameOf } from '../engine';
import { makeFaces } from './faces';
import { makeFelt } from './felt';
import type { Faces } from './faces';
import { handCardAt, inTable, tableCardAt } from './layout';
import type { Layout, Sprite } from './layout';

/** Полёт карты, мс (docs/09-game-design.md, «Темп»). */
export const FLIGHT = 180;
/** Вся раздача, мс. */
export const DEAL = 1200;
/** Посадка карты после полёта: на миг чуть крупнее и садится, мс (docs/09-game-design.md, «Темп»). */
export const SETTLE = 120;
const SETTLE_SCALE = 1.05;

function CardSprite({ s, faces, delay, less, dragX, dragY, dragged, ch }: {
  s: Sprite; faces: Faces; delay: number; less: boolean; ch: number;
  dragX: SharedValue<number>; dragY: SharedValue<number>; dragged: boolean;
}) {
  // карта появилась — она прилетает из `from`; с «Меньше движения» сразу стоит на месте
  const start = less ? s : s.from;
  const x = useSharedValue(start.x), y = useSharedValue(start.y);
  const rot = useSharedValue(less ? s.rot : 0), sc = useSharedValue(s.scale);
  // откуда карта летит на этот раз: настоящий полёт (дальше высоты карты) кончается посадкой — на миг чуть крупнее
  // и садится; сдвиг веера на соседнее место — без неё («Темп», docs/09-game-design.md)
  const last = useRef({ x: start.x, y: start.y });
  useEffect(() => {
    const flight = Math.hypot(s.x - last.current.x, s.y - last.current.y) > ch;
    last.current = { x: s.x, y: s.y };
    const go = (v: SharedValue<number>, to: number) => {
      if (less) { v.set(to); return; }
      const t = withTiming(to, { duration: FLIGHT, easing: Easing.out(Easing.cubic) });
      v.set(delay > 0 ? withDelay(delay, t) : t);
    };
    go(x, s.x); go(y, s.y); go(rot, s.rot);
    if (less || !flight) { go(sc, s.scale); return; }
    const land = withSequence(
      withTiming(s.scale * SETTLE_SCALE, { duration: FLIGHT, easing: Easing.out(Easing.cubic) }),
      withTiming(s.scale, { duration: SETTLE, easing: Easing.out(Easing.cubic) }),
    );
    sc.set(delay > 0 ? withDelay(delay, land) : land);
  }, [s.x, s.y, s.rot, s.scale, less, delay, x, y, rot, sc, ch]);
  const transform = useDerivedValue(() => [
    { translateX: x.get() + (dragged ? dragX.get() : 0) },
    { translateY: y.get() + (dragged ? dragY.get() : 0) },
    { rotate: (rot.get() * Math.PI) / 180 },
    { scale: sc.get() },
  ]);
  return (
    <Group transform={transform}>
      <Picture picture={s.card === null ? faces.back : faces.face(s.card)} />
      {s.glow ? <Picture picture={faces.glow} /> : null}
    </Group>
  );
}

/** Видимые части карт руки и карты атаки на столе — прямоугольники для чтения с экрана и сценария. */
export function targets(l: Layout, hand: Card[], table: [Card, Card | null][]): { card: Card; inHand: boolean; x: number; y: number; w: number; h: number }[] {
  const { cw, ch } = l;
  const mine = l.sprites.filter(s => s.card !== null && s.key.startsWith('c') && hand.includes(s.card)).sort((a, b) => a.x - b.x);
  const out = mine.map((s, i) => {
    const next = mine[i + 1];
    const w = next ? Math.max(8, Math.min(cw, next.x - s.x)) : cw;
    return { card: s.card as Card, inHand: true, x: s.x - cw / 2, y: s.y - ch * 0.3, w, h: ch * 0.6 };
  });
  for (const [a] of table) {
    const s = l.sprites.find(x => x.key === `c${a}`);
    if (s) out.push({ card: a, inHand: false, x: s.x - cw * 0.45, y: s.y - ch * 0.45, w: cw * 0.5, h: ch * 0.4 });
  }
  return out;
}

export interface TableTouch {
  /** Касание карты руки. */
  onCard: (c: Card) => void;
  /** Касание карты атаки на столе. */
  onTableCard: (c: Card) => void;
  /** Карта руки брошена на стол: на карту атаки `on` или просто на стол. */
  onDrop: (c: Card, on: Card | null) => void;
}

export function TableCanvas({ layout, font, small, fourColor, less, hand, table, enabled, touch }: {
  layout: Layout; font: SkFont; small: SkFont; fourColor: boolean; less: boolean;
  hand: Card[]; table: [Card, Card | null][]; enabled: boolean; touch: TableTouch;
}) {
  const { cw, ch } = layout;
  const faces = useMemo(() => makeFaces(cw, ch, font, small, fourColor), [cw, ch, font, small, fourColor]);
  // сукно с бортом и светом лампы — одна картинка на размер стола (src/render/felt.ts)
  const { x: fx, y: fy, w: fw, h: fh } = layout.felt;
  const felt = useMemo(() => makeFelt({ x: fx, y: fy, w: fw, h: fh }, cw * 0.4), [fx, fy, fw, fh, cw]);
  // раздача: пока она идёт, появившиеся карты вылетают из колоды по очереди; позже новая карта
  // прилетает сразу (с места, откуда её положили, — `from` раскладки)
  const [dealing, setDealing] = React.useState(!less);
  useEffect(() => {
    const t = setTimeout(() => setDealing(false), DEAL + FLIGHT);
    return () => clearTimeout(t);
  }, []);
  const total = layout.sprites.length;
  const step = DEAL / Math.max(1, total);

  const dragX = useSharedValue(0), dragY = useSharedValue(0);
  const drag = useRef<{ card: Card; x0: number; y0: number; moved: boolean } | null>(null);
  const [dragCard, setDragCard] = React.useState<Card | null>(null);
  const pos = (e: GestureResponderEvent) => ({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY });
  const onGrant = (e: GestureResponderEvent) => {
    const p = pos(e);
    const c = handCardAt(layout, p.x, p.y, hand);
    drag.current = c === null ? null : { card: c, x0: p.x, y0: p.y, moved: false };
    if (c === null) {
      const t = tableCardAt(layout, p.x, p.y, table);
      if (t !== null) touch.onTableCard(t);
    }
  };
  const onMove = (e: GestureResponderEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = pos(e);
    const dx = p.x - d.x0, dy = p.y - d.y0;
    if (!d.moved && Math.hypot(dx, dy) > 10) { d.moved = true; setDragCard(d.card); }
    if (d.moved) { dragX.set(dx); dragY.set(dy); }
  };
  const onRelease = (e: GestureResponderEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) { touch.onCard(d.card); return; }
    const p = pos(e);
    dragX.set(0); dragY.set(0); setDragCard(null);
    if (inTable(layout, p.x, p.y)) touch.onDrop(d.card, tableCardAt(layout, p.x, p.y, table));
  };

  const ordered = useMemo(() => {
    const list = [...layout.sprites];
    if (dragCard !== null) {
      const i = list.findIndex(s => s.key === `c${dragCard}`);
      if (i >= 0) list.push(list.splice(i, 1)[0]);
    }
    return list;
  }, [layout, dragCard]);

  return (
    <View style={StyleSheet.absoluteFill}
      onStartShouldSetResponder={() => enabled}
      onMoveShouldSetResponder={() => enabled}
      onResponderGrant={onGrant} onResponderMove={onMove} onResponderRelease={onRelease}
      onResponderTerminate={() => { drag.current = null; dragX.set(0); dragY.set(0); setDragCard(null); }}
      testID="felt">
      <Canvas style={StyleSheet.absoluteFill}>
        <Picture picture={felt} />
        {ordered.map(s => (
          <CardSprite key={s.key} s={s} faces={faces} delay={dealing ? Math.round(s.z * step) : 0} less={less} ch={ch}
            dragX={dragX} dragY={dragY} dragged={dragCard !== null && s.key === `c${dragCard}`} />
        ))}
      </Canvas>
      {/* карты для чтения с экрана и для сценария: касание идёт в обработчик стола; у карты руки —
          видимая полоска до следующей карты веера */}
      {targets(layout, hand, table).map(t => (
        <View key={`a${t.card}`} pointerEvents="none" accessible accessibilityRole="button" accessibilityLabel={nameOf(t.card)}
          testID={t.inHand ? `hand-${t.card}` : `table-${t.card}`}
          style={{ position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h }} />
      ))}
    </View>
  );
}
