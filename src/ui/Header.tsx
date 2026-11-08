// Шапка экрана — одна на все экраны (аудит 08.11.2026, находка 9; лист стиля 13-art.md §3): «Назад» вверху слева
// маленькой стеклянной кнопкой, справа — одно необязательное действие, ниже — заголовок 28, 700, цвет текста.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { C, SPACE, TOP_BAR, TYPE } from './theme';

export function Header({ title, back, onBack, backTestID, right }: {
  title: string; back: string; onBack: () => void; backTestID: string; right?: React.ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Button small kind="ghost" label={back} onPress={onBack} testID={backTestID} />
        {right ?? null}
      </View>
      <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.s },
  bar: { height: TOP_BAR, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: C.text, fontSize: TYPE.title, fontWeight: '700' },
});
