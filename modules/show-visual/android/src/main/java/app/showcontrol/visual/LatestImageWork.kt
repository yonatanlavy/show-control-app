package app.showcontrol.visual

import java.util.concurrent.Executor
import java.util.concurrent.CancellationException

/** One decode/result at a time; a busy UI can retain only the latest waiting request. */
internal class LatestImageWork<T>(
  private val worker: Executor,
  private val ui: Executor,
  private val discard: (T) -> Unit,
) {
  private data class Request<T>(val revision: Long, val load: () -> T, val complete: (Result<T>) -> Unit)
  private val lock = Any()
  private var revision = 0L
  private var pending: Request<T>? = null
  private var running = false
  private var closed = false

  fun submit(load: () -> T, complete: (Result<T>) -> Unit): Boolean {
    val start = synchronized(lock) {
      if (closed) return false
      pending = Request(++revision, load, complete)
      if (running) false else { running = true; true }
    }
    if (start) startNext()
    return true
  }

  fun cancel() = synchronized(lock) { revision++; pending = null }
  fun close() = synchronized(lock) { closed = true; revision++; pending = null }

  private fun startNext() {
    val request = synchronized(lock) {
      if (closed || pending == null) { running = false; return }
      pending.also { pending = null }!!
    }
    try {
      worker.execute {
        val current = synchronized(lock) { !closed && revision == request.revision }
        deliver(request, if (current) runCatching(request.load) else Result.failure(CancellationException("Obsolete image request")))
      }
    } catch (failure: RuntimeException) {
      deliver(request, Result.failure(failure))
    }
  }

  private fun deliver(request: Request<T>, result: Result<T>) {
    try {
      ui.execute {
        // submit/cancel/close and view publication belong to the UI owner.
        // Do not start another decode until this result is consumed/discarded.
        try {
          if (synchronized(lock) { !closed && revision == request.revision }) request.complete(result)
          else result.onSuccess(discard)
        } finally { startNext() }
      }
    } catch (_: RuntimeException) {
      result.onSuccess(discard)
      close()
      synchronized(lock) { running = false }
    }
  }
}
