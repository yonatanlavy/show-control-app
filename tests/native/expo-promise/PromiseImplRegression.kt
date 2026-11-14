package expo.modules.kotlin.jni

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread

private typealias Settlement = PromiseImpl.() -> Unit

private val resolutions: List<Pair<String, Settlement>> = listOf(
  "void" to { resolve() },
  "nullable value" to { resolve(null as Any?) },
  "integer" to { resolve(7) },
  "boolean" to { resolve(true) },
  "double" to { resolve(0.75) },
  "float" to { resolve(0.75f) },
  "string" to { resolve("value") },
  "collection" to { resolve(listOf<Any?>("value", null)) },
  "map" to { resolve(mapOf<String, Any?>("value" to 7)) },
)
private val rejection: Settlement = { reject("ERR_TEST", "rejected while resolving", null) }

/** Force the second caller to settle while the first is still in JNI dispatch. */
private fun settlesOnceDuringCallback(first: Settlement, second: Settlement) {
  val started = CountDownLatch(1)
  val finish = CountDownLatch(1)
  val firstInvocation = AtomicBoolean(true)
  val failure = AtomicReference<Throwable?>(null)
  val callback = JavaCallback {
    if (firstInvocation.compareAndSet(true, false)) {
      started.countDown()
      check(finish.await(10, TimeUnit.SECONDS)) { "Resolver release was not received" }
    }
  }
  val promise = PromiseImpl(callback)
  val resolver = thread(name = "promise-regression-resolver") {
    try { first(promise) } catch (error: Throwable) { failure.set(error) }
  }
  try {
    check(started.await(10, TimeUnit.SECONDS)) { "Resolver never reached JNI dispatch" }
    second(promise)
  } finally {
    finish.countDown()
    resolver.join(10_000)
    if (resolver.isAlive) resolver.interrupt()
  }
  check(!resolver.isAlive) { "Resolver did not finish" }
  failure.get()?.let { throw it }
  check(callback.invocations.size == 1) {
    "Expected one JNI callback dispatch; observed ${callback.invocations.map { it.kind }}"
  }
  check(promise.wasSettled) { "Completed Promise must remain settled" }
}

private fun rejectedAfterConversionFailure() {
  val callback = JavaCallback {
    if (it.kind == "string") throw IllegalStateException("conversion failed")
  }
  val promise = PromiseImpl(callback)
  val failure = runCatching { promise.resolve("value") }.exceptionOrNull()
  check(failure is IllegalStateException && failure.message == "conversion failed")
  check(!promise.wasSettled) { "Failed conversion must release its settlement claim" }
  promise.reject("ERR_TEST", "conversion failed", null)
  check(promise.wasSettled)
  check(callback.invocations == listOf(CallbackInvocation("reject", "conversion failed", "ERR_TEST")))
}

private fun resolveAfterRejectionConversionFailure() {
  val attempts = AtomicInteger()
  val callback = JavaCallback {
    if (attempts.getAndIncrement() == 0) throw IllegalArgumentException("rejection conversion failed")
  }
  val promise = PromiseImpl(callback)
  check(runCatching { promise.reject(null, null, IllegalStateException("cause")) }.exceptionOrNull() is IllegalArgumentException)
  check(!promise.wasSettled)
  promise.resolve(7)
  check(promise.wasSettled)
  check(callback.invocations == listOf(CallbackInvocation("int", 7)))
}

private fun ignoresSequentialSettlements() {
  val callback = JavaCallback()
  val promise = PromiseImpl(callback)
  promise.resolve("first")
  resolutions.forEach { (_, resolve) -> resolve(promise) }
  rejection(promise)
  check(callback.invocations == listOf(CallbackInvocation("string", "first")))
}

fun main() {
  // The first string race and conversion rollback match Expo PR #51052's tests.
  // The other overloads and reversed race check the same real implementation.
  val cases = resolutions.map { (name, resolve) ->
    "reject while $name resolve is in progress" to { settlesOnceDuringCallback(resolve, rejection) }
  } + listOf(
    "resolve while reject is in progress" to { settlesOnceDuringCallback(rejection) { resolve("value") } },
    "reject while reject is in progress" to { settlesOnceDuringCallback(rejection, rejection) },
    "reject after resolve conversion throws" to ::rejectedAfterConversionFailure,
    "resolve after rejection conversion throws" to ::resolveAfterRejectionConversionFailure,
    "ignore all later sequential settlements" to ::ignoresSequentialSettlements,
  )
  var failures = 0
  cases.forEach { (name, run) ->
    try { run(); println("PASS: $name") }
    catch (error: Throwable) { failures++; System.err.println("FAIL: $name: ${error.message}") }
  }
  check(failures == 0) { "$failures of ${cases.size} actual-source Expo Promise regressions failed" }
  println("Expo Promise actual-source regressions: ${cases.size} passed")
}
