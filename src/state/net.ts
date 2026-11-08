// из nardy: src/state/net.ts @ 1d2bdff (ADR 0001) — ключ устройства, повтор безопасных запросов,
// `offline`/`timeout`, «онлайн с 14 лет»; маршруты, заголовок `X-Durak-Version` и типы — свои
// (docs/03-server-api.md). Модуль без React Native: хранилище подставляет вызывающий, поэтому его
// гоняет тест против настоящего сервера под Bun.
import type { Action, Variant } from '../engine';
import type { Level } from '../bot';
import type { ChatKey, CodeInfo, ErrorCode, ProofView, QuickView, TableView } from './protocol';
import { APP_VERSION } from '../version';

/** Адрес сервера; для прогонов против локального — переменная сборки `EXPO_PUBLIC_DURAK_SERVER`. */
export const DEFAULT_SERVER = 'https://durak.gornitsa.games';
export const SERVER = process.env.EXPO_PUBLIC_DURAK_SERVER || DEFAULT_SERVER;

export interface Device { key: string; name: string; tag: string | null }

export interface DeviceStore {
  load(): Promise<Device | null>;
  save(d: Device): Promise<void>;
}

/** `offline` — не достучались; `timeout` — не дождались 12 с; `age` — нет отметки «Мне есть 14 лет». */
export type NetFail = ErrorCode | 'offline' | 'timeout' | 'age';

/** Без отметки «Мне есть 14 лет» (ADR студии 0016) уходят только пинг и удаление профиля. */
export const OPEN_WITHOUT_AGE = ['/v1/ping', '/v1/profile/delete'] as const;

export class NetError extends Error {
  constructor(readonly kind: NetFail, readonly body: { table?: TableView; reason?: string; need?: string; commit?: string } = {}) { super(kind); }
}

export const isNetDown = (e: unknown) => e instanceof NetError && (e.kind === 'offline' || e.kind === 'timeout');

export type PollResult = { unchanged: true } | { table: TableView };

export const netTiming = { timeout: 12_000, retryAfter: 1500 };

export class Net {
  private device: Device | null = null;
  private asking: Promise<Device | null> | null = null;

  constructor(
    readonly base: string,
    private readonly store: DeviceStore,
    readonly version = APP_VERSION,
    readonly adult: () => boolean = () => true,
  ) {}

  get liveUrl(): string { return `${this.base.replace(/^http/, 'ws')}/v1/live`; }

  async saved(): Promise<Device | null> {
    if (this.device) return this.device;
    const d = await this.store.load();
    if (d?.key) this.device = d;
    return this.device;
  }

  /** Ключ устройства: один запрос на всех (урок «Вотчины» — два ключа сиротили профиль). */
  async getDevice(): Promise<Device | null> {
    if (this.device) return this.device;
    this.asking ??= (async () => {
      const saved = await this.store.load();
      if (saved?.key) { this.device = saved; return saved; }
      try {
        const r = await this.request<{ key: string }>('POST', '/v1/device', undefined, '');
        const made: Device = { key: r.key, name: saved?.name ?? '', tag: null };
        await this.store.save(made);
        this.device = made;
        return made;
      } catch {
        return null;
      }
    })().finally(() => { this.asking = null; });
    return this.asking;
  }

  async hello(name: string): Promise<Device> {
    if (!this.adult()) throw new NetError('age');
    const d = await this.getDevice();
    if (!d) throw new NetError('offline');
    const r = await this.request<{ id: number; name: string; tag: string }>('POST', '/v1/session', { name }, undefined, true);
    this.device = { key: d.key, name: r.name, tag: r.tag };
    await this.store.save(this.device);
    return this.device;
  }

