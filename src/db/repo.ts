import type { SQLiteDatabase } from 'expo-sqlite';

// Решения: «Схема данных библиотеки» https://github.com/passwordhash/lyra/issues/7
// и «Семантика синхронизации библиотеки с папкой» https://github.com/passwordhash/lyra/issues/8

export type Folder = {
  id: number;
  bookmark: Uint8Array;
  display_name: string;
  last_scan_at: string | null;
};

export type Track = {
  id: number;
  folder_id: number;
  path: string;
  filename: string;
  size: number;
  mtime: number;
  title: string;
  artist: string | null;
  album_artist: string | null;
  album_id: number | null;
  track_no: number | null;
  disc_no: number | null;
  year: number | null;
  duration: number | null;
  format: string;
  artwork_path: string | null;
  search_text: string;
  added_at: string;
  last_seen_at: string;
};

export type Album = {
  id: number;
  title: string;
  album_artist: string;
  year: number | null;
  artwork_path: string | null;
  track_order: string | null;
};

export type Playlist = {
  id: number;
  title: string;
  search_text: string;
  created_at: string;
  track_count?: number;
};

export type NewTrack = {
  folderId: number;
  path: string;
  filename: string;
  size: number;
  mtime: number;
  title: string;
  artist: string | null;
  albumArtist: string | null;
  albumId: number | null;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
  duration: number | null;
  format: string;
  artworkPath: string | null;
};

export type QueueItemInput = {
  trackId: number;
  sourceKind: string;
  sourceId: number | null;
};

/** Нормализация для поиска (решение #10): нижний регистр, ё→е, без диакритики. */
export function normalizeSearchText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ё/gi, 'е')
    .toLowerCase();
}

const trackSearch = (t: { title: string; artist: string | null; albumArtist: string | null }) =>
  normalizeSearchText([t.title, t.artist, t.albumArtist].filter(Boolean).join(' '));

function chunks<T>(arr: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---- Папка (v1 — одна подключённая папка) ----

export async function getFolder(db: SQLiteDatabase): Promise<Folder | null> {
  return (await db.getFirstAsync('SELECT * FROM folders ORDER BY id LIMIT 1')) ?? null;
}

export async function setFolder(
  db: SQLiteDatabase,
  fields: { bookmark: Uint8Array; displayName: string },
): Promise<number> {
  let id = 0;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM folders');
    const res = await db.runAsync('INSERT INTO folders (bookmark, display_name) VALUES (?, ?)', [
      fields.bookmark,
      fields.displayName,
    ]);
    id = res.lastInsertRowId;
  });
  return id;
}

export async function setFolderLastScan(db: SQLiteDatabase, at: string): Promise<void> {
  await db.runAsync('UPDATE folders SET last_scan_at = ? WHERE id = (SELECT MIN(id) FROM folders)', [at]);
}

/** Полная очистка библиотеки: отключение папки (решение #9). */
export async function clearLibrary(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync(
      'DELETE FROM folders; DELETE FROM albums; DELETE FROM playlists; DELETE FROM queue_items; DELETE FROM state;',
    );
  });
}

// ---- Синхронизация (решение #8; вызывать внутри транзакции рескана) ----

export type TrackSignature = Pick<Track, 'id' | 'path' | 'size' | 'mtime' | 'album_id'>;

/** Снимок известных треков для диффа рескана. */
export async function listTrackSignatures(db: SQLiteDatabase): Promise<TrackSignature[]> {
  return db.getAllAsync('SELECT id, path, size, mtime, album_id FROM tracks');
}

/** Ключ группировки альбома: (title, album_artist; при отсутствии — artist) — решение #7.4. */
export async function findOrCreateAlbum(
  db: SQLiteDatabase,
  title: string,
  albumArtist: string,
  year: number | null = null,
): Promise<number> {
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM albums WHERE title = ? AND album_artist = ?',
    [title, albumArtist],
  );
  if (row) return row.id;
  const res = await db.runAsync('INSERT INTO albums (title, album_artist, year) VALUES (?, ?, ?)', [
    title,
    albumArtist,
    year,
  ]);
  return res.lastInsertRowId;
}

