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
  /** Сукно: светлее под лампой (пятно света, 13-art.md §5). */
  feltLight: '#1C4850',
  /** Комната (Backdrop.tsx): верх неба, тёплое пятно лампы, холодный отсвет внизу. */
  sky: '#0F262C',
  lamp: '#F0C878',
  cool: '#2A7F8A',
  /** Пол комнаты (Backdrop.tsx, 13-art.md §5): тон доски поверх фона, доска посветлее, щель между досками. */
  floor: 'rgba(126,86,51,0.05)',
  floorLight: 'rgba(126,86,51,0.085)',
  floorSeam: 'rgba(2,8,10,0.2)',
  /** Борт стола — дерево: свет сверху, тень снизу. */
  wood: '#5A3A22',
  woodLight: '#7E5633',
  woodDark: '#35210F',
  /** Блик по верхней кромке стекла и золотой кнопки; отсвет на верхней половине стекла. */
  shine: 'rgba(255,255,255,0.22)',
  sheen: 'rgba(255,255,255,0.025)',
} as const;

/** Фон комнаты (13-art.md §5): небо сверху вниз и пятна света — лампа над столом и холодный отсвет снизу. */
export const SKY = [C.sky, C.bg] as const;
export const GLOWS = [
  { id: 'lamp', color: C.lamp, opacity: 0.14, cx: '50%', cy: '16%', r: '58%' },
  { id: 'cool', color: C.cool, opacity: 0.1, cx: '50%', cy: '104%', r: '62%' },
] as const;

/**
 * Рубашки (13-art.md §11, каталог — src/render/backs.ts): оформления — контент со своей палитрой (ADR устава 0023,
 * правило 4). `base` — основа, `line` — рамка и узор, `mark` — второй цвет узора, где он есть.
 */
export const BACKS = {
  classic: { base: C.back, line: C.backLine, mark: C.backLine },
  indigo: { base: '#24406E', line: '#E9E2CF', mark: '#E9E2CF' },
  pine: { base: '#2E6A55', line: '#E6D29A', mark: '#E6D29A' },
  weave: { base: '#4B2F57', line: '#E2B8A0', mark: '#E2B8A0' },
  rays: { base: '#6A2030', line: '#E3B75E', mark: '#E3B75E' },
  frost: { base: '#C7D6DD', line: '#2C4C6E', mark: '#2C4C6E' },
  scales: { base: '#1F6068', line: '#A9DAD6', mark: '#A9DAD6' },
  chevron: { base: '#333E45', line: '#E3B75E', mark: '#E3B75E' },
  suits: { base: '#EFE7D4', line: '#7A2E2E', mark: '#1B2328' },
  amber: { base: '#C48A32', line: '#44260E', mark: '#44260E' },
} as const;

/**
 * Портреты соперников-ботов (docs/13-art.md, §11; src/game/Portrait.tsx): приглушённые «нити» под ночную хвою стола.
 * Золота `accent` среди них нет — оно означает главное действие. `ground` — сукно медальона, `skin` и `shade` — три
 * тона лица и тень шеи к ним, `hair` — волосы, `cloth` — одежда, кепки и шали, `ink` — глаза и оправа, `metal` —
 * серьги, `linen` — воротник.
 */
export const PORTRAIT = {
  ground: '#1F4A52',
  skin: ['#F2D3B5', '#E2B48C', '#BE8A63'],
  shade: ['#D9B291', '#C4946C', '#9C6C49'],
  hair: { ink: '#2A2422', brown: '#5E3F2B', chestnut: '#8A5A36', fair: '#D8BE8A', red: '#B5582F', grey: '#A9B1B3', white: '#E6E8E4' },
  cloth: { wine: '#8C3B3B', teal: '#2F8088', slate: '#5F7890', moss: '#62804F', plum: '#7D5C86', rust: '#B0683E', sand: '#C2AC84', night: '#14242A' },
  ink: '#1B2328',
  metal: '#E9E4D4',
  linen: '#EDE8DA',
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

/**
 * Графики «Статистики» (docs/09-game-design.md, «Статистика», «Как оформлено»): отметки лежат в тёмном «колодце»
 * внутри стеклянной карточки, как в «Нардах». Места — расходящаяся шкала: хорошее плечо синее (первым — насыщенный,
 * позже — светлый того же тона), плохое — оранжевое, ничья — серая середина. Проверено `validate_palette.js` навыка
 * dataviz на колодце `ring` (тёмный режим) и тестом tools/test/charts.test.ts.
 */
export const CHART = {
  /** колодец поверх стекла карточки */
  well: 'rgba(2,8,10,0.5)',
  /** то же, непрозрачное: кольцо вокруг точки и поверхность для проверки палитры */
  ring: '#0F191C',
  first: '#3987E5',
  out: '#9EC5F4',
  draw: '#7A8886',
  fool: '#D95926',
  /** число внутри заливки — тёмное на всех четырёх (≥ 4,5 : 1) */
  onFill: C.bg,
  /** главное: текущий рейтинг, ваша точка */
  focus: C.accent,
  /** второстепенное: линия рейтинга */
  muted: '#7A8886',
  /** оси и опорные линии — волосные, сплошные */
  axis: 'rgba(255,255,255,0.30)',
  /** подписи внутри SVG — тем же рубленым шрифтом, что текст экрана (без этого веб берёт шрифт с засечками) */
  font: 'sans-serif',
} as const;
