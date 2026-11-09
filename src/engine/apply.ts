// Применение действия: конец отбоя, добор, выход, конец партии (docs/08-rules.md, пп. 4–7).
import type { Card } from './cards';
import { active, cloneState, inPlay, limitOf, nextActive } from './deal';
import { attackersOf, reasonOf } from './legal';
import type { Action, Result, State } from './types';

export class IllegalAction extends Error {
  constructor(readonly reason: string) {
    super(`illegal: ${reason}`);
  }
}

function play(s: State, seat: number, cs: Card[]) {
  s.hands[seat] = s.hands[seat].filter(c => !cs.includes(c));
  s.openly[seat] = s.openly[seat].filter(c => !cs.includes(c));
}

const resetPasses = (s: State) => { s.passed = s.passed.map(() => false); };

/** Все ли атакующие сказали «пас» (у кого нет карт — молчат и не мешают). */
const allPassed = (s: State) => attackersOf(s).every(seat => s.passed[seat]);

/** Применить действие места. Возвращает новую позицию; переданную не меняет. */
export function apply(state: State, seat: number, a: Action): State {
  const why = reasonOf(state, seat, a);
  if (why) throw new IllegalAction(why);
  const s = cloneState(state);
  applyInPlace(s, seat, a);
  return s;
}

/** То же, но меняет переданную позицию и законность не проверяет. Только для доигрывания у ботов на
 *  своей копии позиции, когда действие заведомо законно (`apply` — через эту же функцию). */
export function applyInPlace(s: State, seat: number, a: Action): void {
  switch (a.type) {
    case 'attack':
    case 'throwIn':
    case 'give':
      play(s, seat, a.cards);
      for (const c of a.cards) s.table.push([c, null]);
      resetPasses(s);
      break;
    case 'beat': {
      play(s, seat, [a.card]);
      const pair = s.table.find(([at]) => at === a.on)!;
      pair[1] = a.card;
      resetPasses(s);
      break;
    }
    case 'transfer': {
      play(s, seat, a.cards);
      for (const c of a.cards) s.table.push([c, null]);
      s.attacker = seat;
      s.defender = nextActive(s, seat);
      const cap = s.bout === 0 ? s.rules.firstBoutAttack : s.rules.maxAttack;
      s.boutLimit = Math.min(cap, s.hands[s.defender].length);
      resetPasses(s);
      break;
    }
    case 'take':
      s.phase = 'giving';
      resetPasses(s);
      break;
    case 'pass':
      s.passed[seat] = true;
      break;
    case 'resign':
      resign(s, seat);
      return;
  }
  settle(s);
}

const resultOf = (s: State, fool: number | null, order: number[]): Result =>
  ({ fool, draw: fool === null, order, ...(s.resigned.length ? { resigned: [...s.resigned] } : {}) });

/** Сдача (п. 8, правило приложения): карты — из игры рубашкой вверх, отбой — по п. 8.3, конец — по п. 8.4. */
function resign(s: State, seat: number) {
  s.buried.push(...s.hands[seat]);
  s.hands[seat] = [];
  s.openly[seat] = [];
  s.passed[seat] = false;
  s.resigned.push(seat);
  const left: number[] = [];
  for (let x = 0; x < s.seats; x++) if (inPlay(s, x)) left.push(x);
  if (left.length < 2) {
    s.discard.push(...s.table.flatMap(([a, d]) => (d === null ? [a] : [a, d])));
    s.table = [];
    s.phase = 'end';
    s.result = { fool: seat, draw: false, order: [...s.out, ...left], resigned: [...s.resigned] };
    return;
  }
  if (seat === s.defender) {
    if (s.table.length > 0) { endBout(s, 'beaten'); return; }
    s.defender = nextActive(s, s.attacker);
    s.boutLimit = limitOf(s.rules, s.bout, s.hands[s.defender].length);
    return;
  }
  if (seat === s.attacker) {
    if (s.table.length === 0) {
      const next = nextActive(s, seat);
      s.starter = next;
      s.attacker = next;
      s.defender = nextActive(s, next);
      s.boutLimit = limitOf(s.rules, s.bout, s.hands[s.defender].length);
      return;
    }
    // посреди отбоя — ходящий следующий за ним атакующий (п. 8.3): первое право подкидывать у него
    for (let k = 1; k < s.seats; k++) {
      const x = (seat + k) % s.seats;
      if (x !== s.defender && inPlay(s, x)) { s.attacker = x; break; }
    }
  }
  settle(s);
}

/** Закончился ли отбой — и если да, закончить его (п. 4.6, 4.5). */
function settle(s: State) {
  if (s.phase === 'giving') {
    if (s.table.length >= s.boutLimit || allPassed(s)) endBout(s, 'taken');
    return;
  }
  if (s.table.length === 0 || s.table.some(([, d]) => d === null)) return;
  if (s.table.length >= s.boutLimit || s.hands[s.defender].length === 0 || allPassed(s)) endBout(s, 'beaten');
}

/** Порядок добора (п. 5, п. 6.9): начавший отбой, остальные по часовой стрелке, последним —
 *  отбивавшийся. Вышедшие не добирают. */
export function drawOrder(s: State): number[] {
  const order: number[] = [];
  for (let k = 0; k < s.seats; k++) {
    const seat = (s.starter + k) % s.seats;
    if (seat !== s.defender && inPlay(s, seat)) order.push(seat);
  }
  if (inPlay(s, s.defender)) order.push(s.defender);
  return order;
}

function endBout(s: State, how: 'beaten' | 'taken') {
  const cards = s.table.flatMap(([a, d]) => (d === null ? [a] : [a, d]));
  if (how === 'beaten') s.discard.push(...cards);
  else {
    s.hands[s.defender].push(...cards);
    s.openly[s.defender].push(...cards);
  }
  s.table = [];
  const order = drawOrder(s);
  for (const seat of order) {
    while (s.hands[seat].length < s.rules.handSize && s.talon.length > 0) s.hands[seat].push(s.talon.shift()!);
  }
  // п. 7.2: когда колода пуста, игрок без карт выходит
  if (s.talon.length === 0) for (const seat of order) if (s.hands[seat].length === 0 && !s.out.includes(seat)) s.out.push(seat);
  const left: number[] = [];
  for (let seat = 0; seat < s.seats; seat++) if (inPlay(s, seat)) left.push(seat);
  resetPasses(s);
  s.bout++;
  if (left.length <= 1) {
    s.phase = 'end';
    s.result = resultOf(s, left.length === 1 ? left[0] : null, [...s.out]);
    return;
  }
  // п. 4.7 и 7.3: после «бито» ходит отбивавшийся (если вышел — следующий с картами),
  // после «беру» — следующий за отбивавшимся
  const next = how === 'beaten' && active(s, s.defender) ? s.defender : nextActive(s, s.defender);
  s.starter = next;
  s.attacker = next;
  s.defender = nextActive(s, next);
  s.boutLimit = limitOf(s.rules, s.bout, s.hands[s.defender].length);
  s.phase = 'bout';
}
