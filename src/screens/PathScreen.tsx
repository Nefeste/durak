// «Путь к Мастеру» (docs/specs/2026-11-path.md; решение владельца #21, вариант 1): у подкидного и переводного — свой путь
// из 21 соперника. Вкладка «Путь» — прогресс, соперник матча и лестница из семи ступеней; «Коллекция» — все 21 с
// отметкой пройденных. Карточка соперника — его характер, счёт в пути и ваши партии с ним с разбором (доступ к
// полному разбору — как в «Статистике»: последняя партия дня, «Про» или реклама по желанию). «Играть матч» — полосой
// внизу. Состояние — словом, не только цветом (13-art.md §3).
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Variant } from '../engine';
import { T } from '../i18n';
import { useInsets } from '../ui/insets';
import { BottomBar } from '../ui/BottomBar';
import { Button } from '../ui/Button';
import { Chips } from '../ui/Chips';
import { Glass } from '../ui/Glass';
import { Header } from '../ui/Header';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';
import { Face, FACE } from '../game/Portrait';
import { CAST_LEVELS } from '../game/rivals';
import type { Rival } from '../game/rivals';
import { beatenOf, currentRival, PATH, PATH_LEN, PATH_VARIANTS, stepOf, winsFor } from '../game/path';
import type { PathLog, Step } from '../game/path';
import { loadPath, usePath } from '../state/path';
import { lastToday, loadHistory, rivalsIn } from '../state/history';
import type { FinishedGame } from '../state/history';
import { ReviewScreen } from '../game/ReviewScreen';
import { onRights } from '../money';

const BIG_FACE = 56;
const date = (t: number) => new Date(t).toLocaleDateString('ru-RU');

const resultOf = (g: FinishedGame) => {
  const r = g.record.result!;
  return (r.resigned ?? []).includes(0) ? T.result.youResigned : r.draw ? T.result.draw : r.fool === 0 ? T.result.lose : T.result.win;
};

