// Стол против ботов (этап Б): холст Skia со всеми картами (src/render/TableCanvas.tsx), поверх —
// соперники, строка подсказки и кнопки под большим пальцем (docs/09-game-design.md, «Экран
// партии»). Партия — запись (расстановка, колода, действия): каждое действие сохраняется, после
// перезапуска партия переигрывается (ADR 0002). Боты видят только своё наблюдение.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useInsets } from '../ui/insets';
import { useFont } from '@shopify/react-native-skia';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import * as Crypto from 'expo-crypto';
import { apply, dealOf, deckFrom, firstOf, legalActions, newGame, nextFirst, observe, reasonOf, replay, RULES_V1 } from '../engine';
import type { Action, Card, GameRecord, Result, State, Variant } from '../engine';
import { adviseThink, makeRng, think, THINK_MS, TOP } from '../bot';
import { reviewGame } from './review';
import type { Advice, Level, Review } from '../bot';
import { thinkSliced } from './think';
import type { ThinkJob } from './think';
import { T } from '../i18n';
import { gameEnded, gameStarted, leavingEnd } from '../money';
import { Button } from '../ui/Button';
import { C, RADIUS, SPACE, TOP_BAR, TYPE } from '../ui/theme';
import { TableCanvas } from '../render/TableCanvas';
import { CONTROLS, layoutTable } from '../render/layout';
import { botDelay } from '../state/settings';
import { useLessMotion, useSettings } from '../state/store';
import { dropGame, saveGame } from '../state/save';
import type { SavedGame } from '../state/save';
import { botToAct, tapCard, YOU } from './table';
import { autoPass, canUndo, seenGrid } from './flow';
import { SeenCards } from './SeenCards';
import { SeatPlate } from './SeatPlate';
import { ReviewScreen } from './ReviewScreen';
import { actionText, worstText } from './words';
import { addFinished, setReview as storeReview } from '../state/history';

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
/** Слова подсказки для действия: «пас» ходящего при всём покрытом — «бито». */
const adviceText = (a: Action, s: State): string => actionText(a, s.table.every(([, d]) => d !== null));

const stateOf = (r: GameRecord): State => newGame({ rules: r.rules, variant: r.variant, seats: r.seats, first: r.first }, r.deck);