export async function insertTrack(db: SQLiteDatabase, t: NewTrack): Promise<number> {
  const res = await db.runAsync(
    `INSERT INTO tracks (folder_id, path, filename, size, mtime, title, artist, album_artist,
       album_id, track_no, disc_no, year, duration, format, artwork_path, search_text, added_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      t.folderId, t.path, t.filename, t.size, t.mtime, t.title, t.artist, t.albumArtist,
      t.albumId, t.trackNo, t.discNo, t.year, t.duration, t.format, t.artworkPath,
      trackSearch(t), new Date().toISOString(), new Date().toISOString(),
    ],
  );
  return res.lastInsertRowId;
}

/** Полное перечитывание тегов существующего трека (size/mtime изменились) — решение #8. */
export async function updateTrack(
  db: SQLiteDatabase,
  id: number,
  t: Omit<NewTrack, 'folderId' | 'path'>,
): Promise<void> {
  await db.runAsync(
    `UPDATE tracks SET filename = ?, size = ?, mtime = ?, title = ?, artist = ?, album_artist = ?,
       album_id = ?, track_no = ?, disc_no = ?, year = ?, duration = ?, format = ?,
       artwork_path = ?, search_text = ?
     WHERE id = ?`,
    [
      t.filename, t.size, t.mtime, t.title, t.artist, t.albumArtist, t.albumId,
      t.trackNo, t.discNo, t.year, t.duration, t.format, t.artworkPath,
      trackSearch(t), id,
    ],
  );
}

export async function markTracksSeen(db: SQLiteDatabase, ids: number[], at: string): Promise<void> {
  for (const chunk of chunks(ids)) {
    await db.runAsync(
      `UPDATE tracks SET last_seen_at = ? WHERE id IN (${chunk.map(() => '?').join(',')})`,
      [at, ...chunk],
    );
  }
}

/**
 * Удаление треков ресканом: каскад чистит плейлисты и очередь (FK),
 * вычищает удалённые id из ручного track_order альбомов и сбрасывает
 * now_playing, если играющий трек удалён — решения #8 и #6.
 */
export async function deleteTracks(db: SQLiteDatabase, ids: number[]): Promise<void> {
  const idSet = new Set(ids);
  const ordered = await db.getAllAsync<{ id: number; track_order: string }>(
    'SELECT id, track_order FROM albums WHERE track_order IS NOT NULL',
  );
  for (const a of ordered) {
    const order: number[] = JSON.parse(a.track_order);
    const next = order.filter((id) => !idSet.has(id));
    if (next.length !== order.length) {
      await db.runAsync('UPDATE albums SET track_order = ? WHERE id = ?', [
        next.length ? JSON.stringify(next) : null,
        a.id,
      ]);
    }
  }
  for (const chunk of chunks(ids)) {
    await db.runAsync(`DELETE FROM tracks WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk);
  }
  const nowPlaying = await db.getFirstAsync<{ value: string | null }>(
    "SELECT value FROM state WHERE key = 'now_playing_track_id'",
  );
  if (nowPlaying?.value && idSet.has(Number(nowPlaying.value))) {
    await db.runAsync("DELETE FROM state WHERE key = 'now_playing_track_id'");
  }
}

/** Рескан: новый трек дописывается в конец заданного ручного порядка альбома (#8). */
export async function appendAlbumTrackOrder(
  db: SQLiteDatabase,
  albumId: number,
  trackId: number,
): Promise<void> {
  const album = await db.getFirstAsync<{ track_order: string | null }>(
    'SELECT track_order FROM albums WHERE id = ?',
    [albumId],
  );
  if (!album?.track_order) return;
  await db.runAsync('UPDATE albums SET track_order = ? WHERE id = ?', [
    JSON.stringify([...(JSON.parse(album.track_order) as number[]), trackId]),
    albumId,
  ]);
}

/** Обложка альбома = первая найденная среди треков (#7.5); выставляется, только если её ещё нет. */
export async function setAlbumArtworkIfMissing(
  db: SQLiteDatabase,
  albumId: number,
  artworkPath: string,
): Promise<void> {
  await db.runAsync('UPDATE albums SET artwork_path = ? WHERE id = ? AND artwork_path IS NULL', [
    artworkPath,
    albumId,
  ]);
}

/**
 * Пересчёт обложки альбома на первую оставшуюся среди треков (#8). Возвращает
 * прежний путь, если обложка сбросилась в null: файл в кэше осиротел, его
 * надо удалить с диска (сам рескан).
 */
