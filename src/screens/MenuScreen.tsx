// Главный экран: стол, число соперников и уровень — «Играть»; «Продолжить партию», если она
// сохранена; «Настройки».
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Variant } from '../engine';
import { LEVELS } from '../bot';
import type { Level } from '../bot';
import { T } from '../i18n';
import { Button } from '../ui/Button';
import { Chips } from '../ui/Chips';
import { C, RADIUS } from '../ui/theme';
import { CardBack } from '../render/PlayingCard';

export interface Choice { variant: Variant; bots: number; level: Level }

export function MenuScreen({ choice, onChange, onPlay, onResume, onSettings, onFriends, onQuick }: {
  choice: Choice; onChange: (c: Choice) => void; onPlay: () => void; onResume: (() => void) | null; onSettings: () => void;
  onFriends: () => void; onQuick: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]} testID="menu">
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
        <Chips id="level" items={LEVELS} value={choice.level} label={l => T.level[l]} onChange={level => onChange({ ...choice, level })} />
      </View>
      <View style={styles.actions}>
        {onResume ? <Button label={T.menu.resume} kind="ghost" onPress={onResume} testID="resume" /> : null}
        <Button label={T.menu.play} onPress={onPlay} testID="play" />
        <View style={styles.row}>
          <View style={styles.cell}><Button label={T.menu.friends} kind="ghost" onPress={onFriends} testID="friends-open" /></View>
          <View style={styles.cell}><Button label={T.menu.quick} kind="ghost" onPress={onQuick} testID="quick-open" /></View>
        </View>
        <Button label={T.menu.settings} kind="ghost" onPress={onSettings} testID="settings-open" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20, gap: 20, justifyContent: 'space-between' },
  head: { alignItems: 'center', gap: 6 },
  backs: { flexDirection: 'row', height: 100, marginBottom: 8 },
  tilt: { marginLeft: -30, transform: [{ rotate: '12deg' }] },
  title: { color: C.accent, fontSize: 40, fontWeight: '800' },
  tagline: { color: C.dim, fontSize: 16 },
  panel: { gap: 10, padding: 16, borderRadius: RADIUS.card, backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine },
  label: { color: C.dim, fontSize: 14, marginTop: 4 },
  actions: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1 },
});
