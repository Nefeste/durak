// Маршруты HTTP (docs/03-server-api.md). Устройство — как у «Нард» (nardy: server/src/http.ts @ 1d2bdff):
// ключ устройства в `Authorization`, версия игры в `X-Durak-Version`, пределы частоты, ошибки кодами.
import { MIN_APP, PROTOCOL, compareVersions, isChat, isVersion, ERRORS } from '../../src/state/protocol';
import type { ErrorCode } from '../../src/state/protocol';
import { RULES } from '../../src/engine';
import { keyHash } from './core';
import type { Core, Player } from './core';
import { ApiError } from './errors';
import { Limits } from './limits';
import type { Live } from './live';
import type { QuickQueue } from './quick';
import { assetLinks, fairPage, invitePage, notFound } from './pages';

export interface HttpOptions {
  certSha256?: string;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-durak-version, x-durak-rules',
  'access-control-max-age': '86400',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS } });
const empty = (status = 204) => new Response(null, { status, headers: CORS });
export const errorResponse = (code: ErrorCode, extra: Record<string, unknown> = {}) => json(ERRORS[code], { error: code, ...extra });

const BODY_MAX = 8 * 1024;
const REPORT_MAX = 16 * 1024;

type Route = { method: string; re: RegExp; run: (c: Ctx, m: RegExpMatchArray) => Promise<Response> | Response };
interface Ctx { req: Request; url: URL; ip: string }

export class Http {
  private readonly routes: Route[];
  private readonly limits: Limits;

