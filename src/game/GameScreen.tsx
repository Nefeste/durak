// Стол против ботов (этап Б): холст Skia со всеми картами (src/render/TableCanvas.tsx), поверх —
// соперники, строка подсказки и кнопки под большим пальцем (docs/09-game-design.md, «Экран
// партии»). Партия — запись (расстановка, колода, действия): каждое действие сохраняется, после
// перезапуска партия переигрывается (ADR 0002). Боты видят только своё наблюдение.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useInsets } from '../ui/insets';
import { useFont } from '@shopify/react-native-skia';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import * as Crypto from 'expo-crypto';
import { apply, dealOf, deckFrom, firstOf, legalActions, lostBy, newGame, nextFirst, observe, reasonOf, replay, rulesWith, throwerOf } from '../engine';
import type { Action, Card, GameRecord, Observation, Result, State, ThrowOrder, Variant } from '../engine';
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
import { CONTROLS_GAP, layoutTable, plateOf, plateHeight, TITLE_SCALE } from '../render/layout';
import { useOrigins } from '../render/useOrigins';
import { useTableCues } from './useTableCues';
import { botDelay } from '../state/settings';
import { getSettings, setSettings, useLessMotion, useSettings } from '../state/store';
import { dropGame, saveGame } from '../state/save';
import type { SavedGame } from '../state/save';
import { botTurn, levelAt, tapCard, YOU } from './table';
import { autoPass, canUndo, finishWithoutYou, seenGrid } from './flow';
import { heldView, holdMs, tableLabel } from './hold';
import { useHold } from './useHold';
import { SeenCards } from './SeenCards';
import { plateLines, SeatPlate } from './SeatPlate';
import { ResultSheet, sheetText } from './ResultSheet';
import { resultPlaces } from './outcome';
import { ReviewScreen } from './ReviewScreen';
import { actionText, worstText } from './words';
import { addFinished, setReview as storeReview } from '../state/history';
import { Dialog } from '../ui/dialog';
import { Glass } from '../ui/Glass';
import { CardPicture } from '../render/CardPicture';
import { RulesScreen } from '../screens/RulesScreen';
import { RULES_PICTURES } from './rulesPictures';
import { newbieDone, newbieTip } from './newbie';
import { noteOf } from './note';
import type { Note } from './note';

const fast = typeof globalThis.location !== 'undefined' && /[?&]fast=1/.test(globalThis.location.search);
/** Снимки «до — после» (tools/design/flow.ts): `?seed=N` — одна и та же колода и те же решения ботов в каждой сборке.
 *  Только веб-сборка для проверок; на телефоне колода всегда из случайных байт (ADR 0004). */
const seedParam = typeof globalThis.location !== 'undefined' ? Number(/[?&]seed=(\d+)/.exec(globalThis.location.search)?.[1]) : NaN;
const fixedSeed = Number.isFinite(seedParam) ? seedParam : null;
function seededBytes(seed: number): Uint8Array {
  let x = ((seed ^ 0x9e3779b9) >>> 0) || 1;
  const out = new Uint8Array(32);
  for (let i = 0; i < out.length; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; out[i] = x & 255; }
  return out;
}
/** Пауза перед «бито» само, когда подкинуть нечего (docs/09-game-design.md, «Темп»). */
const AUTO_PASS = fast ? 80 : 1500;

/** Новая запись партии: колода из 32 случайных байт телефона, первый ход — по своду (п. 3). */
function newRecord(variant: Variant, seats: number, history: (Result | null)[], deal = 0, order: ThrowOrder = getSettings().throwOrder): GameRecord {
  const deck = deckFrom(fixedSeed === null ? Crypto.getRandomBytes(32) : seededBytes(fixedSeed + deal * 7919));
  const { hands, trump } = dealOf(deck, seats);
  const after = nextFirst(history, seats);
  const lowest = firstOf(hands, trump);
  return {
    v: 1, rules: rulesWith(order), variant, seats, deck, actions: [], result: null,
    first: after ?? lowest.seat, firstWhy: after !== null ? 'afterFool' : lowest.why,
  };
}
/** Слова подсказки для действия: «пас» ходящего при всём покрытом — «бито». */
const adviceText = (a: Action, s: State): string => actionText(a, s.table.every(([, d]) => d !== null));

