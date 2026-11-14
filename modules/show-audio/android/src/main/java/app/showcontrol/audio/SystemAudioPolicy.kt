package app.showcontrol.audio

/** Null means the public system query was unavailable. Ringer mode is
 * deliberately absent: silent/vibrate does not imply MEDIA is muted.
 */
internal data class SystemAudioObservation(val interruptionFilter: Int?, val mediaMuted: Boolean?, val callMode: Int? = null)

internal fun isPhoneCallAudioMode(mode: Int?): Boolean =
  mode == 1 || mode == 2 || mode == 4 // RINGTONE, IN_CALL, CALL_SCREENING; not IN_COMMUNICATION

internal fun isSystemMediaSuppressed(observation: SystemAudioObservation): Boolean =
  observation.mediaMuted == true || observation.interruptionFilter == 3 // INTERRUPTION_FILTER_NONE

internal fun systemAudioSuppressionReason(observation: SystemAudioObservation): String? = when {
  isPhoneCallAudioMode(observation.callMode) -> "phone_call"
  isSystemMediaSuppressed(observation) -> "system_media_muted"
  else -> null
}

/** Command-thread-owned observations. A single change invalidates this
 * preparation; unknown reads neither certify sound nor erase a known filter.
 */
internal class SystemAudioPolicyMonitor {
  private var lastKnownFilter: Int? = null
  private var interrupted = false

  fun reset(observation: SystemAudioObservation) {
    lastKnownFilter = observation.interruptionFilter
    interrupted = false
  }

  fun markInterrupted() { interrupted = true }

  fun observe(observation: SystemAudioObservation): String? {
    val filter = observation.interruptionFilter
    val changed = filter != null && lastKnownFilter != null && filter != lastKnownFilter
    if (filter != null) lastKnownFilter = filter
    if (interrupted) return null
    val reason = when {
      systemAudioSuppressionReason(observation) != null -> systemAudioSuppressionReason(observation)
      changed -> "dnd_filter_changed"
      else -> null
    }
    if (reason != null) interrupted = true
    return reason
  }
}
