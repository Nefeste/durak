// Стол онлайн (docs/09-game-design.md, «Онлайн»): пока ждём — код, ссылка и места; партия — тот же
// холст Skia, что с ботами, но по виду места с сервера (ADR 0008). Онлайн нет помощников: ни
// подсказки, ни вышедших карт, ни отмены (ADR 0006). После партии — итог, проверка колоды и «Реванш».
import React, { useEffect, useMemo, useReducer, useState, useRef } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useInsets } from '../ui/insets';
import { useFont } from '@shopify/react-native-skia';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import { legalActions, stateFrom } from '../engine';
import type { Action, Card, Result } from '../engine';
import { layout as fill, unseen } from '../bot/legal';
import { T } from '../i18n';
import { gameEnded, leavingEnd } from '../money';
import { Button } from '../ui/Button';
import { C, RADIUS, TOP_BAR } from '../ui/theme';
import { TableCanvas } from '../render/TableCanvas';
import { CONTROLS, layoutTable } from '../render/layout';
import { useLessMotion, useSettings } from '../state/store';
import type { OnlineTable } from '../state/online';
import type { SeatView, TableView } from '../state/protocol';
import { net, newSeed } from '../state/onlineStore';
import { tapCard } from './table';

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
  const pad = { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 };
  if (!t) return <View style={[styles.root, pad]} testID="online-loading"><Text style={styles.dim}>{T.online.waiting}</Text></View>;
  if (t.status === 'waiting' || t.status === 'cancelled') return <Lobby t={t} onExit={onExit} pad={pad} />;
  return <Play table={table} t={t} onExit={onExit} pad={pad} down={table.down} />;
}

function Lobby({ t, onExit, pad }: { t: TableView; onExit: () => void; pad: object }) {
  const host = t.you === t.host;
  const [err, setErr] = useState<string | null>(null);
  const start = () => { setErr(null); net.start(t.id).catch(e => setErr(T.online.errors[(e as { kind?: string }).kind ?? 'other'] ?? T.online.errors.other)); };
  const leave = () => { if (host && t.status === 'waiting') void net.cancel(t.id).catch(() => {}); onExit(); };
  const link = t.code ? inviteLink(t.code) : '';
  return (
    <View style={[styles.root, pad, styles.lobby]} testID="lobby">
      <Text style={styles.dim}>{T.variant[t.variant]}</Text>
      {t.kind === 'friend' && t.code ? (
        <View style={styles.panel}>
          <Text style={styles.dim}>{T.online.code}</Text>
          <Text style={styles.code} testID="table-code" selectable>{t.code}</Text>
          <Button label={T.online.share} kind="ghost" onPress={() => void Share.share({ message: T.online.shareText(link) }).catch(() => {})} testID="share" />
        </View>
      ) : null}
      <View style={styles.panel}>
        <Text style={styles.dim}>{T.online.waiting}</Text>
        {t.seats.map((s, i) => (
          <Text key={i} style={styles.seat} testID={`lobby-seat-${i}`}>{i + 1}. {s ? seatName(s) : t.bots ? T.online.botSeat(T.level[t.bots]) : T.online.emptySeat}</Text>
        ))}
      </View>
      {host && t.kind === 'friend' ? (
        <>
          {t.bots ? <Text style={styles.dim}>{T.online.startHint}</Text> : null}
          <Button label={T.online.start} onPress={start} testID="start" />
        </>
      ) : null}
      {err ? <Text style={styles.err} testID="online-error">{err}</Text> : null}
      <Button label={host && t.kind === 'friend' ? T.online.cancelTable : T.online.leave} kind="ghost" onPress={leave} testID="lobby-leave" />
    </View>
  );
}

