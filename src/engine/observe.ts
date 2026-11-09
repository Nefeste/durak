// Наблюдение места — граница между правдой и игроком (docs/02-architecture.md, ADR 0005, 0008).
// Единственный вход для ботов, подсказки, экрана партии и вида места на сервере.
import type { Card } from './cards';
import { copyResult } from './deal';
import { orderOf } from './types';
import type { Phase, Result, RuleSet, State, Variant } from './types';

export interface Observation {
  seat: number;
  rules: RuleSet;
  variant: Variant;
  seats: number;
  /** Своя рука. */
  hand: Card[];
  /** Сколько карт у каждого места. */
  handSizes: number[];
  /** Карты, которые каждое место взяло в открытую и ещё не сыграло. */
  openly: Card[][];
  trump: Card;
  /** Сколько карт в колоде, считая открытый козырь. */
  talonSize: number;
  table: [Card, Card | null][];
  /** Сброс: какие карты в нём, видели все. */
  discard: Card[];
  starter: number;
  attacker: number;
  defender: number;
  passed: boolean[];
  boutLimit: number;
  bout: number;
  out: number[];
  /** Сдавшиеся (п. 8); поля нет, пока никто не сдался, — так наблюдение то же, что у версий игры до сдачи. Их карт
   *  в наблюдении нет. */
  resigned?: number[];
  phase: Phase;
  result: Result | null;
}

export function observe(s: State, seat: number): Observation {
  return {
    seat,
    rules: s.rules,
    variant: s.variant,
    seats: s.seats,
    hand: [...s.hands[seat]].sort((a, b) => a - b),
    handSizes: s.hands.map(h => h.length),
    openly: s.openly.map(o => [...o].sort((a, b) => a - b)),
    trump: s.trump,
    talonSize: s.talon.length,
    table: s.table.map(([a, d]) => [a, d] as [Card, Card | null]),
    discard: [...s.discard].sort((a, b) => a - b),
    starter: s.starter,
    attacker: s.attacker,
    defender: s.defender,
    passed: [...s.passed],
    boutLimit: s.boutLimit,
    bout: s.bout,
    out: [...s.out],
    ...(s.resigned.length ? { resigned: [...s.resigned] } : {}),
    phase: s.phase,
    result: s.result ? copyResult(s.result) : null,
  };
}

/** Позиция, которую можно собрать из наблюдения, подставив скрытые карты: соперникам — `hidden`
 *  по местам, колоде — `talon` (без открытого козыря). Бот строит так возможные расклады; тест
 *  одинаковости — пары позиций с одним наблюдением. */
export function stateFrom(o: Observation, hidden: Card[][], talon: Card[]): State {
  const hands = hidden.map((h, i) => (i === o.seat ? [...o.hand] : [...h]));
  return {
    rules: o.rules, variant: o.variant, seats: o.seats, hands,
    talon: o.talonSize > 0 ? [...talon, o.trump] : [],
    trump: o.trump,
    table: o.table.map(([a, d]) => [a, d] as [Card, Card | null]),
    discard: [...o.discard], openly: o.openly.map(x => [...x]),
    starter: o.starter, attacker: o.attacker, defender: o.defender, passed: [...o.passed],
    boutLimit: o.boutLimit, bout: o.bout, out: [...o.out], resigned: [...(o.resigned ?? [])], buried: [], phase: o.phase,
    result: o.result ? copyResult(o.result) : null,
  };
}

/** Чья очередь подкидывать по наблюдению (как `throwerOf` позиции): для плашек и строки подсказки. */
export function throwerSeen(o: Observation): number {
  if (orderOf(o.rules) !== 'queue' || o.phase === 'end' || o.table.length === 0) return -1;
  for (let k = 0; k < o.seats; k++) {
    const seat = (o.attacker + k) % o.seats;
    if (seat === o.defender || o.out.includes(seat) || (o.resigned ?? []).includes(seat) || o.handSizes[seat] === 0) continue;
    if (!o.passed[seat]) return seat;
  }
  return -1;
}
