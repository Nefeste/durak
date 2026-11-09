// Колодец графика (как в «Нардах», docs/09-game-design.md, «Как оформлено»): тёмная подложка внутри стеклянной
// карточки, на которой проверена палитра (`CHART.ring`). Ширину графику даёт сам колодец, когда разложен.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { CHART, RADIUS, SPACE } from '../theme';

export function Well({ children, testID }: { children: (width: number) => React.ReactNode; testID?: string }) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.floor(e.nativeEvent.layout.width) - 2 * SPACE.m);
  return (
    <View style={styles.well} onLayout={onLayout} testID={testID}>
      {width > 0 ? children(width) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  well: { backgroundColor: CHART.well, borderRadius: RADIUS.small, padding: SPACE.m, gap: SPACE.s },
});
