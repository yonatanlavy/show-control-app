/* This exercises the actual Android method on the JVM and the actual iOS
 * selection closure as a pure policy. It is not an iOS build/audio substitute. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const option = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const androidPath = option('android-source', path.join(root, 'modules/show-audio/android/src/main/java/app/showcontrol/audio/ShowAudioService.kt'));
const iosPath = option('ios-source', path.join(root, 'modules/show-audio/ios/ShowAudioModule.swift'));
const cache = path.join(os.homedir(), '.gradle/caches/modules-2/files-2.1');
const findJar = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.endsWith('.jar')) return full;
    if (entry.isDirectory()) { const found = findJar(full); if (found) return found; }
  }
};
const checks = [];

try {
  const source = fs.readFileSync(androidPath, 'utf8');
  const method = source.match(/  private fun seekRehearsal\(cueId: String, positionMs: Long\) \{[\s\S]*?\n  \}(?=\r?\n)/)?.[0];
  assert.ok(method, 'Production Android seek method must be extractable');
  const output = fs.mkdtempSync(path.join(root, '.native-check/rehearsal-seek-source-'));
  const harnessPath = path.join(output, 'RehearsalSeekHarness.kt');
  fs.writeFileSync(harnessPath, `package app.showcontrol.audio
internal class RehearsalSeekHarness(initial: List<SeekVoice>, private val mainVoiceId: String?) {
  private val voices = initial.associateBy { it.id }
  fun seek(cueId: String, positionMs: Long) = seekRehearsal(cueId, positionMs)
${method}
}
`);
  const jars = [
    'org.jetbrains.kotlin/kotlin-compiler-embeddable/2.1.20',
    'org.jetbrains.kotlin/kotlin-stdlib/2.1.20',
    'org.jetbrains.kotlin/kotlin-script-runtime/2.1.20',
    'org.jetbrains.kotlin/kotlin-reflect/2.1.20',
    'org.jetbrains.intellij.deps/trove4j',
    'org.jetbrains/annotations',
    'org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm/1.9.0',
  ].map((entry) => { const found = findJar(path.join(cache, entry)); assert.ok(found, `Missing cached compiler jar: ${entry}`); return found; });
  const java = option('java', 'C:/Program Files/Android/Android Studio/jbr/bin/java.exe');
  const classpath = jars.join(path.delimiter);
  const classes = path.join(output, 'classes');
  const compiled = spawnSync(java, ['-cp', classpath, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
    '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', classpath, '-d', classes,
    path.join(root, 'modules/show-audio/android/src/main/java/app/showcontrol/audio/TransportIdentity.kt'),
    path.join(root, 'modules/show-audio/android/src/main/java/app/showcontrol/audio/SourcePositions.kt'),
    path.join(root, 'tests/native/RehearsalSeekSourceRegression.kt'), harnessPath], { encoding: 'utf8' });
  assert.equal(compiled.status, 0, `Android extracted method compilation failed: ${compiled.error ?? compiled.stderr}`);
  const ran = spawnSync(java, ['-cp', [classes, classpath].join(path.delimiter), 'app.showcontrol.audio.RehearsalSeekSourceRegressionKt'], { encoding: 'utf8' });
  process.stdout.write(ran.stdout ?? '');
  assert.equal(ran.status, 0, `Android production method regression failed: ${ran.error ?? ran.stderr}`);
  checks.push({ platform: 'Android', result: 'pass', evidence: 'Production seek method compiled and executed on JVM; playback handles are observable doubles' });
} catch (error) {
  checks.push({ platform: 'Android', result: 'fail', detail: String(error) });
}

try {
  const source = fs.readFileSync(iosPath, 'utf8');
  const method = source.match(/  private func seek\(_ command: \[String: Any\]\) -> Bool \{([\s\S]*?)\n  \}(?=\r?\n)/)?.[1];
  assert.ok(method, 'Production iOS seek method must be extractable');
  const closure = method.match(/let selected = voices.values.filter \{ ([^\r\n]+) \}/)?.[1];
  assert.ok(closure, 'Production iOS seek target closure must be extractable');
  // Only normalize Swift closure shorthand; evaluate its real boolean policy.
  assert.match(closure, /^[\w\s.$=|&()]+$/, 'Keep policy extraction restricted to boolean/identity expressions');
  const select = new Function('voice', 'cueId', 'mainVoiceId', 'previewMode', `return (${closure.replaceAll('$0.', 'voice.')});`);
  const primary = { id: 'primary', cueId: 'shared', mainTransport: true };
  const hit = { id: 'hit', cueId: 'shared', mainTransport: false };
  const outgoing = { id: 'outgoing', cueId: 'shared', mainTransport: true };
  const other = { id: 'other', cueId: 'other', mainTransport: true };
  const voices = [primary, hit, outgoing, other];
  assert.deepEqual(voices.filter((voice) => select(voice, 'shared', 'primary', false)), [primary], 'iOS main seek must isolate same-ID Hit/outgoing');
  assert.deepEqual([hit].filter((voice) => select(voice, 'shared', null, false)), [], 'iOS Hit-only seek must refuse');
  assert.deepEqual(voices.filter((voice) => select(voice, 'shared', 'other', false)), [], 'iOS other-current seek must refuse');
  assert.equal(select(hit, 'shared', 'hit', false), false, 'iOS ownership must be required even with matching identity');
  assert.deepEqual([hit, other].filter((voice) => select(voice, 'shared', null, true)), [hit], 'iOS preview seek must remain available to isolated non-main audition');
  assert.match(method, /guard !selected.isEmpty else \{\s*fault\("SEEK_TARGET_INACTIVE"[\s\S]*?return false/, 'Inactive iOS seek must refuse without ACK');
  assert.match(source, /case "SEEK_REHEARSAL":\s*guard sessionPurpose == "rehearsal", !previewMode/, 'iOS rehearsal dispatch must exclude audition mode');
  assert.match(source, /Function\("seekPreview"\)[\s\S]*?guard self.previewMode[\s\S]*?self.seek\(/, 'Isolated iOS preview must still use the validated shared seek path');
  checks.push({ platform: 'iOS', result: 'pass', evidence: 'Actual selection closure policy executed, including isolated preview; inactive refusal and dispatch scope inspected. Swift/AVFoundation compilation not available on this Windows host' });
} catch (error) {
  checks.push({ platform: 'iOS', result: 'fail', detail: String(error) });
}

console.log(JSON.stringify({ androidPath, iosPath, checks }, null, 2));
process.exitCode = checks.every((check) => check.result === 'pass') ? 0 : 1;
