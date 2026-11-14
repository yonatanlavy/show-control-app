package app.showcontrol.audio

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

fun main() {
  val ready = StartupResource<Any>()
  val player = Any()
  check(ready.take() == null)
  check(ready.complete(player))
  check(ready.take() === player)
  check(ready.take() == null)
  check(ready.cancel() == null) // Published resource belongs to service teardown.
  check(!ready.complete(Any()))

  val timedOut = StartupResource<Any>()
  check(timedOut.cancel() == null)
  check(!timedOut.complete(player)) // Slow creator must release its rejected result.
  check(timedOut.take() == null) // Never publish a late Ready/session.

  val cancelledBeforePublish = StartupResource<Any>()
  check(cancelledBeforePublish.complete(player))
  check(cancelledBeforePublish.cancel() === player) // Release on command executor.
  check(cancelledBeforePublish.take() == null)
  check(cancelledBeforePublish.cancel() == null) // Exactly one disposal owner.

  val failed = StartupResource<Any>()
  failed.cancel()
  check(!failed.complete(Any()))
  check(failed.take() == null)
  val retry = StartupResource<Any>()
  check(retry.complete(player))
  check(retry.take() === player) // Only a fresh lifecycle can succeed.

  // Deterministically cancel while construction is held in progress, rather
  // than relying on the scheduler to hit this ordering in the races below.
  val heldCreator = StartupResource<Any>()
  val constructionStarted = CountDownLatch(1)
  val finishConstruction = CountDownLatch(1)
  val lateDisposals = AtomicInteger(0)
  val constructionFailure = AtomicReference<Throwable?>(null)
  val constructor = Thread {
    try {
      constructionStarted.countDown()
      check(finishConstruction.await(10, TimeUnit.SECONDS))
      if (!heldCreator.complete(player)) lateDisposals.incrementAndGet()
    } catch (error: Throwable) { constructionFailure.set(error) }
  }
  constructor.start()
  try {
    check(constructionStarted.await(10, TimeUnit.SECONDS))
    check(heldCreator.cancel() == null)
    check(heldCreator.take() == null)
  } finally {
    finishConstruction.countDown()
    constructor.join(10_000)
    if (constructor.isAlive) constructor.interrupt()
  }
  check(!constructor.isAlive)
  constructionFailure.get()?.let { throw it }
  check(lateDisposals.get() == 1)
  check(heldCreator.take() == null) // Slow creation cannot publish stale Ready.
  check(!heldCreator.complete(Any())) // Only a fresh owner may retry.

  repeat(100) {
    val racing = StartupResource<Any>()
    val released = AtomicInteger(0)
    val begin = CountDownLatch(1)
    val create = Thread { begin.await(); if (!racing.complete(Any())) released.incrementAndGet() }
    val dispose = Thread { begin.await(); if (racing.cancel() != null) released.incrementAndGet() }
    create.start(); dispose.start(); begin.countDown(); create.join(); dispose.join()
    check(racing.take() == null)
    check(released.get() == 1) // Complete/cancel race has exactly one disposer.
  }
  println("Native startup resource: transfer, timeout, held-creator cancellation, no stale Ready, cancellation before publication, late result, single disposal, fresh retry and 100 concurrent disposal races passed.")
}
