// из nardy: server/src/live.ts @ 1d2bdff — WebSocket: первое сообщение телефона `hello` с ключом,
// дальше `ping`. Своё (ADR 0008): соединение помнит место, и каждое изменение стола рассылается
// каждому соединению **его** видом — чужих рук в нём нет. WebSocket — только ускоритель: то же
// отдаёт `GET /v1/tables/:id?since=`.
import { MIN_APP, compareVersions, isChat, isVersion } from '../../src/state/protocol';
import type { ChatKey, ErrorCode, ServerMessage } from '../../src/state/protocol';
import { keyHash } from './core';
import type { Core } from './core';
import { ApiError } from './errors';

export interface Socket {
  send(text: string): unknown;
  close(code?: number, reason?: string): void;
}

interface Conn { socket: Socket; table?: string; seat?: number; key?: string; sent?: number }

const PER_KEY = 4;
export const WS_MAX = 2048;

export class Live {
  private readonly conns = new Map<Socket, Conn>();
  private readonly byTable = new Map<string, Set<Conn>>();

  constructor(private readonly core: () => Core) {}

  open(socket: Socket): void { this.conns.set(socket, { socket }); }

  close(socket: Socket): void {
    const c = this.conns.get(socket);
    this.conns.delete(socket);
    if (c?.table) this.byTable.get(c.table)?.delete(c);
  }

  /** Стол изменился: каждому соединению — его вид. */
  changed(tableId: string): void {
    const set = this.byTable.get(tableId);
    if (!set?.size) return;
    const core = this.core();
    for (const c of set) {
      const table = core.view(tableId, c.seat!);
      if (c.sent === table.version) continue;
      c.sent = table.version;
      c.socket.send(JSON.stringify({ t: 'state', table } satisfies ServerMessage));
    }
  }

  /** Фраза: всем за столом, без текста от игрока — только ключ из списка. */
  say(tableId: string, seat: number, msg: ChatKey): void {
    for (const c of this.byTable.get(tableId) ?? []) c.socket.send(JSON.stringify({ t: 'say', seat, msg } satisfies ServerMessage));
  }

  message(socket: Socket, raw: string | Uint8Array): void {
    const c = this.conns.get(socket);
    if (!c) return;
    const send = (m: ServerMessage) => { socket.send(JSON.stringify(m)); };
    const fail = (code: ErrorCode, need?: string) => {
      send(need ? { t: 'error', code, need } : { t: 'error', code });
      socket.close(4000, code);
    };
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    if (text.length > WS_MAX) return fail('bad-body');
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text);
      if (!msg || typeof msg !== 'object') throw new Error('object');
    } catch {
      return fail('bad-body');
    }
    const core = this.core();
    if (msg.t === 'ping') {
      if (c.table !== undefined && c.seat !== undefined) core.touch(c.table, c.seat);
      return send({ t: 'pong', now: core.now() });
    }
    if (msg.t !== 'hello' || c.table) return fail('bad-body');
    if (!isVersion(msg.v) || compareVersions(msg.v, MIN_APP) < 0) return fail('upgrade', MIN_APP);
    try {
      const player = core.player(typeof msg.key === 'string' ? msg.key : null);
      const key = keyHash(msg.key as string);
      if ([...this.conns.values()].filter(x => x.key === key).length >= PER_KEY) return fail('too-fast');
      const { table, seat } = core.seatOf(player, msg.table);
      Object.assign(c, { table, seat, key });
      let set = this.byTable.get(table);
      if (!set) this.byTable.set(table, set = new Set());
      set.add(c);
      core.touch(table, seat);
      const view = core.view(table, seat);
      c.sent = view.version;
      send({ t: 'state', table: view });
    } catch (e) {
      if (e instanceof ApiError) return fail(e.code);
      console.error('live hello:', e);
      return fail('server');
    }
  }

  get size() { return this.conns.size; }
}

export { isChat };
