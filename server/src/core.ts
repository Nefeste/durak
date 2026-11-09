// Ядро сервера «Козыря» (docs/02-architecture.md, «Сервер»; docs/03-server-api.md). Устройство — как у
// ядра «Нард» (nardy: server/src/core.ts @ 1d2bdff): истина в базе, в памяти — позиция партии,
// таймеры и кто в сети; изменение сначала записывается, потом рассылается. Своё: 2–4 места, колода
// из зёрен всех мест, и каждый ответ — вид одного места (`observe`, ADR 0008).
import {
  apply, ascii, commitOf, dealOf, firstOf, legalActions, newGame, nextFirst, observe, reasonOf, RULES_V1, serverDeck, sha256, toHex,
} from '../../src/engine';
import type { Action, Card, Result, State, Variant } from '../../src/engine';
import { chooseAction, isLevel, levelOf, makeRng, TOP } from '../../src/bot';
import type { Level, Rng } from '../../src/bot';
import { autoPass } from '../../src/game/flow';
import { CODE_ALPHABET, isCode, isCommit, isKey, isSeed, nameProblem, ONLINE } from '../../src/state/protocol';
import type {
  CodeInfo, GameView, ProofView, QuickMe, SeatView, TableKind, TableStatus, TableView,
} from '../../src/state/protocol';
import type { Clock } from './clock';
import type { Database } from './db';
import { ApiError } from './errors';
import { glicko2, GLICKO_START } from './glicko';
import type { Glicko } from './glicko';

export { ApiError };

export interface Player { id: number; name: string; tag: string | null }

interface TableRow {
  id: string; code: string | null; kind: TableKind; host: number; rid: string | null; variant: Variant; seats: number;
  bots: Level | null; status: TableStatus; game: number; version: number; created: number; closed: number | null;
}
interface SeatRow { seat: number; player: number | null; bot: Level | null }

/** Строка стола из базы: уровень ботов — через levelOf (столы до 0.5.0 могли держать `strong`, #15). */
const fixTable = <T extends TableRow | null>(t: T): T => (t && t.bots !== null ? { ...t, bots: levelOf(t.bots) ?? TOP } : t);
interface GameRow {
  table_id: string; no: number; server_seed: string; commit_: string; seeds: string; first: number | null;
  actions: string; banks: string; rematch: string; result: string | null; started: number | null; finished: number | null;
}

type BotFor = null | 'offline' | 'clock';

/** Партия в памяти: позиция, часы, кто в сети, кто играет за кого. */
interface Live {
  no: number;
  state: State;
  actions: { seat: number; action: Action }[];
  /** С какого момента ждут текущего действия. */
  since: number;
  banks: number[];
  strikes: number[];
  botFor: BotFor[];
  timers: (() => void)[];
  rng: Rng;
}

export interface CoreDeps {
  db: Database;
  clock: Clock;
  random: (bytes: number) => Uint8Array;
  /** Стол изменился: разослать каждому соединению его вид (server/src/live.ts). */
  changed: (tableId: string) => void;
}

const DAY = 86_400_000;
const WAITING_TTL = DAY;
const FINISHED_TTL = 30 * DAY;
const REPORT_TTL = 180 * DAY;

export const keyHash = (key: string) => toHex(sha256(ascii(key)));
const isVariant = (v: unknown): v is Variant => v === 'podkidnoy' || v === 'perevodnoy';
const isCard = (c: unknown): c is Card => Number.isInteger(c) && (c as number) >= 0 && (c as number) < 36;
const cardList = (x: unknown): Card[] | null =>
  Array.isArray(x) && x.length >= 1 && x.length <= 6 && x.every(isCard) && new Set(x).size === x.length ? (x as Card[]) : null;

/** Уровень, который садится за отключившегося: «Сильный», а пока его нет — сильнейший из готовых. */
export const standInLevel = (): Level => TOP;

/** Действие из тела запроса: только известные поля, карты — числа 0…35. */
export function parseAction(a: unknown): Action | null {
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  switch (o.type) {
    case 'take':
    case 'pass':
      return { type: o.type };
    case 'beat':
      return isCard(o.card) && isCard(o.on) ? { type: 'beat', card: o.card, on: o.on } : null;
    case 'attack':
    case 'throwIn':
    case 'give':
    case 'transfer': {
      const cards = cardList(o.cards);
      return cards ? { type: o.type, cards } : null;
    }
    default:
      return null;
  }
}

/** Чьего действия ждут сейчас (их часы идут): отбивающийся, пока есть непокрытое; иначе все, у
 *  кого есть законные действия. */
export function waitingOf(s: State): number[] {
  if (s.phase === 'end') return [];
  const uncovered = s.phase === 'bout' && s.table.some(([, d]) => d === null);
  const seats = Array.from({ length: s.seats }, (_, i) => i).filter(i => legalActions(s, i).length > 0);
  return uncovered ? seats.filter(i => i === s.defender) : seats;
}

/** Простейшее законное действие, когда кончились часы: отбивающийся берёт, атакующий — «пас»,
 *  ход на пустой стол — младшей картой. */
