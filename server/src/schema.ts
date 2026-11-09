// Миграции базы (docs/04-data-model.md, «Сервер»): номер версии — `PRAGMA user_version`.
// Новая миграция — только в конец списка; старые не меняются.
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE players (
    id INTEGER PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    tag TEXT UNIQUE,
    created INTEGER NOT NULL,
    seen INTEGER NOT NULL
  );
  CREATE TABLE ratings (
    player INTEGER NOT NULL REFERENCES players(id),
    variant TEXT NOT NULL,
    rating REAL NOT NULL,
    rd REAL NOT NULL,
    vol REAL NOT NULL,
    games INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (player, variant)
  );
  CREATE TABLE tables (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE,
    kind TEXT NOT NULL,
    host INTEGER NOT NULL REFERENCES players(id),
    rid TEXT,
    variant TEXT NOT NULL,
    seats INTEGER NOT NULL,
    bots TEXT,
    status TEXT NOT NULL,
    game INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL,
    closed INTEGER
  );
  CREATE INDEX tables_host ON tables(host, rid);
  CREATE TABLE table_seats (
    table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    seat INTEGER NOT NULL,
    player INTEGER REFERENCES players(id),
    bot TEXT,
    PRIMARY KEY (table_id, seat)
  );
  CREATE INDEX seats_player ON table_seats(player);
  CREATE TABLE games (
    table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    no INTEGER NOT NULL,
    server_seed TEXT NOT NULL,
    commit_ TEXT NOT NULL,
    seeds TEXT NOT NULL,
    first INTEGER,
    actions TEXT NOT NULL DEFAULT '[]',
    banks TEXT NOT NULL DEFAULT '[]',
    rematch TEXT NOT NULL DEFAULT '[]',
    result TEXT,
    started INTEGER,
    finished INTEGER,
    PRIMARY KEY (table_id, no)
  );
  CREATE TABLE reports (at INTEGER NOT NULL, body TEXT NOT NULL);
  `,
  // 2: настройка стола «Подкидывать» (docs/08-rules.md, п. 4.3; ADR 0013). Столы до неё играли «кто успел».
  `ALTER TABLE tables ADD COLUMN throw_order TEXT NOT NULL DEFAULT 'free';`,
];
