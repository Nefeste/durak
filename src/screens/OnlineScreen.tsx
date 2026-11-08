// Онлайн (docs/09-game-design.md, «Онлайн»): отметка «Мне есть 14 лет» и имя; стол с друзьями —
// создать (вариант, 2–4 места, кто сядет на свободные) или войти по коду; быстрая игра один на один.
// Вход за стол — в два шага, как в «Нардах»: сначала отпечаток колоды, потом своё зерно (ADR 0004).
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Variant } from '../engine';
import { LEVELS } from '../bot';
import type { Level } from '../bot';
import { T } from '../i18n';
import { Button } from '../ui/Button';
import { Chips } from '../ui/Chips';
import { C, RADIUS } from '../ui/theme';
import { isCode, nameProblem } from '../state/protocol';
import type { QuickView } from '../state/protocol';
import { NetError } from '../state/net';
import { isAdult, loadAdult, net, newSeed, setAdult } from '../state/onlineStore';
import type { MySeed } from '../state/online';

export interface Seated { id: string; seed: MySeed }

const errText = (e: unknown) => T.online.errors[e instanceof NetError ? e.kind : 'other'] ?? T.online.errors.other;

/** Сесть за стол по коду: отпечаток → зерно. */
export async function sitByCode(code: string): Promise<Seated> {
  const info = await net.codeInfo(code);
  const seed = newSeed();
  const t = await net.join(code, seed, info.commit);
  return { id: t.id, seed: { game: t.game?.no ?? 0, seed, commit: info.commit } };
}

