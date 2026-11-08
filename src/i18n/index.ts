// Все тексты интерфейса: экраны читают `T.раздел.ключ` в момент отрисовки (механика — из «Нард»).
// В 1.0 — только русский. Слово «дурак» — только в названии магазина и в правилах; итог партии
// говорит «остались с картами» (docs/specs/2026-11-v1.md, «Решения агента»).
import type { Reason, Variant } from '../engine';
import type { Level } from '../bot';
import { pluralRu } from './plural';

const LEVEL_NAME: Record<Level, string> = {
  novice: 'Новичок', beginner: 'Начинающий', amateur: 'Любитель', average: 'Средний',
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
  },
  /** Русские индексы карт (ADR 0010): 6 … 10, В, Д, К, Т. */
  ranks: ['6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'] as const,
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
    menu: 'В меню',
  },
  result: {
    win: 'Вы вышли — без карт',
    lose: 'Остались с картами: вы',
    other: (name: string) => `Остались с картами: ${name}`,
    draw: 'Ничья: карт не осталось ни у кого',
    again: 'Ещё партию',
  },
};
