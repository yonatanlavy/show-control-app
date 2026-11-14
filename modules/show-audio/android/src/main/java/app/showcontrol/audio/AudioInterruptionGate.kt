package app.showcontrol.audio

import java.util.concurrent.atomic.AtomicReference

internal enum class AudioFocusSignal { GAIN, LOSS, TRANSIENT_LOSS, DUCK_LOSS }

/** Shared by command admission and every PCM voice, including voices still
 * being constructed when focus is lost. The render path only reads an atomic
 * snapshot. A later focus gain never grants permission to resume playback.
 */
internal class AudioInterruptionGate {
  private data class State(val epoch: Long, val blocked: Boolean)
  private val state = AtomicReference(State(0, false))
  private val controlLock = Any()

  val epoch: Long get() = state.get().epoch
  val isBlocked: Boolean get() = state.get().blocked

  fun onFocusSignal(signal: AudioFocusSignal): Long? =
    if (signal == AudioFocusSignal.GAIN) null else interrupt()

  fun interrupt(): Long = synchronized(controlLock) {
    val next = State(state.get().epoch + 1, true)
    state.set(next)
    next.epoch
  }

  fun isCurrentInterruption(capturedEpoch: Long): Boolean {
    val current = state.get()
    return current.epoch == capturedEpoch && current.blocked
  }

  /** Only short control bookkeeping runs under this lock. PCM render reads
   * remain atomic and never wait for callbacks or recovery.
   */
  fun whileCurrentInterruption(capturedEpoch: Long, action: () -> Unit): Boolean = synchronized(controlLock) {
    if (!isCurrentInterruption(capturedEpoch)) return@synchronized false
    action()
    true
  }

  fun admits(capturedEpoch: Long, explicitRecovery: Boolean = false): Boolean {
    val current = state.get()
    return current.epoch == capturedEpoch && (!current.blocked || explicitRecovery)
  }

  /** Called only at the commit of an explicit prepare/audition. A focus
   * request that raced a newer loss cannot unmute either old or new voices.
   */
  fun recover(capturedEpoch: Long, focusGranted: Boolean): Boolean = synchronized(controlLock) {
    if (!focusGranted) return@synchronized false
    val previous = state.get()
    if (previous.epoch != capturedEpoch) return@synchronized false
    state.set(State(previous.epoch, false))
    true
  }
}
