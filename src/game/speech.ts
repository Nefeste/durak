// Реплики за столом (docs/09-game-design.md, «Живой стол»): кто что сказал — из двух наблюдений одного места, без
// списка ходов, поэтому одинаково с ботами, онлайн и в задаче дня. Первый ход в пустой стол и отбой карты реплик не
// дают — их видно по картам. Без React — проверяется тестами (tools/test/speech.test.ts).
import type { Card, Observation } from '../engine';

export type Word = 'pass' | 'done' | 'take' | 'transfer' | 'throw';
export interface Say { seat: number; word: Word }

const attacks = (o: Observation): Card[] => o.table.map(([a]) => a);
const covered = (o: Observation) => o.table.length > 0 && o.table.every(([, d]) => d !== null);

/** Кто из атакующих ещё не сказал «пас» в этом отбое: он и сказал последнее слово, когда отбой кончился. */
function lastWord(prev: Observation): number {
  const open = prev.passed
    .map((_, s) => s)
    .filter(s => s !== prev.defender && !prev.out.includes(s) && !prev.passed[s]);
  return open.includes(prev.attacker) || open.length !== 1 ? prev.attacker : open[0];
}

export function speechOf(prev: Observation | null, next: Observation): Say[] {
  if (!prev || prev.seats !== next.seats || prev.seat !== next.seat || next.bout < prev.bout) return [];
  // отбой кончился: стол ушёл в сброс — «Бито»; ушёл к отбивавшемуся — после «Беру» последний подкидывавший сказал «Пас»
  if (next.bout > prev.bout) {
    if (prev.table.length === 0) return [];
    const toDiscard = next.discard.length > prev.discard.length;
    if (toDiscard) return [{ seat: lastWord(prev), word: 'done' }];
    if (prev.phase === 'giving') return [{ seat: lastWord(prev), word: 'pass' }];
    return [{ seat: prev.defender, word: 'take' }];
  }
  const out: Say[] = [];
  if (prev.phase === 'bout' && next.phase === 'giving') out.push({ seat: next.defender, word: 'take' });
  const had = new Set(attacks(prev)), fresh = attacks(next).filter(c => !had.has(c));
  if (fresh.length > 0) {
    if (next.defender !== prev.defender && next.phase === 'bout') out.push({ seat: prev.defender, word: 'transfer' });
    else if (prev.table.length > 0) {
      // подкинул тот, у кого убыло карт (не отбивающийся)
      next.handSizes.forEach((n, s) => {
        if (s !== next.defender && n < prev.handSizes[s] && !out.some(x => x.seat === s)) out.push({ seat: s, word: 'throw' });
      });
    }
  }
  // «пас» без изменения стола; всё покрыто — это «Бито» ходящего, после «Беру» — просто «Пас»
  const same = prev.table.length === next.table.length && prev.table.every(([a, d], i) => next.table[i][0] === a && next.table[i][1] === d);
  if (same) {
    next.passed.forEach((p, s) => {
      if (p && !prev.passed[s]) out.push({ seat: s, word: next.phase === 'bout' && covered(next) ? 'done' : 'pass' });
    });
  }
  return out;
}
