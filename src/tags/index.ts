/**
 * Тег-парсер библиотеки (#17). getTags — по решению «Парсинг метатегов» (#4),
 * saveCover — по «Схеме данных библиотеки» (#7). MVP: @missingcore/audio-metadata
 * (чистый JS). Контракт getTags стабилен — нативный модуль поверх SwiftTagLib.cpp
 * заменит реализацию без изменений вызывающего кода.
 */
import { getAudioMetadata } from './audio-metadata';
import { METADATA_FIELDS, normalizeTags, type RawMetadata, type TrackTags } from './normalize';

export type { TrackTags } from './normalize';

/** Прочитать теги аудиофайла (mp3/flac/m4a). Кидаёт ошибку чтения — caller решает (#8). */
export async function getTags(url: string): Promise<TrackTags | null> {
  const ext = url.split('.').pop()?.toLowerCase() ?? '';
  if (ext !== 'mp3' && ext !== 'flac' && ext !== 'm4a') return null;
  const { fileType, metadata } = await getAudioMetadata(
    url as Parameters<typeof getAudioMetadata>[0],
    [...METADATA_FIELDS],
  );
  return normalizeTags(fileType, metadata as RawMetadata);
}

/** Записать обложку альбома в кэш (Caches/covers/<albumId>.jpg), вернуть путь для БД (#7). */
export async function saveCover(albumId: number, artwork: string): Promise<string> {
  // Ленивый require: expo-file-system тянет react-native и недоступен в node-самопроверке.
  const { Directory, File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  const covers = new Directory(Paths.cache, 'covers');
  if (!covers.exists) covers.create({ idempotent: true });
  const file = new File(covers, `${albumId}.jpg`);
  const base64 = artwork.slice(artwork.indexOf(';base64,') + ';base64,'.length);
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}
