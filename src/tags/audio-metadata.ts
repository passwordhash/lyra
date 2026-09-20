/**
 * Шим @missingcore/audio-metadata: библиотека ждёт legacy-функции expo-file-system
 * (getInfoAsync/readAsStringAsync) на главном входе, а с SDK 54 они переехали в
 * 'expo-file-system/legacy'. Подкладываем их в объект экспорта, который библиотека
 * уже захватила по ссылке. Убрать, когда библиотека освоит новый API.
 *
 * В Node (самопроверка scripts/check-tags.ts) expo-file-system тянет react-native
 * и не резолвится — тогда библиотека берёт node:fs сама.
 */
try {
  const main = require('expo-file-system') as Record<string, unknown>;
  if (typeof main.getInfoAsync !== 'function') {
    const legacy = require('expo-file-system/legacy') as Record<string, unknown>;
    main.getInfoAsync = legacy.getInfoAsync;
    main.readAsStringAsync = legacy.readAsStringAsync;
  }
} catch {
  // Node: библиотека возьмёт node:fs.
}

export { getAudioMetadata } from '@missingcore/audio-metadata';
