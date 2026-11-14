// Pure command-queue policy; the native engine owns the actual audio resources.
enum RootGoAction: Equatable { case resume, ignore, advanceRoot, advanceAudio, start }

func rootGoAction(paused: Bool, transitioning: Bool, rootStarted: Bool, primaryAudioActive: Bool) -> RootGoAction {
  if paused { return .resume }
  if transitioning { return .ignore }
  if rootStarted { return .advanceRoot }
  if primaryAudioActive { return .advanceAudio }
  return .start
}

func rootCanComplete(started: Bool, launching: Bool, transitioning: Bool, voices: Int, pendingActions: Int, heldForRetry: Bool) -> Bool {
  started && !launching && !transitioning && !heldForRetry && voices == 0 && pendingActions == 0
}

func rootFutureCapacity(independentVoices: Int, independentReservations: Int, incomingVoices: Int, newHitVoices: Int = 0) -> Bool {
  let counts = [independentVoices, independentReservations, incomingVoices, newHitVoices]
  return counts.allSatisfy { (0...8).contains($0) } && counts.reduce(0, +) <= 8
}

enum RootAdmissionPhase: Equatable { case preparing, ready, fading, committed, refused, cancelled }

func rootExitReady(delayElapsed: Bool, overlapping: Bool, outgoingVoices: Int) -> Bool {
  outgoingVoices >= 0 && delayElapsed && (overlapping || outgoingVoices == 0)
}

final class RootAdmissionGate {
  let generation: Int
  let rootEpoch: Int
  let targetIndex: Int
  private let expected: Set<String>
  private var ready: Set<String> = []
  private(set) var phase: RootAdmissionPhase

  init(generation: Int, rootEpoch: Int, targetIndex: Int, preparedKeys: Set<String>) {
    precondition(generation >= 0 && rootEpoch >= 0 && targetIndex >= 0)
    precondition(preparedKeys.count <= 8 && preparedKeys.allSatisfy { !$0.isEmpty })
    self.generation = generation; self.rootEpoch = rootEpoch; self.targetIndex = targetIndex
    expected = preparedKeys; phase = preparedKeys.isEmpty ? .ready : .preparing
  }

  func isCurrent(generation: Int, rootEpoch: Int) -> Bool { self.generation == generation && self.rootEpoch == rootEpoch }

  @discardableResult
  func markReady(_ key: String, generation: Int, rootEpoch: Int) -> Bool {
    guard isCurrent(generation: generation, rootEpoch: rootEpoch), phase == .preparing,
          expected.contains(key), ready.insert(key).inserted else { return false }
    if ready == expected { phase = .ready }
    return true
  }

  func beginFade(generation: Int, rootEpoch: Int, paused: Bool) -> Bool {
    guard isCurrent(generation: generation, rootEpoch: rootEpoch), !paused, phase == .ready else { return false }
    phase = .fading; return true
  }

  func commit(generation: Int, rootEpoch: Int, paused: Bool) -> Bool {
    guard isCurrent(generation: generation, rootEpoch: rootEpoch), !paused, phase == .fading else { return false }
    phase = .committed; return true
  }

  func refuse(generation: Int, rootEpoch: Int) -> Bool {
    guard isCurrent(generation: generation, rootEpoch: rootEpoch), phase == .preparing || phase == .ready else { return false }
    phase = .refused; return true
  }

  @discardableResult
  func cancel() -> Bool {
    guard phase != .committed, phase != .refused, phase != .cancelled else { return false }
    phase = .cancelled; return true
  }
}