export function OnlineScreen({ mode, invite, onBack, onTable }: {
  mode: 'friends' | 'quick'; invite: string | null; onBack: () => void; onTable: (s: Seated) => void;
}) {
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [adult, setAdultState] = useState(false);
  const [name, setName] = useState('');
  const [named, setNamed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [variant, setVariant] = useState<Variant>('podkidnoy');
  const [seats, setSeats] = useState(2);
  const [bots, setBots] = useState<Level | 'none'>('average');
  const [code, setCode] = useState(invite ?? '');
  const [quick, setQuick] = useState<QuickView | null>(null);
  const searching = useRef(false);

  useEffect(() => {
    void (async () => {
      const a = await loadAdult();
      setAdultState(a);
      const d = await net.saved();
      if (d?.name) { setName(d.name); setNamed(true); }
      setReady(true);
    })();
  }, []);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try { await fn(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  const saveName = () => run(async () => {
    if (nameProblem(name)) { setErr(T.online.nameBad); return; }
    await net.hello(name);
    setNamed(true);
  });

  const create = () => run(async () => {
    const t = await net.createTable(variant, seats, bots === 'none' ? null : bots, newSeed());
    onTable(await sitByCode(t.code!));
  });
  const join = () => run(async () => {
    const c = code.trim().toUpperCase();
    if (!isCode(c)) { setErr(T.online.errors['bad-code']); return; }
    onTable(await sitByCode(c));
  });

  // быстрая игра: очередь, опрос раз в 1,5 с; найдена пара — сесть за стол по коду
  const matched = async (id: string) => {
    searching.current = false;
    const r = await net.poll(id);
    if ('table' in r && r.table.code) onTable(await sitByCode(r.table.code));
  };
  const find = () => run(async () => {
    const q = await net.quickJoin(variant);
    setQuick(q);
    if (q.status === 'matched') return matched(q.table);
    searching.current = true;
  });
  useEffect(() => {
    if (!quick || quick.status !== 'searching') return;
    const t = setTimeout(() => {
      if (!searching.current) return;
      void net.quickJoin(variant).then(q => {
        if (!searching.current) return;
        setQuick(q);
        if (q.status === 'matched') void matched(q.table).catch(e => setErr(errText(e)));
      }).catch(e => setErr(errText(e)));
    }, 1500);
    return () => clearTimeout(t);
  });
  const cancelSearch = () => run(async () => { searching.current = false; await net.quickCancel(); setQuick(null); });
  const playBot = () => run(async () => {
    searching.current = false;
    const q = await net.quickBot();
    if (q.status === 'matched') await matched(q.table);
  });
  useEffect(() => () => { if (searching.current) void net.quickCancel().catch(() => {}); }, []);

  if (!ready) return <View style={styles.root} />;
  const pad = { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 };

  if (!adult || !named) {
    return (
      <View style={[styles.root, pad]} testID="online-profile">
        <Text style={styles.title}>{mode === 'quick' ? T.online.quickTitle : T.online.title}</Text>
        <View style={styles.panel}>
          <Chips id="adult" items={['no', 'yes'] as const} value={adult ? 'yes' : 'no'} label={v => (v === 'yes' ? T.online.adult : T.settings.off)}
            onChange={v => { const on = v === 'yes'; setAdultState(on); void setAdult(on); }} />
          <Text style={styles.note}>{T.online.adultNote}</Text>
          {adult ? (
            <>
              <Text style={styles.label}>{T.online.name}</Text>
              <TextInput testID="name" value={name} onChangeText={setName} placeholder={T.online.namePlaceholder} placeholderTextColor={C.dim}
                style={styles.input} maxLength={16} autoCorrect={false} />
              <Button label={T.online.saveName} onPress={saveName} disabled={busy} testID="name-save" />
            </>
          ) : null}
          {err ? <Text style={styles.err} testID="online-error">{err}</Text> : null}
        </View>
        <Button label={T.online.back} kind="ghost" onPress={onBack} testID="online-back" />
      </View>
    );
  }

  if (mode === 'quick') {
    const q = quick;
    return (
      <View style={[styles.root, pad]} testID="quick">
        <Text style={styles.title}>{T.online.quickTitle}</Text>
        <View style={styles.panel}>
          <Chips id="q-variant" items={['podkidnoy', 'perevodnoy'] as Variant[]} value={variant} label={v => T.variant[v]} onChange={setVariant} />
          {q?.status === 'searching' ? (
            <>
              <Text style={styles.big} testID="quick-searching">{T.online.searching}</Text>
              <Text style={styles.note}>{T.online.rating(q.me.rating)}</Text>
              {q.offerBot ? (
                <>
                  <Text style={styles.label}>{T.online.offerBot}</Text>
                  <Button label={T.online.playBot} onPress={playBot} testID="quick-bot" />
                </>
              ) : null}
              <Button label={T.online.cancelSearch} kind="ghost" onPress={cancelSearch} testID="quick-cancel" />
            </>
          ) : (
            <Button label={T.online.find} onPress={find} disabled={busy} testID="quick-find" />
          )}
          {err ? <Text style={styles.err} testID="online-error">{err}</Text> : null}
        </View>
        <Button label={T.online.back} kind="ghost" onPress={onBack} testID="online-back" />
      </View>
    );
  }

  return (
    <View style={[styles.root, pad]} testID="friends">
      <Text style={styles.title}>{T.online.title}</Text>
      <View style={styles.panel}>
        <Text style={styles.label}>{T.menu.variant}</Text>
        <Chips id="f-variant" items={['podkidnoy', 'perevodnoy'] as Variant[]} value={variant} label={v => T.variant[v]} onChange={setVariant} />
        <Text style={styles.label}>{T.online.seats}</Text>
        <Chips id="f-seats" items={[2, 3, 4]} value={seats} label={T.online.seatsN} onChange={setSeats} />
        <Text style={styles.label}>{T.online.bots}</Text>
        <Chips id="f-bots" items={['none', ...LEVELS] as (Level | 'none')[]} value={bots} label={l => (l === 'none' ? T.online.noBots : T.level[l])} onChange={setBots} />
        <Button label={T.online.create} onPress={create} disabled={busy} testID="create" />
      </View>
      <View style={styles.panel}>
        <Text style={styles.label}>{T.online.joinByCode}</Text>
        <TextInput testID="code" value={code} onChangeText={v => setCode(v.toUpperCase())} placeholder={T.online.codePlaceholder} placeholderTextColor={C.dim}
          style={styles.input} maxLength={6} autoCapitalize="characters" autoCorrect={false} />
        <Button label={T.online.join} kind="ghost" onPress={join} disabled={busy} testID="join" />
        {err ? <Text style={styles.err} testID="online-error">{err}</Text> : null}
      </View>
      <Button label={T.online.back} kind="ghost" onPress={onBack} testID="online-back" />
    </View>
  );
}

export const adultNow = isAdult;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20, gap: 16 },
  title: { color: C.accent, fontSize: 28, fontWeight: '800' },
  panel: { gap: 10, padding: 16, borderRadius: RADIUS.card, backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine },
  label: { color: C.dim, fontSize: 14, marginTop: 4 },
  note: { color: C.dim, fontSize: 14 },
  big: { color: C.text, fontSize: 19, fontWeight: '700' },
  input: { color: C.text, fontSize: 18, borderWidth: 1, borderColor: C.glassLine, borderRadius: 12, paddingHorizontal: 12, minHeight: 48 },
  err: { color: C.danger, fontSize: 15 },
});