export function PathScreen({ variant, onVariant, onPlay, resumable, onBack, onStore }: {
  variant: Variant; onVariant: (v: Variant) => void; onPlay: () => void;
  /** сохранена партия матча этого варианта — «Продолжить матч» */
  resumable: boolean; onBack: () => void; onStore: () => void;
}) {
  const insets = useInsets();
  const log = usePath();
  const [tab, setTab] = useState<'path' | 'collection'>('path');
  const [card, setCard] = useState<Rival | null>(null);
  const [games, setGames] = useState<FinishedGame[]>([]);
  const [open, setOpen] = useState<FinishedGame | null>(null);
  const [bar, setBar] = useState(0);
  const [now0] = useState(() => Date.now());
  const [, bump] = useState(0);
  useEffect(() => { void loadPath(); }, []);
  useEffect(() => onRights(() => bump(n => n + 1)), []);
  useEffect(() => { void loadHistory().then(setGames); }, [open, card]);
  if (open) {
    const last = lastToday(games, now0);
    return <ReviewScreen review={open.review} record={open.record} levels={open.levels} rival={open.rival} at={open.at} lastToday={open.at === last} onBack={() => setOpen(null)} onStore={onStore} />;
  }
  if (card) return <RivalCard rival={card} log={log} games={games} onOpen={setOpen} onClose={() => setCard(null)} />;
  const run = log.runs[variant];
  const now = currentRival(run);
  const beaten = beatenOf(log);
  return (
    <View style={styles.root} testID="path">
      <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACE.m, paddingBottom: (bar || insets.bottom) + SPACE.l }]} testID="path-scroll">
        <Header title={T.path.title} back={T.path.back} onBack={onBack} backTestID="path-back" />
        <Text style={styles.note}>{T.path.tagline}</Text>
        <Chips id="path-variant" items={PATH_VARIANTS} value={variant} label={v => T.variant[v]} onChange={onVariant} />
        <Chips id="path-tab" items={['path', 'collection'] as const} value={tab} label={t => (t === 'path' ? T.path.tabPath : T.path.tabCollection)} onChange={setTab} />
        {tab === 'path' ? (
          <>
            <Progress n={run.at} label={T.path.progress(run.at, PATH_LEN)} testID="path-progress" />
            {now ? (
              <Glass style={styles.panel} testID="path-now">
                <View style={styles.rivalHead}>
                  <Face rival={now} size={BIG_FACE} testID="path-now-face" />
                  <View style={styles.rivalText}>
                    <Text style={styles.name} testID="path-now-name">{T.rival[now.id]}</Text>
                    <Text style={styles.note}>{T.game.botMark} · {T.level[now.level]}</Text>
                  </View>
                </View>
                <Text style={styles.text}>{T.rivals.about[now.id]}</Text>
                <Text style={styles.text} testID="path-need">{T.path.need(winsFor(now.level))}</Text>
                <Text style={styles.score} testID="path-score">{T.path.score(run.you, run.them, T.rival[now.id])}</Text>
                <Text style={styles.note}>{T.path.rules}</Text>
              </Glass>
            ) : (
              <Glass style={styles.panel} testID="path-done">
                <Text style={styles.name}>{T.path.doneAt(date(run.doneAt ?? now0))}</Text>
                <Text style={styles.text}>{T.path.doneText}</Text>
              </Glass>
            )}
            {CAST_LEVELS.map((level, s) => (
              <View key={level} style={styles.step} testID={`path-step-${s + 1}`}>
                <Text style={styles.section} accessibilityRole="header">{T.path.step(s + 1, T.level[level])}</Text>
                {PATH.slice(s * 3, s * 3 + 3).map((r, k) => {
                  const st = stepOf(run, s * 3 + k);
                  return <LadderRow key={r.id} rival={r} step={st} onPress={st === 'ahead' ? undefined : () => setCard(r)} />;
                })}
              </View>
            ))}
          </>
        ) : (
          <>
            <Progress n={beaten.size} label={T.path.collection(beaten.size, PATH_LEN)} testID="collection-progress" />
            <Text style={styles.note}>{T.path.collectionNote}</Text>
            <View style={styles.grid}>
              {PATH.map(r => {
                const at = log.rivals[r.id]?.beatenAt ?? null;
                return (
                  <Pressable key={r.id} onPress={() => setCard(r)} accessibilityRole="button" style={({ pressed }) => [styles.tileWrap, pressed && styles.pressed]} testID={`collect-${r.id}`}>
                    <Glass radius={RADIUS.small} style={[styles.tile, at !== null && styles.tileOn]}>
                      <Face rival={r} size={FACE.tile} chip={false} />
                      <Text style={styles.tileName}>{T.rival[r.id]}</Text>
                      <Text style={at !== null ? styles.tileOnText : styles.tileOff}>{at !== null ? T.path.beatenAt(date(at)) : T.path.notYet}</Text>
                    </Glass>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
      <BottomBar bottom={insets.bottom} onHeight={setBar} testID="path-bar">
        <Button label={!now ? T.path.done : resumable ? T.path.resume : T.path.play} disabled={!now} onPress={onPlay} testID="path-play" />
      </BottomBar>
    </View>
  );
}

function Progress({ n, label, testID }: { n: number; label: string; testID: string }) {
  return (
    <View style={styles.progress} accessibilityLabel={label}>
      <Text style={styles.text} testID={testID}>{label}</Text>
      <View style={styles.track}><View style={[styles.fill, { width: `${(100 * n) / PATH_LEN}%` }]} /></View>
    </View>
  );
}

const STEP_STYLE: Record<Step, 'stateDone' | 'stateNow' | 'stateAhead'> = { done: 'stateDone', now: 'stateNow', ahead: 'stateAhead' };

function LadderRow({ rival, step, onPress }: { rival: Rival; step: Step; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" style={({ pressed }) => [pressed && styles.pressed]} testID={`path-row-${rival.id}`}>
      <Glass radius={RADIUS.small} style={[styles.row, step === 'now' && styles.rowNow, step === 'ahead' && styles.rowAhead]}>
        <Face rival={rival} size={FACE.tile} />
        <View style={styles.rivalText}>
          <Text style={styles.rowName}>{T.rival[rival.id]}</Text>
          <Text style={styles.note}>{T.path.need(winsFor(rival.level))}</Text>
        </View>
        <Text style={styles[STEP_STYLE[step]]} testID={`path-row-${rival.id}-state`}>{T.path.state[step]}</Text>
      </Glass>
    </Pressable>
  );
}

/** Карточка соперника: характер, счёт в пути, ваши партии с ним (разбор — с доступом «Статистики»). */
function RivalCard({ rival, log, games, onOpen, onClose }: {
  rival: Rival; log: PathLog; games: FinishedGame[]; onOpen: (g: FinishedGame) => void; onClose: () => void;
}) {
  const insets = useInsets();
  const sc = log.rivals[rival.id];
  const mine = games.filter(g => rivalsIn(g).includes(rival.id)).reverse().slice(0, 20);
  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACE.m, paddingBottom: insets.bottom + SPACE.m, paddingHorizontal: SPACE.l }]} testID="rival-card">
      <Header title={T.rival[rival.id]} back={T.path.close} onBack={onClose} backTestID="rival-card-close" />
      <ScrollView contentContainerStyle={styles.cardList}>
        <Glass style={styles.panel}>
          <View style={styles.rivalHead}>
            <Face rival={rival} size={BIG_FACE} />
            <View style={styles.rivalText}>
              <Text style={styles.note}>{T.game.botMark} · {T.level[rival.level]}</Text>
              <Text style={sc?.beatenAt ? styles.stateDone : styles.stateAhead}>{sc?.beatenAt ? T.path.beatenAt(date(sc.beatenAt)) : T.path.notYet}</Text>
            </View>
          </View>
          <Text style={styles.text}>{T.rivals.about[rival.id]}</Text>
          <Text style={styles.text} testID="rival-card-score">{T.path.rivalScore(sc?.won ?? 0, sc?.lost ?? 0)}</Text>
        </Glass>
        <Text style={styles.section} accessibilityRole="header">{T.path.games}</Text>
        <Text style={styles.note}>{T.path.gamesNote}</Text>
        {mine.length === 0 ? <Text style={styles.text} testID="rival-card-empty">{T.path.noGames}</Text> : mine.map(g => (
          <View key={g.at} style={styles.game}>
            <Text style={[styles.text, styles.gameText]}>{T.path.gameRow(date(g.end), T.variant[g.record.variant], resultOf(g))}</Text>
            <Button small label={T.path.open} kind="ghost" onPress={() => onOpen(g)} testID={`rival-game-${g.at}`} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: SPACE.l, gap: SPACE.m },
  cardList: { gap: SPACE.m, paddingTop: SPACE.m },
  panel: { gap: SPACE.s, padding: SPACE.l },
  rivalHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  rivalText: { flex: 1, gap: SPACE.xs / 2 },
  name: { color: C.text, fontSize: TYPE.section, fontWeight: '700' },
  rowName: { color: C.text, fontSize: TYPE.body, fontWeight: '700' },
  score: { color: C.accent, fontSize: TYPE.body, fontWeight: '700' },
  section: { color: C.text, fontSize: TYPE.section, fontWeight: '700', marginTop: SPACE.s },
  text: { color: C.text, fontSize: TYPE.body },
  note: { color: C.dim, fontSize: TYPE.caption },
  progress: { gap: SPACE.xs },
  track: { height: 6, borderRadius: RADIUS.pill, backgroundColor: C.glassLine, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: C.accent },
  step: { gap: SPACE.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, padding: SPACE.s, minHeight: 56 },
  rowNow: { borderColor: C.accent, borderWidth: 2, padding: SPACE.s - 1 },
  rowAhead: { opacity: 0.7 },
  stateDone: { color: C.ok, fontSize: TYPE.caption, fontWeight: '700' },
  stateNow: { color: C.accent, fontSize: TYPE.caption, fontWeight: '700' },
  stateAhead: { color: C.dim, fontSize: TYPE.caption },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s },
  tileWrap: { flexBasis: '30%', flexGrow: 1 },
  tile: { alignItems: 'center', gap: SPACE.xs, padding: SPACE.s, minHeight: 104 },
  tileOn: { borderColor: C.accent, borderWidth: 2, padding: SPACE.s - 1 },
  tileName: { color: C.text, fontSize: TYPE.body, fontWeight: '700', textAlign: 'center' },
  tileOnText: { color: C.accent, fontSize: TYPE.caption, textAlign: 'center' },
  tileOff: { color: C.dim, fontSize: TYPE.caption, textAlign: 'center' },
  game: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  gameText: { flex: 1 },
  pressed: { opacity: 0.8 },
});
