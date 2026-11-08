// Звуки стола (docs/09-game-design.md, «Звук»): что прозвучало между двумя наблюдениями одного места —
// раздача, карта на стол, «бито», «беру». Только из наблюдений, как `originsOf` в src/render/layout.ts:
// одинаково с ботами, онлайн и в задаче дня. Без React и Expo — проверяется тестом (tools/test/sound.test.ts).
import type { Observation } from '../engine';

export type TableCue = 'shuffle' | 'slap' | 'swish' | 'take';

export interface Cue {
  what: TableCue;
  /** Своё действие: на него — лёгкая вибрация (на ход соперника телефон в руке не дёргается). */
  mine: boolean;
}

/** Своя карта ушла из руки: добор только прибавляет, так что ушедшая — сыграна этим действием. */
const played = (prev: Observation, next: Observation) => prev.hand.some(c => !next.hand.includes(c));

const onTable = (o: Observation) => o.table.reduce((n, [, d]) => n + (d === null ? 1 : 2), 0);

/** Только что розданная партия: первый отбой, стол и сброс пусты. */
export const isFreshDeal = (o: Observation): boolean => o.bout === 0 && o.table.length === 0 && o.discard.length === 0;

/**
 * Звуки перехода `prev` → `next` одной партии. Первое наблюдение партии (`prev` — `null`) — тасовка, если
 * партию только что раздали (продолженная после перезапуска — без неё). Новую партию экран узнаёт по своему
 * номеру раздачи, а не по наблюдению: отмена первого хода возвращает стол к виду раздачи. Карт на столе стало
 * больше — шлепок. Стол опустел и сброс вырос — «бито»; стол опустел, а у отбивавшегося прибавилось карт — «беру». Отмена своего хода
 * (карта вернулась в руку) — тишина.
 */
export function cuesOf(prev: Observation | null, next: Observation): Cue[] {
  if (!prev || prev.seats !== next.seats) return isFreshDeal(next) ? [{ what: 'shuffle', mine: false }] : [];
  const before = onTable(prev), after = onTable(next);
  if (after > before) {
    return [{ what: 'slap', mine: played(prev, next) }];
  }
  if (before > 0 && after === 0) {
    // отбой кончился этим же действием (покрыта последняя карта, подкинута шестая) — сначала легла карта
    const d = prev.defender;
    const gone = Math.max(next.discard.length - prev.discard.length, next.handSizes[d] - prev.handSizes[d]);
    const down: Cue[] = gone > before ? [{ what: 'slap', mine: played(prev, next) }] : [];
    if (next.discard.length > prev.discard.length) return [...down, { what: 'swish', mine: prev.attacker === next.seat || d === next.seat }];
    if (next.handSizes[d] > prev.handSizes[d]) return [...down, { what: 'take', mine: d === next.seat }];
  }
  return [];
}
