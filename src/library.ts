/**
 * Подключение/отключение папки и статистика библиотеки для экранов (#14).
 * Bookmark хранит нативный модуль в UserDefaults (#16), в БД папка нужна
 * как владелец треков (folder_id FK) и last_scan_at.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import folderAccess from '../modules/lyra-folder-access';
import * as repo from './db/repo';
import { rescanLibrary } from './sync';

/** Подключить папку (Document Picker). false — пользователь отменил выбор. */
export async function connectFolder(db: SQLiteDatabase): Promise<boolean> {
  const info = await folderAccess.connectFolder();
  if (!info) return false;
  await repo.setFolder(db, { bookmark: new Uint8Array(0), displayName: info.name });
  // Рескан сразу после подключения; ошибки глушим — «без спец-UI» (#9).
  rescanLibrary(db).catch(() => {});
  return true;
}

/** Отключить папку: stop scope + удаление bookmark и полная очистка библиотеки (#8, #9). */
export async function disconnectFolder(db: SQLiteDatabase): Promise<void> {
  await folderAccess.disconnectFolder();
  await repo.clearLibrary(db);
}

export type LibraryStats = {
  /** Имя подключённой папки; null — папки нет. */
  folderName: string | null;
  /** Абсолютный путь подключённой папки; null — папки нет. */
  folderPath: string | null;
  /** Дата последнего успешного рескана (ISO); null — ещё не было. */
  lastScanAt: string | null;
  trackCount: number;
};

export async function libraryStats(db: SQLiteDatabase): Promise<LibraryStats> {
  const folder = await repo.getFolder(db);
  const native = await folderAccess.getFolder();
  return {
    folderName: folder?.display_name ?? null,
    folderPath: native ? decodeURIComponent(new URL(native.url).pathname) : null,
    lastScanAt: folder?.last_scan_at ?? null,
    trackCount: await repo.countTracks(db),
  };
}
