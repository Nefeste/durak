// Сборка сервера из частей (как у «Нард», nardy: server/src/app.ts @ 1d2bdff): база, ядро, очередь,
// HTTP, WebSocket. `main.ts` запускает её с настройками из окружения, тесты — с поддельными часами.
import { randomBytes } from 'node:crypto';
import type { Server, ServerWebSocket } from 'bun';
import { realClock } from './clock';
import type { Clock } from './clock';
import { Core } from './core';
import { openDb } from './db';
import { Http, errorResponse } from './http';
import { Live, WS_MAX } from './live';
import { QuickQueue } from './quick';

export interface AppOptions {
  db: string;
  clock?: Clock;
  certSha256?: string;
  trustProxy?: boolean;
  random?: (bytes: number) => Uint8Array;
}

export function createApp(o: AppOptions) {
  const db = openDb(o.db);
  const clock = o.clock ?? realClock;
  let core: Core;
  const live = new Live(() => core);
  core = new Core({ db, clock, random: o.random ?? (n => new Uint8Array(randomBytes(n))), changed: id => live.changed(id) });
  const quick = new QuickQueue(core, clock);
  const http = new Http(core, quick, live, { certSha256: o.certSha256 });

  const ipOf = (req: Request, server: Server<undefined>) => {
    if (o.trustProxy) {
      const f = req.headers.get('x-forwarded-for');
      if (f) return f.split(',')[0].trim();
    }
    return server.requestIP(req)?.address ?? '?';
  };

  function serve(port: number, hostname = '127.0.0.1') {
    const restored = core.restore();
    const server = Bun.serve<undefined>({
      port, hostname,
      fetch(req, srv) {
        const url = new URL(req.url);
        if (url.pathname === '/v1/live') {
          if (srv.upgrade(req, { data: undefined })) return undefined;
          return errorResponse('bad-body');
        }
        return http.handle(req, ipOf(req, srv));
      },
      websocket: {
        maxPayloadLength: WS_MAX,
        idleTimeout: 30,
        open: (ws: ServerWebSocket<undefined>) => live.open(ws),
        message: (ws: ServerWebSocket<undefined>, m: string | Buffer) => live.message(ws, typeof m === 'string' ? m : new Uint8Array(m)),
        close: (ws: ServerWebSocket<undefined>) => live.close(ws),
      },
    });
    const presence = setInterval(() => { try { core.sweepPresence(); } catch (e) { console.error('presence:', e); } }, 5000);
    const pairing = setInterval(() => { try { quick.tick(); } catch (e) { console.error('quick:', e); } }, 1000);
    const tidy = () => { try { core.housekeeping(); } catch (e) { console.error('housekeeping:', e); } };
    const hourly = setInterval(tidy, 3_600_000);
    tidy();
    return {
      server, restored,
      stop() {
        clearInterval(presence);
        clearInterval(pairing);
        clearInterval(hourly);
        server.stop(true);
      },
    };
  }

  return { db, core, http, live, quick, serve };
}
