// Онлайн (docs/09-game-design.md, «Онлайн»): отметка «Мне есть 14 лет» и имя; стол с друзьями —
// создать (вариант, 2–4 места, кто сядет на свободные) или войти по коду; быстрая игра один на один.
// Вход за стол — в два шага, как в «Нардах»: сначала отпечаток колоды, потом своё зерно (ADR 0004).
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useInsets } from '../ui/insets';
import type { Variant } from '../engine';
import { LEVELS, LOCKED_LEVEL } from '../bot';
import type { Level } from '../bot';
import { T } from '../i18n';
import { Button } from '../ui/Button';
import { Glass } from '../ui/Glass';
import { Header } from '../ui/Header';
import { Chips } from '../ui/Chips';
import { Stepper } from '../ui/Stepper';
import { Checkbox } from '../ui/Toggle';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';
import { isCode, nameProblem } from '../state/protocol';
import type { CodeInfo, QuickView } from '../state/protocol';
import { SeatMap } from '../game/SeatMap';
import { NetError } from '../state/net';
import { isAdult, loadAdult, net, newSeed, setAdult } from '../state/onlineStore';
import type { MySeed } from '../state/online';

export interface Seated { id: string; seed: MySeed }

const errText = (e: unknown) => T.online.errors[e instanceof NetError ? e.kind : 'other'] ?? T.online.errors.other;
/** Сервер не ответил или ответил ошибкой (502 и т. п.): это не вина игрока — «Повторить», меню открыто. */
const serverDown = (e: unknown) => e instanceof NetError && (e.kind === 'offline' || e.kind === 'timeout' || e.kind === 'server');

/** Сесть за стол по коду: отпечаток → зерно; `seat` — выбранное место (без него — первое свободное). */
export async function sitByCode(code: string, seat?: number, known?: CodeInfo): Promise<Seated> {
  const info = known ?? await net.codeInfo(code);
  const seed = newSeed();
  const t = await net.join(code, seed, info.commit, seat);
  return { id: t.id, seed: { game: t.game?.no ?? 0, seed, commit: info.commit } };
}

/** Выбор места нужен: стол ждёт, вас за ним нет, а выбрать есть из чего (сервер с 1.1.0 протокола присылает места). */
export const choosesSeat = (i: CodeInfo): boolean =>
  !i.mine && i.status === 'waiting' && !!i.places && i.places.filter(p => !p || p.bot).length > 1;

