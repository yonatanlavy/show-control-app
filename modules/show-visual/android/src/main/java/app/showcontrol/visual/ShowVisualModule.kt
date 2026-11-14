package app.showcontrol.visual

import android.app.Presentation
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.BitmapFactory
import android.graphics.Color
import android.hardware.display.DisplayManager
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Display
import android.view.Gravity
import android.view.SurfaceView
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import app.showcontrol.audio.NativeRemoteCoordinator
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Queues
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException

class ShowVisualModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  @Volatile private var destroyed = false
  private var enabled = false
  private var fallback: String? = null
  private var snapshot = JSONObject()
  private var presentation: AudiencePresentation? = null
  private var manager: DisplayManager? = null
  private var currentCue = ""
  private var latestRunState = JSONObject()
  private var actualStart: JSONObject? = null
  private var actualSourceMs: Long? = null
  private var receiverRegistered = false
  private var detail = "External display is disabled"
  private var errorCode: String? = null
  private var testing = false
  private val barrier = VisualEventBarrier()
  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == "app.showcontrol.RUN_STATE") {
        val data = intent.getStringExtra("event") ?: return
        handler.post { runCatching { update(JSONObject(data)) }.onFailure { fail("Visual state could not be reconciled") } }
      }
    }
  }
  private val displays = object : DisplayManager.DisplayListener {
    override fun onDisplayAdded(displayId: Int) { handler.post { connect(); emit() } }
    override fun onDisplayRemoved(displayId: Int) { handler.post { if (presentation?.display?.displayId == displayId) { resetVisualState(); closeOutput(); enabled = false; detail = "Display disconnected; confirm output before reconnecting" }; emit() } }
    override fun onDisplayChanged(displayId: Int) { handler.post { if (presentation?.display?.displayId == displayId) { resetVisualState(); closeOutput(); enabled = false; detail = "Display mode changed; confirm output before reconnecting" }; emit() } }
  }
  override fun definition() = ModuleDefinition {
    Name("ShowVisual")
    Events("onVisualStatus")
    OnCreate {
      val context = appContext.reactContext ?: return@OnCreate
      manager = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
      manager?.registerDisplayListener(displays, handler)
      val filter = IntentFilter("app.showcontrol.RUN_STATE")
      ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
      receiverRegistered = true
      handler.post { connect() }
    }
    AsyncFunction("configure") { json: String ->
      NativeRemoteCoordinator.requireIdle()
      check(!destroyed) { "VISUAL_CLOSED" }
      val settings = JSONObject(json)
      val candidate = settings.optString("fallbackUri").takeIf { it.isNotEmpty() }?.also { localFile(it) }
      resetVisualState(); errorCode = null
      enabled = settings.optBoolean("enabled", false); fallback = candidate
      if (enabled) { if (presentation != null) detail = "Audience output ready"; connect() } else { closeOutput(); detail = "External display is disabled" }; emit()
      status()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("prepare") { json: String ->
      check(!destroyed) { "VISUAL_CLOSED" }
      val value = JSONObject(json)
      value.optJSONObject("visualAssets")?.let { assets -> for (id in assets.keys()) localFile(assets.getJSONObject(id).getString("localUri")) }
      snapshot = value
      resetVisualState()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("getStatus") { status() }.runOnQueue(Queues.MAIN)
    AsyncFunction("testPattern") { json: String ->
      NativeRemoteCoordinator.requireIdle()
      check(!destroyed) { "VISUAL_CLOSED" }
      val labels = JSONObject(json)
      require(enabled && presentation != null) { "VISUAL_NO_DISPLAY: Enable an external audience display before testing." }
      val title = labels.getString("title"); val caption = labels.getString("caption")
      require(title.length in 1..256 && caption.length in 1..512)
      resetVisualState(); presentation?.testPattern(title, caption); testing = true; errorCode = null
      detail = "Silent display test is active"; emit(); status()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("endTestPattern") { if (testing) { resetVisualState(); emit() } }.runOnQueue(Queues.MAIN)
    AsyncFunction("blackout") { resetVisualState(); emit() }.runOnQueue(Queues.MAIN)
    AsyncFunction("probeVisual") { uri: String -> probe(uri) }
    OnDestroy {
      destroyed = true
      val context = appContext.reactContext
      if (receiverRegistered) runCatching { context?.unregisterReceiver(receiver) }
      manager?.unregisterDisplayListener(displays)
      handler.post { closeOutput() }
    }
  }
  private fun status(): Map<String, Any> = mapOf("available" to true, "enabled" to enabled, "displayDetected" to (manager?.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)?.isNotEmpty() == true), "connected" to (presentation != null), "testing" to testing, "detail" to detail) + (errorCode?.let { mapOf("errorCode" to it) } ?: emptyMap())
  private fun emit() { if (!destroyed) sendEvent("onVisualStatus", status()) }
  private fun connect() {
    if (destroyed || !enabled || presentation != null) return
    val context = appContext.currentActivity ?: appContext.reactContext ?: return
    val display = manager?.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)?.firstOrNull()
    if (display == null) { detail = "No presentation-capable external display detected"; emit(); return }
    try {
      presentation = AudiencePresentation(context, display) { fail("Visual decoder failed; audio remains active", "decoderFailed") }.also { it.show(); it.blackout() }
      detail = "External audience output connected; hardware verification required"
    } catch (_: RuntimeException) { presentation = null; detail = "External display is unavailable; audio remains active"; errorCode = "displayUnavailable" }
    emit()
    restoreActualVisual()
  }
  private fun closeOutput() { presentation?.let { runCatching { it.release() }; runCatching { it.dismiss() } }; presentation = null }
  private fun fail(message: String, code: String = "mediaUnavailable") { resetVisualState(); detail = message; errorCode = code; emit() }
  private fun resetVisualState(nowMs: Double = SystemClock.elapsedRealtime().toDouble()) { barrier.blackout(nowMs); presentation?.blackout(); testing = false; currentCue = ""; actualStart = null; actualSourceMs = null; latestRunState = JSONObject() }
  private fun matchesSnapshot(event: JSONObject): Boolean = listOf("showId", "setId", "revisionId").all { key -> snapshot.optString(key).isNotEmpty() && event.optString(key) == snapshot.optString(key) }
  private fun restoreActualVisual() {
    if (presentation == null) return
    val start = actualStart ?: return
    val cue = snapshot.optJSONObject("cues")?.optJSONObject(start.optString("cueId")) ?: return
    currentCue = start.optString("cueId"); showCue(cue)
    if (latestRunState.optString("phase") == "paused") presentation?.pause()
    actualSourceMs?.let { presentation?.synchronize(it) }
  }
  private fun update(event: JSONObject) {
    if (destroyed || !enabled) return
    val type = event.optString("type")
    val state = event.optString("state", event.optString("phase"))
    val generation = event.optLong("generation", -1)
    val monotonicMs = event.optDouble("monotonicMs", Double.NaN)
    val startedGeneration = actualStart?.optLong("generation", -1) ?: -1
    if (!barrier.accepts(generation, monotonicMs)) return
    if (type in listOf("INTERRUPTION", "ROUTE_CHANGE", "SAFETY_STOP", "SHUTDOWN") || state in listOf("stopped", "interrupted", "fault")) { resetVisualState(monotonicMs); emit(); return }
    if (!matchesSnapshot(event)) return
    if (type == "RUN_STATE") {
      // Audio may finish preparing between a setup request and its receipt.
      if (testing) { presentation?.blackout(); testing = false; emit() }
      if (startedGeneration >= 0 && generation != startedGeneration) { presentation?.blackout(); currentCue = ""; actualStart = null; actualSourceMs = null }
      latestRunState = event
    }
    if ((type == "PROGRESS" || type == "VOICE_START") && !event.optBoolean("mainTransport", false)) return
    val cueId = event.optString("cueId")
    if (type == "VOICE_START") {
      val order = snapshot.optJSONArray("cueOrder") ?: return
      if ((0 until order.length()).none { order.optString(it) == cueId }) return
      if (cueId.isNotEmpty() && generation >= 0) { testing = false; errorCode = null; actualStart = event; actualSourceMs = null; restoreActualVisual(); emit() }
    }
    if (type == "STATE" || type == "RUN_STATE") {
      when (state) { "paused" -> presentation?.pause(); "playing", "running", "fading" -> presentation?.resume() }
    }
    if (type == "PROGRESS" && cueId == actualStart?.optString("cueId") && generation == startedGeneration) {
      // Audio PROGRESS is already relative to the song's trimmed start.
      actualSourceMs = event.optLong("positionMs").coerceAtLeast(0)
      actualSourceMs?.let { presentation?.synchronize(it) }
    }
  }
  private fun showCue(cue: JSONObject) {
    val assets = snapshot.optJSONObject("visualAssets")
    val id = cue.optString("visualAssetId").ifEmpty { cue.optString("artworkAssetId") }.ifEmpty { snapshot.optString("fallbackVisualAssetId") }
    val asset = assets?.optJSONObject(id)
    val uri = asset?.optString("localUri")?.takeIf { it.isNotEmpty() } ?: fallback
    if (uri == null) { presentation?.fallback(); return }
    runCatching { presentation?.showAsset(localFile(uri), asset?.optString("kind") == "video", cue.optDouble("playbackRate", 1.0).toFloat()) }.onFailure { fail("Visual file is unavailable") }
  }
  private fun localFile(uri: String): File {
    require(uri.startsWith("file://")) { "Visual media must be local" }
    val file = File(Uri.parse(uri).path ?: "").canonicalFile
    val context = appContext.reactContext ?: throw IllegalStateException("App context unavailable")
    require(file.path.startsWith(context.filesDir.canonicalPath + File.separator) || file.path.startsWith(context.cacheDir.canonicalPath + File.separator)) { "Visual file is outside app storage" }
    require(file.isFile && file.length() > 0) { "Visual file is unreadable" }
    return file
  }
  private fun probe(uri: String): Map<String, Any> {
    val file = localFile(uri)
    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, options)
    if (options.outWidth > 0 && options.outHeight > 0) {
      require(options.outWidth.toLong() * options.outHeight <= 40_000_000) { "Image dimensions exceed the limit" }
      return mapOf("kind" to "image", "mimeType" to (options.outMimeType ?: "image/png"), "width" to options.outWidth, "height" to options.outHeight)
    }
    val metadata = MediaMetadataRetriever()
    try { metadata.setDataSource(file.path)
      val width = metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
      val height = metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
      val duration = metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0
      require(width in 1..4096 && height in 1..4096 && duration > 0) { "Unsupported video" }
      return mapOf("kind" to "video", "mimeType" to "video/mp4", "width" to width, "height" to height, "durationMs" to duration)
    } finally { metadata.release() }
  }
}

