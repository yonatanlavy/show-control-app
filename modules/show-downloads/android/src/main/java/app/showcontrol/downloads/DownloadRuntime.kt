package app.showcontrol.downloads

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process as AndroidProcess
import android.os.SystemClock
import android.os.StatFs
import android.util.AtomicFile
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.InetAddress
import java.net.URI
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Preparation only. This module has no audio/transport interface. */
internal object DownloadRuntime {
  private const val MAX_BYTES = 500_000_000L
  private val terminal = setOf("ready", "attached", "cancelled", "error", "interrupted")
  private val executor = Executors.newSingleThreadExecutor()
  // Runtime extraction/hashing must remain serialized without holding the
  // records monitor needed by synchronous Cancel and history observations.
  private val runtimeLock = Any()
  private val records = linkedMapOf<String, JSONObject>()
  private var loaded = false
  private var searching = false
  private val processes = ConcurrentHashMap<String, java.lang.Process>()
  private val cancellations = ConcurrentHashMap<String, AtomicBoolean>()
  private fun root(context: Context) = File(context.filesDir, "showcontrol-downloads").apply { mkdirs() }
  private fun freeBytes(context: Context) = StatFs(root(context).path).availableBytes
  private fun validId(id: String) { require(Regex("^[a-f0-9-]{36}$").matches(id) && UUID.fromString(id).toString() == id) { "DOWNLOAD_INVALID" } }
  private fun directory(context: Context, id: String): File { validId(id); val parent = root(context).canonicalFile; return File(parent, id).canonicalFile.also { check(it.parentFile == parent) } }
  @Synchronized private fun load(context: Context) {
    if (loaded) return
    val file = AtomicFile(File(root(context), "jobs.json"))
    if (file.baseFile.exists()) {
      val text = file.openRead().use { it.readBytes() }; require(text.size < 2_000_000) { "DOWNLOAD_INVALID" }
      val values = JSONArray(String(text, Charsets.UTF_8))
      for (i in 0 until values.length()) { val job = values.getJSONObject(i); validId(job.getString("id")); if (!terminal.contains(job.getString("stage"))) { job.put("stage", "interrupted").put("errorCode", "DOWNLOAD_INTERRUPTED") }; records[job.getString("id")] = job }
    }
    loaded = true; save(context)
  }
  @Synchronized private fun save(context: Context) {
    val file = AtomicFile(File(root(context), "jobs.json")); val stream = file.startWrite()
    try { stream.write(JSONArray(records.values.toList()).toString().toByteArray(Charsets.UTF_8)); file.finishWrite(stream) } catch (error: Exception) { file.failWrite(stream); throw error }
  }
  @Synchronized private fun update(context: Context, id: String, stage: String, percent: Double? = null, error: String? = null) {
    val job = records[id] ?: return
    if (job.optString("stage") == "cancelled") return
    job.put("stage", stage).put("percent", percent ?: JSONObject.NULL)
    if (error != null) job.put("errorCode", error)
    save(context)
  }
  private fun map(value: JSONObject): Map<String, Any?> = value.keys().asSequence().associateWith { key -> value.opt(key).takeUnless { it == JSONObject.NULL } }
  @Synchronized fun jobs(context: Context): List<Map<String, Any?>> { load(context); return records.values.map(::map) }
  private fun clearIncomingCompletion(job: JSONObject) {
    // Finished-file evidence belongs to the runtime, never to start() input.
    for (key in listOf("uri", "bytes", "cancelledAfterReady", "errorCode", "receiving")) job.remove(key)
  }
  private fun hasCompletedFile(context: Context, id: String, job: JSONObject): Boolean {
    val bytes = (job.opt("bytes") as? Number)?.toDouble() ?: return false
    return bytes.isFinite() && bytes >= 128 && bytes <= MAX_BYTES && bytes == bytes.toLong().toDouble() &&
      job.optString("uri") == Uri.fromFile(File(directory(context, id), "audio.mp3")).toString()
  }
  @Synchronized fun start(context: Context, json: String): Map<String, Any?> {
    load(context); require(json.length <= 8192) { "DOWNLOAD_INVALID" }
    require(!searching && records.values.none { !terminal.contains(it.getString("stage")) } && processes.isEmpty()) { "DOWNLOAD_BUSY" }
    require(records.size < 200) { "DOWNLOAD_HISTORY_FULL" }
    val job = JSONObject(json); val id = job.getString("id"); validId(id)
    clearIncomingCompletion(job)
    require(!records.containsKey(id)) { "DOWNLOAD_INVALID" }
    // Network/DNS validation runs on the worker, never the JS/audio thread.
    require(job.getString("url").length <= 4096 && job.getString("title").length in 1..200) { "DOWNLOAD_INVALID" }
    for (key in listOf("showId", "setId", "category")) require(job.getString(key).length in 1..256) { "DOWNLOAD_INVALID" }
    require(freeBytes(context) > 256_000_000) { "DOWNLOAD_STORAGE" }
    job.put("stage", "queued").put("percent", JSONObject.NULL)
    records[id] = job; cancellations[id] = AtomicBoolean(false); save(context)
    try {
      val intent = Intent(context, ShowDownloadService::class.java).putExtra("id", id)
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
    } catch (error: Exception) { records.remove(id); cancellations.remove(id); save(context); throw error }
    return map(job)
  }
  private fun checkUrl(raw: String): String {
    require(raw.length in 1..4096 && raw.none { it.code < 32 }) { "DOWNLOAD_URL" }
    val url = URI(raw)
    require(url.scheme == "https" && url.userInfo == null && url.host != null && (url.port == -1 || url.port == 443)) { "DOWNLOAD_URL" }
    val host = url.host.lowercase()
    require(host != "localhost" && !host.endsWith(".local") && !host.endsWith(".localhost")) { "DOWNLOAD_URL" }
    val addresses = InetAddress.getAllByName(host)
    require(addresses.isNotEmpty() && addresses.none { it.isAnyLocalAddress || it.isLoopbackAddress || it.isLinkLocalAddress || it.isSiteLocalAddress || it.isMulticastAddress || it.hostAddress?.startsWith("fc") == true || it.hostAddress?.startsWith("fd") == true }) { "DOWNLOAD_URL" }
    return url.toASCIIString()
  }
  private fun initRuntime(context: Context) = synchronized(runtimeLock) {
    require(freeBytes(context) > 256_000_000) { "DOWNLOAD_STORAGE" }; YoutubeDL.init(context); FFmpeg.init(context)
    val runtime = File(context.noBackupFilesDir, "showcontrol-yt-dlp")
    fun hash(file: File): String { val digest = MessageDigest.getInstance("SHA-256"); file.inputStream().use { stream -> val bytes = ByteArray(65536); while (true) { val count = stream.read(bytes); if (count < 0) break; digest.update(bytes, 0, count) } }; return digest.digest().joinToString("") { "%02x".format(it) } }
    val expected = "1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6"
    if (!runtime.exists() || hash(runtime) != expected) {
      val atomic = AtomicFile(runtime); val output = atomic.startWrite()
      try { context.assets.open("showcontrol-yt-dlp").use { it.copyTo(output) }; atomic.finishWrite(output) } catch (error: Exception) { atomic.failWrite(output); throw error }
      require(hash(runtime) == expected) { "DOWNLOAD_RUNTIME_MISSING" }
    }
  }
  private fun requireNotCancelled(id: String) {
    if (cancellations[id]?.get() == true) throw IllegalStateException("DOWNLOAD_CANCELLED")
  }
  private fun command(context: Context, args: List<String>): ProcessBuilder {
    val bin = File(context.applicationInfo.nativeLibraryDir); val base = File(context.noBackupFilesDir, "youtubedl-android")
    val python = File(bin, "libpython.so"); val script = File(context.noBackupFilesDir, "showcontrol-yt-dlp")
    require(python.exists() && script.exists() && File(bin, "libffmpeg.so").exists()) { "DOWNLOAD_RUNTIME_MISSING" }
    val common = mutableListOf("--ignore-config", "--no-cache-dir", "--no-playlist", "--no-warnings", "--socket-timeout", "15", "--retries", "1", "--extractor-retries", "1", "--ffmpeg-location", File(bin, "libffmpeg.so").path)
    val qjs = File(bin, "libqjs.so"); if (qjs.exists()) common.addAll(listOf("--js-runtimes", "quickjs:${qjs.path}"))
    return ProcessBuilder(listOf(python.path, script.path) + common + args).redirectErrorStream(true).apply {
      environment()["LD_LIBRARY_PATH"] = File(base, "packages/python/usr/lib").path + ":" + File(base, "packages/ffmpeg/usr/lib").path
      environment()["SSL_CERT_FILE"] = File(base, "packages/python/usr/etc/tls/cert.pem").path
      environment()["PYTHONHOME"] = File(base, "packages/python/usr").path
      environment()["TMPDIR"] = context.cacheDir.path
      environment()["PATH"] = (System.getenv("PATH") ?: "") + ":" + bin.path
    }
  }
  // Supervise our own process so cancellation kills FFmpeg children as well as Python.
  private fun terminate(process: java.lang.Process) {
    val pid = Regex("pid=(\\d+)").find(process.toString())?.groupValues?.get(1)?.toIntOrNull()
    fun killChildren(parent: Int, depth: Int) {
      if (depth > 8) return
      val children = runCatching { File("/proc/$parent/task/$parent/children").readText().trim().split(' ').mapNotNull(String::toIntOrNull) }.getOrDefault(emptyList())
      for (child in children) {
        val uid = runCatching { Regex("(?m)^Uid:\\s+(\\d+)").find(File("/proc/$child/status").readText())?.groupValues?.get(1)?.toIntOrNull() }.getOrNull()
        if (uid == AndroidProcess.myUid()) { killChildren(child, depth + 1); AndroidProcess.killProcess(child) }
      }
    }
    if (pid != null) killChildren(pid, 0)
    process.destroy()
  }
  private fun run(context: Context, id: String, args: List<String>, deadlineMs: Long, collect: Boolean, onLine: (String) -> Unit = {}): String {
    val cancelled = cancellations.computeIfAbsent(id) { AtomicBoolean(false) }
    if (cancelled.get()) throw IllegalStateException("DOWNLOAD_CANCELLED")
    val proxy = PublicNetworkProxy()
    val process = try { command(context, listOf("--proxy", "http://127.0.0.1:" + proxy.port, "--downloader", "native") + args).start() } catch (error: Exception) { proxy.close(); throw error }; processes[id] = process
    if (cancelled.get()) terminate(process)
    val started = SystemClock.elapsedRealtime(); val timedOut = AtomicBoolean(false); val oversized = AtomicBoolean(false); val lowStorage = AtomicBoolean(false)
    val monitor = Executors.newSingleThreadScheduledExecutor()
    monitor.scheduleWithFixedDelay({
      if (SystemClock.elapsedRealtime() - started > deadlineMs) { timedOut.set(true); terminate(process) }
      val dir = directory(context, id)
      if (dir.exists() && (dir.listFiles()?.sumOf { it.length() } ?: 0) > MAX_BYTES) { oversized.set(true); terminate(process) }
      if (freeBytes(context) < 32_000_000) { lowStorage.set(true); terminate(process) }
      if (cancelled.get()) terminate(process)
    }, 1, 1, TimeUnit.SECONDS)
    val output = StringBuilder(); val line = StringBuilder()
    try {
      process.inputStream.bufferedReader().use { reader ->
        val chars = CharArray(4096)
        while (true) { val count = reader.read(chars); if (count < 0) break
          for (i in 0 until count) { val ch = chars[i]; if (collect) { require(output.length < 2_000_000) { "DOWNLOAD_INVALID" }; output.append(ch) }
            if (ch == '\n' || ch == '\r') { if (line.isNotEmpty()) onLine(line.toString()); line.setLength(0) } else if (line.length < 8192) line.append(ch)
          }
        }
      }
      val exit = process.waitFor()
      if (cancelled.get()) throw IllegalStateException("DOWNLOAD_CANCELLED")
      require(!timedOut.get()) { "DOWNLOAD_TIMEOUT" }; require(!oversized.get()) { "DOWNLOAD_SIZE" }; require(!lowStorage.get()) { "DOWNLOAD_STORAGE" }
      require(exit == 0) { "DOWNLOAD_SOURCE_FAILED" }
      return output.toString()
    } finally { monitor.shutdownNow(); terminate(process); proxy.close(); processes.remove(id) }
  }
  fun search(context: Context, query: String, id: String): List<Map<String, Any?>> {
    validId(id); require(query.trim().length in 2..500 && query.none { it.code < 32 }) { "DOWNLOAD_INVALID" }
    synchronized(this) { load(context); require(!searching && processes.isEmpty() && records.values.none { !terminal.contains(it.getString("stage")) }) { "DOWNLOAD_BUSY" }; searching = true; cancellations.computeIfAbsent(id) { AtomicBoolean(false) } }
    try {
      requireNotCancelled(id)
      initRuntime(context)
      requireNotCancelled(id)
      val input = if (query.startsWith("https://")) checkUrl(query.trim()) else { require(!query.contains("://") && !query.startsWith("-")) { "DOWNLOAD_URL" }; "ytsearch5:${query.trim()}" }
      val raw = run(context, id, listOf("--skip-download", "--dump-single-json", "--flat-playlist", "--playlist-end", "5", "--", input), 90_000, true)
      val json = JSONObject(raw.substringAfter('{').let { "{$it" }); val entries = json.optJSONArray("entries") ?: JSONArray().put(json)
      return (0 until minOf(entries.length(), 5)).mapNotNull { index ->
        val item = entries.optJSONObject(index) ?: return@mapNotNull null
        if (item.optBoolean("is_live")) return@mapNotNull null
        val url = item.optString("webpage_url").ifBlank { item.optString("url") }
        val checked = runCatching { checkUrl(url) }.getOrNull() ?: return@mapNotNull null
        mapOf("url" to checked, "title" to item.optString("title", "Audio").take(200), "uploader" to item.optString("uploader", item.optString("channel")).take(200), "durationSeconds" to item.optDouble("duration").takeIf { it.isFinite() && it > 0 })
      }
    } catch (error: Exception) {
      requireNotCancelled(id)
      val code = error.message?.takeIf { it.startsWith("DOWNLOAD_") } ?: "DOWNLOAD_SOURCE_FAILED"
      throw IllegalStateException(code)
    } finally { synchronized(this) { searching = false }; cancellations.remove(id) }
  }
  fun execute(context: Context, id: String, done: () -> Unit) {
    executor.execute {
      AndroidProcess.setThreadPriority(AndroidProcess.THREAD_PRIORITY_BACKGROUND)
      try {
        validId(id); val job = synchronized(this) { records[id]?.let { JSONObject(it.toString()) } } ?: return@execute
        if (cancellations[id]?.get() == true) return@execute
        initRuntime(context); requireNotCancelled(id)
        val url = checkUrl(job.getString("url")); val dir = directory(context, id); dir.mkdirs()
        update(context, id, "resolving")
        run(context, id, listOf("-f", "bestaudio/best", "-x", "--audio-format", "mp3", "--audio-quality", "0", "--max-filesize", MAX_BYTES.toString(), "--match-filter", "!is_live & duration<=?7200", "--no-continue", "--newline", "--progress-template", "download:SC_PROGRESS:%(progress.downloaded_bytes)s:%(progress.total_bytes_estimate)s", "-o", File(dir, "audio.%(ext)s").path, "--", url), 1_200_000, false) { line ->
          if (line.contains("[ExtractAudio]")) update(context, id, "extracting")
          else if (line.startsWith("SC_PROGRESS:")) {
            val values = line.split(':'); val bytes = values.getOrNull(1)?.toDoubleOrNull(); val total = values.getOrNull(2)?.toDoubleOrNull()
            update(context, id, "downloading", if (bytes != null && total != null && total > 0) (bytes * 100 / total).coerceIn(0.0, 100.0) else null)
          }
        }
        val file = File(dir, "audio.mp3"); require(file.exists() && file.length() in 128..MAX_BYTES) { "DOWNLOAD_SOURCE_FAILED" }
        synchronized(this) { val current = records[id] ?: return@synchronized
          if (cancellations[id]?.get() != true) { current.put("uri", Uri.fromFile(file).toString()).put("bytes", file.length()); update(context, id, "ready", 100.0) }
        }
      } catch (error: Exception) {
        val code = error.message?.takeIf { it.startsWith("DOWNLOAD_") } ?: "DOWNLOAD_SOURCE_FAILED"
        if (cancellations[id]?.get() != true) update(context, id, "error", error = code)
      } finally {
        val stage = synchronized(this) { records[id]?.optString("stage") }
        if (stage != "ready" && stage != "attached") directory(context, id).deleteRecursively()
        cancellations.remove(id); done()
      }
    }
  }
  @Synchronized fun cancelActiveTransfer(context: Context, id: String) {
    validId(id); load(context)
    val job = records[id] ?: return
    // A notification cancels its transfer, not a later attachment or another job.
    if (terminal.contains(job.optString("stage"))) return
    cancel(context, id)
  }
  @Synchronized fun cancel(context: Context, id: String) {
    validId(id); load(context)
    val job = records[id]
    if (job?.optString("stage") == "attached") return
    if (job != null) {
      if (job.optString("stage") == "ready" && hasCompletedFile(context, id, job)) job.put("cancelledAfterReady", true)
      else if (job.optString("stage") != "cancelled") job.remove("cancelledAfterReady")
    }
    cancellations.computeIfAbsent(id) { AtomicBoolean(false) }.set(true); processes[id]?.let(::terminate)
    if (job != null) { job.put("stage", "cancelled").put("percent", JSONObject.NULL); save(context) }
  }
  @Synchronized fun complete(context: Context, id: String) {
    load(context); val job = records[id] ?: return
    val stage = job.optString("stage")
    // SQL already committed. A late Cancel may have removed staging bytes;
    // only runtime-issued completed-file provenance can supersede it.
    require(stage == "attached" || (stage == "ready" || stage == "cancelled" && job.opt("cancelledAfterReady") == true) && hasCompletedFile(context, id, job)) { "DOWNLOAD_INVALID" }
    job.put("stage", "attached"); job.remove("cancelledAfterReady"); save(context); directory(context, id).deleteRecursively()
  }
  @Synchronized fun remove(context: Context, id: String) { load(context); require(records[id]?.optString("stage") in terminal && !processes.containsKey(id)) { "DOWNLOAD_BUSY" }; directory(context, id).deleteRecursively(); records.remove(id); save(context) }
}
