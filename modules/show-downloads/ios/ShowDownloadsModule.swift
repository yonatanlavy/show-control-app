import ExpoModulesCore
import Foundation
import CoreFoundation
import UIKit

public final class ShowDownloadsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ShowDownloads")
    AsyncFunction("getJobs") { try DeviceDownloads.shared.jobs() }
    AsyncFunction("registerExternal") { (json: String) in try DeviceDownloads.shared.register(json) }
    AsyncFunction("updateExternal") { (json: String) in try DeviceDownloads.shared.update(json) }
    AsyncFunction("receive") { (id: String, url: String, token: String) in try DeviceDownloads.shared.receive(id, url, token) }
    Function("cancel") { (id: String) in try DeviceDownloads.shared.cancel(id) }
    AsyncFunction("complete") { (id: String) in try DeviceDownloads.shared.complete(id) }
    AsyncFunction("remove") { (id: String) in try DeviceDownloads.shared.remove(id) }
  }
}

private enum DownloadFailure: LocalizedError {
  case invalid, storage, busy
  var errorDescription: String? { switch self { case .invalid: return "DOWNLOAD_INVALID"; case .storage: return "DOWNLOAD_STORAGE"; case .busy: return "DOWNLOAD_BUSY" } }
}
public final class ShowDownloadAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
    guard identifier == "app.showcontrol.music-transfers" else { completionHandler(); return }
    DeviceDownloads.shared.reconnect(completionHandler)
  }
}
/** The singleton survives React/module teardown; records contain no pairing secrets. */
private final class DeviceDownloads: NSObject, URLSessionDownloadDelegate {
  static let shared = DeviceDownloads()
  private let lock = NSRecursiveLock()
  private var records: [[String: Any]] = []
  private var loaded = false
  private var backgroundCompletion: (() -> Void)?
  private let terminal = ["ready", "attached", "cancelled", "error", "interrupted"]
  private let maximum: Int64 = 500_000_000
  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.background(withIdentifier: "app.showcontrol.music-transfers")
    config.isDiscretionary = false
    config.sessionSendsLaunchEvents = true
    config.timeoutIntervalForResource = 1200
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }()
  private func synchronized<T>(_ work: () throws -> T) rethrows -> T { lock.lock(); defer { lock.unlock() }; return try work() }
  private func root() throws -> URL {
    let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("showcontrol-downloads", isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    var excluded = root; var values = URLResourceValues(); values.isExcludedFromBackup = true; try excluded.setResourceValues(values)
    return root
  }
  private func validID(_ id: String) throws { guard UUID(uuidString: id)?.uuidString.lowercased() == id else { throw DownloadFailure.invalid } }
  private func directory(_ id: String) throws -> URL { try validID(id); return try root().appendingPathComponent(id, isDirectory: true) }
  private func load() throws {
    if loaded { return }
    let path = try root().appendingPathComponent("jobs.json")
    if FileManager.default.fileExists(atPath: path.path) {
      let data = try Data(contentsOf: path); guard data.count < 2_000_000, let list = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { throw DownloadFailure.invalid }
      records = list
      for job in records { try validID(job["id"] as? String ?? "") }
    }
    loaded = true
    _ = session
  }
  private func save() throws { try JSONSerialization.data(withJSONObject: records).write(to: try root().appendingPathComponent("jobs.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]) }
  private func index(_ id: String) throws -> Int { try validID(id); guard let index = records.firstIndex(where: { $0["id"] as? String == id }) else { throw DownloadFailure.invalid }; return index }
  private func hasCompletedFile(_ id: String, _ job: [String: Any]) throws -> Bool {
    guard let number = job["bytes"] as? NSNumber else { return false }
    let bytes = number.doubleValue
    guard bytes.isFinite, bytes >= 128, bytes <= Double(maximum), bytes.rounded(.towardZero) == bytes else { return false }
    let expected = try directory(id).appendingPathComponent("audio.mp3").absoluteString
    return job["uri"] as? String == expected
  }
  private func hasCancellationProvenance(_ job: [String: Any]) -> Bool {
    guard let flag = job["cancelledAfterReady"] as? NSNumber else { return false }
    return CFGetTypeID(flag) == CFBooleanGetTypeID() && flag.boolValue
  }
  func jobs() throws -> [[String: Any]] { try synchronized { try load(); return records } }
  func register(_ json: String) throws -> [String: Any] { try synchronized {
    try load(); guard json.utf8.count < 8192, var job = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] else { throw DownloadFailure.invalid }
    let id = job["id"] as? String ?? ""; try validID(id)
    // Completion evidence is produced only by the native transfer callbacks.
    for key in ["uri", "bytes", "cancelledAfterReady", "errorCode", "receiving"] { job.removeValue(forKey: key) }
    guard records.count < 200, !records.contains(where: { !terminal.contains($0["stage"] as? String ?? "") }), !records.contains(where: { $0["id"] as? String == id }) else { throw DownloadFailure.busy }
    for key in ["showId", "setId", "category", "title", "url"] { guard let value = job[key] as? String, !value.isEmpty, value.count <= (key == "url" ? 4096 : 256) else { throw DownloadFailure.invalid } }
    job["stage"] = "queued"; job["percent"] = NSNull(); records.append(job); try save(); return job
  } }
  func update(_ json: String) throws { try synchronized {
    try load(); guard json.count < 8192, let update = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] else { throw DownloadFailure.invalid }
    let i = try index(update["id"] as? String ?? "")
    if records[i]["receiving"] as? Bool == true || terminal.contains(records[i]["stage"] as? String ?? "") { return }
    for key in ["stage", "percent", "errorCode"] { if let value = update[key] { records[i][key] = value } }
    try save()
  } }
  // Insecure transport is allowed only to the explicitly paired local helper.
  private func helperURL(_ raw: String) throws -> URL {
    guard let url = URL(string: raw), let host = url.host?.lowercased(), ["http", "https"].contains(url.scheme ?? ""), url.user == nil, url.password == nil else { throw DownloadFailure.invalid }
    let parts = host.split(separator: ".").compactMap { Int($0) }
    let localIP = parts.count == 4 && parts.allSatisfy { (0...255).contains($0) } && (parts[0] == 10 || parts[0] == 192 && parts[1] == 168 || parts[0] == 172 && (16...31).contains(parts[1]) || parts[0] == 127)
    guard url.scheme == "https" || localIP || host.hasSuffix(".local") || host == "localhost" else { throw DownloadFailure.invalid }
    return url
  }
  func receive(_ id: String, _ raw: String, _ token: String) throws { try synchronized {
    try load(); let i = try index(id)
    if records[i]["receiving"] as? Bool == true || terminal.contains(records[i]["stage"] as? String ?? "") { return }
    guard token.count >= 32 && token.count <= 512 && !token.contains("\n") else { throw DownloadFailure.invalid }
    guard let free = try root().resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage, free >= 64_000_000 else { throw DownloadFailure.storage }
    var request = URLRequest(url: try helperURL(raw)); request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    let task = session.downloadTask(with: request); task.taskDescription = id
    records[i]["receiving"] = true; records[i]["stage"] = "downloading"; try save(); task.resume()
  } }
  func cancel(_ id: String) throws { try synchronized {
    try load(); try validID(id)
    if let i = records.firstIndex(where: { $0["id"] as? String == id }) {
      if records[i]["stage"] as? String == "attached" { return }
      if records[i]["stage"] as? String == "ready", (try? hasCompletedFile(id, records[i])) == true { records[i]["cancelledAfterReady"] = true }
      else if records[i]["stage"] as? String != "cancelled" { records[i].removeValue(forKey: "cancelledAfterReady") }
      records[i]["stage"] = "cancelled"; records[i]["receiving"] = false; try save()
    }
    session.getAllTasks { tasks in tasks.filter { $0.taskDescription == id }.forEach { $0.cancel() } }
  } }
  func complete(_ id: String) throws { try synchronized {
    try load(); let i = try index(id)
    if records[i]["stage"] as? String != "attached" {
      guard records[i]["stage"] as? String == "ready" || records[i]["stage"] as? String == "cancelled" && hasCancellationProvenance(records[i]),
        try hasCompletedFile(id, records[i]) else { throw DownloadFailure.invalid }
    }
    records[i]["stage"] = "attached"; records[i]["receiving"] = false; records[i].removeValue(forKey: "cancelledAfterReady"); try save()
    let path = try directory(id); if FileManager.default.fileExists(atPath: path.path) { try FileManager.default.removeItem(at: path) }
  } }
  func remove(_ id: String) throws { try synchronized {
    try load(); let i = try index(id); guard terminal.contains(records[i]["stage"] as? String ?? "") else { throw DownloadFailure.busy }
    let path = try directory(id); if FileManager.default.fileExists(atPath: path.path) { try FileManager.default.removeItem(at: path) }; records.remove(at: i); try save()
  } }
  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
    guard let id = downloadTask.taskDescription else { downloadTask.cancel(); return }
    if totalBytesWritten > maximum || totalBytesExpectedToWrite > maximum { downloadTask.cancel(); fail(id, "DOWNLOAD_SIZE"); return }
    try? synchronized { try load(); let i = try index(id); if records[i]["stage"] as? String == "cancelled" { downloadTask.cancel(); return }; records[i]["percent"] = totalBytesExpectedToWrite > 0 ? Double(totalBytesWritten) * 100 / Double(totalBytesExpectedToWrite) : NSNull(); try save() }
  }
  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    guard let id = downloadTask.taskDescription else { return }
    do { try synchronized {
      try load(); let i = try index(id); if records[i]["stage"] as? String == "cancelled" { return }
      guard (downloadTask.response as? HTTPURLResponse)?.statusCode == 200 else { throw DownloadFailure.invalid }
      let bytes = try FileManager.default.attributesOfItem(atPath: location.path)[.size] as? Int64 ?? 0; guard bytes >= 128 && bytes <= maximum else { throw DownloadFailure.invalid }
      let dir = try directory(id); try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      let file = dir.appendingPathComponent("audio.mp3"); try FileManager.default.moveItem(at: location, to: file)
      records[i]["uri"] = file.absoluteString; records[i]["bytes"] = bytes; records[i]["percent"] = 100; records[i]["stage"] = "ready"; records[i]["receiving"] = false; try save()
    } } catch { fail(id, "DOWNLOAD_TRANSFER_FAILED") }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) { if error != nil, let id = task.taskDescription { fail(id, "DOWNLOAD_TRANSFER_FAILED") } }
  func reconnect(_ completion: @escaping () -> Void) {
    synchronized { backgroundCompletion = completion }
    do { try synchronized { try load() } } catch { synchronized { backgroundCompletion = nil }; completion() }
  }
  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    let completion = synchronized { let value = backgroundCompletion; backgroundCompletion = nil; return value }
    if let completion { DispatchQueue.main.async { completion() } }
  }
  // Reject redirects: the pairing bearer must never be forwarded to another origin.
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
  private func fail(_ id: String, _ code: String) { try? synchronized { try load(); let i = try index(id); if ["cancelled", "attached"].contains(records[i]["stage"] as? String ?? "") { return }; records[i]["stage"] = "error"; records[i]["receiving"] = false; records[i]["errorCode"] = code; try save() } }
}