export function GameScreen({ variant, bots, level, restored, onExit, onStore }: {
  variant: Variant; bots: number; level: Level; restored?: SavedGame | null; onExit: () => void; onStore: () => void;
}) {
  const insets = useInsets();
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
  // разбор (docs/10-bot.md, «Разбор»): считается кусками после партии, пока виден итог; главная ошибка — на итоге
  const hinted = useRef(false);
  const [review, setReview] = useState<Review | null>(null);
  const [showReview, setShowReview] = useState(false);
  const reviewJob = useRef<ThinkJob<Review> | null>(null);
  useEffect(() => () => reviewJob.current?.cancel(), []);
  const gameAt = (r: GameRecord) => r.actions[0]?.at ?? startedAt.current;
  const finished = (rec: GameRecord) => {
    const at = gameAt(rec);
    void addFinished({ record: rec, level: lvl, at, end: Date.now(), hinted: hinted.current, review: null });
    reviewJob.current?.cancel();
    const job = thinkSliced(reviewGame(rec, YOU), 1e9);
    reviewJob.current = job;
    job.promise.then(r => { setReview(r); void storeReview(at, r); }, () => {});
  };

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
      finished(rec);
    } else {
      saveGame({ record: rec, level: lvl, history: history.current });
    }
  };

  // ход ботов: первый бот с действиями от ходящего, с паузой, — человек может успеть раньше. Бот думает
  // кусками во время паузы (src/game/think.ts): экран не замирает; пауза та же, пока ему её хватает
  useEffect(() => {
    const seat = botToAct(state, s => s !== YOU);
    if (seat < 0) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pause = fast ? 60 : botDelay(settings.botSpeed, rng.current.next()), from = Date.now();
    const job = thinkSliced(think(observe(state, seat), lvl, rng.current), THINK_MS[lvl]);
    job.promise.then(a => { if (live) timer = setTimeout(() => act(seat, a), Math.max(0, pause - (Date.now() - from))); }, () => {});
    return () => { live = false; job.cancel(); if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, record, lvl, settings.botSpeed]);

  // «Подсказка»: что сделал бы «Мастер» — кусками, пока игрок ждёт (docs/09-game-design.md)
  const [advising, setAdvising] = useState(false);
  const adviseJob = useRef<ThinkJob<Advice> | null>(null);
  useEffect(() => () => adviseJob.current?.cancel(), [state]);
  const advise = () => {
    if (advising) return;
    hinted.current = true;
    setAdvising(true);
    setNote(T.game.thinking);
    const job = thinkSliced(adviseThink(observe(state, YOU), makeRng(record.actions.length + 1)), THINK_MS[TOP]);
    adviseJob.current = job;
    job.promise.then(a => { setAdvising(false); setNote(T.game.advice(adviceText(a.action, state), a.chance, a.exact)); }, () => setAdvising(false));
  };

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
  const layout = useMemo(() => (size ? layoutTable(view, { ...size, order: settings.handOrder, picked: picked?.card ?? null, targets, showOpenly: settings.memoryAid }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, size, settings.handOrder, settings.memoryAid, picked]);

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
    reviewJob.current?.cancel();
    setReview(null);
    setShowReview(false);
    hinted.current = false;
  };

  const hint = state.phase === 'end' ? '' : picked ? (transfer ? T.game.pickTargetOrTransfer : T.game.pickTarget) : iDefend
    ? (variant === 'perevodnoy' ? T.game.hintDefendTransfer : T.game.hintDefend)
    : mine.some(a => a.type === 'attack') ? T.game.hintAttack
    : state.phase === 'giving' && canPass ? T.game.hintGive
    : canPass ? (allCovered && autoPass(state, YOU) ? T.game.hintAutoDone : T.game.hintThrow) : T.game.hintWait;

  const name = () => T.level[lvl];
  const resultText = (r: Result) => r.draw || r.fool === null ? T.result.draw
    : r.fool === YOU ? T.result.lose
    : seats === 2 ? T.result.win : `${T.result.win}. ${T.result.other(`${T.game.bot(r.fool)} · ${name()}`)}`;
  const oppW = size ? Math.min(180, size.width / Math.max(1, bots) - 6) : 120;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.width - width) > 1 || Math.abs(size.height - height) > 1) setSize({ width, height });
  };

  if (showReview) {
    return <ReviewScreen review={review} at={record.actions[0]?.at ?? 0} lastToday onBack={() => setShowReview(false)} onStore={onStore} />;
  }
  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACE.s, paddingBottom: insets.bottom + SPACE.s }]} testID="game">
      <View style={styles.top}>
        <Button small label={T.game.menu} kind="ghost" onPress={onExit} testID="game-menu" />
        <Text style={styles.variant} numberOfLines={1}>{T.variant[variant]} · {T.level[lvl]}</Text>
        {settings.memoryAid ? <Button small label={T.game.seen} kind="ghost" onPress={() => setShowSeen(v => !v)} testID="seen" /> : null}
      </View>
      <View style={styles.area} onLayout={onLayout} testID="table">
        {layout && font && small ? (
          <TableCanvas key={deal} layout={layout} font={font} small={small} fourColor={settings.fourColor} less={less}
            hand={state.hands[YOU]} table={state.table} enabled={state.phase !== 'end'}
            touch={{ onCard, onTableCard, onDrop }} />
        ) : null}
        {layout ? layout.opponents.map(p => (
          // вчетвером «Бот 1 · Средний» в строку не влезает — уровень уходит во вторую строку
          <SeatPlate key={p.seat} testID={`opp-${p.seat}`} name={oppW >= 150 ? `${T.game.bot(p.seat)} · ${name()}` : T.game.bot(p.seat)}
            info={`${oppW >= 150 ? '' : `${name()} · `}${state.out.includes(p.seat) ? T.game.out : T.game.cards(state.hands[p.seat].length)}`}
            role={state.phase === 'end' ? null : state.attacker === p.seat ? T.game.attacking : state.defender === p.seat ? T.game.defending : null}
            active={state.phase !== 'end' && (state.attacker === p.seat || state.defender === p.seat)}
            left={p.x - oppW / 2} width={oppW} top={Math.max(0, p.y - layout.ch * 0.55 * 0.5 - 66)} />
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
              <View style={styles.helpers} pointerEvents="box-none">
                {canUndo(record, YOU) && state.phase !== 'end' ? <Button small label={T.game.undo} kind="ghost" onPress={undo} testID="undo" /> : null}
                {state.phase !== 'end' && mine.length > 0 ? <Button small label={T.game.advise} kind="ghost" onPress={advise} testID="advise" /> : null}
              </View>
              <View style={styles.actions} pointerEvents="box-none">
                {transfer ? <Button label={T.game.transfer} kind="ghost" onPress={() => { setPicked(null); act(YOU, transfer); }} testID="transfer" /> : null}
                {canTake ? <Button label={T.game.take} kind="ghost" onPress={() => act(YOU, { type: 'take' })} testID="take" /> : null}
                {canPass ? <Button label={allCovered ? T.game.done : T.game.pass} onPress={() => act(YOU, { type: 'pass' })} testID="pass" /> : null}
              </View>
            </View>
          </View>
        ) : null}
        {state.phase === 'end' && state.result ? (
          <View style={styles.result} testID="result">
            <Text style={styles.resultText}>{resultText(state.result)}</Text>
            <Text style={styles.worst} testID="result-worst">{!review ? T.result.counting : review.worst ? worstText(review.worst) : T.result.clean}</Text>
            <Button label={T.result.again} onPress={again} testID="again" />
            <Button label={T.result.review} kind="ghost" onPress={() => setShowReview(true)} testID="result-review" />
            <Button label={T.game.menu} kind="ghost" onPress={() => { leaveEnd(); onExit(); }} testID="result-menu" />
          </View>
        ) : null}
        {showSeen ? <SeenCards grid={seenGrid(view)} onClose={() => setShowSeen(false)} fourColor={settings.fourColor} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: SPACE.s, gap: SPACE.xs },
  // верхняя полоса постоянной высоты: что бы ни появлялось на экране, стол не меняет размер
  top: { height: TOP_BAR, flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  variant: { color: C.dim, fontSize: TYPE.caption, flex: 1 },
  area: { flex: 1 },
  talonText: { position: 'absolute', width: 80, textAlign: 'center', color: C.dim, fontSize: TYPE.caption },
  controls: { position: 'absolute', left: 8, right: 8, gap: SPACE.s },
  hint: { color: C.text, fontSize: TYPE.body, textAlign: 'center', minHeight: 20 },
  buttons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.s, minHeight: 48 },
  helpers: { flexDirection: 'row', gap: SPACE.s, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: SPACE.s, marginLeft: 'auto' },
  result: { position: 'absolute', left: 16, right: 16, top: '30%', gap: SPACE.m, padding: SPACE.l, borderRadius: RADIUS.panel, backgroundColor: C.sheet, borderWidth: 1, borderColor: C.glassLine },
  resultText: { color: C.text, fontSize: TYPE.section, fontWeight: '700', textAlign: 'center' },
  worst: { color: C.dim, fontSize: TYPE.body, textAlign: 'center' },
});
