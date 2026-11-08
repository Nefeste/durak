// Главный экран: стол, число соперников и уровень — «Играть»; «Продолжить партию», если она
// сохранена; «С друзьями», «Быстрая игра», «Магазин», «Настройки».
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useInsets } from '../ui/insets';
import type { Variant } from '../engine';
import { LEVELS, LOCKED_LEVEL } from '../bot';
import type { Level } from '../bot';
import { T } from '../i18n';
import { Button } from '../ui/Button';
import { Chips } from '../ui/Chips';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';
import { CardBack } from '../render/PlayingCard';

export interface Choice { variant: Variant; bots: number; level: Level }

export function MenuScreen({ choice, onChange, onPlay, onResume, onSettings, onFriends, onQuick, onStore, onPuzzle, onStats }: {
  choice: Choice; onChange: (c: Choice) => void; onPlay: () => void; onResume: (() => void) | null; onSettings: () => void;
  onFriends: () => void; onQuick: () => void; onStore: () => void; onPuzzle: () => void; onStats: () => void;
}) {
  const insets = useInsets();
  const [lockedNote, setLockedNote] = useState(false);
  return (
    // прокрутка: на невысоком экране или с крупным шрифтом нижний ряд не уходит под кнопки телефона (0.5.1)
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACE.xl, paddingBottom: insets.bottom + SPACE.l }]} testID="menu">
      <View style={styles.head}>
        <View style={styles.backs}><CardBack /><View style={styles.tilt}><CardBack /></View></View>
        <Text style={styles.title}>{T.app.name}</Text>
        <Text style={styles.tagline}>{T.app.tagline}</Text>
      </View>
      <View style={styles.panel}>
        <Text style={styles.label}>{T.menu.variant}</Text>
        <Chips id="variant" items={['podkidnoy', 'perevodnoy'] as Variant[]} value={choice.variant} label={v => T.variant[v]} onChange={variant => onChange({ ...choice, variant })} />
        <Text style={styles.label}>{T.menu.opponents}</Text>
        <Chips id="bots" items={[1, 2, 3]} value={choice.bots} label={n => T.menu.bots(n)} onChange={bots => onChange({ ...choice, bots })} />
        <Text style={styles.label}>{T.menu.level}</Text>
        <Chips id="level" items={LEVELS} value={choice.level} label={l => T.level[l]} onChange={level => { setLockedNote(false); onChange({ ...choice, level }); }}
          locked={{ key: LOCKED_LEVEL, label: T.menu.lockedLevel, onPress: () => setLockedNote(v => !v) }} />
        {lockedNote ? <Text style={styles.note} testID="locked-note">{T.menu.lockedNote}</Text> : null}
      </View>
      <View style={styles.actions}>
        {onResume ? <Button label={T.menu.resume} kind="ghost" onPress={onResume} testID="resume" /> : null}
        <Button label={T.menu.play} onPress={onPlay} testID="play" />
        <View style={styles.row}>
          <View style={styles.cell}><Button label={T.menu.friends} kind="ghost" onPress={onFriends} testID="friends-open" /></View>
          <View style={styles.cell}><Button label={T.menu.quick} kind="ghost" onPress={onQuick} testID="quick-open" /></View>
        </View>
        <View style={styles.row}>
          <View style={styles.cell}><Button label={T.menu.puzzle} kind="ghost" onPress={onPuzzle} testID="puzzle-open" /></View>
          <View style={styles.cell}><Button label={T.menu.stats} kind="ghost" onPress={onStats} testID="stats-open" /></View>
        </View>
        <View style={styles.row}>
          <View style={styles.cell}><Button label={T.menu.store} kind="ghost" onPress={onStore} testID="store-open" /></View>
          <View style={styles.cell}><Button label={T.menu.settings} kind="ghost" onPress={onSettings} testID="settings-open" /></View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { flexGrow: 1, paddingHorizontal: SPACE.l, gap: SPACE.l, justifyContent: 'space-between' },
  head: { alignItems: 'center', gap: SPACE.s },
  backs: { flexDirection: 'row', height: 100, marginBottom: SPACE.s },
  tilt: { marginLeft: -30, transform: [{ rotate: '12deg' }] },
  title: { color: C.accent, fontSize: TYPE.display, fontWeight: '800' },
  tagline: { color: C.dim, fontSize: TYPE.body },
  panel: { gap: SPACE.m, padding: SPACE.l, borderRadius: RADIUS.panel, backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine },
  label: { color: C.dim, fontSize: TYPE.caption, marginTop: SPACE.xs },
  note: { color: C.dim, fontSize: TYPE.caption },
  actions: { gap: SPACE.m },
  row: { flexDirection: 'row', gap: SPACE.m },
  cell: { flex: 1 },
});
