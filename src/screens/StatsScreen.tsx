// Статистика (docs/09-game-design.md, «Статистика»; решение владельца 09.11.2026 — подробно и по правилам
// инфографики): бесплатно — «Итог» высокой полосой мест и строками; с «Про» — форма последних партий, рейтинг
// тренировок с линией и лестницей уровней, против уровней расходящимися полосами, средние за партию с ходом, таблица
// по столам и неделям. Каждое число графика есть и текстом. Ниже — последние партии с разбором.
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useInsets } from '../ui/insets';
import { T } from '../i18n';
import { isPro, onRights } from '../money';
import { Button } from '../ui/Button';
import { Glass } from '../ui/Glass';
import { Header } from '../ui/Header';
import { C, CHART, RADIUS, SPACE, TYPE } from '../ui/theme';
import { LEVELS, oneLevel } from '../bot';
import { lastToday, loadHistory } from '../state/history';
import type { FinishedGame } from '../state/history';
import { loadPuzzleLog, solvedCount } from '../state/puzzles';
import { computeStats, LEVEL_ELO, ME, PLACES } from '../state/stats';
import type { Avg, Place, Stats, Tally } from '../state/stats';
import { ReviewScreen } from '../game/ReviewScreen';
import { Well } from '../ui/charts/Well';
import { Legend } from '../ui/charts/Legend';
import { Segmented } from '../ui/charts/Segmented';
import { FormStrip } from '../ui/charts/FormStrip';
import { Sparkline } from '../ui/charts/Sparkline';
import { Ladder } from '../ui/charts/Ladder';
import { Diverging } from '../ui/charts/Diverging';
import type { DivRow } from '../ui/charts/Diverging';
import { neighbours } from '../ui/charts/geometry';

const PLACE_COLOR: Record<Place, string> = { first: CHART.first, out: CHART.out, draw: CHART.draw, fool: CHART.fool };
const SPARK_W = 120, SPARK_H = 44;
/** колонка числа в таблице: «С картами» подписью 13 в одну строку */
const NUM_W = 72;

/** Уровни ботов партии строкой: один на всех — его имя, разные — имена по местам через запятую. */
const levelsText = (g: FinishedGame) => { const one = oneLevel(g.levels); return one ? T.level[one] : g.levels.map(l => T.level[l]).join(', '); };

const resultOf = (g: FinishedGame) => {
  const r = g.record.result!;
  return (r.resigned ?? []).includes(ME) ? T.result.youResigned : r.draw ? T.result.draw : r.fool === ME ? T.result.lose : T.result.win;
};

const countPlaces = (ps: readonly Place[]): Record<Place, number> => {
  const c: Record<Place, number> = { first: 0, out: 0, draw: 0, fool: 0 };
  for (const p of ps) c[p]++;
  return c;
};

const legend = () => PLACES.map(p => ({ color: PLACE_COLOR[p], label: T.stats.place[p] }));

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
  if (open) return <ReviewScreen review={open.review} record={open.record} levels={open.levels} rival={open.rival} at={open.at} lastToday={open.at === last} onBack={() => setOpen(null)} onStore={onStore} />;
  const pro = isPro();
  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACE.m, paddingBottom: insets.bottom + SPACE.m }]} testID="stats">
      <Header title={T.stats.title} back={T.stats.back} onBack={onBack} backTestID="stats-back" />
      <ScrollView contentContainerStyle={styles.list} testID="stats-scroll">
        <Summary st={st} solved={solved} />
        {pro ? (
          <View style={styles.list} testID="stats-pro">
            {st.form.length ? <Form st={st} /> : null}
            <Elo st={st} />
            <Versus st={st} />
            {st.total.games ? <Play st={st} /> : null}
            <Table st={st} now={now} />
          </View>
        ) : (
          <Glass style={styles.card} testID="stats-locked">
            <Text style={styles.text}>{T.stats.pro}</Text>
            <Button label={T.review.toStore} kind="ghost" onPress={onStore} testID="stats-store" />
          </Glass>
        )}
        <Text style={styles.section} accessibilityRole="header">{T.stats.recent}</Text>
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

function Card({ title, children, testID }: { title: string; children: React.ReactNode; testID?: string }) {
  return (
    <Glass style={styles.card} testID={testID}>
      <Text style={styles.section} accessibilityRole="header">{title}</Text>
      {children}
    </Glass>
  );
}

