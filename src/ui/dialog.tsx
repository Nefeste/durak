// из nardy: src/ui/dialog.tsx @ 1d2bdff (из votchina) — портрет: кнопки в столбик.
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './Button';
import { C, HEAD, RADIUS } from './theme';
import { T } from '../i18n';

export interface DialogAction { label: string; kind?: 'main' | 'ghost'; testID?: string; onPress?: () => void }
export interface DialogSpec {
  title: string;
  text?: string;
  actions: DialogAction[];
  /** последняя кнопка во всю ширину (обычно «Отмена») */
  cancel?: string;
}

export function Dialog({ spec, onClose }: { spec: DialogSpec | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  if (!spec) return null;
  const run = (a: DialogAction) => { onClose(); a.onPress?.(); };
  // больше трёх кнопок — в две колонки: экран альбомный, высоты мало (меню партии)
  const grid = spec.actions.length > 3;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.center} pointerEvents="box-none">
        <View style={[styles.box, { marginBottom: insets.bottom }]} testID="dialog">
          <Text style={styles.title} maxFontSizeMultiplier={1.3}>{spec.title}</Text>
          {spec.text ? <Text style={styles.text} maxFontSizeMultiplier={1.3}>{spec.text}</Text> : null}
          <View style={[styles.actions, grid && styles.grid]}>
            {spec.actions.map(a => (
              <View key={a.label} style={grid ? styles.cell : null}>
                <Button testID={a.testID} label={a.label} kind={a.kind ?? 'main'} onPress={() => run(a)} />
              </View>
            ))}
            {/* «Вернуться» — в той же сетке: без пары занимает весь ряд, а не ширину своей подписи */}
            <View style={grid ? styles.cell : null}>
              <Button testID="dialog-cancel" label={spec.cancel ?? T.dialog.cancel} kind="ghost" onPress={onClose} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(2,8,10,0.62)' },
  center: { flex: 1, justifyContent: 'center', padding: 22 },
  box: { width: '100%', maxWidth: 520, alignSelf: 'center', borderRadius: RADIUS.card, padding: 20, gap: 8, backgroundColor: C.sheet, borderWidth: 1, borderColor: C.line },
  title: { color: C.accent, fontSize: 19, fontWeight: '700', fontFamily: HEAD },
  text: { color: C.dim, fontSize: 15, lineHeight: 21 },
  actions: { gap: 8, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '48%', flexGrow: 1 },
});
