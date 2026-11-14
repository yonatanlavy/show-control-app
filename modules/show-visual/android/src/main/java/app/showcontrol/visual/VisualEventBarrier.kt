package app.showcontrol.visual

/** Keep blackout/prepare barriers even after the latched visual is cleared. */
internal class VisualEventBarrier {
  private var generationFloor = -1L
  private var barrierMs = -1.0
  private var latestEventMs = -1.0

  fun blackout(nowMs: Double) { barrierMs = maxOf(barrierMs, nowMs) }
  fun accepts(generation: Long, monotonicMs: Double): Boolean {
    if (generation < 0 || generation < generationFloor || !monotonicMs.isFinite() || monotonicMs <= barrierMs || monotonicMs < latestEventMs) return false
    generationFloor = maxOf(generationFloor, generation)
    latestEventMs = monotonicMs
    return true
  }
}
