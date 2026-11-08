// Задача дня (docs/09-game-design.md, «Задача дня»): позиция концовки вдвоём, все карты известны. Игрок ходит, соперник
// отвечает лучшей защитой (точный расчёт); неверный ход — «Ещё раз» сколько угодно, ответ — по кнопке. Одна задача
// на всех в день, без рекламы до и после; пропущенный день — в архиве.
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useInsets } from '../ui/insets';
import { useFont } from '@shopify/react-native-skia';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import { apply, legalActions, nameOf, observe } from '../engine';
import type { Action, Card, State } from '../engine';
import { actorOf } from '../bot/sim';
import { T } from '../i18n';
import { Button } from '../ui/Button';
import { C, RADIUS } from '../ui/theme';
import { TableCanvas } from '../render/TableCanvas';
import { CONTROLS, layoutTable } from '../render/layout';
import { useLessMotion, useSettings } from '../state/store';
import { dateOfDay, loadPuzzleLog, todayKey, updateDay } from '../state/puzzles';
import type { PuzzleLog } from '../state/puzzles';
import { dayNumber, puzzleFor, replyOf, START_DAY, stateOf, valueAfter } from './puzzle';
import { PUZZLES } from './puzzleSet';
import { tapCard } from './table';
import { actionText } from './words';

type Status = 'play' | 'wrong' | 'solved' | 'shown';

function Board({ day, onArchive }: { day: number; onArchive: () => void }) {
  const p = puzzleFor(PUZZLES, day);
  const settings = useSettings();
  const less = useLessMotion();
  const [state, setState] = useState<State>(() => stateOf(p));
  const [status, setStatus] = useState<Status>('play');
  const [tries, setTries] = useState(0);
  const [picked, setPicked] = useState<{ card: Card; options: Action[] } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [shared, setShared] = useState<string | null>(null);
  const font = useFont(Onest_700Bold, 15);
  const small = useFont(Onest_700Bold, 26);
  const you = p.you, opp = 1 - you;
  const date = dateOfDay(START_DAY, day);
  useEffect(() => { void loadPuzzleLog().then(l => { const d = l[day]; if (d?.solved) setStatus('solved'); else if (d?.shown) setStatus('shown'); setTries(d?.tries ?? 0); }); }, [day]);

  /** Новая позиция; кончилась партия, и игрок вышел, — задача решена. */
  const step = (next: State) => {
    setState(next);
    if (next.phase === 'end' && next.result && !next.result.draw && next.result.fool !== you) {
      setStatus('solved');
      setTries(n => n + 1);
      void updateDay(day, d => ({ ...d, tries: d.tries + 1, solved: true }));
    }
  };
  // соперник отвечает лучшей защитой, пока ход за ним
  useEffect(() => {
    if (state.phase === 'end' || status !== 'play' || actorOf(state) === you) return;
    const t = setTimeout(() => {
      const who = actorOf(state);
      step(apply(state, who, replyOf(p, state, who, legalActions(state, who))));
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, status, p, you]);

  const act = (a: Action) => {
    setPicked(null);
    if (valueAfter(p, state, a) < 1) {
      setStatus('wrong');
      void updateDay(day, d => ({ ...d, tries: d.tries + 1 }));
      setTries(n => n + 1);
      return;
    }
    step(apply(state, you, a));
  };
  const again = () => { setState(stateOf(p)); setStatus('play'); setPicked(null); };
  const showAnswer = () => { setStatus('shown'); void updateDay(day, d => ({ ...d, shown: true })); };
  const share = () => {
    const text = T.puzzle.shareText(day, date, tries, status === 'shown');
    setShared(text);
    Share.share({ message: text }).catch(() => { /* в браузере без «Поделиться» — текст виден на экране */ });
  };

  const view = useMemo(() => observe(state, you), [state, you]);
  const targets = picked ? picked.options.flatMap(o => (o.type === 'beat' ? [o.on] : [])) : [];
  // в задаче партия не сыграна на глазах игрока — взятое в открытую входит в условие, его видно всегда
  const layout = useMemo(() => (size ? layoutTable(view, { ...size, order: settings.handOrder, picked: picked?.card ?? null, targets, showOpenly: true }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, size, settings.handOrder, picked]);
  const mine = status === 'play' && actorOf(state) === you ? legalActions(state, you) : [];
  const take = mine.find(a => a.type === 'take');
  const pass = mine.find(a => a.type === 'pass');
  const onCard = (c: Card) => {
    if (status !== 'play') return;
    if (picked?.card === c) { setPicked(null); return; }
    const r = tapCard(state, you, c);
    if (!r) { setPicked(null); return; }
    if ('now' in r) act(r.now); else setPicked({ card: c, options: r.choose });
  };
  const onTableCard = (on: Card) => { const a = picked?.options.find(o => o.type === 'beat' && o.on === on); if (a) act(a); };
  const onDrop = (c: Card, on: Card | null) => {
    const r = tapCard(state, you, c);
    if (!r) return;
    if ('now' in r) { act(r.now); return; }
    const a = (on !== null && r.choose.find(o => o.type === 'beat' && o.on === on)) || null;
    if (a) act(a); else setPicked({ card: c, options: r.choose });
  };
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.width - width) > 1 || Math.abs(size.height - height) > 1) setSize({ width, height });
  };
  const line = status === 'wrong' ? T.puzzle.wrong : status === 'solved' ? T.puzzle.solved(tries)
    : status === 'shown' ? T.puzzle.answerIs(actionText(p.answer)) : T.puzzle.goal;

  return (
    <View style={styles.board}>
      <Text style={styles.head} testID="puzzle-number">{T.puzzle.number(day, date)}</Text>
      <Text style={styles.opp} testID="puzzle-opponent">{T.puzzle.opponent(state.hands[opp].map(nameOf).join(' '))}</Text>
      <View style={styles.area} onLayout={onLayout} testID="puzzle-table">
        {layout && font && small ? (
          <TableCanvas layout={layout} font={font} small={small} fourColor={settings.fourColor} less={less}
            hand={state.hands[you]} table={state.table} enabled={status === 'play'} touch={{ onCard, onTableCard, onDrop }} />
        ) : null}
        {layout ? (
          <View pointerEvents="box-none" style={[styles.controls, { top: layout.handTop - CONTROLS + 8 }]}>
            <Text style={styles.line} testID="puzzle-line">{line}</Text>
            <View style={styles.buttons} pointerEvents="box-none">
              {take ? <Button label={T.game.take} kind="ghost" onPress={() => act(take)} testID="puzzle-take" /> : null}
              {pass ? <Button label={state.table.every(([, d]) => d !== null) ? T.game.done : T.game.pass} onPress={() => act(pass)} testID="puzzle-pass" /> : null}
            </View>
          </View>
        ) : null}
      </View>
      <View style={styles.row}>
        {status === 'wrong' ? <View style={styles.cell}><Button label={T.puzzle.again} onPress={again} testID="puzzle-again" /></View> : null}
        {status === 'play' || status === 'wrong' ? <View style={styles.cell}><Button label={T.puzzle.answer} kind="ghost" onPress={showAnswer} testID="puzzle-answer" /></View> : null}
        {status === 'solved' || status === 'shown' ? <View style={styles.cell}><Button label={T.puzzle.share} onPress={share} testID="puzzle-share" /></View> : null}
        <View style={styles.cell}><Button label={T.puzzle.archive} kind="ghost" onPress={onArchive} testID="puzzle-archive" /></View>
      </View>
      {shared ? <Text style={styles.shared} testID="puzzle-share-text">{shared}</Text> : null}
    </View>
  );
}

