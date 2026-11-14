package app.showcontrol.visual

fun main() {
  val barrier = VisualEventBarrier()
  check(barrier.accepts(1, 100.0))
  barrier.blackout(150.0)
  check(!barrier.accepts(1, 140.0)) // Queued start from before manual blackout.
  check(!barrier.accepts(1, 150.0))
  check(barrier.accepts(1, 160.0)) // A deliberate next GO may keep the generation.
  check(!barrier.accepts(1, 155.0)) // Out-of-order pause/progress.
  check(barrier.accepts(2, 170.0))
  check(!barrier.accepts(1, 180.0)) // Old snapshot can never replace a newer one.
  barrier.blackout(200.0)
  check(!barrier.accepts(2, 190.0)) // Clear latch does not clear the barrier.
  check(barrier.accepts(3, 210.0))
  check(!barrier.accepts(3, Double.NaN))
  check(!barrier.accepts(-1, 220.0))
  println("Visual blackout, stale event and deliberate restart regression passed")
}
