// Стол разбора (docs/09-game-design.md, «Итог партии и разбор»): позиция перед решением — наблюдение места игрока
// (`positionAt`, ADR 0005), тем же холстом, что в партии, без полёта и касаний. Поверх — метки хода формой, цветом и
// словом (`markOf`): «Сыграно» — штриховая светлая рамка, «Лучше» — карта приподнята и в сплошной золотой рамке;
// «Беру», «Пас», «Бито» — плашкой под сукном, где в партии кнопки.
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useFont } from '@shopify/react-native-skia';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import { suitOf, throwerSeen } from '../engine';
import type { Card, Observation } from '../engine';
import type { Level } from '../bot';
import { T } from '../i18n';
import { useBack } from '../money';
import { TableCanvas } from '../render/TableCanvas';
import { layoutTable, PLATE, plateOf } from '../render/layout';
import type { Layout, Sprite } from '../render/layout';
import { useSettings } from '../state/store';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';
import { plateLines, roleOf, SeatPlate } from './SeatPlate';
import { reviewLayout } from './review';
import { rivalsOf } from './rivals';
import type { RivalId } from './rivals';
import { withRival } from './path';
import type { MarkKind, ReviewMarks } from './review';

/** Рамка метки снаружи карты: «Лучше» — ближе, «Сыграно» — дальше, чтобы у карты с обеими метками были видны обе. */
const OUT: Record<MarkKind, number> = { best: 3, played: 8 };
const LABEL_W = 96, LABEL_H = 22;
const NOOP = () => {};
const TOUCH = { onCard: NOOP, onTableCard: NOOP, onDrop: () => false };

function Frame({ s, l, kind }: { s: Sprite; l: Layout; kind: MarkKind }) {
  const pad = OUT[kind];
  const w = l.cw * s.scale + pad * 2, h = l.ch * s.scale + pad * 2;
  return (
    <View pointerEvents="none" testID={`mark-${kind}-${s.card}`}
      style={[kind === 'best' ? styles.best : styles.played, {
        left: s.x - w / 2, top: s.y - h / 2, width: w, height: h,
        borderRadius: RADIUS.playing + pad, transform: [{ rotate: `${s.rot}deg` }],
      }]} />
  );
}