export function simplest(s: State, seat: number): Action | null {
  const acts = legalActions(s, seat);
  return acts.find(a => a.type === 'take') ?? acts.find(a => a.type === 'pass')
    ?? acts.filter(a => a.type === 'attack' && a.cards.length === 1).sort((a, b) => (a as { cards: Card[] }).cards[0] - (b as { cards: Card[] }).cards[0])[0]
    ?? acts[0] ?? null;
}

export class Core {
  private readonly db: Database;
  private readonly clock: Clock;
  private readonly random: (bytes: number) => Uint8Array;
  private readonly changed: (tableId: string) => void;
  private readonly live = new Map<string, Live>();
  /** Когда место последний раз было на связи. */
  private readonly seen = new Map<string, number[]>();
  private depth = 0;
  private dirty = new Set<string>();

  constructor(deps: CoreDeps) {
    this.db = deps.db;
    this.clock = deps.clock;
    this.random = deps.random;
    this.changed = deps.changed;
  }

  now() { return this.clock.now(); }

  // ——— транзакции: рассылка — после записи ———

  private tx<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.depth++;
    let out: T;
    try {
      out = this.db.transaction(fn)();
    } catch (e) {
      this.dirty.clear();
      throw e;
    } finally {
      this.depth--;
    }
    const sent = [...this.dirty];
    this.dirty.clear();
    for (const id of sent) this.changed(id);
    return out;
  }

  private bump(tableId: string): void {
    this.db.query('UPDATE tables SET version = version + 1 WHERE id = ?').run(tableId);
    this.dirty.add(tableId);
  }

  // ——— случайное ———

  private hex(bytes: number) { return toHex(this.random(bytes)); }
  private letters(n: number) { return Array.from(this.random(n), b => CODE_ALPHABET[b & 31]).join(''); }
  newKey(): string { return Buffer.from(this.random(32)).toString('base64url'); }
  private freshCode(check: string): string {
    for (;;) {
      const c = this.letters(6);
      if (!this.db.query(check).get(c)) return c;
    }
  }

  // ——— профили (как в «Нардах») ———

  player(key: string | null): Player {
    if (!isKey(key)) throw new ApiError('no-key');
    const row = this.db.query('SELECT id, name, tag, seen FROM players WHERE key_hash = ?').get(keyHash(key)) as (Player & { seen: number }) | null;
    if (!row) throw new ApiError('no-profile');
    const now = this.now();
    if (now - row.seen > 3_600_000) this.db.query('UPDATE players SET seen = ? WHERE id = ?').run(now, row.id);
    return { id: row.id, name: row.name, tag: row.tag };
  }

  session(key: string | null, name: unknown): Player {
    if (!isKey(key)) throw new ApiError('no-key');
    const problem = nameProblem(name);
    if (problem) throw new ApiError(problem);
    const hash = keyHash(key), now = this.now();
    return this.tx(() => {
      const row = this.db.query('SELECT id, tag FROM players WHERE key_hash = ?').get(hash) as { id: number; tag: string } | null;
      if (row) {
        this.db.query('UPDATE players SET name = ?, seen = ? WHERE id = ?').run(name as string, now, row.id);
        return { id: row.id, name: name as string, tag: row.tag };
      }
      const tag = this.freshCode('SELECT 1 FROM players WHERE tag = ?');
      const { id } = this.db.query('INSERT INTO players (key_hash, name, tag, created, seen) VALUES (?, ?, ?, ?, ?) RETURNING id')
        .get(hash, name as string, tag, now, now) as { id: number };
      return { id, name: name as string, tag };
    });
  }

  /** Удаление профиля: имя стёрто, ключ забыт; за его места дальше играют боты, пустые столы закрыты. */
  deletePlayer(id: number): void {
    this.tx(() => {
      const rows = this.db.query(`SELECT t.* FROM tables t JOIN table_seats s ON s.table_id = t.id
        WHERE s.player = ? AND t.status IN ('waiting', 'playing', 'finished')`).all(id).map(r => fixTable(r as TableRow));
      for (const t of rows) {
        if (t.status === 'waiting' && t.host === id) this.close(t);
        else {
          const seat = this.seats(t.id).find(s => s.player === id)!.seat;
          const g = this.live.get(t.id);
          if (g) {
            if (t.kind === 'quick') this.resignSeat(t, seat);
            else { g.botFor[seat] = 'clock'; this.bump(t.id); this.after(t.id); }
          }
        }
      }
      this.db.query("UPDATE players SET name = '', key_hash = 'deleted:' || id, tag = NULL WHERE id = ?").run(id);
      this.db.query('DELETE FROM ratings WHERE player = ?').run(id);
    });
  }

  // ——— столы ———

  private tableRow(id: unknown): TableRow {
    const t = typeof id === 'string' ? fixTable(this.db.query('SELECT * FROM tables WHERE id = ?').get(id) as TableRow | null) : null;
    if (!t) throw new ApiError('no-table');
    return t;
  }

  private seats(tableId: string): SeatRow[] {
    // уровень из базы — через levelOf: столы до 0.5.0 могли держать `strong`, теперь это «Мастер» (#15)
    return (this.db.query('SELECT seat, player, bot FROM table_seats WHERE table_id = ? ORDER BY seat').all(tableId) as SeatRow[])
      .map(r => (r.bot === null ? r : { ...r, bot: levelOf(r.bot) ?? TOP }));
  }

  private gameRow(tableId: string, no: number): GameRow | null {
    return this.db.query('SELECT * FROM games WHERE table_id = ? AND no = ?').get(tableId, no) as GameRow | null;
  }

  private seatOfPlayer(t: TableRow, p: Player): number {
    const s = this.seats(t.id).find(x => x.player === p.id);
    if (!s) throw new ApiError('not-at-table');
    return s.seat;
  }

  /** Номер места игрока за столом (WebSocket и опрос). */
  seatOf(p: Player, id: unknown): { table: string; seat: number } {
    const t = this.tableRow(id);
    return { table: t.id, seat: this.seatOfPlayer(t, p) };
  }

  /** Новая партия стола: зерно сервера и его отпечаток — до того, как места отдадут свои зёрна. */
  private newGameRow(tableId: string, no: number, seats: number): string {
    const serverSeed = this.hex(32), commit = commitOf(serverSeed);
    this.db.query('INSERT INTO games (table_id, no, server_seed, commit_, seeds, rematch) VALUES (?, ?, ?, ?, ?, ?)')
      .run(tableId, no, serverSeed, commit, JSON.stringify(Array(seats).fill(null)), JSON.stringify(Array(seats).fill(false)));
    return commit;
  }

  createTable(p: Player, body: { rid?: unknown; variant?: unknown; seats?: unknown; bots?: unknown }, kind: TableKind = 'friend'): TableView {
    const rid = body.rid ?? null;
    if (rid !== null && (typeof rid !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(rid))) throw new ApiError('bad-body');
    if (!isVariant(body.variant)) throw new ApiError('bad-variant');
    const seats = body.seats;
    if (!Number.isInteger(seats) || (seats as number) < 2 || (seats as number) > 4) throw new ApiError('bad-seats');
    const bots = body.bots ?? null;
    if (bots !== null && !isLevel(bots)) throw new ApiError('bad-level');
    const variant = body.variant;
    const id = this.tx(() => {
      if (rid !== null) {
        const old = this.db.query('SELECT id FROM tables WHERE host = ? AND rid = ?').get(p.id, rid) as { id: string } | null;
        if (old) return old.id;
      }
      const id = `t_${this.letters(12).toLowerCase()}`;
      const code = this.freshCode('SELECT 1 FROM tables WHERE code = ?');
      this.db.query(`INSERT INTO tables (id, code, kind, host, rid, variant, seats, bots, status, created)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?)`).run(id, code, kind, p.id, rid, variant, seats as number, bots, this.now());
      // свободные места сразу за ботами стола: хозяин видит их уровни и меняет каждому (`setBot`), а человек может
      // сесть на место бота до начала — бот уходит
      for (let s = 0; s < (seats as number); s++) {
        this.db.query('INSERT INTO table_seats (table_id, seat, player, bot) VALUES (?, ?, ?, ?)').run(id, s, s === 0 ? p.id : null, s === 0 ? null : bots);
      }
      this.newGameRow(id, 0, seats as number);
      this.bump(id);
      return id;
    });
    this.touch(id, 0);
    return this.view(id, 0);
  }

  /** Первый шаг входа: телефон записывает отпечаток до того, как отдаст своё зерно. */
  codeInfo(code: unknown, p: Player): CodeInfo {
    if (!isCode(code)) throw new ApiError('bad-code');
    const t = fixTable(this.db.query("SELECT * FROM tables WHERE code = ? AND status != 'cancelled'").get(code) as TableRow | null);
    if (!t) throw new ApiError('no-table');
    const seats = this.seats(t.id), g = this.gameRow(t.id, t.game)!;
    const host = this.db.query('SELECT name FROM players WHERE id = ?').get(t.host) as { name: string };
    const names = this.namesOf(seats);
    return {
      id: t.id, host: host.name, variant: t.variant, seats: t.seats,
      taken: seats.filter(s => s.player !== null).length, status: t.status, commit: g.commit_,
      mine: seats.some(s => s.player === p.id),
      places: seats.map(s => (s.player !== null
        ? { name: names.get(s.player)?.name ?? '', bot: null, host: s.player === t.host, you: s.player === p.id }
        : s.bot !== null ? { name: '', bot: s.bot, host: false, you: false } : null)),
    };
  }

  private namesOf(rows: SeatRow[]): Map<number, Player> {
    return new Map((this.db.query(`SELECT id, name, tag FROM players WHERE id IN (${rows.map(() => '?').join(',')})`)
      .all(...rows.map(r => r.player ?? -1)) as Player[]).map(x => [x.id, x]));
  }

  /**
   * Сесть за стол (или отдать зерно, если место уже ваше): зерно — только при неизменном отпечатке. `seat` — какое
   * место выбрали: свободное или место бота (бот уходит); уже сидящий до начала так пересаживается, зерно — с ним.
   * Без `seat` (телефоны до 0.8.0) — первое свободное без бота, а нет такого — первое место бота.
   */
  join(p: Player, body: { code?: unknown; seed?: unknown; commit?: unknown; seat?: unknown }): TableView {
    if (!isCode(body.code)) throw new ApiError('bad-code');
    if (!isSeed(body.seed)) throw new ApiError('bad-seed');
    if (!isCommit(body.commit)) throw new ApiError('bad-body');
    const want = body.seat ?? null;
    if (want !== null && !Number.isInteger(want)) throw new ApiError('bad-seat');
    const seed = body.seed, commit = body.commit, code = body.code;
    let seat = -1, tableId = '';
    this.tx(() => {
      const t = fixTable(this.db.query("SELECT * FROM tables WHERE code = ? AND status != 'cancelled'").get(code) as TableRow | null);
      if (!t) throw new ApiError('no-table');
      tableId = t.id;
      const g = this.gameRow(t.id, t.game)!;
      if (g.commit_ !== commit) throw new ApiError('commit-changed', { commit: g.commit_ });
      const rows = this.seats(t.id);
      if (want !== null && ((want as number) < 0 || (want as number) >= t.seats)) throw new ApiError('bad-seat');
      const mine = rows.find(s => s.player === p.id);
      const seeds = JSON.parse(g.seeds) as (string | null)[];
      const take = (to: number) => {
        // место бота: бот уходит — на этом месте будет человек
        this.db.query('UPDATE table_seats SET player = ?, bot = NULL WHERE table_id = ? AND seat = ?').run(p.id, t.id, to);
      };
      if (mine && (want === null || want === mine.seat)) seat = mine.seat;
      else {
        if (t.status !== 'waiting' || t.kind === 'quick') throw new ApiError(t.status !== 'waiting' ? 'not-waiting' : mine ? 'bad-seat' : 'full');
        let to: SeatRow | undefined;
        if (want !== null) {
          to = rows[want as number];
          if (to.player !== null) throw new ApiError('seat-taken');
        } else to = rows.find(s => s.player === null && s.bot === null) ?? rows.find(s => s.player === null);
        if (!to) throw new ApiError('full');
        if (mine) {
          // пересесть до начала: прежнее место — снова за ботом стола (или свободно), зерно — на новое место
          this.db.query('UPDATE table_seats SET player = NULL, bot = ? WHERE table_id = ? AND seat = ?').run(t.bots, t.id, mine.seat);
          seeds[to.seat] = seeds[mine.seat];
          seeds[mine.seat] = null;
        }
        seat = to.seat;
        take(seat);
      }
      if (t.status === 'waiting') {
        if (seeds[seat] === null) seeds[seat] = seed;
        this.db.query('UPDATE games SET seeds = ? WHERE table_id = ? AND no = ?').run(JSON.stringify(seeds), t.id, g.no);
        this.bump(t.id);
        // быстрый стол начинается сам, когда оба отдали зёрна
        if (t.kind === 'quick' && this.seats(t.id).every((s, i) => s.bot !== null || (s.player !== null && seeds[i] !== null))) {
          this.start(t);
        }
      }
    });
    this.touch(tableId, seat);
    return this.view(tableId, seat);
  }

  /** Хозяин стола с ботами до начала выбирает уровень бота на месте (каждому свой, ADR 0011: имя — по уровню). */
  setBot(p: Player, id: unknown, body: { seat?: unknown; level?: unknown }): TableView {
    const t = this.tableRow(id);
    if (t.host !== p.id) throw new ApiError('not-host');
    if (t.status !== 'waiting' || t.kind !== 'friend') throw new ApiError('not-waiting');
    if (t.bots === null || !isLevel(body.level)) throw new ApiError('bad-level');
    const seat = body.seat;
    if (!Number.isInteger(seat) || (seat as number) < 0 || (seat as number) >= t.seats) throw new ApiError('bad-seat');
    const level = body.level;
    this.tx(() => {
      const row = this.seats(t.id)[seat as number];
      if (row.player !== null) throw new ApiError('seat-taken');
      this.db.query('UPDATE table_seats SET bot = ? WHERE table_id = ? AND seat = ?').run(level, t.id, seat as number);
      this.bump(t.id);
    });
    return this.view(t.id, this.seatOfPlayer(t, p));
  }

  /** Создатель начинает партию: свободные места — боты стола (если не выключены). */
  startBy(p: Player, id: unknown): TableView {
    const t = this.tableRow(id);
    if (t.host !== p.id) throw new ApiError('not-host');
    if (t.status !== 'waiting') throw new ApiError('not-waiting');
    this.tx(() => {
      const rows = this.seats(t.id);
      const humans = rows.filter(s => s.player !== null).length;
      if (humans < 2 && t.bots === null) throw new ApiError('not-enough');
      const g = this.gameRow(t.id, t.game)!;
      const seeds = JSON.parse(g.seeds) as (string | null)[];
      // сидящий без зерна ещё не подтвердил вход — его место отдаётся боту, если боты есть
      for (const s of rows) {
        if (s.player !== null && seeds[s.seat] === null) {
          if (s.player === t.host) throw new ApiError('bad-seed');
          this.db.query('UPDATE table_seats SET player = NULL WHERE table_id = ? AND seat = ?').run(t.id, s.seat);
          s.player = null;
        }
      }
      if (rows.filter(s => s.player !== null).length < 2 && t.bots === null) throw new ApiError('not-enough');
      for (const s of rows) {
        if (s.player === null && s.bot === null) {
          if (t.bots === null) throw new ApiError('not-enough');
          this.db.query('UPDATE table_seats SET bot = ? WHERE table_id = ? AND seat = ?').run(t.bots, t.id, s.seat);
        }
      }
      this.start(t);
    });
    return this.view(t.id, this.seatOfPlayer(t, p));
  }

  /** Раздача: зёрна ботов — от сервера, колода — от зерна сервера и всех зёрен мест. */
  private start(t: TableRow): void {
    const g = this.gameRow(t.id, t.game)!;
    const seeds = JSON.parse(g.seeds) as (string | null)[];
    const rows = this.seats(t.id);
    for (const s of rows) if (seeds[s.seat] === null) seeds[s.seat] = this.hex(16);
    const deck = serverDeck(g.server_seed, seeds as string[]);
    const history = (this.db.query('SELECT result FROM games WHERE table_id = ? AND no < ? ORDER BY no').all(t.id, g.no) as { result: string | null }[])
      .map(r => (r.result ? JSON.parse(r.result) as Result : null));
    const { hands, trump } = dealOf(deck, t.seats);
    const first = nextFirst(history, t.seats) ?? firstOf(hands, trump).seat;
    const banks = Array(t.seats).fill(ONLINE.bankMs);
    this.db.query("UPDATE games SET seeds = ?, first = ?, banks = ?, started = ? WHERE table_id = ? AND no = ?")
      .run(JSON.stringify(seeds), first, JSON.stringify(banks), this.now(), t.id, g.no);
    this.db.query("UPDATE tables SET status = 'playing' WHERE id = ?").run(t.id);
    const state = newGame({ rules: RULES_V1, variant: t.variant, seats: t.seats, first }, deck);
    this.live.set(t.id, {
      no: g.no, state, actions: [], since: this.now(), banks, strikes: Array(t.seats).fill(0),
      botFor: Array(t.seats).fill(null), timers: [], rng: makeRng(this.random(4).reduce((a, b) => a * 256 + b, 0)),
    });
    this.bump(t.id);
    this.after(t.id);
  }

  cancel(p: Player, id: unknown): { ok: true } {
    const t = this.tableRow(id);
    if (t.host !== p.id) throw new ApiError('not-host');
    if (t.status !== 'waiting') throw new ApiError('not-waiting');
    this.tx(() => this.close(t));
    return { ok: true };
  }

  private close(t: TableRow): void {
    this.db.query("UPDATE tables SET status = 'cancelled', closed = ? WHERE id = ?").run(this.now(), t.id);
    this.stopTimers(t.id);
    this.live.delete(t.id);
    this.bump(t.id);
  }

  // ——— действия ———

  act(p: Player, id: unknown, body: { game?: unknown; n?: unknown; action?: unknown }): { n: number } {
    const t = this.tableRow(id);
    const seat = this.seatOfPlayer(t, p);
    this.touch(t.id, seat);
    const g = this.live.get(t.id);
    if (t.status !== 'playing' || !g) throw new ApiError('not-playing');
    if (body.game !== g.no || !Number.isInteger(body.n)) throw new ApiError('stale', { table: this.view(t.id, seat) });
    const action = parseAction(body.action);
    if (!action) throw new ApiError('bad-action');
    const n = body.n as number;
    if (n < g.actions.length) {
      // повтор того же действия — тот же ответ, без второго применения
      const old = g.actions[n];
      if (old && old.seat === seat && JSON.stringify(old.action) === JSON.stringify(action)) return { n: n + 1 };
      throw new ApiError('stale', { table: this.view(t.id, seat) });
    }
    if (n > g.actions.length) throw new ApiError('stale', { table: this.view(t.id, seat) });
    const why = reasonOf(g.state, seat, action);
    if (why) throw new ApiError(why === 'notYourMove' ? 'not-your-turn' : 'illegal', { reason: why });
    // свой ход возвращает место себе: бот за него больше не играет
    g.botFor[seat] = null;
    g.strikes[seat] = 0;
    this.tx(() => this.play(t, g, seat, action));
    return { n: g.actions.length };
  }

  /** Записать действие, пересчитать часы, закончить партию, если она кончилась. */
  private play(t: TableRow, g: Live, seat: number, action: Action): void {
    const now = this.now();
    for (const w of waitingOf(g.state)) {
      if (this.humanSeat(t, w) && g.botFor[w] === null) g.banks[w] = Math.max(0, g.banks[w] - Math.max(0, now - g.since - ONLINE.actionMs));
    }
    g.state = apply(g.state, seat, action);
    g.actions.push({ seat, action });
    g.since = now;
    this.db.query('UPDATE games SET actions = ?, banks = ? WHERE table_id = ? AND no = ?')
      .run(JSON.stringify(g.actions), JSON.stringify(g.banks), t.id, g.no);
    this.bump(t.id);
    if (g.state.phase === 'end') this.finish(t, g, g.state.result!);
    else this.after(t.id);
  }

  private humanSeat(t: TableRow, seat: number): boolean {
    return this.seats(t.id)[seat]?.player !== null;
  }

  private finish(t: TableRow, g: Live, result: Result): void {
    this.stopTimers(t.id);
    const now = this.now();
    this.db.query('UPDATE games SET result = ?, finished = ? WHERE table_id = ? AND no = ?').run(JSON.stringify(result), now, t.id, g.no);
    this.db.query("UPDATE tables SET status = 'finished', game = ? WHERE id = ?").run(g.no + 1, t.id);
    this.newGameRow(t.id, g.no + 1, t.seats);
    if (t.kind === 'quick') this.rate(t, result);
    this.live.delete(t.id);
    this.bump(t.id);
  }

  private resignSeat(t: TableRow, seat: number): void {
    const g = this.live.get(t.id);
    if (!g) return;
    const order = g.state.out.filter(s => s !== seat);
    for (let s = 0; s < t.seats; s++) if (s !== seat && !order.includes(s)) order.push(s);
    this.finish(t, g, { fool: seat, draw: false, order });
  }

  /** Сдаться: в быстрой игре — поражение; за столом с друзьями дальше за вас играет бот. */
  resign(p: Player, id: unknown): { ok: true } {
    const t = this.tableRow(id);
    const seat = this.seatOfPlayer(t, p);
    const g = this.live.get(t.id);
    if (t.status !== 'playing' || !g) throw new ApiError('not-playing');
    this.tx(() => {
      if (t.kind === 'quick') this.resignSeat(t, seat);
      else {
        g.botFor[seat] = 'clock';
        this.bump(t.id);
        this.after(t.id);
      }
    });
    return { ok: true };
  }

  /** «Реванш»: та же компания, новая колода. Зерно — под уже показанный отпечаток следующей партии. */
  rematch(p: Player, id: unknown, body: { seed?: unknown; commit?: unknown }): TableView {
    const t = this.tableRow(id);
    const seat = this.seatOfPlayer(t, p);
    if (t.status !== 'finished') throw new ApiError('not-finished');
    if (!isSeed(body.seed)) throw new ApiError('bad-seed');
    const g = this.gameRow(t.id, t.game)!;
    if (body.commit !== g.commit_) throw new ApiError('commit-changed', { commit: g.commit_ });
    this.tx(() => {
      const seeds = JSON.parse(g.seeds) as (string | null)[];
      const want = JSON.parse(g.rematch) as boolean[];
      seeds[seat] = body.seed as string;
      want[seat] = true;
      this.db.query('UPDATE games SET seeds = ?, rematch = ? WHERE table_id = ? AND no = ?').run(JSON.stringify(seeds), JSON.stringify(want), t.id, g.no);
      this.bump(t.id);
      const rows = this.seats(t.id);
      if (rows.every(s => s.player === null || want[s.seat])) this.start({ ...t, status: 'waiting' });
    });
    return this.view(t.id, seat);
  }

  // ——— боты, часы, «бито» само ———

  private stopTimers(tableId: string): void {
    const g = this.live.get(tableId);
    if (!g) return;
    for (const stop of g.timers) stop();
    g.timers = [];
  }

  /** После каждого изменения: кому ходить ботом, чьё «бито» само, чьи часы. */
  private after(tableId: string): void {
    this.stopTimers(tableId);
    const g = this.live.get(tableId);
    if (!g || g.state.phase === 'end') return;
    const t = this.tableRow(tableId);
    const rows = this.seats(tableId);
    const no = g.no, n = g.actions.length, now = this.now();
    const fire = (when: number, fn: () => void) => {
      g.timers.push(this.clock.at(when, () => {
        const cur = this.live.get(tableId);
        if (!cur || cur.no !== no || cur.actions.length !== n) return;
        try { fn(); } catch (e) { console.error('timer:', e); }
      }));
    };
    const byBot = (s: number) => rows[s].bot !== null || g.botFor[s] !== null;
    // бот: первое место с действиями от ходящего по часовой стрелке
    for (let k = 0; k < t.seats; k++) {
      const seat = (g.state.attacker + k) % t.seats;
      if (!byBot(seat) || legalActions(g.state, seat).length === 0) continue;
      const level = rows[seat].bot ?? standInLevel();
      const action = chooseAction(observe(g.state, seat), level, g.rng);
      // «пас» бота — с той же паузой, что «бито» само: мгновенное «бито» выдало бы, что подкинуть нечем
      const wait = action.type === 'pass' ? ONLINE.autoPassMs : ONLINE.botMs;
      fire(now + wait, () => this.tx(() => this.play(t, g, seat, action)));
      break;
    }
    // «бито» само у людей, которым подкинуть нечего
    for (let seat = 0; seat < t.seats; seat++) {
      if (byBot(seat) || !autoPass(g.state, seat)) continue;
      fire(now + ONLINE.autoPassMs, () => this.tx(() => this.play(t, g, seat, { type: 'pass' })));
    }
    // часы людей, которых ждут
    for (const seat of waitingOf(g.state)) {
      if (byBot(seat) || autoPass(g.state, seat)) continue;
      fire(g.since + ONLINE.actionMs + g.banks[seat], () => this.flag(t, g, seat));
    }
  }

  /** Часы места кончились: простейшее законное действие; три раза подряд — поражение или бот. */
  private flag(t: TableRow, g: Live, seat: number): void {
    const a = simplest(g.state, seat);
    if (!a) return;
    this.tx(() => {
      g.banks[seat] = 0;
      g.strikes[seat]++;
      if (g.strikes[seat] >= ONLINE.strikes) {
        if (t.kind === 'quick') return this.resignSeat(t, seat);
        g.botFor[seat] = 'clock';
      }
      this.play(t, g, seat, a);
    });
  }

  // ——— кто в сети ———

  touch(tableId: string, seat: number): void {
    const now = this.now();
    let s = this.seen.get(tableId);
    if (!s) this.seen.set(tableId, s = []);
    s[seat] = now;
    const g = this.live.get(tableId);
    if (g && g.botFor[seat] === 'offline') {
      g.botFor[seat] = null;
      this.tx(() => { this.bump(tableId); this.after(tableId); });
    }
  }

  private online(tableId: string, seat: number): boolean {
    const at = this.seen.get(tableId)?.[seat];
    return at !== undefined && this.now() - at < ONLINE.offlineMs;
  }

  /** Раз в несколько секунд: за стол с друзьями вместо пропавшего садится бот. */
  sweepPresence(): void {
    for (const [tableId, g] of this.live) {
      const t = this.tableRow(tableId);
      if (t.kind !== 'friend') continue;
      const rows = this.seats(tableId);
      let change = false;
      for (const s of rows) {
        if (s.player !== null && g.botFor[s.seat] === null && !this.online(tableId, s.seat)) {
          g.botFor[s.seat] = 'offline';
          change = true;
        }
      }
      if (change) this.tx(() => { this.bump(tableId); this.after(tableId); });
    }
  }

  /** Перезапуск сервера: идущие партии — переигрыванием записи. */
  restore(): number {
    const rows = this.db.query(`SELECT g.*, t.variant, t.seats AS n FROM games g JOIN tables t ON t.id = g.table_id
      WHERE t.status = 'playing' AND g.no = t.game AND g.started IS NOT NULL AND g.result IS NULL`).all() as (GameRow & { variant: Variant; n: number })[];
    for (const r of rows) {
      const deck = serverDeck(r.server_seed, JSON.parse(r.seeds));
      let state = newGame({ rules: RULES_V1, variant: r.variant, seats: r.n, first: r.first! }, deck);
      const actions = JSON.parse(r.actions) as { seat: number; action: Action }[];
      for (const a of actions) state = apply(state, a.seat, a.action);
      this.live.set(r.table_id, {
        no: r.no, state, actions, since: this.now(), banks: JSON.parse(r.banks), strikes: Array(r.n).fill(0),
        botFor: Array(r.n).fill(null), timers: [], rng: makeRng(this.random(4).reduce((a, b) => a * 256 + b, 0)),
      });
      this.after(r.table_id);
    }
    return rows.length;
  }

  // ——— вид места (ADR 0008): единственное место, где сервер отдаёт партию ———

  view(tableId: string, you: number): TableView {
    const t = this.tableRow(tableId);
    const rows = this.seats(tableId);
    const g = this.live.get(tableId);
    const row = this.gameRow(tableId, g ? g.no : t.game)!;
    // законченная партия: показываем её итог, пока следующая не началась
    const last = !g && t.game > 0 ? this.gameRow(tableId, t.game - 1) : null;
    const names = this.namesOf(rows);
    const obs = g ? observe(g.state, you) : null;
    const seats: (SeatView | null)[] = rows.map(s => {
      if (s.player === null && s.bot === null) return null;
      const p = s.player !== null ? names.get(s.player) : undefined;
      const sv: SeatView = {
        name: p?.name ?? '', tag: p?.tag ?? null, bot: s.bot, botFor: !!g && g.botFor[s.seat] !== null,
        online: s.bot !== null || this.online(tableId, s.seat), cards: obs ? obs.handSizes[s.seat] : 0, out: !!obs && obs.out.includes(s.seat),
      };
      if (t.kind === 'quick' && s.player !== null) sv.rating = Math.round(this.glickoOf(s.player, t.variant).rating);
      return sv;
    });
    let game: GameView;
    if (g) {
      const waiting = waitingOf(g.state);
      const human = waiting.filter(w => rows[w].bot === null && g.botFor[w] === null);
      game = {
        no: g.no, commit: row.commit_, n: g.actions.length, view: obs, waiting,
        deadline: human.includes(you) ? g.since + ONLINE.actionMs + g.banks[you] : null,
        banks: [...g.banks], result: null, proof: null, nextCommit: null, rematch: Array(t.seats).fill(false),
      };
    } else if (last && last.result) {
      game = {
        no: last.no, commit: last.commit_, n: (JSON.parse(last.actions) as unknown[]).length, view: null, waiting: [], deadline: null,
        banks: JSON.parse(last.banks), result: JSON.parse(last.result), proof: this.proofOf(last, t.variant), nextCommit: row.commit_,
        rematch: JSON.parse(row.rematch),
      };
    } else {
      game = {
        no: row.no, commit: row.commit_, n: 0, view: null, waiting: [], deadline: null, banks: [], result: null, proof: null,
        nextCommit: null, rematch: Array(t.seats).fill(false),
      };
    }
    return {
      id: t.id, kind: t.kind, code: t.code, status: t.status, variant: t.variant, rules: 'durak-rules-v1', host: rows.findIndex(r => r.player === t.host),
      bots: t.bots, seats, you, version: t.version, game,
    };
  }

  private proofOf(g: GameRow, variant: Variant): ProofView {
    const seeds = JSON.parse(g.seeds) as string[];
    void variant;
    return {
      commit: g.commit_, seed: g.server_seed, seeds, deck: serverDeck(g.server_seed, seeds), first: g.first!,
      actions: JSON.parse(g.actions), algo: 'durak-deck-v1',
    };
  }

  /** Доказательство законченной партии (страница «Как проверить» и телефон). */
  proof(id: unknown, no: number): ProofView {
    const t = this.tableRow(id);
    const g = this.gameRow(t.id, no);
    if (!g || !g.result) throw new ApiError('not-finished');
    return this.proofOf(g, t.variant);
  }

  /** Опрос: `since` — версия, которую телефон уже видел. */
  poll(p: Player, id: unknown, since: number | null): { unchanged: true } | { table: TableView } {
    const t = this.tableRow(id);
    const seat = this.seatOfPlayer(t, p);
    this.touch(t.id, seat);
    if (since !== null && since >= t.version) return { unchanged: true };
    return { table: this.view(t.id, seat) };
  }

  /** Места, которые сейчас слушают стол: для рассылки (live.ts). */
  version(tableId: string): number {
    return (this.db.query('SELECT version FROM tables WHERE id = ?').get(tableId) as { version: number } | null)?.version ?? -1;
  }

  // ——— быстрая игра: столы и рейтинг ———

  glickoOf(player: number, variant: Variant): Glicko & { games: number } {
    const r = this.db.query('SELECT rating, rd, vol, games FROM ratings WHERE player = ? AND variant = ?').get(player, variant) as
      { rating: number; rd: number; vol: number; games: number } | null;
    return r ? { rating: r.rating, rd: r.rd, vol: r.vol, games: r.games } : { ...GLICKO_START, games: 0 };
  }

  quickMe(p: Player, variant: Variant): QuickMe {
    const g = this.glickoOf(p.id, variant);
    return { rating: Math.round(g.rating), provisional: g.rd > 110, games: g.games };
  }

  /** Стол быстрой игры для пары: оба места заняты, зёрна — после отпечатка, как у друзей. */
  createQuick(a: Player, b: number | null, variant: Variant): { id: string; code: string } {
    let out = { id: '', code: '' };
    this.tx(() => {
      const id = `t_${this.letters(12).toLowerCase()}`;
      const code = this.freshCode('SELECT 1 FROM tables WHERE code = ?');
      const bots = b === null ? 'average' : null;
      this.db.query(`INSERT INTO tables (id, code, kind, host, variant, seats, bots, status, created) VALUES (?, ?, 'quick', ?, ?, 2, ?, 'waiting', ?)`)
        .run(id, code, a.id, variant, bots, this.now());
      this.db.query('INSERT INTO table_seats (table_id, seat, player) VALUES (?, 0, ?)').run(id, a.id);
      this.db.query('INSERT INTO table_seats (table_id, seat, player, bot) VALUES (?, 1, ?, ?)').run(id, b, b === null ? 'average' : null);
      this.newGameRow(id, 0, 2);
      this.bump(id);
      out = { id, code };
    });
    return out;
  }

  /** Пара не подтвердила вход вовремя: стол закрывается. */
  dropQuick(id: string): boolean {
    const t = fixTable(this.db.query("SELECT * FROM tables WHERE id = ? AND kind = 'quick'").get(id) as TableRow | null);
    if (!t || t.status !== 'waiting') return false;
    this.tx(() => this.close(t));
    return true;
  }

  tableStatus(id: string): TableStatus | null {
    return (this.db.query('SELECT status FROM tables WHERE id = ?').get(id) as { status: TableStatus } | null)?.status ?? null;
  }

  private rate(t: TableRow, result: Result): void {
    const rows = this.seats(t.id);
    if (rows.some(s => s.player === null)) return;
    const [a, b] = rows.map(s => s.player!);
    const ga = this.glickoOf(a, t.variant), gb = this.glickoOf(b, t.variant);
    const sa = result.draw || result.fool === null ? 0.5 : result.fool === 0 ? 0 : 1;
    const na = glicko2(ga, [{ opp: gb, score: sa }]), nb = glicko2(gb, [{ opp: ga, score: 1 - sa }]);
    const put = this.db.query(`INSERT INTO ratings (player, variant, rating, rd, vol, games) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (player, variant) DO UPDATE SET rating = excluded.rating, rd = excluded.rd, vol = excluded.vol, games = excluded.games`);
    put.run(a, t.variant, na.rating, na.rd, na.vol, ga.games + 1);
    put.run(b, t.variant, nb.rating, nb.rd, nb.vol, gb.games + 1);
  }

  // ——— отчёты и уборка ———

  report(body: unknown): void {
    this.db.query('INSERT INTO reports (at, body) VALUES (?, ?)').run(this.now(), JSON.stringify(body).slice(0, 16_000));
  }

  housekeeping(): void {
    const now = this.now();
    this.tx(() => {
      for (const t of this.db.query("SELECT * FROM tables WHERE status = 'waiting' AND created < ?").all(now - WAITING_TTL) as TableRow[]) this.close(t);
      this.db.query("DELETE FROM tables WHERE status IN ('finished', 'cancelled') AND COALESCE(closed, created) < ? AND id NOT IN (SELECT table_id FROM games WHERE finished > ?)")
        .run(now - FINISHED_TTL, now - FINISHED_TTL);
      this.db.query('DELETE FROM reports WHERE at < ?').run(now - REPORT_TTL);
    });
  }
}
