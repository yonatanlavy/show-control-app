package app.showcontrol.audio

/** Transfers one asynchronously created resource only while its owner is live. */
internal class StartupResource<T : Any> {
  private var cancelled = false
  private var claimed = false
  private var resource: T? = null

  /** A rejected late result remains the creator's responsibility to release. */
  @Synchronized fun complete(value: T): Boolean {
    if (cancelled || claimed || resource != null) return false
    resource = value
    return true
  }

  @Synchronized fun take(): T? {
    if (cancelled || claimed) return null
    val value = resource ?: return null
    resource = null
    claimed = true
    return value
  }

  /** Return an unpublished result for release on its owning executor. */
  @Synchronized fun cancel(): T? {
    cancelled = true
    return resource.also { resource = null }
  }
}
