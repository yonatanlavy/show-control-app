import Foundation

/// Bridges OS notification threads and the serialized audio owner. An ended
/// notification never opens this gate; only a new, deliberate preparation can.
final class AudioSessionInterruptionGate {
  private let lock = NSRecursiveLock()
  private var epoch: UInt64 = 0
  private var recoveryRequired = true

  func beginPreparation() -> UInt64 {
    lock.lock(); defer { lock.unlock() }
    epoch &+= 1
    recoveryRequired = false
    return epoch
  }

  func invalidate() {
    lock.lock(); defer { lock.unlock() }
    epoch &+= 1
    recoveryRequired = true
  }

  func isCurrent(_ captured: UInt64) -> Bool {
    lock.lock(); defer { lock.unlock() }
    return captured == epoch
  }

  var permitsPlayback: Bool {
    lock.lock(); defer { lock.unlock() }
    return !recoveryRequired
  }

  /// The current observer closes the final output gate before it returns.
  /// Older observers cannot mute or otherwise affect a replacement session.
  @discardableResult
  func interrupt(_ captured: UInt64, mute: () -> Void) -> Bool {
    lock.lock(); defer { lock.unlock() }
    guard captured == epoch else { return false }
    recoveryRequired = true
    mute()
    return true
  }

  /// Serialize unmuting with interruption admission, rather than checking a
  /// Boolean and reopening output after a concurrent notification muted it.
  @discardableResult
  func withPlaybackPermission(epoch captured: UInt64? = nil, _ work: () -> Void) -> Bool {
    lock.lock(); defer { lock.unlock() }
    guard !recoveryRequired, captured == nil || captured == epoch else { return false }
    work()
    return true
  }
}
