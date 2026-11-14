package app.showcontrol.audio

import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger

fun main() {
  val owner = Any()
  val gate = TransportFailureGate<Any>()
  check(!gate.fail(owner, false, false)) { "An unattached callback must be ignored" }
  gate.attach(owner)
  check(!gate.fail(Any(), false, false)) { "A stale player must not poison the owner" }
  check(!gate.fail(owner, true, false))
  check(!gate.fail(owner, false, true))
  check(!gate.hasFailed)
  check(gate.admitsCommand("GO"))
  check(gate.fail(owner, false, false))
  check(gate.hasFailed)
  check(!gate.fail(owner, false, false)) { "Duplicate errors must not repeat teardown" }
  for (command in listOf("GO", "PLAY", "PAUSE", "RESUME", "PAUSE_RESUME", "PREVIOUS", "SKIP", "SELECT", "START_SELECTED", "REPLAY", "SCHEDULE", "TRIGGER_HIT", "TRIGGER_CUE", "TRIGGER_GROUP", "FADE", "SEEK_REHEARSAL")) {
    check(!gate.admitsCommand(command)) { "Failed transport admitted $command" }
  }
  for (command in listOf("STOP", "STOP_ALL", "PANIC_FADE")) check(gate.admitsCommand(command)) { "$command must remain available" }
  check(gate.hasFailed) { "Safety commands must not clear terminal failure" }
  check(runCatching { gate.attach(owner) }.isFailure) { "Preparation must not reset the failed owner" }
  gate.release(Any())
  check(gate.hasFailed) { "A stale release must not clear recovery" }
  gate.release(owner)
  val replacement = Any()
  gate.attach(replacement)
  check(!gate.fail(owner, false, false)) { "Released-player errors must not stop a fresh deliberate owner" }
  check(!gate.hasFailed && gate.admitsCommand("GO"))
  check(gate.fail(replacement, false, false))

  repeat(100) {
    val concurrent = TransportFailureGate<Any>()
    val player = Any()
    concurrent.attach(player)
    val begin = CountDownLatch(1)
    val handled = AtomicInteger(0)
    val callbacks = List(4) { Thread { begin.await(); if (concurrent.fail(player, false, false)) handled.incrementAndGet() } }
    callbacks.forEach(Thread::start); begin.countDown(); callbacks.forEach(Thread::join)
    check(handled.get() == 1) { "Concurrent errors need one failure owner" }
    check(concurrent.hasFailed && !concurrent.admitsCommand("SCHEDULE"))
  }
  println("Transport failure: terminal admission, safety access, stale/released owner callbacks, shutdown and 100 concurrent duplicate races passed")
}
