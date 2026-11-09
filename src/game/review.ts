// Разбор партии по записи: запись разворачивается в наблюдения игрока (ADR 0005 — бот колоды не видит), их судит
// `reviewThink` из `src/bot/` (docs/10-bot.md, «Разбор»).
import { reviewThink, REVIEW_SAMPLES, sameAction } from '../bot';
import type { Decision, Move, Review, Thinking } from '../bot';
import { apply, newGame, observe } from '../engine';
import type { Action, Card, GameRecord, Observation } from '../engine';
import type { Layout } from '../render/layout';

/** Решения места `seat` в партии: наблюдение до каждого его действия. */
export function movesOf(r: GameRecord, seat: number): Move[] {
  let s = newGame({ rules: r.rules, variant: r.variant, seats: r.seats, first: r.first }, r.deck);
  const out: Move[] = [];
  r.actions.forEach(({ seat: who, action }, at) => {
    if (who === seat) out.push({ at, o: observe(s, seat), played: action });
    s = apply(s, who, action);
  });
  return out;
}

export const reviewGame = (r: GameRecord, seat: number, samples = REVIEW_SAMPLES): Thinking<Review> => reviewThink(movesOf(r, seat), seat, samples);

/** Позиция перед действием `at` записи глазами места `seat` — то, что игрок видел, когда решал (ADR 0005):
 *  переигрываются первые `at` действий, наружу — только наблюдение. */
export function positionAt(r: GameRecord, at: number, seat: number): Observation {
  let s = newGame({ rules: r.rules, variant: r.variant, seats: r.seats, first: r.first }, r.deck);
  const n = Math.max(0, Math.min(at, r.actions.length));
  for (let i = 0; i < n; i++) s = apply(s, r.actions[i].seat, r.actions[i].action);
  return observe(s, seat);
}

/** Чья метка: сыгранный ход или лучший (docs/09-game-design.md, «Итог партии и разбор»). */
export type MarkKind = 'played' | 'best';

export interface ReviewMarks {
  /** Карты своей руки, которыми сделан ход. */
  hand: { card: Card; kinds: MarkKind[] }[];
  /** Карты атаки на столе, которые этим ходом бьют. */
  table: { card: Card; kinds: MarkKind[] }[];
  /** Ход без карт — плашкой над рукой: «Беру», «Пас» или «Бито» (`done` — всё покрыто). */
  chips: { kind: MarkKind; action: 'take' | 'pass'; done: boolean }[];
}

/** Что подсветить на столе разбора: «Сыграно» всегда, «Лучше» — если решение не «точно». */
export function markOf(d: Decision, o: Observation): ReviewMarks {
  const out: ReviewMarks = { hand: [], table: [], chips: [] };
  const add = (list: { card: Card; kinds: MarkKind[] }[], card: Card, kind: MarkKind) => {
    const x = list.find(m => m.card === card);
    if (x) { if (!x.kinds.includes(kind)) x.kinds.push(kind); } else list.push({ card, kinds: [kind] });
  };
  const done = o.table.length > 0 && o.table.every(([, dd]) => dd !== null);
  const mark = (a: Action, kind: MarkKind) => {
    switch (a.type) {
      case 'beat': add(out.hand, a.card, kind); add(out.table, a.on, kind); break;
      case 'resign': break;
      case 'take': case 'pass': out.chips.push({ kind, action: a.type, done: a.type === 'pass' && done }); break;
      default: for (const c of a.cards) add(out.hand, c, kind);
    }
  };
  mark(d.played, 'played');
  if (d.grade !== 'ok' && !sameAction(d.best, d.played)) mark(d.best, 'best');
  return out;
}

/** Раскладка стола разбора: обычная раскладка; отмеченные карты руки — поверх соседей веера (`marked`), карты
 *  лучшего хода (`raised`) ещё и приподняты, как выбранная в партии. */
export function reviewLayout(base: Layout, raised: Card[], marked: Card[] = raised): Layout {
  const up = new Set(raised), top = new Set([...marked, ...raised]);
  const inHand = (s: Layout['sprites'][number]) => s.card !== null && s.y > base.handTop;
  const sprites = base.sprites.map(s => (inHand(s) && up.has(s.card as Card) ? { ...s, y: s.y - base.ch * 0.22 } : s));
  const front = (s: Layout['sprites'][number]) => (inHand(s) && top.has(s.card as Card) ? 1 + (up.has(s.card as Card) ? 1 : 0) : 0);
  return { ...base, sprites: [...sprites].sort((a, b) => front(a) - front(b)) };
}
