// Сервер «Козыря»: `bun server/src/main.ts` (как у «Нард», nardy: server/src/main.ts @ 1d2bdff).
// Окружение: DURAK_DB (файл базы), HOST, PORT, DURAK_TRUST_PROXY=1 (за nginx). Отпечаток сертификата
// подписи для App Links — DURAK_CERT_SHA256 или файл `cert.sha256` рядом со сборкой (его кладёт в
// ветку `vps` задание server.yml из переменной репозитория).
import { PROTOCOL } from '../../src/state/protocol';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createApp } from './app';

const env = process.env;
const app = createApp({
  db: env.DURAK_DB ?? 'durak.db',
  trustProxy: env.DURAK_TRUST_PROXY === '1',
  certSha256: env.DURAK_CERT_SHA256 || certFile(),
});

function certFile(): string | undefined {
  const f = join(dirname(process.argv[1] ?? '.'), 'cert.sha256');
  return existsSync(f) ? readFileSync(f, 'utf8').trim() || undefined : undefined;
}
const port = Number(env.PORT ?? 8792), host = env.HOST ?? '127.0.0.1';
const { restored, stop } = app.serve(port, host);
console.log(`durak ${PROTOCOL}: http://${host}:${port}, база ${env.DURAK_DB ?? 'durak.db'}, идущих партий ${restored}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    stop();
    app.db.close();
    process.exit(0);
  });
}
