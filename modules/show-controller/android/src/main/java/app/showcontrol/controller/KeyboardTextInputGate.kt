package app.showcontrol.controller

internal enum class KeyboardTextDisposition { CONTROLLER, TEXT, SUPPRESS }

/** Owned by the serialized input runtime. No text or persistent history. */
internal class KeyboardTextInputGate(private val capacity: Int = 256) {
  private val typedDown = mutableSetOf<String>()
  private var overflow = false
  init { require(capacity > 0) }

  fun route(identity: String, phase: String, editing: Boolean, diagnostic: Boolean, commandType: String?): KeyboardTextDisposition {
    val held = if (phase == "up") typedDown.remove(identity) else identity in typedDown
    // Safety remains available, with ordinary native repeat/bounce admission.
    if (commandType == "PANIC_FADE" || commandType == "STOP_ALL") return KeyboardTextDisposition.CONTROLLER
    if (held || overflow) return if (editing) KeyboardTextDisposition.TEXT else KeyboardTextDisposition.SUPPRESS
    if (editing && !diagnostic) {
      if (phase == "down") {
        if (typedDown.size >= capacity) overflow = true else typedDown.add(identity)
      }
      return KeyboardTextDisposition.TEXT
    }
    return KeyboardTextDisposition.CONTROLLER
  }

  /** Overflow stays conservative until explicit lifecycle/disconnect reset. */
  fun reset() { typedDown.clear(); overflow = false }
}
