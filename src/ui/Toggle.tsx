// «Вкл./выкл.» одной строкой: подпись слева, переключатель справа, пояснение ниже (аудит 08.11.2026, находка 8).
// Флажок — для согласий вроде «Мне есть 14 лет»: квадрат с галочкой слева от подписи. Оба — стекло и золото
// листа стиля (13-art.md), без системных переключателей: на Android и в браузере они выглядят по-разному.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, RADIUS, SPACE, TYPE } from './theme';

export function Toggle({ id, title, note, value, onChange }: {
  id: string; title: string; note?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <Pressable testID={id} accessibilityRole="switch" accessibilityState={{ checked: value }} aria-checked={value}
      accessibilityLabel={title} onPress={() => onChange(!value)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.line}>
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.track, value && styles.trackOn]}>
          <View style={[styles.knob, value && styles.knobOn]} />
        </View>
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </Pressable>
  );
}

export function Checkbox({ id, label, value, onChange }: { id: string; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable testID={id} accessibilityRole="checkbox" accessibilityState={{ checked: value }} aria-checked={value}
      onPress={() => onChange(!value)} style={({ pressed }) => [styles.check, pressed && styles.pressed]}>
      <View style={[styles.box, value && styles.boxOn]}>{value ? <Text style={styles.tick}>✓</Text> : null}</View>
      <Text style={styles.title}>{label}</Text>
    </Pressable>
  );
}

const TRACK_W = 48, TRACK_H = 28, KNOB = 22;
const styles = StyleSheet.create({
  row: { gap: SPACE.xs, minHeight: 48, justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  title: { flex: 1, color: C.text, fontSize: TYPE.body, fontWeight: '700' },
  note: { color: C.dim, fontSize: TYPE.caption },
  track: { width: TRACK_W, height: TRACK_H, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.glassLine, backgroundColor: C.glass, justifyContent: 'center' },
  trackOn: { borderColor: C.accent },
  knob: { width: KNOB, height: KNOB, borderRadius: RADIUS.pill, marginLeft: (TRACK_H - KNOB) / 2 - 1, backgroundColor: C.dim },
  knobOn: { marginLeft: TRACK_W - KNOB - (TRACK_H - KNOB) / 2 - 1, backgroundColor: C.accent },
  pressed: { opacity: 0.85 },
  check: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, minHeight: 48 },
  box: { width: 26, height: 26, borderRadius: RADIUS.playing, borderWidth: 2, borderColor: C.glassLine, alignItems: 'center', justifyContent: 'center' },
  boxOn: { borderColor: C.accent },
  tick: { color: C.accent, fontSize: TYPE.button, fontWeight: '800' },
});
