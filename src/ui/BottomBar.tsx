// Главное действие экрана — закреплённой полосой внизу, над кнопками телефона (аудит 09.11.2026, находки 7 и 8; решение
// владельца 09.11.2026): «Играть» в меню и «Начать» в сборе стола всегда под большим пальцем, остальной экран
// прокручивается над полосой. Вид — как у листа итога: непрозрачный `sheet`, кромка стекла и блик сверху, скругление
// панели по верхним углам. Высоту полоса сообщает (`onHeight`): экран добавляет её к нижнему полю прокрутки, чтобы
// последний ряд вставал над полосой, а не под ней. Надписи внутри — целиком (13-art.md, §3): полоса растёт с ними.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { C, RADIUS, SPACE } from './theme';

export function BottomBar({ children, bottom, onHeight, testID }: {
  children: React.ReactNode;
  /** Отступ снизу от кнопок телефона (`useInsets().bottom`). */
  bottom: number;
  onHeight?: (h: number) => void;
  testID?: string;
}) {
  return (
    <View style={[styles.bar, { paddingBottom: bottom + SPACE.m }]} testID={testID}
      onLayout={e => onHeight?.(Math.ceil(e.nativeEvent.layout.height))}>
      <View pointerEvents="none" style={styles.shine} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, gap: SPACE.s, paddingTop: SPACE.m, paddingHorizontal: SPACE.l,
    borderTopLeftRadius: RADIUS.panel, borderTopRightRadius: RADIUS.panel, backgroundColor: C.sheet,
    borderWidth: 1, borderBottomWidth: 0, borderColor: C.glassLine, overflow: 'hidden',
  },
  /** блик по верхней кромке — свет лампы, как у листа итога */
  shine: { position: 'absolute', top: 0, left: RADIUS.panel, right: RADIUS.panel, height: 1, backgroundColor: C.shine },
});
