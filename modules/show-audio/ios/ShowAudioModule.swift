import AVFoundation
import AudioToolbox
import ExpoModulesCore
import Foundation
import MediaPlayer
import CryptoKit
import UIKit

private enum EngineSafetyState {
  case normal
  case interrupted
  case routeInvalid
  case faulted
}

private struct GainEnvelope {
  var startedAt: TimeInterval
  var duration: TimeInterval
  let from: Float
  let to: Float
  let curve: String
  let stopAtEnd: Bool
  let generation: Int
}

private final class VoiceNodeSlot {
  let player = AVAudioPlayerNode()
  let timePitch = AVAudioUnitTimePitch()
  let gainUnit = AVAudioUnitEQ(numberOfBands: 0)
  let mixer = AVAudioMixerNode()
}

private final class Voice {
  let id = UUID().uuidString
  let cueId: String
  let tags: Set<String>
  let slot: VoiceNodeSlot
  var player: AVAudioPlayerNode { slot.player }
  var gainUnit: AVAudioUnitEQ { slot.gainUnit }
  var mixer: AVAudioMixerNode { slot.mixer }
  let file: AVAudioFile
  let trimStartFrame: AVAudioFramePosition
  let trimEndFrame: AVAudioFramePosition
  let fadeOutMs: Double
  let fadeCurve: String
  let endBehavior: String
  let suppressAutoFollow: Bool
  let mainTransport: Bool
  let belongsToMainSequence: Bool
  let rootEpoch: Int?
  let baseGainDb: Float
  let playbackRate: Double

  var playbackStartFrame: AVAudioFramePosition
  var playbackGeneration = 0
  var envelope: GainEnvelope?
  var envelopeGeneration = 0
  var envelopeCompletion: DispatchWorkItem?
  var cueFadeOutStarted = false
  var lastProgressEventAt: TimeInterval = 0
  var startAnnounced = false
  var hasStartTap = false
  var onStarted: (() -> Void)?

  init(
    cueId: String,
    tags: Set<String>,
    slot: VoiceNodeSlot,
    file: AVAudioFile,
    trimStartFrame: AVAudioFramePosition,
    trimEndFrame: AVAudioFramePosition,
    fadeOutMs: Double,
    fadeCurve: String,
    endBehavior: String,
    suppressAutoFollow: Bool,
    mainTransport: Bool,
    belongsToMainSequence: Bool,
    baseGainDb: Float,
    playbackRate: Double = 1,
    rootEpoch: Int? = nil
  ) {
    self.cueId = cueId
    self.tags = tags
    self.slot = slot
    self.file = file
    self.trimStartFrame = trimStartFrame
    self.trimEndFrame = trimEndFrame
    self.playbackStartFrame = trimStartFrame
    self.fadeOutMs = fadeOutMs
    self.fadeCurve = fadeCurve
    self.endBehavior = endBehavior
    self.suppressAutoFollow = suppressAutoFollow
    self.mainTransport = mainTransport
    self.belongsToMainSequence = belongsToMainSequence
    self.baseGainDb = baseGainDb
    self.playbackRate = playbackRate
    self.rootEpoch = rootEpoch
  }
}

private final class PendingAction {
  let id = UUID()
  let cueId: String?
  let block: () -> Void
  let mainTransport: Bool
  let rootEpoch: Int?
  let onCancel: (() -> Void)?
  var deadline: TimeInterval
  var workItem: DispatchWorkItem?

  init(cueId: String?, deadline: TimeInterval, mainTransport: Bool, rootEpoch: Int?, onCancel: (() -> Void)?, block: @escaping () -> Void) {
    self.cueId = cueId
    self.deadline = deadline
    self.block = block
    self.mainTransport = mainTransport
    self.rootEpoch = rootEpoch
    self.onCancel = onCancel
  }
}

private struct SuspendedAction {
  let cueId: String?
  let remaining: TimeInterval
  let block: () -> Void
  let mainTransport: Bool
  let rootEpoch: Int?
  let onCancel: (() -> Void)?
}

private final class OmsCrossfadeTransition {
  let outgoingVoiceId: String
  let generation: Int
  var incomingStarted = false
  var incomingEndedNaturally = false
  init(outgoingVoiceId: String, generation: Int) { self.outgoingVoiceId = outgoingVoiceId; self.generation = generation }
}

private struct ValidatedAudioAsset {
  let file: AVAudioFile
  let trimStartFrame: AVAudioFramePosition
  let trimEndFrame: AVAudioFramePosition
}

private struct RootEntry {
  let key: String
  let cueId: String
  let cue: [String: Any]
  let delay: TimeInterval
}

private final class RootAdmission {
  let gate: RootAdmissionGate
  let targetCueId: String?
  let entries: [RootEntry]
  var assets: [String: ValidatedAudioAsset]
  var preparation: DispatchWorkItem?
  var timeout: DispatchWorkItem?
  var exitDelayElapsed = false
  let outgoingVoiceIds: Set<String>
  let controllerEpoch: Int64
  let crossfade: Voice?
  let startIncoming: Bool
  init(gate: RootAdmissionGate, targetCueId: String?, entries: [RootEntry], assets: [String: ValidatedAudioAsset], outgoingVoiceIds: Set<String>, controllerEpoch: Int64, crossfade: Voice?, startIncoming: Bool) {
    self.gate = gate; self.targetCueId = targetCueId; self.entries = entries; self.assets = assets
    self.outgoingVoiceIds = outgoingVoiceIds; self.controllerEpoch = controllerEpoch
    self.crossfade = crossfade; self.startIncoming = startIncoming
  }
}

public final class ShowAudioModule: Module {
  private let commandQueue = DispatchQueue(label: "app.showcontrol.audio.commands", qos: .userInteractive)
  private let rootPreparationQueue = DispatchQueue(label: "app.showcontrol.audio.root-preparation", qos: .userInitiated)
  private let emergencyQueue = DispatchQueue(label: "app.showcontrol.audio.emergency", qos: .userInteractive)
  private let admissionLock = NSLock()
  private let emergencyLock = NSRecursiveLock()
  private let audioSessionGate = AudioSessionInterruptionGate()
  private var engine = AVAudioEngine()
  private let voiceLimit = 8

  private var cues: [String: [String: Any]] = [:]
  private var cueOrder: [String] = []
  private var nextCueIndex = 0
  private var voices: [String: Voice] = [:]
  private var voiceSlots: [VoiceNodeSlot] = []
  private var availableVoiceSlots: [VoiceNodeSlot] = []
  private var pendingActions: [UUID: PendingAction] = [:]
  private var suspendedActions: [SuspendedAction] = []
  private var mainRootEpoch = 0
  private var rootLaunching = false
  private var rootHeldForGo = false
  private var rootAdvanceOnCompletion = true
  private var rootForceAutoplay = false
  private var rootAwaitingFirstStart = false
  private var rootCompletionQueued: Int?
  private var rootAdmission: RootAdmission?
  private var lastRootRefusal: [String: String]?
  private var progressTimer: DispatchSourceTimer?
  private var interruptionObserver: NSObjectProtocol?
  private var routeObserver: NSObjectProtocol?
  private var mediaResetObserver: NSObjectProtocol?
  private var mediaLostObserver: NSObjectProtocol?
  private var panicFadeMs: Double = 2_000
  private var lastObservedCommandId = 0
  private var urgentTokens: [Int: UUID] = [:]
  private var hardMutedUrgentCommands: Set<Int> = []
  private var prepared = false
  private var preparedSnapshotJson: String?
  private var paused = false
  private var pausedAt: TimeInterval?
  private var safetyState = EngineSafetyState.normal
  private var transportMode = "legacyCueStack"
  private var sessionPurpose = "performance"
  private var selectedIndex = 0
  private var mainCueId: String?
  private var mainVoiceId: String?
  private var showId = ""
  private var setId = ""
  private var revisionId = ""
  private var transitioning = false
  private var omsCrossfade: OmsCrossfadeTransition?
  private var refusedAutomaticCrossfadeVoiceId: String?
  private var runGeneration = 0
  private var nativeSequence = 0
  private var previewMode = false
  private var preparingSnapshot = false
  private var semanticObserver: NSObjectProtocol?
  private var seenSemanticEvents = Set<String>()

  public func definition() -> ModuleDefinition {
    Name("ShowAudio")
    Events("onEngineEvent")

    AsyncFunction("prepare") { (snapshotJson: String) in
      let preparation = NativeRemoteCoordinator.beginPreparation()
      defer { NativeRemoteCoordinator.endPreparation(preparation) }
      try self.commandQueue.sync {
        NativeRemoteCoordinator.setArmed(true)
        self.previewMode = false
        do { try self.prepareInternal(snapshotJson) }
        catch { self.preparingSnapshot = false; self.emitSafetyStop("invalid_prepare"); NativeRemoteCoordinator.setArmed(self.prepared); throw error }
      }
    }

    AsyncFunction("dispatch") { (commandJson: String) in
      guard let command = try self.decodeObject(commandJson), let type = command["type"] as? String else {
        throw self.error(2, "Invalid engine command")
      }
      let commandId = self.number(command, "id", default: 0).intValue
      guard commandId > 0, self.admitCommandId(commandId) else {
        self.commandQueue.async {
          self.fault("STALE_COMMAND", "A stale, duplicate, or invalid engine command was rejected.")
        }
        return
      }
      if type == "PANIC_FADE" || type == "STOP_ALL" || type == "STOP" {
        _ = NativeRemoteCoordinator.commandEpoch("STOP_ALL")
        self.armUrgentMute(commandId: commandId, type: type)
      }
      self.commandQueue.async {
        self.dispatchInternal(command, commandId: commandId)
      }
    }

    AsyncFunction("dispatchUrgent") { (commandJson: String) in
      guard let command = try self.decodeObject(commandJson), let type = command["type"] as? String else {
        throw self.error(2, "Invalid urgent engine command")
      }
      guard type == "PANIC_FADE" || type == "STOP_ALL" || type == "STOP" else {
        throw self.error(3, "Only panic and stop commands may use the urgent native path")
      }
      let commandId = self.number(command, "id", default: 0).intValue
      guard commandId > 0, self.admitCommandId(commandId) else {
        self.commandQueue.async {
          self.fault("STALE_COMMAND", "A stale, duplicate, or invalid urgent command was rejected.")
        }
        return
      }

      // Cross the bridge independently of ordinary JavaScript dispatch. A panic
      // gets a 40 ms watchdog: the native fade remains audible when admitted
      // promptly, while a blocked command queue still fails silent. Stop-all
      // retains the immediate watchdog path.
      _ = NativeRemoteCoordinator.commandEpoch("STOP_ALL")
      self.armUrgentMute(commandId: commandId, type: type)
      self.commandQueue.async {
        self.dispatchInternal(command, commandId: commandId)
      }
    }

    AsyncFunction("shutdown") {
      self.commandQueue.sync {
        self.shutdownInternal()
      }
    }
    AsyncFunction("getState") { self.commandQueue.sync { self.runState() } }
    // Reading a surviving owner never prepares, dispatches or resets admission.
    AsyncFunction("getPreparedSession") { () -> [String: Any]? in
      self.commandQueue.sync {
        guard self.prepared, !self.previewMode, let snapshot = self.preparedSnapshotJson else { return nil }
        self.admissionLock.lock()
        let watermark = self.lastObservedCommandId
        self.admissionLock.unlock()
        return ["snapshotJson": snapshot, "state": self.runState(), "commandIdWatermark": watermark]
      }
    }
    AsyncFunction("getBackgroundReliability") { () -> [String: Any] in
      let none = NSNull()
      let configured = (Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String])?.contains("audio") ?? false
      let device = UIDevice.current
      let monitoringWasEnabled = device.isBatteryMonitoringEnabled
      device.isBatteryMonitoringEnabled = true
      defer { device.isBatteryMonitoringEnabled = monitoringWasEnabled }
      let level = device.batteryLevel
      let charging: Any
      switch device.batteryState {
      case .charging, .full: charging = true
      case .unplugged: charging = false
      default: charging = none
      }
      let thermal: Any
      switch ProcessInfo.processInfo.thermalState {
      case .nominal: thermal = "normal"
      case .fair: thermal = "warm"
      case .serious: thermal = "hot"
      case .critical: thermal = "critical"
      @unknown default: thermal = none
      }
      return [
        "platform": "ios", "checkedAtMonotonicMs": ProcessInfo.processInfo.systemUptime * 1_000,
        "batteryOptimizationIgnored": none, "backgroundRestricted": none,
        "powerSaveMode": ProcessInfo.processInfo.isLowPowerModeEnabled,
        "batteryLevelPercent": level.isFinite && level >= 0 && level <= 1 ? Int((level * 100).rounded()) as Any : none,
        "batteryCharging": charging, "thermalState": thermal,
        "notificationPermissionGranted": none, "notificationsEnabled": none,
        "playbackChannelCreated": none, "playbackChannelBlocked": none,
        "serviceRunning": none, "foregroundServiceActive": none,
        "backgroundAudioConfigured": configured,
      ]
    }.runOnQueue(.main)
    AsyncFunction("openBackgroundSettings") { (target: String, promise: Promise) in
      do { try NativeRemoteCoordinator.requireIdle() }
      catch { promise.reject("BACKGROUND_SETTINGS_ARMED", "Leave the prepared session before opening device settings."); return }
      guard target == "app", let url = URL(string: UIApplication.openSettingsURLString) else {
        promise.resolve(["opened": false, "requestedTarget": target, "openedTarget": NSNull(), "usedFallback": false] as [String: Any]); return
      }
      UIApplication.shared.open(url, options: [:]) { opened in
        promise.resolve(["opened": opened, "requestedTarget": target, "openedTarget": opened ? "app" as Any : NSNull(), "usedFallback": false] as [String: Any])
      }
    }.runOnQueue(.main)
    AsyncFunction("dispatchSemantic") { (json: String) in
      guard let command = try self.decodeObject(json) else { throw self.error(2, "Invalid semantic command") }
      try self.commandQueue.sync { try self.admitSemantic(command) }
    }
    AsyncFunction("probeMedia") { (uri: String) in try self.probeMedia(uri) }
    AsyncFunction("sha256File") { (uri: String) in try self.hashFile(uri) }
    AsyncFunction("waveform") { (uri: String, buckets: Int) in try self.waveform(uri, buckets: buckets) }
    AsyncFunction("previewCue") { (json: String, positionMs: Double, initialPaused: Bool) in
      try self.commandQueue.sync {
        guard !self.prepared || self.previewMode else { throw self.error(20, "Disarm before auditioning edits") }
        do {
          guard var cue = try self.decodeObject(json), let id = cue["id"] as? String else { throw self.error(2, "Invalid preview cue") }
          cue["preWaitMs"] = 0
          cue["endBehavior"] = "stopAndReadyNext"
          cue["autoPlay"] = false
          let root: [String: Any] = ["schemaVersion": 2, "transportMode": "legacyCueStack", "voiceLimit": 8, "cues": [id: cue], "cueOrder": [id]]
          self.previewMode = true
          try self.prepareInternal(String(decoding: JSONSerialization.data(withJSONObject: root), as: UTF8.self))
          self.previewMode = true
          self.paused = initialPaused
          self.pausedAt = initialPaused ? self.monotonicNow : nil
          guard self.trigger(id, allowGroup: false, suppressAutoFollow: true, mainTransport: false) else { throw self.error(21, "Preview audio rejected") }
          if positionMs > self.number(cue, "trimInMs").doubleValue { _ = self.seek(["cueId": id, "positionMs": positionMs]) }
          self.emitPreviewState()
        } catch {
          // Failed isolated preparation must release audio-session/remote
          // ownership before Retry. Never tear down a protected main show.
          if self.previewMode { self.shutdownInternal(); self.previewMode = false }
          throw error
        }
      }
    }
    AsyncFunction("seekPreview") { (positionMs: Double) in
      try self.commandQueue.sync {
        guard self.previewMode, let id = self.voices.values.first?.cueId else { throw self.error(22, "No preview is playing") }
        guard self.seek(["cueId": id, "positionMs": positionMs]) else { throw self.error(23, "Cannot seek preview") }
        self.emitPreviewState()
      }
    }
    AsyncFunction("pausePreview") { try self.commandQueue.sync { try self.setPreviewPaused(true) } }
    AsyncFunction("resumePreview") { try self.commandQueue.sync { try self.setPreviewPaused(false) } }
    AsyncFunction("stopPreview") { self.commandQueue.sync { if self.previewMode { self.shutdownInternal(); self.previewMode = false } } }

