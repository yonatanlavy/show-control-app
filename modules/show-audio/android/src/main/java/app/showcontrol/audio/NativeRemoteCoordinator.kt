package app.showcontrol.audio

/** Process-local input admission shared by the audio owner and controller adapters. */
object NativeRemoteCoordinator {
  private val lock = Any()
  private var armed = false
  private var epoch = 0L
  private var idleGeneration = 0L
  private var preparationSequence = 0L
  private val preparing = mutableSetOf<Long>()
  private var diagnostics = false
  private var mediaHandler: ((String, String) -> Boolean)? = null
  private val mediaPressTimes = LinkedHashMap<String, Long>()

  fun setArmed(value: Boolean) = synchronized(lock) {
    epoch += 1
    idleGeneration += 1
    mediaPressTimes.clear()
    armed = value
    if (value) diagnostics = false
  }

  fun beginDiagnostics() = synchronized(lock) {
    check(!armed && preparing.isEmpty()) { "REMOTE_SETUP_ARMED: Disarm the show before learning or testing buttons." }
    diagnostics = true
    idleGeneration += 1
    mediaPressTimes.clear()
  }

  fun endDiagnostics() = synchronized(lock) { if (diagnostics) idleGeneration += 1; diagnostics = false; mediaPressTimes.clear() }
  fun isDiagnostic(): Boolean = synchronized(lock) { diagnostics }
  fun isArmed(): Boolean = synchronized(lock) { armed }
  fun requireIdle() = synchronized(lock) { check(!armed && preparing.isEmpty()) { "REMOTE_SETUP_ARMED: Disarm before changing controller settings." } }
  /** Separate from command epochs: settling preparation must not invalidate PCM work. */
  fun beginPreparation(): Long = synchronized(lock) { idleGeneration += 1; (++preparationSequence).also { preparing.add(it) } }
  fun endPreparation(token: Long) = synchronized(lock) { if (preparing.remove(token)) idleGeneration += 1 }
  fun captureIdleEpoch(): Long? = synchronized(lock) { if (!armed && preparing.isEmpty() && !diagnostics) idleGeneration else null }
  fun isCurrentIdleEpoch(value: Long): Boolean = synchronized(lock) { !armed && preparing.isEmpty() && !diagnostics && idleGeneration == value }
  /** Synchronous UI handoff only; never retain this lock for a store result/network wait. */
  fun <T> whileIdleEpoch(value: Long, action: () -> T): T? = synchronized(lock) {
    if (!isCurrentIdleEpoch(value)) null else action()
  }
  fun commandEpoch(type: String): Long? = synchronized(lock) {
    if (!armed) return@synchronized null
    if (type == "PANIC_FADE" || type == "STOP_ALL") epoch += 1
    epoch
  }
  fun isCurrentCommand(value: Long): Boolean = synchronized(lock) { armed && value == epoch }
  /** Short registration only: safety either precedes adoption or sees its PCM processor. */
  fun whileCurrentCommand(value: Long, action: () -> Unit): Boolean = synchronized(lock) {
    if (!armed || value != epoch) return@synchronized false
    action()
    true
  }
  fun commandEpoch(type: String, expectedEpoch: Long): Long? = synchronized(lock) {
    if (!armed || epoch != expectedEpoch) null else commandEpoch(type)
  }
  fun setMediaHandler(handler: ((String, String) -> Boolean)?) = synchronized(lock) { mediaHandler = handler }

  /** Adapter handles custom bindings; otherwise the audio owner's media defaults apply. */
  fun mediaInput(key: String, deviceId: String = "system-media", nowNanos: Long = System.nanoTime()): Boolean {
    val handler = synchronized(lock) {
      val identity = "$deviceId:$key"
      val elapsed = mediaPressTimes[identity]?.let { nowNanos - it }
      if (elapsed != null && elapsed in 0 until 80_000_000L) return true
      if (mediaPressTimes.size >= 32) mediaPressTimes.remove(mediaPressTimes.keys.first())
      mediaPressTimes[identity] = nowNanos
      mediaHandler
    }
    return handler?.invoke(key, deviceId) ?: isDiagnostic()
  }
}
