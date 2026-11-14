package app.showcontrol.audio

fun main() {
  val normal = SystemAudioObservation(1, false) // INTERRUPTION_FILTER_ALL
  val priorityWithMedia = SystemAudioObservation(2, false)
  val alarmsWithMedia = SystemAudioObservation(4, false)
  val unavailable = SystemAudioObservation(null, null)
  check(!isSystemMediaSuppressed(normal))
  check(!isSystemMediaSuppressed(priorityWithMedia))
  check(!isSystemMediaSuppressed(alarmsWithMedia))
  check(!isSystemMediaSuppressed(unavailable)) { "An unavailable query must remain unknown rather than claim mute" }
  check(isSystemMediaSuppressed(SystemAudioObservation(3, null))) { "Total-silence DND is a known MEDIA suppression even if the mute query is unavailable" }
  check(isSystemMediaSuppressed(SystemAudioObservation(null, true)))
  check(isSystemMediaSuppressed(SystemAudioObservation(1, true))) { "Explicit MEDIA mute matters even with DND off" }
  for (mode in listOf(1, 2, 4)) {
    val call = SystemAudioObservation(1, false, mode)
    check(isPhoneCallAudioMode(mode))
    check(systemAudioSuppressionReason(call) == "phone_call") { "Fresh preparation must refuse ringing/active/screened calls" }
    val calls = SystemAudioPolicyMonitor()
    val callGate = AudioInterruptionGate()
    calls.reset(normal)
    check(calls.observe(call) == "phone_call")
    callGate.interrupt()
    check(calls.observe(SystemAudioObservation(1, false, 0)) == null)
    check(callGate.isBlocked) { "Ending a call must not resume the show" }
    check(calls.observe(call) == null) { "Only one interruption is emitted for this preparation" }
    calls.reset(SystemAudioObservation(1, false, 0))
    check(callGate.isBlocked) { "A fresh observation does not clear the recovery latch" }
    check(callGate.recover(callGate.epoch, true))
  }
  check(systemAudioSuppressionReason(SystemAudioObservation(1, false, 3)) == null) { "MODE_IN_COMMUNICATION may be owned by voice input and is not proof of a phone call" }
  check(systemAudioSuppressionReason(SystemAudioObservation(1, false, 0)) == null)
  check(systemAudioSuppressionReason(SystemAudioObservation(null, null, null)) == null)
  val nativeCallCallback = SystemAudioPolicyMonitor()
  nativeCallCallback.reset(normal)
  nativeCallCallback.markInterrupted()
  check(nativeCallCallback.observe(SystemAudioObservation(1, false, 1)) == null) { "The bounded fallback must not repeat an already handled native call callback" }

  val monitor = SystemAudioPolicyMonitor()
  monitor.reset(normal)
  repeat(3) { check(monitor.observe(normal) == null) }
  check(monitor.observe(unavailable) == null)
  check(monitor.observe(priorityWithMedia) == "dnd_filter_changed") { "Unknown reads must not erase the last observed filter" }
  repeat(3) { check(monitor.observe(SystemAudioObservation(2, true)) == null) }
  check(monitor.observe(normal) == null) { "Disabling DND must not create automatic recovery or repeated interruption events" }

  monitor.reset(priorityWithMedia)
  check(monitor.observe(SystemAudioObservation(2, true)) == "system_media_muted") { "A policy change within PRIORITY must catch its observed MEDIA mute" }
  check(monitor.observe(priorityWithMedia) == null)
  monitor.reset(normal)
  check(monitor.observe(SystemAudioObservation(1, true)) == "system_media_muted")
  monitor.reset(unavailable)
  check(monitor.observe(unavailable) == null)
  check(monitor.observe(normal) == null) { "First known status after an unavailable query is a baseline, not a proven filter change" }
  check(monitor.observe(alarmsWithMedia) == "dnd_filter_changed")

  // Ringer silent/vibrate has no input into this policy. A device still
  // reporting MEDIA unmuted and the same DND filter remains admissible.
  monitor.reset(normal)
  repeat(3) { check(monitor.observe(normal) == null && !isSystemMediaSuppressed(normal)) }

  val gate = AudioInterruptionGate()
  monitor.reset(priorityWithMedia)
  if (monitor.observe(SystemAudioObservation(2, true)) != null) gate.interrupt()
  check(gate.isBlocked)
  check(monitor.observe(normal) == null && gate.isBlocked)
  check(gate.onFocusSignal(AudioFocusSignal.GAIN) == null && gate.isBlocked)
  monitor.reset(normal)
  check(gate.isBlocked) { "Fresh system observations alone cannot clear the audio latch" }
  check(!gate.recover(gate.epoch, focusGranted = false) && gate.isBlocked)
  check(gate.recover(gate.epoch, focusGranted = true) && !gate.isBlocked)
  println("PASS system MEDIA policy: DND transitions, same-filter media mute, unchanged/unknown reads, no ringer inference and no DND-off auto-resume")
}
