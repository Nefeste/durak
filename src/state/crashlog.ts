// из nardy: src/state/crashlog.ts @ 1d2bdff (ADR 0001) — ключ durak.crashlog, вид «save» вместо «bot».
// Журнал сбоев (docs/specs/2026-09-first-game.md, «Прочее»): последние ошибки на телефоне — чтобы
// тестировщик мог прислать не «вылетело», а что и где. Никуда не уходит сам: только в отчёт,
// который игрок видит целиком и отправляет своими руками.
import { KEYS, loadJson, saveJson } from './storage';

export type CrashKind = 'crash' | 'error' | 'render' | 'save' | 'web';
export interface CrashEntry { at: number; kind: CrashKind; message: string }

/** Сколько записей хранить и какой длины каждая. */
export const CRASH_MAX = 30;
const LEN = 1000;
const STACK_LINES = 8;

/**
 * Текст ошибки для журнала: имя, сообщение и начало стека. Ключ устройства в заголовке
 * `Bearer …` вычищается — на случай, если он когда-нибудь окажется в тексте ошибки.
 */
export function crashText(err: unknown, where?: string): string {
  const e = err as { name?: string; message?: string; stack?: string } | null;
  const head = e && typeof e === 'object'
    ? `${e.name ?? 'Error'}: ${e.message ?? ''}`
    : String(err);
  const stack = e && typeof e === 'object' && e.stack ? e.stack.split('\n').slice(1, 1 + STACK_LINES).join('\n') : '';
  const text = [where, head, stack].filter(Boolean).join('\n');
  return text.replace(/Bearer\s+\S+/gi, 'Bearer ***').slice(0, LEN);
}

// записи идут друг за другом: две ошибки подряд не должны затереть друг друга
let queue: Promise<void> = Promise.resolve();

export function logError(kind: CrashKind, err: unknown, where?: string): void {
  const entry: CrashEntry = { at: Date.now(), kind, message: crashText(err, where) };
  queue = queue.then(async () => {
    const list = (await loadJson<CrashEntry[]>(KEYS.crashlog)) ?? [];
    await saveJson(KEYS.crashlog, [...(Array.isArray(list) ? list : []), entry].slice(-CRASH_MAX));
  }).catch(() => {});
}

/** Журнал; `null` — не прочитался (в отчёте так и будет сказано). */
export async function readCrashlog(): Promise<CrashEntry[] | null> {
  try {
    await queue;
    const list = await loadJson<CrashEntry[]>(KEYS.crashlog);
    return Array.isArray(list) ? list : [];
  } catch {
    return null;
  }
}

/**
 * Ловушки при запуске. `ErrorUtils` есть в React Native (на вебе — нет); прежний обработчик
 * вызывается дальше — поведение сбоя не меняется. Необработанные отказы промисов в релизной
 * сборке Hermes не отслеживаются вовсе (трекер — только в `__DEV__`), поэтому сетевые ошибки
 * пишет сам сетевой слой. На вебе — `error` и `unhandledrejection`.
 */
export function installCrashHandlers(): void {
  const EU = (globalThis as { ErrorUtils?: { getGlobalHandler?: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler?: (h: (e: unknown, fatal?: boolean) => void) => void } }).ErrorUtils;
  if (EU?.getGlobalHandler && EU.setGlobalHandler) {
    const prev = EU.getGlobalHandler();
    EU.setGlobalHandler((e, fatal) => { logError(fatal ? 'crash' : 'error', e); prev?.(e, fatal); });
  }
  const w = (globalThis as { window?: { addEventListener?: (t: string, f: (e: { error?: unknown; message?: string; reason?: unknown }) => void) => void } }).window;
  if (w?.addEventListener) {
    w.addEventListener('error', e => logError('web', e.error ?? e.message));
    w.addEventListener('unhandledrejection', e => logError('web', e.reason));
  }
}
