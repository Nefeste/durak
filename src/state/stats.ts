// Статистика (docs/09-game-design.md, «Статистика»): чистая функция истории партий и задач дня. Бесплатно —
// итог в целом; подробно («Про») — места за столом, форма последних партий, против каждого уровня, рейтинг
// тренировок по партиям, средние за партию с ходом, по столам, числу игроков, уровню стола и неделям.
// Всё выводится из записи партии (переигрыванием, docs/04-data-model.md, «История») — нового в хранилище нет.
import { apply, newGame, suitOf } from '../engine';
import type { Card, GameRecord, Variant } from '../engine';
import { oneLevel } from '../bot';
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

/** Сколько последних партий — в «Форме», в линии рейтинга и в «последних» у средних. */
export const FORM_GAMES = 20;
export const ELO_LINE = 30;
export const RECENT = 10;
/** Недель в таблице «По неделям» (текущая и три прошлые). */
export const WEEKS = 4;

/** Чем кончилась партия для вас: вышли первым, вышли не первым, ничья (никто не остался с картами), остались с
 *  картами. Порядок — от лучшего к худшему, ничья — посередине (как серая середина расходящейся шкалы). */
export type Place = 'first' | 'out' | 'draw' | 'fool';
export const PLACES: readonly Place[] = ['first', 'out', 'draw', 'fool'];

/** Против одного бота: вы вышли раньше него, в одном отбое с ним (или ничья), позже него (или вы — с картами). */
export type Pair = 'before' | 'together' | 'after';

export interface Tally { games: number; kept: number; first: number; draws: number }
export interface Pairs { before: number; together: number; after: number }

/** Среднее за партию: по всем подходящим партиям и, когда их не меньше `2 × RECENT`, — по последним `RECENT` и
 *  по тем, что были до них (ход без оценки «хорошо/плохо»: брать карты — не ошибка). */
export interface Avg { n: number; mean: number; recent: number | null; earlier: number | null }

/** Что видно в одной записи после переигрывания. По местам 0 … seats − 1. */
export interface Replayed {
  /** отбоев сыграно */
  bouts: number;
  takes: number[];
  transfers: number[];
  /** козырей пришло из колоды: раздача и добор (взятое со стола — не в счёт) */
  trumps: number[];
  /** козырей в руке в конце партии (у вышедших — 0) */
  trumpsLeft: number[];
  /** в каком отбое (с нуля) место вышло; оставшийся с картами — `bouts` (позже всех) */
  exitBout: number[];
}

/** Одна партия для статистики: запись, уровни и разбор — в числах. */
export interface GameFacts {
  at: number;
  end: number;
  variant: Variant;
  seats: number;
  levels: Level[];
  place: Place;
  bouts: number;
  takes: number;
  transfers: number;
  trumps: number;
  /** в среднем на одного бота */
  botTrumps: number;
  trumpsLeft: number;
  /** против бота на месте k + 1 */
  vs: Pair[];
  hinted: boolean;
  /** ошибок и неточностей в разборе — `null`, если разбора нет */
  errors: number | null;
  inaccuracies: number | null;
}

export interface Stats {
  total: Tally;
  /** Сколько партий кончилось каждым местом — в целом (бесплатно, график «Итог»). */
  places: Record<Place, number>;
  byVariant: Record<Variant, Tally>;
  bySeats: Record<2 | 3 | 4, Tally>;
  /** По уровню стола, если он у всех ботов один; столы с разными уровнями — в `mixed`. */
  byLevel: Partial<Record<Level, Tally>>;
  mixed: Tally;
  /** Против уровня: каждый бот каждого стола — отдельно, и столы с разными уровнями тоже (кто вышел раньше). */
  vsLevel: Partial<Record<Level, Pairs>>;
  /** Последние `FORM_GAMES` партий, от старой к новой. */
  form: Place[];
  /** По неделям с понедельника (местное время), от текущей назад, `WEEKS` строк; пустые недели — с нулями. */
  byWeek: { start: number; tally: Tally }[];
  /** Партий без «остались с картами» подряд — сегодня, с последней. Без наград и без «не потеряйте». */
  streakToday: number;
  /** Козырей пришло за партию — вам и в среднем одному боту (раздача и добор из колоды). */
  trumps: { you: number; bot: number; games: number };
  avg: {
    bouts: Avg;
    takes: Avg;
    /** только переводные партии */
    transfers: Avg;
    /** только партии, где вы остались с картами */
    trumpsLeft: Avg;
    /** только партии с досчитанным разбором */
    errors: Avg;
    inaccuracies: Avg;
  };
  hinted: number;
  reviewed: number;
  /** Эло тренировок: партии один на один без подсказки. */
  elo: number;
  eloGames: number;
  /** Рейтинг после каждой партии в счёте — последние `ELO_LINE`, от старой к новой. */
  eloLine: number[];
  /** Изменение за последнюю партию в счёте (округлено), `null` — партий в счёте нет. */
  eloDelta: number | null;
}

