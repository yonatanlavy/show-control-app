package app.showcontrol.controller
import app.showcontrol.audio.NativeRemoteCoordinator
/** Test boundary only; production Window callback is compiled unchanged. */
internal object ShowControllerRuntime {
  val received = mutableListOf<String>()
  val mappings = mutableMapOf<String, String>("KEYCODE_SPACE" to "GO", "KEYCODE_ENTER" to "PANIC_FADE")
  private val gate = KeyboardTextInputGate()
  fun hasGenericBinding(deviceId: String, key: String) = mappings.containsKey(key)
  fun forwardGenericInput(deviceId: String, key: String, phase: String, repeat: Boolean, editing: Boolean): Boolean {
    val disposition = gate.route("$deviceId:$key", phase, editing, NativeRemoteCoordinator.isDiagnostic(), mappings[key])
    if (disposition != KeyboardTextDisposition.CONTROLLER) return disposition == KeyboardTextDisposition.SUPPRESS
    received.add("$key:$phase")
    return hasGenericBinding(deviceId, key) || NativeRemoteCoordinator.isDiagnostic()
  }
  fun forwardMediaInput(key: String, deviceId: String) { received.add("$key:media") }
  fun resetGenericPressed() { received.clear(); gate.reset() }
  fun notifyGenericCaptureChanged() = Unit
}
