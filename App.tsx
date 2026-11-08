// Корень: экраны переключаются состоянием, без роутера (как в «Нардах», docs/02-architecture.md).
import React, { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MenuScreen } from './src/screens/MenuScreen';
import type { Choice } from './src/screens/MenuScreen';
import { GameScreen } from './src/game/GameScreen';
import { C } from './src/ui/theme';

export default function App() {
  const [route, setRoute] = useState<'menu' | 'game'>('menu');
  const [choice, setChoice] = useState<Choice>({ variant: 'podkidnoy', bots: 1, level: 'average' });
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route === 'menu') return false;
      setRoute('menu');
      return true;
    });
    return () => sub.remove();
  }, [route]);
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={styles.root}>
        {route === 'menu'
          ? <MenuScreen choice={choice} onChange={setChoice} onPlay={() => setRoute('game')} />
          : <GameScreen {...choice} onExit={() => setRoute('menu')} />}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: C.bg } });
