// Карта, нарисованная кодом (ADR 0010): лицо — индекс в углах и большая масть, рубашка — орнамент
// клеткой. Этап А — компоненты React Native; один холст Skia на стол — этап Б (docs/02-architecture.md).
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { rankOf, suitOf } from '../engine';
import type { Card } from '../engine';
import { T } from '../i18n';
import { C, RADIUS } from '../ui/theme';

const SUIT = ['♠', '♣', '♦', '♥'];
const isRed = (c: Card) => suitOf(c) >= 2;

export const CARD_W = 62;
export const CARD_H = 88;

export function PlayingCard({ card, onPress, raised, dim, testID, small }: {
  card: Card; onPress?: () => void; raised?: boolean; dim?: boolean; testID?: string; small?: boolean;
}) {
  const color = isRed(card) ? C.red : C.black;
  const label = `${T.ranks[rankOf(card)]}${SUIT[suitOf(card)]}`;
  const body = (
    <View style={[styles.face, small && styles.small, raised && styles.raised, dim && styles.dim]}>
      <Text style={[styles.index, { color }]}>{T.ranks[rankOf(card)]}</Text>
      <Text style={[styles.indexSuit, { color }]}>{SUIT[suitOf(card)]}</Text>
      <Text style={[styles.big, small && styles.bigSmall, { color }]}>{SUIT[suitOf(card)]}</Text>
    </View>
  );
  if (!onPress) return <View testID={testID} accessibilityLabel={label}>{body}</View>;
  return <Pressable testID={testID} accessibilityLabel={label} accessibilityRole="button" onPress={onPress}>{body}</Pressable>;
}

export function CardBack({ small }: { small?: boolean }) {
  return (
    <View style={[styles.back, small && styles.small]}>
      <View style={styles.backInner} />
    </View>
  );
}

const styles = StyleSheet.create({
  face: { width: CARD_W, height: CARD_H, borderRadius: RADIUS.playing, backgroundColor: C.face, borderWidth: 1, borderColor: C.faceLine, padding: 5 },
  small: { width: 40, height: 56 },
  raised: { transform: [{ translateY: -14 }], borderColor: C.accent, borderWidth: 2 },
  dim: { opacity: 0.45 },
  index: { fontSize: 17, fontWeight: '800', lineHeight: 18 },
  indexSuit: { fontSize: 14, lineHeight: 15 },
  big: { position: 'absolute', right: 6, bottom: 2, fontSize: 30 },
  bigSmall: { fontSize: 18, right: 4, bottom: 0 },
  back: { width: CARD_W, height: CARD_H, borderRadius: RADIUS.playing, backgroundColor: C.back, padding: 4, borderWidth: 1, borderColor: C.backLine },
  backInner: { flex: 1, borderRadius: 5, borderWidth: 1, borderColor: C.backLine, opacity: 0.7 },
});