/** `levels` — уровни ботов партии по местам: по ним на плашках те же имена и портреты, что были за столом. */
export function ReviewBoard({ o, marks, levels, rival }: { o: Observation; marks: ReviewMarks; levels: readonly Level[]; rival?: RivalId }) {
  const settings = useSettings();
  const back = useBack();
  const { fontScale } = useWindowDimensions();
  // партия матча «Пути к Мастеру» — соперник на месте 1 тот, с кем матч (src/game/path.ts)
  const rivals = useMemo(() => withRival(rivalsOf(levels), rival), [levels, rival]);
  // подпись «Сыграно» / «Лучше» растёт с шрифтом телефона до ×1,3 (13-art.md, §3): ряд подписей — по её высоте
  const labelH = Math.ceil(LABEL_H * Math.min(PLATE.maxScale, Math.max(1, fontScale)));
  const font = useFont(Onest_700Bold, 15);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  // плашка — как в партии: портрет, имя, уровень, число карт
  const plate = plateOf(size?.width ?? 412, o.seats - 1, plateLines(2), fontScale, true);
  const plateH = plate.h;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.width - width) > 1 || Math.abs(size.height - height) > 1) setSize({ width, height });
  };
  const layout = useMemo(() => (size
    ? reviewLayout(layoutTable(o, { ...size, order: settings.handOrder, picked: null, targets: [], showOpenly: settings.memoryAid, straight: settings.straightHand, plate: plateH }),
      marks.hand.filter(m => m.kinds.includes('best')).map(m => m.card), marks.hand.map(m => m.card))
    : null), [o, marks, size, settings.handOrder, settings.memoryAid, settings.straightHand, plateH]);

  const sprite = (c: Card) => layout?.sprites.find(s => s.key === `c${c}`);
  // подписи над картами руки: по одной на ход, над серединой его карт и выше всех отмеченных карт (приподнятая
  // «Лучше» не закрывает «Сыграно»); две подписи рядом — «Лучше» над «Сыграно»
  const labels: { kind: MarkKind; x: number; y: number }[] = [];
  const marked = layout ? marks.hand.map(m => sprite(m.card)).filter((s): s is Sprite => !!s) : [];
  const top = layout && marked.length ? Math.min(...marked.map(s => s.y)) - layout.ch / 2 - OUT.played - labelH - SPACE.xs : 0;
  for (const kind of layout ? (['played', 'best'] as const) : []) {
    const ss = marks.hand.filter(m => m.kinds.includes(kind)).map(m => sprite(m.card)).filter((s): s is Sprite => !!s);
    if (!ss.length) continue;
    const x = Math.max(0, Math.min((size?.width ?? 0) - LABEL_W, ss.reduce((a, s) => a + s.x, 0) / ss.length - LABEL_W / 2));
    const prev = labels[0];
    labels.push({ kind, x, y: prev && Math.abs(prev.x - x) < LABEL_W ? top - labelH - SPACE.xs : top });
  }

  const others = layout ? layout.opponents : [];
  const oppW = plate.w;
  const chipText = (c: ReviewMarks['chips'][number]) =>
    T.review.chip(c.kind === 'best' ? T.review.markBest : T.review.markPlayed, c.action === 'take' ? T.game.take : c.done ? T.game.done : T.game.pass);

  return (
    <View style={styles.area} onLayout={onLayout} testID="review-table" accessibilityLabel={T.review.table}>
      {layout && font ? (
        <TableCanvas layout={layout} font={font} fourColor={settings.fourColor} back={back} less
          hand={o.hand} table={o.table} enabled={false} touch={TOUCH} />
      ) : null}
      {layout ? others.map(p => (
        <SeatPlate key={p.seat} testID={`review-opp-${p.seat}`} name={rivals[p.seat] ? T.rival[rivals[p.seat]!.id] : ''} rival={rivals[p.seat]} face={plate.face}
          lines={[...(rivals[p.seat] ? [T.rivals.level(rivals[p.seat]!.level)] : []), o.out.includes(p.seat) ? (rivals[p.seat]?.she ? T.game.outShe : T.game.out) : T.game.cards(o.handSizes[p.seat])]}
          cards={o.out.includes(p.seat) ? undefined : o.handSizes[p.seat]}
          role={roleOf(o, p.seat, throwerSeen(o))}
          active={o.phase !== 'end' && (o.attacker === p.seat || o.defender === p.seat || throwerSeen(o) === p.seat)}
          left={p.x - oppW / 2} width={oppW} top={layout.plate.top} height={layout.plate.height} />
      )) : null}
      {layout ? (
        <Text pointerEvents="none" style={[styles.talon, o.talonSize > 0 ? { left: layout.talonLabel.x, top: layout.talonLabel.y - 9 } : { left: layout.table.x + SPACE.s, top: layout.talon.y - 9 }]}>
          {o.talonSize > 0 ? T.game.talon(o.talonSize) : T.game.trumpIs(T.suits[suitOf(o.trump)])}
        </Text>
      ) : null}
      {layout ? marks.table.flatMap(m => m.kinds.map(k => {
        const s = sprite(m.card);
        return s ? <Frame key={`t${k}${m.card}`} s={s} l={layout} kind={k} /> : null;
      })) : null}
      {layout ? marks.hand.flatMap(m => m.kinds.map(k => {
        const s = sprite(m.card);
        return s ? <Frame key={`h${k}${m.card}`} s={s} l={layout} kind={k} /> : null;
      })) : null}
      {labels.map(lb => (
        <View key={lb.kind} pointerEvents="none" style={[styles.labelBox, { left: lb.x, top: lb.y }]}>
          <Text style={[styles.label, lb.kind === 'best' ? styles.labelBest : styles.labelPlayed]} testID={`mark-label-${lb.kind}`} maxFontSizeMultiplier={PLATE.maxScale}>
            {lb.kind === 'best' ? T.review.markBest : T.review.markPlayed}
          </Text>
        </View>
      ))}
      {layout && marks.chips.length ? (
        <View pointerEvents="none" style={[styles.chips, { top: layout.felt.y + layout.felt.h + SPACE.s }]}>
          {marks.chips.map(c => (
            <Text key={c.kind} style={[styles.chip, c.kind === 'best' ? styles.chipBest : styles.chipPlayed]} testID={`mark-chip-${c.kind}`}>{chipText(c)}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  area: { flex: 1 },
  talon: { position: 'absolute', width: 96, color: C.dim, fontSize: TYPE.caption },
  // «Сыграно» — штрих светлым, «Лучше» — сплошное золото: различимы формой, не только цветом
  played: { position: 'absolute', borderWidth: 2, borderStyle: 'dashed', borderColor: C.text },
  best: { position: 'absolute', borderWidth: 3, borderColor: C.accent },
  labelBox: { position: 'absolute', width: LABEL_W, alignItems: 'center' },
  label: { fontSize: TYPE.caption, fontWeight: '700', paddingHorizontal: SPACE.s, borderRadius: RADIUS.small, overflow: 'hidden', lineHeight: LABEL_H - 2 },
  labelPlayed: { color: C.text, backgroundColor: C.sheet, borderWidth: 1, borderStyle: 'dashed', borderColor: C.text },
  labelBest: { color: C.accentText, backgroundColor: C.accent },
  chips: { position: 'absolute', right: SPACE.s, flexDirection: 'row', gap: SPACE.s },
  chip: {
    fontSize: TYPE.body, fontWeight: '700', paddingHorizontal: SPACE.l, paddingVertical: SPACE.s, borderRadius: RADIUS.pill, overflow: 'hidden',
  },
  chipPlayed: { color: C.text, backgroundColor: C.sheet, borderWidth: 2, borderStyle: 'dashed', borderColor: C.text },
  chipBest: { color: C.accentText, backgroundColor: C.accent, borderWidth: 2, borderColor: C.accent },
});
