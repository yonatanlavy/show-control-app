import ExpoModulesCore
import Foundation
import GameController
import UIKit
import ShowAudio

public final class ShowControllerModule: Module {
  private var configured = false
  private var backgroundRequested = true
  private var staleQueueMaxAgeMs = 15_000
  private var genericPressed = Set<String>()
  private var pressTimes: [String: TimeInterval] = [:]
  private let sourceSessionId = UUID().uuidString
  private var inputSequence: UInt64 = 0
  private var bindings: [[String: Any]] = []
  private var diagnosticMode = "off"
  private var diagnosticSessionId = ""
  private var pairPromise: Promise?
  private var pairToken: UUID?
  private let inputLock = NSRecursiveLock()
  private let keyboardCaptureLifetime = KeyboardCaptureLifetime()
  private var keyboardListening: Bool { keyboardCaptureLifetime.isRequested }
  private var keyboard: GCKeyboard?
  private var keyboardObservers: [NSObjectProtocol] = []
  private var keyboardTextGate = KeyboardTextInputGate()
  private let keyboardTextFocus = KeyboardTextFocus()

  private lazy var flic = ShowControllerFlicBridge(
    inputHandler: { [weak self] deviceId, inputKey, down, queued, ageMs in
      self?.emitInput(
        adapterId: "flic2",
        deviceId: deviceId,
        inputKey: inputKey,
        phase: down ? "down" : "up",
        reportedRepeat: false,
        queued: queued,
        ageMs: ageMs
      )
    },
    statusHandler: { [weak self] status in
      self?.sendEvent("onControllerHealth", status)
    }
  )

  public func definition() -> ModuleDefinition {
    Name("ShowController")
    Events("onControllerInput", "onControllerHealth", "onControllerScan")

    AsyncFunction("configure") { (staleMs: Double, background: Bool) in
      self.staleQueueMaxAgeMs = min(120_000, max(0, Int(staleMs)))
      self.backgroundRequested = background
      self.flic.configure(
        withBackground: background,
        staleQueueMaxAgeMs: self.staleQueueMaxAgeMs
      )
      self.configured = true
    }

    AsyncFunction("start") {
      NativeRemoteCoordinator.setMediaHandler { [weak self] key, deviceId in
        guard let self else { return false }
        let consumed = self.emitInput(adapterId: "system-media", deviceId: deviceId, inputKey: key, phase: "down", reportedRepeat: false, queued: false, ageMs: 0)
        _ = self.emitInput(adapterId: "system-media", deviceId: deviceId, inputKey: key, phase: "up", reportedRepeat: false, queued: false, ageMs: 0)
        return consumed
      }
      self.startKeyboardCapture()
      if !self.configured {
        self.flic.configure(withBackground: true, staleQueueMaxAgeMs: self.staleQueueMaxAgeMs)
        self.configured = true
      }
      self.flic.start()
    }
    AsyncFunction("configureProfile") { (json: String) in
      try NativeRemoteCoordinator.requireIdle()
      guard let data = json.data(using: .utf8), let profile = try JSONSerialization.jsonObject(with: data) as? [String: Any], let bindings = profile["bindings"] as? [[String: Any]], bindings.count <= 256 else { throw NSError(domain: "ShowController", code: 2) }
      self.inputLock.lock()
      defer { self.inputLock.unlock() }
      self.bindings = bindings.sorted { ($0["adapterId"] == nil ? 0 : 1) + ($0["deviceId"] == nil ? 0 : 1) > ($1["adapterId"] == nil ? 0 : 1) + ($1["deviceId"] == nil ? 0 : 1) }
    }

    AsyncFunction("stop") {
      self.cancelPairing()
      try self.setDiagnosticMode("off")
      NativeRemoteCoordinator.setMediaHandler(nil)
      self.stopKeyboardCapture()
      self.flic.stop()
      self.resetPressed()
    }

    AsyncFunction("health") {
      var snapshot = self.flic.health()
      snapshot["configured"] = self.configured
      snapshot["backgroundRequested"] = self.backgroundRequested
      snapshot["initialPairingMayRequireInternet"] = true
      snapshot["active"] = true
      snapshot["bridgeAvailable"] = true
      snapshot["bridgeListenerCount"] = 1
      snapshot["inputsDroppedWithoutBridge"] = 0
      snapshot["nativeLifecycleOwner"] = "expo_module"
      snapshot["survivesUserForceQuit"] = false
      snapshot["genericKeyboardListening"] = self.keyboardCaptureLifetime.isAttached
      snapshot["genericKeyboardConnected"] = GCKeyboard.coalesced != nil
      snapshot["genericKeyboardForegroundOnly"] = true
      snapshot["genericKeyboardIdentity"] = "keyboard-coalesced"
      snapshot["diagnosticMode"] = NativeRemoteCoordinator.isDiagnostic ? self.diagnosticMode : "off"
      snapshot["diagnosticSessionId"] = NativeRemoteCoordinator.isDiagnostic ? self.diagnosticSessionId : ""
      return snapshot
    }
    AsyncFunction("setDiagnosticMode") { (mode: String) in
      try self.setDiagnosticMode(mode)
    }

    AsyncFunction("scanAndPair") { (promise: Promise) in
      try NativeRemoteCoordinator.requireIdle()
      guard self.pairPromise == nil else { promise.reject("E_FLIC_PAIR", "A pairing scan is already running.", nil); return }
      self.pairPromise = promise
      let token = UUID(); self.pairToken = token
      DispatchQueue.main.asyncAfter(deadline: .now() + 90) { [weak self] in
        guard let self, self.pairToken == token else { return }
        let pending = self.pairPromise; self.pairPromise = nil; self.pairToken = nil; self.flic.cancelScan()
        self.sendEvent("onControllerScan", ["state": "failed", "detail": "Flic pairing timed out. Try again near the phone.", "initialPairingMayRequireInternet": true])
        pending?.reject("E_FLIC_PAIR", "Flic pairing timed out. Try again near the phone.", nil)
      }
      self.flic.scan(withStatus: { state, detail in
        guard self.pairToken == token else { return }
        self.sendEvent("onControllerScan", [
          "state": state,
          "detail": detail,
          "initialPairingMayRequireInternet": true,
        ])
      }, completion: { result, error in
        guard self.pairToken == token, let pending = self.pairPromise else { return }
        self.pairPromise = nil; self.pairToken = nil
        self.sendEvent("onControllerScan", ["state": result == nil ? "failed" : "paired", "detail": error?.localizedDescription ?? "Flic pairing finished.", "initialPairingMayRequireInternet": true])
        if let error {
          pending.reject("E_FLIC_PAIR", error.localizedDescription, error)
        } else if let result {
          pending.resolve(result)
        } else {
          pending.reject("E_FLIC_PAIR", "Flic pairing ended without a result.", nil)
        }
      })
    }

    Function("cancelScan") { self.cancelPairing() }

    Function("forwardGenericInput") {
      (deviceId: String, inputKey: String, phase: String, reportedRepeat: Bool) in
      guard phase == "down" || phase == "up" else {
        throw NSError(
          domain: "ShowController",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "phase must be down or up"]
        )
      }
      self.emitInput(
        adapterId: "generic-native",
        deviceId: deviceId,
        inputKey: inputKey,
        phase: phase,
        reportedRepeat: reportedRepeat,
        queued: false,
        ageMs: 0
      )
    }