    OnDestroy {
      if let observer = self.semanticObserver { NotificationCenter.default.removeObserver(observer); self.semanticObserver = nil }
      self.commandQueue.sync {
        self.shutdownInternal()
      }
    }
    OnCreate {
      self.semanticObserver = NotificationCenter.default.addObserver(forName: NSNotification.Name("ShowControlSemanticCommand"), object: nil, queue: nil) { [weak self] notification in
        guard let self, let command = notification.userInfo?["command"] as? [String: Any] ?? notification.userInfo as? [String: Any] else { return }
        let type = command["type"] as? String ?? ""
        let epoch = (command["controllerEpoch"] as? NSNumber)?.int64Value
        guard epoch.map({ NativeRemoteCoordinator.isCurrentCommand($0) }) ?? true else { return }
        let urgent = type == "PANIC_FADE" || type == "STOP_ALL"
        let urgentId = -Int(epoch ?? 0) - 1
        if urgent { self.armUrgentMute(commandId: urgentId, type: type) }
        self.commandQueue.async {
          let hardMuted = urgent && self.consumeUrgentMute(commandId: urgentId)
          guard epoch.map({ NativeRemoteCoordinator.isCurrentCommand($0) }) ?? true else { if hardMuted { self.restoreEmergencyOutputIfSafe() }; return }
          if hardMuted { self.stopAll(); self.mainCueId = nil; self.transitioning = false; self.restoreEmergencyOutputIfSafe(); self.emitRunState(); return }
          do { try self.admitSemantic(command) } catch { self.fault("SEMANTIC_REJECTED", error.localizedDescription) }
        }
      }
    }
  }

  // MARK: - Prepare and command routing

  private func prepareInternal(_ json: String) throws {
    guard let root = try decodeObject(json),
          [1, 2].contains(number(root, "schemaVersion", default: 0).intValue),
          number(root, "voiceLimit", default: 0).intValue == voiceLimit,
          let parsedCues = root["cues"] as? [String: [String: Any]],
          let parsedCueOrder = root["cueOrder"] as? [String] else {
      throw error(1, "Invalid or unsupported run snapshot")
    }
    let requestedPanicFadeMs = number(root, "panicFadeMs", default: 2_000).doubleValue
    guard requestedPanicFadeMs.isFinite, requestedPanicFadeMs >= 0 else {
      throw error(4, "The run snapshot has an invalid panic fade duration")
    }
    let requestedPurpose = root["sessionPurpose"] ?? "performance"
    guard let purpose = requestedPurpose as? String, ["performance", "rehearsal"].contains(purpose) else { throw error(1, "Invalid runtime session purpose") }

    let observationEpoch = audioSessionGate.beginPreparation()
    preparingSnapshot = true
    defer {
      preparingSnapshot = false
      if !prepared {
        audioSessionGate.invalidate()
        emergencyMuteNow()
        stopAll(emitState: false, cancelScheduled: true)
        removeObservers()
        removeRemoteCommands()
        engine.stop()
      }
    }
    prepared = false
    preparedSnapshotJson = nil
    emergencyMuteNow()
    removeObservers()
    stopAll(emitState: false, cancelScheduled: true)
    emergencyLock.lock()
    if engine.isRunning {
      engine.stop()
    }
    engine = AVAudioEngine()
    engine.mainMixerNode.outputVolume = 0
    emergencyLock.unlock()
    voiceSlots.removeAll()
    availableVoiceSlots.removeAll()

    // Once any previous run is safely silent, validate every audio asset before
    // accepting the new immutable Armed snapshot.
    try validateSnapshotAudioMedia(parsedCues)

    cues = parsedCues
    showId = string(root, "showId", default: "")
    setId = string(root, "setId", default: "")
    revisionId = string(root, "revisionId", default: "")
    cueOrder = parsedCueOrder
    transportMode = number(root, "schemaVersion").intValue == 2 ? string(root, "transportMode", default: "legacyCueStack") : "legacyCueStack"
    sessionPurpose = purpose
    selectedIndex = 0
    mainCueId = nil
    transitioning = false
    runGeneration += 1
    seenSemanticEvents.removeAll()
    nextCueIndex = 0
    panicFadeMs = requestedPanicFadeMs
    resetCommandAdmission()
    paused = false
    pausedAt = nil
    safetyState = .normal

    // Observe activation as well as playback. An interruption during prepare
    // closes the gate synchronously and prevents a false Ready result.
    installObservers(epoch: observationEpoch)
    try configureSession()
    configureVoiceGraph()
    engine.prepare()
    try engine.start()
    guard audioSessionGate.withPlaybackPermission(epoch: observationEpoch, {
      emergencyLock.lock()
      engine.mainMixerNode.outputVolume = 1
      prepared = true
      preparedSnapshotJson = json
      emergencyLock.unlock()
    }) else { throw error(24, "Audio was interrupted during preparation; prepare again deliberately") }
    installRemoteCommands()
    preparingSnapshot = false
    updateNowPlaying(state: .paused)
    emit(["type": "STATE", "state": "ready"])
    emitRunState()
  }

  private func dispatchInternal(
    _ command: [String: Any],
    commandId: Int,
    forcedEmergencyMute: Bool = false
  ) {
    let hardMuted = forcedEmergencyMute || consumeUrgentMute(commandId: commandId)
    guard let type = command["type"] as? String else { return }
    let safetyCommand = type == "STOP_ALL" || type == "PANIC_FADE" || type == "STOP"
    guard prepared || safetyCommand else {
      fault("ENGINE_NOT_PREPARED", "The native audio engine is not prepared.")
      if hardMuted { restoreEmergencyOutputIfSafe() }
      return
    }
    if !safetyCommand && (!audioSessionGate.permitsPlayback || safetyState != .normal) {
      fault("RECOVERY_REQUIRED", "Prepare the run snapshot again after an interruption.")
      return
    }
    if !safetyCommand && !engine.isRunning {
      fault("ENGINE_NOT_PREPARED", "The native audio engine is not running; prepare the run again.")
      return
    }

    if safetyState == .routeInvalid || safetyState == .faulted {
      if type != "STOP_ALL" && type != "PANIC_FADE" && type != "STOP" {
        fault("RECOVERY_REQUIRED", "Prepare the run snapshot again before playback.")
        if hardMuted { restoreEmergencyOutputIfSafe() }
        return
      }
    }

    var accepted = false
    switch type {
    case "GO", "PLAY", "PREVIOUS", "SKIP", "SELECT", "START_SELECTED", "REPLAY", "SCHEDULE":
      do { try self.executeSemantic(command); accepted = true } catch { if !isRecoverableRefusal(error) { fault("SEMANTIC_REJECTED", error.localizedDescription) } }
    case "TRIGGER_CUE", "TRIGGER_GROUP", "TRIGGER_HIT":
      guard safetyState == .normal, !paused, let cueId = command["cueId"] as? String else {
        fault("RECOVERY_REQUIRED", "Playback requires an explicit recovery action.")
        if hardMuted { restoreEmergencyOutputIfSafe() }
        return
      }
      if transportMode == "oms", type != "TRIGGER_HIT" {
        do { try executeSemantic(["type": "START_SELECTED", "cueId": cueId]); accepted = true }
        catch { if !isRecoverableRefusal(error) { fault("SEMANTIC_REJECTED", error.localizedDescription) } }
        break
      }
      accepted = trigger(cueId, allowGroup: true, suppressAutoFollow: type == "TRIGGER_HIT", mainTransport: type != "TRIGGER_HIT")
      if accepted && type != "TRIGGER_HIT" { synchronizeCuePointer(after: cueId); selectedIndex = cueOrder.firstIndex(of: cueId) ?? selectedIndex; mainCueId = cueId }
    case "PAUSE":
      guard safetyState == .normal else {
        fault("RECOVERY_REQUIRED", "Pause is unavailable until the run is recovered.")
        if hardMuted { restoreEmergencyOutputIfSafe() }
        return
      }
      pauseAll(userInitiated: true)
      accepted = true
    case "RESUME":
      accepted = resumeAll()
    case "PANIC_FADE":
      panicFade(hardMuted: hardMuted)
      accepted = true
    case "STOP_ALL":
      emitSafetyStop("stop")
      mainCueId = nil
      transitioning = false
      stopAll()
      accepted = true
    case "FADE":
      guard let selected = selectedVoices(command) else {
        if hardMuted { restoreEmergencyOutputIfSafe() }
        return
      }
      let durationMs = number(command, "durationMs").doubleValue
      if command["stopAtEnd"] as? Bool == true {
        if selected.contains(where: { $0.rootEpoch == mainRootEpoch }) { rootAdvanceOnCompletion = false }
        cancelRootAdmissionIfSelected(command)
        cancelScheduledActions(matching: selectedCueIds(command))
      }
      guard durationMs.isFinite, durationMs >= 0 else {
        fault("TIMING_INVALID", "The fade command contains an invalid duration.")
        if hardMuted { restoreEmergencyOutputIfSafe() }
        return
      }
      fadeVoices(
        selected,
        milliseconds: durationMs,
        curve: string(command, "curve", default: "smooth"),
        stopAtEnd: command["stopAtEnd"] as? Bool ?? false
      )
      accepted = true
    case "STOP":
      guard let selected = selectedVoices(command) else {
        if hardMuted { restoreEmergencyOutputIfSafe() }
        return
      }
      if selected.contains(where: { $0.rootEpoch == mainRootEpoch }) { rootAdvanceOnCompletion = false }
      cancelRootAdmissionIfSelected(command)
      cancelScheduledActions(matching: selectedCueIds(command))
      selected.forEach { removeVoice($0.id, emitEnd: true) }
      emitAuthoritativePlaybackState()
      accepted = true
    case "SEEK_REHEARSAL":
      guard sessionPurpose == "rehearsal", !previewMode else { fault("SEEK_REHEARSAL_ONLY", "Seeking is available only in a prepared rehearsal."); return }
      accepted = seek(command)
    default:
      fault("UNKNOWN_COMMAND", "The native engine received an unknown command.")
    }

    guard accepted else {
      if hardMuted { restoreEmergencyOutputIfSafe() }
      return
    }
    emit([
      "type": "ACK",
      "commandId": commandId,
      "receivedAtMonotonicMs": monotonicNow * 1_000,
    ])
    emitRunState()
    if hardMuted { restoreEmergencyOutputIfSafe() }
  }

  private func admitSemantic(_ command: [String: Any]) throws {
    do { try admitSemanticInternal(command) }
    catch { emitSemanticReceipt(command, result: "rejected"); throw error }
  }

  private func emitSemanticReceipt(_ command: [String: Any], result: String) {
    guard !previewMode else { return }
    NotificationCenter.default.post(name: NSNotification.Name("ShowControlRunState"), object: nil, userInfo: ["event": ["type": "SEMANTIC_RECEIPT", "eventId": command["eventId"] as? String ?? "", "result": result, "nativeCommandId": nativeSequence, "generation": runGeneration, "monotonicMs": monotonicNow * 1000]])
  }

  private func admitSemanticInternal(_ command: [String: Any]) throws {
    if let epoch = (command["controllerEpoch"] as? NSNumber)?.int64Value, !NativeRemoteCoordinator.isCurrentCommand(epoch) { return }
    try validateSemanticContext(command)
    if let eventId = command["eventId"] as? String {
      guard seenSemanticEvents.insert(eventId).inserted else { return }
      if seenSemanticEvents.count > 1024 { seenSemanticEvents = [eventId] }
    }
    let delay = number(command, "delayMs").doubleValue
    guard delay.isFinite, delay >= 0, delay <= 86_400_000 else { throw error(23, "Invalid command delay") }
    guard delay == 0 || (prepared && safetyState == .normal && audioSessionGate.permitsPlayback) else { throw error(25, "Prepare again before scheduling commands after an interruption") }
    if delay > 0, command["type"] as? String != "SCHEDULE" {
      let generation = runGeneration
      let index = selectedIndex
      schedule(after: delay / 1000, cueId: mainCueId) { [weak self] in
        guard let self, self.runGeneration == generation, self.selectedIndex == index else { return }
        do { try self.executeSemantic(command); self.emitRunState() } catch { if !self.isRecoverableRefusal(error) { self.fault("DELAYED_COMMAND_REJECTED", error.localizedDescription) } }
      }
    } else { try executeSemantic(command) }
    nativeSequence += 1
    emitSemanticReceipt(command, result: "accepted")
    emitRunState()
  }

  private func executeSemantic(_ command: [String: Any]) throws {
    try validateSemanticContext(command)
    guard prepared, let type = command["type"] as? String else { throw error(24, "Prepare a run first") }
    guard !previewMode || type == "PANIC_FADE" || type == "STOP_ALL" else { throw error(29, "Editor audition cannot accept show commands") }
    if type == "STOP_ALL" { emitSafetyStop("stop"); transitioning = false; mainCueId = nil; runGeneration += 1; stopAll(); emitRunState(); return }
    if type == "PANIC_FADE" {
      panicFade()
      emitRunState(); return
    }
    guard safetyState == .normal, audioSessionGate.permitsPlayback else { throw error(25, "Explicit route/interruption recovery is required") }
    switch type {
    case "SCHEDULE":
      guard let nested = command["command"] as? [String: Any] else { throw error(2, "Missing scheduled command") }
      let delay = number(command, "delayMs").doubleValue
      guard delay.isFinite, (0...86_400_000).contains(delay) else { throw error(23, "Invalid delay") }
      let generation = runGeneration
      let index = selectedIndex
      schedule(after: delay / 1000, cueId: mainCueId) { [weak self] in
        guard let self, self.runGeneration == generation, self.selectedIndex == index else { return }
        do { try self.executeSemantic(nested); self.emitRunState() } catch { if !self.isRecoverableRefusal(error) { self.fault("DELAYED_COMMAND_REJECTED", error.localizedDescription) } }
      }
    case "GO":
      if transportMode != "oms" { if paused { _ = resumeAll() } else { _ = advanceNextCue(reason: "semantic_go") } }
      else {
        switch rootGoAction(paused: paused, transitioning: transitioning, rootStarted: mainCueId != nil, primaryAudioActive: mainVoiceId.flatMap { voices[$0] } != nil) {
        case .resume: _ = resumeAll()
        case .ignore: return
        case .advanceRoot, .advanceAudio: if !advanceOms(manualAdvance: true) { throw recoverableRefusal() }
        case .start: if !startSelectedOms() { throw recoverableRefusal() }
        }
      }
    case "PLAY":
      if let id = command["cueId"] as? String { try executeSemantic(["type": "START_SELECTED", "cueId": id]) }
      else if paused { _ = resumeAll() } else if mainCueId == nil, !startSelectedOms() { throw recoverableRefusal() }
    case "PAUSE_RESUME": if paused { _ = resumeAll() } else if !voices.isEmpty || !pendingActions.isEmpty || rootAdmission != nil || rootHeldForGo { pauseAll(userInitiated: true) }
    case "TRIGGER_HIT":
      guard let id = command["cueId"] as? String, trigger(id, allowGroup: true, suppressAutoFollow: true, mainTransport: false) else { throw recoverableRefusal() }
    case "PAUSE":
      if !paused, !voices.isEmpty || !pendingActions.isEmpty || rootAdmission != nil || rootHeldForGo { pauseAll(userInitiated: true) }
    case "RESUME": if paused { _ = resumeAll() }
    case "PREVIOUS", "SKIP", "SELECT", "START_SELECTED", "REPLAY":
      var target = selectedIndex
      if type == "PREVIOUS" { target = max(0, target - 1) }
      if type == "SKIP" { target = min(cueOrder.count, target + 1) }
      if type == "SELECT" || type == "START_SELECTED" {
        guard let id = command["cueId"] as? String, let index = cueOrder.firstIndex(of: id) else { throw error(26, "Cue is outside the armed set") }
        target = index
      }
      if transportMode == "oms" { stopMainForSelection() }
      else { stopAll(reason: "selection"); runGeneration += 1; transitioning = false; paused = false; mainCueId = nil }
      selectedIndex = target; nextCueIndex = target
      if type == "REPLAY" || type == "START_SELECTED", !startSelectedOms() { throw recoverableRefusal() }
    default: throw error(2, "Unsupported semantic command")
    }
  }

  private func validateSemanticContext(_ command: [String: Any]) throws {
    if command["generation"] != nil, number(command, "generation").intValue != runGeneration { throw error(28, "The command belongs to a replaced run") }
    if let capturedCueId = command["capturedCueId"] as? String {
      let selectedCueId = selectedIndex < cueOrder.count ? cueOrder[selectedIndex] : ""
      guard capturedCueId == selectedCueId else { throw error(28, "The command belongs to a replaced song selection") }
    }
  }

  @discardableResult
  private func startSelectedOms() -> Bool {
    guard prepared, safetyState == .normal, audioSessionGate.permitsPlayback else { return false }
    guard selectedIndex < cueOrder.count else { return false }
    if transportMode == "oms" { return stageOmsRoot(target: selectedIndex, startIncoming: true, crossfade: nil) }
    let id = cueOrder[selectedIndex]
    mainCueId = id
    transitioning = (cues[id].map { number($0, "preWaitMs").doubleValue } ?? 0) > 0
    let accepted = trigger(id, allowGroup: true, suppressAutoFollow: transportMode == "oms")
    if accepted { nextCueIndex = selectedIndex + 1 }
    emitRunState()
    return accepted
  }

  @discardableResult
  private func advanceOms(manualAdvance: Bool = false) -> Bool {
    guard audioSessionGate.permitsPlayback, mainCueId != nil, !transitioning, rootAdmission == nil else { return false }
    let target = selectedIndex + 1
    let incoming = target < cueOrder.count ? cues[cueOrder[target]] : nil
    let outgoing = mainVoiceId.flatMap { voices[$0] }
    let overlap = outgoing.flatMap { voice in cues[voice.cueId]?["crossfadeEnabled"] as? Bool == true && incoming?["autoPlay"] as? Bool == true ? voice : nil }
    let accepted = stageOmsRoot(target: target, startIncoming: manualAdvance || incoming?["autoPlay"] as? Bool == true, crossfade: overlap)
    if !accepted { refusedAutomaticCrossfadeVoiceId = outgoing?.id }
    return accepted
  }

  private func finishOmsCrossfadeIfReady() {
    guard let transition = omsCrossfade, transition.generation == runGeneration,
          transition.incomingStarted, voices[transition.outgoingVoiceId] == nil else { return }
    omsCrossfade = nil; transitioning = false
    checkRootCompletion()
    emitRunState()
  }

  private func finishOmsMainNaturally() {
    guard safetyState == .normal, audioSessionGate.permitsPlayback else { return }
    let advance = rootAdvanceOnCompletion
    let forceStart = rootForceAutoplay
    lastRootRefusal = nil
    refusedAutomaticCrossfadeVoiceId = nil
    cancelMainActions()
    mainRootEpoch += 1; rootCompletionQueued = nil; rootHeldForGo = false; rootAwaitingFirstStart = false
    if advance { selectedIndex += 1 }
    nextCueIndex = selectedIndex
    mainCueId = nil
    mainVoiceId = nil
    if advance, selectedIndex < cueOrder.count, forceStart || cues[cueOrder[selectedIndex]]?["autoPlay"] as? Bool == true { _ = startSelectedOms() }
    emitRunState()
  }

  private func emitRootRefusal(_ code: String, _ message: String, cueId: String? = nil) {
    lastRootRefusal = ["code": code, "message": message]
    emit(["type": "TRANSITION_REFUSED", "code": code, "message": message, "cueId": cueId ?? "", "generation": runGeneration, "monotonicMs": monotonicNow * 1000])
  }

  private func recoverableRefusal() -> NSError { NSError(domain: "ShowAudio", code: 73, userInfo: [NSLocalizedDescriptionKey: "RECOVERABLE_REFUSAL: The incoming cue was refused; current playback was retained."]) }

  private func isRecoverableRefusal(_ failure: Error) -> Bool { let native = failure as NSError; return native.domain == "ShowAudio" && native.code == 73 }

  @discardableResult
  private func stageOmsRoot(target: Int, startIncoming: Bool, crossfade: Voice?) -> Bool {
    guard prepared, safetyState == .normal, audioSessionGate.permitsPlayback, rootAdmission == nil, !transitioning,
          let controllerEpoch = NativeRemoteCoordinator.commandEpoch("ROOT_PREPARATION") else { return false }
    let targetId = target < cueOrder.count ? cueOrder[target] : nil
    var entries: [RootEntry] = []
    do {
      if startIncoming, let id = targetId {
        guard let root = cues[id] else { throw error(2, "Incoming cue unavailable") }
        let children: [(String, Double)]
        if root["type"] as? String == "group" {
          guard let raw = root["children"] as? [[String: Any]] else { throw error(2, "Invalid group children") }
          children = try raw.map { child in
            guard let childId = child["cueId"] as? String else { throw error(2, "Missing group child") }
            guard let type = cues[childId]?["type"] as? String, ["audio", "fade", "stop"].contains(type) else { throw error(2, "Unsupported group child") }
            return (childId, number(child, "offsetMs").doubleValue)
          }
        } else { children = [(id, 0)] }
        entries = try children.map { (id, offset) in
          guard let cue = cues[id], let type = cue["type"] as? String,
                ["audio", "fade", "stop", "wait"].contains(type), offset.isFinite, offset >= 0 else { throw error(2, "Incoming cue unavailable") }
          let wait = type == "audio" ? number(cue, "preWaitMs").doubleValue : 0
          guard wait.isFinite, wait >= 0, offset + wait <= 172_800_000 else { throw error(2, "Incoming delay invalid") }
          var preparedCue = cue
          if let crossfade { preparedCue["fadeInMs"] = number(cues[crossfade.cueId] ?? [:], "crossfadeMs", default: 2000).doubleValue }
          return RootEntry(key: UUID().uuidString, cueId: id, cue: preparedCue, delay: (offset + wait) / 1000)
        }
      }
      let audioEntries = entries.filter { $0.cue["type"] as? String == "audio" }
      let independent = voices.values.filter { !$0.belongsToMainSequence }.count
      let reservations = independentAudioReservationCount
      guard rootFutureCapacity(independentVoices: independent, independentReservations: reservations, incomingVoices: audioEntries.count),
            crossfade == nil || voices.count + pendingAudioVoiceCount + audioEntries.count <= voiceLimit else {
        rootHeldForGo = mainCueId != nil; refusedAutomaticCrossfadeVoiceId = crossfade?.id
        emitRootRefusal("CAPACITY_REFUSAL", "The incoming cue needs more free voice slots. Stop a Hit or retry after it finishes.", cueId: targetId)
        return false
      }
      let gate = RootAdmissionGate(generation: runGeneration, rootEpoch: mainRootEpoch, targetIndex: target, preparedKeys: Set(audioEntries.map(\.key)))
      guard NativeRemoteCoordinator.isCurrentCommand(controllerEpoch), safetyState == .normal, audioSessionGate.permitsPlayback else { return false }
      let admission = RootAdmission(gate: gate, targetCueId: targetId, entries: entries, assets: [:],
        outgoingVoiceIds: Set(voices.values.filter(\.belongsToMainSequence).map(\.id)), controllerEpoch: controllerEpoch, crossfade: crossfade, startIncoming: startIncoming)
      rootAdmission = admission; transitioning = true; rootHeldForGo = false
      if audioEntries.isEmpty { maybeBeginRootAdmission(admission) }
      else {
        let timeout = DispatchWorkItem { [weak self, weak admission] in
          guard let self, let admission else { return }
          self.refuseRootAdmission(admission, code: "PREPARE_TIMEOUT", message: "Incoming audio did not become ready. The current cue was retained; retry deliberately.")
        }
        admission.timeout = timeout
        commandQueue.asyncAfter(deadline: .now() + 5, execute: timeout)
        let preparation = DispatchWorkItem { [weak self, weak admission] in
          guard let self, let admission, admission.preparation?.isCancelled != true else { return }
          do {
            var assets: [String: ValidatedAudioAsset] = [:]
            for entry in audioEntries {
              guard admission.preparation?.isCancelled != true, NativeRemoteCoordinator.isCurrentCommand(admission.controllerEpoch) else { return }
              assets[entry.key] = try self.validateAudioCue(cueId: entry.cueId, cue: entry.cue, decodeProbe: true)
            }
            let preparedAssets = assets
            self.commandQueue.async { [weak self, weak admission] in
              guard let self, let admission, self.rootAdmissionIsCurrent(admission) else { return }
              admission.assets = preparedAssets
              for key in preparedAssets.keys { admission.gate.markReady(key, generation: self.runGeneration, rootEpoch: self.mainRootEpoch) }
              self.maybeBeginRootAdmission(admission)
            }
          } catch {
            self.commandQueue.async { [weak self, weak admission] in
              guard let self, let admission else { return }
              self.refuseRootAdmission(admission, code: "DECODE_FAILED", message: "Incoming audio could not be decoded. The current cue was retained; repair the media before retrying.")
            }
          }
        }
        admission.preparation = preparation
        rootPreparationQueue.async(execute: preparation)
      }
      emitRunState()
      return true
    } catch {
      rootHeldForGo = mainCueId != nil
      emitRootRefusal("PREPARE_FAILED", "Incoming audio could not be prepared. The current cue was retained; repair the media or retry deliberately.", cueId: targetId)
      emitRunState()
      return false
    }
  }

  private var independentAudioReservationCount: Int {
    pendingActions.values.filter { !$0.mainTransport && $0.cueId.flatMap { cues[$0]?["type"] as? String } == "audio" }.count +
      suspendedActions.filter { !$0.mainTransport && $0.cueId.flatMap { cues[$0]?["type"] as? String } == "audio" }.count
  }

  private func rootAdmissionIsCurrent(_ admission: RootAdmission) -> Bool {
    rootAdmission === admission && admission.gate.isCurrent(generation: runGeneration, rootEpoch: mainRootEpoch) &&
      safetyState == .normal && audioSessionGate.permitsPlayback && NativeRemoteCoordinator.isCurrentCommand(admission.controllerEpoch)
  }

  private func cancelRootAdmission() {
    rootAdmission?.gate.cancel(); rootAdmission?.preparation?.cancel(); rootAdmission?.timeout?.cancel(); rootAdmission = nil
  }

  private func refuseRootAdmission(_ admission: RootAdmission, code: String, message: String) {
    guard rootAdmissionIsCurrent(admission), admission.gate.refuse(generation: runGeneration, rootEpoch: mainRootEpoch) else { return }
    refusedAutomaticCrossfadeVoiceId = admission.crossfade?.id
    cancelRootAdmission(); rootHeldForGo = mainCueId != nil; transitioning = false
    emitRootRefusal(code, message, cueId: admission.targetCueId); emitRunState()
  }

  private func maybeBeginRootAdmission(_ admission: RootAdmission) {
    if rootAdmissionIsCurrent(admission), admission.gate.phase == .ready { admission.timeout?.cancel(); admission.timeout = nil }
    guard rootAdmissionIsCurrent(admission), admission.gate.beginFade(generation: runGeneration, rootEpoch: mainRootEpoch, paused: paused) else { return }
    admission.timeout?.cancel(); admission.preparation = nil
    cancelMainActions()
    let outgoing = admission.outgoingVoiceIds.compactMap { voices[$0] }
    let delay: TimeInterval
    if admission.crossfade != nil { delay = admission.entries.first?.delay ?? 0 }
    else {
      delay = (outgoing.map(\.fadeOutMs).max() ?? 0) / 1000
      outgoing.forEach { fadeVoices([$0], milliseconds: $0.fadeOutMs, curve: $0.fadeCurve, stopAtEnd: true) }
    }
    schedule(after: delay, cueId: nil, rootEpoch: mainRootEpoch, onCancel: { [weak self, weak admission] in
      guard let self, let admission, self.rootAdmission === admission else { return }
      self.cancelRootAdmission(); self.transitioning = false; self.rootHeldForGo = self.mainCueId != nil
    }) { [weak self] in admission.exitDelayElapsed = true; self?.maybeCommitRootAdmission(admission) }
    emitRunState()
  }

  private func maybeCommitRootAdmission(_ admission: RootAdmission) {
    if rootAdmissionIsCurrent(admission), rootExitReady(delayElapsed: admission.exitDelayElapsed, overlapping: admission.crossfade != nil,
      outgoingVoices: admission.outgoingVoiceIds.filter { voices[$0] != nil }.count) { commitRootAdmission(admission) }
  }

  private func commitRootAdmission(_ admission: RootAdmission) {
    guard rootAdmissionIsCurrent(admission), admission.gate.commit(generation: runGeneration, rootEpoch: mainRootEpoch, paused: paused) else { return }
    rootAdmission = nil; rootLaunching = true
    cancelMainActions()
    if admission.crossfade == nil { admission.outgoingVoiceIds.forEach { removeVoice($0, emitEnd: true) } }
    mainRootEpoch += 1; rootCompletionQueued = nil
    rootHeldForGo = false; rootAdvanceOnCompletion = true; rootForceAutoplay = false
    lastRootRefusal = nil
    refusedAutomaticCrossfadeVoiceId = nil
    selectedIndex = admission.gate.targetIndex; mainCueId = admission.startIncoming ? admission.targetCueId : nil
    mainVoiceId = nil; nextCueIndex = mainCueId == nil ? selectedIndex : selectedIndex + 1
    rootAwaitingFirstStart = !admission.assets.isEmpty; transitioning = rootAwaitingFirstStart
    let epoch = mainRootEpoch
    let generation = runGeneration
    let overlap = admission.crossfade.map { OmsCrossfadeTransition(outgoingVoiceId: $0.id, generation: generation) }
    omsCrossfade = overlap
    let grouped = admission.targetCueId.flatMap { cues[$0]?["type"] as? String } == "group"
    for entry in admission.entries {
      schedule(after: overlap == nil ? entry.delay : 0, cueId: entry.cueId, rootEpoch: epoch) { [weak self] in
        guard let self, self.mainRootEpoch == epoch, self.runGeneration == generation,
              NativeRemoteCoordinator.isCurrentCommand(admission.controllerEpoch) else { return }
        if let asset = admission.assets[entry.key] {
          guard self.startAudio(entry.cueId, cue: entry.cue, suppressAutoFollow: true, mainTransport: !grouped, mainSequence: true,
              validatedAsset: asset, rootEpoch: epoch, controllerEpoch: admission.controllerEpoch, onStarted: { [weak self] in
                guard let self, self.mainRootEpoch == epoch else { return }
                self.rootAwaitingFirstStart = false
                if let overlap, self.omsCrossfade === overlap, let outgoing = admission.crossfade {
                  overlap.incomingStarted = true
                  let duration = self.number(self.cues[outgoing.cueId] ?? [:], "crossfadeMs", default: 2000).doubleValue
                  self.fadeVoices(self.voices.values.filter { $0.id == outgoing.id }, milliseconds: duration, curve: outgoing.fadeCurve, stopAtEnd: true)
                  self.finishOmsCrossfadeIfReady()
                } else { self.transitioning = false }
                self.emitRunState()
              }) else {
                if !NativeRemoteCoordinator.isCurrentCommand(admission.controllerEpoch) { return }
                self.stopAll(reason: "root_start_failed"); self.safetyState = .faulted; self.fault("CUE_START_FAILED", "Admitted incoming audio failed. Prepare again."); return
              }
        } else { self.executeRootControl(entry.cueId, epoch: epoch) }
      }
    }
    rootLaunching = false
    checkRootCompletion(); emitRunState()
  }

  private func executeRootControl(_ cueId: String, epoch: Int) {
    guard epoch == mainRootEpoch, let cue = cues[cueId], let type = cue["type"] as? String else { return }
    if type == "fade", let selected = selectedVoices(cue) {
      let duration = number(cue, "durationMs").doubleValue
      if cue["stopAtEnd"] as? Bool == true { cancelScheduledActions(matching: selectedCueIds(cue)) }
      fadeVoices(selected, milliseconds: duration, curve: string(cue, "curve", default: "smooth"), stopAtEnd: cue["stopAtEnd"] as? Bool == true)
      let standalone = mainCueId == cueId
      if standalone { transitioning = duration > 0 }
      schedule(after: duration / 1000, cueId: nil, rootEpoch: epoch) { [weak self] in if standalone { self?.transitioning = false } }
    } else if type == "stop", let selected = selectedVoices(cue) {
      cancelScheduledActions(matching: selectedCueIds(cue)); selected.forEach { removeVoice($0.id, emitEnd: true) }
    } else if type == "wait" {
      if string(cue, "continue", default: "manual") != "auto" { rootHeldForGo = true }
      else {
        rootForceAutoplay = true; transitioning = true
        schedule(after: number(cue, "durationMs").doubleValue / 1000, cueId: nil, rootEpoch: epoch) { [weak self] in self?.transitioning = false }
      }
    }
  }

  private func checkRootCompletion() {
    guard transportMode == "oms", !paused, safetyState == .normal, audioSessionGate.permitsPlayback else { return }
    if !rootLaunching, rootAdmission == nil, rootAwaitingFirstStart,
      !voices.values.contains(where: { $0.rootEpoch == mainRootEpoch }), !pendingActions.values.contains(where: { $0.rootEpoch == mainRootEpoch }), !suspendedActions.contains(where: { $0.rootEpoch == mainRootEpoch }) {
      rootAwaitingFirstStart = false
      if omsCrossfade == nil { transitioning = false }
    }
    let epoch = mainRootEpoch
    let pending = pendingActions.values.filter { $0.rootEpoch == epoch }.count + suspendedActions.filter { $0.rootEpoch == epoch }.count
    guard rootCanComplete(started: mainCueId != nil, launching: rootLaunching, transitioning: transitioning || rootAdmission != nil,
      voices: voices.values.filter { $0.rootEpoch == epoch }.count, pendingActions: pending, heldForRetry: rootHeldForGo), rootCompletionQueued != epoch else { return }
    rootCompletionQueued = epoch
    let generation = runGeneration
    commandQueue.async { [weak self] in
      guard let self else { return }
      if self.rootCompletionQueued == epoch { self.rootCompletionQueued = nil }
      guard self.mainRootEpoch == epoch, self.runGeneration == generation, !self.paused, self.safetyState == .normal, self.audioSessionGate.permitsPlayback else { return }
      let count = self.pendingActions.values.filter { $0.rootEpoch == epoch }.count + self.suspendedActions.filter { $0.rootEpoch == epoch }.count
      if rootCanComplete(started: self.mainCueId != nil, launching: self.rootLaunching, transitioning: self.transitioning || self.rootAdmission != nil,
        voices: self.voices.values.filter { $0.rootEpoch == epoch }.count, pendingActions: count, heldForRetry: self.rootHeldForGo) { self.finishOmsMainNaturally() }
    }
  }

  private func runState() -> [String: Any] {
    let selected = selectedIndex < cueOrder.count ? cueOrder[selectedIndex] : ""
    let remaining = !transitioning ? 0 : paused ? (suspendedActions.filter(\.mainTransport).map(\.remaining).min() ?? 0) : max(0, (pendingActions.values.filter(\.mainTransport).map(\.deadline).min() ?? monotonicNow) - monotonicNow)
    let mainPlaying = mainVoiceId.map { voices[$0] != nil } ?? false
    let nativeNextIndex = transportMode == "oms" ? selectedIndex + 1 : nextCueIndex
    let legacyPlaying = transportMode != "oms" && (!voices.isEmpty || !pendingActions.isEmpty)
    let phase = !prepared ? "stopped" : safetyState != .normal || !audioSessionGate.permitsPlayback ? "interrupted" : paused ? "paused" : transitioning ? "fading" : mainPlaying || legacyPlaying || transportMode == "oms" && mainCueId != nil ? "playing" : selected.isEmpty ? "stopped" : "ready"
    return ["type": "RUN_STATE", "generation": runGeneration, "monotonicMs": monotonicNow * 1_000, "transportMode": transportMode, "sessionPurpose": sessionPurpose, "phase": phase,
      "showId": showId, "setId": setId, "revisionId": revisionId,
      "selectedCueId": selected, "currentCueId": mainCueId ?? "", "nextCueId": nativeNextIndex < cueOrder.count ? cueOrder[nativeNextIndex] : "",
      "currentCueIndex": mainCueId == nil ? -1 : selectedIndex, "nextCueIndex": nativeNextIndex, "activeVoiceCount": voices.count,
      "hasPendingActions": !pendingActions.isEmpty || !suspendedActions.isEmpty || rootAdmission != nil || rootHeldForGo,
      "mainSequenceVoiceCount": voices.values.filter { $0.belongsToMainSequence }.count,
      "transitionRefusal": lastRootRefusal as Any? ?? NSNull(),
      "countdownRemainingMs": remaining * 1000, "nativeCommandId": nativeSequence, "playbackRate": mainCueId.flatMap { cues[$0] }.map { number($0, "playbackRate", default: 1).doubleValue } ?? 1]
  }

  private func emitRunState() {
    guard !previewMode, !preparingSnapshot else { return }
    let state = runState()
    sendEvent("onEngineEvent", state)
    NotificationCenter.default.post(name: NSNotification.Name("ShowControlRunState"), object: nil, userInfo: ["event": state])
  }

  // MARK: - Cue execution

  @discardableResult
  private func trigger(_ cueId: String, allowGroup: Bool, suppressAutoFollow: Bool, mainTransport: Bool = true, mainSequence: Bool? = nil) -> Bool {
    let belongsToMainSequence = mainSequence ?? mainTransport
    guard let cue = cues[cueId], let type = cue["type"] as? String else {
      fault("CUE_MISSING", "The requested cue is unavailable.")
      return false
    }

    switch type {
    case "audio":
      guard reserveAvailable, belongsToMainSequence || futureHitCapacity(1) else {
        capacityRefusal(cueId)
        return false
      }
      let rawWaitMs = number(cue, "preWaitMs").doubleValue
      guard rawWaitMs.isFinite, rawWaitMs >= 0 else {
        fault("TIMING_INVALID", "The audio cue contains an invalid pre-wait duration.")
        return false
      }
      let waitMs = rawWaitMs
      if waitMs > 0 {
        schedule(after: waitMs / 1_000, cueId: cueId, mainTransport: belongsToMainSequence) { [weak self] in
          self?.startAudio(cueId, cue: cue, suppressAutoFollow: suppressAutoFollow, mainTransport: mainTransport, mainSequence: belongsToMainSequence)
        }
        return true
      } else {
        return startAudio(cueId, cue: cue, suppressAutoFollow: suppressAutoFollow, mainTransport: mainTransport, mainSequence: belongsToMainSequence)
      }
    case "group":
      guard allowGroup else {
        fault("NESTED_GROUP_UNSUPPORTED", "Nested groups are not supported in schema version 1.")
        return false
      }
      guard let children = cue["children"] as? [[String: Any]] else {
        fault("GROUP_INVALID", "The group cue is invalid.")
        return false
      }
      var requiredVoices = 0
      for child in children {
        guard let childId = child["cueId"] as? String,
              let childCue = cues[childId],
              let childType = childCue["type"] as? String else {
          fault("GROUP_CHILD_MISSING", "The group contains an unavailable child cue.")
          return false
        }
        guard childType == "audio" || childType == "fade" || childType == "stop" else {
          fault("GROUP_CHILD_UNSUPPORTED", "Groups may contain only audio, fade, or stop cues in schema version 1.")
          return false
        }
        let offset = number(child, "offsetMs").doubleValue
        guard offset.isFinite, offset >= 0 else {
          fault("GROUP_OFFSET_INVALID", "The group contains an invalid child offset.")
          return false
        }
        if childType == "audio" { requiredVoices += 1 }
      }
      guard voices.count + pendingAudioVoiceCount + requiredVoices <= voiceLimit, belongsToMainSequence || futureHitCapacity(requiredVoices) else {
        capacityRefusal(cueId)
        return false
      }
      for child in children {
        guard let childId = child["cueId"] as? String else { continue }
        let offset = max(0, number(child, "offsetMs").doubleValue) / 1_000
        schedule(after: offset, cueId: childId, mainTransport: belongsToMainSequence) { [weak self] in
          // A parallel child must not independently advance the main stack. Multiple
          // auto-following children would make group completion nondeterministic.
          self?.trigger(childId, allowGroup: false, suppressAutoFollow: true, mainTransport: false, mainSequence: belongsToMainSequence)
        }
      }
      return true
    case "fade":
      guard let selected = selectedVoices(cue) else { return false }
      let durationMs = number(cue, "durationMs").doubleValue
      guard durationMs.isFinite, durationMs >= 0 else {
        fault("TIMING_INVALID", "The fade cue contains an invalid duration.")
        return false
      }
      fadeVoices(
        selected,
        milliseconds: durationMs,
        curve: string(cue, "curve", default: "smooth"),
        stopAtEnd: cue["stopAtEnd"] as? Bool ?? false
      )
      return true
    case "stop":
      guard let selected = selectedVoices(cue) else { return false }
      cancelScheduledActions(matching: selectedCueIds(cue))
      selected.forEach { removeVoice($0.id, emitEnd: true) }
      emitStateAfterVoiceChange()
      return true
    case "wait":
      guard string(cue, "continue", default: "manual") == "auto" else { return true }
      let rawDurationMs = number(cue, "durationMs").doubleValue
      guard rawDurationMs.isFinite, rawDurationMs >= 0 else {
        fault("TIMING_INVALID", "The wait cue contains an invalid duration.")
        return false
      }
      let duration = rawDurationMs / 1_000
      schedule(after: duration, cueId: cueId) { [weak self] in
        guard let self, self.safetyState == .normal, !self.paused, !suppressAutoFollow else { return }
        self.advanceNextCue(reason: "wait_auto_follow")
        self.emitRunState()
      }
      return true
    default:
      fault("CUE_TYPE_UNSUPPORTED", "The requested cue type is not supported.")
      return false
    }
  }

  @discardableResult
  private func startAudio(_ cueId: String, cue: [String: Any], suppressAutoFollow: Bool, mainTransport: Bool = true, mainSequence: Bool? = nil, validatedAsset: ValidatedAudioAsset? = nil, rootEpoch: Int? = nil, controllerEpoch: Int64? = nil, onStarted: (() -> Void)? = nil) -> Bool {
    if let rootEpoch, rootEpoch != mainRootEpoch { return false }
    if let controllerEpoch, !NativeRemoteCoordinator.isCurrentCommand(controllerEpoch) { return false }
    guard safetyState == .normal, audioSessionGate.permitsPlayback, !paused || previewMode else {
      fault("RECOVERY_REQUIRED", "Playback requires an explicit recovery action.")
      return false
    }
    guard voices.count < voiceLimit else {
      capacityRefusal(cueId)
      return false
    }
    do {
      let validated: ValidatedAudioAsset
      if let validatedAsset { validated = validatedAsset }
      else { validated = try validateAudioCue(cueId: cueId, cue: cue, decodeProbe: true) }
      let file = validated.file
      let trimStart = validated.trimStartFrame
      let trimEnd = validated.trimEndFrame

      guard engine.isRunning else {
        fault("ENGINE_NOT_RUNNING", "The native audio engine requires an explicit recovery.")
        return false
      }
      guard let slot = availableVoiceSlots.popLast() else {
        capacityRefusal(cueId)
        return false
      }
      var shouldReturnSlot = true
      defer {
        if shouldReturnSlot { availableVoiceSlots.append(slot) }
      }
      let requestedGainDb = number(cue, "gainDb").doubleValue
      guard requestedGainDb.isFinite else {
        fault("GAIN_INVALID", "The audio cue contains an invalid gain value.")
        return false
      }
      slot.player.stop()
      let baseGainDb = Float(min(24, max(-96, requestedGainDb)))
      let rate = number(cue, "playbackRate", default: 1).doubleValue
      guard rate.isFinite, (0.7...2).contains(rate) else { throw error(22, "Invalid playback speed") }
      slot.timePitch.rate = Float(rate)
      slot.timePitch.pitch = 0
      slot.gainUnit.globalGain = baseGainDb
      slot.mixer.outputVolume = 1

      let voice = Voice(
        cueId: cueId,
        tags: Set(cue["tags"] as? [String] ?? []),
        slot: slot,
        file: file,
        trimStartFrame: trimStart,
        trimEndFrame: trimEnd,
        fadeOutMs: max(0, number(cue, "fadeOutMs").doubleValue),
        fadeCurve: string(cue, "fadeCurve", default: "smooth"),
        endBehavior: string(cue, "endBehavior", default: "stopAndReadyNext"),
        suppressAutoFollow: suppressAutoFollow,
        mainTransport: mainTransport,
        belongsToMainSequence: mainSequence ?? mainTransport,
        baseGainDb: baseGainDb,
        playbackRate: rate,
        rootEpoch: rootEpoch
      )
      voices[voice.id] = voice
      voice.onStarted = onStarted
      shouldReturnSlot = false
      scheduleVoice(voice, from: trimStart)

      let rawFadeInMs = number(cue, "fadeInMs").doubleValue
      guard rawFadeInMs.isFinite, rawFadeInMs >= 0 else {
        removeVoice(voice.id, emitEnd: false)
        fault("TIMING_INVALID", "The audio cue contains an invalid fade-in duration.")
        return false
      }
      let fadeInMs = rawFadeInMs
      if fadeInMs > 0 {
        scheduleGainEnvelope(
          voice,
          milliseconds: fadeInMs,
          from: 0,
          to: 1,
          curve: voice.fadeCurve,
          stopAtEnd: false
        )
      }
      scheduleAutomaticFadeOutIfNeeded(voice, startingFrame: trimStart)

      // A play request precedes rendering. Announce the first actual player render,
      // so external visuals and outgoing crossfades cannot start during buffering.
      voice.hasStartTap = true
      voice.mixer.installTap(onBus: 0, bufferSize: 128, format: nil) { [weak self, weak voice] _, _ in
        guard let self, let voice, let render = voice.player.lastRenderTime,
              let time = voice.player.playerTime(forNodeTime: render), time.sampleTime > 0 else { return }
        self.commandQueue.async { [weak self, weak voice] in
          guard let self, let voice, self.voices[voice.id] === voice, !voice.startAnnounced,
                self.safetyState == .normal, self.audioSessionGate.permitsPlayback else { return }
          voice.startAnnounced = true
          if voice.hasStartTap { voice.mixer.removeTap(onBus: 0); voice.hasStartTap = false }
          if voice.rootEpoch == nil, voice.mainTransport, self.omsCrossfade == nil { self.transitioning = false }
          self.emit(["type": "VOICE_START", "cueId": voice.cueId, "voiceId": voice.id, "mainTransport": voice.mainTransport])
          let callback = voice.onStarted; voice.onStarted = nil; callback?()
          self.emitRunState()
        }
      }
      if mainTransport { mainVoiceId = voice.id }
      if !paused {
        if let controllerEpoch {
          guard NativeRemoteCoordinator.whileCurrentCommand(controllerEpoch, { voice.player.play() }) else { removeVoice(voice.id, emitEnd: false); return false }
        } else { voice.player.play() }
      }
      startProgressTimerIfNeeded()
      emit(["type": "STATE", "state": "playing"])
      updateNowPlaying(state: .playing)
      emitRunState()
      return true
    } catch let validationError as NSError {
      fault("MEDIA_VALIDATION_FAILED", validationError.localizedDescription)
      return false
    }
  }

  private func scheduleVoice(_ voice: Voice, from startFrame: AVAudioFramePosition) {
    voice.playbackGeneration += 1
    let generation = voice.playbackGeneration
    voice.playbackStartFrame = startFrame
    voice.cueFadeOutStarted = false
    let remaining = voice.trimEndFrame - startFrame
    guard remaining > 0, remaining <= AVAudioFramePosition(UInt32.max) else {
      completeVoice(voice.id, generation: generation)
      return
    }
    let frameCount = AVAudioFrameCount(remaining)

    if voice.endBehavior == "loop" {
      enqueueLoopSegment(voice, generation: generation, from: startFrame, frameCount: frameCount)
      enqueueLoopSegment(voice, generation: generation, from: voice.trimStartFrame, frameCount: AVAudioFrameCount(voice.trimEndFrame - voice.trimStartFrame))
    } else {
      voice.player.scheduleSegment(
        voice.file,
        startingFrame: startFrame,
        frameCount: frameCount,
        at: nil,
        completionCallbackType: .dataPlayedBack
      ) { [weak self] _ in
        self?.commandQueue.async {
          self?.completeVoice(voice.id, generation: generation)
        }
      }
    }

  }

  private func scheduleAutomaticFadeOutIfNeeded(
    _ voice: Voice,
    startingFrame: AVAudioFramePosition
  ) {
    guard !paused, voice.endBehavior != "loop", voice.fadeOutMs > 0 else { return }
    if let active = voice.envelope, active.to < active.from { return }
    let sampleRate = voice.file.processingFormat.sampleRate
    let outputRate = engine.outputNode.outputFormat(forBus: 0).sampleRate
    guard sampleRate > 0, outputRate > 0 else { return }
    let remainingSeconds = Double(voice.trimEndFrame - startingFrame) / sampleRate / voice.playbackRate
    let requestedFadeSeconds = min(remainingSeconds, voice.fadeOutMs / 1_000)
    var startDelay = max(0, remainingSeconds - requestedFadeSeconds)
    if let fadeIn = voice.envelope, fadeIn.to > fadeIn.from {
      startDelay = max(startDelay, fadeIn.duration)
    }
    let fadeSeconds = max(0, remainingSeconds - startDelay)
    guard fadeSeconds > 0 else { return }

    let startGain: Float = 1
    voice.cueFadeOutStarted = true

    guard scheduleRenderGainCurve(
      voice,
      duration: fadeSeconds,
      from: startGain,
      to: 0,
      curve: voice.fadeCurve,
      startDelay: startDelay
    ) else {
      fault("NATIVE_GAIN_RAMP_UNAVAILABLE", "The iOS render-clock gain parameter is unavailable.")
      return
    }
  }

  private func enqueueLoopSegment(
    _ voice: Voice,
    generation: Int,
    from startFrame: AVAudioFramePosition,
    frameCount: AVAudioFrameCount
  ) {
    voice.player.scheduleSegment(
      voice.file,
      startingFrame: startFrame,
      frameCount: frameCount,
      at: nil,
      completionCallbackType: .dataConsumed
    ) { [weak self] _ in
      self?.commandQueue.async {
        guard let self,
              let current = self.voices[voice.id],
              current.playbackGeneration == generation,
              current.endBehavior == "loop" else { return }
        self.enqueueLoopSegment(
          current,
          generation: generation,
          from: current.trimStartFrame,
          frameCount: AVAudioFrameCount(current.trimEndFrame - current.trimStartFrame)
        )
      }
    }
  }

  private func completeVoice(_ voiceId: String, generation: Int) {
    guard let voice = voices[voiceId], voice.playbackGeneration == generation else { return }
    let shouldFollow = transportMode != "oms" && voice.endBehavior == "autoFollow" && !voice.suppressAutoFollow && safetyState == .normal && audioSessionGate.permitsPlayback
    removeVoice(voiceId, emitEnd: true)
    emitStateAfterVoiceChange()
    if transportMode == "oms", voice.rootEpoch != nil { checkRootCompletion(); return }
    if shouldFollow {
      advanceNextCue(reason: "audio_auto_follow")
    }
    emitRunState()
  }

  private func synchronizeCuePointer(after cueId: String) {
    if nextCueIndex < cueOrder.count, cueOrder[nextCueIndex] == cueId {
      nextCueIndex += 1
      return
    }
    if let index = cueOrder.firstIndex(of: cueId) {
      nextCueIndex = index + 1
    }
  }

  @discardableResult
  private func advanceNextCue(reason: String) -> Bool {
    guard prepared, safetyState == .normal, audioSessionGate.permitsPlayback, !paused else { return false }
    guard nextCueIndex < cueOrder.count else { return false }
    let cueId = cueOrder[nextCueIndex]
    guard trigger(cueId, allowGroup: true, suppressAutoFollow: false) else { return false }
    selectedIndex = nextCueIndex
    mainCueId = cueId
    nextCueIndex += 1
    emit([
      "type": "REMOTE_COMMAND",
      "command": "GO",
      "handledNatively": true,
      "cueId": cueId,
      "reason": reason,
    ])
    emitRunState()
    return true
  }

  private var pendingAudioVoiceCount: Int {
    let pending = pendingActions.values.reduce(into: 0) { count, action in
      guard let cueId = action.cueId, cues[cueId]?["type"] as? String == "audio" else { return }
      count += 1
    }
    let suspended = suspendedActions.reduce(into: 0) { count, action in
      guard let cueId = action.cueId, cues[cueId]?["type"] as? String == "audio" else { return }
      count += 1
    }
    return pending + suspended
  }

  private var reserveAvailable: Bool {
    voices.count + pendingAudioVoiceCount < voiceLimit
  }

  private func futureHitCapacity(_ count: Int) -> Bool {
    guard let admission = rootAdmission else { return true }
    return rootFutureCapacity(independentVoices: voices.values.filter { !$0.belongsToMainSequence }.count,
      independentReservations: independentAudioReservationCount, incomingVoices: admission.entries.filter { $0.cue["type"] as? String == "audio" }.count, newHitVoices: count)
  }

  private func capacityRefusal(_ cueId: String) {
    emit([
      "type": "CAPACITY_REFUSAL",
      "cueId": cueId,
      "activeVoices": voices.count,
      "limit": voiceLimit,
    ])
    emitRootRefusal("CAPACITY_REFUSAL", "The cue was refused because the eight-voice safety limit is active.", cueId: cueId)
  }

  // MARK: - Gain, progress, pause, and seek

  private func panicFade(hardMuted: Bool = false) {
    invalidateRootTransport()
    omsCrossfade = nil
    emitSafetyStop("panic")
    mainCueId = nil
    runGeneration += 1
    cancelScheduledActions()
    if hardMuted || !audioSessionGate.permitsPlayback || !engine.isRunning || paused || voices.isEmpty {
      stopAll(reason: "panic")
      emitAuthoritativePlaybackState()
    } else {
      transitioning = true
      fadeVoices(Array(voices.values), milliseconds: panicFadeMs, curve: "smooth", stopAtEnd: true)
    }
  }

  private func fadeVoices(_ selected: [Voice], milliseconds: Double, curve: String, stopAtEnd: Bool) {
    guard !selected.isEmpty else { return }
    guard milliseconds.isFinite, milliseconds >= 0 else {
      fault("TIMING_INVALID", "A native gain envelope received an invalid duration.")
      return
    }
    let duration = milliseconds / 1_000
    let now = monotonicNow

    for voice in selected {
      let current = currentEnvelopeGain(voice, at: now)
      voice.cueFadeOutStarted = true
      if duration == 0 {
        cancelGainEnvelope(voice, settingGainTo: 0)
        if stopAtEnd { removeVoice(voice.id, emitEnd: true) }
      } else {
        scheduleGainEnvelope(
          voice,
          milliseconds: duration * 1_000,
          from: current,
          to: 0,
          curve: curve,
          stopAtEnd: stopAtEnd
        )
      }
    }

    emit(["type": "STATE", "state": "fading"])
    startProgressTimerIfNeeded()
    if duration == 0 { emitAuthoritativePlaybackState() }
  }

  private func scheduleGainEnvelope(
    _ voice: Voice,
    milliseconds: Double,
    from: Float,
    to: Float,
    curve: String,
    stopAtEnd: Bool
  ) {
    guard milliseconds.isFinite, milliseconds >= 0,
          from.isFinite, to.isFinite else {
      fault("GAIN_ENVELOPE_INVALID", "A native gain envelope contained an invalid value.")
      return
    }
    let duration = milliseconds / 1_000
    voice.envelopeCompletion?.cancel()
    voice.envelopeGeneration += 1
    let generation = voice.envelopeGeneration
    let startGain = min(1, max(0, from))
    let targetGain = min(1, max(0, to))
    voice.gainUnit.auAudioUnit.reset()
    setGainImmediately(voice, linearGain: startGain)

    guard duration > 0 else {
      setGainImmediately(voice, linearGain: targetGain)
      voice.envelope = nil
      if stopAtEnd { removeVoice(voice.id, emitEnd: true) }
      emitAuthoritativePlaybackState()
      return
    }

    voice.envelope = GainEnvelope(
      startedAt: monotonicNow,
      duration: duration,
      from: startGain,
      to: targetGain,
      curve: curve,
      stopAtEnd: stopAtEnd,
      generation: generation
    )

    if paused { return }

    if !scheduleRenderGainCurve(
      voice,
      duration: duration,
      from: startGain,
      to: targetGain,
      curve: curve
    ) {
      // Fail silent rather than returning to a software polling fade. This should
      // never occur for Apple's N-band EQ, but it remains an explicit native fault.
      setGainImmediately(voice, linearGain: targetGain)
      fault("NATIVE_GAIN_RAMP_UNAVAILABLE", "The iOS render-clock gain parameter is unavailable.")
    }

    let item = DispatchWorkItem { [weak self, weak voice] in
      guard let self, let voice,
            let current = self.voices[voice.id],
            current.envelopeGeneration == generation,
            current.envelope?.generation == generation else { return }
      current.envelopeCompletion = nil
      current.envelope = nil
      self.setGainImmediately(current, linearGain: targetGain)
      if stopAtEnd { self.removeVoice(current.id, emitEnd: true) }
      self.emitAuthoritativePlaybackState()
    }
    voice.envelopeCompletion = item
    commandQueue.asyncAfter(deadline: .now() + duration, execute: item)
  }

  private func globalGainParameter(for unit: AVAudioUnitEQ) -> AUParameter? {
    guard let parameters = unit.auAudioUnit.parameterTree?.allParameters else { return nil }
    if parameters.count == 1 { return parameters[0] }
    return parameters.first { parameter in
      let label = "\(parameter.identifier) \(parameter.displayName)".lowercased()
      return label.contains("global") && label.contains("gain")
    }
  }

  private func scheduleRenderGainCurve(
    _ voice: Voice,
    duration: TimeInterval,
    from: Float,
    to: Float,
    curve: String,
    startDelay: TimeInterval = 0
  ) -> Bool {
    guard let parameter = globalGainParameter(for: voice.gainUnit),
          parameter.flags.contains(.flag_CanRamp),
          let renderTime = voice.gainUnit.lastRenderTime,
          renderTime.isSampleTimeValid else { return false }
    let sampleRate = voice.gainUnit.outputFormat(forBus: 0).sampleRate
    let totalFramesRaw = duration * sampleRate
    let delayFramesRaw = startDelay * sampleRate
    guard sampleRate > 0,
          totalFramesRaw.isFinite, delayFramesRaw.isFinite,
          totalFramesRaw >= 1, delayFramesRaw >= 0,
          totalFramesRaw <= Double(Int64.max / 4),
          delayFramesRaw <= Double(Int64.max / 4) else { return false }

    let totalFrames = Int64(totalFramesRaw.rounded(.up))
    let delayFrames = Int64(delayFramesRaw.rounded(.towardZero))
    let curveSegments = curve == "linear" ? 1 : min(64, max(8, Int(ceil(duration * 60))))
    let frameSegments = Int(ceil(Double(totalFrames) / Double(UInt32.max)))
    let segmentCount = max(curveSegments, frameSegments)
    guard segmentCount > 0, segmentCount <= 256 else { return false }

    let baseSampleTime = AUEventSampleTime(renderTime.sampleTime) + AUEventSampleTime(delayFrames)
    let schedule = voice.gainUnit.auAudioUnit.scheduleParameterBlock
    for segment in 1...segmentCount {
      let startOffset = totalFrames * Int64(segment - 1) / Int64(segmentCount)
      let endOffset = totalFrames * Int64(segment) / Int64(segmentCount)
      let rampFrames = max(1, endOffset - startOffset)
      let progress = Double(segment) / Double(segmentCount)
      let shaped = shapedProgress(progress, curve: curve, fadingDown: to < from)
      let target = from + (to - from) * shaped
      schedule(
        baseSampleTime + AUEventSampleTime(startOffset),
        AUAudioFrameCount(rampFrames),
        parameter.address,
        gainDb(base: voice.baseGainDb, linearGain: target)
      )
    }
    return true
  }

  private func gainDb(base: Float, linearGain: Float) -> AUValue {
    guard linearGain > 0.000_001 else { return -96 }
    return AUValue(min(24, max(-96, base + 20 * log10(linearGain))))
  }

  private func setGainImmediately(_ voice: Voice, linearGain: Float) {
    let target = gainDb(base: voice.baseGainDb, linearGain: min(1, max(0, linearGain)))
    if let parameter = globalGainParameter(for: voice.gainUnit) {
      voice.gainUnit.auAudioUnit.scheduleParameterBlock(
        AUEventSampleTimeImmediate,
        0,
        parameter.address,
        target
      )
    }
    voice.gainUnit.globalGain = target
  }

  private func currentEnvelopeGain(_ voice: Voice, at now: TimeInterval) -> Float {
    guard let envelope = voice.envelope else {
      let relativeDb = voice.gainUnit.globalGain - voice.baseGainDb
      return min(1, max(0, pow(10, relativeDb / 20)))
    }
    let rawProgress = envelope.duration == 0 ? 1 : (now - envelope.startedAt) / envelope.duration
    let progress = min(1, max(0, rawProgress))
    let shaped = shapedProgress(progress, curve: envelope.curve, fadingDown: envelope.to < envelope.from)
    return envelope.from + (envelope.to - envelope.from) * shaped
  }

  private func cancelGainEnvelope(_ voice: Voice, settingGainTo gain: Float? = nil) {
    let preserved = gain ?? currentEnvelopeGain(voice, at: monotonicNow)
    voice.envelopeCompletion?.cancel()
    voice.envelopeCompletion = nil
    voice.envelopeGeneration += 1
    voice.envelope = nil
    voice.gainUnit.auAudioUnit.reset()
    setGainImmediately(voice, linearGain: preserved)
  }

  private func freezeGainEnvelope(_ voice: Voice) {
    guard let envelope = voice.envelope else {
      let current = currentEnvelopeGain(voice, at: monotonicNow)
      voice.gainUnit.auAudioUnit.reset()
      setGainImmediately(voice, linearGain: current)
      return
    }
    let now = monotonicNow
    let current = currentEnvelopeGain(voice, at: now)
    let remaining = max(0, envelope.duration - max(0, now - envelope.startedAt))
    voice.envelopeCompletion?.cancel()
    voice.envelopeCompletion = nil
    voice.envelopeGeneration += 1
    let generation = voice.envelopeGeneration
    voice.gainUnit.auAudioUnit.reset()
    setGainImmediately(voice, linearGain: current)
    voice.envelope = GainEnvelope(
      startedAt: now,
      duration: remaining,
      from: current,
      to: envelope.to,
      curve: envelope.curve,
      stopAtEnd: envelope.stopAtEnd,
      generation: generation
    )
  }

  private func resumeGainEnvelope(_ voice: Voice) {
    guard let envelope = voice.envelope else { return }
    scheduleGainEnvelope(
      voice,
      milliseconds: envelope.duration * 1_000,
      from: envelope.from,
      to: envelope.to,
      curve: envelope.curve,
      stopAtEnd: envelope.stopAtEnd
    )
  }

  private func startProgressTimerIfNeeded() {
    guard progressTimer == nil else { return }
    let timer = DispatchSource.makeTimerSource(queue: commandQueue)
    // This clock reports progress and detects the natural fade-out boundary. Gain
    // itself is rendered by the Audio Unit's sample-clock parameter ramp above.
    timer.schedule(deadline: .now(), repeating: .milliseconds(25), leeway: .milliseconds(5))
    timer.setEventHandler { [weak self] in self?.tickProgressClock() }
    progressTimer = timer
    timer.resume()
  }

  private func stopProgressTimer() {
    progressTimer?.setEventHandler {}
    progressTimer?.cancel()
    progressTimer = nil
  }

  private func tickProgressClock() {
    guard prepared else {
      stopProgressTimer()
      return
    }
    let now = monotonicNow
    guard !paused else { return }

    for voice in Array(voices.values) {
      guard voices[voice.id] != nil, let position = playbackPositionMs(voice) else { continue }
      let duration = Double(voice.trimEndFrame - voice.trimStartFrame) / voice.file.processingFormat.sampleRate * 1_000
      if transportMode == "oms", voice.mainTransport, voice.id == mainVoiceId, !transitioning, voice.id != refusedAutomaticCrossfadeVoiceId, voice.endBehavior != "loop", selectedIndex + 1 < cueOrder.count,
         let outgoing = cues[voice.cueId], outgoing["crossfadeEnabled"] as? Bool == true,
         let incoming = cues[cueOrder[selectedIndex + 1]], incoming["autoPlay"] as? Bool == true,
         (duration - position) / voice.playbackRate <= number(incoming, "preWaitMs").doubleValue + number(outgoing, "crossfadeMs", default: 2000).doubleValue { advanceOms() }
      if now - voice.lastProgressEventAt >= 0.1 {
        voice.lastProgressEventAt = now
        emit([
          "type": "PROGRESS",
          "cueId": voice.cueId,
          "voiceId": voice.id,
          "mainTransport": voice.mainTransport,
          "positionMs": position,
          "durationMs": duration,
        ])
      }
    }
    emitRunState()

    if voices.isEmpty && pendingActions.isEmpty && suspendedActions.isEmpty {
      stopProgressTimer()
      emitStateAfterVoiceChange()
    }
  }

  private func shapedProgress(_ progress: Double, curve: String, fadingDown: Bool) -> Float {
    switch curve {
    case "smooth":
      return Float(progress * progress * (3 - 2 * progress))
    case "equalPower":
      if fadingDown {
        return Float(1 - cos(progress * .pi / 2))
      }
      return Float(sin(progress * .pi / 2))
    default:
      return Float(progress)
    }
  }

  private func playbackPositionMs(_ voice: Voice) -> Double? {
    guard let nodeTime = voice.player.lastRenderTime,
          let playerTime = voice.player.playerTime(forNodeTime: nodeTime) else { return nil }
    let segmentFrames = voice.trimEndFrame - voice.trimStartFrame
    let relative = AVAudioFramePosition(playerTime.sampleTime)
    if voice.endBehavior == "loop", segmentFrames > 0 {
      let initialOffset = voice.playbackStartFrame - voice.trimStartFrame
      let loopOffset = (initialOffset + relative) % segmentFrames
      return Double(loopOffset) / voice.file.processingFormat.sampleRate * 1_000
    }
    let absolute = min(voice.trimEndFrame, voice.playbackStartFrame + relative)
    return Double(max(0, absolute - voice.trimStartFrame)) / voice.file.processingFormat.sampleRate * 1_000
  }

  private func pauseAll(userInitiated: Bool) {
    if !paused {
      voices.values.forEach { voice in
        freezeGainEnvelope(voice)
        voice.player.pause()
      }
      pauseScheduledActions()
      paused = true
      pausedAt = monotonicNow
    }
    if !userInitiated { safetyState = .interrupted }
    emit(["type": "STATE", "state": "paused"])
    updateNowPlaying(state: .paused)
  }

  @discardableResult
  private func resumeAll() -> Bool {
    guard prepared, safetyState == .normal, audioSessionGate.permitsPlayback else { return false }
    if !engine.isRunning {
      do {
        engine.prepare()
        try engine.start()
      } catch {
        safetyState = .faulted
        fault("ENGINE_RESTART_FAILED", "The native audio engine could not restart; prepare the run again.")
        return false
      }
    }
    guard paused else { return true }
    paused = false
    guard audioSessionGate.withPlaybackPermission({
      emergencyLock.lock()
      engine.mainMixerNode.outputVolume = 1
      emergencyLock.unlock()
    }) else { return false }
    voices.values.forEach { voice in
      resumeGainEnvelope(voice)
      let position = playbackPositionMs(voice) ?? Double(voice.playbackStartFrame - voice.trimStartFrame) / voice.file.processingFormat.sampleRate * 1_000
      let currentFrame = min(
        voice.trimEndFrame - 1,
        voice.trimStartFrame + AVAudioFramePosition(
          position * voice.file.processingFormat.sampleRate / 1_000
        )
      )
      scheduleAutomaticFadeOutIfNeeded(voice, startingFrame: currentFrame)
      voice.player.play()
    }
    if !voices.isEmpty { startProgressTimerIfNeeded() }
    resumeScheduledActions()
    if let admission = rootAdmission { maybeBeginRootAdmission(admission) }
    checkRootCompletion()
    paused = false
    self.pausedAt = nil
    safetyState = .normal
    emit(["type": "STATE", "state": voices.isEmpty ? "ready" : "playing"])
    updateNowPlaying(state: voices.isEmpty ? .paused : .playing)
    return true
  }

  @discardableResult
  private func seek(_ command: [String: Any]) -> Bool {
    guard let cueId = command["cueId"] as? String else {
      fault("SEEK_INVALID", "The rehearsal seek command has no cue ID.")
      return false
    }
    let requestedMs = number(command, "positionMs").doubleValue
    guard requestedMs.isFinite, requestedMs >= 0 else {
      fault("SEEK_INVALID", "The rehearsal seek command has an invalid position.")
      return false
    }
    // Cue identity is shared by independent Hits and outgoing overlap voices.
    // Audition owns an isolated player; rehearsal owns only the primary main voice.
    let selected = voices.values.filter { $0.cueId == cueId && (previewMode || ($0.mainTransport && $0.id == mainVoiceId)) }
    guard !selected.isEmpty else {
      fault("SEEK_TARGET_INACTIVE", "The requested rehearsal cue is not active.")
      return false
    }
    for voice in selected {
      let sampleRate = voice.file.processingFormat.sampleRate
      let target = min(
        voice.trimEndFrame - 1,
        AVAudioFramePosition(requestedMs * sampleRate / 1_000)
      )
      voice.playbackGeneration += 1
      voice.player.stop()
      cancelGainEnvelope(voice, settingGainTo: 1)
      scheduleVoice(voice, from: max(voice.trimStartFrame, target))
      scheduleAutomaticFadeOutIfNeeded(voice, startingFrame: max(voice.trimStartFrame, target))
      if !paused { voice.player.play() }
    }
    return true
  }

  // MARK: - Scheduling and selection

  private func schedule(after delay: TimeInterval, cueId: String?, mainTransport: Bool = true, rootEpoch: Int? = nil, onCancel: (() -> Void)? = nil, block: @escaping () -> Void) {
    guard audioSessionGate.permitsPlayback else { onCancel?(); return }
    if delay <= 0, rootEpoch == nil {
      block()
      return
    }
    let action = PendingAction(cueId: cueId, deadline: monotonicNow + max(0, delay), mainTransport: mainTransport, rootEpoch: rootEpoch, onCancel: onCancel, block: block)
    let item = DispatchWorkItem { [weak self, weak action] in
      guard let self, let action, self.pendingActions.removeValue(forKey: action.id) != nil else { return }
      guard self.audioSessionGate.permitsPlayback, action.rootEpoch == nil || action.rootEpoch == self.mainRootEpoch else { action.onCancel?(); return }
      action.block()
      self.checkRootCompletion()
    }
    action.workItem = item
    pendingActions[action.id] = action
    if paused { pauseScheduledActions(); return }
    startProgressTimerIfNeeded()
    commandQueue.asyncAfter(deadline: .now() + delay, execute: item)
  }

  private func pauseScheduledActions() {
    let now = monotonicNow
    for action in pendingActions.values {
      action.workItem?.cancel()
      suspendedActions.append(SuspendedAction(
        cueId: action.cueId,
        remaining: max(0, action.deadline - now),
        block: action.block,
        mainTransport: action.mainTransport,
        rootEpoch: action.rootEpoch,
        onCancel: action.onCancel
      ))
    }
    pendingActions.removeAll()
  }

  private func resumeScheduledActions() {
    let actions = suspendedActions
    suspendedActions.removeAll()
    actions.forEach { action in
      schedule(after: action.remaining, cueId: action.cueId, mainTransport: action.mainTransport, rootEpoch: action.rootEpoch, onCancel: action.onCancel, block: action.block)
    }
  }

  private func cancelScheduledActions(matching cueIds: Set<String>? = nil) {
    for action in Array(pendingActions.values) where cueIds == nil || (action.cueId.map { cueIds?.contains($0) == true } ?? false) {
      action.workItem?.cancel()
      pendingActions.removeValue(forKey: action.id)
      action.onCancel?()
    }
    if let cueIds {
      let cancelled = suspendedActions.filter { action in action.cueId.map(cueIds.contains) ?? false }
      suspendedActions.removeAll { action in action.cueId.map(cueIds.contains) ?? false }
      cancelled.forEach { $0.onCancel?() }
    } else {
      let cancelled = suspendedActions; suspendedActions.removeAll(); cancelled.forEach { $0.onCancel?() }
    }
    checkRootCompletion()
  }

  private func selectedVoices(_ source: [String: Any]) -> [Voice]? {
    guard let selector = source["selector"] as? [String: Any],
          let kind = selector["kind"] as? String else {
      fault("SELECTOR_INVALID", "The cue selector is invalid.")
      return nil
    }
    switch kind {
    case "all":
      return Array(voices.values)
    case "cueIds":
      guard let ids = selector["cueIds"] as? [String] else {
        fault("SELECTOR_INVALID", "The cue selector has no cue IDs.")
        return nil
      }
      let selected = Set(ids)
      return voices.values.filter { selected.contains($0.cueId) }
    case "tags":
      guard let tags = selector["tags"] as? [String] else {
        fault("SELECTOR_INVALID", "The cue selector has no tags.")
        return nil
      }
      let selected = Set(tags)
      return voices.values.filter { !$0.tags.isDisjoint(with: selected) }
    default:
      fault("SELECTOR_INVALID", "The cue selector kind is unsupported.")
      return nil
    }
  }

  private func selectedCueIds(_ source: [String: Any]) -> Set<String>? {
    guard let selector = source["selector"] as? [String: Any], let kind = selector["kind"] as? String else { return nil }
    switch kind {
    case "all": return Set(cues.keys)
    case "cueIds": return Set(selector["cueIds"] as? [String] ?? [])
    case "tags":
      let tags = Set(selector["tags"] as? [String] ?? [])
      return Set(cues.compactMap { id, cue in
        let cueTags = Set(cue["tags"] as? [String] ?? [])
        return cueTags.isDisjoint(with: tags) ? nil : id
      })
    default: return nil
    }
  }

  // MARK: - Voice and lifecycle safety

  private func removeVoice(_ voiceId: String, emitEnd: Bool) {
    guard let voice = voices.removeValue(forKey: voiceId) else { return }
    if mainVoiceId == voiceId { mainVoiceId = nil }
    voice.onStarted = nil
    if voice.hasStartTap { voice.mixer.removeTap(onBus: 0); voice.hasStartTap = false }
    voice.playbackGeneration += 1
    voice.envelopeCompletion?.cancel()
    voice.envelopeCompletion = nil
    voice.envelopeGeneration += 1
    voice.envelope = nil
    voice.player.stop()
    voice.gainUnit.auAudioUnit.reset()
    voice.gainUnit.globalGain = 0
    voice.mixer.outputVolume = 1
    availableVoiceSlots.append(voice.slot)
    if !rootLaunching, rootAdmission == nil, rootAwaitingFirstStart,
      !voices.values.contains(where: { $0.rootEpoch == mainRootEpoch }), !pendingActions.values.contains(where: { $0.rootEpoch == mainRootEpoch }), !suspendedActions.contains(where: { $0.rootEpoch == mainRootEpoch }) { rootAwaitingFirstStart = false }
    if voices.isEmpty, pendingActions.isEmpty, rootAdmission == nil, !rootLaunching, !rootAwaitingFirstStart { transitioning = false }
    if emitEnd {
      emit(["type": "VOICE_END", "cueId": voice.cueId, "voiceId": voice.id, "mainTransport": voice.mainTransport])
    }
    finishOmsCrossfadeIfReady()
    if let admission = rootAdmission { maybeCommitRootAdmission(admission) }
    checkRootCompletion()
  }

  private func stopAll(emitState: Bool = true, cancelScheduled: Bool = true, reason: String = "stop_all") {
    invalidateRootTransport()
    omsCrossfade = nil
    refusedAutomaticCrossfadeVoiceId = nil
    emitSafetyStop(reason)
    if cancelScheduled { cancelScheduledActions() }
    Array(voices.keys).forEach { removeVoice($0, emitEnd: true) }
    mainVoiceId = nil
    mainCueId = nil
    transitioning = false
    paused = false
    pausedAt = nil
    stopProgressTimer()
    updateNowPlaying(state: .stopped)
    if emitState { emit(["type": "STATE", "state": "stopped"]) }
  }

  private func stopMainForSelection() {
    invalidateRootTransport()
    omsCrossfade = nil
    refusedAutomaticCrossfadeVoiceId = nil
    emitSafetyStop("selection")
    runGeneration += 1
    cancelMainActions()
    voices.values.filter { $0.belongsToMainSequence }.map(\.id).forEach { removeVoice($0, emitEnd: true) }
    mainVoiceId = nil; mainCueId = nil; transitioning = false
    if voices.isEmpty, pendingActions.isEmpty, suspendedActions.isEmpty { paused = false; pausedAt = nil }
    emitAuthoritativePlaybackState()
  }

  private func cancelMainActions() {
    for action in Array(pendingActions.values) where action.mainTransport {
      action.workItem?.cancel(); pendingActions.removeValue(forKey: action.id); action.onCancel?()
    }
    let cancelled = suspendedActions.filter(\.mainTransport)
    suspendedActions.removeAll { $0.mainTransport }; cancelled.forEach { $0.onCancel?() }
  }

  private func cancelRootAdmissionIfSelected(_ source: [String: Any]) {
    guard let admission = rootAdmission else { return }
    let selected = selectedCueIds(source)
    if selected == nil || admission.entries.contains(where: { selected?.contains($0.cueId) == true }) {
      cancelRootAdmission(); transitioning = false; rootHeldForGo = mainCueId != nil
    }
  }

  private func invalidateRootTransport() {
    lastRootRefusal = nil
    mainRootEpoch += 1; rootCompletionQueued = nil; rootHeldForGo = false; rootAwaitingFirstStart = false; rootLaunching = false
    cancelRootAdmission()
  }

  private func emitStateAfterVoiceChange() {
    if voices.isEmpty {
      emit(["type": "STATE", "state": prepared ? "ready" : "stopped"])
      updateNowPlaying(state: .paused)
    }
  }

  private func emitAuthoritativePlaybackState() {
    let state: String
    let nowPlaying: MPNowPlayingPlaybackState
    if !prepared {
      state = "stopped"
      nowPlaying = .stopped
    } else if voices.isEmpty {
      state = "ready"
      nowPlaying = .paused
    } else if paused {
      state = "paused"
      nowPlaying = .paused
    } else {
      state = "playing"
      nowPlaying = .playing
    }
    emit(["type": "STATE", "state": state])
    updateNowPlaying(state: nowPlaying)
  }

  private func shutdownInternal() {
    audioSessionGate.invalidate()
    NativeRemoteCoordinator.setArmed(false)
    if !previewMode { NotificationCenter.default.post(name: NSNotification.Name("ShowControlRunState"), object: nil, userInfo: ["event": ["type": "SHUTDOWN", "generation": runGeneration, "monotonicMs": monotonicNow * 1_000]]) }
    prepared = false
    preparedSnapshotJson = nil
    safetyState = .faulted
    stopAll(emitState: false, cancelScheduled: true)
    removeObservers()
    removeRemoteCommands()
    emergencyLock.lock()
    engine.stop()
    engine.reset()
    emergencyLock.unlock()
    cues.removeAll()
    cueOrder.removeAll()
    nextCueIndex = 0
    resetCommandAdmission()
    clearUrgentMutes()
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func configureSession() throws {
    let session = AVAudioSession.sharedInstance()
    // Voice calibration deliberately establishes an external microphone route.
    // Preserve duplex/Bluetooth routing, but do not inherit calibration's
    // mixWithOthers option into a show and mix unrelated apps over its audio.
    if session.category == .playAndRecord {
      let exclusive = session.categoryOptions.subtracting([.mixWithOthers, .duckOthers, .interruptSpokenAudioAndMixWithOthers])
      try session.setCategory(.playAndRecord, mode: session.mode, options: exclusive)
    } else { try session.setCategory(.playback, mode: .default, options: []) }
    try session.setActive(true)
  }

  private func configureVoiceGraph() {
    voiceSlots = (0..<voiceLimit).map { _ in VoiceNodeSlot() }
    for slot in voiceSlots {
      engine.attach(slot.player)
      engine.attach(slot.timePitch)
      engine.attach(slot.gainUnit)
      engine.attach(slot.mixer)
      engine.connect(slot.player, to: slot.timePitch, format: nil)
      engine.connect(slot.timePitch, to: slot.gainUnit, format: nil)
      engine.connect(slot.gainUnit, to: slot.mixer, format: nil)
      engine.connect(
        slot.mixer,
        to: engine.mainMixerNode,
        fromBus: 0,
        toBus: engine.mainMixerNode.nextAvailableInputBus,
        format: nil
      )
    }
    availableVoiceSlots = voiceSlots
  }

  private func installObservers(epoch: UInt64) {
    removeObservers()
    let center = NotificationCenter.default
    interruptionObserver = center.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: AVAudioSession.sharedInstance(),
      queue: nil
    ) { [weak self] note in self?.handleInterruption(note, epoch: epoch) }
    routeObserver = center.addObserver(
      forName: AVAudioSession.routeChangeNotification,
      object: AVAudioSession.sharedInstance(),
      queue: nil
    ) { [weak self] note in self?.handleRouteChange(note, epoch: epoch) }
    mediaResetObserver = center.addObserver(
      forName: AVAudioSession.mediaServicesWereResetNotification,
      object: AVAudioSession.sharedInstance(),
      queue: nil
    ) { [weak self] _ in self?.handleMediaServicesReset(epoch: epoch) }
    mediaLostObserver = center.addObserver(
      forName: AVAudioSession.mediaServicesWereLostNotification,
      object: AVAudioSession.sharedInstance(),
      queue: nil
    ) { [weak self] _ in self?.handleMediaServicesLost(epoch: epoch) }
  }

  private func removeObservers() {
    let center = NotificationCenter.default
    if let interruptionObserver { center.removeObserver(interruptionObserver) }
    if let routeObserver { center.removeObserver(routeObserver) }
    if let mediaResetObserver { center.removeObserver(mediaResetObserver) }
    if let mediaLostObserver { center.removeObserver(mediaLostObserver) }
    interruptionObserver = nil
    routeObserver = nil
    mediaResetObserver = nil
    mediaLostObserver = nil
  }

  private func handleInterruption(_ note: Notification, epoch: UInt64) {
    guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
    if type == .began {
      guard audioSessionGate.interrupt(epoch, mute: emergencyMuteNow) else { return }
      commandQueue.async {
        self.invalidateInterruptedSession(epoch: epoch, state: .interrupted, code: "AUDIO_SESSION_INTERRUPTED", reason: "audio_session_began")
      }
    } else {
      // Ignore shouldResume and ended notifications, including stale endings
      // from a replaced preparation. Recovery always requires fresh prepare.
    }
  }

  private func handleRouteChange(_ note: Notification, epoch: UInt64) {
    let previousRoute = note.userInfo?[AVAudioSessionRouteChangePreviousRouteKey] as? AVAudioSessionRouteDescription
    let previous = previousRoute?.outputs.first?.portType.rawValue ?? "unknown"
    let currentRoute = AVAudioSession.sharedInstance().currentRoute
    let current = currentRoute.outputs.first?.portType.rawValue ?? "none"
    let rawReason = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
    let reason = AVAudioSession.RouteChangeReason(rawValue: rawReason)

    let previousIdentity = previousRoute?.outputs.map { "\($0.uid):\($0.portType.rawValue)" }.sorted()
    let currentIdentity = currentRoute.outputs.map { "\($0.uid):\($0.portType.rawValue)" }.sorted()
    let routeChanged = previousIdentity == nil || previousIdentity != currentIdentity
    let mustStop = routeChanged
      || reason == .oldDeviceUnavailable
      || reason == .noSuitableRouteForCategory
      || reason == .routeConfigurationChange
    guard mustStop else { return }

    guard audioSessionGate.interrupt(epoch, mute: emergencyMuteNow) else { return }
    commandQueue.async {
      guard self.invalidateInterruptedSession(epoch: epoch, state: .routeInvalid, code: "AUDIO_ROUTE_CHANGED", reason: "audio_route_changed", emitInterruption: false) else { return }
      guard !self.previewMode else { return }
      self.emit([
        "type": "ROUTE_CHANGE",
        "previous": previous,
        "current": current,
        "safeStopped": true,
        "reason": reason?.rawValue ?? 0,
      ])
    }
  }

  private func handleMediaServicesLost(epoch: UInt64) {
    guard audioSessionGate.interrupt(epoch, mute: emergencyMuteNow) else { return }
    commandQueue.async {
      self.invalidateInterruptedSession(epoch: epoch, state: .faulted, code: "MEDIA_SERVICES_LOST", reason: "media_services_lost")
    }
  }

  private func handleMediaServicesReset(epoch: UInt64) {
    guard audioSessionGate.interrupt(epoch, mute: emergencyMuteNow) else { return }
    commandQueue.async {
      self.invalidateInterruptedSession(epoch: epoch, state: .faulted, code: "MEDIA_SERVICES_RESET", reason: "media_services_reset")
    }
  }

  @discardableResult
  private func invalidateInterruptedSession(epoch: UInt64, state: EngineSafetyState, code: String, reason: String, emitInterruption: Bool = true) -> Bool {
    guard prepared, audioSessionGate.isCurrent(epoch) else { return false }
    _ = NativeRemoteCoordinator.commandEpoch("STOP_ALL")
    safetyState = state
    runGeneration += 1
    stopAll(emitState: false, cancelScheduled: true, reason: reason)
    if previewMode {
      fault("PREVIEW_" + code, "Audio preview was interrupted; start a new preview deliberately.")
    } else {
      if state == .faulted { fault(code, "iOS audio services changed; prepare the run again deliberately.") }
      if emitInterruption { emit(["type": "INTERRUPTION", "reason": reason]) }
      emitRunState()
    }
    return true
  }

  // MARK: - Lock-screen controls

  private func installRemoteCommands() {
    removeRemoteCommands()
    let remote = MPRemoteCommandCenter.shared()
    remote.playCommand.isEnabled = true
    remote.pauseCommand.isEnabled = true
    remote.togglePlayPauseCommand.isEnabled = true
    remote.nextTrackCommand.isEnabled = true
    remote.previousTrackCommand.isEnabled = false
    remote.changePlaybackPositionCommand.isEnabled = false

    remote.playCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      if NativeRemoteCoordinator.mediaInput("MEDIA_PLAY") { return .success }
      guard let epoch = NativeRemoteCoordinator.commandEpoch("RESUME") else { return .commandFailed }
      return self.commandQueue.sync {
        guard NativeRemoteCoordinator.isCurrentCommand(epoch) else { return .commandFailed }
        guard self.prepared, self.safetyState == .normal, self.audioSessionGate.permitsPlayback else { return .commandFailed }
        if self.transportMode == "oms" {
          do { try self.executeSemantic(["type": "RESUME"]) } catch { return .commandFailed }
        } else if self.paused && !self.resumeAll() { return .commandFailed }
        self.emitRunState()
        self.emit(["type": "REMOTE_COMMAND", "command": "PAUSE_RESUME"])
        return .success
      }
    }
    remote.pauseCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      if NativeRemoteCoordinator.mediaInput("MEDIA_PAUSE") { return .success }
      guard let epoch = NativeRemoteCoordinator.commandEpoch("PAUSE") else { return .commandFailed }
      return self.commandQueue.sync {
        guard NativeRemoteCoordinator.isCurrentCommand(epoch) else { return .commandFailed }
        guard self.prepared, self.safetyState == .normal, self.audioSessionGate.permitsPlayback else { return .commandFailed }
        if self.transportMode == "oms" { do { try self.executeSemantic(["type": "PAUSE"]) } catch { return .commandFailed } }
        else if !self.paused && (!self.voices.isEmpty || !self.pendingActions.isEmpty || self.rootAdmission != nil || self.rootHeldForGo) { self.pauseAll(userInitiated: true) }
        self.emitRunState()
        self.emit(["type": "REMOTE_COMMAND", "command": "PAUSE_RESUME"])
        return .success
      }
    }
    remote.togglePlayPauseCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      if NativeRemoteCoordinator.mediaInput("MEDIA_PLAY_PAUSE") { return .success }
      guard let epoch = NativeRemoteCoordinator.commandEpoch("PAUSE_RESUME") else { return .commandFailed }
      return self.commandQueue.sync {
        guard NativeRemoteCoordinator.isCurrentCommand(epoch) else { return .commandFailed }
        guard self.prepared, self.safetyState == .normal, self.audioSessionGate.permitsPlayback else { return .commandFailed }
        if self.transportMode == "oms" {
          do { try self.executeSemantic(["type": "PAUSE_RESUME"]) } catch { return .commandFailed }
        } else if self.paused {
          guard self.resumeAll() else { return .commandFailed }
        } else if !self.voices.isEmpty || !self.pendingActions.isEmpty || self.rootAdmission != nil || self.rootHeldForGo {
          self.pauseAll(userInitiated: true)
        }
        self.emit(["type": "REMOTE_COMMAND", "command": "PAUSE_RESUME"])
        self.emitRunState()
        return .success
      }
    }
    remote.nextTrackCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      if NativeRemoteCoordinator.mediaInput("MEDIA_NEXT") { return .success }
      guard let epoch = NativeRemoteCoordinator.commandEpoch("GO") else { return .commandFailed }
      return self.commandQueue.sync {
        guard NativeRemoteCoordinator.isCurrentCommand(epoch) else { return .commandFailed }
        guard self.prepared, self.safetyState == .normal, self.audioSessionGate.permitsPlayback else { return .commandFailed }
        if self.transportMode == "oms" { do { try self.executeSemantic(["type": "GO"]); self.emitRunState() } catch { return .commandFailed } }
        else if !self.advanceNextCue(reason: "lock_screen") { return .noActionableNowPlayingItem }
        return .success
      }
    }
    remote.previousTrackCommand.isEnabled = true
    remote.previousTrackCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      if NativeRemoteCoordinator.mediaInput("MEDIA_PREVIOUS") { return .success }
      guard let epoch = NativeRemoteCoordinator.commandEpoch("PREVIOUS") else { return .commandFailed }
      return self.commandQueue.sync { guard NativeRemoteCoordinator.isCurrentCommand(epoch) else { return .commandFailed }; do { try self.executeSemantic(["type": "PREVIOUS"]); self.emitRunState(); return .success } catch { return .commandFailed } }
    }
    remote.stopCommand.isEnabled = true
    remote.stopCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      if NativeRemoteCoordinator.mediaInput("MEDIA_STOP") { return .success }
      guard let epoch = NativeRemoteCoordinator.commandEpoch("STOP_ALL") else { return .commandFailed }
      self.emergencyMuteNow()
      self.commandQueue.async { guard NativeRemoteCoordinator.isCurrentCommand(epoch) else { return }; self.stopAll(); self.mainCueId = nil; self.transitioning = false; self.emitRunState() }
      return .success
    }
  }

  private func removeRemoteCommands() {
    let remote = MPRemoteCommandCenter.shared()
    remote.playCommand.removeTarget(nil)
    remote.pauseCommand.removeTarget(nil)
    remote.togglePlayPauseCommand.removeTarget(nil)
    remote.nextTrackCommand.removeTarget(nil)
    remote.previousTrackCommand.removeTarget(nil)
    remote.stopCommand.removeTarget(nil)
  }

  private func updateNowPlaying(state: MPNowPlayingPlaybackState) {
    MPNowPlayingInfoCenter.default().nowPlayingInfo = [
      MPMediaItemPropertyTitle: "Show Control",
      MPNowPlayingInfoPropertyPlaybackRate: state == .playing ? 1 : 0,
    ]
    MPNowPlayingInfoCenter.default().playbackState = state
  }

  // MARK: - Helpers

  private var monotonicNow: TimeInterval { ProcessInfo.processInfo.systemUptime }

  private func validateSnapshotAudioMedia(_ parsedCues: [String: [String: Any]]) throws {
    for cueId in parsedCues.keys.sorted() {
      guard let cue = parsedCues[cueId], cue["type"] as? String == "audio" else { continue }
      _ = try validateAudioCue(cueId: cueId, cue: cue, decodeProbe: true)
    }
  }

  private func validateAudioCue(
    cueId: String,
    cue: [String: Any],
    decodeProbe: Bool
  ) throws -> ValidatedAudioAsset {
    guard let media = cue["mediaAsset"] as? [String: Any],
          let uri = media["localUri"] as? String,
          let url = canonicalApprovedMediaURL(uri) else {
      throw error(10, "Audio cue \(cueId) does not reference approved app-owned media.")
    }

    let fileManager = FileManager.default
    var isDirectory = ObjCBool(false)
    guard fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory),
          !isDirectory.boolValue,
          fileManager.isReadableFile(atPath: url.path) else {
      throw error(11, "Audio cue \(cueId) media is missing or unreadable.")
    }
    let values = try url.resourceValues(forKeys: [.isRegularFileKey])
    guard values.isRegularFile == true else {
      throw error(12, "Audio cue \(cueId) media is not a regular file.")
    }

    let file: AVAudioFile
    do {
      file = try AVAudioFile(forReading: url)
    } catch {
      throw self.error(13, "Audio cue \(cueId) media could not be opened by AVFoundation.")
    }
    let sampleRate = file.processingFormat.sampleRate
    guard sampleRate.isFinite, sampleRate > 0, file.length > 0 else {
      throw error(14, "Audio cue \(cueId) media has no decodable audio frames.")
    }

    if decodeProbe {
      let probeFrames = AVAudioFrameCount(min(file.length, AVAudioFramePosition(4_096)))
      guard probeFrames > 0,
            let buffer = AVAudioPCMBuffer(
              pcmFormat: file.processingFormat,
              frameCapacity: probeFrames
            ) else {
        throw error(15, "Audio cue \(cueId) media could not allocate a decode probe.")
      }
      do {
        try file.read(into: buffer, frameCount: probeFrames)
      } catch {
        throw self.error(16, "Audio cue \(cueId) media failed its decode probe.")
      }
      guard buffer.frameLength > 0 else {
        throw error(17, "Audio cue \(cueId) media returned no decoded frames.")
      }
      file.framePosition = 0
    }

    for key in ["preWaitMs", "fadeInMs", "fadeOutMs"] {
      let value = number(cue, key).doubleValue
      guard value.isFinite, value >= 0 else {
        throw error(22, "Audio cue \(cueId) has an invalid \(key) value.")
      }
    }
    let gain = number(cue, "gainDb").doubleValue
    guard gain.isFinite else {
      throw error(23, "Audio cue \(cueId) has an invalid gain value.")
    }

    let trimStartMs = number(cue, "trimInMs").doubleValue
    guard trimStartMs.isFinite, trimStartMs >= 0 else {
      throw error(18, "Audio cue \(cueId) has an invalid trim-in value.")
    }
    let trimEndMs = (cue["trimOutMs"] as? NSNumber)?.doubleValue
    if let trimEndMs {
      guard trimEndMs.isFinite, trimEndMs > trimStartMs else {
        throw error(19, "Audio cue \(cueId) has an empty or invalid trim range.")
      }
    }

    let startRaw = trimStartMs * sampleRate / 1_000
    let endRaw = (trimEndMs ?? (Double(file.length) / sampleRate * 1_000)) * sampleRate / 1_000
    guard startRaw.isFinite, endRaw.isFinite,
          startRaw >= 0, endRaw >= 0,
          startRaw <= Double(Int64.max), endRaw <= Double(Int64.max) else {
      throw error(20, "Audio cue \(cueId) trim values exceed the native scheduler range.")
    }
    let trimStart = min(file.length, AVAudioFramePosition(startRaw.rounded(.towardZero)))
    let trimEnd = min(file.length, AVAudioFramePosition(endRaw.rounded(.towardZero)))
    guard trimEnd > trimStart,
          trimEnd - trimStart <= AVAudioFramePosition(UInt32.max) else {
      throw error(21, "Audio cue \(cueId) trim range is empty or too long for the native scheduler.")
    }

    return ValidatedAudioAsset(
      file: file,
      trimStartFrame: trimStart,
      trimEndFrame: trimEnd
    )
  }

  private func canonicalApprovedMediaURL(_ value: String) -> URL? {
    let source: URL
    if value.hasPrefix("file://") {
      guard let parsed = URL(string: value), parsed.isFileURL,
            parsed.host == nil || parsed.host == "" || parsed.host == "localhost" else { return nil }
      source = parsed
    } else {
      guard value.hasPrefix("/") else { return nil }
      source = URL(fileURLWithPath: value)
    }

    let candidate = source.standardizedFileURL.resolvingSymlinksInPath()
    let fileManager = FileManager.default
    let roots = [FileManager.SearchPathDirectory.documentDirectory, .applicationSupportDirectory]
      .compactMap { directory in
        fileManager.urls(for: directory, in: .userDomainMask).first?
          .standardizedFileURL
          .resolvingSymlinksInPath()
      }
    return roots.contains { root in
      let prefix = root.path.hasSuffix("/") ? root.path : root.path + "/"
      return candidate.path.hasPrefix(prefix)
    } ? candidate : nil
  }

  private func admitCommandId(_ commandId: Int) -> Bool {
    admissionLock.lock()
    defer { admissionLock.unlock() }
    guard commandId > lastObservedCommandId else { return false }
    lastObservedCommandId = commandId
    return true
  }

  private func resetCommandAdmission() {
    admissionLock.lock()
    lastObservedCommandId = 0
    admissionLock.unlock()
  }

  private func armUrgentMute(commandId: Int, type: String) {
    let token = UUID()
    emergencyLock.lock()
    urgentTokens[commandId] = token
    emergencyLock.unlock()

    let delay: DispatchTimeInterval = type == "PANIC_FADE" ? .milliseconds(40) : .milliseconds(0)
    emergencyQueue.asyncAfter(deadline: .now() + delay) { [weak self] in
      guard let self else { return }
      self.emergencyLock.lock()
      guard self.urgentTokens[commandId] == token else {
        self.emergencyLock.unlock()
        return
      }
      self.urgentTokens.removeValue(forKey: commandId)
      self.hardMutedUrgentCommands.insert(commandId)
      self.emergencyLock.unlock()
      self.emergencyMuteNow()
    }
  }

  private func consumeUrgentMute(commandId: Int) -> Bool {
    emergencyLock.lock()
    urgentTokens.removeValue(forKey: commandId)
    let hardMuted = hardMutedUrgentCommands.remove(commandId) != nil
    emergencyLock.unlock()
    return hardMuted
  }

  private func clearUrgentMutes() {
    emergencyLock.lock()
    urgentTokens.removeAll()
    hardMutedUrgentCommands.removeAll()
    emergencyLock.unlock()
  }

  private func emergencyMuteNow() {
    // The emergency queue never mutates the voice graph. It only closes a final
    // gain gate before ordinary command serialization catches up.
    emergencyLock.lock()
    let mixer = engine.mainMixerNode
    mixer.outputVolume = 0
    emergencyLock.unlock()
  }

  private func restoreEmergencyOutputIfSafe() {
    guard prepared, safetyState == .normal else { return }
    audioSessionGate.withPlaybackPermission {
      emergencyLock.lock()
      let hasOutstandingMute = !hardMutedUrgentCommands.isEmpty
      if !hasOutstandingMute { engine.mainMixerNode.outputVolume = 1 }
      emergencyLock.unlock()
    }
  }

  private func decodeObject(_ json: String) throws -> [String: Any]? {
    guard let data = json.data(using: .utf8) else { return nil }
    return try JSONSerialization.jsonObject(with: data) as? [String: Any]
  }

  private func number(_ source: [String: Any], _ key: String, default fallback: NSNumber = 0) -> NSNumber {
    source[key] as? NSNumber ?? fallback
  }

  private func string(_ source: [String: Any], _ key: String, default fallback: String) -> String {
    source[key] as? String ?? fallback
  }

  private func emit(_ body: [String: Any]) {
    if previewMode {
      if let type = body["type"] as? String, ["PROGRESS", "STATE", "VOICE_START", "VOICE_END"].contains(type) { emitPreviewState() }
      return
    }
    guard !preparingSnapshot else { return }
    var event = body
    event["generation"] = runGeneration
    event["monotonicMs"] = monotonicNow * 1_000
    event["showId"] = showId
    event["setId"] = setId
    event["revisionId"] = revisionId
    event["currentCueId"] = mainCueId ?? ""
    event["selectedCueId"] = selectedIndex < cueOrder.count ? cueOrder[selectedIndex] : ""
    event["playbackRate"] = mainCueId.flatMap { cues[$0] }.map { number($0, "playbackRate", default: 1).doubleValue } ?? 1
    sendEvent("onEngineEvent", event)
    NotificationCenter.default.post(name: NSNotification.Name("ShowControlRunState"), object: nil, userInfo: ["event": event])
  }
  private func setPreviewPaused(_ shouldPause: Bool) throws {
    guard previewMode, !voices.isEmpty else { throw error(22, "No preview is playing") }
    if shouldPause && !paused { pauseAll(userInitiated: true) }
    else if !shouldPause && paused, !resumeAll() { throw error(24, "Cannot resume preview") }
    emitPreviewState()
  }

  private func emitPreviewState() {
    guard let cue = cues.values.first, let id = cue["id"] as? String else { return }
    let voice = voices.values.first
    let trimIn = number(cue, "trimInMs").doubleValue
    let media = cue["mediaAsset"] as? [String: Any] ?? [:]
    let trimOut = number(cue, "trimOutMs", default: number(media, "durationMs")).doubleValue
    let fallback = voice.map { Double($0.playbackStartFrame - $0.trimStartFrame) / $0.file.processingFormat.sampleRate * 1_000 } ?? 0
    let position = trimIn + (voice.flatMap { playbackPositionMs($0) } ?? fallback)
    sendEvent("onEngineEvent", ["type": "PREVIEW_STATE", "generation": runGeneration, "cueId": id,
      "phase": voice == nil ? "stopped" : paused ? "paused" : "playing",
      "positionMs": max(trimIn, min(trimOut, position)), "trimInMs": trimIn, "trimOutMs": trimOut])
  }
  private func emitSafetyStop(_ reason: String) {
    guard !previewMode, !preparingSnapshot else { return }
    NotificationCenter.default.post(name: NSNotification.Name("ShowControlRunState"), object: nil, userInfo: ["event": ["type": "SAFETY_STOP", "reason": reason, "generation": runGeneration, "monotonicMs": monotonicNow * 1_000]])
  }

  private func inspectionURL(_ uri: String) throws -> URL {
    guard let url = canonicalApprovedMediaURL(uri) else { throw error(10, "Audio must be in app-owned storage") }
    return url
  }

  private func probeMedia(_ uri: String) throws -> [String: Any] {
    let file = try AVAudioFile(forReading: inspectionURL(uri))
    let format = file.processingFormat
    guard file.length > 0, format.sampleRate > 0 else { throw error(13, "Empty audio") }
    let code = file.fileFormat.streamDescription.pointee.mFormatID
    let fourCC = String(bytes: [UInt8((code >> 24) & 255), UInt8((code >> 16) & 255), UInt8((code >> 8) & 255), UInt8(code & 255)], encoding: .ascii) ?? "unknown"
    let codec: String
    switch code {
    case kAudioFormatLinearPCM: codec = "pcm"
    case kAudioFormatMPEG4AAC: codec = "aac"
    case kAudioFormatMPEGLayer3: codec = "mp3"
    case kAudioFormatAppleLossless: codec = "alac"
    default: codec = fourCC.trimmingCharacters(in: .whitespaces)
    }
    return ["durationMs": Int64(Double(file.length) / format.sampleRate * 1000), "codec": codec, "channels": Int(format.channelCount), "sampleRate": Int(format.sampleRate)]
  }

  private func hashFile(_ uri: String) throws -> String {
    let handle = try FileHandle(forReadingFrom: inspectionURL(uri))
    defer { try? handle.close() }
    var hash = SHA256()
    while let chunk = try handle.read(upToCount: 128 * 1024), !chunk.isEmpty { hash.update(data: chunk) }
    return hash.finalize().map { String(format: "%02x", $0) }.joined()
  }

  private func waveform(_ uri: String, buckets: Int) throws -> [Double] {
    guard (16...16384).contains(buckets) else { throw error(27, "Invalid waveform resolution") }
    let file = try AVAudioFile(forReading: inspectionURL(uri))
    guard file.length > 0, let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 8192) else { throw error(13, "Cannot decode waveform") }
    var peaks = [Double](repeating: 0, count: buckets)
    var frame: Int64 = 0
    while file.framePosition < file.length {
      try file.read(into: buffer, frameCount: 8192)
      guard buffer.frameLength > 0, let channels = buffer.floatChannelData else { throw error(13, "PCM float decoding unavailable") }
      for index in 0..<Int(buffer.frameLength) {
        var peak = 0.0
        for channel in 0..<Int(buffer.format.channelCount) { peak = max(peak, abs(Double(channels[channel][index]))) }
        let bucket = min(buckets - 1, Int(frame * Int64(buckets) / file.length))
        peaks[bucket] = max(peaks[bucket], min(1, peak)); frame += 1
      }
    }
    return peaks
  }

  private func fault(_ code: String, _ message: String) {
    if previewMode {
      sendEvent("onEngineEvent", ["type": "PREVIEW_ERROR", "code": code, "message": message, "generation": runGeneration, "cueId": cues.keys.first ?? ""])
      return
    }
    emit(["type": "FAULT", "code": code, "message": message])
  }

  private func error(_ code: Int, _ message: String) -> NSError {
    NSError(domain: "ShowAudio", code: code, userInfo: [NSLocalizedDescriptionKey: message])
  }
}
