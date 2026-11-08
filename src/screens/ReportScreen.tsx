// Отчёт об ошибке (как в «Нардах»): игрок видит текст целиком и отправляет его сам — «Поделиться».
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import { T } from '../i18n';
import { Button } from '../ui/Button';
import { C, RADIUS } from '../ui/theme';
import { readCrashlog } from '../state/crashlog';
import type { CrashEntry } from '../state/crashlog';
import { buildReport } from '../state/report';
import { loadJson, KEYS } from '../state/storage';

export function ReportScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [what, setWhat] = useState('');
  const [log, setLog] = useState<CrashEntry[] | null>([]);
  const [game, setGame] = useState<string | null>(null);
  useEffect(() => {
    readCrashlog().then(setLog);
    loadJson<unknown>(KEYS.current).then(g => setGame(g ? JSON.stringify(g).slice(0, 3000) : null));
  }, []);
  const text = buildReport({
    what, version: Application.nativeApplicationVersion ?? 'web', build: Number(Application.nativeBuildVersion ?? 0),
    device: `${Platform.OS} ${String(Platform.Version ?? '')}`.trim(), lang: 'ru', screen: 'settings', game, log, labels: T.report.labels,
  });
  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]} testID="report-screen">
      <Text style={styles.title}>{T.report.title}</Text>
      <Text style={styles.label}>{T.report.what}</Text>
      <TextInput value={what} onChangeText={setWhat} placeholder={T.report.placeholder} placeholderTextColor={C.dim} multiline style={styles.input} testID="report-what" />
      <Text style={styles.note}>{T.report.note}</Text>
      <Text style={styles.preview} selectable>{text}</Text>
      <Button label={T.report.send} onPress={() => { Share.share({ message: text }).catch(() => {}); }} testID="report-send" />
      <Button label={T.settings.back} kind="ghost" onPress={onBack} testID="report-back" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 20, gap: 12 },
  title: { color: C.text, fontSize: 24, fontWeight: '800' },
  label: { color: C.text, fontSize: 16, fontWeight: '700' },
  input: { minHeight: 80, color: C.text, borderWidth: 1, borderColor: C.glassLine, borderRadius: RADIUS.card, padding: 12, fontSize: 15, textAlignVertical: 'top' },
  note: { color: C.dim, fontSize: 13 },
  preview: { color: C.dim, fontSize: 12, padding: 12, borderRadius: RADIUS.card, backgroundColor: C.glass },
});
