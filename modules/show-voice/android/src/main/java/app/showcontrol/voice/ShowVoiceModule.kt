package app.showcontrol.voice

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.File
import java.text.Normalizer
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.sqrt

internal object WhisperNative {
  init { System.loadLibrary("showvoice") }
  external fun create(path: String): Long
  external fun transcribe(state: Long, samples: FloatArray, language: String): Array<String>
  external fun cancel(state: Long)
  external fun destroy(state: Long)
}

class ShowVoiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShowVoice"); Events("onVoiceStatus")
    OnCreate { VoiceRuntime.listener = { sendEvent("onVoiceStatus", it) } }
    AsyncFunction("getStatus") { VoiceRuntime.status() }
    AsyncFunction("calibrate") { VoiceRuntime.calibrate(appContext.reactContext ?: throw IllegalStateException("App unavailable")) }
    AsyncFunction("arm") { snapshot: String, locale: String, modelPath: String -> VoiceRuntime.arm(appContext.reactContext ?: throw IllegalStateException("App unavailable"), snapshot, locale, modelPath) }
    AsyncFunction("disarm") { VoiceRuntime.stop("Voice is disarmed"); VoiceRuntime.status() }
    OnDestroy { VoiceRuntime.listener = null }
  }
}

internal object VoiceRuntime {
  @Volatile var listener: ((Map<String, Any>) -> Unit)? = null
  private val worker = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())
  private val armed = AtomicBoolean(false)
  @Volatile private var model = 0L
  @Volatile private var calibrated = false
  @Volatile private var detail = "Voice is off"
  @Volatile private var epoch = 0L
  @Volatile private var runGeneration = -1L
  @Volatile private var selectedCue = ""
  @Volatile private var boundSnapshot = Triple("", "", "")
  @Volatile private var recorder: AudioRecord? = null
  private var locale = "en"
  private var rules = listOf<JSONObject>()
  private var noiseFloor = 0.005
  private var lastActionMs = Long.MIN_VALUE / 2
  private var utterance = 0L
  private val awaitingReceipts = java.util.concurrent.ConcurrentHashMap<String, String>()
  private var service: ShowVoiceService? = null
  fun languageTag(): String = locale
  fun status(): Map<String, Any> = mapOf("available" to true, "armed" to armed.get(), "modelReady" to (model != 0L), "calibrated" to calibrated, "detail" to detail)
  private fun emit(extra: Map<String, Any> = emptyMap()) { listener?.invoke(status() + extra) }
  private fun externalInput(context: Context): AudioDeviceInfo? = (context.getSystemService(Context.AUDIO_SERVICE) as AudioManager)
    .getDevices(AudioManager.GET_DEVICES_INPUTS).firstOrNull { it.type in listOf(AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_BLUETOOTH_SCO) }
  private fun makeRecorder(context: Context): AudioRecord {
    require(ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { "Microphone permission is required" }
    val input = externalInput(context) ?: throw IllegalStateException("Connect an external microphone before calibration")
    val minimum = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    require(minimum > 0) { "16 kHz microphone capture unavailable" }
    val capture = AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
      .setAudioFormat(AudioFormat.Builder().setSampleRate(16000).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build())
      .setBufferSizeInBytes(maxOf(minimum * 2, 32000)).build()
    require(capture.state == AudioRecord.STATE_INITIALIZED && capture.setPreferredDevice(input)) { "External microphone routing unavailable" }
    return capture
  }
  fun calibrate(context: Context): Map<String, Any> {
    require(!armed.get()) { "Disarm voice before calibration" }
    val capture = makeRecorder(context)
    val samples = ShortArray(16000)
    try { capture.startRecording(); var offset = 0; while (offset < samples.size) { val count = capture.read(samples, offset, samples.size - offset); require(count > 0) { "Microphone calibration failed" }; offset += count }
      noiseFloor = rms(samples).coerceIn(0.002, 0.15); calibrated = true; detail = "External microphone calibrated; rehearse with music and audience noise"; emit()
    } finally { runCatching {capture.stop()}; capture.release() }
    return status()
  }
  fun arm(context: Context, snapshotJson: String, language: String, modelUri: String): Map<String, Any> {
    require(calibrated && !armed.get()) { "Calibrate the microphone before arming" }
    require(language in listOf("en", "he", "es", "fr", "de", "it", "pt", "ru", "ja", "ar")) { "Unsupported speech language" }
    val file = File(android.net.Uri.parse(modelUri).path ?: "").canonicalFile
    require(modelUri.startsWith("file://") && file.path.startsWith(context.filesDir.canonicalPath + File.separator) && file.isFile) { "Speech model must be in app storage" }
    val snapshot = JSONObject(snapshotJson); val values = snapshot.optJSONArray("voiceRules")
    boundSnapshot = Triple(snapshot.getString("showId"), snapshot.getString("setId"), snapshot.getString("revisionId"))
    rules = (0 until (values?.length() ?: 0)).map { values!!.getJSONObject(it) }.filter { it.optBoolean("enabled") && it.optString("locale") == language }
    require(rules.isNotEmpty()) { "Create an enabled voice rule in the selected language" }
    model = WhisperNative.create(file.path); require(model != 0L) { "Offline speech model could not be loaded" }
    locale = language; epoch++; runGeneration = -1L; selectedCue = ""; lastActionMs = Long.MIN_VALUE / 2
    armed.set(true); detail = "Starting local microphone capture"; emit()
    try { ContextCompat.startForegroundService(context, Intent(context, ShowVoiceService::class.java)) }
    catch (error: Exception) { stop("Microphone service could not start"); throw error }
    return status()
  }
  fun begin(owner: ShowVoiceService) {
    service = owner
    if (!armed.get()) { owner.stopSelf(); return }
    val capturedEpoch = epoch
    Thread({
      var echo: AcousticEchoCanceler? = null; var suppression: NoiseSuppressor? = null
      try {
        val capture = makeRecorder(owner); recorder = capture
        if (AcousticEchoCanceler.isAvailable()) echo = AcousticEchoCanceler.create(capture.audioSessionId)?.also {it.enabled = true}
        if (NoiseSuppressor.isAvailable()) suppression = NoiseSuppressor.create(capture.audioSessionId)?.also {it.enabled = true}
        capture.startRecording(); detail = "Local voice recognition armed"; emit()
        val frame = ShortArray(1600); val speech = ArrayList<Float>(16000 * 8); var silenceFrames = 0
        val busy = AtomicBoolean(false)
        while (armed.get() && epoch == capturedEpoch) {
          val count = capture.read(frame, 0, frame.size); if (count <= 0) throw IllegalStateException("Microphone capture stopped")
          val level = rms(frame, count); val voiced = level > maxOf(0.012, noiseFloor * 3)
          if (voiced) silenceFrames = 0 else silenceFrames++
          if (voiced || speech.isNotEmpty()) for (index in 0 until count) speech.add(frame[index] / 32768f)
          else noiseFloor = (noiseFloor * 0.99 + level * 0.01).coerceIn(0.002, 0.15)
          if (speech.size >= 16000 && (silenceFrames >= 5 || speech.size >= 16000 * 8)) {
            val data = speech.toFloatArray(); speech.clear(); silenceFrames = 0
            val generation = runGeneration; val selection = selectedCue; val sequence = ++utterance
            if (busy.compareAndSet(false, true)) worker.execute {
              try {
                val result = WhisperNative.transcribe(model, data, locale); val confidence = result.getOrNull(1)?.toDoubleOrNull() ?: 0.0
                if (armed.get() && epoch == capturedEpoch && generation == runGeneration && selection == selectedCue) recognized(owner, result[0], confidence, sequence)
              } finally { busy.set(false) }
            }
          }
        }
      } catch (_: Exception) { stop("Microphone/inference unavailable; manual controls remain active") }
      finally { recorder?.let {runCatching {it.stop()}; it.release()}; recorder = null; echo?.release(); suppression?.release() }
    }, "ShowVoiceCapture").apply { isDaemon = true; priority = Thread.NORM_PRIORITY - 1 }.start()
  }
  fun update(event: JSONObject) {
    if (event.optString("type") == "SEMANTIC_RECEIPT") {
      val id = event.optString("eventId")
      awaitingReceipts.remove(id)?.let { action -> emit(mapOf("lastAction" to action, "actionReceipt" to event.optString("result"), "actionEventId" to id, "monotonicMs" to event.optLong("monotonicMs"))) }
      return
    }
    if (!armed.get()) return
    if (event.optString("type") in listOf("INTERRUPTION", "ROUTE_CHANGE", "SHUTDOWN") || (event.optString("type") == "SAFETY_STOP" && event.optString("reason") != "selection") || event.optString("phase") in listOf("interrupted", "fault")) { calibrated = false; stop("Voice disarmed after route or session interruption"); return }
    if (event.optString("type") != "RUN_STATE" || event.optString("showId").isEmpty()) return
    if (Triple(event.optString("showId"), event.optString("setId"), event.optString("revisionId")) != boundSnapshot) { stop("Voice disarmed because the prepared playlist revision changed"); return }
    // Same snapshot navigation invalidates pending inference without silently disarming the input.
    if (event.has("generation")) runGeneration = event.optLong("generation")
    selectedCue = event.optString("selectedCueId", selectedCue)
  }
  private fun normalized(value: String) = Normalizer.normalize(value.lowercase(java.util.Locale.ROOT), Normalizer.Form.NFKC).replace(Regex("[\\p{P}\\p{S}\\p{M}]"), " ").replace(Regex("\\s+"), " ").trim()
  private fun recognized(context: Context, text: String, confidence: Double, sequence: Long) {
    emit(mapOf("transcript" to text.take(1000), "confidence" to confidence, "monotonicMs" to SystemClock.elapsedRealtime()))
    if (confidence < 0.45 || runGeneration < 0) return
    val utteranceText = " ${normalized(text)} "
    val matches = rules.filter { rule -> val scope = rule.optString("cueId"); if (scope.isNotEmpty() && scope != selectedCue) false else {
      val phrases = rule.optJSONArray("phrases"); (0 until (phrases?.length() ?: 0)).any { val phrase = normalized(phrases!!.getString(it)); phrase.isNotEmpty() && utteranceText.contains(if (locale == "ja") phrase else " $phrase ") }
    } }.sortedByDescending { it.optString("cueId").isNotEmpty() }
    if (matches.isEmpty()) return
    val scoped = matches.filter {it.optString("cueId").isNotEmpty()}; val candidates = if (scoped.isNotEmpty()) scoped else matches
    if (candidates.size != 1) { detail = "Ambiguous voice phrase; no command fired"; emit(); return }
    val now = SystemClock.elapsedRealtime(); if (now - lastActionMs < 2000) return
    lastActionMs = now; val rule = candidates[0]; val command = JSONObject(rule.getJSONObject("action").toString())
    command.put("delayMs", rule.optLong("delayMs")); command.put("eventId", "voice:$epoch:$sequence"); command.put("generation", runGeneration)
    command.put("capturedCueId", selectedCue)
    if (awaitingReceipts.size >= 128) awaitingReceipts.clear()
    awaitingReceipts[command.getString("eventId")] = command.getString("type")
    context.sendBroadcast(Intent("app.showcontrol.SEMANTIC_COMMAND").setPackage(context.packageName).putExtra("command", command.toString()))
    emit(mapOf("lastAction" to command.getString("type"), "actionReceipt" to "dispatched", "actionEventId" to command.getString("eventId"), "monotonicMs" to now))
  }
  fun stop(reason: String) {
    armed.set(false); epoch++; detail = reason; recorder?.let {runCatching {it.stop()}}
    val old = model; model = 0; if (old != 0L) { WhisperNative.cancel(old); worker.execute { WhisperNative.destroy(old) } }
    main.post {service?.stopForeground(Service.STOP_FOREGROUND_REMOVE); service?.stopSelf(); service = null}; emit()
  }
  private fun rms(samples: ShortArray, count: Int = samples.size): Double { var sum = 0.0; for (index in 0 until count) {val value = samples[index] / 32768.0; sum += value * value}; return sqrt(sum / count.coerceAtLeast(1)) }
}

