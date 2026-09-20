import { requireNativeModule } from 'expo-modules-core';

export interface FolderInfo {
  /** Абсолютный file:// URL подключённой папки. */
  url: string;
  /** Имя папки (последний сегмент пути). */
  name: string;
}

export interface TrackFile {
  /** Путь относительно корня папки — идентичность трека при рескане (path+size+mtime). */
  path: string;
  /** Абсолютный file:// URL — для плеера и тег-парсера. */
  url: string;
  /** Размер файла в байтах. */
  size: number;
  /** mtime файла, unix-секунды. */
  mtime: number;
}

type NativeApi = {
  /** Document Picker (open-mode): выбор папки, сохранение bookmark, старт доступа. null — отмена. */
  connectFolder(): Promise<FolderInfo | null>;
  /** Восстановление папки из bookmark между запусками; null — нет сохранённой/недоступна. */
  getFolder(): Promise<FolderInfo | null>;
  /** Стоп доступа и удаление bookmark. */
  disconnectFolder(): Promise<boolean>;
  /** Рекурсивный листинг подключённой папки, только mp3/flac/m4a. */
  listTracks(): Promise<TrackFile[]>;
  /** Абсолютный file:// URL по пути относительно корня; null — папка не подключена/путь вне её. */
  fileUrl(path: string): string | null;
};

/**
 * Нативный модуль доступа к папке библиотеки (iOS).
 * Security scope стартует при connect/getFolder и держится до disconnectFolder.
 */
export default requireNativeModule<NativeApi>('LyraFolderAccess');
