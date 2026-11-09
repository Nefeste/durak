// Отчёт об ошибке (как в «Нардах»): игрок видит текст целиком и отправляет его сам — «Поделиться». Запись открытой
// партии в отчёте — длинная строка JSON; на экране она свёрнута в одну строку «Партия: переводной, 4 места, 4 хода»
// и раскрывается касанием (аудит 08.11.2026, находка 15). В «Поделиться» уходит всё, как раньше.
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useInsets } from '../ui/insets';
import * as Application from 'expo-application';
import { T } from '../i18n';
import { Button } from '../ui/Button';
import { Header } from '../ui/Header';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';
import { readCrashlog } from '../state/crashlog';
import type { CrashEntry } from '../state/crashlog';
import { buildReport } from '../state/report';
import { loadJson, KEYS } from '../state/storage';
import type { Variant } from '../engine';

/** Строка свёрнутой партии из сохранённой записи; запись не та — честно «не прочиталась». */
function gameLine(g: unknown): string {
  const r = (g as { record?: { variant?: Variant; seats?: number; actions?: unknown[] } } | null)?.record;
  if (!r || (r.variant !== 'podkidnoy' && r.variant !== 'perevodnoy') || typeof r.seats !== 'number' || !Array.isArray(r.actions)) return T.report.gameUnknown;
  return T.report.gameLine(T.variant[r.variant], r.seats, r.actions.length);
}

export function ReportScreen({ onBack }: { onBack: () => void }) {
  const insets = useInsets();
  const [what, setWhat] = useState('');
  const [log, setLog] = useState<CrashEntry[] | null>([]);
  const [game, setGame] = useState<{ json: string; line: string } | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    readCrashlog().then(setLog);
    loadJson<unknown>(KEYS.current).then(g => setGame(g ? { json: JSON.stringify(g).slice(0, 3000), line: gameLine(g) } : null));
  }, []);
  const input = {
    what, version: Application.nativeApplicationVersion ?? 'web', build: Number(Application.nativeBuildVersion ?? 0),
    device: `${Platform.OS} ${String(Platform.Version ?? '')}`.trim(), lang: 'ru', screen: 'settings', log, labels: T.report.labels,
  };
  const text = buildReport({ ...input, game: game?.json ?? null });
  // на экране — тот же отчёт без записи партии; партия — свёрнутой строкой там, где она стоит в отчёте (перед журналом)
  const shown = buildReport({ ...input, game: null });
  const cut = shown.lastIndexOf(`${T.report.labels.log}:`);
  const head = cut > 0 ? shown.slice(0, cut).trimEnd() : shown, tail = cut > 0 ? shown.slice(cut) : '';
  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACE.l, paddingBottom: insets.bottom + SPACE.xl }]} testID="report-screen">
      <Header title={T.report.title} back={T.settings.back} onBack={onBack} backTestID="report-back" />
      <Text style={styles.label}>{T.report.what}</Text>
      <TextInput value={what} onChangeText={setWhat} placeholder={T.report.placeholder} placeholderTextColor={C.dim} multiline style={styles.input} testID="report-what" />
      <Text style={styles.note}>{T.report.note}</Text>
      <View style={styles.preview} testID="report-preview">
        <Text style={styles.text} selectable>{head}</Text>
        {game ? (
          <View style={styles.game}>
            <Pressable onPress={() => setOpen(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} testID="report-game"
              style={({ pressed }) => [styles.gameRow, pressed && styles.pressed]}>
              <Text style={styles.gameLine}>{game.line}</Text>
              <Text style={styles.gameToggle}>{open ? T.report.gameClose : T.report.gameOpen}</Text>
            </Pressable>
            {open ? <Text style={styles.mono} selectable testID="report-game-json">{game.json}</Text> : null}
          </View>
        ) : null}
        {tail ? <Text style={styles.text} selectable>{tail}</Text> : null}
      </View>
      <Button label={T.report.send} onPress={() => { Share.share({ message: text }).catch(() => {}); }} testID="report-send" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: SPACE.l, gap: SPACE.m },
  label: { color: C.text, fontSize: TYPE.body, fontWeight: '700' },
  input: { minHeight: 80, color: C.text, borderWidth: 1, borderColor: C.glassLine, borderRadius: RADIUS.panel, padding: SPACE.m, fontSize: TYPE.body, textAlignVertical: 'top' },
  note: { color: C.dim, fontSize: TYPE.caption },
  preview: { gap: SPACE.m, padding: SPACE.m, borderRadius: RADIUS.panel, backgroundColor: C.glass },
  text: { color: C.dim, fontSize: TYPE.caption, lineHeight: 18 },
  game: { gap: SPACE.s },
  gameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, minHeight: 48, paddingHorizontal: SPACE.m, borderRadius: RADIUS.small, borderWidth: 1, borderColor: C.glassLine },
  gameLine: { flex: 1, color: C.text, fontSize: TYPE.caption, fontWeight: '700' },
  gameToggle: { color: C.accent, fontSize: TYPE.caption },
  pressed: { opacity: 0.85 },
  mono: { color: C.dim, fontSize: TYPE.caption, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
