// Свой облик «Козыря» (ADR 0012): тёмный стол со стеклом, как «Сумерки» «Нард», но своя палитра —
// сукно цвета ночной хвои и тёплое золото. Все цвета интерфейса — здесь.
export const C = {
  bg: '#0B1A1E',
  felt: '#123238',
  feltEdge: '#1C4249',
  glass: 'rgba(255,255,255,0.07)',
  glassLine: 'rgba(255,255,255,0.14)',
  sheet: '#16282D',
  line: '#2A454B',
  text: '#EEF3F2',
  dim: '#A9BDBA',
  accent: '#E3B75E',
  accentText: '#1A1406',
  face: '#F8F5EC',
  faceLine: '#D9D2BF',
  red: '#B3261E',
  black: '#1B2328',
  back: '#7A2E2E',
  backLine: '#E3B75E',
  ok: '#7FD1A1',
  /** Ошибка и непрошедшая проверка колоды — светлый красный, читается на тёмном столе. */
  danger: '#F2A7A0',
  /** Четырёхцветная колода: ♣ зелёные, ♦ синие (♠ — black, ♥ — red). */
  green: '#1E6B3A',
  blue: '#1F4FA3',
  /** Подсветка места, куда можно положить карту, и выбранной карты. */
  glow: '#E3B75E',
  /** Тень под картой. */
  shadow: 'rgba(0,0,0,0.35)',
  /** Сукно: светлее к середине. */
  feltLight: '#174047',
} as const;

/** Цвета мастей ♠ ♣ ♦ ♥ (docs/09-game-design.md, «Вид»): обычная колода или четырёхцветная. */
export const suitColors = (fourColor: boolean): readonly string[] =>
  fourColor ? [C.black, C.green, C.blue, C.red] : [C.black, C.black, C.red, C.red];

export const RADIUS = { card: 14, button: 22, playing: 8 } as const;
export const HEAD = undefined as string | undefined;
