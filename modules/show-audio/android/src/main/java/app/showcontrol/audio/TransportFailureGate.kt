package app.showcontrol.audio

import java.util.concurrent.atomic.AtomicReference

/** Failure belongs to one player lifetime and stays terminal until explicit exit.
 * Identity rejects released-player callbacks without poisoning a newer owner.
 */
internal class TransportFailureGate<T : Any> {
  private data class State<T>(val owner: T, val failed: Boolean)
  private val state = AtomicReference<State<T>?>(null)
  val hasFailed: Boolean get() = state.get()?.failed == true

  fun attach(owner: T) {
    check(state.compareAndSet(null, State(owner, false))) { "Transport already has an owner." }
  }

  fun fail(owner: T, shuttingDown: Boolean, destroyed: Boolean): Boolean {
    if (shuttingDown || destroyed) return false
    while (true) {
      val previous = state.get() ?: return false
      if (previous.owner !== owner || previous.failed) return false
      if (state.compareAndSet(previous, State(owner, true))) return true
    }
  }

  fun admitsCommand(type: String): Boolean = !hasFailed || type in setOf("STOP_ALL", "STOP", "PANIC_FADE")

  fun release(owner: T) {
    while (true) {
      val previous = state.get() ?: return
      if (previous.owner !== owner || state.compareAndSet(previous, null)) return
    }
  }
}