export async function recomputeAlbumArtwork(db: SQLiteDatabase, albumId: number): Promise<string | null> {
  const album = await db.getFirstAsync<{ artwork_path: string | null }>(
    'SELECT artwork_path FROM albums WHERE id = ?',
    [albumId],
  );
  if (!album) return null;
  await db.runAsync(
    `UPDATE albums SET artwork_path =
       (SELECT artwork_path FROM tracks
        WHERE album_id = albums.id AND artwork_path IS NOT NULL ORDER BY id LIMIT 1)
     WHERE id = ?`,
    [albumId],
  );
  const after = await db.getFirstAsync<{ artwork_path: string | null }>(
    'SELECT artwork_path FROM albums WHERE id = ?',
    [albumId],
  );
  return album.artwork_path && !after?.artwork_path ? album.artwork_path : null;
}

/** Удалить опустевшие альбомы (с перегруппировки и удалений), вернуть их обложки для удаления с диска. */
export async function cleanupEmptyAlbums(db: SQLiteDatabase): Promise<string[]> {
  const empty = await db.getAllAsync<{ id: number; artwork_path: string | null }>(
    'SELECT id, artwork_path FROM albums WHERE NOT EXISTS (SELECT 1 FROM tracks WHERE album_id = albums.id)',
  );
  for (const a of empty) {
    await db.runAsync('DELETE FROM albums WHERE id = ?', [a.id]);
  }
  return empty.map((a) => a.artwork_path).filter((p): p is string => p !== null);
}

// ---- Экраны ----

export async function listTracks(db: SQLiteDatabase): Promise<Track[]> {
  return db.getAllAsync('SELECT * FROM tracks ORDER BY title COLLATE NOCASE');
}

export async function countTracks(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM tracks');
  return row?.n ?? 0;
}

export async function getTrack(db: SQLiteDatabase, id: number): Promise<Track | null> {
  return (await db.getFirstAsync('SELECT * FROM tracks WHERE id = ?', [id])) ?? null;
}

/** Треки в заданном порядке (очередь, плейлист, track_order). */
export async function getTracksByIds(db: SQLiteDatabase, ids: number[]): Promise<Track[]> {
  const byId = new Map<number, Track>();
  for (const chunk of chunks(ids)) {
    for (const t of await db.getAllAsync<Track>(
      `SELECT * FROM tracks WHERE id IN (${chunk.map(() => '?').join(',')})`,
      chunk,
    )) {
      byId.set(t.id, t);
    }
  }
  return ids.map((id) => byId.get(id)).filter((t): t is Track => t !== undefined);
}

export async function listAlbums(db: SQLiteDatabase): Promise<Album[]> {
  return db.getAllAsync(
    'SELECT * FROM albums ORDER BY album_artist COLLATE NOCASE, title COLLATE NOCASE',
  );
}

export async function getAlbum(db: SQLiteDatabase, id: number): Promise<Album | null> {
  return (await db.getFirstAsync('SELECT * FROM albums WHERE id = ?', [id])) ?? null;
}

/** Треки альбома: по умолчанию (disc_no, track_no), иначе ручной track_order — решение #7.1. */
export async function getAlbumTracks(db: SQLiteDatabase, albumId: number): Promise<Track[]> {
  const tracks = await db.getAllAsync<Track>(
    `SELECT * FROM tracks WHERE album_id = ?
     ORDER BY disc_no, track_no, filename COLLATE NOCASE`,
    [albumId],
  );
  const album = await getAlbum(db, albumId);
  if (!album?.track_order) return tracks;
  const order: number[] = JSON.parse(album.track_order);
  return order
    .map((id) => tracks.find((t) => t.id === id))
    .filter((t): t is Track => t !== undefined)
    .concat(tracks.filter((t) => !order.includes(t.id)));
}

/** Ручной порядок треков альбома; null возвращает сортировку по умолчанию. */
export async function setAlbumTrackOrder(
  db: SQLiteDatabase,
  albumId: number,
  trackIds: number[] | null,
): Promise<void> {
  await db.runAsync('UPDATE albums SET track_order = ? WHERE id = ?', [
    trackIds && trackIds.length ? JSON.stringify(trackIds) : null,
    albumId,
  ]);
}

// ---- Плейлисты (только ручные) ----

export async function createPlaylist(db: SQLiteDatabase, title: string): Promise<number> {
  const res = await db.runAsync('INSERT INTO playlists (title, search_text, created_at) VALUES (?, ?, ?)', [
    title,
    normalizeSearchText(title),
    new Date().toISOString(),
  ]);
  return res.lastInsertRowId;
}