/** Бесплатно: высокая полоса мест и те же числа строками. */
function Summary({ st, solved }: { st: Stats; solved: number }) {
  const values = PLACES.map(p => st.places[p]);
  return (
    <Card title={T.stats.summary} testID="stats-summary">
      {st.total.games ? (
        <Well testID="stats-places">
          {w => (
            <>
              <Segmented values={values} colors={PLACES.map(p => PLACE_COLOR[p])} width={w} spoken={T.stats.placesSpoken(st.places)} />
              <Legend items={legend()} />
            </>
          )}
        </Well>
      ) : null}
      <Text style={styles.text} testID="stats-games">{T.stats.games(st.total.games)}</Text>
      <Text style={styles.text}>{T.stats.first(st.total.first)}</Text>
      <Text style={styles.text}>{T.stats.kept(st.total.kept)}</Text>
      {st.total.draws ? <Text style={styles.text}>{T.stats.draws(st.total.draws)}</Text> : null}
      <Text style={styles.text}>{T.stats.streak(st.streakToday)}</Text>
      <Text style={styles.text} testID="stats-puzzles">{T.stats.puzzles(solved)}</Text>
    </Card>
  );
}

function Form({ st }: { st: Stats }) {
  const c = countPlaces(st.form);
  return (
    <Card title={T.stats.form(st.form.length)} testID="stats-form">
      <Well>
        {w => (
          <>
            <FormStrip colors={st.form.map(p => PLACE_COLOR[p])} width={w} spoken={`${T.stats.form(st.form.length)}: ${st.form.map(p => T.stats.place[p]).join(', ')}`} />
            <Legend items={legend()} />
          </>
        )}
      </Well>
      <Text style={styles.text} testID="stats-form-row">{T.stats.formRow(c)}</Text>
      <Text style={styles.small}>{T.stats.formNote}</Text>
    </Card>
  );
}

function Elo({ st }: { st: Stats }) {
  if (!st.eloGames) {
    return (
      <Card title={T.stats.eloTitle} testID="stats-elo">
        <Text style={styles.text}>{T.stats.eloNone}</Text>
      </Card>
    );
  }
  const near = neighbours(LEVELS, l => LEVEL_ELO[l], st.elo);
  const between = T.stats.between(near[0], near[1], LEVEL_ELO);
  const delta = T.stats.eloDelta(st.eloDelta ?? 0);
  return (
    <Card title={T.stats.eloTitle} testID="stats-elo">
      <Well>
        {w => (
          <View accessible accessibilityRole="image" accessibilityLabel={T.stats.eloSpoken(st.elo, delta, between, st.eloLine)} style={styles.wellGap}>
            <View style={styles.tile}>
              <View style={styles.grow}>
                <Text style={styles.hero} testID="stats-elo-value">{st.elo}</Text>
                <Text style={styles.text}>{delta}</Text>
              </View>
              {st.eloLine.length > 1 ? <Sparkline values={st.eloLine} width={Math.min(SPARK_W, w / 2)} height={SPARK_H} /> : null}
            </View>
            <Ladder rating={st.elo} width={w} elo={LEVEL_ELO} near={near} names={T.level} />
            <Text style={styles.text} testID="stats-between">{between}</Text>
          </View>
        )}
      </Well>
      {st.eloLine.length > 1 ? <Text style={styles.small}>{T.stats.eloLine(st.eloLine.length)}</Text> : null}
      <Text style={styles.small}>{T.stats.eloHow(st.eloGames)}</Text>
    </Card>
  );
}

function Versus({ st }: { st: Stats }) {
  const rows: DivRow[] = LEVELS.flatMap(l => {
    const v = st.vsLevel[l];
    if (!v) return [];
    const all = v.before + v.together + v.after;
    return [{ id: l, label: T.level[l], left: v.after, right: v.before, note: T.stats.vsShare(v.before, all), spoken: T.stats.vsSpoken(T.level[l], v.before, v.after, v.together) }];
  });
  if (!rows.length) return null;
  const together = LEVELS.reduce((a, l) => a + (st.vsLevel[l]?.together ?? 0), 0);
  return (
    <Card title={T.stats.vsTitle} testID="stats-vs">
      <Well>
        {w => (
          <>
            <Legend items={[{ color: CHART.fool, label: T.stats.vsAfter }, { color: CHART.first, label: T.stats.vsBefore }]} />
            <Diverging rows={rows} width={w} />
          </>
        )}
      </Well>
      {together ? <Text style={styles.small}>{T.stats.vsTogether(together)}</Text> : null}
      <Text style={styles.small}>{T.stats.vsHow}</Text>
    </Card>
  );
}

