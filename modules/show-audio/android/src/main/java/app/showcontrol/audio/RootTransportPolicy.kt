package app.showcontrol.audio

/** The ordered root owns GO; a group child deliberately never owns its cursor. */
internal enum class RootGoAction { RESUME, IGNORE, ADVANCE_ROOT, ADVANCE_AUDIO, START }

internal fun rootGoAction(paused: Boolean, transitioning: Boolean, rootStarted: Boolean, primaryAudioActive: Boolean): RootGoAction = when {
  paused -> RootGoAction.RESUME
  transitioning -> RootGoAction.IGNORE
  rootStarted -> RootGoAction.ADVANCE_ROOT
  primaryAudioActive -> RootGoAction.ADVANCE_AUDIO
  else -> RootGoAction.START
}

/** Counts refer to this root epoch only, never to independent Hit activity. */
internal fun rootCanComplete(
  started: Boolean,
  launching: Boolean,
  transitioning: Boolean,
  voices: Int,
  pendingActions: Int,
  heldForRetry: Boolean,
): Boolean = started && !launching && !transitioning && !heldForRetry && voices == 0 && pendingActions == 0

/** Incoming non-overlapping playback can reuse outgoing main slots. Hits cannot. */
internal fun rootFutureCapacity(independentVoices: Int, independentReservations: Int, incomingVoices: Int, newHitVoices: Int = 0): Boolean =
  listOf(independentVoices, independentReservations, incomingVoices, newHitVoices).all { it in 0..8 } &&
    independentVoices + independentReservations + incomingVoices + newHitVoices <= 8

internal enum class RootAdmissionPhase { PREPARING, READY, FADING, COMMITTED, REFUSED, CANCELLED }

internal fun rootExitReady(delayElapsed: Boolean, overlapping: Boolean, outgoingVoices: Int): Boolean =
  outgoingVoices >= 0 && delayElapsed && (overlapping || outgoingVoices == 0)

/** Pure command-queue policy. The engine owns and releases the actual resources. */
internal class RootAdmissionGate(
  val generation: Long,
  val rootEpoch: Long,
  val targetIndex: Int,
  preparedKeys: Set<String>,
) {
  private val expected = preparedKeys.toSet()
  private val ready = mutableSetOf<String>()
  var phase = if (expected.isEmpty()) RootAdmissionPhase.READY else RootAdmissionPhase.PREPARING
    private set

  init {
    require(generation >= 0 && rootEpoch >= 0 && targetIndex >= 0)
    require(expected.size <= 8 && expected.none(String::isEmpty))
  }

  fun isCurrent(generation: Long, rootEpoch: Long): Boolean = this.generation == generation && this.rootEpoch == rootEpoch

  fun markReady(key: String, generation: Long, rootEpoch: Long): Boolean {
    if (!isCurrent(generation, rootEpoch) || phase != RootAdmissionPhase.PREPARING || key !in expected || !ready.add(key)) return false
    if (ready == expected) phase = RootAdmissionPhase.READY
    return true
  }

  fun beginFade(generation: Long, rootEpoch: Long, paused: Boolean): Boolean {
    if (!isCurrent(generation, rootEpoch) || paused || phase != RootAdmissionPhase.READY) return false
    phase = RootAdmissionPhase.FADING
    return true
  }

  fun commit(generation: Long, rootEpoch: Long, paused: Boolean): Boolean {
    if (!isCurrent(generation, rootEpoch) || paused || phase != RootAdmissionPhase.FADING) return false
    phase = RootAdmissionPhase.COMMITTED
    return true
  }

  /** After admission/fading begins, a playback failure requires ordinary recovery. */
  fun refuse(generation: Long, rootEpoch: Long): Boolean {
    if (!isCurrent(generation, rootEpoch) || phase !in setOf(RootAdmissionPhase.PREPARING, RootAdmissionPhase.READY)) return false
    phase = RootAdmissionPhase.REFUSED
    return true
  }

  fun cancel(): Boolean {
    if (phase in setOf(RootAdmissionPhase.COMMITTED, RootAdmissionPhase.REFUSED, RootAdmissionPhase.CANCELLED)) return false
    phase = RootAdmissionPhase.CANCELLED
    return true
  }
}
