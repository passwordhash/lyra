# Research: Аудио-движок и RN-инфраструктура для Lyra (iOS)

Issue: passwordhash/lyra#2. Дата исследования: по состоянию источников на сентябрь 2026.
Требования: фоновое воспроизведение, Now Playing / Remote Commands (lock screen, наушники; CarPlay не нужен), Live Activity / Dynamic Island, управление очередью из JS (play next / play last, reorder, shuffle, seek), форматы mp3/flac/m4a. Контекст: iOS-first, персональное приложение (TestFlight), библиотека до ~10 000 треков, поведение очереди как в Apple Music.

## Summary

Для требований Lyra лучший выбор — **react-native-track-player v5 (`@rntp/player`)** в **Expo dev-client**: это единственный вариант, где очередь с reorder/shuffle/play-next, фоновое воспроизведение и полноценный Now Playing с remote commands готовы из коробки; для личного (non-commercial) использования лицензия бесплатна. `expo-audio` объективно отстаёт именно там, где Lyra требует Apple Music-поведения: у его `AudioPlaylist` нет reorder/shuffle и per-track метаданных, а lock-screen-контролы для плейлистов появились только в 58.0.0 (2026-09-10) и в текущей стабильной SDK 57 недоступны. Собственный нативный модуль на AVFoundation даёт максимум контроля, но повторяет функциональность, которую RNTP v5 уже предоставляет — для персонального приложения это недели лишней работы без выигрыша.

## Вариант 1: react-native-track-player (v4 → v5 `@rntp/player`)

