// из nardy: server/src/db.ts @ 1d2bdff
// База: SQLite в режиме WAL, один файл. Миграции — schema.ts.
import { Database } from 'bun:sqlite';
import { MIGRATIONS } from './schema';

export type { Database };

export function openDb(path: string): Database {
  const db = new Database(path, { create: true, strict: true });
  if (path !== ':memory:') db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA busy_timeout = 5000');
  migrate(db);
  return db;
}

export function migrate(db: Database): void {
  const have = (db.query('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (have > MIGRATIONS.length) throw new Error(`база новее сервера: ${have} > ${MIGRATIONS.length}`);
  if (have === MIGRATIONS.length) return;
  db.transaction(() => {
    for (let v = have; v < MIGRATIONS.length; v++) db.exec(MIGRATIONS[v]);
    db.exec(`PRAGMA user_version = ${MIGRATIONS.length}`);
  })();
}
