// из nardy: src/state/storage.ts @ 1d2bdff (ADR 0001) — только JSON-обёртки, ключи свои (docs/04-data-model.md).
import AsyncStorage from '@react-native-async-storage/async-storage';

/** JSON-обёртки над AsyncStorage, которые не бросают: сбой хранилища не должен ронять игру. */
export async function loadJson<T>(key: string): Promise<T | null> {
  try {
    const s = await AsyncStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

export async function saveJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // хранилище полно или недоступно: игра идёт дальше, теряется только продолжение
  }
}

export async function remove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch { /* нечего удалять — не страшно */ }
}

export const KEYS = {
  /** незаконченная партия с ботами (`SavedGame`, src/state/save.ts) */
  current: 'durak.current',
  /** настройки (`Settings`, src/state/settings.ts) */
  settings: 'durak.settings',
  /** журнал сбоев, 30 последних записей (src/state/crashlog.ts) */
  crashlog: 'durak.crashlog',
  /** ключ устройства, ник и тег онлайна (`Device`, src/state/net.ts) */
  device: 'durak.device',
  /** отметка «Мне есть 14 лет» (src/state/onlineStore.ts) */
  adult: 'durak.adult',
} as const;
