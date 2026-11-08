// Настройки в памяти и в хранилище: один источник для всех экранов (useSettings), запись — сразу
// при изменении. Системное «уменьшить движение» читается здесь же (по образцу Nefeste/shelter
// src/state/game.ts): пока игрок не выбрал сам, «Меньше движения» следует системе.
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo } from 'react-native';
import { KEYS } from './storage';
import { DEFAULT_SETTINGS, lessMotionOf, parseSettings } from './settings';
import type { Settings } from './settings';

let settings: Settings = { ...DEFAULT_SETTINGS };
let systemLess = false;
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** Прочитать настройки и подписаться на системную «уменьшить движение»; один раз при запуске. */
export async function loadSettings(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    settings = parseSettings(await AsyncStorage.getItem(KEYS.settings));
  } catch { /* хранилище недоступно — по умолчанию */ }
  try {
    systemLess = await AccessibilityInfo.isReduceMotionEnabled();
    AccessibilityInfo.addEventListener('reduceMotionChanged', v => { systemLess = v; emit(); });
  } catch { /* на вебе в части браузеров нет — «как в системе» значит «нет» */ }
  emit();
}

export function setSettings(patch: Partial<Settings>): void {
  settings = { ...settings, ...patch };
  emit();
  AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings)).catch(() => {});
}

export const getSettings = (): Settings => settings;

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

/** Действует ли «Меньше движения» сейчас (выбор игрока или система). */
export function useLessMotion(): boolean {
  const s = useSettings();
  return useSyncExternalStore(subscribe, () => lessMotionOf(s, systemLess), () => lessMotionOf(s, systemLess));
}
export const systemLessMotion = (): boolean => systemLess;
