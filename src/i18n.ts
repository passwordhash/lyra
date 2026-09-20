/**
 * i18n RU/EN (тикет #15): i18next + react-i18next, системная локаль по умолчанию,
 * ручной override «Системный / Русский / English» из настроек (#9) — хранится в
 * state-таблице БД, применяется на запуске и сразу при выборе.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { initDb } from './db';
import * as repo from './db/repo';

export type LanguageSetting = 'system' | 'ru' | 'en';

// Единственная системная локаль приложения: RU, иначе EN (fallback).
export const systemLanguage: 'ru' | 'en' =
  Localization.getLocales()[0]?.languageCode === 'ru' ? 'ru' : 'en';

const ru = {
  seg: {
    tracks: 'Треки',
    albums: 'Альбомы',
    playlists: 'Плейлисты',
  },
  home: {
    emptyTitle: 'Библиотека пуста',
    emptyNoTracks: 'В подключённой папке не нашлось треков mp3/flac/m4a.',
    emptyNoFolder: 'Подключите папку с музыкой — треки из неё появятся здесь.',
    connectFolder: 'Подключить папку',
  },
  settings: {
    title: 'Настройки',
    librarySection: 'БИБЛИОТЕКА',
    generalSection: 'ОБЩИЕ',
    folder: 'Папка',
    notConnected: 'Не подключена',
    tracks: 'Треки',
    lastScan: 'Последний рескан',
    never: 'Ещё не было',
    disconnect: 'Отключить папку',
    disconnectTitle: 'Отключить папку?',
    disconnectBody:
      'Библиотека будет полностью очищена: треки, альбомы, плейлисты, очередь и настройки плеера.',
    cancel: 'Отмена',
    disconnectAction: 'Отключить',
    systemLanguage: 'Системный',
  },
};

const en = {
  seg: {
    tracks: 'Tracks',
    albums: 'Albums',
    playlists: 'Playlists',
  },
  home: {
    emptyTitle: 'Library is empty',
    emptyNoTracks: 'No mp3/flac/m4a tracks found in the connected folder.',
    emptyNoFolder: 'Connect a music folder — its tracks will appear here.',
    connectFolder: 'Connect Folder',
  },
  settings: {
    title: 'Settings',
    librarySection: 'LIBRARY',
    generalSection: 'GENERAL',
    folder: 'Folder',
    notConnected: 'Not connected',
    tracks: 'Tracks',
    lastScan: 'Last Scan',
    never: 'Never',
    disconnect: 'Disconnect Folder',
    disconnectTitle: 'Disconnect folder?',
    disconnectBody:
      'The library will be fully cleared: tracks, albums, playlists, queue, and player settings.',
    cancel: 'Cancel',
    disconnectAction: 'Disconnect',
    systemLanguage: 'System',
  },
};

void i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, en: { translation: en } },
  lng: systemLanguage,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

/** Применить сохранённый override из БД (после initDb, на старте приложения). */
export async function applyLanguageOverride(): Promise<void> {
  const override = await repo.getState(await initDb(), 'language_override');
  if (override === 'ru' || override === 'en') await i18n.changeLanguage(override);
}

/** Выбор в настройках: «Системный» возвращает к системной локали. */
export async function setLanguage(lang: LanguageSetting): Promise<void> {
  await i18n.changeLanguage(lang === 'system' ? systemLanguage : lang);
}
