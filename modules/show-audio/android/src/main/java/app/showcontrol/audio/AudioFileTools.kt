package app.showcontrol.audio

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import androidx.core.net.toUri
import java.io.File
import java.nio.ByteOrder
import java.security.MessageDigest
import kotlin.math.abs
import kotlin.math.max

/** Bounded streaming inspection, hashing and PCM peak extraction. No media leaves the device. */
internal object AudioFileTools {
  private fun file(context: Context, uri: String): File {
    val parsed = uri.toUri()
    require(parsed.scheme == "file") { "A local file is required." }
    require(parsed.authority.isNullOrEmpty() || parsed.authority == "localhost") { "Remote file authorities are not local media." }
    val file = File(requireNotNull(parsed.path)).canonicalFile
    require(file.isFile && listOf(context.filesDir, context.cacheDir).any { file.path.startsWith(it.canonicalPath + File.separator) }) { "Media must be app owned." }
    return file
  }

  private fun extractor(context: Context, uri: String): Pair<MediaExtractor, MediaFormat> {
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(file(context, uri).path)
      val track = (0 until extractor.trackCount).firstOrNull { extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true } ?: error("No decodable audio track.")
      val format = extractor.getTrackFormat(track)
      extractor.selectTrack(track)
      return Pair(extractor, format)
    } catch (error: Exception) { extractor.release(); throw error }
  }

  fun probe(context: Context, uri: String): Map<String, Any> {
    val (extractor, format) = extractor(context, uri)
    try {
      val duration = format.getLong(MediaFormat.KEY_DURATION) / 1000
      require(duration > 0)
      return mapOf("durationMs" to duration, "codec" to (format.getString(MediaFormat.KEY_MIME) ?: "audio/unknown"), "channels" to format.getInteger(MediaFormat.KEY_CHANNEL_COUNT), "sampleRate" to format.getInteger(MediaFormat.KEY_SAMPLE_RATE))
    } finally { extractor.release() }
  }

  fun hash(context: Context, uri: String): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file(context, uri).inputStream().use { stream ->
      val chunk = ByteArray(128 * 1024)
      while (true) { val count = stream.read(chunk); if (count < 0) break; digest.update(chunk, 0, count) }
    }
    return digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
  }

  fun waveform(context: Context, uri: String, requested: Int): List<Double> {
    require(requested in 16..16384) { "Invalid peak resolution." }
    val (extractor, format) = extractor(context, uri)
    val decoder = MediaCodec.createDecoderByType(requireNotNull(format.getString(MediaFormat.KEY_MIME)))
    val peaks = DoubleArray(requested)
    var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
    val frameCount = max(1L, format.getLong(MediaFormat.KEY_DURATION) * format.getInteger(MediaFormat.KEY_SAMPLE_RATE) / 1_000_000)
    var frame = 0L
    var floatPcm = false
    try {
      decoder.configure(format, null, null, 0); decoder.start()
      var inputEnded = false
      var outputEnded = false
      var emptyPolls = 0
      val info = MediaCodec.BufferInfo()
      while (!outputEnded) {
        if (!inputEnded) {
          val index = decoder.dequeueInputBuffer(10_000)
          if (index >= 0) {
            val buffer = requireNotNull(decoder.getInputBuffer(index))
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) { decoder.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inputEnded = true }
            else { decoder.queueInputBuffer(index, 0, size, extractor.sampleTime, 0); extractor.advance() }
          }
        }
        val index = decoder.dequeueOutputBuffer(info, 10_000)
        if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          val output = decoder.outputFormat
          channels = output.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          floatPcm = output.containsKey(MediaFormat.KEY_PCM_ENCODING) && output.getInteger(MediaFormat.KEY_PCM_ENCODING) == 4
        } else if (index >= 0) {
          emptyPolls = 0
          val output = decoder.getOutputBuffer(index)?.order(ByteOrder.nativeOrder())
          if (output != null) {
            output.position(info.offset); output.limit(info.offset + info.size)
            val bytesPerFrame = channels * if (floatPcm) 4 else 2
            while (output.remaining() >= bytesPerFrame) {
              var peak = 0.0
              repeat(channels) { peak = max(peak, if (floatPcm) abs(output.float.toDouble()) else abs(output.short.toDouble()) / 32768) }
              val bucket = (frame * requested / frameCount).toInt().coerceIn(0, requested - 1)
              peaks[bucket] = max(peaks[bucket], peak.coerceIn(0.0, 1.0)); frame += 1
            }
          }
          outputEnded = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
          decoder.releaseOutputBuffer(index, false)
        } else {
          emptyPolls += 1
          require(emptyPolls < 3000) { "Audio decoding stopped responding." }
        }
      }
      require(frame > 0) { "Audio has no decoded samples." }
      return peaks.toList()
    } finally { runCatching { decoder.stop() }; decoder.release(); extractor.release() }
  }
}
