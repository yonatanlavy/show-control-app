import Foundation

enum KeyboardTextDisposition: Equatable { case controller, text, suppress }

/** Owned under the controller input lock; contains no text or persistent history. */
struct KeyboardTextInputGate {
  private var typedDown = Set<String>()
  private var overflow = false
  private let capacity: Int
  init(capacity: Int = 256) { precondition(capacity > 0); self.capacity = capacity }

  mutating func route(identity: String, phase: String, editing: Bool, diagnostic: Bool, commandType: String?) -> KeyboardTextDisposition {
    let held = phase == "up" ? typedDown.remove(identity) != nil : typedDown.contains(identity)
    if commandType == "PANIC_FADE" || commandType == "STOP_ALL" { return .controller }
    if held || overflow { return editing ? .text : .suppress }
    if editing && !diagnostic {
      if phase == "down" {
        if typedDown.count >= capacity { overflow = true } else { typedDown.insert(identity) }
      }
      return .text
    }
    return .controller
  }

  mutating func reset() { typedDown.removeAll(); overflow = false }
}
