// Корень: экраны переключаются состоянием, без роутера (как в «Нардах», docs/02-architecture.md).
// При запуске — настройки и сохранённая партия; журнал сбоев ловит ошибки с первой строки.
import React, { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MenuScreen } from './src/screens/MenuScreen';
import type { Choice } from './src/screens/MenuScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ReportScreen } from './src/screens/ReportScreen';
import { GameScreen } from './src/game/GameScreen';
import { C } from './src/ui/theme';
import { installCrashHandlers } from './src/state/crashlog';
import { loadSettings } from './src/state/store';
import { loadGame } from './src/state/save';
import type { SavedGame } from './src/state/save';

installCrashHandlers();

type Route = 'menu' | 'game' | 'settings' | 'report';

export default function App() {
  const [route, setRoute] = useState<Route>('menu');
  const [choice, setChoice] = useState<Choice>({ variant: 'podkidnoy', bots: 1, level: 'average' });
  const [saved, setSaved] = useState<SavedGame | null>(null);
  const [resume, setResume] = useState<SavedGame | null>(null);
  const [game, setGame] = useState(0);
  useEffect(() => { loadSettings(); }, []);
  // сохранённая партия — при каждом возврате в меню: «Продолжить партию»
  useEffect(() => {
    if (route !== 'menu') return;
    let live = true;
    loadGame().then(g => { if (live) setSaved(g?.saved ?? null); });
    return () => { live = false; };
  }, [route]);
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
            onResume={saved ? () => play(saved) : null} onSettings={() => setRoute('settings')} />
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
