// Корень: экраны переключаются состоянием, без роутера (как в «Нардах», docs/02-architecture.md).
// При запуске — настройки и сохранённая партия; журнал сбоев ловит ошибки с первой строки.
import React, { useEffect, useState } from 'react';
import { BackHandler, Linking, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MenuScreen } from './src/screens/MenuScreen';
import type { Choice } from './src/screens/MenuScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { StoreScreen } from './src/screens/StoreScreen';
import { BacksScreen } from './src/screens/BacksScreen';
import { ReportScreen } from './src/screens/ReportScreen';
import { BenchScreen } from './src/screens/BenchScreen';
import { StatsScreen } from './src/screens/StatsScreen';
import { PathScreen } from './src/screens/PathScreen';
import { loadPath, getPath } from './src/state/path';
import { currentRival } from './src/game/path';
import type { RivalId } from './src/game/rivals';
import type { Variant } from './src/engine';
import { DeckSheet, deckSheetWanted } from './src/render/DeckSheet';
import { IconSheet, iconSheetWanted } from './src/render/IconSheet';
import { CastSheet, castSheetWanted } from './src/game/CastSheet';
import { RulesScreen } from './src/screens/RulesScreen';
import { PuzzleScreen } from './src/game/PuzzleScreen';
import { GameScreen } from './src/game/GameScreen';
import { OnlineGameScreen } from './src/game/OnlineGameScreen';
import { OnlineScreen } from './src/screens/OnlineScreen';
import type { Seated } from './src/screens/OnlineScreen';
import { OnlineTable } from './src/state/online';
import { net } from './src/state/onlineStore';
import { inviteCode } from './src/state/invite';
import { C } from './src/ui/theme';
import { Backdrop } from './src/ui/Backdrop';
import { installCrashHandlers } from './src/state/crashlog';
import { loadSettings, setSettings, useSettings } from './src/state/store';
import { botLevels } from './src/state/settings';
import { startMoney } from './src/money';
import { loadGame } from './src/state/save';
import type { SavedGame } from './src/state/save';

installCrashHandlers();

/** Быстрый «Замер» для сценария в браузере: `?bench=quick`. */
const quickBench = typeof globalThis.location !== 'undefined' && /[?&]bench=quick/.test(globalThis.location.search);

type Route = 'menu' | 'path' | 'game' | 'settings' | 'report' | 'friends' | 'quick' | 'online' | 'store' | 'puzzle' | 'stats' | 'bench' | 'rules' | 'backs';

