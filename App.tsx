// Корень: экраны переключаются состоянием, без роутера (как в «Нардах», docs/02-architecture.md).
// При запуске — настройки и сохранённая партия; журнал сбоев ловит ошибки с первой строки.
import React, { useEffect, useState } from 'react';
import { BackHandler, Linking, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MenuScreen } from './src/screens/MenuScreen';
import type { Choice } from './src/screens/MenuScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ReportScreen } from './src/screens/ReportScreen';
import { GameScreen } from './src/game/GameScreen';
import { OnlineGameScreen } from './src/game/OnlineGameScreen';
import { OnlineScreen } from './src/screens/OnlineScreen';
import type { Seated } from './src/screens/OnlineScreen';
import { OnlineTable } from './src/state/online';
import { net } from './src/state/onlineStore';
import { inviteCode } from './src/state/invite';
import { C } from './src/ui/theme';
import { installCrashHandlers } from './src/state/crashlog';
import { loadSettings } from './src/state/store';
import { loadGame } from './src/state/save';
import type { SavedGame } from './src/state/save';

installCrashHandlers();

type Route = 'menu' | 'game' | 'settings' | 'report' | 'friends' | 'quick' | 'online';

export default function App() {
  const [route, setRoute] = useState<Route>('menu');
  const [choice, setChoice] = useState<Choice>({ variant: 'podkidnoy', bots: 1, level: 'average' });
  const [saved, setSaved] = useState<SavedGame | null>(null);
  const [resume, setResume] = useState<SavedGame | null>(null);
  const [game, setGame] = useState(0);
  const [invite, setInvite] = useState<string | null>(null);
  const [online, setOnline] = useState<OnlineTable | null>(null);
  useEffect(() => { loadSettings(); }, []);
  // сохранённая партия — при каждом возврате в меню: «Продолжить партию»
  useEffect(() => {
    if (route !== 'menu') return;
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
      setRoute(route === 'report' ? 'settings' : 'menu');
      return true;
    });
    return () => sub.remove();
  }, [route]);
  const play = (from: SavedGame | null) => {
    setResume(from);
    setGame(n => n + 1);
    setRoute('game');
  };
  const r = resume?.record;
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={styles.root}>
        {route === 'menu' ? (
          <MenuScreen choice={choice} onChange={setChoice} onPlay={() => play(null)}
            onResume={saved ? () => play(saved) : null} onSettings={() => setRoute('settings')}
            onFriends={() => setRoute('friends')} onQuick={() => setRoute('quick')} />
        ) : route === 'friends' || route === 'quick' ? (
          <OnlineScreen mode={route === 'quick' ? 'quick' : 'friends'} invite={invite} onBack={() => setRoute('menu')} onTable={seat} />
        ) : route === 'online' && online ? (
          <OnlineGameScreen table={online} onExit={() => { setOnline(null); setRoute('menu'); }} />
        ) : route === 'settings' ? (
          <SettingsScreen onBack={() => setRoute('menu')} onReport={() => setRoute('report')} />
        ) : route === 'report' ? (
          <ReportScreen onBack={() => setRoute('settings')} />
        ) : (
          <GameScreen key={game} variant={r?.variant ?? choice.variant} bots={(r?.seats ?? choice.bots + 1) - 1}
            level={resume?.level ?? choice.level} restored={resume} onExit={() => setRoute('menu')} />
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: C.bg } });