const stateOf = (r: GameRecord): State => newGame({ rules: r.rules, variant: r.variant, seats: r.seats, first: r.first }, r.deck);

export function GameScreen({ variant, bots, levels, restored, onExit, onStore }: {
  /** Уровни ботов по местам 1 … bots: у каждого бота свой (docs/09-game-design.md, «Боты за столом»). */
  variant: Variant; bots: number; levels: Level[]; restored?: SavedGame | null; onExit: () => void; onStore: () => void;
}) {
  const insets = useInsets();
  const settings = useSettings();
  const less = useLessMotion();
  const seats = bots + 1;
  const history = useRef<(Result | null)[]>(restored?.history ?? []);
  const rng = useRef(makeRng(fixedSeed ?? Crypto.getRandomBytes(4).reduce((a, b) => a * 256 + b, 0)));
  const [record, setRecord] = useState<GameRecord>(() => restored?.record ?? newRecord(variant, seats, restored?.history ?? []));
  const [state, setState] = useState<State>(() => (restored ? replay(restored.record) : stateOf(record)));
  const [picked, setPicked] = useState<{ card: Card; options: Action[] } | null>(null);
  // строка «Подсказки» и «так нельзя» — к позиции, где её спросили: следующее действие её гасит (src/game/note.ts)
  const [noted, setNoted] = useState<Note<GameRecord> | null>(null);
  const note = noteOf(noted, record);
  const setNote = (text: string | null, at: GameRecord = record) => setNoted(text === null ? null : { text, at });
  const [showSeen, setShowSeen] = useState(false);
  const [deal, setDeal] = useState(0);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  // пауза перед «бито» и «беру» (src/game/hold.ts): отбой кончился картой — стол виден, пока все её не разглядят;
  // боты ждут конца паузы, касание своей карты её кончает
  const [held, setHeld] = useState<{ n: number; view: Observation } | null>(null);
  const hold = useHold(`${deal}:${record.actions.length}`, held && held.n === record.actions.length ? held.view : null, fast ? 400 : holdMs(less));
  const holding = hold.shown !== null;
  const font = useFont(Onest_700Bold, 15);
  const small = useFont(Onest_700Bold, 26);
  // уровни стола — на всю партию и «Ещё партию»: тот же массив, а не новый с каждой отрисовкой меню (иначе бот думал бы заново)
  const [lvls] = useState(() => restored?.levels ?? levels);
  /** Уровень бота на месте `seat` (места ботов — 1 … bots). */
  const lvlAt = (seat: number): Level => levelAt(lvls, seat);
  // первая партия (docs/09-game-design.md, «Первая партия»): окно о переводе перед первым переводным столом и
  // «Правила» поверх стола; пока они открыты, боты ждут
  const [told, setTold] = useState(() => variant === 'perevodnoy' && !restored && !settings.transferTold);
  const [rulesOpen, setRulesOpen] = useState(false);
  // «Сдаться» (docs/08-rules.md, п. 8; решение владельца #58): своё окно подтверждения, не Alert; пока оно открыто, боты ждут
  const [resignAsk, setResignAsk] = useState(false);
  const [menuAsk, setMenuAsk] = useState(false);
  const paused = told || rulesOpen || resignAsk || menuAsk;
  const { width: winW, fontScale } = useWindowDimensions();
  // плашка бота: имя, уровень, число карт, роль — каждая строкой (docs/13-art.md, §3 «Надписи целиком»)
  // подсказки новичка гаснут после партии, которую начали с ними (включённые посреди партии — со следующей)
  const teaching = useRef(settings.newbie);
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
    void addFinished({ record: rec, levels: lvls, at, end: Date.now(), hinted: hinted.current, review: null });
    reviewJob.current?.cancel();
    const job = thinkSliced(reviewGame(rec, YOU), 1e9);
    reviewJob.current = job;
    job.promise.then(r => { setReview(r); void storeReview(at, r); }, () => {});
  };

  const act = (seat: number, a: Action) => {
    if (reasonOf(state, seat, a) !== null) return;
    let next = apply(state, seat, a);
    const at = Date.now();
    let actions = [...record.actions, { seat, action: a, at }];
    // вы сдались, а ботов за столом двое и больше — они доигрывают сразу, без показа (docs/08-rules.md, п. 8.7)
    if (a.type === 'resign' && next.phase !== 'end') {
      const rest = finishWithoutYou(next, rng.current);
      next = rest.state;
      actions = [...actions, ...rest.actions.map(x => ({ ...x, at }))];
    }
    const rec: GameRecord = { ...record, actions, result: next.result };
    const h = heldView(observe(state, YOU), seat, a, next);
    setHeld(h ? { n: rec.actions.length, view: h } : null);
    setState(next);
    setRecord(rec);
    if (next.phase === 'end') {
      if (next.result) history.current.push(next.result);
      gameEnded(Date.now() - startedAt.current);
      dropGame();
      finished(rec);
    } else {
      saveGame({ record: rec, levels: lvls, history: history.current });
    }
  };

  // ход ботов: первый бот с действиями от ходящего, с паузой, — человек может успеть раньше. Бот думает
  // кусками во время паузы (src/game/think.ts): экран не замирает; пауза та же, пока ему её хватает
  useEffect(() => {
    const turn = botTurn(state, lvls);
    if (!turn || paused || holding) return;
    const { seat, level: lvl } = turn;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pause = fast ? 60 : botDelay(settings.botSpeed, rng.current.next()), from = Date.now();
    const job = thinkSliced(think(observe(state, seat), lvl, rng.current), THINK_MS[lvl]);
    job.promise.then(a => { if (live) timer = setTimeout(() => act(seat, a), Math.max(0, pause - (Date.now() - from))); }, () => {});
    return () => { live = false; job.cancel(); if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, record, lvls, settings.botSpeed, paused, holding]);

  // «Подсказка»: что сделал бы «Опытный» — кусками, пока игрок ждёт (docs/09-game-design.md)
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
    const at = record;
    job.promise.then(a => { setAdvising(false); setNote(T.game.advice(adviceText(a.action, state), a.chance, a.exact), at); }, () => setAdvising(false));
  };

  // учили в этой партии три отбоя — дальше игрок сам
  useEffect(() => {
    if (teaching.current && settings.newbie && newbieDone(state)) { teaching.current = false; setSettings({ newbie: false }); }
  }, [state, settings.newbie]);

  // «бито» само: всё покрыто, а подкинуть нечего
  useEffect(() => {
    if (paused || !autoPass(state, YOU)) return;
    const t = setTimeout(() => act(YOU, { type: 'pass' }), AUTO_PASS);
    return () => clearTimeout(t);
  });

  const mine = useMemo(() => legalActions(state, YOU), [state]);
  const canTake = mine.some(a => a.type === 'take');
  const canPass = mine.some(a => a.type === 'pass');
  const allCovered = state.table.length > 0 && state.table.every(([, d]) => d !== null);
  const iDefend = state.defender === YOU && state.phase === 'bout' && state.table.length > 0;
  const view = useMemo(() => observe(state, YOU), [state]);
  /** Что на столе сейчас: во время паузы — стол «последняя карта легла». */
  const shown = hold.shown ?? view;
  const targets = picked ? picked.options.flatMap(o => (o.type === 'beat' ? [o.on] : [])) : [];
  const origins = useOrigins(shown);
  useTableCues(shown, deal, less);
  const layout = useMemo(() => (size ? layoutTable(shown, { ...size, origins, order: settings.handOrder, picked: picked?.card ?? null, targets, showOpenly: settings.memoryAid, plate: plateHeight(plateLines(2), fontScale) }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, origins, size, settings.handOrder, settings.memoryAid, picked, fontScale]);

  const explain = (c: Card) => {
    const probe: Action = state.table.length === 0 ? { type: 'attack', cards: [c] }
      : iDefend ? { type: 'beat', card: c, on: state.table.find(([, d]) => d === null)?.[0] ?? -1 }
      : { type: state.phase === 'giving' ? 'give' : 'throwIn', cards: [c] };
    const why = reasonOf(state, YOU, probe);
    if (why) setNote(T.reason[why]);
  };
  const onCard = (c: Card) => {
    hold.skip();
    setNote(null);
    if (picked?.card === c) { setPicked(null); return; }
    const r = tapCard(state, YOU, c);
    if (!r) { setPicked(null); explain(c); return; }
    if ('now' in r) { setPicked(null); act(YOU, r.now); return; }
    setPicked({ card: c, options: r.choose });
  };
  const onTableCard = (attack: Card) => {
    hold.skip();
    if (!picked) return;
    const a = picked.options.find(o => o.type === 'beat' && o.on === attack);
    if (a) { setPicked(null); act(YOU, a); }
  };
  /** Карта брошена на стол; `true` — ход сделан (карта идёт на стол от пальца). */
  const onDrop = (c: Card, on: Card | null): boolean => {
    hold.skip();
    setNote(null);
    setPicked(null);
    const r = tapCard(state, YOU, c);
    if (!r) { explain(c); return false; }
    if ('now' in r) { act(YOU, r.now); return true; }
    const a = (on !== null && r.choose.find(o => o.type === 'beat' && o.on === on)) || r.choose.find(o => o.type === 'transfer');
    if (a) { act(YOU, a); return true; }
    setPicked({ card: c, options: r.choose });
    return false;
  };
  const transfer = picked?.options.find(o => o.type === 'transfer');

  const undo = () => {
    if (!canUndo(record, YOU)) return;
    const rec = { ...record, actions: record.actions.slice(0, -1), result: null };
    setRecord(rec);
    setState(replay(rec));
    setPicked(null);
    saveGame({ record: rec, levels: lvls, history: history.current });
  };
  /** Уход с экрана итога: оценка RuStore или реклама между партиями, если пора (src/money). */
  const leaveEnd = () => { leavingEnd({ wonVsBot: !!state.result && !state.result.draw && !lostBy(state.result, YOU) }); };

  const again = () => {
    leaveEnd();
    setPicked(null);
    setNote(null);
    const rec = newRecord(variant, seats, history.current, deal + 1);
    setRecord(rec);
    setState(stateOf(rec));
    setDeal(d => d + 1);
    reviewJob.current?.cancel();
    setReview(null);
    setShowReview(false);
    hinted.current = false;
    teaching.current = getSettings().newbie;
  };

  const tip = settings.newbie ? newbieTip(state, YOU) : null;
  /** Чья очередь подкидывать (п. 4.3): у стола «кто успел» — никого. */
  const thrower = throwerOf(state);
  const hint = state.phase === 'end' ? '' : picked ? (transfer ? T.game.pickTargetOrTransfer : T.game.pickTarget) : tip ? T.game.newbie[tip] : iDefend
    ? (variant === 'perevodnoy' ? T.game.hintDefendTransfer : T.game.hintDefend)
    : mine.some(a => a.type === 'attack') ? T.game.hintAttack
    : state.phase === 'giving' && canPass ? T.game.hintGive
    : canPass ? (allCovered && autoPass(state, YOU) ? T.game.hintAutoDone : T.game.hintThrow)
    : thrower >= 0 && thrower !== YOU && state.defender !== YOU ? T.game.hintQueue(T.game.bot(thrower)) : T.game.hintWait;

  const name = (seat: number) => T.level[lvlAt(seat)];
  const resultText = (r: Result) => (r.resigned ?? []).includes(YOU) ? T.result.youResigned
    : r.draw || r.fool === null ? T.result.draw
    : r.fool === YOU ? T.result.lose
    : seats === 2 ? T.result.win : r.order[0] === YOU ? T.result.first : T.result.win;

  const plate = plateOf(size?.width ?? 412, bots, plateLines(2), fontScale);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.width - width) > 1 || Math.abs(size.height - height) > 1) setSize({ width, height });
  };

  if (rulesOpen) return <RulesScreen section="transfer" onBack={() => setRulesOpen(false)} />;
  if (showReview) {
    return <ReviewScreen review={review} record={record} counting at={record.actions[0]?.at ?? 0} lastToday onBack={() => setShowReview(false)} onStore={onStore} />;
  }
  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACE.s, paddingBottom: insets.bottom + SPACE.s }]} testID="game">
      <View style={styles.top}>
        {/* «В меню» — окно партии: выйти (партия сохранится) или «Сдаться» (п. 8, #58); после конца — сразу в меню */}
        <Button small label={T.game.menu} kind="ghost" onPress={() => { if (state.phase === 'end') { onExit(); return; } hold.skip(); setMenuAsk(true); }} testID="game-menu" />
        {/* в полосе — только стол: уровень каждого бота — на его плашке («Переводной · Начинающий» с «Вышедшими» на 360 точках
            обрезался); название растёт с шрифтом телефона до ×1,15 — так на 360 точках рядом помещаются обе кнопки */}
        <Text style={styles.variant} maxFontSizeMultiplier={TITLE_SCALE} testID="game-title">{T.variant[variant]}</Text>
        {settings.memoryAid ? <Button small label={T.game.seen} kind="ghost" onPress={() => setShowSeen(v => !v)} testID="seen" /> : null}
      </View>
      <View style={styles.area} onLayout={onLayout} testID="table">
        {layout && font && small ? (
          <TableCanvas key={deal} layout={layout} font={font} small={small} fourColor={settings.fourColor} less={less}
            hand={shown.hand} table={shown.table} enabled={state.phase !== 'end'}
            touch={{ onCard, onTableCard, onDrop }} />
        ) : null}
        {layout ? layout.opponents.map(p => (
          <SeatPlate key={p.seat} testID={`opp-${p.seat}`} name={T.game.bot(p.seat)}
            lines={[name(p.seat), shown.out.includes(p.seat) ? T.game.out : T.game.cards(shown.handSizes[p.seat])]}
            role={state.phase === 'end' ? null : state.attacker === p.seat ? T.game.attacking : state.defender === p.seat ? T.game.defending : thrower === p.seat ? T.game.throwing : null}
            active={state.phase !== 'end' && (state.attacker === p.seat || state.defender === p.seat || thrower === p.seat)}
            left={p.x - plate.w / 2} width={plate.w} top={layout.plate.top} height={layout.plate.height} />
        )) : null}
        {layout && shown.talonSize > 0 ? (
          <Glass radius={RADIUS.pill} style={[styles.talonPill, { left: layout.talonLabel.x, top: layout.talonLabel.y - 13 }]}>
            <Text pointerEvents="none" style={styles.talonText} testID="talon">{T.game.talon(shown.talonSize)}</Text>
          </Glass>
        ) : null}
        {layout && shown.talonSize === 0 ? (
          <Glass radius={RADIUS.pill} style={[styles.talonPill, { left: layout.table.x + SPACE.s, top: layout.talon.y - 13 }]}>
            <Text pointerEvents="none" style={styles.talonText}>{T.game.trumpIs(T.suits[Math.floor(state.trump / 9)])}</Text>
          </Glass>
        ) : null}
        {layout ? (
          <View pointerEvents="box-none" style={[styles.controls, { bottom: (size?.height ?? 0) - layout.handTop + CONTROLS_GAP }]}>
            {/* подсказка — стеклянная капсула над рукой (13-art.md §6); пустая строка — капсулы нет, место остаётся */}
            <View style={styles.hintRow} pointerEvents="none">
              {state.phase === 'end' || !(note ?? hint) ? <Text style={styles.hint} testID="hint">{''}</Text> : (
                <Glass radius={RADIUS.pill} style={styles.hintPill}>
                  <Text style={styles.hint} testID="hint" maxFontSizeMultiplier={1.3}>{note ?? hint}</Text>
                </Glass>
              )}
            </View>
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
        {/* окно о переводе — один раз, перед первым переводным столом; «Правила перевода» — поверх стола */}
        <Dialog onClose={() => { setTold(false); setSettings({ transferTold: true }); }} spec={told ? {
          title: T.game.transferWhat.title, text: T.game.transferWhat.text, cancel: null,
          body: <CardPicture spec={{ slots: RULES_PICTURES.transfer ?? [], labels: T.game.transferWhat.labels }}
            width={Math.min(winW - SPACE.xl * 2, 520) - SPACE.l * 2} testID="transfer-picture" />,
          actions: [
            { label: T.game.transferWhat.ok, testID: 'transfer-ok' },
            { label: T.game.transferWhat.rules, kind: 'ghost', testID: 'transfer-rules', onPress: () => setRulesOpen(true) },
          ],
        } : null} />
        <Dialog onClose={() => setMenuAsk(false)} spec={menuAsk && state.phase !== 'end' ? {
          title: T.game.menuAsk.title, text: T.game.menuAsk.text, cancel: T.game.resignAsk.cancel,
          actions: [
            { label: T.game.menu, testID: 'game-exit', onPress: () => { setMenuAsk(false); onExit(); } },
            { label: T.game.resign, kind: 'ghost', testID: 'resign', onPress: () => { setMenuAsk(false); setResignAsk(true); } },
          ],
        } : null} />
        <Dialog onClose={() => setResignAsk(false)} spec={resignAsk && state.phase !== 'end' ? {
          title: T.game.resignAsk.title, text: seats > 2 ? T.game.resignAsk.textBots : T.game.resignAsk.text, cancel: T.game.resignAsk.cancel,
          actions: [{ label: T.game.resignAsk.ok, testID: 'resign-ok', onPress: () => { setResignAsk(false); setPicked(null); act(YOU, { type: 'resign' }); } }],
        } : null} />
        {holding ? <View pointerEvents="none" style={styles.held} testID="held" accessible accessibilityLabel={tableLabel(hold.shown!.table)} /> : null}
        {showSeen ? <SeenCards grid={seenGrid(view)} onClose={() => setShowSeen(false)} fourColor={settings.fourColor} /> : null}
      </View>
      {state.phase === 'end' && state.result && !holding ? (
        <ResultSheet bottom={insets.bottom} title={resultText(state.result)} places={resultPlaces(state.result, seat => (seat === YOU ? { name: T.result.you } : { name: T.game.bot(seat), sub: name(seat) }), YOU)}
          lines={<Text style={sheetText.line} testID="result-worst">{!review ? T.result.counting : review.worst ? worstText(review.worst) : T.result.clean}</Text>}
          main={<Button label={T.result.again} onPress={again} testID="again" />}
          rest={[
            <Button key="review" label={T.result.review} kind="ghost" onPress={() => setShowReview(true)} testID="result-review" />,
            <Button key="menu" label={T.game.menu} kind="ghost" onPress={() => { leaveEnd(); onExit(); }} testID="result-menu" />,
          ]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: SPACE.s, gap: SPACE.xs },
  // верхняя полоса постоянной высоты: что бы ни появлялось на экране, стол не меняет размер
  top: { height: TOP_BAR, flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  variant: { color: C.dim, fontSize: TYPE.caption, flex: 1, textAlign: 'center' },
  area: { flex: 1 },
  /** метка паузы для сценария в браузере: невидима, ничего не ловит */
  held: { position: 'absolute', width: 1, height: 1 },
  talonPill: { position: 'absolute', minWidth: 88, paddingHorizontal: SPACE.s, paddingVertical: SPACE.xs },
  talonText: { textAlign: 'center', color: C.dim, fontSize: TYPE.caption },
  controls: { position: 'absolute', left: 8, right: 8, gap: SPACE.s },
  hintRow: { alignItems: 'center', minHeight: 28 },
  hintPill: { paddingHorizontal: SPACE.l, paddingVertical: SPACE.xs },
  hint: { color: C.text, fontSize: TYPE.body, textAlign: 'center' },
  buttons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.s, minHeight: 48 },
  helpers: { flexDirection: 'row', gap: SPACE.s, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: SPACE.s, marginLeft: 'auto' },
});
