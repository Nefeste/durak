// Реплика за столом (docs/13-art.md, §1; docs/09-game-design.md, «Живой стол»): капсула поверх веера соперника или над
// рукой — «Пас», «Беру», «Бито», «Перевожу», «Подкидываю»; «думает…» — бледнее, стеклом. Проявляется 150 мс и гаснет
// 200 мс; с «Меньше движения» — просто появляется и пропадает. Надпись целиком, без обрезки (13-art.md, §3).
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';

export function Bubble({ text, x, y, quiet, less, testID }: {
  text: string; x: number; y: number;
  /** «думает…»: стекло и бледный текст. */
  quiet?: boolean;
  less: boolean; testID: string;
}) {
  // середина капсулы — в (x, y): капсула шириной по тексту стоит посередине полосы вокруг x
  return (
    <Animated.View pointerEvents="none" entering={less ? undefined : FadeIn.duration(150)} exiting={less ? undefined : FadeOut.duration(200)}
      style={[styles.lane, { left: x - LANE / 2, top: y - 16 }]}>
      <Text testID={testID} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3}
        style={[styles.bubble, quiet ? styles.quiet : styles.loud]}>{text}</Text>
    </Animated.View>
  );
}

const LANE = 200;

const styles = StyleSheet.create({
  lane: { position: 'absolute', width: LANE, alignItems: 'center' },
  bubble: {
    overflow: 'hidden', borderRadius: RADIUS.pill, borderWidth: 1, paddingHorizontal: SPACE.m, paddingVertical: SPACE.xs,
    fontSize: TYPE.body, lineHeight: 22, textAlign: 'center',
  },
  loud: { backgroundColor: C.sheet, borderColor: C.line, color: C.text, fontWeight: '700' },
  quiet: { backgroundColor: C.sheet, borderColor: C.glassLine, color: C.dim },
});
