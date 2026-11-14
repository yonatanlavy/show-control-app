package app.showcontrol.controller

/** Keeps cancelled/late SDK callbacks from settling or reporting a newer pairing attempt. */
internal class PairingScan<T : Any> {
  private var current: T? = null

  @Synchronized fun begin(callback: T): Boolean {
    if (current != null) return false
    current = callback
    return true
  }

  @Synchronized fun isCurrent(callback: T): Boolean = current === callback

  @Synchronized fun finish(callback: T): T? {
    if (current !== callback) return null
    current = null
    return callback
  }

  @Synchronized fun cancel(): T? {
    val pending = current
    current = null
    return pending
  }
}