export async function renamePlaylist(db: SQLiteDatabase, id: number, title: string): Promise<void> {
  await db.runAsync('UPDATE playlists SET title = ?, search_text = ? WHERE id = ?', [
    title,
    normalizeSearchText(title),
    id,
  ]);
}

export async function deletePlaylist(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM playlists WHERE id = ?', [id]);
}

export async function listPlaylists(db: SQLiteDatabase): Promise<Playlist[]> {
  return db.getAllAsync(
    `SELECT p.*, COUNT(pi.track_id) AS track_count
     FROM playlists p LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
     GROUP BY p.id ORDER BY p.created_at, p.id`,
  );
}

export type PlaylistEntry = { position: number } & Track;

export async function getPlaylistTracks(db: SQLiteDatabase, playlistId: number): Promise<PlaylistEntry[]> {
  return db.getAllAsync(
    `SELECT pi.position, t.* FROM playlist_items pi
     JOIN tracks t ON t.id = pi.track_id
     WHERE pi.playlist_id = ? ORDER BY pi.position`,
    [playlistId],
  );
}

export async function addToPlaylist(db: SQLiteDatabase, playlistId: number, trackId: number): Promise<void> {
  await db.runAsync(
    `INSERT INTO playlist_items (playlist_id, track_id, position)
     SELECT ?, ?, COALESCE(MAX(position), -1) + 1 FROM playlist_items WHERE playlist_id = ?`,
    [playlistId, trackId, playlistId],
  );
}

export async function removePlaylistItem(
  db: SQLiteDatabase,
  playlistId: number,
  position: number,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM playlist_items WHERE playlist_id = ? AND position = ?', [
      playlistId,
      position,
    ]);
    await db.runAsync(
      `UPDATE playlist_items SET position = position - 1 WHERE playlist_id = ? AND position > ?`,
      [playlistId, position],
    );
  });
}

// ---- Очередь (персистентная, решение #6) ----

export async function replaceQueue(db: SQLiteDatabase, items: QueueItemInput[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM queue_items');
    for (const [i, item] of items.entries()) {
      await db.runAsync('INSERT INTO queue_items (position, track_id, source_kind, source_id) VALUES (?, ?, ?, ?)', [
        i, item.trackId, item.sourceKind, item.sourceId,
      ]);
    }
  });
}

export async function appendToQueue(db: SQLiteDatabase, item: QueueItemInput): Promise<void> {
  await db.runAsync(
    `INSERT INTO queue_items (position, track_id, source_kind, source_id)
     SELECT COALESCE(MAX(position), -1) + 1, ?, ?, ? FROM queue_items`,
    [item.trackId, item.sourceKind, item.sourceId],
  );
}

/** Вставка «играть следующим» — после текущей позиции и сдвигом остальных. */
export async function insertQueueItemAt(
  db: SQLiteDatabase,
  position: number,
  item: QueueItemInput,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    // position — PK: сдвигаем вверх через временную инверсию в отрицательные, иначе UNIQUE-конфликт
    await db.runAsync('UPDATE queue_items SET position = -position - 1 WHERE position >= ?', [position]);
    await db.runAsync('UPDATE queue_items SET position = -position WHERE position < 0');
    await db.runAsync(
      'INSERT INTO queue_items (position, track_id, source_kind, source_id) VALUES (?, ?, ?, ?)',
      [position, item.trackId, item.sourceKind, item.sourceId],
    );
  });
}

export async function removeQueueItemAt(db: SQLiteDatabase, position: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM queue_items WHERE position = ?', [position]);
    await db.runAsync('UPDATE queue_items SET position = position - 1 WHERE position > ?', [position]);
  });
}

export type QueueEntry = {
  position: number;
  source_kind: string;
  source_id: number | null;
} & Track;

export async function getQueue(db: SQLiteDatabase): Promise<QueueEntry[]> {
  return db.getAllAsync(
    `SELECT q.position, q.source_kind, q.source_id, t.*
     FROM queue_items q JOIN tracks t ON t.id = q.track_id
     ORDER BY q.position`,
  );
}

// ---- Состояние плеера (state, решение #7) ----

export async function getState(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string | null }>('SELECT value FROM state WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setState(db: SQLiteDatabase, key: string, value: string | null): Promise<void> {
  await db.runAsync(
    `INSERT INTO state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}
