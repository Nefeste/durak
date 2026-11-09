// Места стола с друзьями схемой (docs/09-game-design.md, «Стол с друзьями»): как за столом у создателя — он внизу,
// остальные по часовой стрелке слева направо, как соперники над рукой. Свободное место и место бота можно выбрать
// («Сесть», «Пересесть»): бот уходит. Хозяин стола с ботами меняет уровень каждого бота строкой «‹ Средний ›»
// (ADR 0011: бот называется по уровню и подписан «бот»).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LEVELS } from '../bot';
import type { Level } from '../bot';
import { T } from '../i18n';
import { Button } from '../ui/Button';
import { breakable } from './SeatPlate';
import { Stepper } from '../ui/Stepper';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';
import { placeRows, whereOf } from './seats';

export interface Place { name: string; bot: Level | null; host: boolean; you: boolean }

export function SeatMap({ places, host, onSit, sitLabel, onLevel }: {
  places: (Place | null)[];
  /** Место создателя: оно внизу схемы. */
  host: number;
  /** Сесть на свободное место или место бота; нет — выбирать нельзя. */
  onSit?: (seat: number) => void;
  sitLabel?: string;
  /** Хозяин: уровень бота на месте. */
  onLevel?: (seat: number, level: Level) => void;
}) {
  const n = places.length;
  const wordOf = (seat: number) => { const w = whereOf(seat, host, n); return w ? T.online.where[w] : ''; };
  const tile = (seat: number) => {
    const p = places[seat];
    const title = !p ? T.online.emptySeat : p.bot ? T.online.botSeat(T.level[p.bot]) : p.you ? T.online.youSeat(p.name) : p.name;
    const note = p?.host ? T.online.hostSeat : wordOf(seat);
    return (
      <View key={seat} style={[styles.tile, p?.you && styles.mine]} testID={`lobby-seat-${seat}`}>
        <Text style={[styles.note, styles.center]}>{seat + 1} · {note}</Text>
        <Text style={[styles.name, styles.center, !p && styles.free]}>{p && !p.bot ? breakable(title) : title}</Text>
        {onSit && (!p || p.bot) ? <Button small kind="ghost" label={sitLabel ?? T.online.sit} onPress={() => onSit(seat)} testID={`sit-${seat}`} /> : null}
      </View>
    );
  };
  const bots = onLevel ? places.map((p, seat) => ({ p, seat })).filter(x => x.p?.bot) : [];
  return (
    <View style={styles.map} testID="seat-map">
      <View style={styles.felt}>
        {placeRows(host, n).map((row, i) => <View key={i} style={styles.row}>{row.map(tile)}</View>)}
      </View>
      {bots.length ? <Text style={styles.label}>{T.online.botLevels}</Text> : null}
      {bots.map(({ p, seat }) => (
        <View key={seat} style={styles.level}>
          <Text style={styles.note}>{T.online.seatN(seat + 1, wordOf(seat))}</Text>
          <Stepper<Level> id={`bot-level-${seat}`} items={LEVELS} value={p!.bot!} label={l => T.level[l]}
            prevLabel={T.menu.levelDown} nextLabel={T.menu.levelUp} onChange={l => onLevel!(seat, l)} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { gap: SPACE.s },
  felt: { gap: SPACE.s, padding: SPACE.s, borderRadius: RADIUS.panel, backgroundColor: C.felt },
  row: { flexDirection: 'row', justifyContent: 'center', gap: SPACE.s },
  tile: {
    flex: 1, maxWidth: 200, minHeight: 64, gap: SPACE.xs, padding: SPACE.s, borderRadius: RADIUS.small,
    backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine, alignItems: 'center', justifyContent: 'center',
  },
  mine: { borderColor: C.accent, borderWidth: 2 },
  name: { color: C.text, fontSize: TYPE.body, fontWeight: '700' },
  free: { color: C.dim, fontWeight: '400' },
  note: { color: C.dim, fontSize: TYPE.caption },
  label: { color: C.dim, fontSize: TYPE.caption, marginTop: SPACE.xs },
  level: { gap: SPACE.xs },
  // надписи места целиком (13-art.md, §3): длинное имя переносится, место становится выше
  center: { textAlign: 'center' },
});
