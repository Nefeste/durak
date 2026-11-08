// Стол против ботов (этап Б): холст Skia со всеми картами (src/render/TableCanvas.tsx), поверх —
// соперники, строка подсказки и кнопки под большим пальцем (docs/09-game-design.md, «Экран
// партии»). Партия — запись (расстановка, колода, действия): каждое действие сохраняется, после
// перезапуска партия переигрывается (ADR 0002). Боты видят только своё наблюдение.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFont } from '@shopify/react-native-skia';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import * as Crypto from 'expo-crypto';
import { apply, dealOf, deckFrom, firstOf, legalActions, newGame, nextFirst, observe, reasonOf, replay, RULES_V1 } from '../engine';
import type { Action, Card, GameRecord, Result, State, Variant } from '../engine';
import { chooseAction, makeRng } from '../bot';
import type { Level } from '../bot';
import { T } from '../i18n';
import { gameEnded, gameStarted, leavingEnd } from '../money';
import { Button } from '../ui/Button';
import { C, RADIUS } from '../ui/theme';
import { TableCanvas } from '../render/TableCanvas';
import { CONTROLS, layoutTable } from '../render/layout';
import { botDelay } from '../state/settings';
import { useLessMotion, useSettings } from '../state/store';
import { dropGame, saveGame } from '../state/save';
import type { SavedGame } from '../state/save';
import { botToAct, tapCard, YOU } from './table';
import { autoPass, canUndo, seenGrid } from './flow';
import { SeenCards } from './SeenCards';

const fast = typeof globalThis.location !== 'undefined' && /[?&]fast=1/.test(globalThis.location.search);
/** Пауза перед «бито» само, когда подкинуть нечего (docs/09-game-design.md, «Темп»). */
const AUTO_PASS = fast ? 80 : 1500;

/** Новая запись партии: колода из 32 случайных байт телефона, первый ход — по своду (п. 3). */
function newRecord(variant: Variant, seats: number, history: (Result | null)[]): GameRecord {
  const deck = deckFrom(Crypto.getRandomBytes(32));
  const { hands, trump } = dealOf(deck, seats);
  const after = nextFirst(history, seats);
  const lowest = firstOf(hands, trump);
  return {
    v: 1, rules: RULES_V1, variant, seats, deck, actions: [], result: null,
    first: after ?? lowest.seat, firstWhy: after !== null ? 'afterFool' : lowest.why,
  };
}
const stateOf = (r: GameRecord): State => newGame({ rules: r.rules, variant: r.variant, seats: r.seats, first: r.first }, r.deck);