  ping = () => this.request<{ ok: true; v: string; now: number }>('GET', '/v1/ping', undefined, '');
  createTable = (variant: Variant, seats: number, bots: Level | null, rid: string) =>
    this.request<{ table: TableView }>('POST', '/v1/tables', { rid, variant, seats, bots }, undefined, true).then(r => r.table);
  codeInfo = (code: string) => this.request<CodeInfo>('GET', `/v1/tables/code/${code}`, undefined, undefined, true);
  join = (code: string, seed: string, commit: string) =>
    this.request<{ table: TableView }>('POST', '/v1/tables/join', { code, seed, commit }, undefined, true).then(r => r.table);
  start = (id: string) => this.request<{ table: TableView }>('POST', `/v1/tables/${id}/start`, {}, undefined, true).then(r => r.table);
  cancel = (id: string) => this.request<{ ok: true }>('POST', `/v1/tables/${id}/cancel`, {}, undefined, true);
  /** Действие с номером: повтор того же — безопасен (сервер ответит тем же). */
  act = (id: string, game: number, n: number, action: Action) =>
    this.request<{ n: number }>('POST', `/v1/tables/${id}/act`, { game, n, action }, undefined, true);
  resign = (id: string) => this.request<{ ok: true }>('POST', `/v1/tables/${id}/resign`, {}, undefined, true);
  rematch = (id: string, seed: string, commit: string) =>
    this.request<{ table: TableView }>('POST', `/v1/tables/${id}/rematch`, { seed, commit }, undefined, true).then(r => r.table);
  /** Фраза не повторяется сама: дубль хуже потери. */
  say = (id: string, msg: ChatKey) => this.request<null>('POST', `/v1/tables/${id}/say`, { msg });
  poll = (id: string, since?: number) => this.request<PollResult>('GET', `/v1/tables/${id}${since === undefined ? '' : `?since=${since}`}`);
  proof = (id: string, game: number) => this.request<ProofView>('GET', `/v1/tables/${id}/proof?game=${game}`, undefined, '', true);
  quickJoin = (variant: Variant) => this.request<QuickView>('POST', '/v1/quick', { variant }, undefined, true);
  quickPoll = () => this.request<QuickView>('GET', '/v1/quick', undefined, undefined, true);
  quickCancel = () => this.request<{ ok: true }>('POST', '/v1/quick/cancel', {}, undefined, true);
  quickBot = () => this.request<QuickView>('POST', '/v1/quick/bot', {}, undefined, true);

  async key(): Promise<string | null> { return this.adult() ? (await this.getDevice())?.key ?? null : null; }

  async request<R>(method: 'GET' | 'POST', path: string, body?: unknown, key?: string, retry = false): Promise<R> {
    if (!this.adult() && !(OPEN_WITHOUT_AGE as readonly string[]).includes(path)) throw new NetError('age');
    try {
      return await this.once<R>(method, path, body, key);
    } catch (e) {
      if (!retry || !isNetDown(e)) throw e;
      await new Promise(r => setTimeout(r, netTiming.retryAfter));
      return await this.once<R>(method, path, body, key);
    }
  }

  private async once<R>(method: 'GET' | 'POST', path: string, body?: unknown, key?: string): Promise<R> {
    const k = key === '' ? '' : key ?? (await this.getDevice())?.key ?? '';
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-durak-version': this.version };
    if (k) headers.authorization = `Bearer ${k}`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), netTiming.timeout);
    let res: Response;
    try {
      res = await fetch(this.base + path, { method, headers, signal: ctl.signal, ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}) });
    } catch {
      throw new NetError(ctl.signal.aborted ? 'timeout' : 'offline');
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text().catch(() => '');
    let data: (Record<string, unknown> & { error?: ErrorCode }) | null = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok || data?.error) {
      const kind = (data?.error as ErrorCode | undefined) ?? 'server';
      throw new NetError(kind, {
        table: data?.table as TableView | undefined, reason: data?.reason as string | undefined,
        need: data?.need as string | undefined, commit: data?.commit as string | undefined,
      });
    }
    return data as R;
  }
}

/** 16 случайных байт hex — зерно места и метка черновика стола. */
export const hex16 = (bytes: (n: number) => Uint8Array): string => Array.from(bytes(16), b => b.toString(16).padStart(2, '0')).join('');
