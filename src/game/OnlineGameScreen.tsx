// Стол онлайн (docs/09-game-design.md, «Онлайн»): пока ждём — код, ссылка и места; партия — тот же
// холст Skia, что с ботами, но по виду места с сервера (ADR 0008). Онлайн нет помощников: ни
// подсказки, ни вышедших карт, ни отмены (ADR 0006). После партии — итог, проверка колоды и «Реванш».
import React, { useEffect, useMemo, useReducer, useState, useRef } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useInsets } from '../ui/insets';
import { useFont } from '@shopify/react-native-skia';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import { legalActions, stateFrom, throwerSeen } from '../engine';
import type { Action, Card, Result } from '../engine';
import type { Level } from '../bot';
import { layout as fill, unseen } from '../bot/legal';
import { T } from '../i18n';
import { gameEnded, leavingEnd } from '../money';
import { Button } from '../ui/Button';
import { C, RADIUS, SPACE, TOP_BAR, TYPE } from '../ui/theme';
import { TableCanvas } from '../render/TableCanvas';
import { SeatPlate } from './SeatPlate';
import { ResultSheet, sheetText } from './ResultSheet';
import { resultPlaces } from './outcome';
import { CONTROLS, layoutTable, plateOf } from '../render/layout';
import { useOrigins } from '../render/useOrigins';
import { useTableCues } from './useTableCues';
import { useLessMotion, useSettings } from '../state/store';
import type { OnlineTable } from '../state/online';
import type { SeatView, TableView } from '../state/protocol';
import { net, newSeed } from '../state/onlineStore';
import { tapCard } from './table';
import { SeatMap } from './SeatMap';
import { placesOf } from './seats';
import { holdMs, tableLabel } from './hold';
import { useHold } from './useHold';

export const inviteLink = (code: string) => `${net.base}/t/${code}`;

function seatName(s: SeatView | null | undefined): string {
  if (!s) return T.online.emptySeat;
  if (s.bot) return T.online.botSeat(T.level[s.bot]);
  return s.name;
}

export function OnlineGameScreen({ table, onExit }: { table: OnlineTable; onExit: () => void }) {
  const insets = useInsets();
  const [, redraw] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const off = table.on(redraw);
    table.start();
    return () => { off(); table.stop(); };
  }, [table]);
  const t = table.view;
  const pad = { paddingTop: insets.top + SPACE.s, paddingBottom: insets.bottom + SPACE.s };
  if (!t) return <View style={[styles.root, pad]} testID="online-loading"><Text style={styles.dim}>{T.online.waiting}</Text></View>;
  if (t.status === 'waiting' || t.status === 'cancelled') return <Lobby table={table} t={t} onExit={onExit} pad={pad} />;
  return <Play table={table} t={t} onExit={onExit} pad={pad} down={table.down} />;
}

function Lobby({ table, t, onExit, pad }: { table: OnlineTable; t: TableView; onExit: () => void; pad: object }) {
  const host = t.you === t.host;
  const [err, setErr] = useState<string | null>(null);
  const fail = (e: unknown) => setErr(T.online.errors[(e as { kind?: string }).kind ?? 'other'] ?? T.online.errors.other);
  const start = () => { setErr(null); net.start(t.id).catch(fail); };
  // пересесть до начала — с тем же зерном, что отдано за эту партию (сервер переносит его на новое место)
  const mine = table.seedOf(t.game?.no ?? 0);
  const move = t.kind === 'friend' && t.status === 'waiting' && t.code && mine
    ? (seat: number) => { setErr(null); net.join(t.code!, mine.seed, mine.commit, seat).then(v => table.set(v), fail); }
    : undefined;
  const level = host && t.kind === 'friend' && t.status === 'waiting' && t.bots
    ? (seat: number, l: Level) => { setErr(null); net.setBot(t.id, seat, l).then(v => table.set(v), fail); }
    : undefined;
  const leave = () => { if (host && t.status === 'waiting') void net.cancel(t.id).catch(() => {}); onExit(); };
  const link = t.code ? inviteLink(t.code) : '';
  return (
    // прокрутка: вчетвером со строками уровней ботов лобби выше экрана телефона
    <ScrollView style={styles.root} contentContainerStyle={[pad, styles.lobby]} testID="lobby">
      <Text style={styles.dim} testID="lobby-rules">{t.seats.length > 2 ? `${T.variant[t.variant]} · ${T.online.orderOf(t.order ?? 'free')}` : T.variant[t.variant]}</Text>
      {t.kind === 'friend' && t.code ? (
        <View style={styles.panel}>
          <Text style={styles.dim}>{T.online.code}</Text>
          <Text style={styles.code} testID="table-code" selectable>{t.code}</Text>
          <Button label={T.online.share} kind="ghost" onPress={() => void Share.share({ message: T.online.shareText(link) }).catch(() => {})} testID="share" />
        </View>
      ) : null}
      <View style={styles.panel}>
        <Text style={styles.dim}>{T.online.waiting}</Text>
        <SeatMap places={placesOf(t)} host={Math.max(0, t.host)} onSit={move} sitLabel={T.online.moveSeat} onLevel={level} />
      </View>
      {host && t.kind === 'friend' ? (
        <>
          {t.bots ? <Text style={styles.dim}>{T.online.startHint}</Text> : null}
          <Button label={T.online.start} onPress={start} testID="start" />
        </>
      ) : null}
      {err ? <Text style={styles.err} testID="online-error">{err}</Text> : null}
      <Button label={host && t.kind === 'friend' ? T.online.cancelTable : T.online.leave} kind="ghost" onPress={leave} testID="lobby-leave" />
    </ScrollView>
  );
}

