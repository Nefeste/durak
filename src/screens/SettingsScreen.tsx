// Настройки (docs/09-game-design.md, «Настройки»): звук, вибрация, «Меньше движения» (как в системе,
// пока игрок не выбрал сам — ADR устава 0023, правило 6), скорость ботов, порядок руки,
// четырёхцветная колода, «Помощь памяти (для учёбы)», персональная реклама (этап Е, как в «Нардах»).
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useInsets } from '../ui/insets';
import { T } from '../i18n';
import { Button } from '../ui/Button';
import { Chips } from '../ui/Chips';
import { Toggle } from '../ui/Toggle';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';
import { setSettings, useSettings } from '../state/store';
import { setPersonalAds } from '../money';

type Motion = 'system' | 'on' | 'off';

function Row({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{title}</Text>
      {children}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

export function SettingsScreen({ onBack, onReport }: { onBack: () => void; onReport: () => void }) {
  const insets = useInsets();
  const s = useSettings();
  const motion: Motion = s.lessMotion === undefined ? 'system' : s.lessMotion ? 'on' : 'off';
  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACE.l, paddingBottom: insets.bottom + SPACE.xl }]} testID="settings">
      <Text style={styles.title}>{T.settings.title}</Text>
      <View style={styles.panel}>
        <Row title={T.settings.lessMotion} note={T.settings.lessMotionNote}>
          <Chips id="motion" items={['system', 'on', 'off'] as const} value={motion}
            label={m => (m === 'system' ? T.settings.lessMotionSystem : m === 'on' ? T.settings.lessMotionOn : T.settings.lessMotionOff)}
            onChange={m => setSettings({ lessMotion: m === 'system' ? undefined : m === 'on' })} />
        </Row>
        <Toggle id="sound" title={T.settings.sound} value={s.sound} onChange={v => setSettings({ sound: v })} />
        <Toggle id="vibration" title={T.settings.vibration} value={s.vibration} onChange={v => setSettings({ vibration: v })} />
        <Row title={T.settings.botSpeed}>
          <Chips id="speed" items={['normal', 'fast'] as const} value={s.botSpeed} label={v => (v === 'normal' ? T.settings.botNormal : T.settings.botFast)} onChange={botSpeed => setSettings({ botSpeed })} />
        </Row>
        <Row title={T.settings.handOrder} note={T.settings.handOrderNote}>
          <Chips id="order" items={['suit', 'rank'] as const} value={s.handOrder} label={v => (v === 'suit' ? T.settings.bySuit : T.settings.byRank)} onChange={handOrder => setSettings({ handOrder })} />
        </Row>
        <Toggle id="four" title={T.settings.fourColor} note={T.settings.fourColorNote} value={s.fourColor} onChange={v => setSettings({ fourColor: v })} />
        <Toggle id="memory" title={T.settings.memoryAid} note={T.settings.memoryAidNote} value={s.memoryAid} onChange={v => setSettings({ memoryAid: v })} />
        <Toggle id="personal-ads" title={T.settings.personalAds} note={T.settings.personalAdsNote} value={s.personalAds} onChange={v => { setSettings({ personalAds: v }); setPersonalAds(v); }} />
      </View>
      <Button label={T.settings.report} kind="ghost" onPress={onReport} testID="report" />
      <Button label={T.settings.back} onPress={onBack} testID="settings-back" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: SPACE.l, gap: SPACE.l },
  title: { color: C.text, fontSize: TYPE.title, fontWeight: '800' },
  panel: { gap: SPACE.l, padding: SPACE.l, borderRadius: RADIUS.panel, backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine },
  row: { gap: SPACE.s },
  label: { color: C.text, fontSize: TYPE.body, fontWeight: '700' },
  note: { color: C.dim, fontSize: TYPE.caption },
});