const zero = (): Tally => ({ games: 0, kept: 0, first: 0, draws: 0 });
const zeroPairs = (): Pairs => ({ before: 0, together: 0, after: 0 });

function add(t: Tally, p: Place): void {
  t.games++;
  if (p === 'draw') t.draws++;
  else if (p === 'fool') t.kept++;
  if (p === 'first') t.first++;
}

/** Переиграть запись один раз и собрать всё, что статистике нужно по местам. */
export function replayed(r: GameRecord): Replayed {
  let s = newGame({ rules: r.rules, variant: r.variant, seats: r.seats, first: r.first }, r.deck);
  const ts = suitOf(s.trump);
  const isT = (c: Card) => suitOf(c) === ts;
  const n = r.seats;
  const takes = Array<number>(n).fill(0), transfers = Array<number>(n).fill(0);
  const trumps = s.hands.map(h => h.filter(isT).length);
  const exitBout = Array<number>(n).fill(-1);
  for (const { seat, action } of r.actions) {
    if (action.type === 'take') takes[seat]++;
    if (action.type === 'transfer') transfers[seat]++;
    const before = new Set(s.talon);
    const bout = s.bout;
    const next = apply(s, seat, action);
    if (next.talon.length < s.talon.length) {
      for (const c of before) {
        if (next.talon.includes(c) || !isT(c)) continue;
        const to = next.hands.findIndex(h => h.includes(c));
        if (to >= 0) trumps[to]++;
      }
    }
    for (const o of next.out) if (exitBout[o] < 0) exitBout[o] = bout;
    s = next;
  }
  const bouts = s.bout;
  return {
    bouts, takes, transfers, trumps,
    trumpsLeft: s.hands.map(h => h.filter(isT).length),
    exitBout: exitBout.map(b => (b < 0 ? bouts : b)),
  };
}

/** Сколько козырей каждое место получило из колоды: при раздаче и доборе (взятое со стола — не в счёт). */
export const trumpsDealt = (r: GameRecord): number[] => replayed(r).trumps;

export function placeOf(r: GameRecord, seat = ME): Place {
  const res = r.result!;
  if (res.draw) return 'draw';
  if (res.fool === seat) return 'fool';
  return res.order[0] === seat ? 'first' : 'out';
}

/** Против одного бота: кто вышел раньше. Вышли в одном отбое (и ничья) — вместе. */
export function pairOf(x: Replayed, bot: number, seat = ME): Pair {
  const a = x.exitBout[seat], b = x.exitBout[bot];
  return a < b ? 'before' : a > b ? 'after' : 'together';
}

export function factsOf(g: FinishedGame): GameFacts {
  const r = g.record;
  const x = replayed(r);
  const bots = r.seats - 1;
  const mine = g.review && g.review.seat === ME ? g.review.decisions : null;
  return {
    at: g.at, end: g.end, variant: r.variant, seats: r.seats, levels: g.levels, place: placeOf(r),
    bouts: x.bouts, takes: x.takes[ME], transfers: x.transfers[ME], trumps: x.trumps[ME],
    botTrumps: x.trumps.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, bots),
    trumpsLeft: x.trumpsLeft[ME],
    vs: Array.from({ length: bots }, (_, k) => pairOf(x, k + 1)),
    hinted: g.hinted,
    errors: mine ? mine.filter(d => d.grade === 'error').length : null,
    inaccuracies: mine ? mine.filter(d => d.grade === 'inaccurate').length : null,
  };
}