function Play({ table, t, onExit, pad, down }: { table: OnlineTable; t: TableView; onExit: () => void; pad: object; down: boolean }) {
  const insets = useInsets();
  const settings = useSettings();
  const less = useLessMotion();
  const font = useFont(Onest_700Bold, 15);
  const small = useFont(Onest_700Bold, 26);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [pick, setPick] = useState<{ card: Card; options: Action[]; at: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [askedNo, setAskedNo] = useState(-1);
  const g = t.game!;
  const at = `${g.no}:${g.n}`;
  // деньги (src/money): партия по сети — в счётчики рекламы, когда кончилась; реклама — только при
  // уходе с итога в меню, никогда во время партии и не между партиями за одним столом
  const started = useRef<{ no: number; at: number } | null>(null);
  const counted = useRef(-1);
  useEffect(() => {
    if (started.current?.no !== g.no) started.current = { no: g.no, at: Date.now() };
    if (t.status !== 'finished' || counted.current === g.no) return;
    counted.current = g.no;
    gameEnded(Date.now() - started.current.at);
  }, [t.status, g.no]);
  // выбранная карта — только для того действия, при котором её выбрали
  const picked = pick && pick.at === at ? pick : null;
  const setPicked = (p: { card: Card; options: Action[] } | null) => setPick(p ? { ...p, at } : null);
  const asked = askedNo === g.no;
  const setAsked = (v: boolean) => setAskedNo(v ? g.no : -1);
  const view = g.view;
  // пауза перед «бито» и «беру» (src/game/hold.ts): сервер присылает стол «последняя карта легла»; после партии —
  // стол последнего отбоя остаётся под итогом
  const hold = useHold(at, t.status === 'playing' ? g.held ?? null : null, holdMs(less));
  const holding = hold.shown !== null;
  const shown = hold.shown ?? view ?? (t.status === 'finished' ? g.held ?? null : null);
  // законные действия места — из наблюдения: скрытые карты подставлены любые (src/bot/legal.ts)
  const state = useMemo(() => {
    if (!view) return null;
    const { hidden, talon } = fill(view, unseen(view));
    return stateFrom(view, hidden, talon);
  }, [view]);
  const mine = useMemo(() => (state ? legalActions(state, t.you) : []), [state, t.you]);
  useEffect(() => {
    if (!g.deadline) return;
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, [g.deadline]);

  const send = (a: Action) => {
    setPicked(null);
    setNote(null);
    void table.act(a).then(why => { if (why && why in T.reason) setNote(T.reason[why as keyof typeof T.reason]); });
  };
  const onCard = (c: Card) => {
    hold.skip();
    if (!state) return;
    setNote(null);
    if (picked?.card === c) { setPicked(null); return; }
    const r = tapCard(state, t.you, c);
    if (!r) { setPicked(null); return; }
    if ('now' in r) { send(r.now); return; }
    setPicked({ card: c, options: r.choose });
  };
  const onTableCard = (attack: Card) => {
    hold.skip();
    const a = picked?.options.find(o => o.type === 'beat' && o.on === attack);
    if (a) send(a);
  };
  const onDrop = (c: Card, on: Card | null) => {
    hold.skip();
    if (!state) return;
    const r = tapCard(state, t.you, c);
    if (!r) return;
    if ('now' in r) { send(r.now); return; }
    const a = (on !== null && r.choose.find(o => o.type === 'beat' && o.on === on)) || r.choose.find(o => o.type === 'transfer');
    if (a) send(a); else setPicked({ card: c, options: r.choose });
  };

  const targets = picked ? picked.options.flatMap(o => (o.type === 'beat' ? [o.on] : [])) : [];
  const origins = useOrigins(shown);
  useTableCues(shown, g.no, less);
  const lay = useMemo(() => (size && shown ? layoutTable(shown, { ...size, origins, order: settings.handOrder, picked: picked?.card ?? null, targets }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, origins, size, settings.handOrder, picked]);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.width - width) > 1 || Math.abs(size.height - height) > 1) setSize({ width, height });
  };

  const canTake = mine.some(a => a.type === 'take');
  const canPass = mine.some(a => a.type === 'pass');
  const transfer = picked?.options.find(o => o.type === 'transfer');
  const allCovered = !!view && view.table.length > 0 && view.table.every(([, d]) => d !== null);
  const iDefend = !!view && view.defender === t.you && view.phase === 'bout' && view.table.length > 0;
  const hint = !view ? '' : picked ? (transfer ? T.game.pickTargetOrTransfer : T.game.pickTarget) : iDefend
    ? (t.variant === 'perevodnoy' ? T.game.hintDefendTransfer : T.game.hintDefend)
    : mine.some(a => a.type === 'attack') ? T.game.hintAttack
    : view.phase === 'giving' && canPass ? T.game.hintGive
    : canPass ? T.game.hintThrow : T.game.hintWait;
  const left = g.deadline && now ? Math.max(0, Math.ceil((g.deadline - now) / 1000)) : null;
  const plate = plateOf(size?.width ?? 412, t.seats.length - 1);
  const oppW = plate.w;

  const result = (r: Result) => r.draw || r.fool === null ? T.result.draw
    : r.fool === t.you ? T.result.lose : T.result.other(seatName(t.seats[r.fool]));
  const rematch = () => {
    if (!g.nextCommit) return;
    const seed = newSeed();
    table.remember({ game: g.no + 1, seed, commit: g.nextCommit });
    setAsked(true);
    void net.rematch(t.id, seed, g.nextCommit).then(v => table.set(v)).catch(() => setAsked(false));
  };
  const resign = () => { void net.resign(t.id).catch(() => {}); if (t.kind === 'friend') onExit(); };

  return (
    <View style={[styles.root, pad, { paddingHorizontal: SPACE.s }]} testID="online-game">
      <View style={styles.top}>
        <Button small label={t.status === 'finished' ? T.game.menu : t.kind === 'quick' ? T.online.resign : T.online.leave} kind="ghost"
          onPress={t.status === 'finished' ? onExit : resign} testID="online-exit" />
        <Text style={[styles.dim, styles.topTitle]} numberOfLines={1}>{T.variant[t.variant]}{left !== null ? ` · ${T.online.secs(left)}` : ''}</Text>
      </View>
      <View style={styles.area} onLayout={onLayout} testID="table">
        {down ? <Text style={[styles.err, styles.down]} pointerEvents="none" testID="online-down">{T.online.noNet}</Text> : null}
        {lay && font && small && shown ? (
          <TableCanvas key={g.no} layout={lay} font={font} small={small} fourColor={settings.fourColor} less={less}
            hand={shown.hand} table={shown.table} enabled={!!view && view.phase !== 'end'} touch={{ onCard, onTableCard, onDrop }} />
        ) : null}
        {holding ? <View pointerEvents="none" style={styles.held} testID="held" accessible accessibilityLabel={tableLabel(hold.shown!.table)} /> : null}
        {lay && shown ? lay.opponents.map(p => {
          const s = t.seats[p.seat];
          return (
            <SeatPlate key={p.seat} testID={`opp-${p.seat}`} name={seatName(s)}
              info={s?.botFor ? T.online.playingFor(s.name) : s && !s.online ? T.online.offline
                : shown.out.includes(p.seat) ? T.game.out : T.game.cards(shown.handSizes[p.seat])}
              role={!view || view.phase === 'end' ? null : view.attacker === p.seat ? T.game.attacking : view.defender === p.seat ? T.game.defending : view && throwerSeen(view) === p.seat ? T.game.throwing : null}
              active={!!view && view.phase !== 'end' && (view.attacker === p.seat || view.defender === p.seat || throwerSeen(view) === p.seat)}
              left={p.x - oppW / 2} width={oppW} top={Math.max(0, p.y - lay.ch * 0.55 * 0.5 - plate.h)} />
          );
        }) : null}
        {lay && shown && shown.talonSize > 0 ? (
          <Text pointerEvents="none" style={[styles.talon, { left: lay.talon.x - 40, top: lay.talon.y + lay.ch * 0.62 }]} testID="talon">{T.game.talon(shown.talonSize)}</Text>
        ) : null}
        {lay && shown && shown.talonSize === 0 ? (
          <Text pointerEvents="none" style={[styles.talon, { left: lay.talon.x - 40, top: lay.talon.y - 10 }]}>{T.game.trumpIs(T.suits[Math.floor(shown.trump / 9)])}</Text>
        ) : null}
        {lay && view ? (
          <View pointerEvents="box-none" style={[styles.controls, { top: lay.handTop - CONTROLS + 8 }]}>
            <Text style={styles.hint} testID="hint">{note ?? hint}</Text>
            <View style={styles.buttons} pointerEvents="box-none">
              {transfer ? <Button label={T.game.transfer} kind="ghost" onPress={() => send(transfer)} testID="transfer" /> : null}
              {canTake ? <Button label={T.game.take} kind="ghost" onPress={() => send({ type: 'take' })} testID="take" /> : null}
              {canPass ? <Button label={allCovered ? T.game.done : T.game.pass} onPress={() => send({ type: 'pass' })} testID="pass" /> : null}
            </View>
          </View>
        ) : null}
      </View>
      {t.status === 'finished' && g.result ? (
        <ResultSheet bottom={insets.bottom} title={result(g.result)}
          places={resultPlaces(g.result, seat => ({ name: seat === t.you ? T.result.you : seatName(t.seats[seat]) }), t.you)}
          lines={table.check ? (
            <Text style={[sheetText.line, table.check.ok ? styles.ok : styles.err]} testID="deck-check">
              {table.check.ok ? T.online.deckOk(table.check.cards) : T.online.deckBad}
            </Text>
          ) : null}
          main={asked || g.rematch[t.you] ? <Text style={sheetText.line} testID="rematch-wait">{T.online.rematchWait}</Text>
            : <Button label={T.online.rematch} onPress={rematch} testID="rematch" />}
          rest={[<Button key="menu" label={T.game.menu} kind="ghost" onPress={() => { leavingEnd({ wonVsBot: false }); onExit(); }} testID="result-menu" />]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: SPACE.l, gap: SPACE.s },
  lobby: { gap: SPACE.l },
  panel: { gap: SPACE.s, padding: SPACE.l, borderRadius: RADIUS.panel, backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine },
  code: { color: C.accent, fontSize: TYPE.display, fontWeight: '800', letterSpacing: 6 },
  dim: { color: C.dim, fontSize: TYPE.caption },
  err: { color: C.danger, fontSize: TYPE.body, textAlign: 'center' },
  ok: { color: C.ok, fontSize: TYPE.body, textAlign: 'center' },
  // верхняя полоса постоянной высоты, строка «нет связи» — поверх стола: стол не меняет размер
  top: { height: TOP_BAR, flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  topTitle: { flex: 1, textAlign: 'right' },
  down: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 5, paddingVertical: SPACE.s, backgroundColor: C.sheet },
  area: { flex: 1 },
  /** метка паузы для сценария в браузере: невидима, ничего не ловит */
  held: { position: 'absolute', width: 1, height: 1 },
  talon: { position: 'absolute', width: 80, textAlign: 'center', color: C.dim, fontSize: TYPE.caption },
  controls: { position: 'absolute', left: 8, right: 8, gap: SPACE.s },
  hint: { color: C.text, fontSize: TYPE.body, textAlign: 'center', minHeight: 20 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACE.m, minHeight: 48 },
});