private class AudiencePresentation(context: Context, display: Display, private val failure: () -> Unit) : Presentation(context, display) {
  private val frame = FrameLayout(context)
  private val image = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
  private val surface = SurfaceView(context)
  private val pattern = TextView(context).apply { gravity = Gravity.CENTER; setTextColor(Color.WHITE); textSize = 28f; visibility = android.view.View.GONE }
  private val imageWorker = Executors.newSingleThreadExecutor { task -> Thread(task, "show-visual-image").apply { isDaemon = true } }
  private val imageHandler = Handler(Looper.getMainLooper())
  private val images = LatestImageWork<android.graphics.Bitmap>(imageWorker, Executor { task ->
    if (!imageHandler.post(task)) throw RejectedExecutionException("Audience UI is closing")
  }, { bitmap -> bitmap.recycle() })
  private var player: ExoPlayer? = null
  private var renderRevision = 0L
  private var ended = false
  private var paused = false
  private var lastSourceMs = 0L
  override fun onCreate(savedInstanceState: android.os.Bundle?) {
    super.onCreate(savedInstanceState)
    frame.setBackgroundColor(Color.BLACK)
    frame.addView(surface, FrameLayout.LayoutParams(-1, -1)); frame.addView(image, FrameLayout.LayoutParams(-1, -1)); frame.addView(pattern, FrameLayout.LayoutParams(-1, -1))
    setContentView(frame)
    window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_SECURE)
  }
  fun showAsset(file: File, video: Boolean, rate: Float) {
    release(); pattern.visibility = android.view.View.GONE; image.setImageDrawable(null); ended = false; paused = false; lastSourceMs = 0
    val capturedRevision = renderRevision
    if (video) {
      image.visibility = android.view.View.GONE; surface.visibility = android.view.View.VISIBLE
      player = ExoPlayer.Builder(context).build().also { output -> output.volume = 0f; output.setVideoSurfaceView(surface)
        output.playbackParameters = PlaybackParameters(rate, 1f); output.addListener(object : Player.Listener {
          override fun onPlaybackStateChanged(state: Int) { if (capturedRevision == renderRevision) ended = state == Player.STATE_ENDED }
          override fun onPlayerError(error: androidx.media3.common.PlaybackException) { if (capturedRevision == renderRevision) { blackout(); failure() } }
        }); output.setMediaItem(MediaItem.fromUri(Uri.fromFile(file))); output.prepare(); output.play() }
    } else {
      surface.visibility = android.view.View.GONE; image.visibility = android.view.View.VISIBLE
      images.submit({ AudienceImageDecoder.decode(file) }) { result ->
        result.onSuccess { image.setImageBitmap(it) }.onFailure { blackout(); failure() }
      }
    }
  }
  fun pause() { paused = true; player?.pause() }
  fun resume() { paused = false; if (!ended) player?.play() }
  fun synchronize(sourceMs: Long) {
    player?.let { output ->
      val rewind = sourceMs < lastSourceMs
      val withinVideo = output.duration <= 0 || sourceMs < output.duration
      // A short video holds its last frame until the song loops or the operator seeks back.
      if (withinVideo && (!ended || rewind) && (rewind || kotlin.math.abs(output.currentPosition - sourceMs) > 250)) {
        output.seekTo(sourceMs)
        if (rewind) { ended = false; if (!paused) output.play() }
      }
    }
    lastSourceMs = sourceMs
  }
  fun fallback() { blackout(); image.visibility = android.view.View.VISIBLE; image.setImageResource(android.R.drawable.ic_media_play) }
  fun testPattern(title: String, caption: String) {
    blackout()
    pattern.background = android.graphics.drawable.GradientDrawable().apply { setColor(Color.BLACK); setStroke(6, Color.WHITE) }
    pattern.text = "$title\n\n+\n\n$caption"
    pattern.visibility = android.view.View.VISIBLE
  }
  fun blackout() { release(); image.setImageDrawable(null); surface.visibility = android.view.View.GONE; image.visibility = android.view.View.GONE; pattern.visibility = android.view.View.GONE }
  fun release() { renderRevision += 1; images.cancel(); player?.release(); player = null }
  override fun onStop() {
    release(); images.close(); imageWorker.shutdownNow()
    super.onStop()
  }
}
