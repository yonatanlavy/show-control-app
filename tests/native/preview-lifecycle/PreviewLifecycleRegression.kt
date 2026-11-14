package app.showcontrol.audio

import android.content.Context
import android.os.Looper

private class Receipt {
  var resolved = 0
  val errors = mutableListOf<String>()
  val resolve: () -> Unit = { resolved++ }
  val reject: (String, String) -> Unit = { code, _ -> errors += code }
}
private val context = Context()
private val emitter: (Map<String, Any?>) -> Unit = {}
private fun preview(receipt: Receipt) = ShowAudioRuntime.preview(context, "preview", 0, true, emitter, receipt.resolve, receipt.reject)
private fun prepare(receipt: Receipt) = ShowAudioRuntime.prepare(context, "main", emitter, receipt.resolve, receipt.reject)
private fun drain(owner: ShowAudioService) { owner.commands.looper.drain(); Looper.main.drain() }
private fun starting(): ShowAudioService = ShowAudioService().also { check(ShowAudioRuntime.beginStartup(it)) }
private fun attached(): ShowAudioService = starting().also { check(ShowAudioRuntime.attach(it)); drain(it) }
private fun shut(owner: ShowAudioService) { val receipt = Receipt(); ShowAudioRuntime.shutdown(receipt.resolve, receipt.reject); drain(owner); check(receipt.resolved == 1 && receipt.errors.isEmpty()) }
private fun empty() {
  val receipt = Receipt(); var state: Map<String, Any?>? = mapOf("unexpected" to true)
  ShowAudioRuntime.getPreparedSession(emitter, { state = it; receipt.resolved++ }, receipt.reject)
  check(state == null && receipt.resolved == 1 && receipt.errors.isEmpty())
}

