// Очередь быстрой игры (docs/09-game-design.md, «Быстрая игра»). Устройство — как у «Нард» (nardy:
// server/src/quick.ts @ 1d2bdff): кто ищет — в памяти, пара — ближайшие по рейтингу Glicko-2 в окне,
// которое растёт со временем ожидания; отдельно для подкидного и переводного. Найденная пара садится
// за стол по коду, отдав зёрна после отпечатка, как к друзьям. Через минуту без соперника — предложение
// сыграть с ботом; бот подписан и никогда не садится молча.
import { ONLINE } from '../../src/state/protocol';
import type { QuickView } from '../../src/state/protocol';
import type { Variant } from '../../src/engine';
import type { Clock } from './clock';
import type { Core, Player } from './core';
import { ApiError } from './errors';

/** `knows` — телефон знает очередь атакующих (заголовок `x-durak-rules`); иначе стол — «кто успел» (ADR 0013). */
interface Waiting { p: Player; variant: Variant; since: number; seen: number; rating: number; knows: boolean }
interface Found { at: number; table: string }

/** Не опрашивал очередь столько — выпал из неё. */
const STALE_MS = 15_000;
/** Найденная пара должна сесть за стол за столько. */
const JOIN_MS = 30_000;
/** Окно рейтинга: начальное и прирост за секунду ожидания. */
const WINDOW = 100, WIDEN = 10;

export class QuickQueue {
  private readonly waiting = new Map<number, Waiting>();
  private readonly found = new Map<number, Found>();

  constructor(private readonly core: Core, private readonly clock: Clock) {}

  join(p: Player, body: { variant?: unknown }, knows = true): QuickView {
    if (body.variant !== 'podkidnoy' && body.variant !== 'perevodnoy') throw new ApiError('bad-variant');
    const f = this.found.get(p.id);
    if (f && this.core.tableStatus(f.table) !== 'waiting') this.found.delete(p.id);
    if (!this.found.has(p.id)) {
      const now = this.clock.now(), w = this.waiting.get(p.id);
      const since = w && w.variant === body.variant ? w.since : now;
      this.waiting.set(p.id, { p, variant: body.variant, since, seen: now, rating: this.core.glickoOf(p.id, body.variant).rating, knows });
      this.tick();
    }
    return this.poll(p);
  }

  poll(p: Player): QuickView {
    const f = this.found.get(p.id);
    if (f) return { status: 'matched', table: f.table };
    const w = this.waiting.get(p.id);
    if (!w) return { status: 'idle', me: this.core.quickMe(p, 'podkidnoy') };
    const now = this.clock.now();
    w.seen = now;
    return { status: 'searching', since: w.since, offerBot: now - w.since >= ONLINE.quickBotOfferMs, me: this.core.quickMe(p, w.variant) };
  }

  cancel(p: Player): { ok: true } {
    this.waiting.delete(p.id);
    const f = this.found.get(p.id);
    if (f && this.core.tableStatus(f.table) === 'waiting') {
      this.core.dropQuick(f.table);
      for (const [id, x] of this.found) if (x.table === f.table) this.found.delete(id);
    }
    this.found.delete(p.id);
    return { ok: true };
  }

  /** «Сыграть с ботом, пока ищем?» — да: из очереди за стол против бота «Средний», без рейтинга. */
  bot(p: Player): QuickView {
    const w = this.waiting.get(p.id);
    if (!w) throw new ApiError('not-waiting');
    this.waiting.delete(p.id);
    const { id } = this.core.createQuick(p, null, w.variant, w.knows ? 'queue' : 'free');
    this.found.set(p.id, { at: this.clock.now(), table: id });
    return { status: 'matched', table: id };
  }

  /** Подбор пар и уборка — раз в секунду таймером и при входе в очередь. */
  tick(): void {
    const now = this.clock.now();
    for (const [id, w] of this.waiting) if (now - w.seen > STALE_MS) this.waiting.delete(id);
    for (const [id, f] of this.found) {
      if (now - f.at > JOIN_MS && this.core.tableStatus(f.table) === 'waiting') this.core.dropQuick(f.table);
      if (this.core.tableStatus(f.table) !== 'waiting' && now - f.at > JOIN_MS) this.found.delete(id);
    }
    const list = [...this.waiting.values()].sort((a, b) => a.since - b.since);
    const used = new Set<number>();
    for (const a of list) {
      if (used.has(a.p.id)) continue;
      const win = (w: Waiting) => WINDOW + (WIDEN * (now - w.since)) / 1000;
      let best: Waiting | null = null;
      for (const b of list) {
        if (b === a || used.has(b.p.id) || b.variant !== a.variant) continue;
        const d = Math.abs(a.rating - b.rating);
        if (d > Math.max(win(a), win(b))) continue;
        if (!best || d < Math.abs(a.rating - best.rating)) best = b;
      }
      if (!best) continue;
      used.add(a.p.id);
      used.add(best.p.id);
      this.waiting.delete(a.p.id);
      this.waiting.delete(best.p.id);
      const { id } = this.core.createQuick(a.p, best.p.id, a.variant, a.knows && best.knows ? 'queue' : 'free');
      this.found.set(a.p.id, { at: now, table: id });
      this.found.set(best.p.id, { at: now, table: id });
    }
  }

  get size() { return this.waiting.size; }
}