function Play({ table, t, onExit, pad, down }: { table: OnlineTable; t: TableView; onExit: () => void; pad: object; down: boolean }) {
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
    if (!state) return;
    setNote(null);
    if (picked?.card === c) { setPicked(null); return; }
    const r = tapCard(state, t.you, c);
    if (!r) { setPicked(null); return; }
    if ('now' in r) { send(r.now); return; }
    setPicked({ card: c, options: r.choose });
  };
  const onTableCard = (attack: Card) => {
    const a = picked?.options.find(o => o.type === 'beat' && o.on === attack);
    if (a) send(a);
  };
  const onDrop = (c: Card, on: Card | null) => {
    if (!state) return;
    const r = tapCard(state, t.you, c);
    if (!r) return;
    if ('now' in r) { send(r.now); return; }
    const a = (on !== null && r.choose.find(o => o.type === 'beat' && o.on === on)) || r.choose.find(o => o.type === 'transfer');
    if (a) send(a); else setPicked({ card: c, options: r.choose });
  };

  const targets = picked ? picked.options.flatMap(o => (o.type === 'beat' ? [o.on] : [])) : [];
  const lay = useMemo(() => (size && view ? layoutTable(view, { ...size, order: settings.handOrder, picked: picked?.card ?? null, targets }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, size, settings.handOrder, picked]);
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
  const oppW = size ? Math.min(180, size.width / Math.max(1, t.seats.length - 1) - 6) : 120;

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
    <View style={[styles.root, pad, { paddingHorizontal: 8 }]} testID="online-game">
      <View style={styles.top}>
        <Button small label={t.status === 'finished' ? T.game.menu : t.kind === 'quick' ? T.online.resign : T.online.leave} kind="ghost"
          onPress={t.status === 'finished' ? onExit : resign} testID="online-exit" />
        <Text style={[styles.dim, styles.topTitle]} numberOfLines={1}>{T.variant[t.variant]}{left !== null ? ` · ${T.online.secs(left)}` : ''}</Text>
      </View>
      <View style={styles.area} onLayout={onLayout} testID="table">
        {down ? <Text style={[styles.err, styles.down]} pointerEvents="none" testID="online-down">{T.online.noNet}</Text> : null}
        {lay && font && small && view ? (
          <TableCanvas key={g.no} layout={lay} font={font} small={small} fourColor={settings.fourColor} less={less}
            hand={view.hand} table={view.table} enabled={view.phase !== 'end'} touch={{ onCard, onTableCard, onDrop }} />
        ) : null}
        {lay && view ? lay.opponents.map(p => {
          const s = t.seats[p.seat];
          return (
            <View key={p.seat} pointerEvents="none" testID={`opp-${p.seat}`}
              style={[styles.opp, { left: p.x - oppW / 2, width: oppW, top: Math.max(0, p.y - lay.ch * 0.55 * 0.5 - 58) }]}>
              <Text style={styles.oppName} numberOfLines={1}>{seatName(s)}</Text>
              <Text style={styles.oppInfo} numberOfLines={1} testID={`opp-${p.seat}-cards`}>
                {s?.botFor ? T.online.playingFor(s.name) : s && !s.online ? T.online.offline
                  : view.out.includes(p.seat) ? T.game.out : T.game.cards(view.handSizes[p.seat])}
              </Text>
              <Text style={styles.oppRole} numberOfLines={1}>
                {view.attacker === p.seat ? T.game.attacking : view.defender === p.seat ? T.game.defending : ' '}
              </Text>
            </View>
          );
        }) : null}
        {lay && view && view.talonSize > 0 ? (
          <Text pointerEvents="none" style={[styles.talon, { left: lay.talon.x - 40, top: lay.talon.y + lay.ch * 0.62 }]} testID="talon">{T.game.talon(view.talonSize)}</Text>
        ) : null}
        {lay && view && view.talonSize === 0 ? (
          <Text pointerEvents="none" style={[styles.talon, { left: lay.talon.x - 40, top: lay.talon.y - 10 }]}>{T.game.trumpIs(T.suits[Math.floor(view.trump / 9)])}</Text>
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
        {t.status === 'finished' && g.result ? (
          <View style={styles.result} testID="result">
            <Text style={styles.resultText}>{result(g.result)}</Text>
            {table.check ? (
              <Text style={table.check.ok ? styles.ok : styles.err} testID="deck-check">
                {table.check.ok ? T.online.deckOk(table.check.cards) : T.online.deckBad}
              </Text>
            ) : null}
            {asked || g.rematch[t.you] ? <Text style={styles.dim} testID="rematch-wait">{T.online.rematchWait}</Text>
              : <Button label={T.online.rematch} onPress={rematch} testID="rematch" />}
            <Button label={T.game.menu} kind="ghost" onPress={() => { leavingEnd({ wonVsBot: false }); onExit(); }} testID="result-menu" />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20, gap: 8 },
  lobby: { gap: 16 },
  panel: { gap: 8, padding: 16, borderRadius: RADIUS.card, backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine },
  code: { color: C.accent, fontSize: 44, fontWeight: '800', letterSpacing: 6 },
  seat: { color: C.text, fontSize: 17 },
  dim: { color: C.dim, fontSize: 14 },
  err: { color: C.danger, fontSize: 15, textAlign: 'center' },
  ok: { color: C.ok, fontSize: 15, textAlign: 'center' },
  // верхняя полоса постоянной высоты, строка «нет связи» — поверх стола: стол не меняет размер
  top: { height: TOP_BAR, flexDirection: 'row', alignItems: 'center', gap: 8 },
  topTitle: { flex: 1, textAlign: 'right' },
  down: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 5, paddingVertical: 6, backgroundColor: C.sheet },
  area: { flex: 1 },
  opp: { position: 'absolute', alignItems: 'center' },
  oppName: { color: C.text, fontSize: 15, fontWeight: '700' },
  oppInfo: { color: C.dim, fontSize: 13 },
  oppRole: { color: C.accent, fontSize: 13 },
  talon: { position: 'absolute', width: 80, textAlign: 'center', color: C.dim, fontSize: 13 },
  controls: { position: 'absolute', left: 8, right: 8, gap: 8 },
  hint: { color: C.text, fontSize: 15, textAlign: 'center', minHeight: 20 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, minHeight: 48 },
  result: { position: 'absolute', left: 16, right: 16, top: '25%', gap: 10, padding: 16, borderRadius: RADIUS.card, backgroundColor: C.sheet, borderWidth: 1, borderColor: C.glassLine },
  resultText: { color: C.text, fontSize: 19, fontWeight: '700', textAlign: 'center' },
});
