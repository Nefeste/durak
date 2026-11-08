// Главный экран (этап А): стол, число соперников и уровень — и «Играть».
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Variant } from '../engine';
import { LEVELS } from '../bot';
import type { Level } from '../bot';
import { T } from '../i18n';
import { Button } from '../ui/Button';
import { C, RADIUS } from '../ui/theme';
import { CardBack } from '../render/PlayingCard';

export interface Choice { variant: Variant; bots: number; level: Level }

function Chips<V extends string | number>({ items, value, label, onChange, id }: {
  items: V[]; value: V; label: (v: V) => string; onChange: (v: V) => void; id: string;
}) {
  return (
    <View style={styles.chips}>
      {items.map(v => (
        <Pressable key={String(v)} testID={`${id}-${v}`} accessibilityRole="button" accessibilityState={{ selected: v === value }}
          onPress={() => onChange(v)} style={[styles.chip, v === value && styles.chipOn]}>
          <Text style={[styles.chipText, v === value && styles.chipTextOn]}>{label(v)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function MenuScreen({ choice, onChange, onPlay }: { choice: Choice; onChange: (c: Choice) => void; onPlay: () => void }) {
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
      <Button label={T.menu.play} onPress={onPlay} testID="play" />
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: C.glassLine },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.text, fontSize: 15 },
  chipTextOn: { color: C.accentText, fontWeight: '700' },
});
