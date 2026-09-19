# Research: Механика доступа к папке и синхронизации на iOS (issue #3)

Дата: 2026-09-19 · Ресёрч по первоисточникам (доки Apple, репозитории библиотек). Каждая claim — со ссылкой; интерпретации помечены явно.

## 1. Как работает доступ к папке (picker, bookmarks, права)

- **Выбор папки.** С iOS 13 пользователь выбирает папку через `UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)` (режим «open», не «import»). Пикер возвращает **security-scoped URL**, который даёт **рекурсивный доступ к папке и всему содержимому, включая файлы, добавленные в будущем** — из любого file provider (локальный, iCloud Drive, сторонние). Источник: [Apple: Providing access to directories](https://developer.apple.com/documentation/uikit/providing-access-to-directories).
- **Модель доступа.** Перед любым обращением к URL — `startAccessingSecurityScopedResource()`, после — парный `stopAccessingSecurityScopedResource()`. Каждый успешный `start` обязан быть закрыт `stop`: «If you fail to relinquish your access… your app leaks kernel resources. If sufficient kernel resources leak, your app loses its ability to add file-system locations to its sandbox… until relaunched». Источник: [Apple: startAccessingSecurityScopedResource()](https://developer.apple.com/documentation/foundation/url/startaccessingsecurityscopedresource()).
- **Чтение/запись.** Apple требует выполнять файловые операции над picker-URL через `NSFileCoordinator` (координированное чтение), а при показе пользователю — отслеживать состояние через file presenter («If you're only showing a list of files, a file presenter is not necessary»). Источники: [Apple: Providing access to directories](https://developer.apple.com/documentation/uikit/providing-access-to-directories), [Apple: Document Picker Programming Guide — Accessing Documents (архив)](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/DocumentPickerProgrammingGuide/AccessingDocuments/AccessingDocuments.html).
- **Не сохранять сырой URL.** Явное правило Apple: «Do not save any URLs accessed through open or move operations. Always open the document using a document picker, a metadata query, or a security-scoped bookmark to the URL» (архивный гайд). Путь сам по себе прав не даёт — права живут в security scope / bookmark.
- **Bookmark на iOS.** Пример Apple для iOS создаёт bookmark как `url.bookmarkData(options: .minimalBookmark, …)` и резолвит `URL(resolvingBookmarkData:bookmarkDataIsStale:)` **без** опции `.withSecurityScope` — на iOS security scope вшивается в bookmark неявно. Опция `.withSecurityScope` официально существует только на macOS («Available on: macOS 10.7+»), макосные сниппеты с ней в интернет-статьях к iOS неприменимы. Источники: [Apple: Providing access to directories](https://developer.apple.com/documentation/uikit/providing-access-to-directories), [Apple: withSecurityScope](https://developer.apple.com/documentation/foundation/nsurl/bookmarkcreationoptions/withsecurityscope).
- **Права и пользователь.** После выбора папки приложение появляется в Settings → Privacy → Files and Folders; пользователь может отозвать или вернуть право в любой момент. Apple: «your app must be ready to handle failures when accessing a directory’s content. Calls to the startAccessingSecurityScopedResource() method can fail, as well as any attempts to read or write to the URL». Источник: [Apple: Providing access to directories](https://developer.apple.com/documentation/uikit/providing-access-to-directories).

## 2. Персистентность и отказы

- **Механика персистентности.** Bookmark (`Data`) сохраняется в контейнер приложения; на каждом запуске: резолв → проверка `bookmarkDataIsStale` → если stale, пересоздать bookmark из URL и перезаписать → `startAccessing…` → работа → `stopAccessing…`. Apple прямо подтверждает: «Your app can even save a bookmark for this URL, letting it access the directory the next time it launches» и «You can save a security-scoped URL as a bookmark and later resolve it back into a security-scoped URL». Источник: [Apple: Providing access to directories](https://developer.apple.com/documentation/uikit/providing-access-to-directories). Это рабочий и штатный путь: доступ переживает перезапуски приложения и устройства.
- **Новый скоуп покрывает новые файлы.** Apple: URL «lets your app recursively access the directory and all of its contents, which includes accessing any new items you add to the directory in the future» — то есть bookmark не «протухает» от добавления файлов. Источник: там же.
- **Отказы (по Apple):**
  - пользователь отозвал право в Settings → Files and Folders;
  - папка удалена/перемещена/переименована → резолв или `start` падает, bookmark может стать stale;
  - выход из iCloud / недоступность удалённого сервера: «Users can log into (and log out of) services such as iCloud. The network or remote server may become unavailable» ([архивный гайд: Creating an Outstanding User Experience](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/DocumentPickerProgrammingGuide/CreatinganOutstandingUserExperience/CreatinganOutstandingUserExperience.html));
  - Apple отдельно предупреждает: «using saved bookmarks can greatly increase the amount of time users have to possibly change your app's permissions» — при работе с bookmark отказы доступа надо обрабатывать как норму.
- **Интерпретация (researcher inference):** деинсталляция приложения стирает контейнер с bookmark-данными и выданные права — после переустановки нужен повторный выбор папки. Прямой формулировки в доках Apple не найдено (следует из модели песочницы).
- **Обработчик отказа = UX-контракт:** при неудачном резолве/bookmark → показать экран «папка недоступна, выберите заново» и снова открыть пикер. Это единственный механизм восстановления.

## 3. Обнаружение изменений и рескан

- **Push-уведомлений об изменениях внешней папки нет.** Для папки, выданной пикером (в т.ч. из iCloud Drive), публичного API «подпишись на изменения» не существует:
  - `NSMetadataQuery` с ubiquitous-scope (`NSMetadataQueryUbiquitousDocumentsScope`/`UbiquitousDataScope`) ищет **только в собственном iCloud-контейнере приложения** — внешний iCloud Drive он не покрывает ([Apple: Metadata Query Search Scopes](https://developer.apple.com/documentation/foundation/metadata-query-search-scopes)).
  - `NSMetadataQueryAccessibleUbiquitousExternalDocumentsScope` находит iCloud-документы, **ранее открытые через пикер** (система создаёт external document reference в локальном контейнере приложения), и возвращает security-scoped NSURL — но это про отдельные файлы, а не про дерево выбранной папки ([Apple: Metadata Query Search Scopes](https://developer.apple.com/documentation/foundation/metadata-query-search-scopes), [архивный гайд](https://developer.apple.com/library/archive/FileManagement/Conceptual/DocumentPickerProgrammingGuide/CreatinganOutstandingUserExperience/CreatinganOutstandingUserExperience.html)). Про этот scope есть известные багрепорты: не находит файлы/папки ([radar FB9631965](http://ww.openradar.appspot.com/FB9631965), [SO 79616961](https://stackoverflow.com/questions/79616961/nsmetadataquery-not-searching-subdirectories-in-external-ubiquity-container)).
  - API `NSFileProviderEnumerator.enumerateChanges` / `signalEnumerator` — это механизм **для собственного File Provider-расширения**, а не для потребителя ([Apple: Tracking Your File Provider's Changes](https://developer.apple.com/documentation/fileprovider/tracking-your-file-provider-s-changes)).
- **iCloud Drive «уведомляет» только владельца контейнера.** Т.е. если бы папка лежала в собственном iCloud-контейнере приложения, `NSMetadataQuery` давал бы live-обновления (`NSMetadataQueryDidUpdate`, фазы gathering/live-update — [Apple: NSMetadataQuery](https://developer.apple.com/documentation/foundation/nsmetadataquery)). Для чужой папки iCloud Drive, выбранной пикером, — нет.
- **Практический рескан (интерпретация + стандартная практика, не API Apple):** на старте и на foreground — резолв bookmark → `start` → `FileManager.enumerator` по дереву (как в примере Apple) → дифф со снапшотом в БД по ключу (путь, `size`, `contentModificationDateKey`, `creationDateKey`): добавленные/удалённые/изменённые файлы определяются сравнением. Для 10k файлов это секунды, если file provider уже материализовал метаданные.
- **Подводные камни рескана iCloud Drive:**
  - первое перечисление большой папки может быть медленным/кривым — есть свежие жалобы на «strange and unusable URLs» при энумерации iCloud-папок, полученных из пикера ([SO 74965949](https://stackoverflow.com/questions/74965949/strange-and-unusable-urls-when-using-uidocumentpickerviewcontroller-to-access-ic)) — community evidence, не официальный баг.
  - файлы могут быть **не скачаны на устройство** (dataless/эвиктед): iCloud Drive управляет хранением, есть API `startDownloadingUbiquitousItem(at:)` / `evictUbiquitousItem(at:)` и ключи статуса загрузки ([Apple: startDownloadingUbiquitousItem](https://developer.apple.com/documentation/foundation/filemanager/startdownloadingubiquitousitem(at:))); эти API описаны для ubiquity-модели iCloud, поведение на picker-granted путях нестабильно ([SO 67193591](https://stackoverflow.com/questions/67193591/the-proper-way-to-download-files-from-icloud)). Чтение невыкачанного файла в import-режиме исторически отдаёт мусор/`.icloud`-плейсхолдеры ([stackguides 54368488](https://stackguides.com/questions/54368488/uidocumentpickerviewcontroller-in-import-mode-returns-icloud-files)); при открытии по ссылке file provider обычно докачивает по требованию — интерпретация, требует теста на TestFlight.
- **Вывод по рескану:** рассчитывать только на собственный рескан; «freshness»-подсказок от iCloud Drive по внешней папке нет.

## 4. RN-библиотеки vs нативный код

| Библиотека | Что покрывает | Чего нет |
|---|---|---|
| [react-native-document-picker](https://github.com/react-native-documents/document-picker) (старый, MIT) | `pickDirectory()` — сам пикер папки на iOS | Нет bookmark/long-term access: URL живёт до перезапуска; после рестарта доступ теряется (фича long-term access анонсирована как новая в переписанной либе) |
| [@react-native-documents/picker](https://react-native-documents.github.io/) (rewrite 2025) | `pickDirectory({ requestLongTermAccess: true })` → `BookmarkingResponse { bookmarkStatus, bookmark }`; bookmark — opaque строка для резолва в своём нативном коде; `releaseSecureAccess()` | **Open mode / directory picker / long-term access — sponsor-only** (приватные пакеты для спонсоров: [issue #603](https://github.com/react-native-documents/document-picker/issues/603), docs в разделе `sponsor-only`). Бесплатно — только import mode |
| [expo-document-picker](https://docs.expo.dev/versions/latest/sdk/document-picker/) | выбор файлов | Папки не поддерживает: «We don't have a "folder picker" for this use case» ([expo#8891](https://github.com/expo/expo/issues/8891)) |
| [expo-file-system SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/) | `Directory.pickDirectoryAsync()` на iOS; классы `File`/`Directory` умеют security scoped resources ([blog](https://expo.dev/blog/expo-file-system)) | «On iOS, the selected directory grants temporary read and write access for the current app session only. After the app restarts, you must prompt the user again» — **bookmark-персистентности нет** |
| react-native-fs и аналоги | чтение внутри песочницы | Security scope / bookmarks / NSFileCoordinator не поддерживают |

- **Вывод:** готового бесплатного RN-пакета «picker + bookmark + персистентность + рескан» нет. Спонсорский `@react-native-documents/picker` закрывает только picker и выдачу bookmark-строки; резолв bookmark, start/stop scope, координированную энумерацию, дифф-рескан и чтение для AVPlayer всё равно делаете сами в нативном модуле.
- **Объём нативной части (интерпретация):** один Swift-модуль ~200–300 строк: `pickFolder()` (UIDocumentPickerViewController), `saveBookmark(from url:)`, `resolveBookmark() -> url` + stale-обработка, `startAccess()`/`stopAccess()`, `scanFolder() -> [FileMeta]` (enumerator + resource keys). JS-сторона — только состояние и БД. Для персонального TestFlight это дешевле, чем спонсорство + всё равно нативный код.

## 5. Копировать в песочницу vs читать по ссылке из bookmark

| | Копия в песочницу | Чтение по ссылке (bookmark) |
|---|---|---|
| Диск | ×2 (библиотека дублируется целиком; для mp3/flac это десятки–сотни ГБ) | 1×, iCloud Drive сам эвиктит неиспользуемое |
| Офлайн | Гарантирован всегда | Не гарантирован: невыкачанные файлы недоступны без сети; поведение докачки по требованию нестабильно |
| Стабильность доступа | Максимальная: нет отзыва прав, нет stale bookmark, нет iCloud-logout | Зависит от прав (Settings), наличия сети, состояния file provider |
| Свежесть данных | Отстаёт: нужен sync-движок (детект изменений в источнике + копирование дельт) | Всегда актуально при рескане: источник и есть библиотека |
| Первичное наполнение | Долгий импорт 10k файлов (часы по сети, если папка в iCloud) | Быстрое: энумерация метаданных |
| Apple-семантика | «import»: копия, «you don't need to use file coordination or security-scoped URLs… consumes extra storage space» ([архивный гайд](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/DocumentPickerProgrammingGuide/AccessingDocuments/AccessingDocuments.html)) | «open»: доступ in-place, редактирование на месте, требуется coordination + security scope |

- **Гибрид (интерпретация):** чтение по ссылке + постоянный кэш метаданных (теги, обложки, длительность) в БД приложения; опционально — копия только обложек. Даёт UX «мгновенная библиотека» без дублирования аудио.
- Для плеера на AVPlayer: между `start` и `stop` scope URL играет как обычный файл-URL (следует из модели security scope; прямой документированной формулировки про AVPlayer нет — интерпретация).

## 6. Риски

1. **Отзыв прав пользователем** (Settings → Files and Folders) или удаление папки → bookmark/`start` падает. Обязателен graceful-флоу «выбрать папку заново». [Apple](https://developer.apple.com/documentation/uikit/providing-access-to-directories)
2. **iCloud dataless-файлы**: трек не скачан → нет офлайн-воспроизведения; API докачки ведут себя нестабильно на внешних путях. [SO 67193591](https://stackoverflow.com/questions/67193591/the-proper-way-to-download-files-from-icloud)
3. **Утечка kernel-ресурсов** при непарных start/stop — доступ отвалится до перезапуска приложения. [Apple](https://developer.apple.com/documentation/foundation/url/startaccessingsecurityscopedresource())
4. **Нет уведомлений об изменениях** — рескан только по своей инициативе (launch/foreground/кнопка); между фоновыми запусками изменения не видны.
5. **Медленная/глючная первая энумерация** большой iCloud-папки; URL'ы file provider нестабильны между запусками (нельзя кешировать пути — только bookmark). [SO 74965949](https://stackoverflow.com/questions/74965949/strange-and-unusable-urls-when-using-uidocumentpickerviewcontroller-to-access-ic)
6. **Зависимость от стороннего пакета** (если брать спонсорский `@react-native-documents/picker`) — привязка к одному мейнтейнеру; для нативного модуля — свой код, но тривиальный.
7. **Stale bookmark после обновления приложения** — обрабатывается штатно (пересоздание и перезапись), но код-путь нужно покрыть тестом.

## Рекомендация

**Решение (одной строкой):** подключение папки = нативный Swift-модуль: `UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)` + security-scoped bookmark в Keychain/Defaults + чтение по ссылке с `start/stopAccessingSecurityScopedResource` и ресканом энумератором на launch/foreground с диффом (path, size, mtime) против снапшота в БД — без копирования аудио.

**Обоснование:** bookmark — единственный штатный способ сохранить доступ между запусками, и Apple явно гарантирует, что scope покрывает и новые файлы; push-уведомлений об изменениях внешней папки нет, так что рескан всё равно пишем сами; копирование 10k файлов удваивает диск и требует sync-движка ради единственного бонуса — офлайна, который для личной папки в iCloud решается «Download Now» в Files. Бесплатные RN-библиотеки персистентности не дают (expo — только на сессию, старый picker — вообще нет), спонсорский `@react-native-documents/picker` не отменяет нативный код, поэтому проще сразу один компактный модуль.

---

### Источники

**Apple (первоисточники):**
- Providing access to directories — https://developer.apple.com/documentation/uikit/providing-access-to-directories
- URL.startAccessingSecurityScopedResource() — https://developer.apple.com/documentation/foundation/url/startaccessingsecurityscopedresource()
- NSURLBookmarkCreationOptions.withSecurityScope (macOS-only) — https://developer.apple.com/documentation/foundation/nsurl/bookmarkcreationoptions/withsecurityscope
- Metadata Query Search Scopes — https://developer.apple.com/documentation/foundation/metadata-query-search-scopes
- NSMetadataQuery — https://developer.apple.com/documentation/foundation/nsmetadataquery
- Tracking Your File Provider's Changes — https://developer.apple.com/documentation/fileprovider/tracking-your-file-provider-s-changes
- FileManager.startDownloadingUbiquitousItem(at:) — https://developer.apple.com/documentation/foundation/filemanager/startdownloadingubiquitousitem(at:)
- Document Picker Programming Guide (архив): Accessing Documents — https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/DocumentPickerProgrammingGuide/AccessingDocuments/AccessingDocuments.html
- Document Picker Programming Guide (архив): Creating an Outstanding User Experience — https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/DocumentPickerProgrammingGuide/CreatinganOutstandingUserExperience/CreatinganOutstandingUserExperience.html

**Библиотеки (первоисточники):**
- @react-native-documents/picker — docs: https://react-native-documents.github.io/ · directory picker: https://react-native-documents.github.io/docs/sponsor-only/picker/directory-picker · issue #603 (sponsor-only): https://github.com/react-native-documents/document-picker/issues/603 · репо: https://github.com/react-native-documents/document-picker
- expo-file-system SDK 54 — https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/ · blog: https://expo.dev/blog/expo-file-system
- expo-document-picker (нет папок) — https://github.com/expo/expo/issues/8891

**Community (пометка: не официальные):**
- radar FB9631965 (NSMetadataQuery external scope) — http://ww.openradar.appspot.com/FB9631965
- SO: энумерация iCloud-папок из пикера — https://stackoverflow.com/questions/74965949/
- SO: докачка из iCloud — https://stackoverflow.com/questions/67193591/
