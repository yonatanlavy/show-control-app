// Foundation-only regression. Compile with the production helper, for example:
// swiftc AudioSessionInterruptionGate.swift AudioSessionInterruptionGateRegression.swift -o session-gate-regression
// This does not replace signed iOS call/alarm/route/device tests.
import Foundation
import Dispatch

@main
enum AudioSessionInterruptionGateRegression {
  static func check(_ value: @autoclosure () -> Bool, _ message: String) {
    precondition(value(), message)
  }

  static func main() {
    let gate = AudioSessionInterruptionGate()
    check(!gate.permitsPlayback, "A new process must start blocked")
    let first = gate.beginPreparation()
    var output = 0
    check(gate.withPlaybackPermission(epoch: first) { output = 1 }, "Deliberate preparation must be permitted")
    check(output == 1, "Prepared output did not open")
    check(gate.interrupt(first) { output = 0 }, "Current interruption must be admitted")
    check(output == 0 && !gate.permitsPlayback, "Interruption must mute and latch")
    check(!gate.withPlaybackPermission { output = 1 }, "Resume or a late watchdog must not reopen interrupted output")
    check(output == 0, "Blocked unmute executed")
    check(gate.isCurrent(first) && !gate.permitsPlayback, "Observing the ended epoch must not release the latch")

    let replacement = gate.beginPreparation()
    check(replacement != first, "A replacement must invalidate queued observer cleanup")
    check(gate.withPlaybackPermission(epoch: replacement) { output = 1 }, "Fresh preparation must reopen deliberately")
    check(!gate.interrupt(first) { output = 0 }, "Old began notification must not mute a replacement")
    check(output == 1 && !gate.isCurrent(first), "Stale callback affected the replacement")
    check(!gate.withPlaybackPermission(epoch: first) { output = 0 }, "An old prepare completion must not mutate output")
    gate.invalidate()
    check(!gate.permitsPlayback && !gate.isCurrent(replacement), "Shutdown or failed preparation must invalidate and latch")

    let concurrent = AudioSessionInterruptionGate()
    let token = concurrent.beginPreparation()
    let opening = DispatchSemaphore(value: 0)
    let releaseOpening = DispatchSemaphore(value: 0)
    let notified = DispatchSemaphore(value: 0)
    let finished = DispatchGroup()
    var concurrentOutput = 0
    finished.enter()
    DispatchQueue.global().async {
      concurrent.withPlaybackPermission(epoch: token) {
        opening.signal()
        check(releaseOpening.wait(timeout: .now() + 2) == .success, "Test unmute release timed out")
        concurrentOutput = 1
      }
      finished.leave()
    }
    check(opening.wait(timeout: .now() + 2) == .success, "Test unmute never entered")
    finished.enter()
    DispatchQueue.global().async {
      notified.signal()
      concurrent.interrupt(token) { concurrentOutput = 0 }
      finished.leave()
    }
    check(notified.wait(timeout: .now() + 2) == .success, "Test interruption never entered")
    releaseOpening.signal()
    check(finished.wait(timeout: .now() + 2) == .success, "Serialized notification/unmute deadlocked")
    check(concurrentOutput == 0 && !concurrent.permitsPlayback, "An in-flight unmute reopened audio after interruption")
    print("AudioSessionInterruptionGate regression passed")
  }
}
