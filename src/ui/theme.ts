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
  /** затемнение под окном (диалог, лист) */
  scrim: 'rgba(2,8,10,0.62)',
  /** Сукно: светлее к середине. */
  feltLight: '#174047',
} as const;

/** Цвета мастей ♠ ♣ ♦ ♥ (docs/09-game-design.md, «Вид»): обычная колода или четырёхцветная. */
export const suitColors = (fourColor: boolean): readonly string[] =>
  fourColor ? [C.black, C.green, C.blue, C.red] : [C.black, C.black, C.red, C.red];

/** Скругления (лист стиля, 13-art.md §4): карта 8, малые (ряд вариантов, ячейки, поля ввода) 12, панели и листы 20,
 *  кнопки — капсула. */
export const RADIUS = { playing: 8, small: 12, panel: 20, pill: 999 } as const;

/** Размеры текста (13-art.md §3), sp: подпись, текст, кнопка и выделенное, раздел, заголовок экрана, название игры.
 *  Других размеров на экранах нет — `tools/test/theme.test.ts`. */
export const TYPE = { caption: 13, body: 15, button: 17, section: 20, title: 28, display: 40 } as const;

/** Отступы (13-art.md §4), dp: внутри группы 8, между группами 24, поля экрана 16. */
export const SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const HEAD = undefined as string | undefined;

/** Высота верхней полосы экранов со столом: постоянная, чтобы стол не менял размер (0.5.1). */
export const TOP_BAR = 44;