function Archive({ today, log, onOpen }: { today: number; log: PuzzleLog; onOpen: (day: number) => void }) {
  const days = Array.from({ length: today }, (_, i) => today - i);
  return (
    <ScrollView contentContainerStyle={styles.list} testID="puzzle-archive-list">
      {days.map(n => {
        const d = log[n];
        const st = d?.solved ? 'solved' : d?.shown ? 'shown' : d && d.tries > 0 ? 'tried' : 'new';
        return <Button key={n} kind="ghost" label={T.puzzle.archiveRow(n, dateOfDay(START_DAY, n), T.puzzle.status[st])} onPress={() => onOpen(n)} testID={`archive-${n}`} />;
      })}
    </ScrollView>
  );
}

export function PuzzleScreen({ onBack }: { onBack: () => void }) {
  const insets = useInsets();
  const today = dayNumber(todayKey());
  const [day, setDay] = useState(today);
  const [archive, setArchive] = useState(false);
  const [log, setLog] = useState<PuzzleLog>({});
  useEffect(() => { if (archive) void loadPuzzleLog().then(setLog); }, [archive]);
  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]} testID="puzzle">
      <View style={styles.top}>
        <Button label={T.puzzle.back} kind="ghost" onPress={archive ? () => setArchive(false) : onBack} testID="puzzle-back" />
        <Text style={styles.title}>{archive ? T.puzzle.archive : T.puzzle.title}</Text>
        {!archive && day !== today ? <Button label={T.puzzle.today} kind="ghost" onPress={() => setDay(today)} testID="puzzle-today" /> : null}
      </View>
      {archive ? <Archive today={today} log={log} onOpen={n => { setDay(n); setArchive(false); }} />
        : <Board key={day} day={day} onArchive={() => setArchive(true)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 8, gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: C.text, fontSize: 20, fontWeight: '700', flex: 1 },
  board: { flex: 1, gap: 6 },
  head: { color: C.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  opp: { color: C.dim, fontSize: 15, textAlign: 'center' },
  area: { flex: 1 },
  controls: { position: 'absolute', left: 8, right: 8, gap: 8 },
  line: { color: C.text, fontSize: 15, textAlign: 'center', minHeight: 20 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, minHeight: 48 },
  row: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1 },
  shared: { color: C.dim, fontSize: 14, textAlign: 'center', padding: 8, borderRadius: RADIUS.card, borderWidth: 1, borderColor: C.glassLine },
  list: { gap: 8, paddingBottom: 24 },
});