  constructor(private readonly core: Core, quick: QuickQueue, live: Live, private readonly opts: HttpOptions = {}) {
    this.limits = new Limits(() => core.now());
    /** Телефон знает очередь атакующих (ADR 0013): шлёт `x-durak-rules: durak-rules-v2`. */
    const knowsQueue = (c: Ctx) => c.req.headers.get('x-durak-rules') === RULES.id;
    const r = (method: string, path: string, run: Route['run']): Route => ({ method, re: new RegExp(`^${path}$`), run });
    const id = '(t_[a-z0-9]{12})';
    this.routes = [
      r('GET', '/v1/ping', () => json(200, { ok: true, v: PROTOCOL, now: core.now() })),
      r('POST', '/v1/device', c => {
        this.limits.take(`device:${c.ip}`, 10, 3_600_000);
        return json(200, { key: core.newKey() });
      }),
      r('POST', '/v1/session', async c => {
        const key = this.key(c);
        this.version(c);
        this.limits.take(`key:${keyHash(key)}`, 40, 2000);
        return json(200, core.session(key, (await this.body(c)).name));
      }),
      r('POST', '/v1/profile/delete', c => {
        const me = this.me(c);
        quick.cancel(me);
        core.deletePlayer(me.id);
        return json(200, { ok: true });
      }),
      r('POST', '/v1/report', async c => {
        const key = this.key(c);
        this.limits.take(`report:${keyHash(key)}`, 5, 3_600_000);
        core.report(await this.body(c, REPORT_MAX));
        return empty();
      }),
      r('POST', '/v1/tables', async c => {
        const me = this.me(c);
        const body = await this.body(c);
        this.limits.take(`create:${me.id}`, 10, 60_000);
        return json(201, { table: core.createTable(me, body) });
      }),
      r('GET', '/v1/tables/code/([A-Za-z0-9]+)', (c, m) => json(200, core.codeInfo(m[1].toUpperCase(), this.me(c)))),
      r('POST', '/v1/tables/join', async c => {
        const me = this.me(c);
        const b = await this.body(c);
        return json(200, { table: core.join(me, { ...b, code: typeof b.code === 'string' ? b.code.toUpperCase() : b.code }, knowsQueue(c)) });
      }),
      r('POST', `/v1/tables/${id}/start`, (c, m) => json(200, { table: core.startBy(this.me(c), m[1]) })),
      r('POST', `/v1/tables/${id}/bot`, async (c, m) => { const me = this.me(c); return json(200, { table: core.setBot(me, m[1], await this.body(c)) }); }),
      r('POST', `/v1/tables/${id}/cancel`, (c, m) => json(200, core.cancel(this.me(c), m[1]))),
      r('POST', `/v1/tables/${id}/act`, async (c, m) => { const me = this.me(c); return json(200, core.act(me, m[1], await this.body(c))); }),
      r('POST', `/v1/tables/${id}/resign`, (c, m) => json(200, core.resign(this.me(c), m[1]))),
      r('POST', `/v1/tables/${id}/rematch`, async (c, m) => { const me = this.me(c); return json(200, { table: core.rematch(me, m[1], await this.body(c)) }); }),
      r('POST', `/v1/tables/${id}/say`, async (c, m) => {
        const me = this.me(c);
        const b = await this.body(c);
        if (!isChat(b.msg)) throw new ApiError('bad-body');
        this.limits.take(`say:${me.id}`, 3, 6000);
        const { table, seat } = core.seatOf(me, m[1]);
        live.say(table, seat, b.msg);
        return empty();
      }),
      r('GET', `/v1/tables/${id}/proof`, (c, m) => {
        const game = Number(c.url.searchParams.get('game') ?? 'x');
        if (!Number.isInteger(game) || game < 0) throw new ApiError('bad-body');
        return json(200, core.proof(m[1], game));
      }),
      r('GET', `/v1/tables/${id}`, (c, m) => {
        const me = this.me(c);
        const s = c.url.searchParams.get('since');
        const since = s === null ? null : Number(s);
        if (since !== null && (!Number.isInteger(since) || since < 0)) throw new ApiError('bad-body');
        return json(200, core.poll(me, m[1], since));
      }),
      r('POST', '/v1/quick', async c => {
        const me = this.me(c);
        this.limits.take(`quick:${me.id}`, 30, 60_000);
        return json(200, quick.join(me, await this.body(c), knowsQueue(c)));
      }),
      r('GET', '/v1/quick', c => json(200, quick.poll(this.me(c)))),
      r('POST', '/v1/quick/cancel', c => json(200, quick.cancel(this.me(c)))),
      r('POST', '/v1/quick/bot', c => json(200, quick.bot(this.me(c)))),
      r('GET', '/', () => new Response(null, { status: 302, headers: { location: 'https://gornitsa.games/' } })),
      r('GET', '/t/([A-Za-z0-9]{6})', (c, m) => invitePage(c.url.host, m[1])),
      r('GET', '/fair', () => fairPage()),
      r('GET', '/privacy', () => new Response(null, { status: 302, headers: { location: 'https://gornitsa.games/privacy.html' } })),
      r('GET', '/\\.well-known/assetlinks\\.json', () => {
        const cert = this.opts.certSha256;
        if (!cert || !/^[0-9a-fA-F]{64}$/.test(cert)) throw new ApiError('no-route');
        return new Response(assetLinks(cert), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' } });
      }),
    ];
  }

  async handle(req: Request, ip: string): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return empty();
    const route = this.routes.find(r => r.method === req.method && r.re.test(url.pathname));
    try {
      if (!route) {
        if (req.method === 'GET' && !url.pathname.startsWith('/v1/')) return notFound();
        throw new ApiError('no-route');
      }
      return await route.run({ req, url, ip }, url.pathname.match(route.re)!);
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(e.code, e.extra);
      console.error(`${req.method} ${url.pathname}:`, e);
      return errorResponse('server');
    }
  }

  private key(c: Ctx): string {
    const m = c.req.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
    if (!m) throw new ApiError('no-key');
    return m[1];
  }

  private version(c: Ctx): void {
    const v = c.req.headers.get('x-durak-version');
    if (!isVersion(v) || compareVersions(v, MIN_APP) < 0) throw new ApiError('upgrade', { need: MIN_APP });
  }

  private me(c: Ctx): Player {
    const key = this.key(c);
    this.version(c);
    this.limits.take(`key:${keyHash(key)}`, 40, 2000);
    return this.core.player(key);
  }

  private async body(c: Ctx, max = BODY_MAX): Promise<Record<string, unknown>> {
    const len = Number(c.req.headers.get('content-length') ?? 0);
    if (len > max) throw new ApiError('bad-body');
    const text = await c.req.text();
    if (text.length > max) throw new ApiError('bad-body');
    try {
      const v = JSON.parse(text || '{}');
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('object');
      return v;
    } catch {
      throw new ApiError('bad-body');
    }
  }
}
