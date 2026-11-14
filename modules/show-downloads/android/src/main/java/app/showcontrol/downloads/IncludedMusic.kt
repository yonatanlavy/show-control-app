package app.showcontrol.downloads

import android.content.Context
import android.net.Uri
import android.os.StatFs
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/** Fixed packaged archive only. No network, transport or arbitrary file paths. */
internal object IncludedMusic {
  private data class Job(val id: String, val cancelled: AtomicBoolean = AtomicBoolean(false))
  private val admission = Any()
  @Volatile private var active: Job? = null
  private val leases = ConcurrentHashMap<String, Boolean>()
  private fun checkedId(id: String) { require(UUID.fromString(id).toString() == id) { "Included music archive request is invalid" } }
  private fun archive(context: Context, id: String): AtomicFile {
    checkedId(id)
    return AtomicFile(File(File(context.cacheDir, "showcontrol-included-music").apply { mkdirs() }, "$id.zip"))
  }
  private fun metadata(context: Context): JSONObject? {
    if (context.assets.list("showcontrol-music")?.contains("manifest.json") != true) return null
    val text = context.assets.open("showcontrol-music/manifest.json").bufferedReader().use { it.readText() }
    require(text.length <= 100_000) { "Included music archive manifest is invalid" }
    return JSONObject(text).also {
      require(it.getLong("bytes") in 22..4_000_000_000L && Regex("^[a-f0-9]{64}$").matches(it.getString("sha256"))) { "Included music archive manifest is invalid" }
    }
  }
  fun info(context: Context): Map<String, Any>? = metadata(context)?.let { value ->
    val hashes = value.getJSONArray("hashes")
    mapOf("version" to value.getString("version"), "songs" to value.getInt("songs"), "playlists" to value.getInt("playlists"), "bytes" to value.getLong("bytes"), "sha256" to value.getString("sha256"), "hashes" to (0 until hashes.length()).map { hashes.getString(it) })
  }
  fun prepare(context: Context, id: String, progress: (Long, Long) -> Unit): String {
    checkedId(id)
    val job = Job(id)
    synchronized(admission) { check(active == null && !leases.containsKey(id)) { "Included music archive is busy" }; active = job }
    var file: AtomicFile? = null
    var ready = false
    try {
      val destination = archive(context, id); file = destination
      val description = requireNotNull(metadata(context)) { "Included music archive is unavailable" }
      val total = description.getLong("bytes")
      val directory = destination.baseFile.parentFile!!
      // Only unleased old copies left by a terminated process; normal completion
      // and cancellation release their own exact UUID path immediately.
      directory.listFiles()?.filter { it.name.matches(Regex("[a-f0-9-]{36}\\.zip(?:\\.bak|\\.new)?")) && it.lastModified() < System.currentTimeMillis() - 86_400_000L && !leases.containsKey(it.name.substringBefore('.')) && !it.name.startsWith(id) }?.forEach { it.delete() }
      require(StatFs(context.cacheDir.path).availableBytes > total + 64_000_000L) { "Not enough free storage for included music" }
      val digest = MessageDigest.getInstance("SHA-256")
      val stream = destination.startWrite()
      try {
        context.assets.open("showcontrol-music/library.zip").use { input ->
          val buffer = ByteArray(262144); var done = 0L; var notified = 0L
          while (true) {
            check(!job.cancelled.get()) { "INCLUDED_MUSIC_CANCELLED" }
            val count = input.read(buffer); if (count < 0) break
            done += count; require(done <= total) { "Included music archive size changed" }
            stream.write(buffer, 0, count); digest.update(buffer, 0, count)
            if (done - notified >= 4_194_304L || done == total) { notified = done; runCatching { progress(done, total) } }
          }
          require(done == total && digest.digest().joinToString("") { "%02x".format(it) } == description.getString("sha256")) { "Included music archive checksum mismatch" }
        }
        check(!job.cancelled.get()) { "INCLUDED_MUSIC_CANCELLED" }
        destination.finishWrite(stream)
      } catch (error: Exception) { destination.failWrite(stream); throw error }
      check(!job.cancelled.get()) { "INCLUDED_MUSIC_CANCELLED" }
      leases[id] = true; ready = true
      return Uri.fromFile(destination.baseFile).toString()
    } finally {
      try { if (!ready) file?.delete() }
      finally { synchronized(admission) { if (active === job) active = null } }
    }
  }
  fun cancel(id: String) { active?.takeIf { it.id == id }?.cancelled?.set(true) }
  fun release(context: Context, id: String) {
    checkedId(id)
    check(active?.id != id) { "Included music archive is busy" }
    archive(context, id).delete(); leases.remove(id)
  }
}
