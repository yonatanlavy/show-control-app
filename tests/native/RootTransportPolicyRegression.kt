package app.showcontrol.audio

fun main() {
  check(rootGoAction(false, false, true, false) == RootGoAction.ADVANCE_ROOT) { "A group cannot restart just because it has no primary audio voice" }
  check(rootGoAction(false, false, true, true) == RootGoAction.ADVANCE_ROOT)
  check(rootGoAction(false, false, false, true) == RootGoAction.ADVANCE_AUDIO)
  check(rootGoAction(false, false, false, false) == RootGoAction.START)
  for (group in listOf(false, true)) for (audio in listOf(false, true)) {
    check(rootGoAction(false, true, group, audio) == RootGoAction.IGNORE)
    check(rootGoAction(true, true, group, audio) == RootGoAction.RESUME)
  }
  check(rootCanComplete(true, false, false, 0, 0, false))
  check(!rootCanComplete(true, false, false, 0, 1, false)) { "A later child keeps the root alive" }
  check(!rootCanComplete(true, false, false, 1, 0, false)) { "One finished child cannot advance its siblings" }
  check(!rootCanComplete(true, true, false, 0, 0, false))
  check(!rootCanComplete(true, false, true, 0, 0, false))
  check(!rootCanComplete(true, false, false, 0, 0, true))
  check(!rootCanComplete(false, false, false, 0, 0, false))
  check(rootFutureCapacity(0, 0, 8)) { "Outgoing main slots can be reused after their fade" }
  check(rootFutureCapacity(3, 1, 4))
  check(!rootFutureCapacity(3, 1, 4, 1)) { "New Hits cannot steal the committed future capacity" }
  check(!rootFutureCapacity(8, 0, 1))
  check(!rootFutureCapacity(-1, 0, 1))
  check(!rootFutureCapacity(0, 9, 0))
  check(!rootExitReady(false, false, 0))
  check(!rootExitReady(true, false, 1)) { "An outgoing voice that has not finished its fade still owns the transition" }
  check(rootExitReady(true, false, 0))
  check(rootExitReady(true, true, 1)) { "Crossfade starts incoming after its delay while retaining outgoing audio" }
  check(!rootExitReady(false, true, 0))
  check(!rootExitReady(true, false, -1))

  val gate = RootAdmissionGate(4, 7, 2, setOf("a", "b"))
  check(!gate.markReady("a", 3, 7) && !gate.markReady("a", 4, 6))
  check(!gate.markReady("unknown", 4, 7))
  check(gate.markReady("a", 4, 7))
  check(!gate.markReady("a", 4, 7))
  check(!gate.beginFade(4, 7, false)) { "The entire group must be prepared" }
  check(gate.markReady("b", 4, 7) && gate.phase == RootAdmissionPhase.READY)
  check(!gate.beginFade(4, 7, true)) { "Preparation must not unpause transport" }
  check(gate.beginFade(4, 7, false))
  check(!gate.beginFade(4, 7, false) && !gate.refuse(4, 7))
  check(!gate.commit(4, 7, true) && !gate.commit(5, 7, false))
  check(gate.commit(4, 7, false) && !gate.commit(4, 7, false))
  check(!gate.cancel())
  val cancelled = RootAdmissionGate(4, 7, 3, setOf("a"))
  check(cancelled.cancel() && !cancelled.cancel())
  check(!cancelled.markReady("a", 4, 7)) { "Late readiness after panic must not start audio" }
  val refused = RootAdmissionGate(4, 7, 3, setOf("a"))
  check(refused.refuse(4, 7) && !refused.refuse(4, 7) && !refused.cancel())
  val empty = RootAdmissionGate(4, 7, 3, emptySet())
  check(empty.beginFade(4, 7, false) && empty.commit(4, 7, false))
  check(runCatching { RootAdmissionGate(4, 7, 3, (1..9).map(Int::toString).toSet()) }.isFailure)
  println("Root transport/admission: group GO, aggregate completion, capacity, full preparation, pause, stale work, refusal and panic cancellation passed")
}
