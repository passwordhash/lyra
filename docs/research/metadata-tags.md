# Research: Парсинг метатегов аудиофайлов в React Native (iOS)

Тикет: #4 (карта wayfinder, Lyra). Вопрос: чем читать title/artist/album/album artist/track/disc/year/обложку из mp3 (ID3), flac (Vorbis comments), m4a (MP4 atoms) в RN на iOS; обёртки AVFoundation, готовые модули, TagLib; производительность на ~10 000 файлов; fallback на имена файлов.

Метод: только первоисточники — доки Apple (AVFoundation/AVMetadataIdentifier), исходники и README GitHub-репозиториев, официальные доки TagLib, Stack Overflow (проверено через зеркала), issue-трекеры. Каждая claim со ссылкой; тип свидетельства помечен: **[документ]** — прямое свидетельство первоисточника, **[интерпретация]** — вывод исследователя из источника, **[инференс]** — вывод без прямого источника.

## Сводная таблица

| Вариант | Тип | iOS-реализация | mp3 | flac | m4a | album artist / disc | Обложки | 10k файлов | Статус |
|---|---|---|---|---|---|---|---|---|---|
| **@missingcore/audio-metadata** | Pure JS (TS) | нет (чтение через fs-модуль) | ✅ ID3v1/v2 | ✅ Vorbis+PICTURE | ✅ MP4 | albumArtist ✅ / **disc ❌** | ✅ base64 | ⚠️ нет бенчмарков | микропроект, push 2025-06-12 |
| **react-native-audio-metadata** (joncodeofficial) | Нативный (Turbo) | AVAsset commonMetadata | ⚠️ частично | ❌ | ⚠️ | ❌ / ❌ | ⚠️ mp3/m4a, не flac | н/д | npm с 2025-10, ~53 загрузки/нед |
| **react-native-media-meta** (mybigday) | Нативный | AVMetadataItem | ⚠️ | ❌ | ⚠️ | ❌ / ❌ | ⚠️ | н/д | заброшен (push 2023-01-24) |
| **react-native-nitro-media-metadata** | Нативный (Nitro) | AVAsset | ⚠️ artist/title/album | ❌ | ⚠️ | ❌ / ❌ | ❌ нет API | н/д | видеоцентричный |
| **Свой модуль на AVFoundation** | Нативный | AVAsset | ✅ полный | ❌ **теги не читает** | ✅ полный | ✅ / ✅ | ✅ mp3/m4a | ~5 мс/файл (оценка) | платформенный API |
| **Свой Expo-модуль + SwiftTagLib.cpp (TagLib)** | Нативный | TagLib 2.1 | ✅ | ✅ | ✅ | ✅ / ✅ | ✅ все форматы | единицы-десятки мс/файл | TagLib 20+ лет; обёртка 35★, push 2026-01-13 |
| TagLibSwift (jeonghi) | Swift-пакет | TagLib 2.3.1 из исходников | ✅ | ✅ | ✅ | ✅ / ✅ | ✅ | как у TagLib | 9★, push 2026-07-25 |
| TagLib-Wasm | WASM/JS | — | ✅ | ✅ | ✅ | ✅ / ✅ | ✅ | 100 файлов ≈ 25 с (batch) | не для RN (Hermes без WASM) |
| nodefinity/react-native-music-library, Drazail/get-music-files | Нативный | MediaPlayer (MPMediaQuery) | — системная медиатека Music, не файлы приложения — | | | | | | отпадают |

✅ — поле читается; ⚠️ — частично; ❌ — не покрывается.

## 1. Готовые RN-модули

### 1.1 @missingcore/audio-metadata — лучший из «npm install и работает»

