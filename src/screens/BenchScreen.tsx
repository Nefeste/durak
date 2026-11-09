// «Замер» (спецификация 1.0, критерий 9; docs/06-testing.md, «Замер»; по образцу «Замера» «Узоров»): настоящий
// стол (src/render/TableCanvas.tsx) сам играет сцены — раздачу вчетвером, «беру» с 12 картами, 36 карт в полёте
// разом — и «Опытный» решает на позициях из партий; экран считает кадры двух потоков: UI (Reanimated, на нём
// летят карты и рисуется Skia) и JS (там думает бот). Итог — текстом, его можно скопировать для журнала.
// Вход скрытый: долгое нажатие на строку версии внизу настроек.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFont } from '@shopify/react-native-skia';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { Observation } from '../engine';
import { makeRng, think, THINK_MS, TOP } from '../bot';
import { botPositions, dealScene, frameSummary, mirrored, msSummary, takeScene, withinBudget } from '../game/bench';
import type { FrameSummary } from '../game/bench';
import { thinkSliced } from '../game/think';
import { T } from '../i18n';
import { DEAL, FLIGHT, TableCanvas } from '../render/TableCanvas';
import { layoutTable, noOrigins } from '../render/layout';
import type { Layout } from '../render/layout';
import { Button } from '../ui/Button';
import { Header } from '../ui/Header';
import { useInsets } from '../ui/insets';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';
import { APP_VERSION } from '../version';

type Scene = 'deal' | 'take' | 'flight' | 'master';
const SCENES: Scene[] = ['deal', 'take', 'flight', 'master'];

/** Сколько повторов каждой сцены: полный замер и быстрый (сценарий в браузере). */
const ROUNDS = { full: { deal: 4, take: 6, flight: 12, master: 8 }, quick: { deal: 1, take: 1, flight: 2, master: 1 } } as const;

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const noop = () => {};
const touch = { onCard: noop, onTableCard: noop, onDrop: () => false };

interface Row { scene: Scene; ui: FrameSummary; js: FrameSummary; bot?: { n: number; p50: number; worst: number } }

