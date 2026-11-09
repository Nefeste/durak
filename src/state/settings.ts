// Настройки игрока (docs/09-game-design.md, «Настройки»). Чистые функции: разбор сохранённой строки
// и что действует, если «Меньше движения» игрок не трогал, — как в системе телефона (ADR устава
// 0023, правило 6; по образцу Nefeste/shelter src/state/settings.ts). Читает и пишет — src/state/store.ts.
import { LEVELS } from '../bot';
import type { Level } from '../bot';
import type { Variant } from '../engine';

export type BotSpeed = 'normal' | 'fast';
export type HandOrder = 'suit' | 'rank';

export interface Settings {
  sound: boolean;
  vibration: boolean;
  /** «Меньше движения»; не задано — как в системе телефона. */
  lessMotion?: boolean;
  botSpeed: BotSpeed;
  handOrder: HandOrder;
  /** Четырёхцветная колода: ♠ чёрные, ♣ зелёные, ♥ красные, ♦ синие. */
  fourColor: boolean;
  /** «Помощь памяти (для учёбы)»: взятые в открытую карты соперников лицом и таблица вышедших —
   *  только против ботов, онлайн никогда (ADR 0006). По умолчанию выключена (решение владельца 08.11.2026). */
  memoryAid: boolean;
  /** Персональная реклама (по интересам), как в «Нардах»; выключено — обычная, её не меньше. */
  personalAds: boolean;
  /** «Подсказки для новичка»: строка над рукой первые три отбоя (src/game/newbie.ts). Гаснет сама после первой
   *  партии; включённая снова — учит в следующей партии и снова показывает окно о переводе. */
  newbie: boolean;
  /** Окно «Что такое перевод» уже показано — перед переводным столом оно бывает один раз. */
  transferTold: boolean;
  /** Стол в меню: вариант, число ботов, уровень. Запоминается; первая партия — подкидной вдвоём против
   *  «Начинающего» (спецификация 1.0, §3; docs/09-game-design.md, «Первая партия»). */
  choice: { variant: Variant; bots: number; level: Level };
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true, vibration: true, botSpeed: 'normal', handOrder: 'suit', fourColor: false, memoryAid: false, personalAds: true,
  newbie: true, transferTold: false, choice: { variant: 'podkidnoy', bots: 1, level: 'beginner' },
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], dflt: T): T => (allowed.includes(v as T) ? (v as T) : dflt);
const flag = (v: unknown, dflt: boolean): boolean => (typeof v === 'boolean' ? v : dflt);

function choiceOf(v: unknown, d: Settings['choice']): Settings['choice'] {
  if (!v || typeof v !== 'object') return d;
  const c = v as Record<string, unknown>;
  const bots = typeof c.bots === 'number' && [1, 2, 3].includes(c.bots) ? c.bots : d.bots;
  return { variant: pick(c.variant, ['podkidnoy', 'perevodnoy'] as const, d.variant), bots, level: pick(c.level, LEVELS, d.level) };
}

/** Сохранённая строка → настройки; мусор и пусто — по умолчанию, по полю. */
export function parseSettings(raw: string | null): Settings {
  let v: Record<string, unknown> = {};
  try {
    const p = raw ? (JSON.parse(raw) as unknown) : {};
    if (p && typeof p === 'object' && !Array.isArray(p)) v = p as Record<string, unknown>;
  } catch { /* битая строка — по умолчанию */ }
  const d = DEFAULT_SETTINGS;
  const s: Settings = {
    sound: flag(v.sound, d.sound),
    vibration: flag(v.vibration, d.vibration),
    botSpeed: pick(v.botSpeed, ['normal', 'fast'] as const, d.botSpeed),
    handOrder: pick(v.handOrder, ['suit', 'rank'] as const, d.handOrder),
    fourColor: flag(v.fourColor, d.fourColor),
    // до 0.5.1 настройка звалась `seenCards` и включала только таблицу
    memoryAid: flag(v.memoryAid ?? v.seenCards, d.memoryAid),
    personalAds: flag(v.personalAds, d.personalAds),
    newbie: flag(v.newbie, d.newbie),
    transferTold: flag(v.transferTold, d.transferTold),
    choice: choiceOf(v.choice, d.choice),
  };
  if (typeof v.lessMotion === 'boolean') s.lessMotion = v.lessMotion;
  return s;
}

/** Действует ли «Меньше движения»: выбор игрока, а если он не выбирал — системная настройка. */
export function lessMotionOf(s: Settings, system: boolean): boolean {
  return s.lessMotion ?? system;
}

/** Пауза бота перед действием, мс (docs/09-game-design.md, «Темп»): «Обычно» 500–900, «Быстро» 200–400. */
export function botDelay(speed: BotSpeed, r: number): number {
  const [lo, hi] = speed === 'fast' ? [200, 400] : [500, 900];
  return Math.round(lo + (hi - lo) * Math.min(1, Math.max(0, r)));
}

/** Есть ли в сохранённой строке выбор «Подсказок для новичка» — до 1.0 его не было (`taughtBefore`). */
export function hasNewbie(raw: string | null): boolean {
  try {
    const p = raw ? (JSON.parse(raw) as unknown) : null;
    return !!p && typeof p === 'object' && 'newbie' in p;
  } catch { return false; }
}

/** Игрок из версии до подсказок новичка: кто уже доиграл партию с ботами, того не учим заново, а кто играл
 *  переводной — тому не объясняем перевод. Новый игрок (партий нет) — по умолчанию. */
export function taughtBefore(s: Settings, games: { variant: string }[]): Settings {
  if (!games.length) return s;
  return { ...s, newbie: false, transferTold: s.transferTold || games.some(g => g.variant === 'perevodnoy') };
}