**Статус проекта.** Оригинальный пакет `react-native-track-player` (v4, Apache-2.0) заморожен: «V4 remains available under Apache-2.0 on the `v4` branch, but will not receive further updates» ([GitHub releases, 5.0.0](https://github.com/doublesymmetry/react-native-track-player/releases)). Документация v4 помечена «no longer actively maintained» ([docs 4.0](https://doublesymmetry.github.io/react-native-track-player/docs/4.0/api/functions/queue)). Развиваемый преемник — **v5, пакет [`@rntp/player`](https://www.npmjs.com/package/@rntp/player)**: полный рерайт на New Architecture (TurboModule + JSI, синхронные геттеры `getQueue()`/`getProgress()` без моста), на Android — Media3; релизы идут активно (5.0.0 → 5.7.0 от 16.07.2026, среди фиксов — iOS-специфичные) ([releases](https://github.com/doublesymmetry/react-native-track-player/releases)).

**Требования v5:** React Native 0.74+, включённая New Architecture (Fabric + TurboModules), iOS 16+ ([rntp.dev/docs/installation](https://rntp.dev/docs/installation)). В Info.plist нужно прописать `UIBackgroundModes: audio` — «This mode is required for background playback and for events to keep flowing while audio plays in the background» (там же).

**Лицензия — ключевой факт.** С v5 библиотека коммерческая: бесплатно для **личного (private, non-professional) и образовательного** использования; всё остальное (коммерческие приложения, клиентские продукты, revenue-generating) — платно: €99/мес или €999/год за одно приложение (Pro), €249/мес (Studio, до 5 приложений) ([rntp.dev/llms.txt](https://rntp.dev/llms.txt), [rntp.dev/pricing](https://rntp.dev/pricing)). **Lyra — персональное приложение в TestFlight, т.е. личное использование: бесплатно.** Если проект когда-нибудь станет публичным коммерческим продуктом — €999/год. Есть программа Launch Credit (6 месяцев бесплатно для инди) — там же.

**Очередь из JS.** v5: «Queue management (add, remove, reorder, skip tracks; repeat and shuffle modes)» ([rntp.dev/llms.txt](https://rntp.dev/llms.txt)). Это покрывает play next / play last (`add` с `insertBeforeIndex` в v4, аналог в v5), reorder (`move`) и shuffle (встроенный режим — в отличие от v4, где shuffle-функции в API очереди не было, [сравнение v4 API](https://doublesymmetry.github.io/react-native-track-player/docs/api/functions/queue)). Плюс из коробки: кэширование аудио, прелоадинг следующих треков («background buffering of upcoming tracks for gapless-like playback»), sleep timer, хуки `useProgress`/`useActiveMediaItem` ([releases 5.0.0](https://github.com/doublesymmetry/react-native-track-player/releases)).

**Фон / Now Playing.** Фоновое воспроизведение и media controls — базовые функции («Background audio playback… Media controls and notification center integration», [rntp.dev/llms.txt](https://rntp.dev/llms.txt)). Релизы подтверждают связку lock screen + события в фоне: «including from the lock screen, notification…» (5.7.0), «iOS logs a one-time warning when `registerBackgroundEventHandler` called… Use `addEventListener` for all events on iOS, including while audio plays in the background with `UIBackgroundModes` audio» (5.3.0) ([releases](https://github.com/doublesymmetry/react-native-track-player/releases)).

**Expo-совместимость.** Официальный гайд «Developing with Expo»: «A Dev Client is required in order to use this package (Expo Go is not supported)»; там же честная оговорка: «the current maintainers of this project do not use Expo and their ability to resolve issues involving Expo is limited» ([rntp.dev Expo guide](https://rntp.dev/docs/next/guides/with-expo)). Принципиально это не проблема — «compatibility comes with expo's inherent compatibility with any RN project» (maintainer в [issue #2429](https://github.com/doublesymmetry/react-native-track-player/issues/2429)).

## Вариант 2: expo-audio

**Статус.** Первый институт Expo SDK (замена `expo-av`), активно развивается. Текущая документированная версия ~57.0.5 (SDK 57); expo-audio 58.0.0 вышла 2026-09-10 ([docs.expo.dev/versions/latest/sdk/audio](https://docs.expo.dev/versions/latest/sdk/audio/), [CHANGELOG](https://github.com/expo/expo/blob/main/packages/expo-audio/CHANGELOG.md)). Ставится и в bare RN при установленном `expo` (docs, раздел Installation).

**Фон.** Решён декларативно: config plugin `enableBackgroundPlayback: true` добавляет iOS `UIBackgroundModes` audio, затем `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' })`. «On iOS, audio playback continues seamlessly in the background once the audio session is configured» (docs — прямая цитата). Это самый простой фон из трёх вариантов.

**Now Playing / lock screen.** API есть, но только на одиночном `AudioPlayer`: `setActiveForLockScreen(true, { title, artist, albumTitle, artworkUrl })`, `updateLockScreenMetadata`, `clearLockScreenControls`; для lock screen обязателен `interruptionMode: 'doNotMix'` (docs). Опции видимости кнопок (seek forward/backward, live-режим) добавлялись поэтапно (55.0.0, 56.0.0 — CHANGELOG).

**Очередь — главная боль.** `AudioPlaylist` (gapless) умеет: `add`, `insert(source, index)`, `remove(index)`, `clear`, `next`, `previous`, `skipTo`, `seekTo`, loop `'none' | 'single' | 'all'`, событие `trackChanged` (docs). Но:
- **нет `move`/reorder** — перестановку делать вручную через remove+insert;
- **нет shuffle-режима**;
- **нет per-track метаданных** — у `AudioSource` только `uri`/`name`/`headers`/`assetId`, никаких title/artist/artwork;
- **lock-screen API у плейлиста отсутствует в SDK 57** (в доке класса `AudioPlaylist` методов `setActiveForLockScreen` нет — docs).

Lock-screen для плейлистов добавили только в **58.0.0 (2026-09-10)** через [PR #46020](https://github.com/expo/expo/pull/46020) (merged 2026-06-26): `setActiveForLockScreen` / `updateLockScreenMetadata` / `clearLockScreenControls` на `AudioPlaylist`, опции `showNextTrack`/`showPreviousTrack`, next/prev с lock screen листа управляют навигацией плейлиста. В комментариях PR — прямое свидетельство зрелости: «Can someone please clarify when this will be released? It's not even in SDK 57. It's a major roadblock for our project» (09.09.2026).

**Известные баги lock screen в SDK 57** (из ревью того же PR, замерено на устройстве, iPhone 16 Pro, expo-audio 57.0.2): `MPRemoteCommand`-хендлеры накапливаются при каждой активации плеера (баг `removeTarget(self)` вместо токена), из-за чего skip-кнопки множатся — «after three activations, one press of a 10 s skip button jumps 30 s»; фикс есть в main, в 57 его нет. Плюс `AudioPlaylist.currentIndex` на iOS замерзал после первого автоперехода — починили только в 57.0.1 (2026-07-15, CHANGELOG).

**Форматы.** Expo прямо делегирует платформе: «The iOS audio and video format documentation lists supported media formats for Apple devices» (docs → [Apple: Audio Format Identifiers](https://developer.apple.com/documentation/coreaudiotypes/audio-format-identifiers)).

## Вариант 3: собственный нативный модуль на AVFoundation

Стек очевиден и полностью подконтролен: `AVAudioSession` (фон, interruption) + `AVPlayer`/`AVQueuePlayer` (воспроизведение, seek) + `MPNowPlayingInfoCenter`/`MPRemoteCommandCenter` (Now Playing, remote commands) + ActivityKit/WidgetKit для Live Activity ([MPNowPlayingInfoCenter](https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfocenter), [ActivityKit](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)). Движок expo-audio на iOS — это и есть AVPlayer-обёртка (CHANGELOG упоминает `AVURLAsset`, `MPRemoteCommand` и т.п.), т.е. «свой модуль» даёт не другой звук, а другой объём работы.

Что придётся написать руками: собственная модель очереди с reorder/shuffle/play-next, автопереход треков, persistence очереди, обработка interruptions/маршрутов, Now Playing-метаданные, события в JS. Это ровно тот функционал, который RNTP v5 уже отдаёт из коробки, включая преходы в фоне и события. Для персонального приложения выигрыш только один — нулевая зависимость от чужой лицензии и полный контроль; цена — недели нативной работы и собственные баги в самых закоулках (см. баг с `removeTarget` выше как пример того, как тут легко ошибиться).

## Сравнение по требованиям

| Требование | RNTP v5 (`@rntp/player`) | expo-audio (SDK 57 / 58) | Свой модуль (AVFoundation) |
|---|---|---|---|
| Очередь из JS: play next/last, reorder, shuffle | ✅ add/remove/reorder/skip + **repeat и shuffle** из коробки ([llms.txt](https://rntp.dev/llms.txt)); v4: `add(tracks, insertBeforeIndex)`, `move(from, to)` ([v4 docs](https://doublesymmetry.github.io/react-native-track-player/docs/api/functions/queue)) | ⚠️ add/insert/remove/next/previous/skipTo; **нет reorder (`move`), нет shuffle, нет метаданных у трека** (docs) | ✅ всё, но пишешь сам |
| Фоновое воспроизведение | ✅ `UIBackgroundModes: audio`, события текут в фоне ([installation](https://rntp.dev/docs/installation), 5.3.0 notes) | ✅ самый простой: config plugin + `shouldPlayInBackground: true` (docs) | ✅ сам ставишь `UIBackgroundModes` + `AVAudioSession` |
| Now Playing / Remote Commands | ✅ зрелая связка capabilities + события; lock screen/notification в релизах упоминаются как основные поверхности (releases) | ⚠️ одиночный плеер — ок; **для плейлистов — только с 58.0.0**, в 57 недоступно + баг накопления remote-command хендлеров в 57 ([PR #46020](https://github.com/expo/expo/pull/46020)) | ✅ `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter` руками |
| Live Activity / Dynamic Island | ❌ встроенной LA-интеграции нет (в docs/releases не упоминается — вывод из отсутствия, не из заявления авторов); системный Now Playing на lock screen есть; кастомная LA — через expo-widgets отдельно | ❌ то же: LA не входит в audio-модуль; кастомная LA — через expo-widgets | ✅ полная свобода: ActivityKit + свой WidgetKit-экстеншн |
| Форматы mp3/flac/m4a | ✅ через AVFoundation на iOS | ✅ через AVFoundation; Expo прямо ссылается на список Apple (docs) | ✅ сам выбираешь декодеры; AVFoundation покрывает |
| Зрелость и поддержка | Активные релизы (5.0→5.7.0 за полгода, iOS-фиксы); v4 заморожен; **лицензия: личное использование бесплатно, коммерческое €999/год** | Очень активная разработка Expo, но плейлист-стек молодой: lock-screen для плейлистов только в 58.0.0 (2026-09-10) | Зависит только от тебя; вся поддержка — твоя |

Форматы, по первоисточнику Apple: список идентификаторов Core Audio включает `kAudioFormatFLAC`, `kAudioFormatMPEGLayer3` (MP3), `kAudioFormatMPEG4AAC` (AAC/.m4a) ([Apple: Audio Format Identifiers](https://developer.apple.com/documentation/coreaudiotypes/audio-format-identifiers)). Все три варианта на iOS воспроизводят через AVFoundation, т.е. по форматам разницы нет. *(Старый архивный список Core Audio Overview FLAC не содержит — он предшествует появлению FLAC-декодера; актуальный список идентификаторов FLAC включает.)*

**Про Dynamic Island отдельно (важная развилка, интерпретация исследователя):** системный Now Playing у «играющего» приложения iOS сам показывает на lock screen / в Control Center, а на устройствах с Dynamic Island — и там; кастомная Live Activity для плеера будет конкурировать с системным UI. Т.е. требование «Live Activity / Dynamic Island», скорее всего, уже закрыто системным Now Playing, который дают и RNTP, и expo-audio. Прямой цитаты Apple про Dynamic Island в этом исследовании нет (страницы Apple JS-рендерятся) — считай это допущением, проверяемым одним запуском на устройстве.

## Expo (dev-client) или bare React Native

- RNTP v5 в Expo работает только через **dev-client** (Expo Go — нет); мейнтейнеры Expo сами не используют, Expo-специфичных фиксов ждать не стоит ([Expo guide](https://rntp.dev/docs/next/guides/with-expo)). Практически это обычный нативный модуль: EAS build / `expo prebuild` + dev-client решают.
- **Live Activity склоняет к Expo**: `expo-widgets` даёт Live Activity с раскладками Lock Screen + Dynamic Island (compact/minimal/expanded) на SwiftUI без ручного создания widget-таргета; требует dev build, не Expo Go ([docs.expo.dev/sdk/widgets](https://docs.expo.dev/versions/latest/sdk/widgets/)). Ранее популяный `expo-live-activity` от Software Mansion задепрекейтен в пользу `expo-widgets` ([repo](https://github.com/software-mansion-labs/expo-live-activity)). В bare RN ту же LA придётся писать как нативный WidgetKit-экстеншн руками.
- expo-audio и в bare работает, но с ним и так не выигрываем.
- В bare RN нет ни одной фичи, которую нельзя получить в dev-client; обратное неверно (expo-widgets).

**Вывод: Expo dev-client — меньше боли** под этот набор требований (RNTP v5 + expo-widgets + EAS → TestFlight из коробки). Bare оправдан, только если сразу писать собственный нативный модуль.

## Риски и подводные камни

1. **Лицензия `@rntp/player`** — главный стратегический риск: сейчас бесплатно (личное использование), но коммерциализация приложения = €999/год или переписывание движка. Для персонального TestFlight-приложения — ок.
2. **v5 — молодой рерайт**: между 5.0.0 и 5.7.0 уже были iOS-фиксы (например, кодоген на RN 0.80 в 5.1.2); миграции с v4 нет, API переписан ([releases](https://github.com/doublesymmetry/react-native-track-player/releases)). Закладывай апгрейды по минорам.
3. **iOS 16+ / New Architecture** — v5 не заведётся на старых iOS и старом RN. Для нового проекта не проблема (New Architecture — дефолт в свежих RN).
4. **expo-audio**: если всё же выбрать его — нужен SDK 58+ для lock-screen у плейлистов; reorder/shuffle/metadата всё равно своими руками поверх `insert`/`remove`/`trackChanged`, плюс свежие баги плейлиста (см. выше) показывают, что стеку нужно время.
5. **Очередь на ~10k треков** — ни RNTP, ни expo-audio не документируют лимиты размера очереди; поведение `setQueue`/`setMediaItems` на 10 000 элементов не проверено (см. Missing evidence). Возможный паттерн-обход: держать в нативной очереди окно треков, а полный порядок — в JS/БД.
6. **Live Activity**: не заказывай её до проверки системного Now Playing на устройстве — есть риск дублирования UI (интерпретация, см. выше).

## Contradictions

- **CarPlay в RNTP v5**: релиз-ноты 5.0.0 заявляют «Native CarPlay — first-class iOS car dashboard support via `setBrowseTree()`», а официальный llms.txt относит CarPlay к «Coming Soon». Для Lyra не критично (CarPlay не нужен), но отражает нестабильность формулировок молодого v5.
- **Вторичные статьи** (LogRocket «RNTP vs Expo Audio», React Native Relay) подают expo-audio как полноценную замену RNTP для подкаст/музык-приложений; первоисточники (доки SDK 57, PR #46020) показывают, что для queue-centric плеера с lock screen ключевые куски отсутствовали до 58.0.0. Вторичка отвергнута как источник.

## Missing evidence

- Поведение очереди ~10 000 треков в RNTP v5 (`setMediaItems`/shuffle/reorder на больших массивах) — не документировано; нужен спайк-тест.
- Прямая Apple-цитата о том, что системный Now Playing отображается в Dynamic Island (доки Apple не fetched — JS-рендеринг; оба library-первоисточника подтверждают только lock screen/Control Center).
- Точная версия появления `AudioPlaylist` в expo-audio (в CHANGELOG явной записи о добавлении не найдено; задокументирован к SDK 57).
- Свежесть «рекомендуемой» версии expo-audio в доках (~57.0.5) относительно уже вышедшей 58.0.0 — если брать expo-audio, уточни маппинг SDK 58 на момент старта.

## Sources

Kept:
- [RNTP GitHub Releases](https://github.com/doublesymmetry/react-native-track-player/releases) — заморозка v4, лицензия v5, фичи 5.0–5.7.0, iOS-фиксы (первоисточник).
- [rntp.dev/llms.txt](https://rntp.dev/llms.txt) + [rntp.dev/pricing](https://rntp.dev/pricing) — условия лицензии (личное использование бесплатно, €99/мес·€999/год commercial), требования, состав фич очереди (первоисточник).
- [rntp.dev/docs/installation](https://rntp.dev/docs/installation) — RN 0.74+, New Architecture, iOS 16+, `UIBackgroundModes` (первоисточник).
- [rntp.dev Expo guide](https://rntp.dev/docs/next/guides/with-expo) — dev-client обязателен, Expo Go нет, оговорка про Expo-поддержку (первоисточник).
- [RNTP v4 queue docs](https://doublesymmetry.github.io/react-native-track-player/docs/api/functions/queue) — `add(tracks, insertBeforeIndex)`, `move(from, to)`, skip-семантика; подтверждение, что shuffle в v4 не было (первоисточник).
- [expo-audio docs (latest)](https://docs.expo.dev/versions/latest/sdk/audio/) — config plugin, `setAudioModeAsync`, `setActiveForLockScreen`, полный API `AudioPlayer`/`AudioPlaylist` (первоисточник).
- [expo-audio CHANGELOG](https://github.com/expo/expo/blob/main/packages/expo-audio/CHANGELOG.md) — хронология: lock screen (0.4.8, 07.2025), опции кнопок (55.0/56.0), playlist-фикс (57.0.1), playlist lock-screen (58.0.0, 2026-09-10) (первоисточник).
- [expo/expo PR #46020](https://github.com/expo/expo/pull/46020) — что именно добавлено для плейлистов, отсутствие в SDK 57, баг накопления `MPRemoteCommand`-хендлеров в 57 (первоисточник, включая замер на устройстве).
- [Apple: Audio Format Identifiers](https://developer.apple.com/documentation/coreaudiotypes/audio-format-identifiers) — FLAC/MP3/AAC в списке форматов (первоисточник, fetched через JSON API доков).
- [expo-widgets docs](https://docs.expo.dev/versions/latest/sdk/widgets/) — Live Activity c Dynamic Island-раскладками, требует dev build (первоисточник).
- [expo-live-activity repo (Software Mansion)](https://github.com/software-mansion-labs/expo-live-activity) — депрекация в пользу expo-widgets (первоисточник).

Rejected/deprioritized:
- LogRocket «React Native Track Player vs. Expo Audio» и React Native Relay tutorial — вторичные обзоры; противоречат первоисточникам по зрелости playlist-API expo-audio.
- StackOverflow «Should I use Expo…» (2019) — устарел.
- Старый архив Core Audio Overview (Supported Audio Formats) — предшествует FLAC в iOS, вводит в заблуждение.

## Рекомендация

**Решение: react-native-track-player v5 (`@rntp/player`) в Expo dev-client (EAS build → TestFlight); Live Activity пока не заказывать — сначала проверить системный Now Playing на Dynamic Island.**

Обоснование: RNTP v5 — единственный вариант, закрывающий весь список требований из коробки (очередь с reorder/shuffle/play-next из JS, фон, зрелый Now Playing/remote commands, форматы через AVFoundation), и для персонального приложения лицензия бесплатна; Expo dev-client добавляет expo-widgets на случай Live Activity и EAS-пайплайн для TestFlight, ничего не отнимая. expo-audio проигрывает именно на очередь-центричном UX уровня Apple Music (нет reorder/shuffle/метаданных, lock-screen плейлистов нет до 58.0.0), а собственный AVFoundation-модуль повторяет готовое ценой недель нативной работы — запасной путь, если v5 упрётся в лицензию или лимиты очереди.
