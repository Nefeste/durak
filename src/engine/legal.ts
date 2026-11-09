// Законные действия места и причина запрета для любого другого (docs/08-rules.md, пп. 4, 6).
import { beats, rankOf, suitOf } from './cards';
import type { Card } from './cards';
import { active, nextActive } from './deal';
import { orderOf } from './types';
import type { Action, Reason, State } from './types';

/** Атакующие: все, кроме отбивающегося, у кого есть карты (п. 4). */
export function attackersOf(s: State): number[] {
  const out: number[] = [];
  for (let seat = 0; seat < s.seats; seat++) if (seat !== s.defender && active(s, seat)) out.push(seat);
  return out;
}

/** Атакующие в порядке права (п. 4.3): ходящий, затем по часовой стрелке, без отбивающегося. */
export function queueOf(s: State): number[] {
  const out: number[] = [];
  for (let k = 0; k < s.seats; k++) {
    const seat = (s.attacker + k) % s.seats;
    if (seat !== s.defender && active(s, seat)) out.push(seat);
  }
  return out;
}

/** У кого право подкинуть или сказать «пас» за столом «по очереди» (п. 4.3): первый атакующий по кругу, кто ещё
 *  не сказал «пас». `-1` — у стола «кто успел», вне отбоя или все сказали «пас». */
export function throwerOf(s: State): number {
  if (orderOf(s.rules) !== 'queue' || s.phase === 'end' || s.table.length === 0) return -1;
  for (const seat of queueOf(s)) if (!s.passed[seat]) return seat;
  return -1;
}

const waits = (s: State, seat: number) => orderOf(s.rules) === 'queue' && throwerOf(s) !== seat;

/** Достоинства на столе — среди карт атаки и карт защиты (п. 4.3). */
export function tableRanks(s: State): Set<number> {
  const r = new Set<number>();
  for (const [a, d] of s.table) {
    r.add(rankOf(a));
    if (d !== null) r.add(rankOf(d));
  }
  return r;
}

const uncovered = (s: State) => s.table.filter(([, d]) => d === null).map(([a]) => a);
const anyCovered = (s: State) => s.table.some(([, d]) => d !== null);
const firstCovered = (s: State) => s.table.length > 0 && s.table[0][1] !== null;
const holds = (s: State, seat: number, cs: Card[]) => cs.every(c => s.hands[seat].includes(c)) && new Set(cs).size === cs.length;

/** Можно ли месту `seat` сейчас подкинуть: ходящий — всегда, остальные — когда покрыта первая
 *  карта атаки (п. 4.3); и «вдогонку» после «беру» — по тем же правилам (п. 4.5). */
function mayThrow(s: State, seat: number): boolean {
  return seat === s.attacker || firstCovered(s);
}

