// Настройки игрока (docs/09-game-design.md, «Настройки»). Чистые функции: разбор сохранённой строки
// и что действует, если «Меньше движения» игрок не трогал, — как в системе телефона (ADR устава
// 0023, правило 6; по образцу Nefeste/shelter src/state/settings.ts). Читает и пишет — src/state/store.ts.

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
  /** Таблица вышедших карт против ботов; по умолчанию выключена. */
  seenCards: boolean;
  /** Персональная реклама (по интересам), как в «Нардах»; выключено — обычная, её не меньше. */
  personalAds: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true, vibration: true, botSpeed: 'normal', handOrder: 'suit', fourColor: false, seenCards: false, personalAds: true,
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], dflt: T): T => (allowed.includes(v as T) ? (v as T) : dflt);
const flag = (v: unknown, dflt: boolean): boolean => (typeof v === 'boolean' ? v : dflt);

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
    seenCards: flag(v.seenCards, d.seenCards),
    personalAds: flag(v.personalAds, d.personalAds),
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
