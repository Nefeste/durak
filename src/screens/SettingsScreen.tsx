// Настройки (docs/09-game-design.md, «Настройки»): звук, вибрация, «Меньше движения» (как в системе,
// пока игрок не выбрал сам — ADR устава 0023, правило 6), скорость ботов, порядок руки, «Подкидывать»,
// четырёхцветная колода, «Помощь памяти (для учёбы)», персональная реклама (этап Е, как в «Нардах»).
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useInsets } from '../ui/insets';
import { T } from '../i18n';
import { Button } from '../ui/Button';
import { Glass } from '../ui/Glass';
import { Header } from '../ui/Header';
import { Chips } from '../ui/Chips';
import { Toggle } from '../ui/Toggle';
import { C, SPACE, TYPE } from '../ui/theme';
import { setSettings, useSettings } from '../state/store';
import { setPersonalAds } from '../money';
import { APP_VERSION } from '../version';

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

export function SettingsScreen({ onBack, onReport, onBench }: { onBack: () => void; onReport: () => void; onBench?: () => void }) {
  const insets = useInsets();
  const s = useSettings();
  const motion: Motion = s.lessMotion === undefined ? 'system' : s.lessMotion ? 'on' : 'off';
  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACE.l, paddingBottom: insets.bottom + SPACE.xl }]} testID="settings">
      <Header title={T.settings.title} back={T.settings.back} onBack={onBack} backTestID="settings-back" />
      <Glass style={styles.panel}>
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
        <Row title={T.settings.throwOrder} note={T.settings.throwOrderNote}>
          <Chips id="throw" items={['queue', 'free'] as const} value={s.throwOrder} label={v => (v === 'queue' ? T.settings.throwQueue : T.settings.throwFree)} onChange={throwOrder => setSettings({ throwOrder })} />
        </Row>
        <Toggle id="four" title={T.settings.fourColor} note={T.settings.fourColorNote} value={s.fourColor} onChange={v => setSettings({ fourColor: v })} />
        <Toggle id="memory" title={T.settings.memoryAid} note={T.settings.memoryAidNote} value={s.memoryAid} onChange={v => setSettings({ memoryAid: v })} />
        <Toggle id="newbie" title={T.settings.newbie} note={T.settings.newbieNote} value={s.newbie}
          onChange={v => setSettings(v ? { newbie: true, transferTold: false } : { newbie: false })} />
        <Toggle id="personal-ads" title={T.settings.personalAds} note={T.settings.personalAdsNote} value={s.personalAds} onChange={v => { setSettings({ personalAds: v }); setPersonalAds(v); }} />
      </Glass>
      <Button label={T.settings.report} kind="ghost" onPress={onReport} testID="report" />
      {/* скрытый вход в «Замер» (docs/06-testing.md): долгое нажатие на версию */}
      <Pressable onLongPress={onBench} delayLongPress={800} testID="version" accessibilityRole="text">
        <Text style={styles.version}>{T.settings.version(APP_VERSION)}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: SPACE.l, gap: SPACE.l },
  panel: { gap: SPACE.l, padding: SPACE.l,  },
  row: { gap: SPACE.s },
  label: { color: C.text, fontSize: TYPE.body, fontWeight: '700' },
  note: { color: C.dim, fontSize: TYPE.caption },
  version: { color: C.dim, fontSize: TYPE.caption, textAlign: 'center', paddingVertical: SPACE.s },
});
