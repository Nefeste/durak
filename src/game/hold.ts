// Пауза перед «бито» и «беру» (docs/09-game-design.md, «Темп»): отбой, который кончился картой — покрыта
// последняя, подкинута шестая, у отбивающегося кончились карты, дана последняя вдогонку, — движок закрывает тем же
// действием, и стол сразу пуст. Стол «в миг, когда легла последняя карта» — чистая функция наблюдения до действия и
// самого действия: одинаково с ботами (экран знает действие) и онлайн (сервер присылает такой вид, ADR 0008: в нём
// только своя рука и открытые карты стола). Без React — проверяется тестом (tools/test/hold.test.ts).
import { nameOf } from '../engine';
import type { Action, Card, Observation } from '../engine';

/** Сколько стол виден после такого отбоя, мс; «Меньше движения» — короче, но карты успевают прочитать. */
export const HOLD = { ms: 1200, lessMs: 800 } as const;

export const holdMs = (less: boolean): number => (less ? HOLD.lessMs : HOLD.ms);

const cardsOf = (a: Action): Card[] => (a.type === 'beat' ? [a.card] : a.type === 'take' || a.type === 'pass' || a.type === 'resign' ? [] : a.cards);

/**
 * Действие `a` места `seat` перевело наблюдение `before` в `after`. Если оно кончило отбой картой — наблюдение того же
 * места, каким стол был, когда эта карта легла: карты ещё на столе, никто не добрал. Иначе `null`: «пас» и «беру»
 * кончают отбой без новой карты, а стол перед ними все уже видели (пауза «бито» само — 1,5 с, ход бота — его пауза).
 */
export function heldView(before: Observation, seat: number, a: Action, after: Pick<Observation, 'bout' | 'phase'>): Observation | null {
  const cards = cardsOf(a);
  if (cards.length === 0 || before.phase === 'end') return null;
  if (after.bout === before.bout && after.phase !== 'end') return null;
  const table = before.table.map(([at, d]) => [at, d] as [Card, Card | null]);
  if (a.type === 'beat') {
    const pair = table.find(([at]) => at === a.on);
    if (!pair) return null;
    pair[1] = a.card;
  } else for (const c of cards) table.push([c, null]);
  const handSizes = [...before.handSizes];
  handSizes[seat] = Math.max(0, handSizes[seat] - cards.length);
  return {
    ...before,
    hand: seat === before.seat ? before.hand.filter(c => !cards.includes(c)) : [...before.hand],
    handSizes,
    openly: before.openly.map((o, i) => (i === seat ? o.filter(c => !cards.includes(c)) : [...o])),
    table,
    discard: [...before.discard],
    passed: [...before.passed],
    out: [...before.out],
    result: null,
  };
}

/** Стол паузы одной строкой — для чтения с экрана и сценария в браузере: «6♠ 7♠, 8♣» (пара — атака и защита). */
export const tableLabel = (table: [Card, Card | null][]): string =>
  table.map(([a, d]) => (d === null ? nameOf(a) : `${nameOf(a)} ${nameOf(d)}`)).join(', ');