/** Среднее по ряду партий от старой к новой. */
export function avgOf(values: readonly number[]): Avg {
  const n = values.length;
  const mean = (v: readonly number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  if (!n) return { n: 0, mean: 0, recent: null, earlier: null };
  const split = n >= 2 * RECENT;
  return { n, mean: mean(values), recent: split ? mean(values.slice(-RECENT)) : null, earlier: split ? mean(values.slice(0, -RECENT)) : null };
}

/** Понедельник 00:00 местного времени той недели, где `t`. */
export function weekStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function computeStats(games: FinishedGame[], now: number): Stats {
  const st: Stats = {
    total: zero(), places: { first: 0, out: 0, draw: 0, fool: 0 },
    byVariant: { podkidnoy: zero(), perevodnoy: zero() }, bySeats: { 2: zero(), 3: zero(), 4: zero() },
    byLevel: {}, mixed: zero(), vsLevel: {}, form: [], byWeek: [], streakToday: 0,
    trumps: { you: 0, bot: 0, games: 0 },
    avg: { bouts: avgOf([]), takes: avgOf([]), transfers: avgOf([]), trumpsLeft: avgOf([]), errors: avgOf([]), inaccuracies: avgOf([]) },
    hinted: 0, reviewed: 0, elo: START_ELO, eloGames: 0, eloLine: [], eloDelta: null,
  };
  const facts = games.map(factsOf);
  const weeks = new Map<number, Tally>();
  let w = weekStart(now);
  for (let k = 0; k < WEEKS; k++) {
    weeks.set(w, zero());
    w = weekStart(w - 1);
  }
  let elo = START_ELO, you = 0, bot = 0;
  const eloAll: number[] = [];
  for (const f of facts) {
    add(st.total, f.place);
    st.places[f.place]++;
    add(st.byVariant[f.variant], f.place);
    add(st.bySeats[f.seats as 2 | 3 | 4], f.place);
    const one = oneLevel(f.levels);
    add(one ? (st.byLevel[one] ??= zero()) : st.mixed, f.place);
    f.vs.forEach((p, k) => { (st.vsLevel[f.levels[k]] ??= zeroPairs())[p]++; });
    const week = weeks.get(weekStart(f.end));
    if (week) add(week, f.place);
    you += f.trumps;
    bot += f.botTrumps;
    if (f.hinted) st.hinted++;
    if (f.errors !== null) st.reviewed++;
    if (f.seats === 2 && !f.hinted && one) {
      const score = f.place === 'draw' ? 0.5 : f.place === 'fool' ? 0 : 1;
      const expect = 1 / (1 + 10 ** ((LEVEL_ELO[one] - elo) / 400));
      elo += ELO_K * (score - expect);
      eloAll.push(elo);
    }
  }
  const n = facts.length;
  st.trumps = { you: n ? you / n : 0, bot: n ? bot / n : 0, games: n };
  st.form = facts.slice(-FORM_GAMES).map(f => f.place);
  st.byWeek = [...weeks].map(([start, tally]) => ({ start, tally }));
  st.avg = {
    bouts: avgOf(facts.map(f => f.bouts)),
    takes: avgOf(facts.map(f => f.takes)),
    transfers: avgOf(facts.filter(f => f.variant === 'perevodnoy').map(f => f.transfers)),
    trumpsLeft: avgOf(facts.filter(f => f.place === 'fool').map(f => f.trumpsLeft)),
    errors: avgOf(facts.flatMap(f => (f.errors === null ? [] : [f.errors]))),
    inaccuracies: avgOf(facts.flatMap(f => (f.inaccuracies === null ? [] : [f.inaccuracies]))),
  };
  st.elo = Math.round(elo);
  st.eloGames = eloAll.length;
  st.eloLine = eloAll.slice(-ELO_LINE).map(Math.round);
  if (eloAll.length) st.eloDelta = Math.round(eloAll[eloAll.length - 1]) - Math.round(eloAll.length > 1 ? eloAll[eloAll.length - 2] : START_ELO);
  const day = (t: number) => new Date(t).toDateString();
  for (let i = facts.length - 1; i >= 0 && day(facts[i].end) === day(now); i--) {
    if (facts[i].place === 'fool') break;
    st.streakToday++;
  }
  return st;
}
