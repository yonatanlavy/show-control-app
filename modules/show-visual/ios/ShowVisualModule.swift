import ExpoModulesCore
import AVFoundation
import UIKit
import ImageIO
import ShowAudio

public final class ShowVisualModule: Module {
  private var enabled = false
  private var fallback: URL?
  private var snapshot: [String: Any] = [:]
  private var output: UIWindow?
  private var canvas: AudienceCanvas?
  private var currentCue = ""
  private var latestRunState: [String: Any] = [:]
  private var actualStart: [String: Any]?
  private var actualSourceSeconds: Double?
  private var observations: [NSObjectProtocol] = []
  private var detail = "External output disabled"
  private var errorCode: String?
  private var testing = false
  private var barrier = VisualEventBarrier()
  private var destroyed = false

  public func definition() -> ModuleDefinition {
    Name("ShowVisual")
    Events("onVisualStatus")
    OnCreate {
      let center = NotificationCenter.default
      self.observations.append(center.addObserver(forName: NSNotification.Name("ShowControlRunState"), object: nil, queue: .main) { [weak self] note in
        guard let self, let event = note.userInfo?["event"] as? [String: Any] else { return }
        self.update(event)
      })
      self.observations.append(center.addObserver(forName: UIScreen.didDisconnectNotification, object: nil, queue: .main) { [weak self] _ in
        guard let self else { return }; self.resetVisualState(); self.closeOutput(); self.enabled = false; self.detail = "Display disconnected; confirm output before reconnecting"; self.emit()
      })
      self.observations.append(center.addObserver(forName: UIScreen.didConnectNotification, object: nil, queue: .main) { [weak self] _ in self?.connect(); self?.emit() })
      self.observations.append(center.addObserver(forName: NSNotification.Name("ShowControlExternalSceneConnected"), object: nil, queue: .main) { [weak self] _ in self?.connect(); self?.emit() })
    }
    AsyncFunction("configure") { (json: String) -> [String: Any] in
      try NativeRemoteCoordinator.requireIdle()
      try self.requireActive()
      let value = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] ?? [:]
      let candidate = try (value["fallbackUri"] as? String).map { try self.localURL($0) }
      self.resetVisualState(); self.errorCode = nil
      self.enabled = value["enabled"] as? Bool ?? false
      self.fallback = candidate
      if self.enabled { if self.output != nil { self.detail = "Audience output ready" }; self.connect() } else { self.closeOutput(); self.detail = "External output disabled" }; self.emit()
      return self.status()
    }.runOnQueue(.main)
    AsyncFunction("prepare") { (json: String) in
      try self.requireActive()
      let value = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] ?? [:]
      for asset in (value["visualAssets"] as? [String: [String: Any]] ?? [:]).values { if let uri = asset["localUri"] as? String { _ = try self.localURL(uri) } }
      self.snapshot = value; self.resetVisualState()
    }.runOnQueue(.main)
    AsyncFunction("getStatus") { self.status() }.runOnQueue(.main)
    AsyncFunction("testPattern") { (json: String) -> [String: Any] in
      try NativeRemoteCoordinator.requireIdle()
      try self.requireActive()
      let labels = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] ?? [:]
      guard self.enabled, self.canvas != nil else { throw NSError(domain: "ShowVisual", code: 2, userInfo: [NSLocalizedDescriptionKey: "VISUAL_NO_DISPLAY: Enable an external audience display before testing."]) }
      guard let title = labels["title"] as? String, let caption = labels["caption"] as? String,
            (1...256).contains(title.count), (1...512).contains(caption.count) else { throw VisualError.invalidMedia }
      self.resetVisualState(); self.canvas?.testPattern(title, caption: caption); self.testing = true; self.errorCode = nil
      self.detail = "Silent display test is active"; self.emit(); return self.status()
    }.runOnQueue(.main)
    AsyncFunction("endTestPattern") { if self.testing { self.resetVisualState(); self.emit() } }.runOnQueue(.main)
    AsyncFunction("blackout") { self.resetVisualState(); self.emit() }.runOnQueue(.main)
    AsyncFunction("probeVisual") { (uri: String) -> [String: Any] in try self.probe(uri) }
    OnDestroy { self.observations.forEach { NotificationCenter.default.removeObserver($0) }; DispatchQueue.main.async { self.destroyed = true; self.closeOutput() } }
  }
  private func status() -> [String: Any] {
    let detected = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.contains { $0.screen != UIScreen.main } || UIScreen.screens.contains { $0 != UIScreen.main }
    var value: [String: Any] = ["available": true, "enabled": enabled, "displayDetected": detected, "connected": output != nil, "testing": testing, "detail": detail]
    if let errorCode { value["errorCode"] = errorCode }; return value
  }
  private func emit() { if !destroyed { sendEvent("onVisualStatus", status()) } }
  private func requireActive() throws { guard !destroyed else { throw VisualError.invalidMedia } }
  private func connect() {
    guard !destroyed, enabled, output == nil else { return }
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    guard let scene = scenes.first(where: { $0.screen != UIScreen.main }) else { detail = "No external display scene detected"; emit(); return }
    let window = UIWindow(windowScene: scene)
    let controller = UIViewController(); let audience = AudienceCanvas(frame: scene.screen.bounds) { [weak self] in
      self?.resetVisualState(); self?.errorCode = "decoderFailed"; self?.detail = "Visual decoder failed; audio remains active"; self?.emit()
    }
    controller.view = audience; window.rootViewController = controller; window.isHidden = false
    output = window; canvas = audience; audience.blackout(); currentCue = ""
    detail = "Audience display connected; physical validation required"; emit()
    // Buffering and incoming countdowns do not constitute an actual start.
    // Reconnect only a latched main VOICE_START from this immutable snapshot.
    restoreActualVisual()
  }
  private func closeOutput() { canvas?.blackout(); output?.isHidden = true; output = nil; canvas = nil }
  private func resetVisualState(_ nowMs: Double = ProcessInfo.processInfo.systemUptime * 1_000) { barrier.blackout(nowMs); canvas?.blackout(); testing = false; currentCue = ""; actualStart = nil; actualSourceSeconds = nil; latestRunState = [:] }
  private func matchesSnapshot(_ event: [String: Any]) -> Bool {
    ["showId", "setId", "revisionId"].allSatisfy { key in
      guard let expected = snapshot[key] as? String, !expected.isEmpty else { return false }
      return event[key] as? String == expected
    }
  }
  private func restoreActualVisual() {
    guard canvas != nil, let start = actualStart, let id = start["cueId"] as? String,
          let cue = (snapshot["cues"] as? [String: [String: Any]])?[id] else { return }
    currentCue = id; show(cue)
    if latestRunState["phase"] as? String == "paused" { canvas?.pause() }
    if let position = actualSourceSeconds { canvas?.synchronize(position) }
  }
  private func update(_ event: [String: Any]) {
    guard !destroyed, enabled else { return }
    let type = event["type"] as? String ?? ""
    let state = event["state"] as? String ?? event["phase"] as? String ?? ""
    guard let generation = (event["generation"] as? NSNumber)?.int64Value,
          let monotonicMs = (event["monotonicMs"] as? NSNumber)?.doubleValue,
          barrier.accepts(generation: generation, monotonicMs: monotonicMs) else { return }
    let startedGeneration = (actualStart?["generation"] as? NSNumber)?.int64Value
    if ["INTERRUPTION", "ROUTE_CHANGE", "SAFETY_STOP", "SHUTDOWN"].contains(type) || ["stopped", "interrupted", "fault"].contains(state) { resetVisualState(monotonicMs); emit(); return }
    guard matchesSnapshot(event) else { return }
    if type == "RUN_STATE" {
      // Never leave a setup pattern visible after audio preparation wins a race.
      if testing { canvas?.blackout(); testing = false; emit() }
      if let startedGeneration, generation != startedGeneration { canvas?.blackout(); currentCue = ""; actualStart = nil; actualSourceSeconds = nil }
      latestRunState = event
    }
    if ["PROGRESS", "VOICE_START"].contains(type), event["mainTransport"] as? Bool != true { return }
    let id = event["cueId"] as? String ?? ""
    if type == "VOICE_START" {
      let order = snapshot["cueOrder"] as? [String] ?? []
      if order.contains(id) {
        testing = false; errorCode = nil; actualStart = event; actualSourceSeconds = nil
        restoreActualVisual(); emit()
      }
    }
    if ["STATE", "RUN_STATE"].contains(type) { if state == "paused" { canvas?.pause() } else if ["playing", "running", "fading"].contains(state) { canvas?.resume() } }
    if type == "PROGRESS", id == actualStart?["cueId"] as? String, generation == startedGeneration, let position = event["positionMs"] as? NSNumber {
      // Audio PROGRESS is already relative to the song's trimmed start.
      let seconds = max(0, position.doubleValue) / 1000
      actualSourceSeconds = seconds; canvas?.synchronize(seconds)
    }
  }
  private func show(_ cue: [String: Any]) {
    let assets = snapshot["visualAssets"] as? [String: [String: Any]] ?? [:]
    let id = cue["visualAssetId"] as? String ?? cue["artworkAssetId"] as? String ?? snapshot["fallbackVisualAssetId"] as? String ?? ""
    let asset = assets[id]
    do {
      let url = try (asset?["localUri"] as? String).map { try localURL($0) } ?? fallback
      if let url { try canvas?.show(url, video: asset?["kind"] as? String == "video", rate: (cue["playbackRate"] as? NSNumber)?.floatValue ?? 1) }
      else { canvas?.showFallback() }
    } catch { resetVisualState(); errorCode = "mediaUnavailable"; detail = "Visual media unavailable; audio remains active"; emit() }
  }
  private func localURL(_ uri: String) throws -> URL {
    guard let url = URL(string: uri), url.isFileURL else { throw VisualError.invalidMedia }
    let path = url.resolvingSymlinksInPath().path
    let roots = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
      + FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)
      + [URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)]
    guard roots.contains(where: { path.hasPrefix($0.standardizedFileURL.resolvingSymlinksInPath().path + "/") }) else { throw VisualError.invalidMedia }
    let attributes = try FileManager.default.attributesOfItem(atPath: path)
    guard let size = attributes[.size] as? NSNumber, size.int64Value > 0 else { throw VisualError.invalidMedia }
    return URL(fileURLWithPath: path)
  }
  private func probe(_ uri: String) throws -> [String: Any] {
    let url = try localURL(uri)
    if let source = CGImageSourceCreateWithURL(url as CFURL, nil), let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
       let width = properties[kCGImagePropertyPixelWidth as String] as? Int, let height = properties[kCGImagePropertyPixelHeight as String] as? Int {
      guard width > 0, height > 0, width * height <= 40_000_000 else { throw VisualError.invalidMedia }
      let mime = CGImageSourceGetType(source).map { $0 as String } == "public.jpeg" ? "image/jpeg" : "image/png"
      return ["kind": "image", "mimeType": mime, "width": width, "height": height]
    }
    let asset = AVURLAsset(url: url)
    guard let track = asset.tracks(withMediaType: .video).first else { throw VisualError.invalidMedia }
    let extent = track.naturalSize.applying(track.preferredTransform)
    let duration = CMTimeGetSeconds(asset.duration) * 1000
    guard duration.isFinite, duration > 0, abs(extent.width) <= 4096, abs(extent.height) <= 4096 else { throw VisualError.invalidMedia }
    return ["kind": "video", "mimeType": "video/mp4", "width": Int(abs(extent.width)), "height": Int(abs(extent.height)), "durationMs": Int(duration)]
  }
}
private enum VisualError: Error { case invalidMedia }
private final class AudienceCanvas: UIView {
  private let image = UIImageView()
  private let images = LatestImageWork<CGImage>()
  private let layerPlayer = AVPlayerLayer()
  private var player: AVPlayer?
  private var rate: Float = 1
  private var paused = false
  private var lastSource: Double = 0
  private var itemObservation: NSKeyValueObservation?
  private let onFault: () -> Void
  private var renderRevision: UInt64 = 0
  private let pattern = UILabel()
  init(frame: CGRect, onFault: @escaping () -> Void) { self.onFault = onFault; super.init(frame: frame); backgroundColor = .black; image.contentMode = .scaleAspectFit; addSubview(image); layer.addSublayer(layerPlayer); layerPlayer.videoGravity = .resizeAspect; pattern.numberOfLines = 0; pattern.textAlignment = .center; pattern.textColor = .white; pattern.font = .systemFont(ofSize: 28); pattern.isHidden = true; addSubview(pattern) }
  required init?(coder: NSCoder) { fatalError("init(coder:) unavailable") }
  override func layoutSubviews() { super.layoutSubviews(); image.frame = bounds; layerPlayer.frame = bounds; pattern.frame = bounds }
  func show(_ url: URL, video: Bool, rate: Float) throws {
    blackout(); self.rate = rate; paused = false; lastSource = 0
    let revision = renderRevision
    if video { let value = AVPlayer(url: url); value.isMuted = true; player = value; layerPlayer.player = value
      itemObservation = value.currentItem?.observe(\.status, options: [.new]) { [weak self] item, _ in
        if item.status == .failed { DispatchQueue.main.async { guard let self, self.renderRevision == revision else { return }; self.onFault() } }
      }; value.playImmediately(atRate: rate)
    }
    else {
      images.submit({ try AudienceImageDecoder.decode(url) }) { [weak self] result in
        guard let self else { return }
        switch result {
        case .success(let decoded): self.image.image = UIImage(cgImage: decoded)
        case .failure: self.blackout(); self.onFault()
        }
      }
    }
  }
  func pause() { paused = true; player?.pause() }
  func resume() {
    paused = false
    guard let player else { return }
    let duration = player.currentItem.map { CMTimeGetSeconds($0.duration) } ?? .infinity
    if !duration.isFinite || CMTimeGetSeconds(player.currentTime()) < duration { player.playImmediately(atRate: rate) }
  }
  func synchronize(_ seconds: Double) {
    defer { lastSource = seconds }
    guard let player else { return }
    let current = CMTimeGetSeconds(player.currentTime())
    let duration = player.currentItem.map { CMTimeGetSeconds($0.duration) } ?? .infinity
    let rewind = seconds < lastSource
    let revision = renderRevision
    if (!duration.isFinite || seconds < duration) && (rewind || abs(current - seconds) > 0.25) {
      player.seek(to: CMTime(seconds: seconds, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self, weak player] completed in
        DispatchQueue.main.async {
          if completed, rewind, let self, self.renderRevision == revision, !self.paused { player?.playImmediately(atRate: self.rate) }
        }
      }
    }
  }
  func showFallback() { blackout(); image.image = UIImage(systemName: "music.note"); image.tintColor = .white }
  func testPattern(_ title: String, caption: String) { blackout(); pattern.text = "\(title)\n\n+\n\n\(caption)"; pattern.layer.borderWidth = 6; pattern.layer.borderColor = UIColor.white.cgColor; pattern.isHidden = false }
  func blackout() { renderRevision &+= 1; images.cancel(); pattern.isHidden = true; itemObservation = nil; player?.pause(); player = nil; layerPlayer.player = nil; image.image = nil }
  deinit { images.close() }
}

