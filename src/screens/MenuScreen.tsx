// Главный экран: стол, число соперников и уровень — «Играть»; «Продолжить партию», если она
// сохранена; «С друзьями», «Быстрая игра», «Магазин», «Настройки». С двумя-тремя ботами — «Разные уровни»: строка
// «Бот N ‹ Любитель ›» у каждого бота (docs/09-game-design.md, «Боты за столом»).
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useInsets } from '../ui/insets';
import type { Variant } from '../engine';
import { LEVELS, LOCKED_LEVEL } from '../bot';
import type { Level } from '../bot';
import { T } from '../i18n';
import { Button } from '../ui/Button';
import { Chips } from '../ui/Chips';
import { Stepper } from '../ui/Stepper';
import { Toggle } from '../ui/Toggle';
import type { Choice } from '../state/settings';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';
import { CardBack } from '../render/PlayingCard';

export type { Choice } from '../state/settings';

export function MenuScreen({ choice, onChange, onPlay, onResume, onSettings, onFriends, onQuick, onStore, onPuzzle, onStats, onRules }: {
  choice: Choice; onChange: (c: Choice) => void; onPlay: () => void; onResume: (() => void) | null; onSettings: () => void;
  onFriends: () => void; onQuick: () => void; onStore: () => void; onPuzzle: () => void; onStats: () => void; onRules: () => void;
}) {
  const insets = useInsets();
  // закрытый седьмой уровень можно показать стрелкой, но не выбрать: пока он показан, «Играть» недоступна.
  // На какой строке он показан: 0 — общий уровень, N — бот N; `null` — нигде
  const [lockedAt, setLockedAt] = useState<number | null>(null);
  const onLocked = lockedAt !== null;
  const mixed = choice.mixed && choice.bots > 1;
  /** Строка уровня: 0 — общая на всех ботов, N — бота N. */
  const levelRow = (row: number) => {
    const value = row === 0 ? choice.level : choice.levels[row - 1];
    const set = (l: Level) => row === 0 ? onChange({ ...choice, level: l }) : onChange({ ...choice, levels: choice.levels.map((x, i) => (i === row - 1 ? l : x)) });
    return (
      <Stepper<string> id={row === 0 ? 'level' : `level-${row}`} items={LEVELS} value={lockedAt === row ? LOCKED_LEVEL : value} label={l => T.level[l as Level]}
        prevLabel={T.menu.levelDown} nextLabel={T.menu.levelUp}
        onChange={l => { if (l === LOCKED_LEVEL) { setLockedAt(row); return; } setLockedAt(null); set(l as Level); }}
        locked={{ key: LOCKED_LEVEL, label: T.menu.lockedLevel }} />
    );
  };
  return (
    // прокрутка: на невысоком экране или с крупным шрифтом нижний ряд не уходит под кнопки телефона (0.5.1)
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACE.xl, paddingBottom: insets.bottom + SPACE.l }]} testID="menu">
      {/* «Правила» — в углу над названием: видно с первого экрана и не ломает сетку кнопок */}
      <View style={[styles.corner, { top: insets.top + SPACE.s }]}><Button small label={T.rules.menu} kind="ghost" onPress={onRules} testID="rules-open" /></View>
      <View style={styles.head}>
        <View style={styles.backs}><CardBack /><View style={styles.tilt}><CardBack /></View></View>
        <Text style={styles.title}>{T.app.name}</Text>
        <Text style={styles.tagline}>{T.app.tagline}</Text>
      </View>
      <View style={styles.panel}>
        <Text style={styles.label}>{T.menu.variant}</Text>
        <Chips id="variant" items={['podkidnoy', 'perevodnoy'] as Variant[]} value={choice.variant} label={v => T.variant[v]} onChange={variant => onChange({ ...choice, variant })} />
        <Text style={styles.label}>{T.menu.opponents}</Text>
        <Chips id="bots" items={[1, 2, 3]} value={choice.bots} label={n => T.menu.bots(n)} onChange={bots => { setLockedAt(null); onChange({ ...choice, bots }); }} />
        <Text style={styles.label}>{T.menu.level}</Text>
        {/* «Разные уровни» — над строками: включили, и строки ботов появляются ниже, а переключатель остаётся под пальцем */}
        {choice.bots > 1 ? (
          <Toggle id="levels-mixed" title={T.menu.mixed} value={mixed}
            onChange={on => { setLockedAt(null); onChange({ ...choice, mixed: on, levels: on ? choice.levels.map(() => choice.level) : choice.levels }); }} />
        ) : null}
        {mixed ? Array.from({ length: choice.bots }, (_, i) => (
          <View key={i} style={styles.botRow} testID={`level-row-${i + 1}`}>
            <Text style={styles.botName}>{T.game.bot(i + 1)}</Text>
            <View style={styles.botStep}>{levelRow(i + 1)}</View>
          </View>
        )) : levelRow(0)}
        {onLocked ? <Text style={styles.note} testID="locked-note">{T.menu.lockedNote}</Text> : null}
      </View>
      <View style={styles.actions}>
        {onResume ? <Button label={T.menu.resume} kind="ghost" onPress={onResume} testID="resume" /> : null}
        <Button label={T.menu.play} onPress={onPlay} disabled={onLocked} testID="play" />
        <View style={styles.row}>
          <View style={styles.cell}><Button label={T.menu.friends} kind="ghost" onPress={onFriends} testID="friends-open" /></View>
          <View style={styles.cell}><Button label={T.menu.quick} kind="ghost" onPress={onQuick} testID="quick-open" /></View>
        </View>
        <View style={styles.row}>
          <View style={styles.cell}><Button label={T.menu.puzzle} kind="ghost" onPress={onPuzzle} testID="puzzle-open" /></View>
          <View style={styles.cell}><Button label={T.menu.stats} kind="ghost" onPress={onStats} testID="stats-open" /></View>
        </View>
        <View style={styles.row}>
          <View style={styles.cell}><Button label={T.menu.store} kind="ghost" onPress={onStore} testID="store-open" /></View>
          <View style={styles.cell}><Button label={T.menu.settings} kind="ghost" onPress={onSettings} testID="settings-open" /></View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { flexGrow: 1, paddingHorizontal: SPACE.l, gap: SPACE.l, justifyContent: 'space-between' },
  corner: { position: 'absolute', right: SPACE.l, zIndex: 1 },
  head: { alignItems: 'center', gap: SPACE.s },
  backs: { flexDirection: 'row', height: 100, marginBottom: SPACE.s },
  tilt: { marginLeft: -30, transform: [{ rotate: '12deg' }] },
  title: { color: C.accent, fontSize: TYPE.display, fontWeight: '800' },
  tagline: { color: C.dim, fontSize: TYPE.body },
  panel: { gap: SPACE.m, padding: SPACE.l, borderRadius: RADIUS.panel, backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine },
  label: { color: C.dim, fontSize: TYPE.caption, marginTop: SPACE.xs },
  note: { color: C.dim, fontSize: TYPE.caption },
  botRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  botName: { color: C.text, fontSize: TYPE.body, fontWeight: '700', minWidth: 52 },
  botStep: { flex: 1 },
  actions: { gap: SPACE.m },
  row: { flexDirection: 'row', gap: SPACE.m },
  cell: { flex: 1 },
});
