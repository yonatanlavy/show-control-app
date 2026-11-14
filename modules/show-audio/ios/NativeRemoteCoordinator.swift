import Foundation
import AVFoundation
import MediaPlayer

/// No audible or diagnostic state survives a new process.
public enum NativeRemoteCoordinator {
  private static let lock = NSRecursiveLock()
  private static var armed = false
  private static var epoch: Int64 = 0
  private static var idleGeneration: Int64 = 0
  private static var preparationSequence: Int64 = 0
  private static var preparing = Set<Int64>()
  private static var diagnostics = false
  private static var mediaHandler: ((String, String) -> Bool)?
  private static var silentEngine: AVAudioEngine?
  private static var silentPlayer: AVAudioPlayerNode?
  private static var ownsSession = false
  private static var mediaTargets: [(MPRemoteCommand, Any)] = []
  private static var mediaPressTimes: [String: TimeInterval] = [:]

  public static func setArmed(_ value: Bool) {
    lock.lock(); defer { lock.unlock() }
    armed = value
    epoch += 1
    idleGeneration += 1
    mediaPressTimes.removeAll()
    if value { stopSilentTransport(); diagnostics = false }
  }
  public static func requireIdle() throws {
    lock.lock(); defer { lock.unlock() }
    if armed || !preparing.isEmpty { throw NSError(domain: "ShowController", code: 3, userInfo: [NSLocalizedDescriptionKey: "REMOTE_SETUP_ARMED: Disarm before changing controller settings."]) }
  }
  public static func beginPreparation() -> Int64 {
    lock.lock(); defer { lock.unlock() }
    idleGeneration += 1; preparationSequence += 1; preparing.insert(preparationSequence)
    return preparationSequence
  }
  public static func endPreparation(_ token: Int64) {
    lock.lock(); defer { lock.unlock() }
    if preparing.remove(token) != nil { idleGeneration += 1 }
  }
  public static func captureIdleEpoch() -> Int64? {
    lock.lock(); defer { lock.unlock() }
    return !armed && preparing.isEmpty && !diagnostics ? idleGeneration : nil
  }
  public static func isCurrentIdleEpoch(_ value: Int64) -> Bool {
    lock.lock(); defer { lock.unlock() }
    return !armed && preparing.isEmpty && !diagnostics && idleGeneration == value
  }
  public static func beginDiagnostics() throws {
    lock.lock(); defer { lock.unlock() }
    try requireIdle()
    stopSilentTransport()
    idleGeneration += 1
    do { try startSilentTransport() } catch { stopSilentTransport(); diagnostics = false; throw error }
    diagnostics = true
    mediaPressTimes.removeAll()
  }
  public static func endDiagnostics() { lock.lock(); defer { lock.unlock() }; if diagnostics { idleGeneration += 1 }; stopSilentTransport(); diagnostics = false; mediaPressTimes.removeAll() }
  public static var isDiagnostic: Bool { lock.lock(); defer { lock.unlock() }; return diagnostics }
  public static func commandEpoch(_ type: String) -> Int64? {
    lock.lock(); defer { lock.unlock() }
    guard armed else { return nil }
    if type == "PANIC_FADE" || type == "STOP_ALL" { epoch += 1 }
    return epoch
  }
  public static func isCurrentCommand(_ value: Int64) -> Bool { lock.lock(); defer { lock.unlock() }; return armed && epoch == value }
  public static func whileCurrentCommand(_ value: Int64, _ action: () -> Void) -> Bool {
    lock.lock(); defer { lock.unlock() }
    guard armed, epoch == value else { return false }
    action(); return true
  }
  public static func setMediaHandler(_ handler: ((String, String) -> Bool)?) { lock.lock(); defer { lock.unlock() }; mediaHandler = handler }
  public static func mediaInput(_ key: String, deviceId: String = "system-media", now: TimeInterval = ProcessInfo.processInfo.systemUptime) -> Bool {
    lock.lock()
    let identity = "\(deviceId):\(key)"
    if let last = mediaPressTimes[identity], now >= last, now - last < 0.08 { lock.unlock(); return true }
    if mediaPressTimes.count >= 32, let first = mediaPressTimes.keys.first { mediaPressTimes.removeValue(forKey: first) }
    mediaPressTimes[identity] = now
    let handler = mediaHandler; lock.unlock()
    return handler?(key, deviceId) ?? isDiagnostic
  }

  /// Own a silent native media session so setup receives headset/AVRCP buttons before arming.
  private static func startSilentTransport() throws {
    let session = AVAudioSession.sharedInstance()
    ownsSession = true
    try session.setCategory(.playback, mode: .default)
    try session.setActive(true)
    let engine = AVAudioEngine(); let player = AVAudioPlayerNode()
    silentEngine = engine; silentPlayer = player
    guard let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2), let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 1024) else { throw NSError(domain: "ShowController", code: 5) }
    buffer.frameLength = 1024
    for channel in 0..<2 { buffer.floatChannelData?[channel].initialize(repeating: 0, count: 1024) }
    engine.attach(player); engine.connect(player, to: engine.mainMixerNode, format: format)
    engine.mainMixerNode.outputVolume = 0
    player.scheduleBuffer(buffer, at: nil, options: .loops)
    engine.prepare(); try engine.start(); player.play()
    let remote = MPRemoteCommandCenter.shared()
    let commands: [(MPRemoteCommand, String)] = [(remote.nextTrackCommand, "MEDIA_NEXT"), (remote.previousTrackCommand, "MEDIA_PREVIOUS"), (remote.togglePlayPauseCommand, "MEDIA_PLAY_PAUSE"), (remote.playCommand, "MEDIA_PLAY"), (remote.pauseCommand, "MEDIA_PAUSE"), (remote.stopCommand, "MEDIA_STOP")]
    for (command, key) in commands {
      command.isEnabled = true
      let token = command.addTarget { _ in NativeRemoteCoordinator.mediaInput(key) ? .success : .commandFailed }
      mediaTargets.append((command, token))
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = [MPMediaItemPropertyTitle: "Show Control", MPNowPlayingInfoPropertyPlaybackRate: 1]
    MPNowPlayingInfoCenter.default().playbackState = .playing
  }
  private static func stopSilentTransport() {
    guard ownsSession || silentEngine != nil || !mediaTargets.isEmpty else { return }
    mediaTargets.forEach { $0.0.removeTarget($0.1) }; mediaTargets.removeAll()
    silentPlayer?.stop(); silentEngine?.stop(); silentEngine?.reset()
    silentPlayer = nil; silentEngine = nil
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    MPNowPlayingInfoCenter.default().playbackState = .stopped
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    ownsSession = false
  }
}
