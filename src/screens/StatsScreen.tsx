// Статистика (docs/09-game-design.md, «Статистика»): бесплатно — итог в целом и задачи дня; подробно — с «Про»:
// по столам, числу игроков и уровням, козыри и рейтинг тренировок. Ниже — последние партии с разбором.
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useInsets } from '../ui/insets';
import { T } from '../i18n';
import { isPro, onRights } from '../money';
import { Button } from '../ui/Button';
import { Header } from '../ui/Header';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';
import { LEVELS, oneLevel } from '../bot';
import { lastToday, loadHistory } from '../state/history';
import type { FinishedGame } from '../state/history';
import { loadPuzzleLog, solvedCount } from '../state/puzzles';
import { computeStats, ME } from '../state/stats';
import type { Tally } from '../state/stats';
import { ReviewScreen } from '../game/ReviewScreen';

/** Уровни ботов партии строкой: один на всех — его имя, разные — имена по местам через запятую. */
const levelsText = (g: FinishedGame) => { const one = oneLevel(g.levels); return one ? T.level[one] : g.levels.map(l => T.level[l]).join(', '); };

const resultOf = (g: FinishedGame) => {
  const r = g.record.result!;
  return r.draw ? T.result.draw : r.fool === ME ? T.result.lose : T.result.win;
};

export function StatsScreen({ onBack, onStore }: { onBack: () => void; onStore: () => void }) {
  const insets = useInsets();
  const [games, setGames] = useState<FinishedGame[]>([]);
  const [solved, setSolved] = useState(0);
  const [open, setOpen] = useState<FinishedGame | null>(null);
  const [, bump] = useState(0);
  useEffect(() => onRights(() => bump(n => n + 1)), []);
  useEffect(() => { void loadHistory().then(setGames); void loadPuzzleLog().then(l => setSolved(solvedCount(l))); }, [open]);
  const [now] = useState(() => Date.now());
  const st = useMemo(() => computeStats(games, now), [games, now]);
  const last = lastToday(games, now);
  if (open) return <ReviewScreen review={open.review} record={open.record} at={open.at} lastToday={open.at === last} onBack={() => setOpen(null)} onStore={onStore} />;
  const pro = isPro();
  const row = (name: string, t: Tally) => <Text key={name} style={styles.text}>{T.stats.row(name, t.games, t.kept)}</Text>;
  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACE.m, paddingBottom: insets.bottom + SPACE.m }]} testID="stats">
      <Header title={T.stats.title} back={T.stats.back} onBack={onBack} backTestID="stats-back" />
      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.card}>
          <Text style={styles.text} testID="stats-games">{T.stats.games(st.total.games)}</Text>
          <Text style={styles.text}>{T.stats.kept(st.total.kept)}</Text>
          <Text style={styles.text}>{T.stats.first(st.total.first)}</Text>
          {st.total.draws ? <Text style={styles.text}>{T.stats.draws(st.total.draws)}</Text> : null}
          <Text style={styles.text}>{T.stats.streak(st.streakToday)}</Text>
          <Text style={styles.text} testID="stats-puzzles">{T.stats.puzzles(solved)}</Text>
        </View>
        {pro ? (
          <View style={styles.card} testID="stats-pro">
            <Text style={styles.head}>{T.stats.variant}</Text>
            {row(T.variant.podkidnoy, st.byVariant.podkidnoy)}
            {row(T.variant.perevodnoy, st.byVariant.perevodnoy)}
            <Text style={styles.head}>{T.stats.seats}</Text>
            {([2, 3, 4] as const).filter(n => st.bySeats[n].games).map(n => row(T.stats.seatsRow(n), st.bySeats[n]))}
            <Text style={styles.head}>{T.stats.level}</Text>
            {LEVELS.filter(l => st.byLevel[l]).map(l => row(T.level[l], st.byLevel[l]!))}
            {st.mixed.games ? row(T.stats.mixed, st.mixed) : null}
            <Text style={styles.text} testID="stats-trumps">{T.stats.trumps(st.trumps.you, st.trumps.bot)}</Text>
            <Text style={styles.small}>{T.stats.trumpsNote}</Text>
            <Text style={styles.text} testID="stats-elo">{T.stats.elo(st.elo, st.eloGames)}</Text>
          </View>
        ) : (
          <View style={styles.card} testID="stats-locked">
            <Text style={styles.text}>{T.stats.pro}</Text>
            <Button label={T.review.toStore} kind="ghost" onPress={onStore} testID="stats-store" />
          </View>
        )}
        <Text style={styles.head}>{T.stats.recent}</Text>
        {games.length === 0 ? <Text style={styles.text}>{T.stats.empty}</Text> : [...games].reverse().slice(0, 30).map(g => (
          <View key={g.at} style={styles.game}>
            <Text style={styles.text}>{T.stats.recentRow(new Date(g.end).toLocaleDateString('ru-RU'), T.variant[g.record.variant], levelsText(g), resultOf(g))}</Text>
            <Button label={T.stats.open} kind="ghost" onPress={() => setOpen(g)} testID={`stats-review-${g.at}`} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: SPACE.l, gap: SPACE.m },
  list: { gap: SPACE.m, paddingBottom: SPACE.xl },
  card: { gap: SPACE.s, padding: SPACE.l, borderRadius: RADIUS.panel, backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine },
  head: { color: C.text, fontSize: TYPE.body, fontWeight: '700', marginTop: SPACE.s },
  text: { color: C.text, fontSize: TYPE.body },
  small: { color: C.dim, fontSize: TYPE.caption },
  game: { gap: SPACE.s },
});
