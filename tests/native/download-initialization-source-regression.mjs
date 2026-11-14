/* Actual Kotlin initialization/consumer methods on JVM; adapters do not perform Android, network or media work. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const option = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const androidPath = option('android-source', path.join(root, 'modules/show-downloads/android/src/main/java/app/showcontrol/downloads/DownloadRuntime.kt'));
const source = fs.readFileSync(androidPath, 'utf8');
function method(name, required = true) {
  const match = new RegExp(`^  (?:@Synchronized )?(?:private )?fun ${name}\\(`, 'm').exec(source);
  if (!match) { assert.ok(!required, `Missing production method: ${name}`); return ''; }
  const open = source.indexOf('{', match.index); let depth = 0; let state = 'code';
  for (let index = open; index < source.length; index++) {
    const char = source[index]; const next = source[index + 1];
    if (state === 'line') { if (char === '\n') state = 'code'; continue; }
    if (state === 'block') { if (char === '*' && next === '/') { state = 'code'; index++; } continue; }
    if (state === 'string' || state === 'char') { if (char === '\\') index++; else if (char === (state === 'string' ? '"' : "'")) state = 'code'; continue; }
    if (char === '/' && next === '/') { state = 'line'; index++; continue; }
    if (char === '/' && next === '*') { state = 'block'; index++; continue; }
    if (char === '"') { state = 'string'; continue; }
    if (char === "'") { state = 'char'; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(match.index, index + 1);
  }
  throw new Error(`Unterminated production method: ${name}`);
}
const names = ['initRuntime', 'cancel', 'jobs', 'search', 'execute', 'requireNotCancelled'];
const methods = Object.fromEntries(names.map((name) => [name, method(name, name !== 'requireNotCancelled')]));
const runtimeLock = source.match(/^  private val runtimeLock = Any\(\)\r?$/m)?.[0] ?? '';
const output = fs.mkdtempSync(path.join(root, '.native-check/download-initialization-source-'));
const harnessPath = path.join(output, 'InitializationHarness.kt');
const harness = String.raw`package app.showcontrol.downloads
import java.io.File
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.lang.management.ManagementFactory
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

class Context(val noBackupFilesDir: File) { val assets = Assets() }
class Assets { fun open(name: String) = ByteArrayInputStream(byteArrayOf()) }
class AtomicFile(file: File) {
  fun startWrite(): OutputStream = ByteArrayOutputStream()
  fun finishWrite(output: OutputStream) {}
  fun failWrite(output: OutputStream) {}
}
class JSONObject {
  companion object { val NULL = Any(); private val copies = ConcurrentHashMap<String, Map<String, Any?>>() }
  private val values = linkedMapOf<String, Any?>()
  constructor()
  constructor(copy: String) { values.putAll(copies[copy] ?: error("Unexpected JSON parsing beyond the modeled cancellation boundary")) }
  fun opt(key: String) = values[key]
  fun getString(key: String) = values[key] as? String ?: error("Missing fixture field: " + key)
  fun optString(key: String, fallback: String = "") = values[key] as? String ?: fallback
  fun optBoolean(key: String) = values[key] == true
  fun optDouble(key: String) = values[key] as? Double ?: Double.NaN
  fun optJSONArray(key: String): JSONArray? = null
  fun put(key: String, value: Any?): JSONObject { values[key] = value; return this }
  fun remove(key: String) = values.remove(key)
  fun snapshot(): Map<String, Any?> = values.toMap()
  override fun toString(): String { val key = UUID.randomUUID().toString(); copies[key] = values.toMap(); return key }
}
class JSONArray {
  fun put(value: JSONObject): JSONArray = this
  fun length() = 0
  fun optJSONObject(index: Int): JSONObject? = null
}
object Uri { fun fromFile(file: File) = file.toURI().toASCIIString() }
object AndroidProcess { const val THREAD_PRIORITY_BACKGROUND = 10; fun setThreadPriority(priority: Int) {} }
class ControlledInitializerReleased : RuntimeException()
object YoutubeDL {
  val entered = CountDownLatch(1); val release = CountDownLatch(1); val calls = AtomicInteger()
  fun init(context: Context) { calls.incrementAndGet(); entered.countDown(); check(release.await(10, TimeUnit.SECONDS)); throw ControlledInitializerReleased() }
}
object FFmpeg { fun init(context: Context) {} }
open class FixtureState {
  protected val MAX_BYTES = 500_000_000L
  protected val terminal = setOf("ready", "attached", "cancelled", "error", "interrupted")
  protected val records = linkedMapOf<String, JSONObject>()
  protected val cancellations = ConcurrentHashMap<String, AtomicBoolean>()
  protected val processes = ConcurrentHashMap<String, Unit>()
  protected var searching = false
  protected fun freeBytes(context: Context) = Long.MAX_VALUE
  protected fun validId(id: String) { check(UUID.fromString(id).toString() == id) }
  protected fun load(context: Context) {}
  protected fun save(context: Context) {}
  protected fun terminate(process: Unit) {}
  protected fun hasCompletedFile(context: Context, id: String, job: JSONObject) = false
  protected fun map(job: JSONObject) = job.snapshot()
  protected fun directory(context: Context, id: String): File {
    validId(id); val parent = context.noBackupFilesDir.canonicalFile
    val target = File(parent, id).canonicalFile
    check(target.parentFile == parent && !target.exists()) { "Only owned, absent fixture paths may reach cleanup" }; return target
  }
  protected fun update(context: Context, id: String, stage: String, percent: Double? = null, error: String? = null) { records[id]?.put("stage", stage) }
  fun seed(id: String) { records[id] = JSONObject().put("id", id).put("stage", "queued").put("url", "https://example.invalid/fixture") }
  fun stage(id: String) = records[id]?.optString("stage")
  fun requestOwnershipReleased() = !searching && cancellations.isEmpty()
}
class ActualInitialization : FixtureState() {
  // RUNTIME_LOCK
  // INIT_METHOD
  // CANCEL_METHOD
  // JOBS_METHOD
  fun initialize(context: Context) = initRuntime(context)
}
class ActualConsumers : FixtureState() {
  val entered = CountDownLatch(1); val release = CountDownLatch(1)
  val initCalls = AtomicInteger(); val urlCalls = AtomicInteger(); val runCalls = AtomicInteger()
  var urlFailure: Exception = IllegalStateException("UNEXPECTED_URL_WORK")
  var beforeUrlFailure: (() -> Unit)? = null
  private val executor = Executors.newSingleThreadExecutor { task -> Thread(task, "owned-worker-fixture").apply { isDaemon = true } }
  private fun initRuntime(context: Context) { initCalls.incrementAndGet(); entered.countDown(); check(release.await(10, TimeUnit.SECONDS)) }
  private fun checkUrl(raw: String): String { urlCalls.incrementAndGet(); beforeUrlFailure?.invoke(); throw urlFailure }
  private fun run(context: Context, id: String, args: List<String>, deadlineMs: Long, collect: Boolean, onLine: (String) -> Unit = {}): String { runCalls.incrementAndGet(); error("UNEXPECTED_PROCESS_WORK") }
  // CANCELLATION_METHOD
  // CANCEL_METHOD
  // SEARCH_METHOD
  // EXECUTE_METHOD
  fun close() { release.countDown(); executor.shutdown(); check(executor.awaitTermination(5, TimeUnit.SECONDS)) }
}
private fun observe(condition: () -> Boolean): Boolean {
  val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
  while (System.nanoTime() < deadline) { if (condition()) return true; Thread.sleep(1) }; return condition()
}
private var passed = 0
private var failed = 0
private fun result(name: String, actual: Boolean) { if (actual) { passed++; println("PASS " + name) } else { failed++; println("FAIL " + name) } }
fun main(args: Array<String>) {
  val context = Context(File(args.single()).canonicalFile)
  check(context.noBackupFilesDir.isDirectory)
  val id = "11111111-1111-4111-8111-111111111111"
  val state = ActualInitialization(); val errors = ConcurrentHashMap<String, Throwable>()
  val cancelDone = AtomicBoolean(); val jobsDone = AtomicBoolean()
  val init = Thread({ try { state.initialize(context) } catch (expected: ControlledInitializerReleased) {} catch (error: Throwable) { errors["init"] = error } }, "actual-init-owner")
  val second = Thread({ try { state.initialize(context) } catch (expected: ControlledInitializerReleased) {} catch (error: Throwable) { errors["second"] = error } }, "second-actual-init")
  val cancel = Thread({ try { state.cancel(context, id); cancelDone.set(true) } catch (error: Throwable) { errors["cancel"] = error } }, "actual-cancel-caller")
  val jobs = Thread({ try { state.jobs(context); jobsDone.set(true) } catch (error: Throwable) { errors["jobs"] = error } }, "actual-history-caller")
  val monitor = ManagementFactory.getThreadMXBean()
  var cancelBefore = false; var jobsBefore = false; var serialized = false
  init.start()
  try {
    check(YoutubeDL.entered.await(5, TimeUnit.SECONDS))
    cancel.start(); jobs.start(); second.start()
    check(observe {
      val c = monitor.getThreadInfo(cancel.id); val j = monitor.getThreadInfo(jobs.id); val s = monitor.getThreadInfo(second.id)
      val cSettled = cancelDone.get() || c?.threadState == Thread.State.BLOCKED && c.lockOwnerId == init.id
      val jSettled = jobsDone.get() || j?.threadState == Thread.State.BLOCKED && j.lockOwnerId == init.id
      cSettled && jSettled && s?.threadState == Thread.State.BLOCKED && s.lockOwnerId == init.id
    }) { "Caller state could not be observed deterministically" }
    cancelBefore = cancelDone.get(); jobsBefore = jobsDone.get()
    serialized = YoutubeDL.calls.get() == 1 && monitor.getThreadInfo(second.id)?.lockOwnerId == init.id
  } finally { YoutubeDL.release.countDown(); for (thread in listOf(init, second, cancel, jobs)) thread.join(5000) }
  check(errors.isEmpty() && listOf(init, second, cancel, jobs).none { it.isAlive }) { "Fixture failed or left workers alive: " + errors }
  result("Cancel returns while actual initializer dependency is blocked", cancelBefore)
  result("History returns while actual initializer dependency is blocked", jobsBefore)
  result("Complete actual initialization remains serialized", serialized && YoutubeDL.calls.get() == 2)

  val search = ActualConsumers(); val searchError = arrayOfNulls<Throwable>(1)
  val searchThread = Thread({ try { search.search(context, "https://example.invalid/fixture", id) } catch (error: Throwable) { searchError[0] = error } }, "actual-search-consumer")
  try {
    searchThread.start(); check(search.entered.await(5, TimeUnit.SECONDS)); search.cancel(context, id); search.release.countDown(); searchThread.join(5000)
    check(!searchThread.isAlive)
    result("Cancelled search stops after initialization before URL work", searchError[0]?.message == "DOWNLOAD_CANCELLED" && search.urlCalls.get() == 0 && search.runCalls.get() == 0)
  } finally { search.release.countDown(); searchThread.join(5000); search.close() }

  val worker = ActualConsumers(); val done = CountDownLatch(1)
  try {
    worker.seed(id); worker.execute(context, id) { done.countDown() }; check(worker.entered.await(5, TimeUnit.SECONDS)); worker.cancel(context, id); worker.release.countDown(); check(done.await(5, TimeUnit.SECONDS))
    result("Cancelled worker stops after initialization before URL work", worker.stage(id) == "cancelled" && worker.urlCalls.get() == 0 && worker.runCalls.get() == 0)
  } finally { worker.close() }

  val preSearch = ActualConsumers(); var preSearchError: Throwable? = null
  try {
    preSearch.release.countDown(); preSearch.cancel(context, id)
    try { preSearch.search(context, "https://example.invalid/fixture", id) } catch (error: Throwable) { preSearchError = error }
    result("Already cancelled search does not initialize or perform URL work", preSearchError?.message == "DOWNLOAD_CANCELLED" && preSearch.initCalls.get() == 0 && preSearch.urlCalls.get() == 0 && preSearch.runCalls.get() == 0)
  } finally { preSearch.close() }

  val preWorker = ActualConsumers(); val preDone = CountDownLatch(1)
  try {
    preWorker.release.countDown(); preWorker.seed(id); preWorker.cancel(context, id); preWorker.execute(context, id) { preDone.countDown() }; check(preDone.await(5, TimeUnit.SECONDS))
    result("Already cancelled worker does not initialize or perform URL work", preWorker.stage(id) == "cancelled" && preWorker.initCalls.get() == 0 && preWorker.urlCalls.get() == 0 && preWorker.runCalls.get() == 0)
  } finally { preWorker.close() }

  val failures: List<Pair<Exception, String>> = listOf(
    java.net.UnknownHostException("private-upstream-host") to "DOWNLOAD_SOURCE_FAILED",
    IllegalStateException("uncoded upstream diagnostic") to "DOWNLOAD_SOURCE_FAILED",
    IllegalArgumentException("DOWNLOAD_URL") to "DOWNLOAD_URL",
    IllegalStateException("DOWNLOAD_TIMEOUT") to "DOWNLOAD_TIMEOUT",
    IllegalStateException("DOWNLOAD_STORAGE") to "DOWNLOAD_STORAGE",
    IllegalStateException("DOWNLOAD_RUNTIME_MISSING") to "DOWNLOAD_RUNTIME_MISSING",
    IllegalStateException("DOWNLOAD_CANCELLED") to "DOWNLOAD_CANCELLED",
    IllegalStateException("DOWNLOAD_FUTURE_CODE") to "DOWNLOAD_FUTURE_CODE",
  )
  for ((failure, expected) in failures) {
    val request = ActualConsumers(); var observed: Throwable? = null
    try {
      request.release.countDown(); request.urlFailure = failure
      try { request.search(context, "https://example.invalid/fixture", id) } catch (error: Throwable) { observed = error }
      result("Search normalizes " + failure.javaClass.simpleName + " to " + expected + " and releases ownership", observed?.message == expected && request.requestOwnershipReleased())
    } finally { request.close() }
  }
  val cancelledLookup = ActualConsumers(); var cancelledLookupError: Throwable? = null
  try {
    cancelledLookup.release.countDown(); cancelledLookup.urlFailure = java.net.UnknownHostException("private-upstream-host")
    cancelledLookup.beforeUrlFailure = { cancelledLookup.cancel(context, id) }
    try { cancelledLookup.search(context, "https://example.invalid/fixture", id) } catch (error: Throwable) { cancelledLookupError = error }
    result("Accepted Cancel takes precedence over an uncoded lookup failure", cancelledLookupError?.message == "DOWNLOAD_CANCELLED" && cancelledLookup.requestOwnershipReleased())
  } finally { cancelledLookup.close() }
  println("casesPassed=" + passed); println("casesFailed=" + failed)
  check(passed + failed == 16 && failed == 0) { "Native initialization/cancellation regression" }
}
`;
const replacements = {
  '// RUNTIME_LOCK': runtimeLock,
  '// INIT_METHOD': methods.initRuntime,
  '// CANCEL_METHOD': methods.cancel,
  '// JOBS_METHOD': methods.jobs,
  '// CANCELLATION_METHOD': methods.requireNotCancelled,
  '// SEARCH_METHOD': methods.search,
  '// EXECUTE_METHOD': methods.execute,
};
let generated = harness;
for (const [key, value] of Object.entries(replacements)) generated = generated.replaceAll(key, () => value);
fs.writeFileSync(harnessPath, generated);
function findJar(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.endsWith('.jar')) return full;
    if (entry.isDirectory()) { const found = findJar(full); if (found) return found; }
  }
}
const cache = path.join(os.homedir(), '.gradle/caches/modules-2/files-2.1');
const jars = ['org.jetbrains.kotlin/kotlin-compiler-embeddable/2.1.20', 'org.jetbrains.kotlin/kotlin-stdlib/2.1.20', 'org.jetbrains.kotlin/kotlin-script-runtime/2.1.20', 'org.jetbrains.kotlin/kotlin-reflect/2.1.20', 'org.jetbrains.intellij.deps/trove4j', 'org.jetbrains/annotations', 'org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm/1.9.0'].map((entry) => { const found = findJar(path.join(cache, entry)); assert.ok(found, entry); return found; });
const java = option('java', 'C:/Program Files/Android/Android Studio/jbr/bin/java.exe');
const classpath = jars.join(path.delimiter); const classes = path.join(output, 'classes');
const compiled = spawnSync(java, ['-cp', classpath, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-nowarn', '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', classpath, '-d', classes, harnessPath], { encoding: 'utf8', timeout: 60000 });
fs.writeFileSync(path.join(output, 'compile.log'), `${compiled.stdout ?? ''}${compiled.stderr ?? ''}`);
assert.equal(compiled.status, 0, compiled.error ?? compiled.stderr);
const fixtures = path.join(output, 'owned-absent-fixtures'); fs.mkdirSync(fixtures);
const ran = spawnSync(java, ['-cp', [classes, classpath].join(path.delimiter), 'app.showcontrol.downloads.InitializationHarnessKt', fixtures], { encoding: 'utf8', timeout: 30000 });
fs.writeFileSync(path.join(output, 'run.log'), `${ran.stdout ?? ''}${ran.stderr ?? ''}`);
const result = {
  androidPath, sourceSha256: crypto.createHash('sha256').update(source).digest('hex').toUpperCase(),
  actualMethods: Object.fromEntries(Object.entries(methods).map(([name, text]) => [name, text ? crypto.createHash('sha256').update(text).digest('hex').toUpperCase() : null])),
  passed: Number(ran.stdout?.match(/casesPassed=(\d+)/)?.[1] ?? -1), failed: Number(ran.stdout?.match(/casesFailed=(\d+)/)?.[1] ?? -1),
  compileExitCode: compiled.status, runExitCode: ran.status, output,
  evidence: 'Actual Kotlin monitor methods and search/worker consumer bodies; JVM lock ownership; modeled initializer dependency; cancellation URL/process adapters fail if reached',
  limits: 'No Android APK executed, no native network/file runtime extraction benchmark, no ANR or cold-start attribution, no iOS claim',
};
fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
process.stdout.write(ran.stdout ?? ''); console.log(JSON.stringify(result));
assert.equal(ran.status, 0, ran.error ?? ran.stderr);
assert.equal(result.passed, 16); assert.equal(result.failed, 0);