export default function App() {
  const [route, setRoute] = useState<Route>('menu');
  // «Рубашки» открываются из настроек и из магазина — «Назад» ведёт туда, откуда пришли
  const [backsFrom, setBacksFrom] = useState<'settings' | 'store'>('settings');
  const openBacks = (from: 'settings' | 'store') => { setBacksFrom(from); setRoute('backs'); };
  // стол в меню запоминается в настройках; первый запуск — подкидной вдвоём против «Начинающего» (спецификация 1.0, §3)
  const choice: Choice = useSettings().choice;
  const setChoice = (c: Choice) => setSettings({ choice: c });
  const [saved, setSaved] = useState<SavedGame | null>(null);
  const [resume, setResume] = useState<SavedGame | null>(null);
  const [game, setGame] = useState(0);
  const [invite, setInvite] = useState<string | null>(null);
  const [online, setOnline] = useState<OnlineTable | null>(null);
  // «Путь к Мастеру» (docs/specs/2026-11-path.md): вариант пути на экране и соперник матча, который сейчас за столом
  const [pathVariant, setPathVariant] = useState<Variant>(choice.variant);
  const [pathRival, setPathRival] = useState<RivalId | null>(null);
  useEffect(() => { void loadPath(); }, []);
  // деньги — после настроек: SDK рекламы стартует с выбором «Персональная реклама»
  useEffect(() => { void loadSettings().then(() => startMoney()); }, []);
  // сохранённая партия — при каждом возврате в меню: «Продолжить партию»
  useEffect(() => {
    if (route !== 'menu' && route !== 'path') return;
    let live = true;
    loadGame().then(g => { if (live) setSaved(g?.saved ?? null); });
    return () => { live = false; };
  }, [route]);
  // приглашение за стол открыло игру (при запуске или когда она уже открыта)
  useEffect(() => {
    const open = (url: string | null) => {
      const code = inviteCode(url);
      if (!code) return;
      setInvite(code);
      setRoute(r => (r === 'game' || r === 'online' ? r : 'friends'));
    };
    void Linking.getInitialURL().then(open).catch(() => {});
    const sub = Linking.addEventListener('url', e => open(e.url));
    return () => sub.remove();
  }, []);
  const seat = (s: Seated) => {
    const t = new OnlineTable(net, s.id);
    t.remember(s.seed);
    setOnline(t);
    setInvite(null);
    setRoute('online');
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route === 'menu') return false;
      setRoute(route === 'report' || route === 'bench' ? 'settings' : route === 'backs' ? backsFrom : 'menu');
      return true;
    });
    return () => sub.remove();
  }, [route, backsFrom]);
  const play = (from: SavedGame | null, rival: RivalId | null = from?.path ?? null) => {
    setResume(from);
    setPathRival(rival);
    if (from?.path) setPathVariant(from.record.variant);
    setGame(n => n + 1);
    setRoute('game');
  };
  const r = resume?.record;
  // матч пути: сохранённая партия матча этого варианта с текущим соперником — «Продолжить матч»
  const pathNow = currentRival(getPath().runs[pathVariant]);
  const pathSaved = saved?.path && saved.record.variant === pathVariant && saved.path === pathNow?.id ? saved : null;
  const playPath = () => {
    if (pathSaved) { play(pathSaved); return; }
    if (pathNow) play(null, pathNow.id);
  };
  const gameVariant: Variant = r?.variant ?? (pathRival ? pathVariant : choice.variant);
  if (iconSheetWanted()) return <IconSheet />;
  if (deckSheetWanted()) return <DeckSheet />;
  if (castSheetWanted()) return <CastSheet />;
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={styles.root}>
        <Backdrop />
        {route === 'menu' ? (
          <MenuScreen choice={choice} onChange={setChoice} onPlay={() => play(null)}
            onResume={saved ? () => play(saved) : null} onSettings={() => setRoute('settings')}
            onFriends={() => setRoute('friends')} onQuick={() => setRoute('quick')} onStore={() => setRoute('store')}
            onPath={() => { setPathVariant(choice.variant); setRoute('path'); }} pathVariant={choice.variant}
            onPuzzle={() => setRoute('puzzle')} onStats={() => setRoute('stats')} onRules={() => setRoute('rules')} />
        ) : route === 'friends' || route === 'quick' ? (
          <OnlineScreen mode={route === 'quick' ? 'quick' : 'friends'} invite={invite} onBack={() => setRoute('menu')} onTable={seat} />
        ) : route === 'online' && online ? (
          <OnlineGameScreen table={online} onExit={() => { setOnline(null); setRoute('menu'); }} />
        ) : route === 'path' ? (
          <PathScreen variant={pathVariant} onVariant={setPathVariant} onPlay={playPath} resumable={!!pathSaved}
            onBack={() => setRoute('menu')} onStore={() => setRoute('store')} />
        ) : route === 'puzzle' ? (
          <PuzzleScreen onBack={() => setRoute('menu')} />
        ) : route === 'rules' ? (
          <RulesScreen onBack={() => setRoute('menu')} />
        ) : route === 'stats' ? (
          <StatsScreen onBack={() => setRoute('menu')} onStore={() => setRoute('store')} />
        ) : route === 'store' ? (
          <StoreScreen onBack={() => setRoute('menu')} onBacks={() => openBacks('store')} />
        ) : route === 'backs' ? (
          <BacksScreen onBack={() => setRoute(backsFrom)} />
        ) : route === 'settings' ? (
          <SettingsScreen onBack={() => setRoute('menu')} onReport={() => setRoute('report')} onBench={() => setRoute('bench')} onBacks={() => openBacks('settings')} />
        ) : route === 'bench' ? (
          <BenchScreen onBack={() => setRoute('settings')} quick={quickBench} />
        ) : route === 'report' ? (
          <ReportScreen onBack={() => setRoute('settings')} />
        ) : (
          <GameScreen key={game} variant={gameVariant} bots={(r?.seats ?? (pathRival ? 2 : choice.bots + 1)) - 1}
            levels={resume?.levels ?? (pathRival && pathNow ? [pathNow.level] : botLevels(choice))} restored={resume} path={pathRival}
            onExit={() => setRoute(pathRival ? 'path' : 'menu')} onStore={() => setRoute('store')} />
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: C.bg } });