export function BenchScreen({ onBack, quick = false }: { onBack: () => void; quick?: boolean }) {
  const insets = useInsets();
  const font = useFont(Onest_700Bold, 15);
  const small = useFont(Onest_700Bold, 26);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [view, setView] = useState<{ o: Observation; mirror: boolean; key: number }>(() => ({ o: dealScene(), mirror: false, key: 0 }));
  const [running, setRunning] = useState<Scene | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [copied, setCopied] = useState(false);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  // кадры UI: длительность каждого кадра, пока идёт запись; сброс — по просьбе JS
  const rec = useSharedValue(0);              // 0 — нет, 1 — пишем, 2 — отдать и обнулить
  const ui = useSharedValue<number[]>([]);
  const uiDone = useRef<((a: number[]) => void) | null>(null);
  const deliver = (a: number[]) => { uiDone.current?.(a); uiDone.current = null; };
  useFrameCallback(info => {
    'worklet';
    const r = rec.get();
    const dt = info.timeSincePreviousFrame;
    if (r === 1 && dt !== null) ui.modify(a => { 'worklet'; a.push(dt); return a; }, false);
    if (r === 2) {
      const a = ui.get().slice();
      ui.set([]);
      rec.set(0);
      scheduleOnRN(deliver, a);
    }
  }, true);
  // кадры JS: промежуток между вызовами requestAnimationFrame
  const js = useRef<{ on: boolean; last: number; a: number[] }>({ on: false, last: 0, a: [] });
  useEffect(() => {
    let id = 0;
    const tick = (t: number) => {
      const j = js.current;
      if (j.on && j.last > 0) j.a.push(t - j.last);
      j.last = t;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  const start = () => { js.current = { on: true, last: 0, a: [] }; rec.set(1); };
  const stop = () => new Promise<{ ui: number[]; js: number[] }>(resolve => {
    const jsFrames = js.current.a;
    js.current = { on: false, last: 0, a: [] };
    uiDone.current = a => resolve({ ui: a, js: jsFrames });
    rec.set(2);
  });

  const take = useMemo(() => takeScene(), []);
  const run = async () => {
    if (running) return;
    setRows([]);
    setCopied(false);
    const n = quick ? ROUNDS.quick : ROUNDS.full;
    const out: Row[] = [];
    for (const scene of SCENES) {
      if (!live.current) return;
      setRunning(scene);
      if (scene === 'deal') {
        start();
        for (let i = 0; i < n.deal; i++) {
          setView(v => ({ o: dealScene(7 + i), mirror: false, key: v.key + 1 }));
          await wait(DEAL + FLIGHT + 300);
        }
      } else if (scene === 'take') {
        setView(v => ({ o: take.before, mirror: false, key: v.key + 1 }));
        await wait(DEAL + FLIGHT + 300);       // раздача этого стола — не в счёт
        start();
        for (let i = 0; i < n.take; i++) {
          setView(v => ({ ...v, o: take.after }));
          await wait(FLIGHT + 320);
          setView(v => ({ ...v, o: take.before }));
          await wait(FLIGHT + 320);
        }
      } else if (scene === 'flight') {
        setView(v => ({ o: dealScene(), mirror: false, key: v.key + 1 }));
        await wait(DEAL + FLIGHT + 300);
        start();
        for (let i = 0; i < n.flight; i++) {
          setView(v => ({ ...v, mirror: !v.mirror }));
          await wait(FLIGHT + 220);
        }
      }
      let bot: Row['bot'];
      if (scene === 'master') {
        const times: number[] = [];
        const positions = botPositions(n.master);
        start();
        for (const o of positions) {
          if (!live.current) return;
          const t0 = Date.now();
          await thinkSliced(think(o, TOP, makeRng(1)), THINK_MS[TOP]).promise;
          times.push(Date.now() - t0);
        }
        bot = msSummary(times);
      }
      const f = await stop();
      out.push({ scene, ui: frameSummary(f.ui), js: frameSummary(f.js), bot });
      setRows([...out]);
    }
    setRunning(null);
  };

  const layout = useMemo<Layout | null>(() => {
    if (!size) return null;
    const l = layoutTable(view.o, { ...size, origins: noOrigins(), order: 'suit', picked: null, targets: [] });
    return view.mirror ? mirrored(l) : l;
  }, [size, view]);

  const fmt = (x: number) => x.toFixed(1);
  const line = (f: FrameSummary) => T.bench.frames(f.n, fmt(f.p50), fmt(f.p95), fmt(f.long), Math.round(f.worst));
  const text = rows.length ? [
    T.bench.head(APP_VERSION, Platform.OS === 'web' ? 'web' : `${Platform.OS} ${String(Platform.Version)}`, size ? `${Math.round(size.width)}×${Math.round(size.height)}` : '', quick),
    ...rows.flatMap(r => [
      `${T.bench.scenes[r.scene]} — ${withinBudget(r.ui) && (r.scene !== 'master' || withinBudget(r.js)) ? T.bench.ok : T.bench.over}`,
      `  UI: ${line(r.ui)}`,
      `  JS: ${line(r.js)}`,
      ...(r.bot ? [`  ${T.bench.bot(r.bot.n, Math.round(r.bot.p50), Math.round(r.bot.worst))}`] : []),
    ]),
  ].join('\n') : '';
  const copy = () => {
    void Clipboard.setStringAsync(text).then(() => setCopied(true)).catch(() => {});
  };
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.width - width) > 1 || Math.abs(size.height - height) > 1) setSize({ width, height });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACE.m, paddingBottom: insets.bottom + SPACE.m }]} testID="bench">
      <Header title={T.bench.title} back={T.bench.back} onBack={onBack} backTestID="bench-back" />
      <View style={styles.table} onLayout={onLayout}>
        {layout && font && small ? (
          <TableCanvas key={view.key} layout={layout} font={font} small={small} fourColor={false} less={false}
            hand={view.o.hand} table={view.o.table} enabled={false} touch={touch} />
        ) : null}
      </View>
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelIn}>
        <Text style={styles.note} testID="bench-state">{running ? T.bench.running(T.bench.scenes[running]) : rows.length ? T.bench.done : T.bench.intro}</Text>
        {text ? <Text selectable style={styles.result} testID="bench-result">{text}</Text> : null}
        <Button label={T.bench.run} onPress={() => { void run(); }} disabled={!!running} testID="bench-run" />
        {text && !running ? (
          <View style={styles.row}>
            <Button kind="ghost" label={copied ? T.bench.copied : T.bench.copy} onPress={copy} testID="bench-copy" />
            <Button kind="ghost" label={T.bench.share} onPress={() => { Share.share({ message: text }).catch(() => {}); }} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: SPACE.s, gap: SPACE.s },
  table: { height: '55%' },
  panel: { flex: 1 },
  panelIn: { gap: SPACE.m, padding: SPACE.m, borderRadius: RADIUS.panel, backgroundColor: C.glass },
  note: { color: C.dim, fontSize: TYPE.caption },
  result: { color: C.text, fontSize: TYPE.caption, lineHeight: 19 },
  row: { flexDirection: 'row', gap: SPACE.s, flexWrap: 'wrap' },
});
