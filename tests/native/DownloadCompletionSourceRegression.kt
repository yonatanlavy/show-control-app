package app.showcontrol.downloads

import java.io.File

/** Job, storage and Android URI adapters are doubles; stage methods are production source. */
fun main(args: Array<String>) {
  val root = File(args.single()).canonicalFile
  check(root.parentFile.name.startsWith("download-completion-source-"))
  val context = Context(root)
  val native = CompletionHarness()
  var next = 0
  fun id() = "00000000-0000-4000-8000-" + (++next).toString().padStart(12, '0')
  fun finished(id: String) = JSONObject().put("stage", "ready").put("uri", native.ownedUri(context, id)).put("bytes", 1000L)
  fun refused(id: String) {
    val error = runCatching { native.complete(context, id) }.exceptionOrNull()
    check(error is IllegalArgumentException && error.message == "DOWNLOAD_INVALID") { "Incomplete/unproven completion must be refused" }
  }

  val late = id(); native.records[late] = finished(late)
  native.cancel(context, late); native.cancel(context, late)
  check(native.records[late]!!.optString("stage") == "cancelled")
  native.complete(context, late)
  check(native.records[late]!!.optString("stage") == "attached")
  check(native.records[late]!!.opt("cancelledAfterReady") == null)
  println("PASS committed completion supersedes repeated late Cancel without an existing staging file")

  native.cancel(context, late); native.complete(context, late)
  check(native.records[late]!!.optString("stage") == "attached")
  println("PASS Cancel after completion and repeated completion remain idempotent")

  val oldReady = id(); native.records[oldReady] = finished(oldReady)
  native.complete(context, oldReady)
  check(native.records[oldReady]!!.optString("stage") == "attached")
  val oldCancelled = id(); native.records[oldCancelled] = finished(oldCancelled).put("stage", "cancelled")
  refused(oldCancelled)
  for (marker in listOf<Any>("true", 1, 1.0)) {
    val malformed = id(); native.records[malformed] = finished(malformed).put("stage", "cancelled").put("cancelledAfterReady", marker)
    refused(malformed)
  }
  println("PASS old ready rows work and old cancelled/malformed provenance fail closed")

  for (stage in listOf("queued", "resolving", "downloading", "extracting", "error", "interrupted")) {
    val incomplete = id(); native.records[incomplete] = JSONObject().put("stage", stage)
    native.cancel(context, incomplete); refused(incomplete)
    check(native.records[incomplete]!!.opt("cancelledAfterReady") == null)
  }
  println("PASS cancellation of active, incomplete and failed jobs cannot become attachment")

  for (bytes in listOf<Any>(0L, 127L, 500000001L, 128.5, "1000", Double.NaN)) {
    val invalid = id(); native.records[invalid] = finished(invalid).put("bytes", bytes)
    native.cancel(context, invalid); refused(invalid)
  }
  for (uri in listOf("file:///unowned/audio.mp3", "https://example.com/audio.mp3", "file:///owned/../other/audio.mp3")) {
    val invalid = id(); native.records[invalid] = finished(invalid).put("uri", uri)
    native.cancel(context, invalid); refused(invalid)
  }
  val noFile = id(); native.records[noFile] = JSONObject().put("stage", "ready")
  native.cancel(context, noFile); refused(noFile)
  println("PASS wrong, missing, fractional, nonnumeric and oversized finished metadata fails closed")

  val injected = id()
  val request = finished(injected).put("stage", "queued").put("cancelledAfterReady", true).put("errorCode", "private").put("receiving", true)
  native.seed(request); native.records[injected] = request
  check(listOf("uri", "bytes", "cancelledAfterReady", "errorCode", "receiving").all { request.opt(it) == null })
  native.cancel(context, injected); refused(injected)
  println("PASS caller-provided finished metadata and provenance are stripped before registration")

  val unknown = id(); val count = native.records.size
  native.complete(context, unknown)
  check(native.records.size == count && native.records[unknown] == null)
  println("PASS unknown completion cannot create or alter a job")

  val notificationReady = id(); native.records[notificationReady] = finished(notificationReady)
  val unrelated = id(); native.records[unrelated] = JSONObject().put("stage", "downloading")
  for (terminal in listOf("ready", "attached", "cancelled", "error", "interrupted")) {
    native.records[notificationReady]!!.put("stage", terminal)
    native.cancelActiveTransfer(context, notificationReady)
    check(native.records[notificationReady]!!.optString("stage") == terminal)
    check(native.records[notificationReady]!!.opt("cancelledAfterReady") == null)
    check(native.records[unrelated]!!.optString("stage") == "downloading")
  }
  native.cancelActiveTransfer(context, unknown)
  for (stage in listOf("queued", "resolving", "downloading", "extracting")) {
    val active = id(); native.records[active] = JSONObject().put("stage", stage)
    native.cancelActiveTransfer(context, active)
    check(native.records[active]!!.optString("stage") == "cancelled")
    check(native.records[active]!!.opt("cancelledAfterReady") == null)
  }
  println("PASS notification Cancel affects active transfer only, ignoring terminal/unknown and unrelated jobs")

  val ownership = DownloadServiceOwnership()
  ownership.noteStart(1); check(ownership.idleStopId() == 1)
  val first = ownership.admit(); check(ownership.idleStopId() == null)
  ownership.noteStart(2) // A cancellation command must not strand the worker's old start ID.
  check(ownership.finish(first) == 2 && ownership.idleStopId() == 2)
  ownership.noteStart(3); val old = ownership.admit()
  ownership.noteStart(4); val newer = ownership.admit()
  check(ownership.finish(old) == null && ownership.idleStopId() == null)
  ownership.noteStart(5) // Stale old-job cancel arrives while newer work owns the service.
  check(ownership.idleStopId() == null && ownership.finish(newer) == 5)
  ownership.noteStart(6); val destroyed = ownership.admit(); ownership.destroy()
  check(ownership.finish(destroyed) == null)
  println("PASS service lifecycle stops idle/current work at latest start ID and rejects stale/destroyed worker cleanup")
}
