package app.showcontrol.audio

/** Public media state is a projection, never the silent renderer's timeline. */
internal enum class SystemMediaPhase { CLOSED, READY, WAITING, PLAYING, PAUSED, RECOVERY }

internal data class SystemMediaClip(
  val identity: String,
  val positionMs: Long,
  val durationMs: Long,
  val rate: Float = 1f,
  val loop: Boolean = false,
) {
  fun isValid(): Boolean = identity.isNotEmpty() && durationMs in 1..Long.MAX_VALUE / 1000 &&
    positionMs in 0..durationMs && rate.isFinite() && rate in 0.7f..2f
}

internal data class SystemMediaObservation(
  val prepared: Boolean = false,
  val preview: Boolean = false,
  val closing: Boolean = false,
  val diagnostic: Boolean = false,
  val recovery: Boolean = false,
  val paused: Boolean = false,
  val audible: Boolean = false,
  val workPending: Boolean = false,
  val voices: Int = 0,
  val goAvailable: Boolean = false,
  val mainClip: SystemMediaClip? = null,
  val readyClip: SystemMediaClip? = null,
)

internal data class SystemMediaView(
  val phase: SystemMediaPhase,
  val retainForeground: Boolean,
  val canNavigate: Boolean,
  val canPauseResume: Boolean,
  val canStop: Boolean,
  val canGo: Boolean,
  val clip: SystemMediaClip?,
) {
  val visible: Boolean get() = phase != SystemMediaPhase.CLOSED
  val playWhenReady: Boolean get() = phase == SystemMediaPhase.PLAYING || phase == SystemMediaPhase.WAITING
}

internal fun systemMediaView(observation: SystemMediaObservation): SystemMediaView {
  val retained = observation.prepared && !observation.preview && !observation.closing
  val diagnostic = observation.diagnostic && !observation.prepared && !observation.closing && !observation.preview
  val work = observation.voices > 0 || observation.workPending
  val phase = when {
    !retained && !diagnostic -> SystemMediaPhase.CLOSED
    observation.recovery -> SystemMediaPhase.RECOVERY
    observation.paused && work -> SystemMediaPhase.PAUSED
    observation.audible && observation.voices > 0 -> SystemMediaPhase.PLAYING
    work -> SystemMediaPhase.WAITING
    else -> SystemMediaPhase.READY
  }
  val clip = when (phase) {
    SystemMediaPhase.CLOSED, SystemMediaPhase.RECOVERY -> null
    SystemMediaPhase.READY -> observation.readyClip?.takeIf { it.isValid() }?.copy(positionMs = 0)
    else -> observation.mainClip?.takeIf { it.isValid() }
  }
  val controls = (retained || diagnostic) && phase != SystemMediaPhase.RECOVERY
  return SystemMediaView(phase, retained, controls, controls && (work || diagnostic), retained || diagnostic,
    controls && (observation.goAvailable || diagnostic), clip)
}

/** A notification from an old owner/prepare/stop epoch cannot operate a new run. */
internal fun admitsNotificationAction(ownerMatches: Boolean, epochCurrent: Boolean, closing: Boolean): Boolean =
  ownerMatches && epochCurrent && !closing

/** Android may hide inactive media cards even when their notification/FGS lives. */
internal fun systemMediaUsesPlaybackCard(view: SystemMediaView): Boolean = view.phase == SystemMediaPhase.PLAYING
