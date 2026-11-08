// из nardy: src/ui/feedback.ts @ 1d2bdff — свои звуки (тасовка, шлепок, «бито», «беру»), без стука на
// выбор, победы и тиканья; настройка вибрации зовётся `vibration`.
// Звук и вибрация стола (docs/09-game-design.md, «Звук»): тасовка при раздаче, шлепок карты о стол,
// шорох «бито», мягкий «беру» — записи CC0 по нескольку вариантов (assets/sounds/SOURCES.md,
// tools/sound/recorded.py): каждый раз случайный, не тот же, что только что, и у каждого свой
// проигрыватель — карты подряд не обрывают друг друга. Проигрыватели заводятся заранее, когда открылся
// стол, и чинятся после ошибки Android во время игры (src/ui/voices.ts). Вибрация — только на свои
// действия. «Меньше движения» звук не выключает: его выключает «Звук» в настройках.
// Ничто здесь не бросает: без звука игра та же.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { getSettings } from '../state/store';
import { logError } from '../state/crashlog';
import type { TableCue } from '../game/cues';
import { pickVariant, strength } from './variants';
import { Voices } from './voices';

const FILES = {
  shuffle: [
    require('../../assets/sounds/shuffle-1.wav'), require('../../assets/sounds/shuffle-2.wav'), require('../../assets/sounds/shuffle-3.wav'),
  ],
  slap: [
    require('../../assets/sounds/slap-1.wav'), require('../../assets/sounds/slap-2.wav'), require('../../assets/sounds/slap-3.wav'),
    require('../../assets/sounds/slap-4.wav'), require('../../assets/sounds/slap-5.wav'), require('../../assets/sounds/slap-6.wav'),
  ],
  swish: [
    require('../../assets/sounds/swish-1.wav'), require('../../assets/sounds/swish-2.wav'),
    require('../../assets/sounds/swish-3.wav'), require('../../assets/sounds/swish-4.wav'),
  ],
  take: [require('../../assets/sounds/take-1.wav'), require('../../assets/sounds/take-2.wav'), require('../../assets/sounds/take-3.wav')],
} as const satisfies Record<TableCue, readonly unknown[]>;

/**
 * Отклик Android (`View.performHapticFeedback`): следует системной настройке «Виброотклик» и не требует
 * разрешения. Первый вид — с Android 11 (API 30), второй есть везде.
 */
const BUZZ: Record<TableCue, [Haptics.AndroidHaptics, Haptics.AndroidHaptics]> = {
  shuffle: [Haptics.AndroidHaptics.Context_Click, Haptics.AndroidHaptics.Context_Click],
  slap: [Haptics.AndroidHaptics.Clock_Tick, Haptics.AndroidHaptics.Clock_Tick],
  swish: [Haptics.AndroidHaptics.Context_Click, Haptics.AndroidHaptics.Context_Click],
  take: [Haptics.AndroidHaptics.Context_Click, Haptics.AndroidHaptics.Context_Click],
};

// в браузере — тишина: там приложение только проверяется, а звук до первого касания браузер запрещает
const native = Platform.OS !== 'web';
const last: Partial<Record<TableCue, number>> = {};
let ready = false;

const SIZES = Object.fromEntries(Object.entries(FILES).map(([id, list]) => [id, list.length])) as Record<TableCue, number>;

/** Проигрыватель варианта (expo-audio); ошибка Android на нём — `fail`, файл откроется заново. */
const voices = new Voices<TableCue>(SIZES, (id, k, fail) => {
  if (!ready) {
    ready = true;
    // игра не перебивает музыку и молчит, когда телефон на беззвучном
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(() => {});
  }
  const file = FILES[id][k];
  const p = createAudioPlayer(file);
  p.addListener('playbackStatusUpdate', st => { if (st.error) fail(st.error); });
  return {
    play(volume) {
      p.volume = volume;
      void p.seekTo(0).catch(() => {});
      p.play();
    },
    reload() { p.replace(file); },
  };
}, (key, why) => logError('error', why, `sound ${key}`));

/** Звуки стола, которые заводятся заранее. */
const WARM: TableCue[] = ['shuffle', 'slap', 'swish', 'take'];
/** Шаг заведения: один проигрыватель за шаг. */
const WARM_STEP_MS = 150;

/** Все звуки стола — заранее, когда открылся стол, по одному проигрывателю за шаг: стол не замирает. */
export function preloadSounds(): void {
  if (!native) return;
  if (!getSettings().sound) return;
  voices.warm(WARM, next => { setTimeout(next, WARM_STEP_MS); });
}

/** Отклик на событие стола. `mine` — своё действие: вибрация только на свои. */
export function cue(what: TableCue, mine: boolean): void {
  if (!native) return;
  const s = getSettings();
  if (s.sound) {
    preloadSounds();
    const k = pickVariant(SIZES[what], last[what]);
    last[what] = k;
    voices.play(what, k, strength());    // не бросает: отказ — в журнал сбоев, звук не главное
  }
  if (s.vibration && mine) {
    if (Platform.OS === 'android') {
      const [first, fallback] = BUZZ[what];
      Haptics.performAndroidHapticsAsync(first).catch(() => Haptics.performAndroidHapticsAsync(fallback).catch(() => {}));
    } else {
      Haptics.selectionAsync().catch(() => {});
    }
  }
}