export function OnlineScreen({ mode, invite, onBack, onTable }: {
  mode: 'friends' | 'quick'; invite: string | null; onBack: () => void; onTable: (s: Seated) => void;
}) {
  const insets = useInsets();
  const [ready, setReady] = useState(false);
  const [adult, setAdultState] = useState(false);
  const [name, setName] = useState('');
  const [named, setNamed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Что повторить, если сервер не ответил. */
  const [retry, setRetry] = useState<(() => Promise<void>) | null>(null);
  const [busy, setBusy] = useState(false);
  const [variant, setVariant] = useState<Variant>('podkidnoy');
  const [seats, setSeats] = useState(2);
  // кто займёт свободные места: боты какого уровня или никто (аудит 09.11.2026, находка 9 — уровень одной строкой
  // «‹ Средний ›», как в меню и в сборе стола; «Мастер · скоро» показан, но закрыт — «Создать стол» тогда недоступна)
  const [withBots, setWithBots] = useState(true);
  const [botLevel, setBotLevel] = useState<Level>('average');
  const [lockedShown, setLockedShown] = useState(false);
  const [code, setCode] = useState(invite ?? '');
  /** Стол по коду, где выбирают место. */
  const [picking, setPicking] = useState<{ code: string; info: CodeInfo } | null>(null);
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
    setRetry(null);
    try { await fn(); } catch (e) {
      setErr(errText(e));
      if (serverDown(e)) setRetry(() => fn);
    } finally { setBusy(false); }
  };
  const errorBlock = err ? (
    <View style={styles.errBox}>
      <Text style={styles.err} testID="online-error">{err}</Text>
      {retry ? <Button label={T.online.retry} kind="ghost" onPress={() => void run(retry)} disabled={busy} testID="online-retry" /> : null}
    </View>
  ) : null;

  const saveName = () => run(async () => {
    if (nameProblem(name)) { setErr(T.online.nameBad); return; }
    await net.hello(name);
    setNamed(true);
  });

  const create = () => run(async () => {
    const t = await net.createTable(variant, seats, withBots ? botLevel : null, newSeed());
    onTable(await sitByCode(t.code!));
  });
  const join = () => run(async () => {
    const c = code.trim().toUpperCase();
    if (!isCode(c)) { setErr(T.online.errors['bad-code']); return; }
    const info = await net.codeInfo(c);
    if (choosesSeat(info)) { setPicking({ code: c, info }); return; }
    onTable(await sitByCode(c, undefined, info));
  });
  const sit = (seat: number) => run(async () => {
    if (!picking) return;
    try {
      onTable(await sitByCode(picking.code, seat, picking.info));
    } catch (e) {
      // место заняли или стол изменился — свежие места, выбрать снова
      if (e instanceof NetError && (e.kind === 'seat-taken' || e.kind === 'commit-changed')) setPicking({ code: picking.code, info: await net.codeInfo(picking.code) });
      throw e;
    }
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
  const pad = { paddingTop: insets.top + SPACE.l, paddingBottom: insets.bottom + SPACE.l };

  if (!adult || !named) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={[styles.content, pad]} keyboardShouldPersistTaps="handled" testID="online-profile">
        <Header title={mode === 'quick' ? T.online.quickTitle : T.online.title} back={T.online.back} onBack={onBack} backTestID="online-back" />
        <Glass style={styles.panel}>
          <Checkbox id="adult" label={T.online.adult} value={adult} onChange={on => { setAdultState(on); void setAdult(on); }} />
          <Text style={styles.note}>{T.online.adultNote}</Text>
          {adult ? (
            <>
              <Text style={styles.label}>{T.online.name}</Text>
              <TextInput testID="name" value={name} onChangeText={setName} placeholder={T.online.namePlaceholder} placeholderTextColor={C.dim}
                style={styles.input} maxLength={16} autoCorrect={false} />
              <Button label={T.online.saveName} onPress={saveName} disabled={busy} testID="name-save" />
            </>
          ) : null}
          {errorBlock}
        </Glass>
      </ScrollView>
    );
  }

  if (mode === 'quick') {
    const q = quick;
    return (
      <ScrollView style={styles.root} contentContainerStyle={[styles.content, pad]} keyboardShouldPersistTaps="handled" testID="quick">
        <Header title={T.online.quickTitle} back={T.online.back} onBack={onBack} backTestID="online-back" />
        <Glass style={styles.panel}>
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
          {errorBlock}
        </Glass>
      </ScrollView>
    );
  }

  if (picking) {
    const i = picking.info;
    return (
      <ScrollView style={styles.root} contentContainerStyle={[styles.content, pad]} testID="pick-seat">
        <Header title={T.online.pickSeat} back={T.online.back} onBack={() => { setPicking(null); setErr(null); }} backTestID="pick-back" />
        <Glass style={styles.panel}>
          <Text style={styles.label}>{T.variant[i.variant]} · {i.host}</Text>
          <Text style={styles.note}>{T.online.pickSeatNote}</Text>
          <SeatMap places={i.places!} host={Math.max(0, i.places!.findIndex(p => p?.host))} onSit={busy ? undefined : sit} />
          {errorBlock}
        </Glass>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, pad]} keyboardShouldPersistTaps="handled" testID="friends">
      <Header title={T.online.title} back={T.online.back} onBack={onBack} backTestID="online-back" />
      <Glass style={styles.panel}>
        <Text style={styles.label}>{T.menu.variant}</Text>
        <Chips id="f-variant" items={['podkidnoy', 'perevodnoy'] as Variant[]} value={variant} label={v => T.variant[v]} onChange={setVariant} />
        <Text style={styles.label}>{T.online.seats}</Text>
        <Chips id="f-seats" items={[2, 3, 4]} value={seats} label={T.online.seatsN} onChange={setSeats} />
        <Text style={styles.label}>{T.online.bots}</Text>
        <Chips id="f-bots" items={['bots', 'none'] as const} value={withBots ? 'bots' : 'none'} label={v => (v === 'bots' ? T.online.withBots : T.online.noBots)}
          onChange={v => { setWithBots(v === 'bots'); setLockedShown(false); }} />
        {withBots ? (
          <>
            <Text style={styles.label}>{T.online.botsLevel}</Text>
            <Stepper<string> id="f-level" items={LEVELS} value={lockedShown ? LOCKED_LEVEL : botLevel} label={l => T.level[l as Level]}
              prevLabel={T.menu.levelDown} nextLabel={T.menu.levelUp} locked={{ key: LOCKED_LEVEL, label: T.menu.lockedLevel }}
              onChange={l => { if (l === LOCKED_LEVEL) { setLockedShown(true); return; } setLockedShown(false); setBotLevel(l as Level); }} />
            {lockedShown ? <Text style={styles.note} testID="locked-note">{T.menu.lockedNote}</Text> : null}
          </>
        ) : null}
        <Button label={T.online.create} onPress={create} disabled={busy || (withBots && lockedShown)} testID="create" />
      </Glass>
      <Glass style={styles.panel}>
        <Text style={styles.label}>{T.online.joinByCode}</Text>
        <TextInput testID="code" value={code} onChangeText={v => setCode(v.toUpperCase())} placeholder={T.online.codePlaceholder} placeholderTextColor={C.dim}
          style={styles.input} maxLength={6} autoCapitalize="characters" autoCorrect={false} />
        <Button label={T.online.join} kind="ghost" onPress={join} disabled={busy} testID="join" />
        {errorBlock}
      </Glass>
    </ScrollView>
  );
}

export const adultNow = isAdult;

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: SPACE.l, gap: SPACE.l },
  panel: { gap: SPACE.m, padding: SPACE.l,  },
  label: { color: C.dim, fontSize: TYPE.caption, marginTop: SPACE.xs },
  note: { color: C.dim, fontSize: TYPE.caption },
  big: { color: C.text, fontSize: TYPE.section, fontWeight: '700' },
  input: { color: C.text, fontSize: TYPE.button, borderWidth: 1, borderColor: C.glassLine, borderRadius: RADIUS.small, paddingHorizontal: SPACE.m, minHeight: 48 },
  err: { color: C.danger, fontSize: TYPE.body },
  errBox: { gap: SPACE.s },
});
