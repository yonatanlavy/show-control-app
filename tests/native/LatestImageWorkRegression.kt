package app.showcontrol.visual

import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

private class Tasks : Executor {
  private val tasks = ConcurrentLinkedQueue<Runnable>()
  val size get() = tasks.size
  override fun execute(task: Runnable) { tasks.add(task) }
  fun one() { (tasks.poll() ?: error("Missing scheduled work")).run() }
}
private fun case(name: String, test: () -> Unit) { test(); println("PASS: $name") }

fun main() {
  case("submission never decodes or publishes inline") {
    val worker = Tasks(); val ui = Tasks(); var loads = 0; val outputs = mutableListOf<Int>()
    val image = LatestImageWork<Int>(worker, ui) { error("Unexpected discard") }
    image.submit({ ++loads }, { outputs.add(it.getOrThrow()) })
    check(loads == 0 && outputs.isEmpty() && worker.size == 1)
    worker.one(); check(loads == 1 && outputs.isEmpty() && ui.size == 1)
    ui.one(); check(outputs == listOf(1) && worker.size == 0)
  }
  case("one thousand replacements retain one result and the latest pending decode") {
    val worker = Tasks(); val ui = Tasks(); val loads = mutableListOf<Int>(); val outputs = mutableListOf<Int>(); val discarded = mutableListOf<Int>()
    val image = LatestImageWork<Int>(worker, ui, discarded::add)
    image.submit({ loads.add(0); 0 }, { outputs.add(it.getOrThrow()) }); worker.one()
    repeat(1000) { index -> image.submit({ loads.add(index + 1); index + 1 }, { outputs.add(it.getOrThrow()) }) }
    check(worker.size == 0 && ui.size == 1 && loads == listOf(0))
    ui.one(); check(discarded == listOf(0) && worker.size == 1)
    worker.one(); ui.one()
    check(loads == listOf(0, 1000) && outputs == listOf(1000) && discarded == listOf(0))
  }
  case("blackout discards a decoded result already posted to the UI") {
    val worker = Tasks(); val ui = Tasks(); val discarded = mutableListOf<Int>(); var callbacks = 0
    val image = LatestImageWork<Int>(worker, ui, discarded::add)
    image.submit({ 7 }, { callbacks++ }); worker.one(); image.cancel(); ui.one()
    check(discarded == listOf(7) && callbacks == 0)
  }
  case("cancelled queued work does not decode and deliberate replacement still runs") {
    val worker = Tasks(); val ui = Tasks(); var loads = 0; val outputs = mutableListOf<Int>()
    val image = LatestImageWork<Int>(worker, ui) { error("No bitmap should need disposal") }
    image.submit({ ++loads }, { error("Cancelled completion") }); image.cancel()
    image.submit({ ++loads }, { outputs.add(it.getOrThrow()) })
    worker.one(); check(loads == 0); ui.one(); worker.one(); ui.one()
    check(loads == 1 && outputs == listOf(1))
  }
  case("close invalidates posted results and refuses all later requests") {
    val worker = Tasks(); val ui = Tasks(); val discarded = mutableListOf<Int>()
    val image = LatestImageWork<Int>(worker, ui, discarded::add)
    image.submit({ 4 }, { error("Closed completion") }); worker.one(); image.close()
    check(!image.submit({ 5 }, { error("Reopened closed renderer") })); ui.one()
    image.close(); image.cancel(); check(discarded == listOf(4) && worker.size == 0)
  }
  case("a current error reports once and permits an independent retry") {
    val worker = Tasks(); val ui = Tasks(); val failures = mutableListOf<String>(); val outputs = mutableListOf<Int>()
    val image = LatestImageWork<Int>(worker, ui) { error("Unexpected discard") }
    image.submit({ throw IllegalArgumentException("Damaged image") }, { failures.add(it.exceptionOrNull()!!.message!!) })
    worker.one(); ui.one()
    image.submit({ 9 }, { outputs.add(it.getOrThrow()) }); worker.one(); ui.one()
    check(failures == listOf("Damaged image") && outputs == listOf(9))
  }
  case("a stale error cannot fault a replacement or blackout") {
    val worker = Tasks(); val ui = Tasks(); var faults = 0
    val image = LatestImageWork<Int>(worker, ui) {}
    image.submit({ throw IllegalArgumentException("Old fault") }, { faults++ }); worker.one(); image.cancel(); ui.one()
    check(faults == 0)
  }
  case("worker admission refusal is a recoverable UI failure") {
    val ui = Tasks(); var failures = 0
    val image = LatestImageWork<Int>(Executor { throw RejectedExecutionException() }, ui) {}
    check(image.submit({ 1 }, { check(it.isFailure); failures++ })); check(failures == 0); ui.one()
    check(failures == 1)
  }
  case("a released UI disposes the result and closes further admission") {
    val worker = Tasks(); val discarded = mutableListOf<Int>()
    val image = LatestImageWork<Int>(worker, Executor { throw RejectedExecutionException() }, discarded::add)
    image.submit({ 3 }, { error("Unavailable UI") }); worker.one()
    check(discarded == listOf(3) && !image.submit({ 4 }, {}))
  }
  case("replacement requested by a completion remains serialized") {
    val worker = Tasks(); val ui = Tasks(); val outputs = mutableListOf<Int>()
    val image = LatestImageWork<Int>(worker, ui) {}
    image.submit({ 1 }, { outputs.add(it.getOrThrow()); image.submit({ 2 }, { outputs.add(it.getOrThrow()) }) })
    worker.one(); ui.one(); check(worker.size == 1); worker.one(); ui.one(); check(outputs == listOf(1, 2))
  }
  case("real decoding runs on the worker and publication waits for its UI executor") {
    val worker = Executors.newSingleThreadExecutor(); val ui = Tasks(); val loaded = CountDownLatch(1)
    val caller = Thread.currentThread(); val decodeThread = AtomicReference<Thread>(); var published = false
    val image = LatestImageWork<Int>(worker, ui) {}
    try {
      image.submit({ decodeThread.set(Thread.currentThread()); loaded.countDown(); 1 }, { published = true })
      check(loaded.await(5, TimeUnit.SECONDS))
      val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
      while (ui.size == 0 && System.nanoTime() < deadline) Thread.yield()
      check(decodeThread.get() !== caller && !published && ui.size == 1)
      ui.one(); check(published)
    } finally { image.close(); worker.shutdownNow() }
  }
  println("11 native audience-image ownership, backpressure and resource regressions passed")
}
