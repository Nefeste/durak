// Статистика (docs/09-game-design.md, «Статистика»): чистая функция истории партий и задач дня. Бесплатно —
// итог в целом; подробно («Про») — по столам, числу игроков и уровням, козыри и рейтинг тренировок.
import { apply, newGame, suitOf } from '../engine';
import type { Card, GameRecord, Variant } from '../engine';
import type { Level } from '../bot';
import type { FinishedGame } from './history';

/** Место игрока за столом с ботами. */
export const ME = 0;

/** Рейтинг тренировок — Эло против ботов (как в «Нардах»): у каждого уровня — своё постоянное число. */
export const LEVEL_ELO: Record<Level, number> = {
  novice: 700, beginner: 900, amateur: 1100, average: 1300, experienced: 1500, master: 1700,
};
export const START_ELO = 1200;
export const ELO_K = 24;

export interface Tally { games: number; kept: number; first: number; draws: number }

export interface Stats {
  total: Tally;
  byVariant: Record<Variant, Tally>;
  bySeats: Record<2 | 3 | 4, Tally>;
  byLevel: Partial<Record<Level, Tally>>;
  /** Партий без «остались с картами» подряд — сегодня, с последней. Без наград и без «не потеряйте». */
  streakToday: number;
  /** Козырей пришло за партию — вам и в среднем одному боту (раздача и добор из колоды). */
  trumps: { you: number; bot: number; games: number };
  /** Эло тренировок: партии один на один без подсказки. */
  elo: number;
  eloGames: number;
}

const zero = (): Tally => ({ games: 0, kept: 0, first: 0, draws: 0 });

function add(t: Tally, g: GameRecord): void {
  const r = g.result!;
  t.games++;
  if (r.draw) t.draws++;
  else if (r.fool === ME) t.kept++;
  if (r.order[0] === ME) t.first++;
}

/** Сколько козырей каждое место получило из колоды: при раздаче и доборе (взятое со стола — не в счёт). */
export function trumpsDealt(r: GameRecord): number[] {
  let s = newGame({ rules: r.rules, variant: r.variant, seats: r.seats, first: r.first }, r.deck);
  const ts = suitOf(s.trump);
  const isT = (c: Card) => suitOf(c) === ts;
  const got = s.hands.map(h => h.filter(isT).length);
  for (const { seat, action } of r.actions) {
    const before = new Set(s.talon);
    const next = apply(s, seat, action);
    if (next.talon.length < s.talon.length) {
      const drawn = [...before].filter(c => !next.talon.includes(c));
      for (const c of drawn) {
        const to = next.hands.findIndex(h => h.includes(c));
        if (to >= 0 && isT(c)) got[to]++;
      }
    }
    s = next;
  }
  return got;
}

export function computeStats(games: FinishedGame[], now: number): Stats {
  const st: Stats = {
    total: zero(), byVariant: { podkidnoy: zero(), perevodnoy: zero() }, bySeats: { 2: zero(), 3: zero(), 4: zero() },
    byLevel: {}, streakToday: 0, trumps: { you: 0, bot: 0, games: 0 }, elo: START_ELO, eloGames: 0,
  };
  let you = 0, bot = 0;
  for (const g of games) {
    const r = g.record;
    add(st.total, r);
    add(st.byVariant[r.variant], r);
    add(st.bySeats[r.seats as 2 | 3 | 4], r);
    add((st.byLevel[g.level] ??= zero()), r);
    const t = trumpsDealt(r);
    you += t[ME];
    bot += t.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, r.seats - 1);
    if (r.seats === 2 && !g.hinted) {
      const res = r.result!;
      const score = res.draw ? 0.5 : res.fool === ME ? 0 : 1;
      const expect = 1 / (1 + 10 ** ((LEVEL_ELO[g.level] - st.elo) / 400));
      st.elo += ELO_K * (score - expect);
      st.eloGames++;
    }
  }
  st.trumps = { you: games.length ? you / games.length : 0, bot: games.length ? bot / games.length : 0, games: games.length };
  st.elo = Math.round(st.elo);
  const day = (t: number) => new Date(t).toDateString();
  for (let i = games.length - 1; i >= 0 && day(games[i].end) === day(now); i--) {
    const res = games[i].record.result!;
    if (!res.draw && res.fool === ME) break;
    st.streakToday++;
  }
  return st;
}
