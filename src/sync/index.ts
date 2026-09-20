/**
 * Рескан библиотеки с реальным IO: security scope из нативного модуля (#3,
 * #16), листинг, теги (#17), обложки. Триггеры (#8): запуск приложения
 * (App.tsx) и pull-to-refresh экранов библиотеки. Повторный вызов во время
 * идущего рескана возвращает тот же промис.
 */
import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import folderAccess from '../../modules/lyra-folder-access';
import { getTags, saveCover } from '../tags';
import { runRescan, SyncAborted, type RescanResult, type SyncIo } from './core';

export { SyncAborted, type RescanResult } from './core';

let inFlight: Promise<RescanResult> | null = null;

const syncingListeners = new Set<() => void>();

/** Идёт ли рескан — для спиннера у заголовка (#9). */
export function isSyncing(): boolean {
  return inFlight !== null;
}

/** Подписка на старт/конец рескана (useSyncExternalStore в UI). */
export function onSyncingChange(cb: () => void): () => void {
  syncingListeners.add(cb);
  return () => {
    syncingListeners.delete(cb);
  };
}

function notifySyncing(): void {
  for (const cb of syncingListeners) cb();
}

/**
 * Рескан. Отсутствие папки — no-op; ошибка восстановления scope — abort (#8).
 * Ошибки не глотаются: вызывающий решает (триггеры глушат — «ошибок рескана
 * без спец-UI», #9).
 */
export async function rescanLibrary(db: SQLiteDatabase): Promise<RescanResult> {
  if (inFlight) return inFlight;
  inFlight = (async (): Promise<RescanResult> => {
    // Папка не восстановилась по bookmark — abort без изменений БД (#8).
    if (!(await folderAccess.getFolder())) throw new SyncAborted('Папка не подключена или bookmark недоступен');
    const io: SyncIo = {
      listTracks: () => folderAccess.listTracks(),
      getTags,
      saveCover,
      deleteFile: async (path) => {
        try {
          new File(path).delete();
        } catch {
          // обложка могла уже исчезнуть — не мешает рескану
        }
      },
    };
    return runRescan(db, io);
  })().finally(() => {
    inFlight = null;
    notifySyncing();
  });
  notifySyncing();
  return inFlight;
}
