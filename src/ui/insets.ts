// Отступы от краёв экрана: вырез, строка состояния и кнопки «Назад / Домой / Недавние» внизу.
// На телефоне — react-native-safe-area-context (Android рисует приложение от края до края, SDK 57).
// В браузере для проверки можно добавить отступ сверху и снизу: `?inset=48` (tools/e2e/browser.ts
// проверяет, что нижние кнопки стоят над ним) — так видно то, что владелец увидел на телефоне в 0.5.0.
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EdgeInsets } from 'react-native-safe-area-context';

function webInset(): number {
  if (Platform.OS !== 'web' || typeof location === 'undefined') return 0;
  const n = Number(new URLSearchParams(location.search).get('inset'));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 0;
}

const EXTRA = webInset();

export function useInsets(): EdgeInsets {
  const i = useSafeAreaInsets();
  return EXTRA ? { ...i, top: i.top + Math.round(EXTRA / 2), bottom: i.bottom + EXTRA } : i;
}