- **[документ]** Чистый TS-парсер без нативного кода: поддерживает RN ≥ 0.74 / Expo ≥ 51 и New Architecture, работает поверх `expo-file-system` или `@dr.pogodin/react-native-fs`; умеет и в Node. Форматы: `.flac`, `.mp3` (ID3v1+ID3v2), `.mp4/.m4a`. [README](https://github.com/MissingCore/audio-metadata).
- **[документ]** Набор полей (тип `AudioMetadata`): `album`, `albumArtist`, `artist`, `artwork` (base64), `name` (title), `track`, `year`. **Номера диска нет** — ключа disc/disk нет ни в типе, ни в списке Vorbis-полей ридера (`ALBUM, ALBUMARTIST, ARTIST, TITLE, TRACKNUMBER, DATE, ORIGINALDATE, ORIGINALYEAR`). [MetadataExtractor.types.ts](https://github.com/MissingCore/audio-metadata/blob/main/src/MetadataExtractor.types.ts), [FLACReader.ts](https://github.com/MissingCore/audio-metadata/blob/main/src/readers/FLACReader.ts).
- **[документ]** Обложки: FLAC PICTURE-блок читается (типы 0 «Other» и 3 «Cover (front)»), отдаётся как base64-data-URI; если обложка не запрошена — блок скипается. [FLACReader.ts](https://github.com/MissingCore/audio-metadata/blob/main/src/readers/FLACReader.ts).
- **[документ]** Читает файл диапазонами (блочные чтения от начала файла), а не целиком — по коду `FileReader.initDataFrom({size, offset})`. [FLACReader.ts](https://github.com/MissingCore/audio-metadata/blob/main/src/readers/FLACReader.ts).
- **[документ]** Caveat автора: ID3 unsynchronisation и тег в конце файла (ID3v2.4) «непротестированы». [README](https://github.com/MissingCore/audio-metadata).
- **[документ]** Зрелость: 12★, последний коммит 2025-06-12 (npm latest 1.3.0); написан под приложение MissingCore/Music, экосистема маленькая. [GitHub API](https://api.github.com/repos/MissingCore/audio-metadata), [npm](https://www.npmjs.com/package/@missingcore/audio-metadata).
- **[инференс]** На 10k файлов: несколько async-вызовов fs на файл через JS-мост — медленнее нативного парсинга; обложка как base64 через мост — самая дорогая часть, извлекать лениво (по альбому/при показе), не при полном скане. Опубликованных бенчмарков нет.

### 1.2 react-native-audio-metadata (joncodeofficial)

- **[документ]** iOS-сторона — тонкая обёртка AVAsset: `commonMetadata` даёт только title/artist/album/duration; year/genre ищутся по подстрокам идентификаторов (`id3/TYER`, `id3/TDRC`, `ilst/©day`…); обложка — `commonKeyArtwork` в base64. albumArtist, track, disc не читаются вовсе. [ios/AudioMetadata.mm](https://github.com/joncodeofficial/react-native-audio-metadata/blob/main/ios/AudioMetadata.mm), [README](https://github.com/joncodeofficial/react-native-audio-metadata).
- **[документ]** Android — MediaMetadataRetriever (все его форматы); README фактически Android-центричный (пути, разрешения). [README](https://github.com/joncodeofficial/react-native-audio-metadata).
- **[документ]** Очень молодой: npm создан 2025-10-31, версия 2.1.1, ~53 загрузки/нед, 0 зависимых. [npm/libraries.io](https://libraries.io/npm/react-native-audio-metadata).
- FLAC: как чистый AVAsset — см. §3: теги не читаются.

### 1.3 react-native-media-meta (mybigday)

- **[документ]** iOS — AVMetadataItem (общие ключи: albumName, artist, title, creationDate…), обложка base64; Android — FFmpegMediaMetadataRetriever. [README](https://github.com/mybigday/react-native-media-meta), [RNMediaMeta.m](https://github.com/mybigday/react-native-media-meta/blob/master/ios/RNMediaMeta/RNMediaMeta.m).
- **[документ]** Последний коммит 2023-01-24 — проект заброшен. [GitHub API](https://api.github.com/repos/mybigday/react-native-media-meta). Track/disc/albumArtist нет.

### 1.4 react-native-nitro-media-metadata

- **[документ]** Nitro Modules; аудио-поля только `duration, fileSize, codec, sampleRate, channels, bitRate, artist, title, album` — без track/disc/year/albumArtist/artwork; заточен под видео. [README](https://github.com/abdulaziz-git/react-native-nitro-media-metadata). Не подходит.

### 1.5 Модули системной медиатеки (отпадают)

- **[документ]** @nodefinity/react-native-music-library: iOS — «Full native iOS implementation via MediaPlayer framework», требует `NSAppleMusicUsageDescription`. [README](https://github.com/nodefinity/react-native-music-library).
- **[документ]** Drazail/react-native-get-music-files: поля title/author/album/genre/duration/cover; древний стиль установки (`react-native link`). [README](https://github.com/Drazail/react-native-get-music-files).
- **[интерпретация]** Оба читают **системную** библиотеку Music (MPMediaQuery/MediaStore), а не файлы в песочнице приложения — для собственного стора файлов Lyra бесполезны.

## 2. @missingcore как обёртка без натива — уже разобран в §1.1

## 3. AVFoundation напрямую (свой нативный модуль)

- **[документ]** Модель: `AVAsset` + `AVMetadataItem`, общие ключи `commonIdentifierTitle / Artist / AlbumName / Artwork / CreationDate`; формат-специфичные ключевые пространства покрывают контейнеры (QuickTime, MP3/ID3 и т.д.). [Retrieving media metadata](https://developer.apple.com/documentation/avfoundation/retrieving-media-metadata), [AVMetadataIdentifier](https://developer.apple.com/documentation/avfoundation/avmetadataidentifier).
- **[документ]** m4a — полное покрытие через iTunes keyspace: `iTunesMetadataSongName / Album / Artist / AlbumArtist / TrackNumber / DiscNumber / ReleaseDate / CoverArt`. [AVMetadataIdentifier — iTunes identifiers](https://developer.apple.com/documentation/avfoundation/avmetadataidentifier).
- **[документ]** mp3 — покрытие через ID3 keyspace: `id3MetadataAlbumTitle`, `id3MetadataLeadPerformer` (TPE1), `id3MetadataTrackNumber`, `id3MetadataPartOfASet` («часть сета» = TPOS, номер диска), `id3MetadataAttachedPicture`; для album artist — `id3MetadataBand` (TPE2; Apple описывает как «additional information about the performers», трактовка TPE2 как album artist — общепринятая конвенция). [id3MetadataPartOfASet](https://developer.apple.com/documentation/avfoundation/avmetadataidentifier/id3metadatapartofaset), [AVMetadataIdentifier — ID3 identifiers](https://developer.apple.com/documentation/avfoundation/avmetadataidentifier).
- **[документ]** **FLAC — провал**: `asset.commonMetadata` для FLAC-файла не отдаёт artist/album/title; рабочий воркэраунд — AudioToolbox `AudioFileOpenURL` + `kAudioFilePropertyInfoDictionary`, который даёт только `artist, title, album, approximate duration, source encoder` — без track/disc/album artist. [SO 52276830](https://stackoverflow.com/questions/52276830/how-can-i-get-flac-file-metadata-in-swift-on-ios-11).
- **[документ]** **Обложка FLAC недоступна вовсе**: PICTURE-блок лежит отдельно от info-словаря; автор итогового ответа парсил блоки FLAC вручную. [SO 62074756](https://stackoverflow.com/questions/62074756/getting-cover-from-flac-in-ios-with-avfoundation-and-audiotoolbox).
- **[документ]** С iOS 16/macOS 13 синхронный доступ к свойствам AVAsset на вызывающем потоке запрещён — нужен async-load API. [Loading media data asynchronously](https://developer.apple.com/documentation/avfoundation/loading-media-data-asynchronously).
- **[документ]** Производительность: кейс IINA — индексация ~1000 файлов ~15 с через FFmpeg против ~5 с через AVAsset (~5 мс/файл) на MacBook Pro 2015 (видео, macOS). [iina#3775](https://github.com/iina/iina/issues/3775). **[интерпретация]** Для 10k аудио на iPhone — порядка минут в фоне; для mp3/m4a это рабочий путь.

## 4. TagLib и Swift-обёртки (свой Expo-модуль)

- **[документ]** TagLib — C++-библиотека метаданных с 20+ лет историей: ID3v1/ID3v2, Vorbis comments (в т.ч. FLAC), MP4/AAC и ещё ~15 форматов. Лицензии LGPL/MPL — можно использовать в проприетарных приложениях, изменения самой TagLib надо открывать. [README TagLib](https://github.com/taglib/taglib/blob/master/README.md).
- **[документ]** Унифицированный API: базовые геттеры `title()/artist()/album()/year()/track()`, плюс `properties()` — экспорт **всех** тегов файла в PropertyMap с человеко-читаемыми ключами; обложки — через complex properties (`PICTURE`: data, mimeType, pictureType). В ID3v2-реализации через PropertyMap доступны все фреймы (в т.ч. TPE2/TPOS). [tag.h](https://github.com/taglib/taglib/blob/master/taglib/tag.h), [id3v2tag.cpp](https://github.com/taglib/taglib/blob/master/taglib/mpeg/id3v2/id3v2tag.cpp). **[интерпретация]** Стандартные ключи PropertyMap (`ALBUMARTIST`, `DISCNUMBER`, `TRACKNUMBER`, `DATE`) дают album artist и disc единообразно для всех трёх форматов — этого нет ни у одного готового RN-модуля.
- **[документ]** **SwiftTagLib.cpp** — Swift-обёртка TagLib 2.1 через C++ interop (Swift 5.9+, iOS 16+): чтение/запись, `attachedPictures`, опция `.skipPictures` для ускорения чтения; API повторяет модель TagLib; собирается XCFramework'ами из исходников. Предупреждение: без ABI-стабильности — пересборка при смене версии. Используется реальным плеером Anywhere Music Player. 35★, последний push 2026-01-13. [README](https://github.com/Anywhere-Music-Player/SwiftTagLib.cpp), [GitHub API](https://api.github.com/repos/Anywhere-Music-Player/SwiftTagLib.cpp).
- **[документ]** **TagLibSwift** (jeonghi) — альтернатива на свежем TagLib 2.3.1, SPM-сборка из исходников, iOS + симулятор из коробки. 9★, push 2026-07-25. [README](https://github.com/jeonghi/TagLibSwift).
- TagLibIOS (lemonhead94) — старая обёртка [TLAudio](https://github.com/lemonhead94/TagLibIOS), активность не проверена — деприоритизирована.
- **[интерпретация]** Интеграция в RN: тонкий Expo-модуль (Swift) c одним методом `getTags(path) -> {title, artist, album, albumArtist, track, disc, year, picture?}` поверх SwiftTagLib.cpp — порядка сотни строк и один podspec с vendored framework.
- Производительность нативного TagLib: **[документ]** ~28 мс/файл в старом кейсе 2012 г. (Qt, FileRef) [SO 11284154](https://stackoverflow.com/questions/11284154/taglib-performance-and-crashes-problems); медленный массовый кейс MinGW (1464 файла, 180 c) разбирался как окружение/диск [taglib#1026](https://github.com/taglib/taglib/issues/1026); в WASM-версии (та же логика) единый файл — 2–5 мс [TagLib-Wasm perf](https://charleswiltgen.github.io/TagLib-Wasm/concepts/performance). **[интерпретация]** Нативно на iOS — единицы-десятки мс на файл → 10k файлов ≈ десятки секунд в фоновом потоке.

### TagLib-Wasm — не вариант для RN

- **[документ]** Самозамеры проекта: 100 файлов ~25 с (concurrency 8), scanFolder 2–4 с/1000; целевые среды — браузер/Deno/Node/Cloudflare. [Performance Guide](https://charleswiltgen.github.io/TagLib-Wasm/concepts/performance). **[интерпретация]** Hermes не исполняет WASM — в RN не заведётся без отдельного WASM-рантайма; скорость всё равно на порядки ниже нативной.

## 5. Обложки: сводка по форматам

| Формат | Где лежит | Кто читает |
|---|---|---|
| mp3 | ID3 APIC | AVFoundation (`commonKeyArtwork`/`id3MetadataAttachedPicture`), @missingcore, joncodeofficial, TagLib [документ] |
| m4a | атом `covr` | AVFoundation (`iTunesMetadataCoverArt`/`commonKeyArtwork`), @missingcore, TagLib [документ] |
| flac | блок PICTURE | **только** парсер формата: TagLib, @missingcore; AVFoundation/AudioToolbox — нет [документ] |

- **[инференс]** Паттерн для Lyra: при скане обложку не тянуть (TagLib `.skipPictures`); извлекать один раз на альбом (первый трек ключа `albumArtist+album`), сохранять в файл кэша/в Documents, в списке показывать thumbnail. Держать base64 10k обложек в JS-стейте нельзя.

## 6. Производительность на ~10 000 файлов

- **[документ]** AVAsset: ~5 с на 1000 файлов (IINA, MBP 2015) [iina#3775](https://github.com/iina/iina/issues/3775) → ~50–100 с на 10k фоном. Но FLAC-теги недоступны (§3).
- **[документ]** TagLib native: см. §4; TagLib-Wasm (медленнее нативного на порядки) даёт 2–4 с/1000 на скане папки.
- **[документ]** @missingcore: бенчмарков нет; чтение блочное, но по несколько async-fs-вызовов на файл [FLACReader.ts](https://github.com/MissingCore/audio-metadata/blob/main/src/readers/FLACReader.ts). **[инференс]** Реалистично минуты на 10k; обязателен батчинг и ленивые обложки.
- **[документ]** Подводный камень мобильного массового чтения: деградация после ~1600 файлов при работе через fd/MediaStore на Android [SO 79857299](https://stackoverflow.com/questions/79857299/taglib-reading-slows-down-after-1600-items). **[инференс]** Для Lyra: скан в фоновом потоке, прогресс в UI, кэш в БД (SQLite), инкрементальный рескан по mtime/размеру — иначе каждый запуск будет пересканировать всё.

## 7. Fallback на имена файлов

- **[инференс]** Ни одна из библиотек не делает фолбэк сама — это логика приложения: при пустых тегах парсить имя файла (`NN. Title.ext`, `Artist - Title.ext`) и каталог (`Artist/Album/…`); альбом без тегов группировать по папке. Отсутствие тегов — штатный случай, поле `undefined` возвращают и @missingcore, и joncodeofficial [документ, README].

## 8. Зрелость и поддержка (сводно)

| Проект | Коммиты/активность | Звёзды | Вывод |
|---|---|---|---|
| TagLib | 20+ лет разработки, актуальные релизы 2.x | — | эталон индустрии |
| SwiftTagLib.cpp | push 2026-01-13, живой плеер-потребитель | 35 | рабочий инструмент |
| TagLibSwift | push 2026-07-25 | 9 | молодой, но активный |
| @missingcore/audio-metadata | push 2025-06-12 | 12 | рабочий, но микропроект |
| react-native-audio-metadata | npm с 2025-10, ~53 dl/нед | — | слишком молодой, поля неполные |
| react-native-media-meta | push 2023-01-24 | 84 | заброшен |
| TagLib-Wasm | активен | — | вне RN |

## 9. Риски

1. **FLAC через AVFoundation** — систематический пробел (теги и обложки), не починить настройкой; любой RN-модуль на AVFoundation наследует его. [SO 52276830](https://stackoverflow.com/questions/52276830/how-can-i-get-flac-file-metadata-in-swift-on-ios-11), [SO 62074756](https://stackoverflow.com/questions/62074756/getting-cover-from-flac-in-ios-with-avfoundation-and-audiotoolbox).
2. **@missingcore**: нет disc; непротестированные ветки ID3 (unsync, тег в конце); один мейнтейнер, нет бенчмарков на больших библиотеках. [README].
3. **TagLib-путь**: интеграционная работа (podspec/XCFramework, C++ interop); нет ABI-стабильности у SwiftTagLib (пересборка при апгрейдах); LGPL/MPL — для личного TestFlight без ограничений. [SwiftTagLib README].
4. **Мусорные теги в реальных файлах** (несогласованные TPE2/ALBUMARTIST, кириллица в разных кодировках ID3) — нужна нормализация при группировке альбомов. **[инференс]**
5. **Обложки**: тянуть всё в base64 на скане 10k файлов — гарантированный OOM/лаги моста. **[инференс]**

## Рекомендация

**Решение:** тонкий Expo-модуль (Swift) поверх SwiftTagLib.cpp (TagLib 2.x) — единый `getTags()` для mp3/flac/m4a.

Обоснование: это единственный путь, закрывающий всё ТЗ сразу — все поля (включая album artist и **номер диска**, которых нет ни у одного готового RN-модуля) и обложки во всех трёх форматах, при нативной скорости (10k — десятки секунд фоном) и 20-летней базе TagLib; AVFoundation отпадает принципиально — не читает Vorbis comments и обложки FLAC. На MVP/пока не хочется натива — @missingcore/audio-metadata (все три формата, обложки, New Architecture), приняв отсутствие disc и JS-накладные, с миграцией на TagLib-модуль без изменения UI-контракта.

## Источники

Оставлены (первоисточники):
- Apple: [Retrieving media metadata](https://developer.apple.com/documentation/avfoundation/retrieving-media-metadata), [AVMetadataIdentifier](https://developer.apple.com/documentation/avfoundation/avmetadataidentifier) (+ страницы [iTunesMetadataDiscNumber](https://developer.apple.com/documentation/avfoundation/avmetadataidentifier/itunesmetadatadiscnumber), [id3MetadataPartOfASet](https://developer.apple.com/documentation/avfoundation/avmetadataidentifier/id3metadatapartofaset)), [Loading media data asynchronously](https://developer.apple.com/documentation/avfoundation/loading-media-data-asynchronously) — модель метаданных и покрытие форматов/полей.
- [MissingCore/audio-metadata](https://github.com/MissingCore/audio-metadata) (README, types, FLACReader) — единственный JS-вариант с полным набором форматов.
- [joncodeofficial/react-native-audio-metadata](https://github.com/joncodeofficial/react-native-audio-metadata) (README + AudioMetadata.mm) — проверка iOS-реализации.
- [mybigday/react-native-media-meta](https://github.com/mybigday/react-native-media-meta), [abdulaziz-git/react-native-nitro-media-metadata](https://github.com/abdulaziz-git/react-native-nitro-media-metadata), [nodefinity/react-native-music-library](https://github.com/nodefinity/react-native-music-library), [Drazail/react-native-get-music-files](https://github.com/Drazail/react-native-get-music-files) — покрытие/непригодность.
- [SO 52276830](https://stackoverflow.com/questions/52276830/how-can-i-get-flac-file-metadata-in-swift-on-ios-11), [SO 62074756](https://stackoverflow.com/questions/62074756/getting-cover-from-flac-in-ios-with-avfoundation-and-audiotoolbox) — FLAC-пробел AVFoundation (проверено через зеркала exchangetuts).
- [taglib/taglib](https://github.com/taglib/taglib) (README, tag.h, id3v2tag.cpp), [SwiftTagLib.cpp](https://github.com/Anywhere-Music-Player/SwiftTagLib.cpp), [TagLibSwift](https://github.com/jeonghi/TagLibSwift) — рекомендуемый путь.
- [iina#3775](https://github.com/iina/iina/issues/3775) — замер AVAsset против FFmpeg; [TagLib-Wasm perf](https://charleswiltgen.github.io/TagLib-Wasm/concepts/performance), [taglib#1026](https://github.com/taglib/taglib/issues/1026), [SO 11284154](https://stackoverflow.com/questions/11284154/taglib-performance-and-crashes-problems), [SO 79857299](https://stackoverflow.com/questions/79857299/taglib-reading-slows-down-after-1600-items) — производительность.
- GitHub API / npm registry — даты коммитов и статусы пакетов.

Отклонены/деприоритизированы:
- Xojo-форум, дублирующие зеркала SO — вторичные пересказы (использованы только для навигации).
- expo-music-info-2 — только ID3v2 (mp3), без flac/m4a ([README](https://github.com/MehrabSp/expo-music-info-2)).
- lemonhead94/TagLibIOS, claucambra/FLACMetadataKit — старые/малые (push 2024-05), уступают SwiftTagLib.cpp.
- Тематические блоги/обзоры «top RN audio libs» — SEO-пересказы npm-страниц.