// Expo SDK 57 initializes its single React window in didFinishLaunching. Once
// an external-scene manifest opts the app into scenes, attach that existing
// window explicitly and forward scene callbacks to Expo's app-delegate hooks.
// Reusing the protocol property avoids constructing a second React root.
@objc(ShowControlSceneDelegate)
public final class ShowControlSceneDelegate: NSObject, UIWindowSceneDelegate {
  public var window: UIWindow?
  public func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard session.role == .windowApplication, let primary = scene as? UIWindowScene, primary.screen == UIScreen.main else { return }
    let reactWindow: UIWindow? = UIApplication.shared.delegate?.window ?? nil
    guard let reactWindow else {
      assertionFailure("Expo's primary React window must exist before its scene connects")
      return
    }
    if let attached = reactWindow.windowScene, attached !== primary {
      UIApplication.shared.requestSceneSessionDestruction(session, options: nil, errorHandler: nil)
      return
    }
    reactWindow.windowScene = primary; window = reactWindow; reactWindow.makeKeyAndVisible()
    open(connectionOptions.urlContexts)
    connectionOptions.userActivities.forEach { continueActivity($0) }
  }
  public func sceneDidBecomeActive(_ scene: UIScene) { UIApplication.shared.delegate?.applicationDidBecomeActive?(UIApplication.shared) }
  public func sceneWillResignActive(_ scene: UIScene) { UIApplication.shared.delegate?.applicationWillResignActive?(UIApplication.shared) }
  public func sceneDidEnterBackground(_ scene: UIScene) { UIApplication.shared.delegate?.applicationDidEnterBackground?(UIApplication.shared) }
  public func sceneWillEnterForeground(_ scene: UIScene) { UIApplication.shared.delegate?.applicationWillEnterForeground?(UIApplication.shared) }
  public func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) { open(contexts) }
  public func scene(_ scene: UIScene, continue userActivity: NSUserActivity) { continueActivity(userActivity) }
  public func sceneDidDisconnect(_ scene: UIScene) { window?.isHidden = true; window?.windowScene = nil; window = nil }
  private func open(_ contexts: Set<UIOpenURLContext>) {
    for context in contexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      if let source = context.options.sourceApplication { options[.sourceApplication] = source }
      if let annotation = context.options.annotation { options[.annotation] = annotation }
      _ = UIApplication.shared.delegate?.application?(UIApplication.shared, open: context.url, options: options)
    }
  }
  private func continueActivity(_ activity: NSUserActivity) {
    _ = UIApplication.shared.delegate?.application?(UIApplication.shared, continue: activity, restorationHandler: { _ in })
  }
}

@objc(ShowAudienceSceneDelegate)
public final class ShowAudienceSceneDelegate: NSObject, UIWindowSceneDelegate {
  public var window: UIWindow?
  public func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let output = scene as? UIWindowScene, output.screen != UIScreen.main else {return}
    let backdrop = UIWindow(windowScene: output); let controller = UIViewController(); controller.view.backgroundColor = .black
    backdrop.rootViewController = controller; backdrop.isHidden = false; window = backdrop
    NotificationCenter.default.post(name: NSNotification.Name("ShowControlExternalSceneConnected"), object: output)
  }
  public func sceneDidDisconnect(_ scene: UIScene) { window?.isHidden = true; window = nil }
}