class ShowVoiceService : Service() {
  private val receiver = object : BroadcastReceiver() { override fun onReceive(context: Context?, intent: Intent?) { intent?.getStringExtra("event")?.let { runCatching {VoiceRuntime.update(JSONObject(it))} } } }
  override fun onCreate() {
    super.onCreate(); ContextCompat.registerReceiver(this, receiver, IntentFilter("app.showcontrol.RUN_STATE"), ContextCompat.RECEIVER_NOT_EXPORTED)
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val localizedConfiguration = android.content.res.Configuration(resources.configuration).apply { setLocale(java.util.Locale.forLanguageTag(VoiceRuntime.languageTag())) }
    val localized = createConfigurationContext(localizedConfiguration)
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel("showcontrol-voice", localized.getString(R.string.showcontrol_voice_channel_name), NotificationManager.IMPORTANCE_LOW))
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, "showcontrol-voice") else @Suppress("DEPRECATION") Notification.Builder(this)
    val notification = builder.setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("Show Control").setContentText(localized.getString(R.string.showcontrol_voice_armed_body)).setOngoing(true).build()
    if (Build.VERSION.SDK_INT >= 30) startForeground(1203, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE) else startForeground(1203, notification)
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int { VoiceRuntime.begin(this); return START_NOT_STICKY }
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onDestroy() { runCatching {unregisterReceiver(receiver)}; VoiceRuntime.stop("Microphone service stopped"); super.onDestroy() }
}
