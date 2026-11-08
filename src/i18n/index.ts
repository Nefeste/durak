// Все тексты интерфейса: экраны читают `T.раздел.ключ` в момент отрисовки (механика — из «Нард»).
// В 1.0 — только русский. Слово «дурак» — только в названии магазина и в правилах; итог партии
// говорит «остались с картами» (docs/specs/2026-11-v1.md, «Решения агента»).
import type { Reason, Variant } from '../engine';
import type { Level } from '../bot';
import { pluralRu } from './plural';

const LEVEL_NAME: Record<Level, string> = {
  novice: 'Новичок', beginner: 'Начинающий', amateur: 'Любитель', average: 'Средний',
  experienced: 'Опытный', strong: 'Сильный', master: 'Мастер',
};

const REASON: Record<Reason, string> = {
  gameOver: 'Партия кончилась',
  notYourMove: 'Сейчас не ваш ход',
  notInHand: 'Этой карты нет в руке',
  needCards: 'Выберите карту',
  mixedRanks: 'Ходят одной картой или картами одного достоинства',
  overLimit: 'Больше карт в этом отбое нельзя',
  rankNotOnTable: 'Подкидывать можно только достоинства, которые уже на столе',
  waitFirstCover: 'Подкидывать можно, когда покрыта первая карта',
  notCovered: 'Этой карты нет на столе',
  doesNotBeat: 'Эта карта не бьёт',
  alreadyCovered: 'Эта карта уже покрыта',
  noTransferVariant: 'Переводить можно только в переводном',
  noTransferFirstBout: 'В первом отбое переводить нельзя',
  transferAfterCover: 'Переводить можно, пока ничего не покрыто',
  transferRank: 'Переводят картой того же достоинства',
  transferTooMany: 'У следующего игрока не хватит карт отбиться',
  nothingToTake: 'Всё покрыто — брать нечего',
  alreadyPassed: 'Вы уже сказали «пас»',
};

const VARIANT: Record<Variant, string> = { podkidnoy: 'Подкидной', perevodnoy: 'Переводной' };

export const T = {
  app: { name: 'Козырь', tagline: 'Дурак подкидной и переводной' },
  dialog: { cancel: 'Вернуться' },
  menu: {
    play: 'Играть',
    variant: 'Стол',
    opponents: 'Соперники',
    level: 'Уровень',
    bots: (n: number) => `${n} ${pluralRu(n, 'бот', 'бота', 'ботов')}`,
    resume: 'Продолжить партию',
    settings: 'Настройки',
  },
  settings: {
    title: 'Настройки',
    sound: 'Звук',
    vibration: 'Вибрация',
    lessMotion: 'Меньше движения',
    lessMotionSystem: 'Как в системе телефона',
    lessMotionOn: 'Включено',
    lessMotionOff: 'Выключено',
    lessMotionNote: 'Карты появляются на месте сразу, без полёта.',
    botSpeed: 'Скорость ботов',
    botNormal: 'Обычно',
    botFast: 'Быстро',
    handOrder: 'Порядок руки',
    bySuit: 'По мастям',
    byRank: 'По старшинству',
    handOrderNote: 'Козыри — всегда справа.',
    fourColor: 'Четырёхцветная колода',
    fourColorNote: '♠ чёрные, ♣ зелёные, ♦ синие, ♥ красные.',
    seenCards: 'Вышедшие карты',
    seenCardsNote: 'Таблица того, что ушло в сброс, — в игре против ботов.',
    on: 'Вкл.',
    off: 'Выкл.',
    report: 'Сообщить об ошибке',
    back: 'Назад',
  },
  report: {
    title: 'Сообщить об ошибке',
    what: 'Что случилось',
    placeholder: 'Например: карта не легла на стол',
    send: 'Поделиться отчётом',
    note: 'Отчёт уходит только вашими руками. Вот он целиком:',
    labels: {
      what: 'Что случилось', version: 'Версия', device: 'Телефон', screen: 'Экран', game: 'Партия',
      log: 'Журнал сбоев', noLog: 'сбоев не было', logUnread: 'журнал не прочитался',
    },
  },
  seen: {
    title: 'Вышедшие карты',
    discard: 'в сбросе',
    openly: 'взята в открытую',
    unknown: 'не выходила',
    legend: 'Серым — в сбросе, в золотой рамке — взяты соперником в открытую.',
    close: 'Закрыть',
  },
  /** Русские индексы карт (ADR 0010): 6 … 10, В, Д, К, Т. */
  ranks: ['6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'] as const,
  /** Масти по порядку движка: ♠ ♣ ♦ ♥. */
  suits: ['♠', '♣', '♦', '♥'] as const,
  variant: VARIANT,
  level: LEVEL_NAME,
  reason: REASON,
  game: {
    you: 'Вы',
    bot: (n: number) => `Бот ${n}`,
    botMark: 'бот',
    take: 'Беру',
    pass: 'Пас',
    done: 'Бито',
    transfer: 'Перевести',
    cards: (n: number) => `${n} ${pluralRu(n, 'карта', 'карты', 'карт')}`,
    talon: (n: number) => `прикуп ${n}`,
    trump: 'козырь',
    attacking: 'ходит',
    defending: 'отбивается',
    out: 'вышел',
    hintAttack: 'Ваш ход — выберите карту',
    hintDefend: 'Отбивайтесь или берите',
    hintDefendTransfer: 'Отбивайтесь, переводите или берите',
    hintThrow: 'Подкиньте или скажите «пас»',
    hintGive: 'Подкиньте вдогонку или «пас»',
    hintWait: 'Ход соперника',
    pickTarget: 'Какую карту бить? Коснитесь её на столе',
    pickTargetOrTransfer: 'Коснитесь карты, которую бить, — или переведите',
    hintAutoDone: 'Подкинуть нечего — «бито»',
    trumpIs: (suit: string) => `козырь ${suit}`,
    seen: 'Вышедшие',
    undo: 'Отменить',
    menu: 'В меню',
    advise: 'Подсказка',
    thinking: 'Думаю…',
    /** Строка подсказки: что сделать и шанс (docs/09-game-design.md, «Подсказки»). */
    advice: (what: string, chance: number | null, exact: boolean) => chance === null ? what
      : exact ? `${what} — ${chance === 1 ? 'при лучшей игре вы выходите' : chance === 0.5 ? 'при лучшей игре — ничья' : 'проигрыш при лучшей игре соперника, так труднее всего'}`
      : `${what} — шанс выйти без карт ${Math.round(chance * 100)} %`,
    adviceAttack: (cards: string) => `Ходите ${cards}`,
    adviceThrow: (cards: string) => `Подкиньте ${cards}`,
    adviceBeat: (on: string, by: string) => `Побейте ${on} картой ${by}`,
    adviceTransfer: (cards: string) => `Переведите: ${cards}`,
    adviceTake: 'Берите',
    advicePass: 'Пас',
    adviceDone: 'Бито',
  },
  result: {
    win: 'Вы вышли — без карт',
    lose: 'Остались с картами: вы',
    other: (name: string) => `Остались с картами: ${name}`,
    draw: 'Ничья: карт не осталось ни у кого',
    again: 'Ещё партию',
  },
};
