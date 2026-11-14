import Foundation

/** Run with the pure production gate on a Swift host; UIKit/device gates remain separate. */
@main struct KeyboardTextInputGateRegression {
  static func main() {
    let ordinary: [String?] = [nil, "GO", "PAUSE", "RESUME", "PAUSE_RESUME", "PREVIOUS", "PLAY_CUE", "TRIGGER_HIT", "SEEK", "REPLAY", "SELECT_CUE"]
    var cases = 0
    for type in ordinary + ["PANIC_FADE", "STOP_ALL"] {
      for editing in [false, true] { for diagnostic in [false, true] { for phase in ["down", "up"] {
        var gate = KeyboardTextInputGate()
        let expected: KeyboardTextDisposition = editing && !diagnostic && type != "PANIC_FADE" && type != "STOP_ALL" ? .text : .controller
        precondition(gate.route(identity: "one:space", phase: phase, editing: editing, diagnostic: diagnostic, commandType: type) == expected)
        cases += 1
      } } }
    }
    for type in ordinary { for diagnostic in [false, true] {
      var gate = KeyboardTextInputGate()
      precondition(gate.route(identity: "one:space", phase: "down", editing: true, diagnostic: false, commandType: type) == .text)
      for _ in 0..<20 { precondition(gate.route(identity: "one:space", phase: "down", editing: false, diagnostic: diagnostic, commandType: type) == .suppress) }
      precondition(gate.route(identity: "two:space", phase: "down", editing: false, diagnostic: diagnostic, commandType: type) == .controller)
      precondition(gate.route(identity: "one:space", phase: "up", editing: false, diagnostic: diagnostic, commandType: type) == .suppress)
      precondition(gate.route(identity: "one:space", phase: "down", editing: false, diagnostic: diagnostic, commandType: type) == .controller)
      cases += 1
    } }
    for safety in ["PANIC_FADE", "STOP_ALL"] {
      var gate = KeyboardTextInputGate()
      _ = gate.route(identity: "one:space", phase: "down", editing: true, diagnostic: false, commandType: "GO")
      precondition(gate.route(identity: "one:space", phase: "down", editing: true, diagnostic: false, commandType: safety) == .controller)
      precondition(gate.route(identity: "one:space", phase: "up", editing: true, diagnostic: false, commandType: safety) == .controller)
      precondition(gate.route(identity: "one:space", phase: "down", editing: false, diagnostic: false, commandType: "GO") == .controller)
      cases += 1
    }
    var gate = KeyboardTextInputGate(capacity: 2)
    for id in ["one:a", "one:b", "one:c"] { precondition(gate.route(identity: id, phase: "down", editing: true, diagnostic: false, commandType: "GO") == .text) }
    precondition(gate.route(identity: "two:fresh", phase: "down", editing: false, diagnostic: false, commandType: "GO") == .suppress)
    precondition(gate.route(identity: "one:stop", phase: "down", editing: false, diagnostic: false, commandType: "STOP_ALL") == .controller)
    gate.reset()
    precondition(gate.route(identity: "two:fresh", phase: "down", editing: false, diagnostic: false, commandType: "GO") == .controller)
    print("Keyboard text policy: \(cases) fresh/held/safety scenarios and bounded overflow/reset passed")
  }
}
