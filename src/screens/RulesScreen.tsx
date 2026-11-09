// «Правила» своими словами с картинками (docs/specs/2026-11-v1.md, «Обёртка»; docs/09-game-design.md, «Первая
// партия»): пересказ docs/08-rules.md по разделам, у каждого — пример из карт тем же рисунком, что за столом.
// Открывается из меню и из окна «Что такое перевод» (сразу на разделе «Перевод»).
import { Glass } from '../ui/Glass';
import React, { useEffect, useRef } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useInsets } from '../ui/insets';
import { RULES_SECTIONS, T } from '../i18n';
import type { RulesSection } from '../i18n';
import { Header } from '../ui/Header';
import { C, SPACE, TYPE } from '../ui/theme';
import { CardPicture } from '../render/CardPicture';
import { RULES_PICTURES } from '../game/rulesPictures';

/** Шире этого колонка не растёт: на планшете и в браузере строки не тянутся во весь экран. */
const MAX_W = 560;

export function RulesScreen({ onBack, section }: { onBack: () => void; section?: RulesSection }) {
  const insets = useInsets();
  const { width } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const at = useRef<Partial<Record<RulesSection, number>>>({});
  /** Игрок сам тронул прокрутку — больше не подводим к разделу. */
  const touched = useRef(false);
  // открыт поверх партии — системное «Назад» возвращает к столу, а не в меню
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => sub.remove();
  }, [onBack]);
  const col = Math.min(width, MAX_W) - SPACE.l * 2;
  const pic = col - SPACE.l * 2;
  const onSection = (key: RulesSection) => (e: LayoutChangeEvent) => {
    at.current[key] = e.nativeEvent.layout.y;
    // раздел съезжает, пока картинки выше меряют свои подписи (13-art.md, §3): подводим к нему заново, пока игрок не тронул
    // прокрутку сам
    if (key === section && !touched.current) {
      // после раскладки: иначе прокрутка в вебе упирается в ещё не выросшую высоту
      setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, (at.current[key] ?? 0) - SPACE.s), animated: false }), 0);
    }
  };
  return (
    <ScrollView ref={scroll} style={styles.root} testID="rules" onScrollBeginDrag={() => { touched.current = true; }}
      contentContainerStyle={[styles.content, { width: col + SPACE.l * 2, paddingTop: insets.top + SPACE.l, paddingBottom: insets.bottom + SPACE.xl }]}>
      <Header title={T.rules.title} back={T.rules.back} onBack={onBack} backTestID="rules-back" />
      <Text style={styles.intro}>{T.rules.intro}</Text>
      {RULES_SECTIONS.map(key => {
        const s = T.rules.sections[key];
        const slots = RULES_PICTURES[key];
        const labels = (T.rules.pictures as Partial<Record<RulesSection, string[]>>)[key];
        return (
          <Glass key={key} style={[styles.panel, key === section && styles.focus]} onLayout={onSection(key)} testID={`rules-${key}`}>
            <Text style={styles.title} accessibilityRole="header">{s.title}</Text>
            <Text style={styles.text}>{s.text}</Text>
            {slots ? <CardPicture spec={{ slots, labels }} width={pic} testID={`rules-picture-${key}`} /> : null}
          </Glass>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { alignSelf: 'center', paddingHorizontal: SPACE.l, gap: SPACE.l },
  intro: { color: C.dim, fontSize: TYPE.body, lineHeight: 21 },
  panel: { gap: SPACE.m, padding: SPACE.l,  },
  focus: { borderColor: C.accent },
  title: { color: C.text, fontSize: TYPE.section, fontWeight: '700' },
  text: { color: C.text, fontSize: TYPE.body, lineHeight: 22 },
});
