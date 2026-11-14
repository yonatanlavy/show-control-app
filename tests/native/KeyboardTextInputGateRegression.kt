package app.showcontrol.controller

fun main() {
  var cases = 0
  val ordinary = listOf(null, "GO", "PAUSE", "RESUME", "PAUSE_RESUME", "PREVIOUS", "PLAY_CUE", "TRIGGER_HIT", "SEEK", "REPLAY", "SELECT_CUE")
  for (type in ordinary + listOf("PANIC_FADE", "STOP_ALL")) for (editing in listOf(false, true)) for (diagnostic in listOf(false, true)) for (phase in listOf("down", "up")) {
    val gate = KeyboardTextInputGate()
    val expected = if (editing && !diagnostic && type !in listOf("PANIC_FADE", "STOP_ALL")) KeyboardTextDisposition.TEXT else KeyboardTextDisposition.CONTROLLER
    check(gate.route("one:space", phase, editing, diagnostic, type) == expected) { "Fresh policy failed: $type/$editing/$diagnostic/$phase" }
    cases++
  }
  for (type in ordinary) for (diagnosticAfterBlur in listOf(false, true)) {
    val gate = KeyboardTextInputGate()
    check(gate.route("one:space", "down", true, false, type) == KeyboardTextDisposition.TEXT)
    repeat(20) { check(gate.route("one:space", "down", false, diagnosticAfterBlur, type) == KeyboardTextDisposition.SUPPRESS) }
    check(gate.route("two:space", "down", false, diagnosticAfterBlur, type) == KeyboardTextDisposition.CONTROLLER)
    check(gate.route("one:space", "up", false, diagnosticAfterBlur, type) == KeyboardTextDisposition.SUPPRESS)
    check(gate.route("one:space", "down", false, diagnosticAfterBlur, type) == KeyboardTextDisposition.CONTROLLER)
    cases++
  }
  for (safety in listOf("PANIC_FADE", "STOP_ALL")) {
    val gate = KeyboardTextInputGate()
    gate.route("one:space", "down", true, false, "GO")
    check(gate.route("one:space", "down", true, false, safety) == KeyboardTextDisposition.CONTROLLER)
    check(gate.route("one:space", "up", true, false, safety) == KeyboardTextDisposition.CONTROLLER)
    check(gate.route("one:space", "down", false, false, "GO") == KeyboardTextDisposition.CONTROLLER)
    cases++
  }
  val gate = KeyboardTextInputGate(capacity = 2)
  for (id in listOf("one:a", "one:b", "one:c")) check(gate.route(id, "down", true, false, "GO") == KeyboardTextDisposition.TEXT)
  for (id in listOf("one:a", "one:b", "one:c", "two:d")) {
    check(gate.route(id, "down", false, false, "GO") == KeyboardTextDisposition.SUPPRESS)
    check(gate.route(id, "up", false, false, "GO") == KeyboardTextDisposition.SUPPRESS)
  }
  check(gate.route("one:panic", "down", false, false, "PANIC_FADE") == KeyboardTextDisposition.CONTROLLER)
  check(gate.route("one:stop", "down", false, false, "STOP_ALL") == KeyboardTextDisposition.CONTROLLER)
  check(gate.route("two:fresh", "down", false, true, "GO") == KeyboardTextDisposition.SUPPRESS)
  gate.reset()
  check(gate.route("two:fresh", "down", false, false, "GO") == KeyboardTextDisposition.CONTROLLER)
  gate.route("one:space", "down", true, false, "GO")
  check(gate.route("one:space", "up", true, false, "GO") == KeyboardTextDisposition.TEXT)
  check(gate.route("one:space", "down", false, false, "GO") == KeyboardTextDisposition.CONTROLLER)
  println("Keyboard text policy: $cases fresh/held/safety scenarios plus bounded overflow, release and reset passed")
}
