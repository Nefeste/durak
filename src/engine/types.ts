// Свод, позиция и действия (docs/04-data-model.md). Движок — чистый TypeScript: без React,
// часов и случайности; порядок колоды ему передают (ADR 0002, 0004).
import type { Card } from './cards';

export type Variant = 'podkidnoy' | 'perevodnoy';

/** Подкидывать (п. 4.3, ADR 0013): по очереди — первое право у ходящего, за ним по часовой стрелке; кто успел — без очереди. */
export type ThrowOrder = 'queue' | 'free';

/** Свод правил с настройками стола: версия пишется в каждую партию (ADR 0003, 0013). Числа — docs/08-rules.md. */
export interface RuleSet {
  /** `durak-rules-v1` — партии до 09.11.2026, очереди нет; `durak-rules-v2` — с настройкой `order`. */
  id: 'durak-rules-v1' | 'durak-rules-v2';
  /** п. 4.4: предел карт атаки в отбое. */
  maxAttack: number;
  /** п. 4.4: предел в первом отбое партии. */
  firstBoutAttack: number;
  /** п. 6.6: можно ли переводить в первом отбое. По своду — нельзя (вопрос владельцу #2). */
  firstBoutTransfer: boolean;
  /** п. 5: добор до стольких карт. */
  handSize: number;
  /** п. 4.3: очередь атакующих. Нет поля (записи `durak-rules-v1`) — «кто успел»: так их и играли. */
  order?: ThrowOrder;
}

/** Свод до 09.11.2026: без очереди. Им переигрываются старые записи; задачи дня — вдвоём, там очередь не важна. */
export const RULES_V1: RuleSet = {
  id: 'durak-rules-v1',
  maxAttack: 6,
  firstBoutAttack: 5,
  firstBoutTransfer: false,
  handSize: 6,
};

/** Свод сейчас: по умолчанию — по очереди (решение владельца #57). */
export const RULES: RuleSet = { ...RULES_V1, id: 'durak-rules-v2', order: 'queue' };

/** Свод с выбранной настройкой «Подкидывать»: «кто успел» — это ровно свод `durak-rules-v1` (так старые версии игры
 *  за таким столом онлайн видят тот же свод, что у себя). */
export const rulesWith = (order: ThrowOrder): RuleSet => (order === 'free' ? RULES_V1 : RULES);

/** Как подкидывают за этим столом: у записей без поля — «кто успел». */
export const orderOf = (r: RuleSet): ThrowOrder => r.order ?? 'free';

/** Знает ли игра этот свод: `durak-rules-v1` или `durak-rules-v2` с настройкой «Подкидывать». */
export const knownRules = (r: RuleSet | undefined | null): boolean =>
  !!r && (r.id === 'durak-rules-v1' || (r.id === 'durak-rules-v2' && (r.order === 'queue' || r.order === 'free')));

export const isThrowOrder = (v: unknown): v is ThrowOrder => v === 'queue' || v === 'free';

export interface Setup {
  rules: RuleSet;
  variant: Variant;
  /** 2–4 места, ход по часовой стрелке — к следующему номеру. */
  seats: number;
  /** Кто ходит первым (п. 3) — его выбирает `firstOf` или прошлый итог (`nextFirst`). */
  first: number;
}

export type Phase = 'bout' | 'giving' | 'end';

export interface Result {
  /** Кто остался с картами; `null` — ничья. */
  fool: number | null;
  draw: boolean;
  /** Порядок выхода (п. 7.6). */
  order: number[];
}

export interface State {
  rules: RuleSet;
  variant: Variant;
  seats: number;
  hands: Card[][];
  /** Колода сверху вниз; последняя карта — открытый козырь. */
  talon: Card[];
  /** Открытая козырная карта; масть козыря — её масть. */
  trump: Card;
  /** Пары «атака — защита»; `null` — карта не покрыта. */
  table: [Card, Card | null][];
  discard: Card[];
  /** По местам: карты, взятые в открытую и ещё не сыгранные. */
  openly: Card[][];
  /** Кто начал отбой (для добора после перевода, п. 6.9). */
  starter: number;
  /** Ходящий: подкидывает в любой момент (п. 4.3). После перевода — переведший. */
  attacker: number;
  defender: number;
  /** Кто из атакующих сказал «пас» после последнего изменения стола. */
  passed: boolean[];
  /** Предел карт атаки этого отбоя (п. 4.4). */
  boutLimit: number;
  /** Номер отбоя с нуля. */
  bout: number;
  /** Вышедшие по порядку выхода (п. 7.2). */
  out: number[];
  phase: Phase;
  result: Result | null;
}

/** Действие места (docs/04-data-model.md, «Действие»). */
export type Action =
  | { type: 'attack'; cards: Card[] }
  | { type: 'throwIn'; cards: Card[] }
  | { type: 'give'; cards: Card[] }
  | { type: 'transfer'; cards: Card[] }
  | { type: 'beat'; card: Card; on: Card }
  | { type: 'take' }
  | { type: 'pass' };

/** Почему действие нельзя (для строки подсказки, docs/08-rules.md, п. 4.8). */
export type Reason =
  | 'gameOver'
  | 'notYourMove'
  | 'notInHand'
  | 'needCards'
  | 'mixedRanks'
  | 'overLimit'
  | 'rankNotOnTable'
  | 'waitFirstCover'
  | 'notCovered'
  | 'doesNotBeat'
  | 'alreadyCovered'
  | 'noTransferVariant'
  | 'noTransferFirstBout'
  | 'transferAfterCover'
  | 'transferRank'
  | 'transferTooMany'
  | 'nothingToTake'
  | 'alreadyPassed'
  | 'waitTurn';
