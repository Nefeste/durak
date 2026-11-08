// Правила уровня — ручные эвристики первых четырёх уровней (docs/10-bot.md, «Уровни»).
// Вход — только наблюдение места (ADR 0005).
import { beats, rankOf, suitOf } from '../engine';
import type { Action, Card, Observation } from '../engine';
import { legalFor } from './legal';
import type { Rng } from './rng';

export interface RuleParams {
  /** Доля решений «наугад среди законных». */
  random: number;
  /** Беречь козыри, пока прикуп не кончился: взять, если отбиться можно только старшим козырем. */
  saveTrumps: boolean;
  /** Подкидывать смелее, когда у отбивающегося мало карт и в концовке. */
  pressure: boolean;
}

/** Цена карты: достоинство, козырь — на девять дороже (docs/10-bot.md, «Оценка позиции»). */
export const costOf = (c: Card, trumpSuit: number): number => rankOf(c) + (suitOf(c) === trumpSuit ? 9 : 0);

/** Самая дешёвая карта руки, которая бьёт `on`. */
function cheapestBeater(hand: Card[], on: Card, ts: number, used: Set<Card>): Card | null {
  let best: Card | null = null;
  for (const c of hand) {
    if (used.has(c) || !beats(c, on, ts)) continue;
    if (best === null || costOf(c, ts) < costOf(best, ts)) best = c;
  }
  return best;
}

/** Покрыть все непокрытые: жадно, начиная с самых дорогих карт атаки. */
function coverPlan(o: Observation): { pairs: [Card, Card][]; cost: number; maxTrump: number } | null {
  const ts = suitOf(o.trump);
  const open = o.table.filter(([, d]) => d === null).map(([a]) => a).sort((x, y) => costOf(y, ts) - costOf(x, ts));
  const used = new Set<Card>();
  const pairs: [Card, Card][] = [];
  let cost = 0, maxTrump = -1;
  for (const on of open) {
    const by = cheapestBeater(o.hand, on, ts, used);
    if (by === null) return null;
    used.add(by);
    pairs.push([on, by]);
    cost += costOf(by, ts);
    if (suitOf(by) === ts) maxTrump = Math.max(maxTrump, rankOf(by));
  }
  return { pairs, cost, maxTrump };
}

function defend(o: Observation, legal: Action[], p: RuleParams): Action {
  const ts = suitOf(o.trump);
  const plan = coverPlan(o);
  const transfers = legal.filter((a): a is Extract<Action, { type: 'transfer' }> => a.type === 'transfer');
  const plainTransfer = transfers
    .filter(a => a.cards.every(c => suitOf(c) !== ts))
    .sort((x, y) => x.cards.length - y.cards.length)[0];
  if (plainTransfer && (!plan || plan.maxTrump >= 0 || plan.cost > costOf(plainTransfer.cards[0], ts) + 3)) return plainTransfer;
  if (!plan) {
    // отбиться нечем: перевести хоть козырем в концовке, иначе брать
    if (transfers.length > 0 && o.talonSize === 0) return transfers[0];
    return { type: 'take' };
  }
  // беречь козыри: старший козырь на мелкую атаку, пока прикуп большой, — дороже, чем взять
  if (p.saveTrumps && plan.maxTrump >= 6 && o.talonSize > 6 && o.table.length <= 2) return { type: 'take' };
  const [on, card] = plan.pairs[0];
  return { type: 'beat', card, on };
}

function attack(o: Observation, legal: Action[]): Action {
  const ts = suitOf(o.trump);
  const attacks = legal.filter((a): a is Extract<Action, { type: 'attack' }> => a.type === 'attack');
  // младшее достоинство без козырей — всей группой этого достоинства
  const score = (a: { cards: Card[] }) => {
    const trumps = a.cards.filter(c => suitOf(c) === ts).length;
    const r = rankOf(a.cards[0]);
    // у ходящего всё равно все козыри — тогда младший
    return trumps * 100 + r * 10 - a.cards.length;
  };
  return [...attacks].sort((x, y) => score(x) - score(y))[0];
}

function addOn(o: Observation, legal: Action[], p: RuleParams): Action {
  const ts = suitOf(o.trump);
  const adds = legal.filter((a): a is Extract<Action, { type: 'throwIn' | 'give' }> => a.type === 'throwIn' || a.type === 'give');
  const defHand = o.handSizes[o.defender];
  const late = o.talonSize === 0;
  const giving = o.phase === 'giving';
  const ok = (c: Card) => {
    const trump = suitOf(c) === ts;
    if (giving) return !trump && (late || rankOf(c) <= 5);
    if (late) return !trump || (p.pressure && defHand <= 2);
    if (trump) return false;
    if (p.pressure && defHand <= 3) return rankOf(c) <= 6;
    return rankOf(c) <= 4;
  };
  const pick = adds.filter(a => ok(a.cards[0])).sort((x, y) => costOf(x.cards[0], ts) - costOf(y.cards[0], ts))[0];
  return pick ?? { type: 'pass' };
}

/** Действие по правилам уровня. */
export function chooseByRules(o: Observation, p: RuleParams, rng: Rng): Action {
  const legal = legalFor(o);
  if (legal.length === 0) throw new Error('bot has no legal action');
  if (p.random > 0 && rng.next() < p.random) return legal[rng.int(legal.length)];
  if (o.seat === o.defender && o.phase === 'bout' && o.table.length > 0) return defend(o, legal, p);
  if (o.table.length === 0) return attack(o, legal);
  return addOn(o, legal, p);
}
