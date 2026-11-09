// Стол онлайн на телефоне (docs/02-architecture.md, «Как ходят действия»): вид места приходит по
// WebSocket, а если его нет — опросом раз в 1,5 с (как в «Нардах»: WebSocket — ускоритель). Каждый
// увиденный вид запоминается для проверки колоды после партии. Без React: экран подписывается.
import type { Action, Observation } from '../engine';
import type { ServerMessage, TableView } from './protocol';
import { Net, NetError, isNetDown } from './net';
import { verifyGame } from './verify';
import type { DeckCheck } from './verify';

export const POLL_MS = 1500;

/** Зерно и отпечаток, которые телефон отдал за этот стол, — по номеру партии. */
export interface MySeed { game: number; seed: string; commit: string }

export class OnlineTable {
  view: TableView | null = null;
  check: DeckCheck | null = null;
  down = false;
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ws: WebSocket | null = null;
  private stopped = false;
  private readonly seen = new Map<number, Observation[]>();
  private readonly seeds = new Map<number, MySeed>();
  private sending = false;

  constructor(readonly net: Net, readonly id: string, private readonly sockets: boolean = typeof WebSocket !== 'undefined') {}

  on(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  private emit() { for (const f of this.listeners) f(); }

  remember(s: MySeed) { this.seeds.set(s.game, s); }
  /** Зерно, которое телефон отдал за партию `game`: пересесть до начала — с ним же. */
  seedOf(game: number): MySeed | null { return this.seeds.get(game) ?? null; }

  start(): void {
    this.stopped = false;
    void this.tick();
    if (this.sockets) void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ws?.close();
    this.ws = null;
  }

  /** Новый вид: только если он новее; запомнить наблюдение; после партии — проверить колоду. */
  set(t: TableView): void {
    if (this.view && t.version <= this.view.version && t.game?.no === this.view.game?.no) return;
    this.view = t;
    const g = t.game;
    if (g?.view) {
      const list = this.seen.get(g.no) ?? [];
      const last = list[list.length - 1];
      if (!last || JSON.stringify(last) !== JSON.stringify(g.view)) list.push(g.view);
      this.seen.set(g.no, list);
    }
    if (g?.proof && g.result) {
      const mine = this.seeds.get(g.no);
      this.check = mine
        ? verifyGame(g.proof, { seat: t.you, seed: mine.seed, commit: mine.commit, variant: t.variant, seats: t.seats.length, order: t.order ?? 'free' }, this.seen.get(g.no) ?? [])
        : null;
    } else this.check = null;
    this.emit();
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    try {
      const r = await this.net.poll(this.id, this.view?.version);
      if ('table' in r) this.set(r.table);
      if (this.down) { this.down = false; this.emit(); }
    } catch (e) {
      if (isNetDown(e) && !this.down) { this.down = true; this.emit(); }
    }
    if (!this.stopped) this.timer = setTimeout(() => void this.tick(), POLL_MS);
  }

  private async connect(): Promise<void> {
    const key = await this.net.key();
    if (!key || this.stopped) return;
    try {
      const ws = new WebSocket(this.net.liveUrl);
      this.ws = ws;
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', key, v: this.net.version, table: this.id }));
      ws.onmessage = ev => {
        try {
          const m = JSON.parse(String(ev.data)) as ServerMessage;
          if (m.t === 'state') this.set(m.table);
        } catch { /* не наше сообщение — опрос всё равно идёт */ }
      };
      ws.onclose = () => { if (this.ws === ws) this.ws = null; };
    } catch { /* без WebSocket — опросом */ }
  }

  /** Действие с номером. Кто-то успел раньше (`stale`) — свежий вид, действие отменено. */
  async act(a: Action): Promise<string | null> {
    const g = this.view?.game;
    if (!g || this.sending) return null;
    this.sending = true;
    try {
      await this.net.act(this.id, g.no, g.n, a);
      const r = await this.net.poll(this.id, this.view?.version);
      if ('table' in r) this.set(r.table);
      return null;
    } catch (e) {
      if (e instanceof NetError) {
        if (e.body.table) this.set(e.body.table);
        return e.kind === 'illegal' ? e.body.reason ?? 'illegal' : e.kind;
      }
      return 'server';
    } finally {
      this.sending = false;
    }
  }
}
