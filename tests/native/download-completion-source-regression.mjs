/* Production Android stage methods compiled on JVM; iOS policy/source checks do not replace Xcode. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const option = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const androidPath = option('android-source', path.join(root, 'modules/show-downloads/android/src/main/java/app/showcontrol/downloads/DownloadRuntime.kt'));
const source = fs.readFileSync(androidPath, 'utf8');
function method(signature, fallback) {
  const start = source.indexOf(signature);
  if (start < 0) { assert.ok(fallback, `Missing production method: ${signature}`); return fallback; }
  const open = source.indexOf('{', start); let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error('Unterminated production method');
}
const snippets = [
  method('  private fun clearIncomingCompletion(', '  private fun clearIncomingCompletion(job: JSONObject) {}'),
  method('  private fun hasCompletedFile(', '  private fun hasCompletedFile(context: Context, id: String, job: JSONObject) = false'),
  method('  @Synchronized fun cancelActiveTransfer(', '  @Synchronized fun cancelActiveTransfer(context: Context, id: String) = cancel(context, id)'),
  method('  @Synchronized fun cancel('), method('  @Synchronized fun complete('),
].join('\n');
const servicePath = option('service-source', path.join(root, 'modules/show-downloads/android/src/main/java/app/showcontrol/downloads/ShowDownloadService.kt'));
const service = fs.readFileSync(servicePath, 'utf8');
const ownership = service.match(/internal class DownloadServiceOwnership \{[\s\S]*?\n\}(?=\r?\n)/)?.[0];
assert.ok(ownership, 'Production service ownership policy must be extractable');
const output = fs.mkdtempSync(path.join(root, '.native-check/download-completion-source-'));
const harness = path.join(output, 'CompletionHarness.kt');
fs.writeFileSync(harness, `package app.showcontrol.downloads
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
class Context(val root: File)
class JSONObject {
  companion object { val NULL = Any() }
  private val values = mutableMapOf<String, Any?>()
  fun opt(key: String) = values[key]
  fun optString(key: String) = values[key] as? String ?: ""
  fun optBoolean(key: String) = values[key] == true
  fun put(key: String, value: Any?): JSONObject { values[key] = value; return this }
  fun remove(key: String) = values.remove(key)
}
object Uri { fun fromFile(file: File) = file.toURI().toASCIIString() }
class CompletionHarness {
  private val MAX_BYTES = 500_000_000L
  private val terminal = setOf("ready", "attached", "cancelled", "error", "interrupted")
  val records = linkedMapOf<String, JSONObject>()
  val cancellations = ConcurrentHashMap<String, AtomicBoolean>()
  val processes = mutableMapOf<String, Unit>()
  private fun validId(id: String) { require(java.util.UUID.fromString(id).toString() == id) }
  private fun load(context: Context) { }
  private fun save(context: Context) { }
  private fun terminate(process: Unit) { }
  private fun directory(context: Context, id: String): File {
    validId(id); val file = File(context.root, id).canonicalFile
    check(file.parentFile == context.root && !file.exists()) { "Fixture paths must be isolated, owned and absent" }; return file
  }
  fun ownedUri(context: Context, id: String) = Uri.fromFile(File(directory(context, id), "audio.mp3")).toString()
  fun seed(job: JSONObject) = clearIncomingCompletion(job)
${snippets}
}
${ownership}
`);
const findJar = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.endsWith('.jar')) return full;
    if (entry.isDirectory()) { const found = findJar(full); if (found) return found; }
  }
};
const cache = path.join(os.homedir(), '.gradle/caches/modules-2/files-2.1');
const jars = ['org.jetbrains.kotlin/kotlin-compiler-embeddable/2.1.20', 'org.jetbrains.kotlin/kotlin-stdlib/2.1.20', 'org.jetbrains.kotlin/kotlin-script-runtime/2.1.20', 'org.jetbrains.kotlin/kotlin-reflect/2.1.20', 'org.jetbrains.intellij.deps/trove4j', 'org.jetbrains/annotations', 'org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm/1.9.0'].map((entry) => { const found = findJar(path.join(cache, entry)); assert.ok(found, entry); return found; });
const java = option('java', 'C:/Program Files/Android/Android Studio/jbr/bin/java.exe');
const classpath = jars.join(path.delimiter); const classes = path.join(output, 'classes');
const compiled = spawnSync(java, ['-cp', classpath, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', classpath, '-d', classes, harness, path.join(root, 'tests/native/DownloadCompletionSourceRegression.kt')], { encoding: 'utf8' });
assert.equal(compiled.status, 0, compiled.error ?? compiled.stderr);
const ran = spawnSync(java, ['-cp', [classes, classpath].join(path.delimiter), 'app.showcontrol.downloads.DownloadCompletionSourceRegressionKt', path.join(output, 'fixtures')], { encoding: 'utf8' });
process.stdout.write(ran.stdout ?? '');
assert.equal(ran.status, 0, ran.error ?? ran.stderr);
assert.match(method('  @Synchronized fun start('), /clearIncomingCompletion\(job\)/, 'Native start must clear caller completion evidence');
const iosPath = option('ios-source', path.join(root, 'modules/show-downloads/ios/ShowDownloadsModule.swift'));
const ios = fs.readFileSync(iosPath, 'utf8');
const completion = ios.slice(ios.indexOf('  func complete('), ios.indexOf('  func remove('));
const policy = completion.match(/guard (records\[i\]\["stage"\][^\r\n]+),\r?\n\s*try hasCompletedFile/)?.[1];
assert.ok(policy, 'iOS complete must require validated native provenance');
const expression = policy.replaceAll('records[i]["stage"] as? String', 'stage').replaceAll('hasCancellationProvenance(records[i])', 'provenance');
assert.match(expression, /^[\w\s=|&"()]+$/, 'Only evaluate the actual restricted boolean policy');
const eligible = new Function('stage', 'provenance', `return (${expression});`);
for (const [stage, provenance, expected] of [['ready', false, true], ['cancelled', true, true], ['cancelled', false, false], ['downloading', true, false], ['queued', true, false]]) {
  assert.equal(eligible(stage, provenance), expected, `iOS provenance policy: ${stage}/${provenance}`);
}
assert.match(completion, /if records\[i\]\["stage"\] as\? String != "attached"/, 'iOS complete retains idempotent attached handling');
assert.match(ios, /CFGetTypeID\(flag\) == CFBooleanGetTypeID\(\) && flag.boolValue/, 'iOS provenance must be a strict true JSON boolean');
const register = ios.slice(ios.indexOf('  func register('), ios.indexOf('  func update('));
const stripped = register.match(/for key in \[([^\]]+)\] \{ job.removeValue\(forKey: key\) \}/)?.[1];
assert.ok(stripped, 'iOS registration must strip caller completion evidence');
for (const key of ['uri', 'bytes', 'cancelledAfterReady', 'errorCode', 'receiving']) assert.ok(stripped.includes(`"${key}"`));
assert.match(ios, /bytes\.isFinite, bytes >= 128, bytes <= Double\(maximum\), bytes\.rounded\(\.towardZero\) == bytes/);
assert.match(ios, /return job\["uri"\] as\? String == expected/);
assert.match(ios, /let expected = try directory\(id\)\.appendingPathComponent\("audio\.mp3"\)\.absoluteString/);
const transfer = ios.slice(ios.indexOf('didFinishDownloadingTo location:'), ios.indexOf('didCompleteWithError error:'));
assert.match(transfer, /records\[i\]\["uri"\] = file.absoluteString/);
assert.match(transfer, /records\[i\]\["bytes"\] = bytes/);
assert.match(transfer, /records\[i\]\["stage"\] = "ready"/);
assert.match(service, /ownership\.noteStart\(startId\)/);
assert.match(service, /DownloadRuntime\.cancelActiveTransfer\(applicationContext, id\)/);
assert.match(service, /ownership\.idleStopId\(\)\?\.let\(::stopSelf\)/);
assert.match(service, /main\.post \{\s*if \(wakeLocks\.remove\(wakeLock\) && wakeLock\.isHeld\) wakeLock\.release\(\)\s*ownership\.finish\(token\)\?\.let/);
console.log(JSON.stringify({ androidPath, servicePath, iosPath, cases: 9, actualMethodsExecuted: true, iosPolicyChecked: true, ioAdapters: 'observable doubles; owned absent fixture paths', androidApkExecuted: false, iosCompiled: false, output }));