/** Почему действие нельзя; `null` — можно. */
export function reasonOf(s: State, seat: number, a: Action): Reason | null {
  if (s.phase === 'end') return 'gameOver';
  if (!active(s, seat)) return 'notYourMove';
  const isDef = seat === s.defender;
  switch (a.type) {
    case 'attack': {
      if (s.phase !== 'bout' || s.table.length > 0 || seat !== s.attacker) return 'notYourMove';
      if (a.cards.length === 0) return 'needCards';
      if (!holds(s, seat, a.cards)) return 'notInHand';
      if (new Set(a.cards.map(rankOf)).size !== 1) return 'mixedRanks';
      if (a.cards.length > s.boutLimit) return 'overLimit';
      return null;
    }
    case 'throwIn':
    case 'give': {
      if (isDef || s.table.length === 0) return 'notYourMove';
      if ((a.type === 'give') !== (s.phase === 'giving')) return 'notYourMove';
      if (s.passed[seat]) return 'alreadyPassed';
      if (waits(s, seat)) return 'waitTurn';
      if (a.cards.length !== 1) return 'needCards';
      if (!holds(s, seat, a.cards)) return 'notInHand';
      if (!mayThrow(s, seat)) return 'waitFirstCover';
      if (!tableRanks(s).has(rankOf(a.cards[0]))) return 'rankNotOnTable';
      if (s.table.length + 1 > s.boutLimit) return 'overLimit';
      return null;
    }
    case 'beat': {
      if (s.phase !== 'bout' || !isDef) return 'notYourMove';
      if (!holds(s, seat, [a.card])) return 'notInHand';
      const pair = s.table.find(([at]) => at === a.on);
      if (!pair) return 'notCovered';
      if (pair[1] !== null) return 'alreadyCovered';
      if (!beats(a.card, a.on, suitOf(s.trump))) return 'doesNotBeat';
      return null;
    }
    case 'transfer': {
      if (s.phase !== 'bout' || !isDef || s.table.length === 0) return 'notYourMove';
      if (s.variant !== 'perevodnoy') return 'noTransferVariant';
      if (s.bout === 0 && !s.rules.firstBoutTransfer) return 'noTransferFirstBout';
      if (anyCovered(s)) return 'transferAfterCover';
      if (a.cards.length === 0) return 'needCards';
      if (!holds(s, seat, a.cards)) return 'notInHand';
      const rank = rankOf(s.table[0][0]);
      if (a.cards.some(c => rankOf(c) !== rank)) return 'transferRank';
      const total = s.table.length + a.cards.length;
      const cap = s.bout === 0 ? s.rules.firstBoutAttack : s.rules.maxAttack;
      const next = nextActive(s, seat);
      if (next < 0 || total > cap) return 'transferTooMany';
      // после перевода у отбивающегося уйдут свои карты, а у нового их должно хватить (п. 6.3)
      if (s.hands[next].length < total) return 'transferTooMany';
      return null;
    }
    case 'take': {
      if (s.phase !== 'bout' || !isDef) return 'notYourMove';
      if (uncovered(s).length === 0) return 'nothingToTake';
      return null;
    }
    case 'pass': {
      if (isDef || s.table.length === 0) return 'notYourMove';
      if (s.passed[seat]) return 'alreadyPassed';
      if (waits(s, seat)) return 'waitTurn';
      return null;
    }
  }
}

/** Все непустые наборы карт одного достоинства из руки, не больше `max` карт. */
function sameRankSets(hand: Card[], max: number): Card[][] {
  const byRank = new Map<number, Card[]>();
  for (const c of hand) byRank.set(rankOf(c), [...(byRank.get(rankOf(c)) ?? []), c]);
  const out: Card[][] = [];
  for (const group of byRank.values()) {
    const g = [...group].sort((x, y) => x - y);
    for (let mask = 1; mask < 1 << g.length; mask++) {
      const set = g.filter((_, i) => mask & (1 << i));
      if (set.length <= max) out.push(set);
    }
  }
  return out;
}

/** Все законные действия места, в устойчивом порядке. */
export function legalActions(s: State, seat: number): Action[] {
  if (s.phase === 'end' || !active(s, seat)) return [];
  const hand = [...s.hands[seat]].sort((x, y) => x - y);
  const out: Action[] = [];
  const keep = (a: Action) => { if (reasonOf(s, seat, a) === null) out.push(a); };
  if (s.phase === 'bout' && s.table.length === 0) {
    if (seat === s.attacker) for (const set of sameRankSets(hand, s.boutLimit)) out.push({ type: 'attack', cards: set });
    return out;
  }
  if (seat === s.defender) {
    if (s.phase !== 'bout') return out;
    for (const on of uncovered(s)) for (const c of hand) keep({ type: 'beat', card: c, on });
    if (s.variant === 'perevodnoy' && !anyCovered(s)) {
      const rank = rankOf(s.table[0][0]);
      for (const set of sameRankSets(hand.filter(c => rankOf(c) === rank), s.rules.maxAttack)) keep({ type: 'transfer', cards: set });
    }
    keep({ type: 'take' });
    return out;
  }
  const kind = s.phase === 'giving' ? 'give' : 'throwIn';
  for (const c of hand) keep({ type: kind, cards: [c] });
  keep({ type: 'pass' });
  return out;
}

/** Кто сейчас может действовать: места, у которых есть законные действия. */
export function toAct(s: State): number[] {
  const out: number[] = [];
  for (let seat = 0; seat < s.seats; seat++) if (legalActions(s, seat).length > 0) out.push(seat);
  return out;
}
