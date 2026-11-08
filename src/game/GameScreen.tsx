// Стол против ботов (этап А): портрет, рука снизу, кнопки над рукой (docs/09-game-design.md,
// «Экран партии»). Боты видят только своё наблюдение и ходят с паузой.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { apply, legalActions, observe, reasonOf } from '../engine';
import type { Action, Card, Result, State, Variant } from '../engine';
import { chooseAction, makeRng } from '../bot';
import type { Level } from '../bot';
import { T } from '../i18n';
import { Button } from '../ui/Button';
import { C, RADIUS } from '../ui/theme';
import { CardBack, PlayingCard } from '../render/PlayingCard';
import { botToAct, startGame, tapCard, YOU } from './table';

const fast = typeof globalThis.location !== 'undefined' && /[?&]fast=1/.test(globalThis.location.search);
const BOT_DELAY = fast ? 60 : 700;

export function GameScreen({ variant, bots, level, onExit }: { variant: Variant; bots: number; level: Level; onExit: () => void }) {
  const insets = useSafeAreaInsets();
  const seats = bots + 1;
  const history = useRef<(Result | null)[]>([]);
  const rng = useRef(makeRng(Crypto.getRandomBytes(4).reduce((a, b) => a * 256 + b, 0)));
  const [state, setState] = useState<State>(() => startGame(Crypto.getRandomBytes(32), seats, variant, []));
  const [picked, setPicked] = useState<{ card: Card; options: Action[] } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const act = (seat: number, a: Action) => {
    setState(s => {
      if (reasonOf(s, seat, a) !== null) return s;
      return apply(s, seat, a);
    });
  };

  // ход ботов: первый бот с действиями от ходящего, с паузой, — человек может успеть раньше
  useEffect(() => {
    const seat = botToAct(state, s => s !== YOU);
    if (seat < 0) return;
    const t = setTimeout(() => act(seat, chooseAction(observe(state, seat), level, rng.current)), BOT_DELAY);
    return () => clearTimeout(t);
  }, [state, level]);

  useEffect(() => {
    if (state.phase === 'end' && state.result) history.current.push(state.result);
  }, [state.phase, state.result]);

  const mine = useMemo(() => legalActions(state, YOU), [state]);
  const canTake = mine.some(a => a.type === 'take');
  const canPass = mine.some(a => a.type === 'pass');
  const allCovered = state.table.length > 0 && state.table.every(([, d]) => d !== null);
  const iDefend = state.defender === YOU && state.phase === 'bout' && state.table.length > 0;

  const onCard = (c: Card) => {
    setNote(null);
    if (picked?.card === c) { setPicked(null); return; }
    const r = tapCard(state, YOU, c);
    if (!r) {
      const probe: Action = state.table.length === 0 ? { type: 'attack', cards: [c] } : iDefend ? { type: 'beat', card: c, on: state.table.find(([, d]) => d === null)?.[0] ?? -1 } : { type: state.phase === 'giving' ? 'give' : 'throwIn', cards: [c] };
      const why = reasonOf(state, YOU, probe);
      if (why) setNote(T.reason[why]);
      return;
    }
    if ('now' in r) { setPicked(null); act(YOU, r.now); return; }
    setPicked({ card: c, options: r.choose });
  };
  const onTable = (attack: Card) => {
    if (!picked) return;
    const a = picked.options.find(o => o.type === 'beat' && o.on === attack);
    if (a) { setPicked(null); act(YOU, a); }
  };
  const transfer = picked?.options.find(o => o.type === 'transfer');

  const again = () => {
    setPicked(null);
    setNote(null);
    setState(startGame(Crypto.getRandomBytes(32), seats, variant, history.current));
  };

  const hint = state.phase === 'end' ? '' : picked ? T.game.pickTarget : iDefend
    ? (variant === 'perevodnoy' ? T.game.hintDefendTransfer : T.game.hintDefend)
    : mine.some(a => a.type === 'attack') ? T.game.hintAttack
    : state.phase === 'giving' && canPass ? T.game.hintGive
    : canPass ? T.game.hintThrow : T.game.hintWait;

  const resultText = (r: Result) => r.draw || r.fool === null ? T.result.draw
    : r.fool === YOU ? T.result.lose
    : seats === 2 ? T.result.win : `${T.result.win}. ${T.result.other(T.game.bot(r.fool))}`;
  const hand = [...state.hands[YOU]].sort((a, b) => a - b);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]} testID="game">
      <View style={styles.top}>
        <Button label={T.game.menu} kind="ghost" onPress={onExit} testID="game-menu" />
        <Text style={styles.variant}>{T.variant[variant]} · {T.level[level]}</Text>
      </View>
      <View style={styles.opponents}>
        {Array.from({ length: bots }, (_, i) => i + 1).map(seat => (
          <View key={seat} style={styles.opp} testID={`opp-${seat}`}>
            <Text style={styles.oppName}>{T.game.bot(seat)} <Text style={styles.botMark}>· {T.game.botMark}</Text></Text>
            <Text style={styles.oppInfo} testID={`opp-${seat}-cards`}>
              {state.out.includes(seat) ? T.game.out : T.game.cards(state.hands[seat].length)}
              {state.attacker === seat && state.phase !== 'end' ? ` · ${T.game.attacking}` : ''}
              {state.defender === seat && state.phase !== 'end' ? ` · ${T.game.defending}` : ''}
            </Text>
            <View style={styles.fan}>{state.hands[seat].slice(0, 6).map((_, i) => <View key={i} style={{ marginLeft: i ? -26 : 0 }}><CardBack small /></View>)}</View>
          </View>
        ))}
      </View>
      <View style={styles.felt}>
        <View style={styles.talonRow}>
          {state.talon.length > 0 ? (
            <View style={styles.talon} testID="talon">
              <PlayingCard card={state.trump} small />
              <Text style={styles.talonText}>{T.game.talon(state.talon.length)}</Text>
            </View>
          ) : <Text style={styles.talonText}>{T.game.trump} {['♠', '♣', '♦', '♥'][Math.floor(state.trump / 9)]}</Text>}
        </View>
        <View style={styles.table} testID="table">
          {state.table.map(([a, d]) => (
            <View key={a} style={styles.pair}>
              <PlayingCard card={a} onPress={picked ? () => onTable(a) : undefined} testID={`table-${a}`} dim={!!picked && !picked.options.some(o => o.type === 'beat' && o.on === a)} />
              {d !== null ? <View style={styles.cover}><PlayingCard card={d} /></View> : null}
            </View>
          ))}
        </View>
        {state.phase === 'end' && state.result ? (
          <View style={styles.result} testID="result">
            <Text style={styles.resultText}>{resultText(state.result)}</Text>
            <Button label={T.result.again} onPress={again} testID="again" />
          </View>
        ) : null}
      </View>
      <Text style={styles.hint} testID="hint">{note ?? hint}</Text>
      <View style={styles.buttons}>
        {transfer ? <Button label={T.game.transfer} kind="ghost" onPress={() => { setPicked(null); act(YOU, transfer); }} testID="transfer" /> : null}
        {canTake ? <Button label={T.game.take} kind="ghost" onPress={() => act(YOU, { type: 'take' })} testID="take" /> : null}
        {canPass ? <Button label={allCovered ? T.game.done : T.game.pass} onPress={() => act(YOU, { type: 'pass' })} testID="pass" /> : null}
      </View>
      <ScrollView horizontal style={styles.handRow} contentContainerStyle={styles.hand} testID="hand">
        {hand.map((c, i) => (
          <View key={c} style={{ marginLeft: i ? -18 : 0 }}>
            <PlayingCard card={c} raised={picked?.card === c} onPress={() => onCard(c)} testID={`hand-${c}`} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 12, gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  variant: { color: C.dim, fontSize: 14 },
  opponents: { flexDirection: 'row', justifyContent: 'space-around', gap: 8 },
  opp: { alignItems: 'center', gap: 4, padding: 8, borderRadius: RADIUS.card, backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine, minWidth: 96 },
  oppName: { color: C.text, fontSize: 15, fontWeight: '700' },
  botMark: { color: C.dim, fontWeight: '400' },
  oppInfo: { color: C.dim, fontSize: 13 },
  fan: { flexDirection: 'row', height: 56 },
  felt: { flex: 1, borderRadius: 24, backgroundColor: C.felt, borderWidth: 1, borderColor: C.feltEdge, padding: 12 },
  talonRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  talon: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  talonText: { color: C.dim, fontSize: 14 },
  table: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'center', gap: 14 },
  pair: { width: 74, height: 108 },
  cover: { position: 'absolute', left: 12, top: 18 },
  result: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 10, padding: 14, borderRadius: RADIUS.card, backgroundColor: C.sheet, borderWidth: 1, borderColor: C.line },
  resultText: { color: C.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  hint: { color: C.text, fontSize: 15, textAlign: 'center', minHeight: 20 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, minHeight: 48 },
  handRow: { flexGrow: 0 },
  hand: { paddingHorizontal: 8, paddingTop: 16, paddingBottom: 4 },
});
