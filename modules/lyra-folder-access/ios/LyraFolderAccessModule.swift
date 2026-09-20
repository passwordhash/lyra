import ExpoModulesCore
import UniformTypeIdentifiers

struct FolderInfo: Record {
  @Field var url: String = ""
  @Field var name: String = ""
}

struct TrackFile: Record {
  @Field var path: String = ""
  @Field var url: String = ""
  @Field var size: Int = 0
  @Field var mtime: Double = 0
}

final class FolderNotConnected: Exception {
  override var reason: String { "Папка библиотеки не подключена" }
}

public final class LyraFolderAccessModule: Module {
  private static let bookmarkKey = "lyra.syncFolderBookmark"
  private static let audioExtensions: Set<String> = ["mp3", "flac", "m4a"]

  private var folderURL: URL?
  private var pickerDelegate: PickerDelegate?

  final class PickerDelegate: NSObject, UIDocumentPickerDelegate {
    let onPick: (URL?) -> Void

    init(onPick: @escaping (URL?) -> Void) {
      self.onPick = onPick
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
      onPick(urls.first)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
      onPick(nil)
    }

    func cancel() {
      onPick(nil)
    }
  }

  public func definition() -> ModuleDefinition {
    Name("LyraFolderAccess")

    AsyncFunction("connectFolder") { () async throws -> FolderInfo? in
      guard let url = try await self.presentPicker() else { return nil }
      try self.saveBookmark(url)
      // ponytail: security scope держим до disconnectFolder/смерти процесса — иначе пришлось бы
      // балансировать start/stop вокруг каждого чтения плеером и тег-парсером
      url.startAccessingSecurityScopedResource()
      self.folderURL = url
      return self.info(url)
    }

    AsyncFunction("getFolder") { () -> FolderInfo? in
      if let url = self.folderURL { return self.info(url) }
      guard let data = UserDefaults.standard.data(forKey: Self.bookmarkKey) else { return nil }
      var isStale = false
      let url: URL
      do {
        url = try URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &isStale)
      } catch {
        // bookmark не резолвится (папка удалена/отозвана) — считаем папку отключённой
        UserDefaults.standard.removeObject(forKey: Self.bookmarkKey)
        return nil
      }
      guard url.startAccessingSecurityScopedResource() else {
        UserDefaults.standard.removeObject(forKey: Self.bookmarkKey)
        return nil
      }
      if isStale {
        try? self.saveBookmark(url)
      }
      self.folderURL = url
      return self.info(url)
    }

    AsyncFunction("disconnectFolder") { () -> Bool in
      if let url = self.folderURL {
        url.stopAccessingSecurityScopedResource()
        self.folderURL = nil
      }
      UserDefaults.standard.removeObject(forKey: Self.bookmarkKey)
      return true
    }

    AsyncFunction("listTracks") { () -> [TrackFile] in
      guard let root = self.folderURL else { throw FolderNotConnected() }
      return try Self.listAudioFiles(root: root)
    }

    Function("fileUrl") { (path: String) -> String? in
      guard let root = self.folderURL else { return nil }
      let rootPath = root.standardizedFileURL.path
      let candidate = root.appendingPathComponent(path).standardizedFileURL
      guard candidate.path.hasPrefix(rootPath + "/") else { return nil }
      return candidate.absoluteString
    }
  }

  // MARK: - Private

  private func presentPicker() async throws -> URL? {
    // незакрытый пикер отменяем, чтобы его continuation не завис
    pickerDelegate?.cancel()
    return await withCheckedContinuation { continuation in
      DispatchQueue.main.async { [weak self] in
        guard let self, let presenter = self.appContext?.utilities?.currentViewController() else {
          continuation.resume(returning: nil)
          return
        }
        let delegate = PickerDelegate { [weak self] url in
          self?.pickerDelegate = nil
          continuation.resume(returning: url)
        }
        self.pickerDelegate = delegate
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
        picker.delegate = delegate
        presenter.present(picker, animated: true)
      }
    }
  }

  private func saveBookmark(_ url: URL) throws {
    let data = try url.bookmarkData()
    UserDefaults.standard.set(data, forKey: Self.bookmarkKey)
  }

  private func info(_ url: URL) -> FolderInfo {
    let record = FolderInfo()
    record.url = url.absoluteString
    record.name = url.lastPathComponent
    return record
  }

  private static func listAudioFiles(root: URL) throws -> [TrackFile] {
    let keys: Set<URLResourceKey> = [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey]
    guard let enumerator = FileManager.default.enumerator(
      at: root,
      includingPropertiesForKeys: Array(keys),
      options: [.skipsHiddenFiles, .skipsPackageDescendants]
    ) else {
      throw FolderNotConnected()
    }
    let rootPath = root.path
    var files: [TrackFile] = []
    for case let fileURL as URL in enumerator {
      guard audioExtensions.contains(fileURL.pathExtension.lowercased()) else { continue }
      // ponytail: файл, исчезнувший посреди обхода, пропускаем — листинг остаётся правдивым,
      // а RN-рескан по решению #8 абортирует только при падении самого обхода
      guard let values = try? fileURL.resourceValues(forKeys: keys), values.isRegularFile == true else { continue }
      let record = TrackFile()
      record.path = String(fileURL.path.dropFirst(rootPath.count + 1))
      record.url = fileURL.absoluteString
      record.size = values.fileSize ?? 0
      record.mtime = values.contentModificationDate?.timeIntervalSince1970 ?? 0
      files.append(record)
    }
    return files
  }
}
