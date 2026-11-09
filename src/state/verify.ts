// Проверка колоды после партии онлайн (ADR 0004; docs/09-game-design.md, «Честная колода»): телефон
// пересобирает колоду из раскрытого зерна сервера и зёрен мест, сверяет отпечаток, который записал
// ДО того, как отдал своё зерно, своё зерно на своём месте и каждое наблюдение, которое видел за
// партию, с позицией, переигранной из записи. Чистая функция — без React и сети.
import { apply, commitOf, newGame, observe, rulesWith, serverDeck } from '../engine';
import type { Observation, State, ThrowOrder, Variant } from '../engine';
import type { ProofView } from './protocol';

export interface DeckCheck {
  ok: boolean;
  /** Сколько увиденных карт сверено (рука, козырь, стол, сброс, взятые в открытую). */
  cards: number;
  /** Что не сошлось первым — для «Сообщить об ошибке». */
  why: null | 'commit' | 'seed' | 'deck' | 'replay' | 'view';
}

/** `my.order` — «Подкидывать» стола (у сервера до очереди его нет — «кто успел», `durak-rules-v1`). */
export function verifyGame(p: ProofView, my: { seat: number; seed: string; commit: string; variant: Variant; seats: number; order?: ThrowOrder }, seen: Observation[]): DeckCheck {
  if (p.commit !== my.commit || commitOf(p.seed) !== my.commit) return { ok: false, cards: 0, why: 'commit' };
  if (p.seeds[my.seat] !== my.seed) return { ok: false, cards: 0, why: 'seed' };
  const deck = serverDeck(p.seed, p.seeds);
  if (deck.join() !== p.deck.join()) return { ok: false, cards: 0, why: 'deck' };
  const states: State[] = [];
  try {
    let s = newGame({ rules: rulesWith(my.order ?? 'free'), variant: my.variant, seats: my.seats, first: p.first }, deck);
    states.push(s);
    for (const a of p.actions) states.push(s = apply(s, a.seat, a.action));
  } catch {
    return { ok: false, cards: 0, why: 'replay' };
  }
  const known = new Set<number>();
  for (const v of seen) {
    // своё наблюдение могло прийти при любом номере действия: ищем позицию, где оно совпадает
    const match = states.some(s => JSON.stringify(observe(s, my.seat)) === JSON.stringify(v));
    if (!match) return { ok: false, cards: 0, why: 'view' };
    for (const c of [...v.hand, ...v.discard, ...v.openly.flat(), ...v.table.flat()]) if (c !== null) known.add(c);
    known.add(v.trump);
  }
  return { ok: true, cards: known.size, why: null };
}
