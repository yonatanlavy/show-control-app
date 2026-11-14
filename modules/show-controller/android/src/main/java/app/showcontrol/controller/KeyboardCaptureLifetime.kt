package app.showcontrol.controller

internal data class KeyboardCaptureRequest(val epoch: Long, val resetInput: Boolean)

/** Short state-only lock. UI work and controller calls always run outside it. */
internal class KeyboardCaptureLifetime {
  private var epoch = 0L
  private var requested = false
  private var installed: Long? = null
  private var resetPending = true

  private fun request(): KeyboardCaptureRequest { epoch += 1; installed = null; return KeyboardCaptureRequest(epoch, resetPending) }
  @Synchronized fun start(): KeyboardCaptureRequest { requested = true; return request() }
  @Synchronized fun attach(): KeyboardCaptureRequest? = if (requested) request() else null
  @Synchronized fun stop(): Long { requested = false; resetPending = true; installed = null; epoch += 1; return epoch }
  @Synchronized fun suspend(): Long { resetPending = true; installed = null; epoch += 1; return epoch }
  @Synchronized fun isRequested(): Boolean = requested
  @Synchronized fun isCurrent(value: Long): Boolean = value == epoch
  @Synchronized fun mayAttach(value: Long): Boolean = requested && value == epoch
  @Synchronized fun isActive(value: Long): Boolean = requested && value == epoch && installed == value
  @Synchronized fun isAttached(): Boolean = requested && installed == epoch
  @Synchronized fun didAttach(value: Long) { if (requested && value == epoch) { installed = value; resetPending = false } }
}
