import Foundation

struct KeyboardCaptureRequest { let epoch: UInt64; let resetInput: Bool }

/** State-only lock; never hold it across UIKit, callbacks or controller calls. */
final class KeyboardCaptureLifetime {
  private let lock = NSLock()
  private var epoch: UInt64 = 0
  private var requested = false
  private var installed: UInt64?
  private var resetPending = true
  private func request() -> KeyboardCaptureRequest { epoch &+= 1; installed = nil; return KeyboardCaptureRequest(epoch: epoch, resetInput: resetPending) }
  func start() -> KeyboardCaptureRequest { lock.lock(); defer { lock.unlock() }; requested = true; return request() }
  func attach() -> KeyboardCaptureRequest? { lock.lock(); defer { lock.unlock() }; return requested ? request() : nil }
  func stop() -> UInt64 { lock.lock(); defer { lock.unlock() }; requested = false; resetPending = true; installed = nil; epoch &+= 1; return epoch }
  func suspend() -> UInt64 { lock.lock(); defer { lock.unlock() }; resetPending = true; installed = nil; epoch &+= 1; return epoch }
  var isRequested: Bool { lock.lock(); defer { lock.unlock() }; return requested }
  func isCurrent(_ value: UInt64) -> Bool { lock.lock(); defer { lock.unlock() }; return value == epoch }
  func mayAttach(_ value: UInt64) -> Bool { lock.lock(); defer { lock.unlock() }; return requested && value == epoch }
  func isActive(_ value: UInt64) -> Bool { lock.lock(); defer { lock.unlock() }; return requested && value == epoch && installed == value }
  var isAttached: Bool { lock.lock(); defer { lock.unlock() }; return requested && installed == epoch }
  func didAttach(_ value: UInt64) { lock.lock(); defer { lock.unlock() }; if requested && value == epoch { installed = value; resetPending = false } }
}
