import Foundation

/// A cleared renderer must not forget which queued events were blacked out.
struct VisualEventBarrier {
  private var generationFloor: Int64 = -1
  private var barrierMs: Double = -1
  private var latestEventMs: Double = -1
  mutating func blackout(_ nowMs: Double) { barrierMs = max(barrierMs, nowMs) }
  mutating func accepts(generation: Int64, monotonicMs: Double) -> Bool {
    guard generation >= 0, generation >= generationFloor, monotonicMs.isFinite, monotonicMs > barrierMs, monotonicMs >= latestEventMs else { return false }
    generationFloor = max(generationFloor, generation)
    latestEventMs = monotonicMs
    return true
  }
}
