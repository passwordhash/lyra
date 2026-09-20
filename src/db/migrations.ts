import type { SQLiteDatabase } from 'expo-sqlite';

// Миграции схемы библиотеки. Решение: https://github.com/passwordhash/lyra/issues/7
export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE folders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  bookmark     BLOB    NOT NULL,
  display_name TEXT    NOT NULL,
  last_scan_at TEXT
);

CREATE TABLE albums (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  album_artist TEXT    NOT NULL,
  year         INTEGER,
  artwork_path TEXT,
  -- ручной порядок треков: JSON-массив id; NULL = сортировка по умолчанию (disc_no, track_no)
  track_order  TEXT,
  UNIQUE (title, album_artist)
);

CREATE TABLE tracks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id    INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  path         TEXT    NOT NULL UNIQUE,
  filename     TEXT    NOT NULL,
  size         INTEGER NOT NULL,
  mtime        INTEGER NOT NULL,
  title        TEXT    NOT NULL,
  artist       TEXT,
  album_artist TEXT,
  album_id     INTEGER REFERENCES albums(id) ON DELETE SET NULL,
  track_no     INTEGER,
  disc_no      INTEGER,
  year         INTEGER,
  duration     REAL,
  format       TEXT    NOT NULL,
  artwork_path TEXT,
  search_text  TEXT    NOT NULL,
  added_at     TEXT    NOT NULL,
  last_seen_at TEXT    NOT NULL
);
CREATE INDEX tracks_album  ON tracks(album_id);
CREATE INDEX tracks_folder ON tracks(folder_id);

CREATE TABLE playlists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  search_text TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE playlist_items (
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id    INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, position)
);
CREATE INDEX playlist_items_track ON playlist_items(track_id);

CREATE TABLE queue_items (
  position    INTEGER PRIMARY KEY,
  track_id    INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL,
  source_id   INTEGER
);

CREATE TABLE state (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`,
  },
];

/** Накатить недостающие миграции (user_version). */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    await db.withExclusiveTransactionAsync(async () => {
      await db.execAsync(m.sql);
    });
    await db.execAsync(`PRAGMA user_version = ${m.version}`);
  }
}