    OnDestroy {
      self.cancelPairing()
      try? self.setDiagnosticMode("off")
      NativeRemoteCoordinator.setMediaHandler(nil)
      self.stopKeyboardCapture()
      self.flic.stop()
      self.resetPressed()
    }
  }

  private func startKeyboardCapture() {
    let request = keyboardCaptureLifetime.start()
    keyboardTextFocus.invalidate()
    DispatchQueue.main.async { [weak self] in
      guard let self, self.keyboardCaptureLifetime.mayAttach(request.epoch) else { return }
      if self.keyboardObservers.isEmpty {
        let center = NotificationCenter.default
        self.keyboardObservers = [
          center.addObserver(forName: .GCKeyboardDidConnect, object: nil, queue: .main) { [weak self] _ in self?.attachKeyboard() },
          center.addObserver(forName: .GCKeyboardDidDisconnect, object: nil, queue: .main) { [weak self] _ in self?.refreshAfterKeyboardDisconnect() },
          center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.attachKeyboard() },
          center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.suspendKeyboardCapture(); try? self?.setDiagnosticMode("off"); self?.cancelPairing() },
          center.addObserver(forName: UITextField.textDidBeginEditingNotification, object: nil, queue: .main) { [weak self] _ in self?.refreshKeyboardTextFocus() },
          center.addObserver(forName: UITextField.textDidEndEditingNotification, object: nil, queue: .main) { [weak self] _ in self?.refreshKeyboardTextFocus() },
          center.addObserver(forName: UITextView.textDidBeginEditingNotification, object: nil, queue: .main) { [weak self] _ in self?.refreshKeyboardTextFocus() },
          center.addObserver(forName: UITextView.textDidEndEditingNotification, object: nil, queue: .main) { [weak self] _ in self?.refreshKeyboardTextFocus() },
        ]
      }
      self.attachKeyboard(request)
    }
  }

  private func attachKeyboard(_ request: KeyboardCaptureRequest? = nil) {
    guard let request = request ?? keyboardCaptureLifetime.attach(), UIApplication.shared.applicationState == .active,
          keyboardCaptureLifetime.mayAttach(request.epoch) else { return }
    let next = GCKeyboard.coalesced
    let sameKeyboard = keyboard != nil && keyboard === next
    keyboard?.keyboardInput?.keyChangedHandler = nil
    if request.resetInput || !sameKeyboard { resetGenericPressed() }
    keyboard = next
    guard let sourceKeyboard = keyboard else { keyboardTextFocus.invalidate(); emitKeyboardHealth(); return }
    sourceKeyboard.handlerQueue = .main
    // iOS intentionally coalesces multiple keyboards. Flic identities remain per device.
    sourceKeyboard.keyboardInput?.keyChangedHandler = { [weak self, weak sourceKeyboard] _, _, code, pressed in
      guard let self, let sourceKeyboard, self.keyboard === sourceKeyboard,
            self.keyboardCaptureLifetime.isActive(request.epoch), UIApplication.shared.applicationState == .active else { return }
      // USB keyboard volume usages stay with the OS, including camera clickers.
      guard ![127, 128, 129].contains(Int(code.rawValue)) else { return }
      self.keyboardTextFocus.refresh()
      self.emitInput(adapterId: "generic-native", deviceId: "keyboard-coalesced", inputKey: "HID_KEY_\(code.rawValue)", phase: pressed ? "down" : "up", reportedRepeat: false, queued: false, ageMs: 0)
    }
    keyboardTextFocus.refresh()
    keyboardCaptureLifetime.didAttach(request.epoch)
    emitKeyboardHealth()
  }

  private func suspendKeyboardCapture() {
    let epoch = keyboardCaptureLifetime.suspend()
    keyboardTextFocus.invalidate()
    guard keyboardCaptureLifetime.isCurrent(epoch) else { return }
    keyboard?.keyboardInput?.keyChangedHandler = nil
    resetGenericPressed()
    emitKeyboardHealth()
  }

  private func refreshAfterKeyboardDisconnect() {
    let epoch = keyboardCaptureLifetime.suspend()
    keyboardTextFocus.invalidate()
    guard keyboardCaptureLifetime.isCurrent(epoch) else { return }
    keyboard?.keyboardInput?.keyChangedHandler = nil
    keyboard = nil
    resetGenericPressed()
    if keyboardListening, UIApplication.shared.applicationState == .active { attachKeyboard() } else { emitKeyboardHealth() }
  }

  private func resetGenericPressed() {
    inputLock.lock()
    defer { inputLock.unlock() }
    genericPressed = Set(genericPressed.filter { !$0.hasPrefix("generic-native:") })
    pressTimes = pressTimes.filter { !$0.key.hasPrefix("generic-native:") }
    keyboardTextGate.reset()
  }

  private func resetPressed() {
    inputLock.lock()
    defer { inputLock.unlock() }
    genericPressed.removeAll()
    pressTimes.removeAll()
    keyboardTextGate.reset()
  }

  private func stopKeyboardCapture() {
    let epoch = keyboardCaptureLifetime.stop()
    keyboardTextFocus.invalidate()
    DispatchQueue.main.async { [weak self] in
      guard let self, self.keyboardCaptureLifetime.isCurrent(epoch) else { return }
      self.keyboardTextFocus.invalidate()
      self.keyboard?.keyboardInput?.keyChangedHandler = nil
      self.keyboard = nil
      self.keyboardObservers.forEach { NotificationCenter.default.removeObserver($0) }
      self.keyboardObservers.removeAll()
      self.resetPressed()
    }
  }

  private func refreshKeyboardTextFocus() {
    guard keyboardCaptureLifetime.isAttached, UIApplication.shared.applicationState == .active else { keyboardTextFocus.invalidate(); return }
    keyboardTextFocus.refresh()
    // End-edit notification can precede final responder resignation. This
    // queues only an observation, never a key or semantic command.
    DispatchQueue.main.async { [weak self] in
      guard let self, self.keyboardCaptureLifetime.isAttached, UIApplication.shared.applicationState == .active else { return }
      self.keyboardTextFocus.refresh()
    }
  }

  private func setDiagnosticMode(_ mode: String) throws {
    guard ["off", "learn", "test"].contains(mode) else { throw NSError(domain: "ShowController", code: 4) }
    inputLock.lock(); defer { inputLock.unlock() }
    if mode == "off" { NativeRemoteCoordinator.endDiagnostics() } else { try NativeRemoteCoordinator.beginDiagnostics() }
    diagnosticMode = mode
    diagnosticSessionId = mode == "off" ? "" : UUID().uuidString
    genericPressed.removeAll()
    pressTimes.removeAll()
    sendEvent("onControllerHealth", ["diagnosticMode": mode, "diagnosticSessionId": diagnosticSessionId])
  }
  private func cancelPairing() {
    let pending = pairPromise; pairPromise = nil; pairToken = nil
    flic.cancelScan()
    if pending != nil {
      sendEvent("onControllerScan", ["state": "cancelled", "detail": "Pairing cancelled.", "initialPairingMayRequireInternet": true])
    }
    pending?.reject("E_CANCELLED", "Pairing cancelled.", nil)
  }
  private func emitKeyboardHealth() {
    sendEvent("onControllerHealth", ["genericKeyboardListening": keyboardCaptureLifetime.isAttached && UIApplication.shared.applicationState == .active, "genericKeyboardConnected": GCKeyboard.coalesced != nil, "genericKeyboardForegroundOnly": true, "genericKeyboardIdentity": "keyboard-coalesced"])
  }

  @discardableResult private func emitInput(
    adapterId: String,
    deviceId: String,
    inputKey: String,
    phase: String,
    reportedRepeat: Bool,
    queued: Bool,
    ageMs: Int
  ) -> Bool {
    let editing = adapterId == "generic-native" ? (!keyboardCaptureLifetime.isAttached || keyboardTextFocus.editing) : false
    inputLock.lock()
    defer { inputLock.unlock() }
    let key = "\(adapterId):\(deviceId):\(inputKey)"
    let diagnostic = NativeRemoteCoordinator.isDiagnostic
    let matchingBinding = bindings.first { candidate in
      candidate["inputKey"] as? String == inputKey && (candidate["adapterId"] == nil || candidate["adapterId"] as? String == adapterId) && (candidate["deviceId"] == nil || candidate["deviceId"] as? String == deviceId)
    }
    if adapterId == "generic-native" {
      let disposition = keyboardTextGate.route(identity: key, phase: phase, editing: editing, diagnostic: diagnostic, commandType: (matchingBinding?["command"] as? [String: Any])?["type"] as? String)
      if disposition != .controller {
        genericPressed.remove(key)
        pressTimes.removeValue(forKey: key)
        return disposition == .suppress
      }
    }
    inputSequence &+= 1
    let sequence = inputSequence
    let now = ProcessInfo.processInfo.systemUptime
    let bounce = !queued && phase == "down" && pressTimes[key].map { now - $0 < 0.08 } == true
    if !queued && phase == "down" { if pressTimes.count >= 256, let first = pressTimes.keys.first { pressTimes.removeValue(forKey: first) }; pressTimes[key] = now }
    let inferredRepeat: Bool
    if queued {
      inferredRepeat = false
    } else if phase == "down" {
      inferredRepeat = genericPressed.contains(key)
      genericPressed.insert(key)
    } else {
      inferredRepeat = false
      genericPressed.remove(key)
    }
    let binding = phase == "down" && !reportedRepeat && !inferredRepeat && !bounce && !queued ? matchingBinding : nil
    let defaults = ["MEDIA_NEXT": "GO", "MEDIA_PLAY_PAUSE": "PAUSE_RESUME", "MEDIA_PLAY": "RESUME", "MEDIA_PAUSE": "PAUSE", "MEDIA_PREVIOUS": "PREVIOUS", "MEDIA_STOP": "STOP_ALL"]
    if var command = binding?["command"] as? [String: Any], !diagnostic {
      command["eventId"] = "\(sourceSessionId):\(sequence)"
      if let epoch = NativeRemoteCoordinator.commandEpoch(command["type"] as? String ?? "") {
        command["controllerEpoch"] = epoch
        NotificationCenter.default.post(name: NSNotification.Name("ShowControlSemanticCommand"), object: nil, userInfo: command)
      }
    }
    sendEvent("onControllerInput", [
      "eventId": "\(sourceSessionId):\(sequence)",
      "sourceSessionId": sourceSessionId,
      "sequence": Double(sequence),
      "adapterId": adapterId,
      "deviceId": deviceId,
      "inputKey": inputKey,
      "phase": phase,
      "monotonicMs": ProcessInfo.processInfo.systemUptime * 1000,
      "isRepeat": reportedRepeat || inferredRepeat || bounce,
      "wasQueued": queued,
      "ageMs": ageMs,
      "deliveryEvidence": "app_received_only",
      "handledNatively": diagnostic || binding != nil || adapterId == "system-media",
      "diagnosticMode": diagnostic ? diagnosticMode : "off",
      "diagnosticSessionId": diagnostic ? diagnosticSessionId : "",
      "resolvedCommandType": (binding?["command"] as? [String: Any])?["type"] as? String ?? (adapterId == "system-media" ? defaults[inputKey] ?? "" : ""),
    ])
    return diagnostic || binding != nil || (phase == "down" && (reportedRepeat || inferredRepeat || bounce || queued))
  }
}