export function GameScreen({ variant, bots, level, restored, onExit }: {
  variant: Variant; bots: number; level: Level; restored?: SavedGame | null; onExit: () => void;
}) {
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const less = useLessMotion();
  const seats = bots + 1;
  const history = useRef<(Result | null)[]>(restored?.history ?? []);
  const rng = useRef(makeRng(Crypto.getRandomBytes(4).reduce((a, b) => a * 256 + b, 0)));
  const [record, setRecord] = useState<GameRecord>(() => restored?.record ?? newRecord(variant, seats, restored?.history ?? []));
  const [state, setState] = useState<State>(() => (restored ? replay(restored.record) : stateOf(record)));
  const [picked, setPicked] = useState<{ card: Card; options: Action[] } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showSeen, setShowSeen] = useState(false);
  const [deal, setDeal] = useState(0);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const font = useFont(Onest_700Bold, 15);
  const small = useFont(Onest_700Bold, 26);
  const lvl = restored?.level ?? level;
  // деньги (src/money): полноэкранная грузится в начале партии и показывается только при уходе с итога
  const startedAt = useRef(0);
  useEffect(() => { startedAt.current = Date.now(); gameStarted(); }, [deal]);

  const act = (seat: number, a: Action) => {
    if (reasonOf(state, seat, a) !== null) return;
    const next = apply(state, seat, a);
    const rec: GameRecord = { ...record, actions: [...record.actions, { seat, action: a, at: Date.now() }], result: next.result };
    setState(next);
    setRecord(rec);
    if (next.phase === 'end') {
      if (next.result) history.current.push(next.result);
      gameEnded(Date.now() - startedAt.current);
      dropGame();
    } else {
      saveGame({ record: rec, level: lvl, history: history.current });
    }
  };

  // ход ботов: первый бот с действиями от ходящего, с паузой, — человек может успеть раньше
  useEffect(() => {
    const seat = botToAct(state, s => s !== YOU);
    if (seat < 0) return;
    const t = setTimeout(() => act(seat, chooseAction(observe(state, seat), lvl, rng.current)), fast ? 60 : botDelay(settings.botSpeed, rng.current.next()));
    return () => clearTimeout(t);
  });

  // «бито» само: всё покрыто, а подкинуть нечего
  useEffect(() => {
    if (!autoPass(state, YOU)) return;
    const t = setTimeout(() => act(YOU, { type: 'pass' }), AUTO_PASS);
    return () => clearTimeout(t);
  });

  const mine = useMemo(() => legalActions(state, YOU), [state]);
  const canTake = mine.some(a => a.type === 'take');
  const canPass = mine.some(a => a.type === 'pass');
  const allCovered = state.table.length > 0 && state.table.every(([, d]) => d !== null);
  const iDefend = state.defender === YOU && state.phase === 'bout' && state.table.length > 0;
  const view = useMemo(() => observe(state, YOU), [state]);
  const targets = picked ? picked.options.flatMap(o => (o.type === 'beat' ? [o.on] : [])) : [];
  const layout = useMemo(() => (size ? layoutTable(view, { ...size, order: settings.handOrder, picked: picked?.card ?? null, targets }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, size, settings.handOrder, picked]);

  const explain = (c: Card) => {
    const probe: Action = state.table.length === 0 ? { type: 'attack', cards: [c] }
      : iDefend ? { type: 'beat', card: c, on: state.table.find(([, d]) => d === null)?.[0] ?? -1 }
      : { type: state.phase === 'giving' ? 'give' : 'throwIn', cards: [c] };
    const why = reasonOf(state, YOU, probe);
    if (why) setNote(T.reason[why]);
  };
  const onCard = (c: Card) => {
    setNote(null);
    if (picked?.card === c) { setPicked(null); return; }
    const r = tapCard(state, YOU, c);
    if (!r) { setPicked(null); explain(c); return; }
    if ('now' in r) { setPicked(null); act(YOU, r.now); return; }
    setPicked({ card: c, options: r.choose });
  };
  const onTableCard = (attack: Card) => {
    if (!picked) return;
    const a = picked.options.find(o => o.type === 'beat' && o.on === attack);
    if (a) { setPicked(null); act(YOU, a); }
  };
  const onDrop = (c: Card, on: Card | null) => {
    setNote(null);
    setPicked(null);
    const r = tapCard(state, YOU, c);
    if (!r) { explain(c); return; }
    if ('now' in r) { act(YOU, r.now); return; }
    const a = (on !== null && r.choose.find(o => o.type === 'beat' && o.on === on)) || r.choose.find(o => o.type === 'transfer');
    if (a) act(YOU, a);
    else setPicked({ card: c, options: r.choose });
  };
  const transfer = picked?.options.find(o => o.type === 'transfer');

  const undo = () => {
    if (!canUndo(record, YOU)) return;
    const rec = { ...record, actions: record.actions.slice(0, -1), result: null };
    setRecord(rec);
    setState(replay(rec));
    setPicked(null);
    saveGame({ record: rec, level: lvl, history: history.current });
  };
  /** Уход с экрана итога: оценка RuStore или реклама между партиями, если пора (src/money). */
  const leaveEnd = () => { leavingEnd({ wonVsBot: !!state.result && !state.result.draw && state.result.fool !== YOU }); };
  const again = () => {
    leaveEnd();
    setPicked(null);
    setNote(null);
    const rec = newRecord(variant, seats, history.current);
    setRecord(rec);
    setState(stateOf(rec));
    setDeal(d => d + 1);
  };

  const hint = state.phase === 'end' ? '' : picked ? (transfer ? T.game.pickTargetOrTransfer : T.game.pickTarget) : iDefend
    ? (variant === 'perevodnoy' ? T.game.hintDefendTransfer : T.game.hintDefend)
    : mine.some(a => a.type === 'attack') ? T.game.hintAttack
    : state.phase === 'giving' && canPass ? T.game.hintGive
    : canPass ? (allCovered && autoPass(state, YOU) ? T.game.hintAutoDone : T.game.hintThrow) : T.game.hintWait;

  const name = () => T.level[lvl];
  const resultText = (r: Result) => r.draw || r.fool === null ? T.result.draw
    : r.fool === YOU ? T.result.lose
    : seats === 2 ? T.result.win : `${T.result.win}. ${T.result.other(`${name()} ${r.fool}`)}`;
  const oppW = size ? Math.min(180, size.width / Math.max(1, bots) - 6) : 120;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.width - width) > 1 || Math.abs(size.height - height) > 1) setSize({ width, height });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]} testID="game">
      <View style={styles.top}>
        <Button label={T.game.menu} kind="ghost" onPress={onExit} testID="game-menu" />
        <Text style={styles.variant}>{T.variant[variant]} · {T.level[lvl]}</Text>
        <View style={styles.topRight}>
          {settings.seenCards ? <Button label={T.game.seen} kind="ghost" onPress={() => setShowSeen(v => !v)} testID="seen" /> : null}
          {canUndo(record, YOU) && state.phase !== 'end' ? <Button label={T.game.undo} kind="ghost" onPress={undo} testID="undo" /> : null}
        </View>
      </View>
      <View style={styles.area} onLayout={onLayout} testID="table">
        {layout && font && small ? (
          <TableCanvas key={deal} layout={layout} font={font} small={small} fourColor={settings.fourColor} less={less}
            hand={state.hands[YOU]} table={state.table} enabled={state.phase !== 'end'}
            touch={{ onCard, onTableCard, onDrop }} />
        ) : null}
        {layout ? layout.opponents.map(p => (
          <View key={p.seat} pointerEvents="none" testID={`opp-${p.seat}`}
            style={[styles.opp, { left: p.x - oppW / 2, width: oppW, top: Math.max(0, p.y - layout.ch * 0.55 * 0.5 - 58) }]}>
            <Text style={styles.oppName} numberOfLines={1}>{name()} {p.seat}</Text>
            <Text style={styles.oppInfo} testID={`opp-${p.seat}-cards`} numberOfLines={1}>
              {T.game.botMark} · {state.out.includes(p.seat) ? T.game.out : T.game.cards(state.hands[p.seat].length)}
            </Text>
            <Text style={styles.oppRole} numberOfLines={1}>
              {state.phase === 'end' ? ' ' : state.attacker === p.seat ? T.game.attacking : state.defender === p.seat ? T.game.defending : ' '}
            </Text>
          </View>
        )) : null}
        {layout && state.talon.length > 0 ? (
          <Text pointerEvents="none" style={[styles.talonText, { left: layout.talon.x - 40, top: layout.talon.y + layout.ch * 0.62 }]} testID="talon">{T.game.talon(state.talon.length)}</Text>
        ) : null}
        {layout && state.talon.length === 0 ? (
          <Text pointerEvents="none" style={[styles.talonText, { left: layout.talon.x - 40, top: layout.talon.y - 10 }]}>{T.game.trumpIs(T.suits[Math.floor(state.trump / 9)])}</Text>
        ) : null}
        {layout ? (
          <View pointerEvents="box-none" style={[styles.controls, { top: layout.handTop - CONTROLS + 8 }]}>
            <Text style={styles.hint} testID="hint">{state.phase === 'end' ? '' : note ?? hint}</Text>
            <View style={styles.buttons} pointerEvents="box-none">
              {transfer ? <Button label={T.game.transfer} kind="ghost" onPress={() => { setPicked(null); act(YOU, transfer); }} testID="transfer" /> : null}
              {canTake ? <Button label={T.game.take} kind="ghost" onPress={() => act(YOU, { type: 'take' })} testID="take" /> : null}
              {canPass ? <Button label={allCovered ? T.game.done : T.game.pass} onPress={() => act(YOU, { type: 'pass' })} testID="pass" /> : null}
            </View>
          </View>
        ) : null}
        {state.phase === 'end' && state.result ? (
          <View style={styles.result} testID="result">
            <Text style={styles.resultText}>{resultText(state.result)}</Text>
            <Button label={T.result.again} onPress={again} testID="again" />
            <Button label={T.game.menu} kind="ghost" onPress={() => { leaveEnd(); onExit(); }} testID="result-menu" />
          </View>
        ) : null}
        {showSeen ? <SeenCards grid={seenGrid(view)} onClose={() => setShowSeen(false)} fourColor={settings.fourColor} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 8, gap: 4 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  topRight: { flexDirection: 'row', gap: 6 },
  variant: { color: C.dim, fontSize: 14, flexShrink: 1 },
  area: { flex: 1 },
  opp: { position: 'absolute', alignItems: 'center' },
  oppName: { color: C.text, fontSize: 15, fontWeight: '700' },
  oppInfo: { color: C.dim, fontSize: 13 },
  oppRole: { color: C.accent, fontSize: 13 },
  talonText: { position: 'absolute', width: 80, textAlign: 'center', color: C.dim, fontSize: 13 },
  controls: { position: 'absolute', left: 8, right: 8, gap: 8 },
  hint: { color: C.text, fontSize: 15, textAlign: 'center', minHeight: 20 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, minHeight: 48 },
  result: { position: 'absolute', left: 16, right: 16, top: '30%', gap: 10, padding: 16, borderRadius: RADIUS.card, backgroundColor: C.sheet, borderWidth: 1, borderColor: C.glassLine },
  resultText: { color: C.text, fontSize: 19, fontWeight: '700', textAlign: 'center' },
});
