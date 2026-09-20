/**
 * Ядро рескана библиотеки (#8). IO инъецируется: в приложении — нативный
 * модуль папки + тег-парсер (src/sync/index.ts), в самопроверке — моки
 * (scripts/check-sync.ts). Семантика — решение «Семантика синхронизации
 * библиотеки с папкой» (https://github.com/passwordhash/lyra/issues/8).
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import * as repo from '../db/repo';
import type { TrackTags } from '../tags';

export interface SyncIo {
  /** Листинг подключённой папки: ошибка = abort рескана, БД не трогаем. */
  listTracks(): Promise<{ path: string; url: string; size: number; mtime: number }[]>;
  /** Теги аудиофайла; ошибка/null = файл пропускается с записью в лог. */
  getTags(url: string): Promise<TrackTags | null>;
  /** Обложка → Caches/covers/<albumId>.jpg, возвращает путь (#7.5). */
  saveCover(albumId: number, artwork: string): Promise<string>;
  /** Удалить файл обложки опустевшего альбома. */
  deleteFile(path: string): Promise<void>;
}

/** Рескан прерван до изменения БД (ошибка scope или листинга — #8). */
export class SyncAborted extends Error {}

export type RescanResult = { added: number; updated: number; deleted: number };

export async function runRescan(db: SQLiteDatabase, io: SyncIo): Promise<RescanResult> {
  const folder = await repo.getFolder(db);
  if (!folder) return { added: 0, updated: 0, deleted: 0 };

  // Прелюдия: листинг. Любая ошибка здесь — abort без изменений БД (#8).
  let files: { path: string; url: string; size: number; mtime: number }[];
  try {
    files = await io.listTracks();
  } catch (e) {
    throw new SyncAborted(`listTracks: ${String(e)}`);
  }
  const byPath = new Map(files.map((f) => [f.path, f]));

  const at = new Date().toISOString();
  const sigs = await repo.listTrackSignatures(db);
  const removed = sigs.filter((s) => !byPath.has(s.path));
  const changed = sigs.filter((s) => {
    const f = byPath.get(s.path);
    return f !== undefined && (f.size !== s.size || f.mtime !== s.mtime);
  });

  // Альбомы, потерявшие треки (удаление/перегруппировка): обложка пересчитается в конце.
  const touchedAlbums = new Set<number>();

  // Удаление — жёсткое, точка уборки: каскад чистит плейлисты/очередь,
  // deleteTracks вычищает track_order и сбрасывает now_playing (#8, #6).
  if (removed.length) {
    for (const r of removed) if (r.album_id !== null) touchedAlbums.add(r.album_id);
    await repo.deleteTracks(db, removed.map((r) => r.id));
  }

  await repo.markTracksSeen(
    db,
    sigs.filter((s) => !removed.includes(s)).map((s) => s.id),
    at,
  );

  // Изменённые (path тот же, size/mtime изменились): полное перечитывание (#8).
  let updated = 0;
  for (const sig of changed) {
    const file = byPath.get(sig.path)!;
    try {
      const tags = await io.getTags(file.url);
      if (!tags) throw new Error('теги не прочитаны');
      if (sig.album_id !== null) touchedAlbums.add(sig.album_id);
      const { albumId, artworkPath } = await resolveAlbum(db, io, tags, true);
      await repo.updateTrack(db, sig.id, {
        ...tagFields(baseName(file.path), tags, albumId, artworkPath),
        filename: baseName(file.path),
        size: file.size,
        mtime: file.mtime,
      });
      updated += 1;
    } catch (e) {
      // Битый/неподдерживаемый файл — пропускаем, пишем в лог; строка в БД
      // остаётся со старым size/mtime, следующий рескан повторит попытку.
      console.warn(`[sync] пропущен ${sig.path}: ${String(e)}`);
    }
  }

  // Новые файлы: импорт сразу, dataless включительно (чтение тегов качает файл) (#8).
  const known = new Set(sigs.map((s) => s.path));
  let added = 0;
  for (const file of files) {
    if (known.has(file.path)) continue;
    try {
      const tags = await io.getTags(file.url);
      if (!tags) throw new Error('теги не прочитаны');
      const { albumId, artworkPath } = await resolveAlbum(db, io, tags, false);
      const trackId = await repo.insertTrack(db, {
        folderId: folder.id,
        path: file.path,
        filename: baseName(file.path),
        size: file.size,
        mtime: file.mtime,
        ...tagFields(baseName(file.path), tags, albumId, artworkPath),
      });
      // Заданный ручной порядок: новый трек дописывается в конец (#8).
      if (albumId !== null) await repo.appendAlbumTrackOrder(db, albumId, trackId);
      added += 1;
    } catch (e) {
      console.warn(`[sync] пропущен ${file.path}: ${String(e)}`);
    }
  }

  // Обложки альбомов, потерявших треки, — на первую оставшуюся (#8); осиротевшие
  // файлы обложек и пустые альбомы (вместе с их обложкой) чистим с диска.
  const staleCovers: string[] = [];
  for (const albumId of touchedAlbums) {
    const orphan = await repo.recomputeAlbumArtwork(db, albumId);
    if (orphan) staleCovers.push(orphan);
  }
  staleCovers.push(...(await repo.cleanupEmptyAlbums(db)));
  for (const cover of staleCovers) {
    try {
      await io.deleteFile(cover);
    } catch {
      // файл обложки мог уже исчезнуть — не мешает рескану
    }
  }

  await repo.setFolderLastScan(db, at);
  return { added, updated, deleted: removed.length };
}

/**
 * Альбом и обложка для тегов трека. Альбом — только при теге album (#7.3).
 * Обложка пишется, если у трека есть artwork: для нового импорта — лишь когда
 * у альбома ещё нет обложки (первая найденная, #7.5), при перечитывании —
 * перезаписывается (#8).
 */
async function resolveAlbum(
  db: SQLiteDatabase,
  io: SyncIo,
  tags: TrackTags,
  overwriteCover: boolean,
): Promise<{ albumId: number | null; artworkPath: string | null }> {
  const albumId = tags.album
    ? await repo.findOrCreateAlbum(db, tags.album, tags.albumArtist ?? tags.artist ?? '', tags.year)
    : null;
  if (albumId === null || !tags.artwork) return { albumId, artworkPath: null };
  const album = (await repo.getAlbum(db, albumId))!;
  if (album.artwork_path && !overwriteCover) return { albumId, artworkPath: album.artwork_path };
  const path = await io.saveCover(albumId, tags.artwork);
  await repo.setAlbumArtworkIfMissing(db, albumId, path);
  return { albumId, artworkPath: path };
}

function tagFields(
  filenameBase: string,
  tags: TrackTags,
  albumId: number | null,
  artworkPath: string | null,
) {
  return {
    title: tags.title ?? filenameBase,
    artist: tags.artist,
    albumArtist: tags.albumArtist,
    albumId,
    trackNo: tags.trackNo,
    discNo: tags.discNo,
    year: tags.year,
    duration: tags.duration,
    format: tags.format,
    artworkPath,
  };
}

/** «Подпапка/трек.m4a» → «трек»: заглушка title для треков без тега. */
function baseName(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '');
}
