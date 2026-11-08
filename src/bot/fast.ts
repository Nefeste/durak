// Быстрое доигрывание: те же решения, что у правил «Среднего» без случайности (`chooseByRules` с
// `ROLLOUT`), но без перебора всех законных действий движка. Нужен только поиску по раскладам: на
// одно решение «Опытного» приходятся тысячи таких ходов. Равенство с медленным путём держит тест
// `tools/test/search.test.ts` на случайных позициях; любое сомнение — медленный путь.
import { active, legalActions, nextActive, observe, rankOf, suitOf } from '../engine';
import type { Action, Card, State } from '../engine';
import { chooseByRules, costOf, coverPlan } from './rules';
import type { Rng } from './rng';
import { ROLLOUT } from './sim';

/** Кто действует (как `actorOf`, docs/02-architecture.md, п. 5), без перебора действий. */
export function actorFast(s: State): number {
  if (s.phase === 'end') return -1;
  const empty = s.table.length === 0;
  for (let k = 0; k < s.seats; k++) {
    const seat = (s.attacker + k) % s.seats;
    if (!active(s, seat)) continue;
    if (empty) {
      if (s.phase === 'bout' && seat === s.attacker) return seat;
      continue;
    }
    if (seat === s.defender) {
      if (s.phase === 'bout' && s.table.some(([, d]) => d === null)) return seat;
    } else if (!s.passed[seat]) return seat;
  }
  return -1;
}

/** Атака «Среднего»: младшее достоинство, все его некозырные карты (сколько позволяет предел). */
function attackFast(s: State, seat: number): Action {
  const ts = suitOf(s.trump);
  const hand = [...s.hands[seat]].sort((a, b) => a - b);
  let best: Card[] | null = null, bestScore = Infinity;
  for (let r = 0; r < 9; r++) {
    const g = hand.filter(c => rankOf(c) === r);
    if (g.length === 0) continue;
    const plain = g.filter(c => suitOf(c) !== ts).slice(0, s.boutLimit);
    const set = plain.length > 0 ? plain : g.filter(c => suitOf(c) === ts).slice(0, 1);
    const trumps = set.filter(c => suitOf(c) === ts).length;
    const score = trumps * 100 + r * 10 - set.length;
    if (score < bestScore) { bestScore = score; best = set; }
  }
  return { type: 'attack', cards: best! };
}

/** Подкинуть или «пас» — как `addOn` правил. */
function addOnFast(s: State, seat: number): Action {
  const ts = suitOf(s.trump);
  const ranks = new Set<number>();
  for (const [a, d] of s.table) { ranks.add(rankOf(a)); if (d !== null) ranks.add(rankOf(d)); }
  const may = seat === s.attacker || s.table[0][1] !== null;
  const room = s.table.length + 1 <= s.boutLimit;
  const giving = s.phase === 'giving';
  const late = s.talon.length === 0;
  const defHand = s.hands[s.defender].length;
  if (!may || !room) return { type: 'pass' };
  let pick: Card | null = null;
  for (const c of [...s.hands[seat]].sort((a, b) => a - b)) {
    if (!ranks.has(rankOf(c))) continue;
    const trump = suitOf(c) === ts;
    const ok = giving ? !trump && (late || rankOf(c) <= 5)
      : late ? !trump || defHand <= 2
      : trump ? false
      : defHand <= 3 ? rankOf(c) <= 6 : rankOf(c) <= 4;
    if (!ok) continue;
    if (pick === null || costOf(c, ts) < costOf(pick, ts)) pick = c;
  }
  return pick === null ? { type: 'pass' } : { type: giving ? 'give' : 'throwIn', cards: [pick] };
}

/** Решение «Среднего» без случайности для места, которое действует. */
export function decideFast(s: State, seat: number, rng: Rng): Action {
  if (s.table.length === 0) return attackFast(s, seat);
  if (seat !== s.defender) return addOnFast(s, seat);
  if (s.phase === 'bout') return defendFast(s, seat);
  return chooseByRules(observe(s, seat), ROLLOUT, rng, legalActions(s, seat));
}

/** Самый младший законный перевод одной картой: некозырной (`plain`) или любой. */
function transferOne(s: State, seat: number, plain: boolean): Card | null {
  if (s.variant !== 'perevodnoy' || (s.bout === 0 && !s.rules.firstBoutTransfer)) return null;
  if (s.table.some(([, d]) => d !== null)) return null;
  const total = s.table.length + 1;
  const cap = s.bout === 0 ? s.rules.firstBoutAttack : s.rules.maxAttack;
  const next = nextActive(s, seat);
  if (next < 0 || total > cap || s.hands[next].length < total) return null;
  const rank = rankOf(s.table[0][0]), ts = suitOf(s.trump);
  let best: Card | null = null;
  for (const c of s.hands[seat]) {
    if (rankOf(c) !== rank || (plain && suitOf(c) === ts)) continue;
    if (best === null || c < best) best = c;
  }
  return best;
}

/** Защита «Среднего» (`defend` правил): перевод некозырной, покрыть, взять. */
function defendFast(s: State, seat: number): Action {
  const ts = suitOf(s.trump);
  const plan = coverPlan({ hand: [...s.hands[seat]].sort((a, b) => a - b), table: s.table, trump: s.trump });
  const plain = transferOne(s, seat, true);
  if (plain !== null && (!plan || plan.maxTrump >= 0 || plan.cost > costOf(plain, ts) + 3)) return { type: 'transfer', cards: [plain] };
  if (!plan) {
    const any = s.talon.length === 0 ? transferOne(s, seat, false) : null;
    return any !== null ? { type: 'transfer', cards: [any] } : { type: 'take' };
  }
  if (ROLLOUT.saveTrumps && plan.maxTrump >= 6 && s.talon.length > 6 && s.table.length <= 2) return { type: 'take' };
  const [on, card] = plan.pairs[0];
  return { type: 'beat', card, on };
}
