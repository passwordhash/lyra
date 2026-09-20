/**
 * Нормализация сырых метатегов в контракт TrackTags (#4, #17).
 * Чистый модуль без expo-импортов — прогоняется самопроверкой в Node
 * (scripts/check-tags.ts).
 */

/**
 * Единый контракт тегов трека: MVP — @missingcore/audio-metadata, позже —
 * нативный Expo-модуль поверх SwiftTagLib.cpp с тем же возвратом (#4).
 */
export interface TrackTags {
  title: string | null;
  artist: string | null;
  albumArtist: string | null;
  album: string | null;
  trackNo: number | null;
  /** MVP: @missingcore номер диска не читает — всегда null; заполнит нативная реализация (#4). */
  discNo: number | null;
  year: number | null;
  /** MVP: длительность парсером не отдаётся — всегда null; появится от плеера или нативной реализации. */
  duration: number | null;
  format: 'mp3' | 'flac' | 'm4a';
  /** Обложка как `data:<mime>;base64,<...>`; при импорте пишется в Caches/covers/<albumId>.jpg (#7). */
  artwork: string | null;
}

/** Ключи AudioMetadata @missingcore, которые запрашиваем у парсера. */
export const METADATA_FIELDS = [
  'name',
  'artist',
  'albumArtist',
  'album',
  'track',
  'year',
  'artwork',
] as const;

/** Сырые метаданные парсера: значения могут отсутствовать и приходят строкой или числом. */
export type RawMetadata = Partial<
  Record<(typeof METADATA_FIELDS)[number], string | number | undefined>
>;

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** «3/12» → 3, «0003» → 3, отсутствие/мусор → null. */
function int(value: unknown): number | null {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isNaN(n) ? null : n;
}

export function normalizeTags(fileType: string, metadata: RawMetadata): TrackTags {
  return {
    title: text(metadata.name),
    artist: text(metadata.artist),
    albumArtist: text(metadata.albumArtist),
    album: text(metadata.album),
    trackNo: int(metadata.track),
    // ponytail: disc у @missingcore нет, длительность он тоже не отдаёт — появятся
    // в нативной реализации поверх SwiftTagLib.cpp (#4) без смены контракта.
    discNo: null,
    duration: null,
    year: int(metadata.year),
    format: fileType === 'mp4' ? 'm4a' : (fileType as TrackTags['format']),
    artwork: text(metadata.artwork),
  };
}
