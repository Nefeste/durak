// Главный экран: стол, число соперников и уровень — «Играть»; «Продолжить партию», если она
// сохранена; «С друзьями», «Быстрая игра», «Магазин», «Настройки». Под уровнем — «За столом»: кто из персонажей
// уровня сядет (портрет с подписью «бот», имя, характер одной строкой; решение владельца #20). С двумя-тремя ботами —
// «Разные уровни»: у каждого соперника своя строка «‹ Любитель ›» (docs/09-game-design.md, «Боты за столом»). «Играть» — закреплённой полосой внизу
// над кнопками телефона, меню прокручивается над ней (аудит 09.11.2026, находка 7; решение владельца 09.11.2026).
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useInsets } from '../ui/insets';
import type { Variant } from '../engine';
import { LEVELS, LOCKED_LEVEL } from '../bot';
import type { Level } from '../bot';
import { T } from '../i18n';
import { BottomBar } from '../ui/BottomBar';
import { Button } from '../ui/Button';
import { Chips } from '../ui/Chips';
import { Stepper } from '../ui/Stepper';
import { Toggle } from '../ui/Toggle';
import { botLevels } from '../state/settings';
import type { Choice } from '../state/settings';
import { Face, FACE } from '../game/Portrait';
import { rivalsOf } from '../game/rivals';
import type { Rival } from '../game/rivals';
import { C, SPACE, TYPE } from '../ui/theme';
import { Emblem } from '../render/Emblem';
import { Glass } from '../ui/Glass';
import { Ornament } from '../ui/Ornament';

export type { Choice } from '../state/settings';

/** Соперник в меню: портрет с подписью «бот», имя и характер одной строкой. */
function RivalRow({ rival, n }: { rival: Rival; n: number }) {
  return (
    <View style={styles.rival} testID={`rival-${n}`}>
      <Face rival={rival} size={FACE.tile} testID={`rival-${n}-face`} />
      <View style={styles.rivalText}>
        <Text style={styles.rivalName} testID={`rival-${n}-name`}>{T.rival[rival.id]}</Text>
        <Text style={styles.note}>{T.rivals.about[rival.id]}</Text>
      </View>
    </View>
  );
}

export function MenuScreen({ choice, onChange, onPlay, onResume, onSettings, onFriends, onQuick, onStore, onPuzzle, onStats, onRules }: {
  choice: Choice; onChange: (c: Choice) => void; onPlay: () => void; onResume: (() => void) | null; onSettings: () => void;
  onFriends: () => void; onQuick: () => void; onStore: () => void; onPuzzle: () => void; onStats: () => void; onRules: () => void;
}) {
  const insets = useInsets();
  // закрытый седьмой уровень можно показать стрелкой, но не выбрать: пока он показан, «Играть» недоступна.
  // На какой строке он показан: 0 — общий уровень, N — бот N; `null` — нигде
  const [lockedAt, setLockedAt] = useState<number | null>(null);
  /** Высота полосы «Играть»: нижнее поле прокрутки, чтобы последний ряд вставал над полосой. */
  const [bar, setBar] = useState(0);
  const onLocked = lockedAt !== null;
  const mixed = choice.mixed && choice.bots > 1;
  // кто сядет за стол при этих уровнях — те же, что потом на плашках (src/game/rivals.ts)
  const rivals = rivalsOf(botLevels(choice)).slice(1) as Rival[];
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
    <View style={styles.root}>
      {/* прокрутка: на невысоком экране или с крупным шрифтом нижний ряд не уходит под полосу «Играть» и кнопки телефона */}
      <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACE.xl, paddingBottom: (bar || insets.bottom) + SPACE.l }]} testID="menu">
        {/* «Правила» — в углу над названием: видно с первого экрана и не ломает сетку кнопок */}
        <View style={[styles.corner, { top: insets.top + SPACE.s }]}><Button small label={T.rules.menu} kind="ghost" onPress={onRules} testID="rules-open" /></View>
        {/* фирменная шапка (specs/2026-11-art-premium.md §3): веер карт, название с разрядкой, золотая линия с мастью */}
        <View style={styles.head}>
          <Emblem width={64} testID="emblem" />
          <Text style={styles.title} maxFontSizeMultiplier={1.3}>{T.app.name}</Text>
          <Ornament />
          <Text style={styles.tagline} maxFontSizeMultiplier={1.3}>{T.app.tagline}</Text>
        </View>
        <Glass style={styles.panel}>
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
          {/* «Разные уровни»: соперник и под ним его строка уровня — сменили уровень, сменился и соперник */}
          {mixed ? rivals.map((r, i) => (
            <View key={i} style={styles.botColumn} testID={`level-row-${i + 1}`}>
              <RivalRow rival={r} n={i + 1} />
              {levelRow(i + 1)}
            </View>
          )) : levelRow(0)}
          {onLocked ? <Text style={styles.note} testID="locked-note">{T.menu.lockedNote}</Text> : null}
          {mixed ? null : (
            <View style={styles.botColumn} testID="rivals">
              <Text style={styles.label}>{T.rivals.atTable}</Text>
              {rivals.map((r, i) => <RivalRow key={r.id} rival={r} n={i + 1} />)}
            </View>
          )}
        </Glass>
        <View style={styles.actions}>
          {onResume ? <Button label={T.menu.resume} kind="ghost" onPress={onResume} testID="resume" /> : null}
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
      <BottomBar bottom={insets.bottom} onHeight={setBar} testID="play-bar">
        <Button label={T.menu.play} onPress={onPlay} disabled={onLocked} testID="play" />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: SPACE.l, gap: SPACE.l, justifyContent: 'space-between' },
  corner: { position: 'absolute', right: SPACE.l, zIndex: 1 },
  head: { alignItems: 'center', gap: SPACE.s },
  title: { color: C.accent, fontSize: TYPE.display, fontWeight: '800', letterSpacing: 1.5 },
  tagline: { color: C.dim, fontSize: TYPE.body },
  panel: { gap: SPACE.m, padding: SPACE.l },
  label: { color: C.dim, fontSize: TYPE.caption, marginTop: SPACE.xs },
  note: { color: C.dim, fontSize: TYPE.caption },
  botColumn: { gap: SPACE.s },
  rival: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  rivalText: { flex: 1, gap: SPACE.xs / 2 },
  rivalName: { color: C.text, fontSize: TYPE.body, fontWeight: '700' },
  actions: { gap: SPACE.m },
  row: { flexDirection: 'row', gap: SPACE.m },
  cell: { flex: 1 },
});
