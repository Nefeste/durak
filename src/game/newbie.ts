// Подсказки первой партии (docs/09-game-design.md, «Первая партия»; спецификация 1.0, раздел 3, шаг 2): строка над
// рукой первые три отбоя объясняет, что делать сейчас. Ни окон, ни кнопок — та же строка, что всегда; когда ход
// чужой или карта выбрана, говорит обычная подсказка. Чистая функция — проверяется тестами.
import { legalActions } from '../engine';
import type { State } from '../engine';

/** Сколько отбоев ведёт подсказка новичка. */
export const NEWBIE_BOUTS = 3;

export type NewbieTip = 'attack' | 'beat' | 'beatOrTransfer' | 'take' | 'done' | 'throw';

/** Что подсказать место `seat` сейчас, или `null` — обычная строка. */
export function newbieTip(s: State, seat: number): NewbieTip | null {
  if (s.phase !== 'bout' || s.bout >= NEWBIE_BOUTS) return null;
  const acts = legalActions(s, seat);
  if (acts.length === 0) return null;
  if (s.table.length === 0) return acts.some(a => a.type === 'attack') ? 'attack' : null;
  if (s.defender === seat) {
    if (s.table.every(([, d]) => d !== null)) return null; // всё покрыто — ждём, подкинут ли
    const beat = acts.some(a => a.type === 'beat'), transfer = acts.some(a => a.type === 'transfer');
    return transfer ? 'beatOrTransfer' : beat ? 'beat' : 'take';
  }
  // атакующий: подкинуть можно, когда покрыта первая карта (п. 4.3); ходящему «пас» при всём покрытом — «бито»
  if (!acts.some(a => a.type === 'pass')) return null;
  if (!s.table.every(([, d]) => d !== null)) return null; // ждём, пока отобьётся
  return s.attacker === seat ? 'done' : 'throw';
}

/** Учить ли новичка дальше: выключается, когда первая партия дошла до четвёртого отбоя или кончилась. */
export function newbieDone(s: State): boolean {
  return s.phase === 'end' || s.bout >= NEWBIE_BOUTS;
}
