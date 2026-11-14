package app.showcontrol.controller

fun main() {
  val scan = PairingScan<Any>()
  val cancelled = Any()
  val current = Any()
  check(scan.begin(cancelled))
  check(!scan.begin(current))
  check(scan.isCurrent(cancelled))
  check(scan.cancel() === cancelled)
  check(!scan.isCurrent(cancelled))
  check(scan.begin(current))
  check(scan.finish(cancelled) == null) // Old timeout, startup error or SDK completion.
  check(!scan.isCurrent(cancelled)) // Old discovery/status must also be ignored.
  check(scan.isCurrent(current))
  check(scan.finish(current) === current)
  check(scan.finish(current) == null) // Never settle the promise twice.
  check(scan.cancel() == null)
  check(scan.begin(cancelled)) // Startup failure/timeout releases the next attempt.
  check(scan.finish(cancelled) === cancelled)
  println("Pairing scan: concurrent admission, cancellation, stale status/completion, timeout/startup retry and single settlement passed.")
}
