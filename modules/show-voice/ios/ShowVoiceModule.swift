import ExpoModulesCore
import AVFoundation

public final class ShowVoiceModule: Module {
  private var engine = AVAudioEngine()
  private let inference = DispatchQueue(label: "showcontrol.voice.inference", qos: .utility)
  private let captureLock = NSLock()
  private var model: SCWhisperBridge?
  private var armed = false
  private var calibrated = false
  private var detail = "Voice is off"
  private var locale = "en"
  private var rules: [[String: Any]] = []
  private var epoch = 0
  private var generation = -1
  private var selectedCue = ""
  private var boundSnapshot: [String: String] = [:]
  private var lastAction: Double = -.greatestFiniteMagnitude
  private var observations: [NSObjectProtocol] = []
  private var samples: [Float] = []
  private var silenceFrames = 0
  private var noiseFloor: Float = 0.005
  private var pending = false
  private var awaitingReceipts: [String: String] = [:]
  private var tapped = false
  private var microphoneRouteIdentity: String?

  public func definition() -> ModuleDefinition {
    Name("ShowVoice"); Events("onVoiceStatus")
    OnCreate {
      let center = NotificationCenter.default
      self.observations.append(center.addObserver(forName: NSNotification.Name("ShowControlRunState"), object: nil, queue: .main) { [weak self] notification in
        if let event = notification.userInfo?["event"] as? [String: Any] { self?.runState(event) }
      })
      self.observations.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: AVAudioSession.sharedInstance(), queue: .main) { [weak self] notification in
        self?.routeChanged(notification)
      })
      self.observations.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: AVAudioSession.sharedInstance(), queue: .main) { [weak self] notification in
        guard let self, let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
        self.microphoneRouteIdentity = nil; self.calibrated = false; self.stop("Voice disarmed after microphone interruption")
      })
      self.observations.append(center.addObserver(forName: AVAudioSession.mediaServicesWereLostNotification, object: AVAudioSession.sharedInstance(), queue: .main) { [weak self] _ in
        self?.mediaServicesChanged("Voice disarmed because iOS audio services became unavailable", recreateEngine: false)
      })
      self.observations.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: AVAudioSession.sharedInstance(), queue: .main) { [weak self] _ in
        self?.mediaServicesChanged("Voice disarmed after iOS reset audio services; calibrate again", recreateEngine: true)
      })
    }
    AsyncFunction("getStatus") { self.status() }
    AsyncFunction("calibrate") { (promise: Promise) in
      guard !self.armed else { promise.reject("VOICE_ARMED", "Disarm voice before calibrating the microphone"); return }
      let requestedEpoch = self.epoch
      AVAudioSession.sharedInstance().requestRecordPermission { granted in DispatchQueue.main.async {
        guard self.epoch == requestedEpoch else { promise.reject("MIC_CALIBRATION_CHANGED", "Audio session changed while requesting microphone permission; retry deliberately"); return }
        guard granted else { promise.reject("MIC_DENIED", "Microphone permission was denied"); return }
        guard !self.armed else { promise.reject("VOICE_ARMED", "Disarm voice before calibrating the microphone"); return }
        do { try self.calibrate(promise) } catch {
          self.calibrated = false; self.microphoneRouteIdentity = nil; self.removeTap(); self.emit()
          promise.reject("MIC_CALIBRATION", "Connect a compatible external microphone and retry calibration")
        }
      } }
    }.runOnQueue(.main)
    AsyncFunction("arm") { (json: String, language: String, modelUri: String, promise: Promise) in
      let requestedEpoch = self.epoch
      self.inference.async {
        do {
          guard let source = URL(string: modelUri), source.isFileURL,
                let document = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { throw VoiceError.invalidModel }
          let url = source.standardizedFileURL.resolvingSymlinksInPath()
          guard url.path.hasPrefix(document.standardizedFileURL.resolvingSymlinksInPath().path + "/") else { throw VoiceError.invalidModel }
          let bridge = try SCWhisperBridge(modelPath: url.path)
          let snapshot = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] ?? [:]
          DispatchQueue.main.async {
            guard self.epoch == requestedEpoch else { bridge.cancel(); promise.reject("VOICE_ARM", "Audio session changed while loading the speech model; arm again deliberately"); return }
            do { try self.arm(snapshot, language: language, bridge: bridge); promise.resolve(self.status()) }
            catch { bridge.cancel(); promise.reject("VOICE_ARM", "Download the speech model, enable a rule and calibrate the external microphone before arming") }
          }
        } catch { promise.reject("VOICE_MODEL", "Offline speech model could not be loaded") }
      }
    }.runOnQueue(.main)
    AsyncFunction("disarm") { (promise: Promise) in DispatchQueue.main.async { self.stop("Voice is disarmed"); promise.resolve(self.status()) } }
    OnDestroy {
      self.observations.forEach { NotificationCenter.default.removeObserver($0) }
      DispatchQueue.main.async { self.stop("Voice module stopped") }
    }
  }
  private func status() -> [String: Any] { ["available": true, "armed": armed, "modelReady": model != nil, "calibrated": calibrated, "detail": detail] }
  private func emit(_ values: [String: Any] = [:]) { sendEvent("onVoiceStatus", status().merging(values, uniquingKeysWith: {_, new in new})) }
  private func routeIdentity() -> String {
    let session = AVAudioSession.sharedInstance()
    let inputs = session.currentRoute.inputs.map { "\($0.uid):\($0.portType.rawValue)" }.sorted().joined(separator: "|")
    let outputs = session.currentRoute.outputs.map { "\($0.uid):\($0.portType.rawValue)" }.sorted().joined(separator: "|")
    return "\(inputs)>\(outputs):\(session.sampleRate):\(session.inputNumberOfChannels):\(session.outputNumberOfChannels)"
  }
  private func routeChanged(_ notification: Notification) {
    guard let expected = microphoneRouteIdentity else { return }
    let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
    let reason = AVAudioSession.RouteChangeReason(rawValue: raw)
    // Explicit setup changes the category and preferred input. Their queued
    // notifications must not invalidate capture when the established route is
    // unchanged. Port identity and format changes still require recalibration.
    guard reason == .oldDeviceUnavailable || reason == .noSuitableRouteForCategory || routeIdentity() != expected else { return }
    microphoneRouteIdentity = nil; calibrated = false; stop("Voice disarmed after microphone route changed")
  }
  private func routeMicrophone() throws {
    let session = AVAudioSession.sharedInstance()
    // Same-app show audio shares this session; it does not require mixing with
    // other apps, which would let unrelated media play over the performance.
    try session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetooth, .allowBluetoothA2DP])
    guard let input = session.availableInputs?.first(where: { [.usbAudio, .headsetMic, .bluetoothHFP].contains($0.portType) }) else { throw VoiceError.noMicrophone }
    try session.setPreferredInput(input); try session.setActive(true)
    // Voice Processing I/O supplies system echo suppression when this route supports it.
    // A route that cannot enable it retains explicit calibration and manual fallback.
    try? engine.inputNode.setVoiceProcessingEnabled(true)
    microphoneRouteIdentity = routeIdentity()
  }
  private func calibrate(_ promise: Promise) throws {
    guard !armed else { throw VoiceError.alreadyArmed }
    calibrated = false; microphoneRouteIdentity = nil
    try routeMicrophone(); removeTap()
    captureLock.lock(); samples.removeAll(); silenceFrames = 0; captureLock.unlock()
    let input = engine.inputNode; let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else {throw VoiceError.noMicrophone}
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      guard let self, let values = buffer.floatChannelData?[0] else {return}
      var sum: Float = 0; for index in 0..<Int(buffer.frameLength) {sum += values[index] * values[index]}
      self.captureLock.lock(); self.noiseFloor = max(0.002, min(0.15, sqrt(sum / Float(max(1, buffer.frameLength))))); self.captureLock.unlock()
    }
    tapped = true; engine.prepare(); try engine.start()
    let session = AVAudioSession.sharedInstance()
    guard let preferred = session.preferredInput, session.currentRoute.inputs.contains(where: { $0.uid == preferred.uid }) else { throw VoiceError.noMicrophone }
    microphoneRouteIdentity = routeIdentity()
    let calibrationEpoch = epoch
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
      guard self.epoch == calibrationEpoch, self.engine.isRunning else { promise.reject("MIC_CALIBRATION_CHANGED", "Microphone route changed during calibration; retry deliberately"); return }
      self.removeTap(); self.calibrated = true; self.detail = "External microphone calibrated; rehearse with music and audience noise"; self.emit(); promise.resolve(self.status())
    }
  }
  private func arm(_ snapshot: [String: Any], language: String, bridge: SCWhisperBridge) throws {
    guard calibrated, !armed, ["en", "he", "es", "fr", "de", "it", "pt", "ru", "ja", "ar"].contains(language) else {throw VoiceError.notCalibrated}
    rules = (snapshot["voiceRules"] as? [[String: Any]] ?? []).filter { $0["enabled"] as? Bool == true && $0["locale"] as? String == language }
    guard !rules.isEmpty else {throw VoiceError.noRules}
    for key in ["showId", "setId", "revisionId"] { guard let id = snapshot[key] as? String, !id.isEmpty else { throw VoiceError.noRules }; boundSnapshot[key] = id }
    removeTap(); model = bridge; locale = language; epoch += 1; generation = -1; selectedCue = ""; lastAction = -.greatestFiniteMagnitude
    let capturedEpoch = epoch
    let input = engine.inputNode; let source = input.outputFormat(forBus: 0)
    guard let destination = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false),
          let converter = AVAudioConverter(from: source, to: destination) else {throw VoiceError.noMicrophone}
    captureLock.lock(); armed = true; samples.removeAll(); pending = false; silenceFrames = 0; captureLock.unlock()
    input.installTap(onBus: 0, bufferSize: 4096, format: source) { [weak self] buffer, _ in
      guard let self else {return}
      let capacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * 16000 / source.sampleRate) + 32)
      guard let converted = AVAudioPCMBuffer(pcmFormat: destination, frameCapacity: capacity) else {return}
      var error: NSError?; var supplied = false
      converter.convert(to: converted, error: &error) {_, status in if supplied {status.pointee = .noDataNow; return nil}; supplied = true; status.pointee = .haveData; return buffer}
      guard error == nil, let pointer = converted.floatChannelData?[0] else {return}
      self.capture(Array(UnsafeBufferPointer(start: pointer, count: Int(converted.frameLength))), capturedEpoch: capturedEpoch, bridge: bridge)
    }
    tapped = true; engine.prepare()
    do {try engine.start(); detail = "Local voice recognition armed"; emit()}
    catch {stop("Microphone capture could not start"); throw error}
  }
  private func capture(_ frame: [Float], capturedEpoch: Int, bridge: SCWhisperBridge) {
    guard !frame.isEmpty else {return}
    captureLock.lock()
    guard armed, capturedEpoch == epoch else {captureLock.unlock(); return}
    let level = sqrt(frame.reduce(Float(0)) {$0 + $1 * $1} / Float(frame.count))
    let voiced = level > max(0.012, noiseFloor * 3)
    if voiced {silenceFrames = 0} else {silenceFrames += frame.count}
    if voiced || !samples.isEmpty {samples.append(contentsOf: frame)} else {noiseFloor = max(0.002, min(0.15, noiseFloor * 0.99 + level * 0.01))}
    guard samples.count >= 16000 && (silenceFrames >= 8000 || samples.count >= 128000) else {captureLock.unlock(); return}
    let window = samples; samples.removeAll(); silenceFrames = 0
    guard !pending else {captureLock.unlock(); return}; pending = true; captureLock.unlock()
    DispatchQueue.main.async {
      let capturedGeneration = self.generation; let selection = self.selectedCue; let language = self.locale
      self.inference.async {
        let data = window.withUnsafeBufferPointer {Data(buffer: $0)}
        let result = bridge.transcribeSamples(data, language: language)
        DispatchQueue.main.async {
          self.captureLock.lock(); self.pending = false; self.captureLock.unlock()
          guard self.armed, self.epoch == capturedEpoch, self.generation == capturedGeneration, self.selectedCue == selection else {return}
          self.recognized(result["text"] as? String ?? "", confidence: (result["confidence"] as? NSNumber)?.doubleValue ?? 0)
        }
      }
    }
  }
  private func normalize(_ value: String) -> String {
    value.precomposedStringWithCompatibilityMapping.lowercased().folding(options: .diacriticInsensitive, locale: Locale(identifier: locale))
      .components(separatedBy: CharacterSet.punctuationCharacters.union(.symbols)).joined(separator: " ")
      .components(separatedBy: .whitespacesAndNewlines).filter {!$0.isEmpty}.joined(separator: " ")
  }
  private func recognized(_ text: String, confidence: Double) {
    let now = ProcessInfo.processInfo.systemUptime * 1000
    emit(["transcript": String(text.prefix(1000)), "confidence": confidence, "monotonicMs": now])
    guard confidence >= 0.45, generation >= 0 else {return}
    let phrase = " " + normalize(text) + " "
    let matching = rules.filter {rule in
      let scope = rule["cueId"] as? String
      guard scope == nil || scope == selectedCue else {return false}
      return (rule["phrases"] as? [String] ?? []).contains { let word = normalize($0); return !word.isEmpty && phrase.contains(locale == "ja" ? word : " " + word + " ") }
    }
    let scoped = matching.filter {$0["cueId"] as? String != nil}
    let matches = scoped.isEmpty ? matching : scoped
    guard matches.count == 1 else {if matches.count > 1 {detail = "Ambiguous voice phrase; no command fired"; emit()}; return}
    guard now - lastAction >= 2000, var command = matches[0]["action"] as? [String: Any] else {return}
    lastAction = now; command["delayMs"] = matches[0]["delayMs"] as? Int ?? 0; command["eventId"] = "voice:\(epoch):\(Int(now))"; command["generation"] = generation
    command["capturedCueId"] = selectedCue
    let eventId = command["eventId"] as? String ?? ""
    if awaitingReceipts.count >= 128 { awaitingReceipts.removeAll() }
    awaitingReceipts[eventId] = command["type"] as? String ?? ""
    NotificationCenter.default.post(name: NSNotification.Name("ShowControlSemanticCommand"), object: nil, userInfo: ["command": command])
    emit(["lastAction": command["type"] as? String ?? "", "actionReceipt": "dispatched", "actionEventId": eventId, "monotonicMs": now])
  }
  private func runState(_ value: [String: Any]) {
    if value["type"] as? String == "SEMANTIC_RECEIPT" {
      let id = value["eventId"] as? String ?? ""
      if let action = awaitingReceipts.removeValue(forKey: id) { emit(["lastAction": action, "actionReceipt": value["result"] as? String ?? "rejected", "actionEventId": id, "monotonicMs": value["monotonicMs"] ?? ProcessInfo.processInfo.systemUptime * 1000]) }
      return
    }
    guard armed else {return}
    if ["INTERRUPTION", "ROUTE_CHANGE", "SHUTDOWN"].contains(value["type"] as? String ?? "") || (value["type"] as? String == "SAFETY_STOP" && value["reason"] as? String != "selection") || ["interrupted", "fault"].contains(value["phase"] as? String ?? "") {calibrated = false; stop("Voice disarmed after session interruption"); return}
    guard value["type"] as? String == "RUN_STATE", let show = value["showId"] as? String, !show.isEmpty else { return }
    guard ["showId", "setId", "revisionId"].allSatisfy({ value[$0] as? String == boundSnapshot[$0] }) else { stop("Voice disarmed because the prepared playlist revision changed"); return }
    if let next = value["generation"] as? Int { generation = next }
    selectedCue = value["selectedCueId"] as? String ?? selectedCue
  }
  private func removeTap() {engine.stop(); if tapped {engine.inputNode.removeTap(onBus: 0); tapped = false}}
  private func mediaServicesChanged(_ reason: String, recreateEngine: Bool) {
    microphoneRouteIdentity = nil; calibrated = false
    stop(reason)
    if recreateEngine { engine = AVAudioEngine() }
  }
  private func stop(_ reason: String) {
    captureLock.lock(); armed = false; epoch += 1; samples.removeAll(); captureLock.unlock()
    model?.cancel(); model = nil; removeTap(); detail = reason; emit()
  }
}
private enum VoiceError: Error {case invalidModel, noMicrophone, alreadyArmed, notCalibrated, noRules}