fun main() {
  var cases = 0
  empty()
  val idle = Receipt(); ShowAudioRuntime.stopPreview(idle.resolve)
  check(idle.resolved == 1 && context.serviceStarts == 0); cases++

  // Cancellation before onCreate must remove the old request, not a new show.
  val pending = Receipt(); preview(pending)
  val stopped = Receipt(); ShowAudioRuntime.stopPreview(stopped.resolve)
  check(stopped.resolved == 1 && pending.errors == listOf("PREVIEW_CANCELLED"))
  val next = Receipt(); prepare(next); val mainOwner = attached()
  check(next.resolved == 1 && mainOwner.prepared == "main" && !mainOwner.previewMode)
  shut(mainOwner); empty(); cases++

  // Cancel a preview-only startup before attach; duplicate stops share teardown.
  val old = Receipt(); preview(old); val held = starting()
  val stops = listOf(Receipt(), Receipt())
  stops.forEach { ShowAudioRuntime.stopPreview(it.resolve) }
  check(stops.all { it.resolved == 0 } && old.errors.isEmpty())
  check(!ShowAudioRuntime.attach(held))
  val refused = Receipt(); prepare(refused); check(refused.errors == listOf("OWNER_NOT_READY"))
  val refusedPreview = Receipt(); preview(refusedPreview); check(refusedPreview.errors == listOf("OWNER_NOT_READY"))
  val inspection = Receipt(); ShowAudioRuntime.getPreparedSession(emitter, { inspection.resolved++ }, inspection.reject)
  check(inspection.resolved == 0 && inspection.errors == listOf("OWNER_NOT_READY"))
  check(runCatching { ShowAudioRuntime.setDiagnosticTransport(context, true) }.isFailure)
  Looper.main.drain()
  check(held.destroyed && held.stopCalls == 1 && old.errors == listOf("PREVIEW_CANCELLED"))
  check(stops.all { it.resolved == 1 }); empty(); cases += 5
  val retry = Receipt(); prepare(retry); val retryOwner = attached()
  check(retry.resolved == 1); shut(retryOwner); empty(); cases++

  // StopPreview must never cancel main or diagnostic startup.
  val preparingMain = Receipt(); prepare(preparingMain); val startingMain = starting()
  val mainStop = Receipt(); ShowAudioRuntime.stopPreview(mainStop.resolve)
  check(mainStop.resolved == 1 && ShowAudioRuntime.attach(startingMain)); drain(startingMain)
  check(preparingMain.resolved == 1 && !startingMain.destroyed); shut(startingMain); empty(); cases++
  ShowAudioRuntime.setDiagnosticTransport(context, true)
  val diagnostics = starting(); val optionalPreview = Receipt(); preview(optionalPreview)
  val diagnosticStop = Receipt(); ShowAudioRuntime.stopPreview(diagnosticStop.resolve)
  check(diagnosticStop.resolved == 1 && optionalPreview.errors == listOf("PREVIEW_CANCELLED"))
  check(ShowAudioRuntime.attach(diagnostics) && diagnostics.diagnostic)
  ShowAudioRuntime.setDiagnosticTransport(context, false)
  shut(diagnostics); empty(); cases++

  // Actual Stop/shutdown code: close on the SAME command turn, wait for detach.
  val audition = Receipt(); preview(audition); val owner = attached()
  val firstStop = Receipt(); ShowAudioRuntime.stopPreview(firstStop.resolve)
  val secondStop = Receipt(); ShowAudioRuntime.stopPreview(secondStop.resolve)
  val queuedMain = Receipt(); prepare(queuedMain)
  owner.commands.looper.drain()
  check(owner.shutdownRequested && firstStop.resolved == 0 && secondStop.resolved == 0)
  Looper.main.drain()
  check(owner.destroyed && owner.safeStops == 1 && owner.releasedSessions == 1 && owner.stopCalls == 1)
  check(firstStop.resolved == 1 && secondStop.resolved == 1)
  check(queuedMain.resolved == 0 && queuedMain.errors == listOf("OWNER_SHUTTING_DOWN"))
  check(owner.broadcasts.isEmpty() && !NativeRemoteCoordinator.isArmed()); empty(); cases += 3

  // Opposite queue ordering: admitted main preparation survives preview Stop.
  val before = Receipt(); preview(before); val winner = attached()
  val winningMain = Receipt(); prepare(winningMain)
  val harmlessStop = Receipt(); ShowAudioRuntime.stopPreview(harmlessStop.resolve)
  drain(winner)
  check(winningMain.resolved == 1 && harmlessStop.resolved == 1)
  check(winner.prepared == "main" && !winner.destroyed && winner.stopCalls == 0 && NativeRemoteCoordinator.isArmed())
  owner.stopPreview { } // Stale destroyed owner must not affect its replacement.
  Looper.main.drain(); check(!winner.destroyed && NativeRemoteCoordinator.isArmed())
  shut(winner); empty(); cases += 2

  // A failed player stop or session release still detaches before completion.
  for (stopThrows in listOf(false, true)) {
    val active = Receipt(); preview(active); val faulty = attached()
    faulty.stopFailure = stopThrows; faulty.releaseFailure = !stopThrows
    val finish = Receipt(); ShowAudioRuntime.stopPreview(finish.resolve)
    faulty.commands.looper.drain(); check(finish.resolved == 0)
    Looper.main.drain()
    check(faulty.muted && faulty.destroyed && faulty.stopCalls == 1 && finish.resolved == 1)
    empty(); cases++
  }
  check(NativeRemoteCoordinator.captureIdleEpoch() != null) { "A refused/cancelled/failed preparation leaked idle admission" }
  val leaseOwner = Receipt(); val oldIdle = NativeRemoteCoordinator.captureIdleEpoch()!!; prepare(leaseOwner)
  check(NativeRemoteCoordinator.captureIdleEpoch() == null && !NativeRemoteCoordinator.isArmed())
  val leaseRefused = Receipt(); prepare(leaseRefused); check(leaseRefused.errors.single() == "OWNER_NOT_READY")
  check(NativeRemoteCoordinator.captureIdleEpoch() == null) { "Refusal must not release another preparation's lease" }
  val cancel = Receipt(); ShowAudioRuntime.shutdown(cancel.resolve, cancel.reject)
  check(cancel.resolved == 1 && leaseOwner.errors.single() == "STARTUP_CANCELLED" && NativeRemoteCoordinator.captureIdleEpoch() != null)
  check(!NativeRemoteCoordinator.isCurrentIdleEpoch(oldIdle)); cases += 3
  context.startFailure = true
  val startFailure = Receipt(); prepare(startFailure); check(startFailure.errors.single() == "SERVICE_START_FAILED")
  check(NativeRemoteCoordinator.captureIdleEpoch() != null); context.startFailure = false; cases++
  val initialization = Receipt(); prepare(initialization); val failing = starting()
  failing.failStartup("SYNTHETIC_STARTUP_FAILURE", "test"); check(NativeRemoteCoordinator.captureIdleEpoch() == null)
  Looper.main.drain(); check(initialization.errors.single() == "SYNTHETIC_STARTUP_FAILURE" && NativeRemoteCoordinator.captureIdleEpoch() != null); cases++
  println("Preview lifecycle: $cases actual-runtime/actual-teardown/actual-admission cases passed; hardware/prepare dependencies are controlled stubs, not an Android device test.")
}
