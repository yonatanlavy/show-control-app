package app.showcontrol.audio

fun main() {
  NativeRemoteCoordinator.setArmed(false)
  val oldIdle = NativeRemoteCoordinator.captureIdleEpoch()!!
  val lease1 = NativeRemoteCoordinator.beginPreparation()
  val lease2 = NativeRemoteCoordinator.beginPreparation()
  check(NativeRemoteCoordinator.captureIdleEpoch() == null && !NativeRemoteCoordinator.isCurrentIdleEpoch(oldIdle))
  check(runCatching { NativeRemoteCoordinator.requireIdle() }.isFailure)
  check(runCatching { NativeRemoteCoordinator.beginDiagnostics() }.isFailure)
  NativeRemoteCoordinator.endPreparation(lease1); NativeRemoteCoordinator.endPreparation(lease1)
  check(NativeRemoteCoordinator.captureIdleEpoch() == null)
  NativeRemoteCoordinator.setArmed(true)
  val continuousCommand = NativeRemoteCoordinator.commandEpoch("GO")!!
  NativeRemoteCoordinator.endPreparation(lease2)
  check(NativeRemoteCoordinator.isCurrentCommand(continuousCommand)) { "Preparation settlement must not invalidate transport work" }
  NativeRemoteCoordinator.setArmed(false)
  check(NativeRemoteCoordinator.captureIdleEpoch() != null && !NativeRemoteCoordinator.isCurrentIdleEpoch(oldIdle))
  NativeRemoteCoordinator.beginDiagnostics()
  check(NativeRemoteCoordinator.mediaInput("MEDIA_NEXT"))
  NativeRemoteCoordinator.endDiagnostics()
  check(!NativeRemoteCoordinator.mediaInput("MEDIA_NEXT"))
  NativeRemoteCoordinator.setArmed(true)
  check(!NativeRemoteCoordinator.mediaInput("MEDIA_NEXT", nowNanos = 1_000_000_000L))
  check(NativeRemoteCoordinator.mediaInput("MEDIA_NEXT", nowNanos = 1_010_000_000L))
  check(!NativeRemoteCoordinator.mediaInput("MEDIA_NEXT", nowNanos = 1_090_000_000L))
  val pendingGo = NativeRemoteCoordinator.commandEpoch("GO")!!
  check(NativeRemoteCoordinator.isCurrentCommand(pendingGo))
  val panic = NativeRemoteCoordinator.commandEpoch("PANIC_FADE")!!
  check(!NativeRemoteCoordinator.isCurrentCommand(pendingGo))
  check(NativeRemoteCoordinator.isCurrentCommand(panic))
  check(NativeRemoteCoordinator.commandEpoch("STOP_ALL", pendingGo) == null) { "A stale notification must not invalidate current inputs" }
  check(NativeRemoteCoordinator.isCurrentCommand(panic))
  val notificationStop = NativeRemoteCoordinator.commandEpoch("STOP_ALL", panic)!!
  check(!NativeRemoteCoordinator.isCurrentCommand(panic))
  check(NativeRemoteCoordinator.isCurrentCommand(notificationStop))
  var adopted = 0
  check(!NativeRemoteCoordinator.whileCurrentCommand(panic) { adopted += 1 })
  check(NativeRemoteCoordinator.whileCurrentCommand(notificationStop) { adopted += 1 })
  check(adopted == 1)
  repeat(100) {
    NativeRemoteCoordinator.setArmed(true)
    val captured = NativeRemoteCoordinator.commandEpoch("ROOT_PREPARATION")!!
    val registered = java.util.concurrent.atomic.AtomicBoolean(false)
    val muted = java.util.concurrent.atomic.AtomicBoolean(false)
    val start = java.util.concurrent.CountDownLatch(1)
    val adoption = Thread { start.await(); NativeRemoteCoordinator.whileCurrentCommand(captured) { registered.set(true) } }
    val stop = Thread { start.await(); NativeRemoteCoordinator.commandEpoch("STOP_ALL"); if (registered.get()) muted.set(true) }
    adoption.start(); stop.start(); start.countDown()
    adoption.join(2_000); stop.join(2_000)
    check(!adoption.isAlive && !stop.isAlive)
    check(!registered.get() || muted.get()) { "A prepared voice cannot register after urgent stop passed its mute snapshot" }
  }
  check(runCatching { NativeRemoteCoordinator.beginDiagnostics() }.isFailure)
  check(runCatching { NativeRemoteCoordinator.requireIdle() }.isFailure)
  check(!NativeRemoteCoordinator.isDiagnostic())
  NativeRemoteCoordinator.setArmed(false)
  check(!NativeRemoteCoordinator.whileCurrentCommand(notificationStop) { adopted += 1 })
  check(!NativeRemoteCoordinator.isCurrentCommand(panic))
  check(NativeRemoteCoordinator.commandEpoch("GO") == null)
  NativeRemoteCoordinator.beginDiagnostics()
  NativeRemoteCoordinator.setArmed(true)
  check(!NativeRemoteCoordinator.isDiagnostic())
  var received = ""
  NativeRemoteCoordinator.setMediaHandler { key, _ -> received = key; true }
  check(NativeRemoteCoordinator.mediaInput("MEDIA_STOP"))
  check(received == "MEDIA_STOP")
  NativeRemoteCoordinator.setMediaHandler(null)
  NativeRemoteCoordinator.setArmed(false)
  println("Native remote admission: silent testing, armed refusal, command epochs/panic preemption, default-media bounce and interception passed.")
}