function AvgTile({ label, a, testID }: { label: string; a: Avg; testID: string }) {
  if (!a.n) return null;
  return (
    <View style={styles.kpi} testID={testID} accessible accessibilityLabel={`${label}: ${T.stats.value(a.mean)}, ${T.stats.over(a.n)}${a.recent !== null && a.earlier !== null ? `. ${T.stats.trend(a.recent, a.earlier)}` : ''}`}>
      <Text style={styles.small}>{label}</Text>
      <Text style={styles.value}>{T.stats.value(a.mean)}</Text>
      <Text style={styles.small}>{T.stats.over(a.n)}</Text>
      {a.recent !== null && a.earlier !== null ? <Text style={styles.small}>{T.stats.trend(a.recent, a.earlier)}</Text> : null}
    </View>
  );
}

function Play({ st }: { st: Stats }) {
  const a = st.avg, L = T.stats.avg;
  return (
    <Card title={T.stats.playTitle} testID="stats-play">
      <View style={styles.kpis}>
        <AvgTile label={L.bouts} a={a.bouts} testID="stats-avg-bouts" />
        <AvgTile label={L.takes} a={a.takes} testID="stats-avg-takes" />
        <AvgTile label={L.transfers} a={a.transfers} testID="stats-avg-transfers" />
        <AvgTile label={L.trumpsLeft} a={a.trumpsLeft} testID="stats-avg-trumps-left" />
        <AvgTile label={L.errors} a={a.errors} testID="stats-avg-errors" />
        <AvgTile label={L.inaccuracies} a={a.inaccuracies} testID="stats-avg-inaccuracies" />
      </View>
      <Text style={styles.text} testID="stats-trumps">{T.stats.trumps(st.trumps.you, st.trumps.bot)}</Text>
      <Text style={styles.small}>{T.stats.trumpsNote}</Text>
      <Text style={styles.text}>{T.stats.hinted(st.hinted)}</Text>
    </Card>
  );
}

function Table({ st, now }: { st: Stats; now: number }) {
  const row = (name: string, t: Tally) => (
    <View key={name} style={styles.tr} accessible accessibilityLabel={T.stats.row(name, t.games, t.first, t.kept)}>
      <Text style={[styles.text, styles.grow]}>{name}</Text>
      {[t.games, t.first, t.kept].map((n, k) => <Text key={k} style={[styles.text, styles.num]}>{n}</Text>)}
    </View>
  );
  const head = (title: string) => (
    <View style={[styles.tr, styles.th]} key={title}>
      <Text style={[styles.head, styles.grow]} accessibilityRole="header">{title}</Text>
      {T.stats.cols.map(c => <Text key={c} style={[styles.small, styles.num]}>{c}</Text>)}
    </View>
  );
  const week = (start: number) => { const d = new Date(start); return T.stats.weekRow(d.getDate(), d.getMonth() + 1); };
  return (
    <Card title={T.stats.tableTitle} testID="stats-table">
      {head(T.stats.variant)}
      {row(T.variant.podkidnoy, st.byVariant.podkidnoy)}
      {row(T.variant.perevodnoy, st.byVariant.perevodnoy)}
      {head(T.stats.seats)}
      {([2, 3, 4] as const).filter(n => st.bySeats[n].games).map(n => row(T.stats.seatsRow(n), st.bySeats[n]))}
      {head(T.stats.level)}
      {LEVELS.filter(l => st.byLevel[l]).map(l => row(T.level[l], st.byLevel[l]!))}
      {st.mixed.games ? row(T.stats.mixed, st.mixed) : null}
      {head(T.stats.weeks)}
      {st.byWeek.map((w, k) => row(k === 0 && w.start <= now ? T.stats.thisWeek : week(w.start), w.tally))}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: SPACE.l, gap: SPACE.m },
  list: { gap: SPACE.m, paddingBottom: SPACE.xl },
  card: { gap: SPACE.s, padding: SPACE.l },
  section: { color: C.text, fontSize: TYPE.section, fontWeight: '700' },
  head: { color: C.text, fontSize: TYPE.body, fontWeight: '700' },
  text: { color: C.text, fontSize: TYPE.body },
  small: { color: C.dim, fontSize: TYPE.caption },
  game: { gap: SPACE.s },
  wellGap: { gap: SPACE.s },
  tile: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  grow: { flex: 1 },
  hero: { color: C.text, fontSize: TYPE.display, fontWeight: '700' },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s },
  kpi: { flexGrow: 1, flexBasis: '45%', gap: SPACE.xs, padding: SPACE.m, borderRadius: RADIUS.small, backgroundColor: CHART.well },
  value: { color: C.text, fontSize: TYPE.section, fontWeight: '700' },
  tr: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.s },
  th: { marginTop: SPACE.s },
  num: { width: NUM_W, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
