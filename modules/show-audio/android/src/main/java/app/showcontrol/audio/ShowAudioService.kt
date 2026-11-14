package app.showcontrol.audio

import android.app.Service
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.res.Configuration
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.app.NotificationManager
import android.app.NotificationChannel
import android.content.pm.ServiceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.LocaleList
import android.os.PowerManager
import android.os.Bundle
import android.os.SystemClock
import android.view.KeyEvent
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.source.SilenceMediaSource
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaStyleNotificationHelper
import androidx.media3.session.SessionCommands
import androidx.core.net.toUri
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.Locale
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.pow

/**
 * Android's show-critical audio owner.
 *
 * A semantic Media3 player projects the mixed show to system controls without
 * publishing the silent renderer's clock. Each audible cue uses an independent ExoPlayer and native PCM gain
 * processor, allowing eight overlapping local files without coupling playback to
 * React's lifecycle. This source is still physical-device unverified.
 */
@UnstableApi
class ShowAudioService : MediaSessionService() {
  private data class AudioCueSpec(
    val id: String,
    val file: File,
    val tags: Set<String>,
    val trimInMs: Long,
    val trimOutMs: Long?,
    val sourceDurationMs: Long,
    val gain: Float,
    val fadeInMs: Long,
    val fadeOutMs: Long,
    val curve: PcmGainEnvelopeProcessor.Curve,
    val preWaitMs: Long,
    val endBehavior: String,
    val playbackRate: Double = 1.0,
    val autoPlay: Boolean = false,
    val crossfadeEnabled: Boolean = false,
    val crossfadeMs: Long = 2000,
  )

  private data class GroupChild(val cueId: String, val offsetMs: Long)
  private data class GroupSpec(val id: String, val children: List<GroupChild>)
  private data class FadeSpec(
    val selector: Selector,
    val durationMs: Long,
    val curve: PcmGainEnvelopeProcessor.Curve,
    val stopAtEnd: Boolean,
  )
  private data class StopSpec(val selector: Selector)
  private data class WaitSpec(
    val id: String,
    val durationMs: Long,
    val continueAutomatically: Boolean,
  )
  private class PendingAutoWait(
    val cueId: String,
    val generation: Long,
    var remainingMs: Long,
    var dueAtMonotonicMs: Long = 0,
    var callback: Runnable? = null,
  )
  private class PendingDelayedAction(
    val cue: AudioCueSpec?,
    var generation: Long,
    var remainingMs: Long,
    var reservationHeld: Boolean,
    val fire: (PendingDelayedAction) -> Unit,
    val mainTransport: Boolean = true,
    val rootEpoch: Long? = null,
    val onCancel: (() -> Unit)? = null,
    var dueAtMonotonicMs: Long = 0,
    var callback: Runnable? = null,
  )
  private class FadeOperation(
    val remainingVoiceIds: MutableSet<String>,
    val stopAtEnd: Boolean,
  )
  private class OmsCrossfadeTransition(val outgoingVoiceId: String, val generation: Long) {
    var incomingStarted = false
    var incomingEndedNaturally = false
  }
  private data class RootEntry(val key: String, val cueId: String, val cue: AudioCueSpec?, val delayMs: Long)
  private class RootAdmission(
    val gate: RootAdmissionGate,
    val targetCueId: String?,
    val entries: List<RootEntry>,
    val outgoingVoiceIds: Set<String>,
    val outgoingActions: Set<PendingDelayedAction>,
    val controllerEpoch: Long,
    val crossfade: Voice?,
    val startIncoming: Boolean,
  ) { var timeout: Runnable? = null; var exitDelayElapsed = false }
  private class NativeCommandException(
    val code: String,
    override val message: String,
  ) : IllegalStateException(message)
  private sealed interface Selector {
    data object All : Selector
    data class CueIds(val values: Set<String>) : Selector
    data class Tags(val values: Set<String>) : Selector
  }

  private data class PreparedShow(
    val audio: Map<String, AudioCueSpec>,
    val groups: Map<String, GroupSpec>,
    val fades: Map<String, FadeSpec>,
    val stops: Map<String, StopSpec>,
    val waits: Map<String, WaitSpec>,
    val cueOrder: List<String>,
    val panicFadeMs: Long,
    val transportMode: String = "legacyCueStack",
    val sessionPurpose: String = "performance",
    val showId: String = "",
    val setId: String = "",
    val revisionId: String = "",
    val presentationLocale: String? = null,
  )

  private data class Voice(
    val id: String,
    val cue: AudioCueSpec,
    val player: ExoPlayer,
    val envelope: PcmGainEnvelopeProcessor,
    val mayAutoFollowMainStack: Boolean,
    val belongsToMainSequence: Boolean,
    val rootEpoch: Long? = null,
  )

  private val commandThread = object : HandlerThread("ShowAudioCommands") {
    override fun onLooperPrepared() {
      commands = Handler(Looper.myLooper()!!)
      if (startupFailed || destroyed) { Looper.myLooper()?.quitSafely(); return }
      commands.post {
        if (startupFailed || destroyed) return@post
        try {
          val player = createTransportPlayer()
          if (transportStartup.complete(player)) main.post { finishStartup() }
          else runCatching { releaseTransportPlayer(player) }
        } catch (error: Throwable) {
          main.post { failStartup("ENGINE_START_FAILED", error.message ?: "The native audio service could not initialize.") }
        }
      }
    }
  }
  @Volatile private lateinit var commands: Handler
  private val main = Handler(Looper.getMainLooper())
  private val processors = CopyOnWriteArrayList<PcmGainEnvelopeProcessor>()
  private val hasActiveVoices = AtomicBoolean(false)
  private val knownRoute = AtomicReference("unknown")

  private lateinit var audioManager: AudioManager
  private lateinit var transportPlayer: ExoPlayer
  private val transportFailure = TransportFailureGate<ExoPlayer>()
  private lateinit var sessionPlayer: ShowSessionPlayer
  private var mediaSession: MediaSession? = null
  private var sessionActivityIntent: PendingIntent? = null
  @Volatile private var systemMedia = systemMediaView(SystemMediaObservation())
  @Volatile private var notificationCopy: BackgroundNotificationCopy? = null
  @Volatile private var notificationResources: Context = this
  private fun notificationString(@androidx.annotation.StringRes resourceId: Int): String = notificationResources.getString(resourceId)
  private data class OwnedNotification(val view: SystemMediaView, val copy: BackgroundNotificationCopy?, val epoch: Long?) {
    fun key(): List<Any?> = listOf(view.phase, view.retainForeground, view.canNavigate, view.canPauseResume, view.canGo, copy, epoch)
  }
  @Volatile private var ownedNotification = OwnedNotification(systemMedia, null, null)
  @Volatile private var notificationFailed = false
  private val notificationOwner = UUID.randomUUID().toString()
  private var notificationReceiverRegistered = false
  private var requestedNotificationKey: List<Any?>? = null // Command looper.
  private var postedNotificationKey: List<Any?>? = null // Main looper.
  private val notificationReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      val epoch = intent?.getLongExtra("epoch", -1) ?: return
      if (!admitsNotificationAction(
          intent.getStringExtra("owner") == notificationOwner && ShowAudioRuntime.isCurrent(this@ShowAudioService),
          NativeRemoteCoordinator.isCurrentCommand(epoch), destroyed || shutdownRequested || notificationFailed,
        )) return
      val key = intent.getStringExtra("key") ?: return
      val type = when (key) { "MEDIA_NEXT" -> "GO"; "MEDIA_PREVIOUS" -> "PREVIOUS"; "MEDIA_PLAY" -> "RESUME"; "MEDIA_PAUSE" -> "PAUSE"; "MEDIA_STOP" -> "STOP_ALL"; else -> return }
      // Carry the displayed epoch all the way to command-queue admission. A
      // stop/reprepare between receipt and dispatch cannot recapture a new one.
      val acceptedEpoch = if (type == "STOP_ALL") NativeRemoteCoordinator.commandEpoch(type, epoch) ?: return else epoch
      dispatchSemantic(JSONObject().put("type", type).put("controllerEpoch", acceptedEpoch).toString(), {}, { _, _ -> })
    }
  }
  private var focusRequest: AudioFocusRequest? = null
  private val interruptionGate = AudioInterruptionGate()
  private val focusGranted = AtomicBoolean(false)
  private val systemAudioPolicy = SystemAudioPolicyMonitor()
  private var systemAudioCheckScheduled = false
  private val systemAudioCheck = object : Runnable {
    override fun run() {
      systemAudioCheckScheduled = false
      if (prepared == null || destroyed || shutdownRequested) return
      observeSystemAudioPolicy()
      refreshBackgroundNotification()
      scheduleSystemAudioCheck()
    }
  }
  private var noisyReceiverRegistered = false
  private var deviceCallbackRegistered = false
  private var audioModeListener: Any? = null
  private var semanticReceiverRegistered = false
  private var backgroundReceiverRegistered = false
  private var thermalStatusListener: Any? = null
  private val backgroundReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      // Observe only; a power-policy change must never dispatch transport or
      // open Settings. Serialize with prepare/exit and reject replaced owners.
      commands.post {
        if (ShowAudioRuntime.isCurrent(this@ShowAudioService)) refreshBackgroundNotification(forceRead = true)
      }
    }
  }
  private val transportStartup = StartupResource<ExoPlayer>()
  @Volatile private var startupFailed = false
  @Volatile private var destroyed = false
  private val startupTimeout = Runnable { failStartup("ENGINE_START_TIMEOUT", "The native audio service did not initialize in time. Try preparing again.") }

  // Command-thread-owned state.
  @Volatile private var prepared: PreparedShow? = null
  private val voices = LinkedHashMap<String, Voice>()
  private var lastCommandId = -1L
  private var triggerGeneration = ShowAudioRuntime.nextGeneration()
  @Volatile private var shutdownRequested = false
  // Accessed on the Android main looper, and fulfilled only after owner destruction.
  private val shutdownCompletions = mutableListOf<() -> Unit>()
  private var goIndex = 0
  private var pendingAutoWait: PendingAutoWait? = null
  private val pendingDelayedActions = linkedSetOf<PendingDelayedAction>()
  private var reservedVoiceCount = 0
  private val activeFades = linkedMapOf<Long, FadeOperation>()
  private var nextFadeOperationId = 0L
  private var enginePaused = false
  private var recoveryRequired = false
  private var selectedIndex = 0
  private var mainCueId: String? = null
  private var mainVoiceId: String? = null
  private var mainRootEpoch = 0L
  private var rootLaunching = false
  private var rootHeldForGo = false
  private var rootAdvanceOnCompletion = true
  private var rootForceAutoplay = false
  private var rootAwaitingFirstStart = false
  private var rootCompletionQueued: Long? = null
  private var rootAdmission: RootAdmission? = null
  private var lastRootRefusal: Map<String, String>? = null
  private val preparedRootVoices = mutableMapOf<String, Voice>()
  private var transitioning = false
  private var omsCrossfade: OmsCrossfadeTransition? = null
  private var refusedAutomaticCrossfadeVoiceId: String? = null
  private var nativeSequence = 0L
  private var previewMode = false
  private var preparingSnapshot = false
  private var explicitRecoveryEpoch: Long? = null
  private var snapshotJson: String? = null
  private var backgroundObservation: Map<String, Any?> = emptyMap()
  private var lastBackgroundReadMs: Long? = null
  private val seenSemanticEvents = LinkedHashSet<String>()
  private val onVoiceStarted = mutableMapOf<String, () -> Unit>()
  private val semanticReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      intent?.getStringExtra("command")?.let { dispatchSemantic(it, {}, { _, _ -> }) }
    }
  }

  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    val signal = when (change) {
      AudioManager.AUDIOFOCUS_LOSS -> AudioFocusSignal.LOSS
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> AudioFocusSignal.TRANSIENT_LOSS
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> AudioFocusSignal.DUCK_LOSS
      AudioManager.AUDIOFOCUS_GAIN -> AudioFocusSignal.GAIN
      else -> null
    }
    val epoch = ShowAudioRuntime.whileCurrent(this) {
      if (destroyed || shutdownRequested) null else signal?.let(interruptionGate::onFocusSignal)
    }
    epoch?.let { emergencyStop("audio_focus", emitInterruption = true, interruptionEpoch = it) }
  }

  private val deviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
      if (removedDevices.any { it.isSink }) routeChanged("output_removed")
    }

    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
      if (addedDevices.any { it.isSink }) routeChanged("output_added")
    }
  }

  private val noisyReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
        routeChanged("becoming_noisy")
      }
    }
  }

  override fun onCreate() {
    super.onCreate()
    try {
      if (!ShowAudioRuntime.beginStartup(this)) { startupFailed = true; stopSelf(); return }
      audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
      knownRoute.set(routeDescription())
      // Cold native player setup has its own bounded budget, independent of
      // the short wait used while tearing down an existing command owner.
      main.postDelayed(startupTimeout, ENGINE_STARTUP_TIMEOUT_MS)
      commandThread.start()
    } catch (error: Throwable) {
      failStartup("ENGINE_START_FAILED", error.message ?: "The native audio service could not initialize.")
    }
  }

  private fun finishStartup() {
    if (startupFailed || destroyed) return
    if (transportFailure.hasFailed) { failStartup("TRANSPORT_FAILED", TRANSPORT_FAILURE_MESSAGE); return }
    val player = transportStartup.take() ?: return
    main.removeCallbacks(startupTimeout)
    transportPlayer = player
    try {
    sessionPlayer = ShowSessionPlayer(commandThread.looper, { systemMedia }, {
      MediaMetadata.Builder().setTitle(notificationString(R.string.show_audio_notification_title))
        .setArtist(notificationCopy?.headline).setSubtitle(notificationCopy?.details).build()
    }, ::routeMediaCommand)

    val sessionBuilder = MediaSession.Builder(this, sessionPlayer).setCallback(SessionCallback())
    packageManager.getLaunchIntentForPackage(packageName)?.let { intent ->
      // This opens controls only. Reattaching the UI must never replay a command.
      intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      sessionActivityIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      sessionBuilder.setSessionActivity(requireNotNull(sessionActivityIntent))
    }
    mediaSession = sessionBuilder.build()
    ContextCompat.registerReceiver(this, notificationReceiver, IntentFilter(NOTIFICATION_ACTION).apply {
      addDataScheme("showcontrol-notification")
    }, ContextCompat.RECEIVER_NOT_EXPORTED)
    notificationReceiverRegistered = true

    setShowNotificationForIdlePlayer(SHOW_NOTIFICATION_FOR_IDLE_PLAYER_ALWAYS)
    // This service is started directly by the bridge, without a MediaController
    // connection which would otherwise register the session with Media3 for us.
    addSession(requireNotNull(mediaSession))
    audioManager.registerAudioDeviceCallback(deviceCallback, main)
    deviceCallbackRegistered = true
    registerNoisyReceiver()
    registerAudioModeListener()
    ContextCompat.registerReceiver(this, semanticReceiver, IntentFilter("app.showcontrol.SEMANTIC_COMMAND"), ContextCompat.RECEIVER_NOT_EXPORTED)
    semanticReceiverRegistered = true
    ContextCompat.registerReceiver(this, backgroundReceiver, IntentFilter().apply {
      addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
      addAction(PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED)
      addAction(Intent.ACTION_USER_PRESENT)
      addAction(Intent.ACTION_BATTERY_CHANGED)
      addAction(Intent.ACTION_POWER_CONNECTED)
      addAction(Intent.ACTION_POWER_DISCONNECTED)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        addAction(NotificationManager.ACTION_NOTIFICATION_CHANNEL_BLOCK_STATE_CHANGED)
        addAction(NotificationManager.ACTION_NOTIFICATION_CHANNEL_GROUP_BLOCK_STATE_CHANGED)
      }
    }, ContextCompat.RECEIVER_NOT_EXPORTED)
    backgroundReceiverRegistered = true
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val power = getSystemService(Context.POWER_SERVICE) as? PowerManager
      val listener = PowerManager.OnThermalStatusChangedListener {
        commands.post {
          if (ShowAudioRuntime.isCurrent(this@ShowAudioService)) refreshBackgroundNotification(forceRead = true)
        }
      }
      try {
        power?.addThermalStatusListener(ContextCompat.getMainExecutor(this), listener)
        if (power != null) thermalStatusListener = listener
      } catch (_: Exception) { /* Polling remains available if the listener is unsupported. */ }
    }
    if (!ShowAudioRuntime.attach(this)) { shutdownRequested = true; stopSelf() }
    } catch (error: Throwable) {
      failStartup("ENGINE_START_FAILED", error.message ?: "The native audio session could not initialize.")
    }
  }

  private fun failStartup(code: String, message: String) {
    if (startupFailed || destroyed) return
    startupFailed = true
    shutdownRequested = true
    main.removeCallbacks(startupTimeout)
    transportStartup.cancel()?.let { player -> commands.post { releaseTransportPlayer(player) } }
    NativeRemoteCoordinator.endDiagnostics()
    ShowAudioRuntime.failStartup(this, code, message)
    stopSelf()
  }

  internal fun cancelStartup(resolve: () -> Unit) {
    main.post {
      if (destroyed) { resolve(); return@post }
      if (ShowAudioRuntime.isCurrent(this)) { shutdownEngine(resolve) { _, _ -> resolve() }; return@post }
      shutdownCompletions += resolve
      failStartup("STARTUP_CANCELLED", "Audio preparation was cancelled before initialization completed.")
    }
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

  internal fun setDiagnosticTransport(active: Boolean) {
    commands.post {
      if (prepared == null && voices.isEmpty()) {
        if (active && !transportFailure.hasFailed && NativeRemoteCoordinator.isDiagnostic()) transportPlayer.play() else transportPlayer.pause()
        publishSystemMediaState()
      }
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // OS controls use the admitted MediaSession binder; our notification uses
    // its private immutable broadcast. Exported service Intents are not an
    // authenticated command channel (even if they contain a valid session URI).
    super.onStartCommand(null, flags, startId)
    // Never let Android recreate a killed service with an implied playing state.
    return Service.START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    if (!::transportPlayer.isInitialized) { stopSelf(); return }
    // Serialize with prepare/shutdown. Removing an Activity does not disarm a show.
    commands.post {
      if (retainPreparedSessionAfterTaskRemoval(prepared != null, previewMode, shutdownRequested, destroyed)) {
        refreshBackgroundNotification(forceRead = true)
        return@post
      }
      if (destroyed) return@post
      emergencyMuteAll()
      prepared = null
      snapshotJson = null
      ShowAudioRuntime.whileCurrent(this) { NativeRemoteCoordinator.setArmed(false) }
      recoveryRequired = true
      safeStopInternal("task_removed", emitInterruption = true)
      // Media3's pauseAllPlayersAndStopSelf requires main-looper players. Our
      // transport has already paused safely on its owning command looper.
      main.post { if (!destroyed) stopSelf() }
    }
  }

  override fun onDestroy() {
    destroyed = true
    shutdownRequested = true
    if (::commands.isInitialized) commands.removeCallbacks(systemAudioCheck)
    NativeRemoteCoordinator.endDiagnostics()
    main.removeCallbacks(startupTimeout)
    transportStartup.cancel()?.let { player -> if (::commands.isInitialized) commands.post { releaseTransportPlayer(player) } }
    sendRunBroadcast(mapOf("type" to "SHUTDOWN", "generation" to triggerGeneration))
    emergencyMuteAll()
    // Global admission changes while this owner is still current. Local cleanup
    // may finish after its bounded wait and after a replacement has armed.
    if (ShowAudioRuntime.isCurrent(this)) NativeRemoteCoordinator.setArmed(false)
    if (::commands.isInitialized && ::transportPlayer.isInitialized) runOnCommands {
      prepared = null
      snapshotJson = null
      safeStopInternal("service_destroyed", emitInterruption = false)
      releaseTransportPlayer(transportPlayer)
    }
    runCatching { mediaSession?.release() }
    mediaSession = null
    if (deviceCallbackRegistered) runCatching { audioManager.unregisterAudioDeviceCallback(deviceCallback) }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (audioModeListener as? AudioManager.OnModeChangedListener)?.let { listener -> runCatching { audioManager.removeOnModeChangedListener(listener) } }
      audioModeListener = null
    }
    if (noisyReceiverRegistered) runCatching { unregisterReceiver(noisyReceiver) }
    if (semanticReceiverRegistered) runCatching { unregisterReceiver(semanticReceiver) }
    if (notificationReceiverRegistered) runCatching { unregisterReceiver(notificationReceiver) }
    if (backgroundReceiverRegistered) runCatching { unregisterReceiver(backgroundReceiver) }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      (thermalStatusListener as? PowerManager.OnThermalStatusChangedListener)?.let { listener ->
        runCatching { (getSystemService(Context.POWER_SERVICE) as? PowerManager)?.removeThermalStatusListener(listener) }
      }
      thermalStatusListener = null
    }
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    // Closing a MessageQueue immediately rejects posts from an initializer
    // already running on it. Let that initializer release its cancelled result
    // and finish queued cleanup before closing the command looper.
    if (::commands.isInitialized && commandThread.isAlive) {
      if (!commands.post { commandThread.quitSafely() }) commandThread.quitSafely()
    }
    // A thread not yet in onLooperPrepared observes destroyed and quits there.
    val completions = shutdownCompletions.toList()
    shutdownCompletions.clear()
    super.onDestroy()
    ShowAudioRuntime.detach(this)
    // Promise continuations may immediately start the next owner. Wait until
    // Android has returned from its stop-service callback before resolving.
    main.post { completions.forEach { it() } }
  }

  // The standalone library lint cannot inspect the host's bundle DSL. The
  // source-owned with-offline-locales plugin keeps every language in the base
  // package; host build checks assert enableSplit=false. No Play download is used.
  @android.annotation.SuppressLint("AppBundleLocaleChanges")
  internal fun prepareSnapshot(
    snapshotJson: String,
    resolve: () -> Unit,
    reject: (String, String) -> Unit,
  ) {
    if (destroyed || !commands.post {
      if (destroyed || shutdownRequested) {
        main.post { reject("OWNER_SHUTTING_DOWN", "Wait for the previous native owner to finish shutting down.") }
        return@post
      }
      if (transportFailure.hasFailed) {
        main.post { reject("TRANSPORT_FAILED", TRANSPORT_FAILURE_MESSAGE) }
        return@post
      }
      try {
        beginSystemAudioObservation()
        val preparationEpoch = interruptionGate.epoch
        val next = parseSnapshot(snapshotJson)
        val admitted = ShowAudioRuntime.whileCurrent(this) {
          if (destroyed || shutdownRequested) false else {
            NativeRemoteCoordinator.setArmed(true)
            true
          }
        } == true
        if (!admitted) throw NativeCommandException("OWNER_SHUTTING_DOWN", "Wait for the previous native owner to finish shutting down.")
        preparingSnapshot = true
        safeStopInternal("prepare", emitInterruption = false)
        prepared = next
        notificationResources = next.presentationLocale?.let { language ->
          createConfigurationContext(Configuration(resources.configuration).apply {
            setLocales(LocaleList(Locale.forLanguageTag(language)))
          })
        } ?: this
        this.snapshotJson = snapshotJson
        lastBackgroundReadMs = null
        previewMode = false
        selectedIndex = 0
        mainCueId = null
        transitioning = false
        seenSemanticEvents.clear()
        lastCommandId = -1
        triggerGeneration = ShowAudioRuntime.nextGeneration()
        goIndex = 0
        enginePaused = false
        recoveryRequired = false
        requireSystemAudioAvailable()
        if (!interruptionGate.admits(preparationEpoch)) {
          if (!interruptionGate.admits(preparationEpoch, explicitRecovery = true) ||
            !requestAudioFocus(preparationEpoch) ||
            !interruptionGate.recover(preparationEpoch, focusGranted.get())) {
            throw NativeCommandException("AUDIO_INTERRUPTED", "Audio focus is unavailable or changed during preparation. Wait until the interruption ends and prepare again.")
          }
        }
        updateTransportPlayback()
        preparingSnapshot = false
        emit(mapOf("type" to "STATE", "state" to "ready"))
        emitRunState()
        main.post(resolve)
      } catch (error: Exception) {
        preparingSnapshot = false
        val message = error.message ?: "The run snapshot is invalid."
        val code = (error as? NativeCommandException)?.code ?: "INVALID_SNAPSHOT"
        emitFault(code, message)
        // A failed preparation also owns teardown. Keep admission closed and
        // report failure after detachment so an immediate Retry is safe.
        shutdownOnCommands({ reject(code, message) }, reject)
      }
    }) main.post { reject("OWNER_SHUTTING_DOWN", "Wait for the previous native owner to finish shutting down.") }
  }

  internal fun dispatchCommand(
    commandJson: String,
    resolve: () -> Unit,
    reject: (String, String) -> Unit,
  ) {
    val command = try {
      JSONObject(commandJson)
    } catch (error: JSONException) {
      reject("INVALID_COMMAND", "The engine command is not valid JSON.")
      return
    }
    val type = command.optString("type")
    val work = Runnable { executeCommand(command, resolve, reject) }
    if (type in listOf("PANIC_FADE", "STOP_ALL", "STOP")) NativeRemoteCoordinator.commandEpoch("STOP_ALL")
    if (type == "PANIC_FADE" || type == "STOP_ALL") {
      commands.postAtFrontOfQueue(work)
    } else {
      commands.post(work)
    }
  }

  internal fun dispatchUrgentCommand(
    commandJson: String,
    resolve: () -> Unit,
    reject: (String, String) -> Unit,
  ) {
    val command = try {
      JSONObject(commandJson)
    } catch (error: JSONException) {
      reject("INVALID_COMMAND", "The urgent engine command is not valid JSON.")
      return
    }
    val type = command.optString("type")
    if (type != "PANIC_FADE" && type != "STOP_ALL" && type != "STOP") {
      reject("INVALID_URGENT_COMMAND", "Only panic or stop commands may use the urgent native path.")
      return
    }
    // STOP_ALL must mute before any older queued command can run. PANIC_FADE
    // instead enters at the queue front so its native PCM envelope can begin
    // without an abrupt mute/unmute edge that would defeat the fade curve.
    NativeRemoteCoordinator.commandEpoch("STOP_ALL")
    if (type == "STOP_ALL") emergencyMuteAll()
    commands.postAtFrontOfQueue { executeCommand(command, resolve, reject) }
  }

  internal fun shutdownEngine(resolve: () -> Unit, reject: (String, String) -> Unit) {
    if (destroyed) { main.post(resolve); return }
    if (!commands.post { shutdownOnCommands(resolve, reject) }) main.post(resolve)
  }

  /** Call on the owning queue. Never enqueue teardown behind a newer prepare. */
  private fun shutdownOnCommands(resolve: () -> Unit, reject: (String, String) -> Unit) {
    if (shutdownRequested || destroyed) {
      main.post { if (destroyed) resolve() else shutdownCompletions += resolve }
      return
    }
    try {
      shutdownRequested = true
      if (!previewMode) sendRunBroadcast(mapOf("type" to "SHUTDOWN", "generation" to triggerGeneration))
      prepared = null
      snapshotJson = null
      ShowAudioRuntime.whileCurrent(this) { NativeRemoteCoordinator.setArmed(false) }
      safeStopInternal("shutdown", emitInterruption = false)
      lastCommandId = -1
      recoveryRequired = false
      finishShutdownOnMain(resolve)
    } catch (error: Exception) {
      emergencyMuteAll()
      // A failed player stop must still release the service before Retry.
      finishShutdownOnMain { reject("SHUTDOWN_FAILED", error.message ?: "The audio engine could not shut down.") }
    }
  }

  private fun finishShutdownOnMain(completion: () -> Unit) {
    main.post {
      if (destroyed) { completion(); return@post }
      shutdownCompletions += completion
      runCatching { mediaSession?.release() }
      mediaSession = null
      stopSelf()
    }
  }

  private fun executeCommand(
    command: JSONObject,
    resolve: () -> Unit,
    reject: (String, String) -> Unit,
  ) {
    val type = command.optString("type")
    val id = command.optLong("id", -1)
    if (id < 0) {
      main.post { reject("INVALID_COMMAND_ID", "Engine commands require a non-negative monotonic ID.") }
      return
    }
    if (id <= lastCommandId) {
      emitFault("STALE_COMMAND", "A duplicate or stale engine command was suppressed.")
      main.post {
        reject("STALE_COMMAND", "A duplicate or stale engine command was suppressed.")
      }
      return
    }
    try {
      if (prepared == null) {
        throw NativeCommandException("ENGINE_NOT_PREPARED", "The native engine is not prepared.")
      }
      requireTransportCommand(type)
      when (type) {
        "GO", "PLAY", "PREVIOUS", "SKIP", "SELECT", "START_SELECTED", "REPLAY", "SCHEDULE" -> executeSemantic(command)
        "TRIGGER_CUE", "TRIGGER_GROUP" -> {
          val cueId = command.requireString("cueId")
          if (prepared?.transportMode == "oms") {
            executeSemantic(JSONObject().put("type", "START_SELECTED").put("cueId", cueId))
          } else {
            cancelPendingAutoWait()
            trigger(cueId, triggerGeneration, TriggerOrigin.MAIN_STACK)
            syncGoIndex(cueId)
            selectedIndex = prepared?.cueOrder?.indexOf(cueId) ?: selectedIndex
            mainCueId = cueId
          }
        }
        "TRIGGER_HIT" -> trigger(
          cueId = command.requireString("cueId"),
          generation = triggerGeneration,
          origin = TriggerOrigin.HIT,
        )
        "PAUSE" -> pauseAll()
        "RESUME" -> resumeAll()
        "PANIC_FADE" -> panicFade()
        "STOP_ALL" -> {
          triggerGeneration = ShowAudioRuntime.nextGeneration()
          safeStopInternal("command", emitInterruption = false)
        }
        "FADE" -> fade(
          selector = parseSelector(command.requireObject("selector")),
          durationMs = command.optLong("durationMs", 0).coerceAtLeast(0),
          curve = PcmGainEnvelopeProcessor.Curve.SMOOTH,
          stopAtEnd = command.optBoolean("stopAtEnd", false),
        )
        "STOP" -> stopSelected(parseSelector(command.requireObject("selector")))
        "SEEK_REHEARSAL" -> {
          if (prepared?.sessionPurpose != "rehearsal" || previewMode) throw NativeCommandException("SEEK_REHEARSAL_ONLY", "Seeking is available only in a prepared rehearsal.")
          seekRehearsal(cueId = command.requireString("cueId"), positionMs = command.optLong("positionMs", 0).coerceAtLeast(0))
        }
        else -> throw IllegalArgumentException("Unknown engine command: $type")
      }
      lastCommandId = id
      nativeSequence += 1
      emit(
        mapOf(
          "type" to "ACK",
          "commandId" to id,
          "nativeCommandId" to nativeSequence,
          "receivedAtMonotonicMs" to SystemClock.elapsedRealtime(),
        ),
      )
      main.post(resolve)
      emitRunState()
    } catch (error: Exception) {
      val message = error.message ?: "The native engine rejected the command."
      val code = (error as? NativeCommandException)?.code ?: "COMMAND_REJECTED"
      if (code == "RECOVERABLE_REFUSAL") lastCommandId = maxOf(lastCommandId, id)
      if (code != "RECOVERABLE_REFUSAL") emitFault(code, message)
      main.post { reject(code, message) }
    }
  }

  internal fun getRunState(resolve: (Map<String, Any?>) -> Unit) {
    commands.post { val state = runState(); main.post { resolve(state) } }
  }

  internal fun getPreparedSession(resolve: (Map<String, Any?>?) -> Unit) {
    if (destroyed || !commands.post {
      val snapshot = snapshotJson
      val result = if (retainPreparedSessionAfterTaskRemoval(prepared != null, previewMode, shutdownRequested, destroyed) && snapshot != null) {
        mapOf("snapshotJson" to snapshot, "state" to runState(), "commandIdWatermark" to maxOf(lastCommandId, nativeSequence))
      } else null
      main.post { resolve(result) }
    }) main.post { resolve(null) }
  }

  internal fun getBackgroundReliability(resolve: (Map<String, Any?>) -> Unit) {
    main.post {
      // We override Media3 notification ownership. Its internal foreground flag
      // does not observe our startForeground call. Read our successful post on
      // the same main looper that starts/stops foreground protection.
      val protectionActive = postedNotificationKey != null && !notificationFailed && !destroyed && !shutdownRequested
      val status = BackgroundReliability.read(this, !destroyed && !shutdownRequested, protectionActive,
        prepared != null && !previewMode && !destroyed && !shutdownRequested)
      if (!destroyed) commands.post {
        backgroundObservation = status
        lastBackgroundReadMs = SystemClock.elapsedRealtime()
        refreshNotificationMetadata()
      }
      resolve(status)
    }
  }

  internal fun openBackgroundSettings(activity: Activity?, target: String, resolve: (Map<String, Any?>) -> Unit, reject: (String, String) -> Unit) {
    if (destroyed || !commands.post {
      try {
        // startActivity performs a platform launch, not a View mutation. Keeping
        // admission and launch on this queue closes the prepare/settings race.
        check(prepared == null && !preparingSnapshot && !shutdownRequested) { "Disarm or stop auditioning before changing system settings." }
        NativeRemoteCoordinator.requireIdle()
        val result = BackgroundReliability.openSettings(activity, target)
        main.post { resolve(result) }
      } catch (error: Exception) {
        main.post { reject("BACKGROUND_SETTINGS_ARMED", error.message ?: "Disarm before changing system settings.") }
      }
    }) main.post { reject("OWNER_SHUTTING_DOWN", "Wait for the native audio owner to finish shutting down.") }
  }

  internal fun previewCue(json: String, positionMs: Long, initialPaused: Boolean, resolve: () -> Unit, reject: (String, String) -> Unit) {
    if (destroyed || !commands.post {
      if (destroyed || shutdownRequested) {
        main.post { reject("OWNER_SHUTTING_DOWN", "Wait for the previous native owner to finish shutting down.") }
        return@post
      }
      if (transportFailure.hasFailed) { main.post { reject("TRANSPORT_FAILED", TRANSPORT_FAILURE_MESSAGE) }; return@post }
      try {
        if (prepared != null && !previewMode) throw NativeCommandException("RUN_ARMED", "Disarm before auditioning edits.")
        beginSystemAudioObservation()
        val preparationEpoch = interruptionGate.epoch
        explicitRecoveryEpoch = preparationEpoch
        previewMode = true
        snapshotJson = null
        safeStopInternal("preview", false)
        val cue = JSONObject(json)
        val id = cue.requireString("id")
        prepared = parseSnapshot(JSONObject().put("schemaVersion", 2).put("voiceLimit", 8).put("cues", JSONObject().put(id, cue)).put("cueOrder", JSONArray().put(id)).toString())
        recoveryRequired = false
        enginePaused = initialPaused
        triggerGeneration = ShowAudioRuntime.nextGeneration()
        val spec = prepared!!.audio[id] ?: error("Preview requires audio.")
        val sourcePosition = positionMs.coerceIn(spec.trimInMs, (spec.trimOutMs ?: spec.sourceDurationMs) - 1)
        val preview = spec.copy(preWaitMs = 0, autoPlay = false, endBehavior = "stopAndReadyNext")
        admitAudioCues(listOf(preview)); startReservedVoice(preview, triggerGeneration, TriggerOrigin.HIT)
        voices.values.firstOrNull()?.let { voice -> val relative = sourceToCuePosition(sourcePosition, spec.trimInMs, spec.trimOutMs ?: spec.sourceDurationMs); voice.player.seekTo(relative); voice.envelope.seekCueTimeline(relative) }
        requireSystemAudioAvailable()
        if (!interruptionGate.recover(preparationEpoch, focusGranted.get())) throw NativeCommandException("AUDIO_INTERRUPTED", "Audio was interrupted while preparing the audition. Try again after the interruption ends.")
        emitPreviewState()
        main.post(resolve)
      } catch (error: Exception) {
        val message = error.message ?: "Cannot audition audio."
        if (previewMode) shutdownOnCommands({ reject("PREVIEW_FAILED", message) }, reject)
        else main.post { reject("PREVIEW_FAILED", message) }
      } finally { explicitRecoveryEpoch = null }
    }) main.post { reject("OWNER_SHUTTING_DOWN", "Wait for the previous native owner to finish shutting down.") }
  }

  internal fun seekPreview(positionMs: Long, resolve: () -> Unit, reject: (String, String) -> Unit) {
    commands.post {
      if (!previewMode) { main.post { reject("NO_PREVIEW", "No preview is playing.") }; return@post }
      val voice = voices.values.firstOrNull()
      if (voice == null) { main.post { reject("NO_PREVIEW", "No preview is playing.") }; return@post }
      voice.let {
        val source = positionMs.coerceIn(voice.cue.trimInMs, (voice.cue.trimOutMs ?: voice.cue.sourceDurationMs) - 1)
        val relative = sourceToCuePosition(source, voice.cue.trimInMs, voice.cue.trimOutMs ?: voice.cue.sourceDurationMs)
        voice.player.seekTo(relative); voice.envelope.seekCueTimeline(relative)
      }
      emitPreviewState()
      main.post(resolve)
    }
  }

  internal fun setPreviewPaused(paused: Boolean, resolve: () -> Unit, reject: (String, String) -> Unit) {
    commands.post {
      if (!previewMode || voices.isEmpty()) { main.post { reject("NO_PREVIEW", "No preview is playing.") }; return@post }
      try {
        if (paused && !enginePaused) pauseAll()
        else if (!paused && enginePaused) resumeAll()
        emitPreviewState()
        main.post(resolve)
      } catch (error: Exception) { main.post { reject("PREVIEW_FAILED", error.message ?: "Cannot control preview.") } }
    }
  }

  internal fun stopPreview(resolve: () -> Unit) {
    if (destroyed || !commands.post {
      if (previewMode || shutdownRequested) shutdownOnCommands(resolve) { _, _ -> main.post(resolve) }
      else main.post(resolve)
    }) main.post(resolve)
  }

  internal fun dispatchSemantic(json: String, resolve: () -> Unit, reject: (String, String) -> Unit) {
    val command = try { JSONObject(json) } catch (_: Exception) { reject("INVALID_COMMAND", "Invalid semantic command."); return }
    val work = Runnable {
      try {
        if (command.has("controllerEpoch") && !NativeRemoteCoordinator.isCurrentCommand(command.optLong("controllerEpoch", -1))) { main.post(resolve); return@Runnable }
        requireTransportCommand(command.optString("type"))
        validateSemanticContext(command)
        command.optString("eventId").takeIf(String::isNotBlank)?.let { key ->
          if (!seenSemanticEvents.add(key)) { main.post(resolve); return@Runnable }
          if (seenSemanticEvents.size > 1024) seenSemanticEvents.remove(seenSemanticEvents.first())
        }
        val delay = command.optLong("delayMs", 0)
        require(delay in 0..86_400_000) { "Invalid command delay." }
        if (delay > 0 && command.optString("type") != "SCHEDULE") {
          val capturedIndex = selectedIndex
          scheduleDelayedAction(null, delay, triggerGeneration, false) {
            if (selectedIndex == capturedIndex) executeSemantic(command)
          }
        } else executeSemantic(command)
        nativeSequence += 1
        emitSemanticReceipt(command, "accepted")
        emitRunState()
        main.post(resolve)
      } catch (error: Exception) {
        emitSemanticReceipt(command, "rejected")
        val code = (error as? NativeCommandException)?.code ?: "SEMANTIC_REJECTED"
        main.post { reject(code, error.message ?: "Semantic command rejected.") }
      }
    }
    if (command.optString("type") == "STOP_ALL" && (!command.has("controllerEpoch") || NativeRemoteCoordinator.isCurrentCommand(command.optLong("controllerEpoch", -1)))) emergencyMuteAll()
    if (command.optString("type") in listOf("PANIC_FADE", "STOP_ALL")) commands.postAtFrontOfQueue(work)
    else commands.post(work)
  }

  private fun executeSemantic(command: JSONObject) {
    requireTransportCommand(command.optString("type"))
    validateSemanticContext(command)
    val show = prepared ?: throw NativeCommandException("ENGINE_NOT_PREPARED", "Prepare the run first.")
    val type = command.optString("type")
    if (previewMode && type !in listOf("PANIC_FADE", "STOP_ALL")) throw NativeCommandException("PREVIEW_ONLY", "Editor audition cannot accept show commands.")
    if (type == "PANIC_FADE") { transitioning = false; panicFade(); return }
    if (type == "STOP_ALL") { transitioning = false; mainCueId = null; safeStopInternal("semantic_stop", false); return }
    if (recoveryRequired || interruptionGate.isBlocked) throw NativeCommandException("RECOVERY_REQUIRED", "Prepare again after interruption.")
    when (type) {
      "SCHEDULE" -> {
        val nested = command.requireObject("command")
        val delay = command.optLong("delayMs", 0)
        require(delay in 0..86_400_000)
        val capturedIndex = selectedIndex
        scheduleDelayedAction(null, delay, triggerGeneration, false) {
          if (selectedIndex == capturedIndex) { executeSemantic(nested); emitRunState() }
        }
      }
      "GO" -> if (show.transportMode != "oms") { if (enginePaused) resumeAll() else advanceLegacyCue("semantic_go") } else when (rootGoAction(enginePaused, transitioning, mainCueId != null, mainVoiceId?.let(voices::containsKey) == true)) {
        RootGoAction.RESUME -> resumeAll()
        RootGoAction.IGNORE -> Unit
        RootGoAction.ADVANCE_ROOT, RootGoAction.ADVANCE_AUDIO -> advanceOms(manualAdvance = true)
        RootGoAction.START -> startSelectedOms()
      }
      "PLAY" -> if (command.has("cueId")) executeSemantic(JSONObject().put("type", "START_SELECTED").put("cueId", command.requireString("cueId"))) else if (enginePaused) resumeAll() else if (mainCueId == null) startSelectedOms()
      "PAUSE_RESUME" -> if (enginePaused) resumeAll() else if (voices.isNotEmpty() || pendingDelayedActions.isNotEmpty() || pendingAutoWait != null || rootAdmission != null || rootHeldForGo) pauseAll()
      "TRIGGER_HIT" -> trigger(command.requireString("cueId"), triggerGeneration, TriggerOrigin.HIT)
      "PAUSE" -> if (!enginePaused && (voices.isNotEmpty() || pendingDelayedActions.isNotEmpty() || pendingAutoWait != null || rootAdmission != null || rootHeldForGo)) pauseAll()
      "RESUME" -> if (enginePaused) resumeAll()
      "PREVIOUS", "SKIP", "SELECT", "START_SELECTED", "REPLAY" -> {
        val target = when (type) {
          "PREVIOUS" -> (selectedIndex - 1).coerceAtLeast(0)
          "SKIP" -> (selectedIndex + 1).coerceAtMost(show.cueOrder.size)
          "SELECT", "START_SELECTED" -> show.cueOrder.indexOf(command.requireString("cueId")).also { require(it >= 0) }
          else -> selectedIndex
        }
        if (show.transportMode == "oms") stopMainForSelection() else safeStopInternal("selection", false)
        transitioning = false
        mainCueId = null
        selectedIndex = target
        goIndex = target
        if (type == "START_SELECTED" || type == "REPLAY") startSelectedOms()
      }
      else -> throw NativeCommandException("UNKNOWN_COMMAND", "Unknown semantic command.")
    }
  }

  private fun validateSemanticContext(command: JSONObject) {
    val generation = if (command.has("generation")) command.optLong("generation", -1) else null
    val capturedCue = if (command.has("capturedCueId")) command.optString("capturedCueId") else null
    val selectedCue = prepared?.cueOrder?.getOrNull(selectedIndex) ?: ""
    if (!isSemanticContextCurrent(generation, triggerGeneration, capturedCue, selectedCue)) {
      throw NativeCommandException("STALE_SESSION", "The command belongs to a replaced run or selection.")
    }
  }

  private fun startSelectedOms() {
    val show = prepared ?: return
    val id = show.cueOrder.getOrNull(selectedIndex) ?: return
    if (show.transportMode == "oms") {
      stageOmsRoot(selectedIndex, startIncoming = true, crossfade = null)
      return
    }
    mainCueId = id
    val cue = show.audio[id]
    transitioning = (cue?.preWaitMs ?: 0) > 0
    trigger(id, triggerGeneration, TriggerOrigin.MAIN_STACK)
    scheduleProgress()
    goIndex = selectedIndex + 1
    emitRunState()
  }

  private fun advanceOms(manualAdvance: Boolean = false) {
    val show = prepared ?: return
    if (mainCueId == null || transitioning || rootAdmission != null) return
    val outgoing = mainVoiceId?.let(voices::get)
    val nextIndex = selectedIndex + 1
    val incoming = show.cueOrder.getOrNull(nextIndex)?.let(show.audio::get)
    val overlap = outgoing?.takeIf { it.cue.crossfadeEnabled && incoming?.autoPlay == true }
    try { stageOmsRoot(nextIndex, manualAdvance || incoming?.autoPlay == true, overlap) }
    catch (error: NativeCommandException) { if (error.code == "RECOVERABLE_REFUSAL") refusedAutomaticCrossfadeVoiceId = outgoing?.id; throw error }
  }

  private fun finishOmsCrossfadeIfReady() {
    val transition = omsCrossfade ?: return
    if (transition.generation != triggerGeneration || !transition.incomingStarted || voices.containsKey(transition.outgoingVoiceId)) return
    omsCrossfade = null
    transitioning = false
    checkRootCompletion()
    emitRunState()
  }

  private fun finishOmsMainNaturally() {
    val show = prepared ?: return
    val advance = rootAdvanceOnCompletion
    val forceStart = rootForceAutoplay
    lastRootRefusal = null
    pendingDelayedActions.filter { it.mainTransport }.toList().forEach(::cancelDelayedAction)
    mainRootEpoch += 1
    rootCompletionQueued = null
    rootHeldForGo = false
    rootAwaitingFirstStart = false
    if (advance) selectedIndex += 1
    goIndex = selectedIndex
    mainCueId = null
    mainVoiceId = null
    if (advance && (forceStart || show.cueOrder.getOrNull(selectedIndex)?.let(show.audio::get)?.autoPlay == true)) {
      try { startSelectedOms() } catch (error: NativeCommandException) {
        if (error.code != "RECOVERABLE_REFUSAL") throw error
      }
    }
    emitRunState()
  }

  private fun rootEntries(show: PreparedShow, cueId: String?, start: Boolean): List<RootEntry> {
    if (!start || cueId == null) return emptyList()
    val children = show.groups[cueId]?.children?.map { it.cueId to it.offsetMs } ?: listOf(cueId to 0L)
    return children.map { (id, offset) ->
      val audio = show.audio[id]
      val control = id in show.fades || id in show.stops || !show.groups.containsKey(cueId) && id in show.waits
      if (audio == null && !control) throw NativeCommandException("CUE_UNAVAILABLE", "An incoming cue is unavailable.")
      RootEntry(UUID.randomUUID().toString(), id, audio, saturatedAdd(offset, audio?.preWaitMs ?: 0))
    }
  }

  private fun refuseRootCommand(code: String, message: String, cueId: String? = null): Nothing {
    lastRootRefusal = mapOf("code" to code, "message" to message)
    emit(mapOf("type" to "TRANSITION_REFUSED", "code" to code, "message" to message, "cueId" to cueId,
      "generation" to triggerGeneration, "monotonicMs" to SystemClock.elapsedRealtime()))
    throw NativeCommandException("RECOVERABLE_REFUSAL", message)
  }

  private fun stageOmsRoot(targetIndex: Int, startIncoming: Boolean, crossfade: Voice?) {
    val show = prepared ?: return
    requireSystemAudioAvailable()
    if (rootAdmission != null || transitioning) return
    val targetId = show.cueOrder.getOrNull(targetIndex)
    val entries = try { rootEntries(show, targetId, startIncoming) } catch (_: Exception) {
      rootHeldForGo = mainCueId != null
      refuseRootCommand("CUE_UNAVAILABLE", "The incoming cue could not be prepared. The current cue was retained.", targetId)
    }
    val audioEntries = entries.filter { it.cue != null }
    val independentVoices = voices.values.count { !it.belongsToMainSequence }
    val independentReservations = pendingDelayedActions.count { it.reservationHeld && !it.mainTransport }
    if (!rootFutureCapacity(independentVoices, independentReservations, audioEntries.size) ||
      crossfade != null && voices.size + reservedVoiceCount + audioEntries.size > VOICE_LIMIT) {
      rootHeldForGo = mainCueId != null
      refusedAutomaticCrossfadeVoiceId = crossfade?.id
      refuseRootCommand("CAPACITY_REFUSAL", "The incoming cue needs more free voice slots. Stop a Hit or retry after it finishes.", targetId)
    }
    if (audioEntries.any { val cue = it.cue; cue == null || !cue.file.isFile || !isAppOwned(cue.file) }) {
      rootHeldForGo = mainCueId != null
      refuseRootCommand("MEDIA_NOT_LOCAL", "Incoming media is missing. The current cue was retained; repair the media before retrying.", targetId)
    }
    val epoch = NativeRemoteCoordinator.commandEpoch("ROOT_PREPARATION")
      ?: throw NativeCommandException("STALE_SESSION", "The prepared session is no longer current.")
    val admission = RootAdmission(RootAdmissionGate(triggerGeneration, mainRootEpoch, targetIndex, audioEntries.map { it.key }.toSet()),
      targetId, entries, voices.values.filter { it.belongsToMainSequence }.mapTo(mutableSetOf()) { it.id },
      pendingDelayedActions.filter { it.mainTransport }.toSet(), epoch, crossfade, startIncoming)
    rootAdmission = admission
    transitioning = true
    rootHeldForGo = false
    try {
      audioEntries.forEach { entry ->
        val cue = entry.cue!!
        val preparedCue = if (crossfade != null) cue.copy(fadeInMs = crossfade.cue.crossfadeMs) else cue
        val origin = if (show.groups.containsKey(targetId)) TriggerOrigin.MAIN_GROUP_CHILD else TriggerOrigin.MAIN_STACK
        val voice = createVoice(preparedCue, origin, mainRootEpoch + 1, entry.key)
        preparedRootVoices[entry.key] = voice
        voice.player.prepare()
      }
      if (admission.gate.phase == RootAdmissionPhase.PREPARING) {
        val timeout = Runnable { refuseRootAdmission(admission, "PREPARE_TIMEOUT", "Incoming audio did not become ready. The current cue was retained; retry deliberately.") }
        admission.timeout = timeout
        commands.postDelayed(timeout, 5_000)
      }
      maybeBeginRootAdmission(admission)
      scheduleProgress()
      emitRunState()
    } catch (error: Exception) {
      refuseRootAdmission(admission, "PREPARE_FAILED", "Incoming audio could not be prepared. The current cue was retained; retry deliberately.")
      if (recoveryRequired || interruptionGate.isBlocked) throw error
      throw NativeCommandException("RECOVERABLE_REFUSAL", "Incoming audio could not be prepared; the current cue was retained.")
    }
  }

  private fun rootAdmissionIsCurrent(admission: RootAdmission): Boolean = rootAdmission === admission &&
    admission.gate.isCurrent(triggerGeneration, mainRootEpoch) && !destroyed && !shutdownRequested &&
    !recoveryRequired && !interruptionGate.isBlocked && NativeRemoteCoordinator.isCurrentCommand(admission.controllerEpoch)

  private fun releasePreparedRootVoice(key: String) {
    preparedRootVoices.remove(key)?.let { voice -> voice.envelope.emergencyMute(); runCatching(voice.player::release) }
  }

  private fun cancelRootAdmission() {
    val admission = rootAdmission ?: return
    rootAdmission = null
    admission.gate.cancel()
    admission.timeout?.let(commands::removeCallbacks)
    admission.entries.forEach { releasePreparedRootVoice(it.key) }
  }

  private fun refuseRootAdmission(admission: RootAdmission, code: String, message: String) {
    if (!rootAdmissionIsCurrent(admission) || !admission.gate.refuse(triggerGeneration, mainRootEpoch)) return
    refusedAutomaticCrossfadeVoiceId = admission.crossfade?.id
    cancelRootAdmission()
    rootHeldForGo = mainCueId != null
    transitioning = false
    lastRootRefusal = mapOf("code" to code, "message" to message)
    emit(mapOf("type" to "TRANSITION_REFUSED", "code" to code, "message" to message, "cueId" to admission.targetCueId,
      "generation" to triggerGeneration, "monotonicMs" to SystemClock.elapsedRealtime()))
    emitRunState()
  }

  private fun maybeBeginRootAdmission(admission: RootAdmission) {
    if (rootAdmissionIsCurrent(admission) && admission.gate.phase == RootAdmissionPhase.READY) {
      admission.timeout?.let(commands::removeCallbacks)
      admission.timeout = null
    }
    if (rootAdmissionIsCurrent(admission) && admission.gate.phase == RootAdmissionPhase.READY && !enginePaused && admission.entries.any { it.cue != null } && voices.isEmpty() && !requestAudioFocus()) {
      refuseRootAdmission(admission, "AUDIO_FOCUS_DENIED", "Android did not grant audio focus. The current cue was retained; retry deliberately.")
      return
    }
    if (!rootAdmissionIsCurrent(admission) || !admission.gate.beginFade(triggerGeneration, mainRootEpoch, enginePaused)) return
    admission.timeout?.let(commands::removeCallbacks)
    admission.outgoingActions.forEach(::cancelDelayedAction)
    cancelPendingAutoWait()
    val outgoing = admission.outgoingVoiceIds.mapNotNull(voices::get)
    val delay = if (admission.crossfade != null) admission.entries.firstOrNull()?.delayMs ?: 0 else outgoing.maxOfOrNull { it.cue.fadeOutMs } ?: 0
    if (admission.crossfade == null) outgoing.forEach { fadeVoiceIds(setOf(it.id), it.cue.fadeOutMs, it.cue.curve, true) }
    scheduleDelayedAction(null, delay, triggerGeneration, false, rootEpoch = mainRootEpoch,
      onCancel = { if (rootAdmission === admission) { cancelRootAdmission(); transitioning = false; rootHeldForGo = mainCueId != null } }) {
      admission.exitDelayElapsed = true
      maybeCommitRootAdmission(admission)
    }
    emitRunState()
  }

  private fun maybeCommitRootAdmission(admission: RootAdmission) {
    if (rootAdmissionIsCurrent(admission) && rootExitReady(admission.exitDelayElapsed, admission.crossfade != null, admission.outgoingVoiceIds.count(voices::containsKey))) commitRootAdmission(admission)
  }

  private fun commitRootAdmission(admission: RootAdmission) {
    if (!rootAdmissionIsCurrent(admission) || !admission.gate.commit(triggerGeneration, mainRootEpoch, enginePaused)) return
    rootAdmission = null
    rootLaunching = true
    try {
      pendingDelayedActions.filter { it.mainTransport }.toList().forEach(::cancelDelayedAction)
      reservedVoiceCount += admission.entries.count { it.cue != null }
      if (admission.crossfade == null) stopVoiceIds(admission.outgoingVoiceIds)
      mainRootEpoch += 1
      rootCompletionQueued = null
      rootHeldForGo = false
      lastRootRefusal = null
      refusedAutomaticCrossfadeVoiceId = null
      rootAdvanceOnCompletion = true
      rootForceAutoplay = false
      selectedIndex = admission.gate.targetIndex
      mainCueId = admission.targetCueId.takeIf { admission.startIncoming }
      mainVoiceId = null
      goIndex = if (mainCueId == null) selectedIndex else selectedIndex + 1
      rootAwaitingFirstStart = admission.entries.any { it.cue != null }
      transitioning = rootAwaitingFirstStart
      val rootEpoch = mainRootEpoch
      val generation = triggerGeneration
      val overlap = admission.crossfade?.let { OmsCrossfadeTransition(it.id, generation) }
      omsCrossfade = overlap
      admission.entries.forEach { entry ->
        val audio = entry.cue
        if (audio != null) {
          scheduleDelayedAction(audio, if (overlap != null) 0 else entry.delayMs, generation, true, rootEpoch = rootEpoch,
            onCancel = { releasePreparedRootVoice(entry.key) }) { pending ->
            val voice = preparedRootVoices.remove(entry.key) ?: throw NativeCommandException("PREPARED_VOICE_LOST", "Incoming audio preparation was lost.")
            try {
              adoptVoice(voice, pending.generation, alreadyPrepared = true, controllerEpoch = admission.controllerEpoch) {
                if (rootEpoch != mainRootEpoch) return@adoptVoice
                rootAwaitingFirstStart = false
                if (overlap == null) transitioning = false
                else if (omsCrossfade === overlap) {
                  overlap.incomingStarted = true
                  fadeVoiceIds(setOf(overlap.outgoingVoiceId), admission.crossfade!!.cue.crossfadeMs, admission.crossfade.cue.curve, true)
                  finishOmsCrossfadeIfReady()
                }
                emitRunState()
              }
            } catch (error: Exception) { runCatching(voice.player::release); throw error }
            finally { consumeVoiceReservation(pending) }
          }
        } else scheduleDelayedAction(null, entry.delayMs, generation, false, rootEpoch = rootEpoch) { executeRootControl(entry.cueId, rootEpoch) }
      }
      updateActiveSignal()
      updateTransportPlayback()
    } finally { rootLaunching = false }
    checkRootCompletion()
    emitRunState()
  }

  private fun executeRootControl(cueId: String, epoch: Long) {
    if (epoch != mainRootEpoch) return
    val show = prepared ?: return
    show.fades[cueId]?.let {
      fade(it.selector, it.durationMs, it.curve, it.stopAtEnd, rootControl = true)
      val standalone = mainCueId == cueId
      if (standalone) transitioning = it.durationMs > 0
      scheduleDelayedAction(null, it.durationMs, triggerGeneration, false, rootEpoch = epoch) { if (standalone) transitioning = false }
    }
    show.stops[cueId]?.let { stopSelected(it.selector, rootControl = true) }
    show.waits[cueId]?.let { wait ->
      if (!wait.continueAutomatically) rootHeldForGo = true
      else {
        rootForceAutoplay = true
        transitioning = true
        scheduleDelayedAction(null, wait.durationMs, triggerGeneration, false, rootEpoch = epoch) { transitioning = false }
      }
    }
  }

  private fun checkRootCompletion() {
    if (prepared?.transportMode != "oms" || recoveryRequired || interruptionGate.isBlocked || enginePaused) return
    if (!rootLaunching && rootAdmission == null && rootAwaitingFirstStart && voices.values.none { it.rootEpoch == mainRootEpoch } && pendingDelayedActions.none { it.rootEpoch == mainRootEpoch }) {
      rootAwaitingFirstStart = false
      if (omsCrossfade == null) transitioning = false
    }
    val epoch = mainRootEpoch
    if (!rootCanComplete(mainCueId != null, rootLaunching, transitioning || rootAdmission != null,
        voices.values.count { it.rootEpoch == epoch }, pendingDelayedActions.count { it.rootEpoch == epoch }, rootHeldForGo) || rootCompletionQueued == epoch) return
    rootCompletionQueued = epoch
    val generation = triggerGeneration
    commands.post {
      if (rootCompletionQueued == epoch) rootCompletionQueued = null
      if (generation == triggerGeneration && epoch == mainRootEpoch && !enginePaused &&
        rootCanComplete(mainCueId != null, rootLaunching, transitioning || rootAdmission != null,
          voices.values.count { it.rootEpoch == epoch }, pendingDelayedActions.count { it.rootEpoch == epoch }, rootHeldForGo)) {
        try { finishOmsMainNaturally() } catch (error: Exception) {
          if ((error as? NativeCommandException)?.code != "RECOVERABLE_REFUSAL") {
            safeStopInternal("root_completion_failed", true)
            emitFault("ROOT_COMPLETION_FAILED", "The completed cue requires explicit recovery.")
          }
        }
      }
    }
  }

  private fun runState(): Map<String, Any?> {
    val show = prepared
    val selected = show?.cueOrder?.getOrNull(selectedIndex) ?: ""
    val now = SystemClock.elapsedRealtime()
    val remaining = if (transitioning) pendingDelayedActions.filter { it.mainTransport }.minOfOrNull { if (enginePaused) it.remainingMs else (it.dueAtMonotonicMs - now).coerceAtLeast(0) } ?: 0 else 0
    val legacy = show?.transportMode != "oms"
    val nextIndex = if (legacy) goIndex else selectedIndex + 1
    val legacyPlaying = legacy && (voices.isNotEmpty() || pendingDelayedActions.isNotEmpty() || pendingAutoWait != null)
    val phase = when { recoveryRequired || interruptionGate.isBlocked -> "interrupted"; enginePaused -> "paused"; transitioning -> "fading"; legacyPlaying || !legacy && mainCueId != null || mainVoiceId?.let(voices::containsKey) == true -> "playing"; selected.isEmpty() -> "stopped"; else -> "ready" }
    return mapOf("type" to "RUN_STATE", "generation" to triggerGeneration, "monotonicMs" to now, "transportMode" to (show?.transportMode ?: "legacyCueStack"), "sessionPurpose" to (show?.sessionPurpose ?: "performance"), "phase" to phase,
      "showId" to (show?.showId ?: ""), "setId" to (show?.setId ?: ""), "revisionId" to (show?.revisionId ?: ""),
      "selectedCueId" to selected, "currentCueId" to (mainCueId ?: ""), "nextCueId" to (show?.cueOrder?.getOrNull(nextIndex) ?: ""),
      "currentCueIndex" to if (mainCueId == null) -1 else selectedIndex, "nextCueIndex" to nextIndex,
      "activeVoiceCount" to voices.size, "hasPendingActions" to (pendingDelayedActions.isNotEmpty() || pendingAutoWait != null || reservedVoiceCount > 0 || rootAdmission != null || rootHeldForGo),
      "mainSequenceVoiceCount" to voices.values.count { it.belongsToMainSequence },
      "transitionRefusal" to lastRootRefusal,
      "countdownRemainingMs" to remaining, "playbackRate" to (mainCueId?.let { show?.audio?.get(it)?.playbackRate } ?: 1.0), "nativeCommandId" to nativeSequence)
  }

  private fun emitRunState() {
    if (previewMode || preparingSnapshot) return
    refreshNotificationMetadata()
    publishSystemMediaState()
    val state = runState()
    main.post { ShowAudioRuntime.emit(this, state) }
    sendRunBroadcast(state)
  }

  private fun trigger(cueId: String, generation: Long, origin: TriggerOrigin) {
    if (generation != triggerGeneration) {
      throw NativeCommandException("STALE_TRIGGER", "The cue belongs to a cancelled run generation.")
    }
    if (recoveryRequired || interruptionGate.isBlocked) {
      throw NativeCommandException(
        "RECOVERY_REQUIRED",
        "The audio engine requires explicit recovery and a fresh prepared snapshot.",
      )
    }
    if (enginePaused) {
      throw NativeCommandException("ENGINE_PAUSED", "Resume the audio engine before triggering another cue.")
    }
    val show = prepared
      ?: throw NativeCommandException("ENGINE_NOT_PREPARED", "The native engine is not prepared.")
    show.audio[cueId]?.let { cue ->
      admitAudioCues(listOf(cue), independent = !origin.belongsToMainSequence)
      if (cue.preWaitMs > 0) {
        scheduleReservedAudioStart(cue, cue.preWaitMs, generation, origin)
        emit(mapOf("type" to "STATE", "state" to "playing"))
      } else {
        startReservedVoice(cue, generation, origin)
      }
      return
    }
    show.groups[cueId]?.let { group ->
      admitAndScheduleGroup(show, group, generation, origin)
      return
    }
    show.fades[cueId]?.let {
      fade(it.selector, it.durationMs, it.curve, it.stopAtEnd)
      return
    }
    show.stops[cueId]?.let {
      stopSelected(it.selector)
      return
    }
    show.waits[cueId]?.let {
      triggerWait(it, generation, origin)
      return
    }
    throw NativeCommandException("CUE_UNAVAILABLE", "Cue $cueId is unavailable.")
  }

  private fun admitAudioCues(cues: List<AudioCueSpec>, independent: Boolean = false) {
    if (cues.isEmpty()) return
    requireSystemAudioAvailable()
    val admissionEpoch = interruptionGate.epoch
    if (!interruptionGate.admits(admissionEpoch, explicitRecoveryEpoch == admissionEpoch)) {
      throw NativeCommandException("RECOVERY_REQUIRED", "Prepare again after interruption.")
    }
    val admittedVoiceCount = voices.size + reservedVoiceCount
    val admission = rootAdmission
    if (independent && admission != null && !rootFutureCapacity(voices.values.count { !it.belongsToMainSequence },
        pendingDelayedActions.count { it.reservationHeld && !it.mainTransport }, admission.entries.count { it.cue != null }, cues.size)) {
      refuseRootCommand("CAPACITY_REFUSAL", "The Hit would use a voice slot reserved for the incoming cue.", cues.first().id)
    }
    if (admittedVoiceCount + cues.size > VOICE_LIMIT) {
      emit(
        mapOf(
          "type" to "CAPACITY_REFUSAL",
          "cueId" to cues.first().id,
          "activeVoices" to voices.size,
          "pendingVoices" to reservedVoiceCount,
          "requestedVoices" to cues.size,
          "limit" to VOICE_LIMIT,
        ),
      )
      refuseRootCommand("CAPACITY_REFUSAL", "The cue needs ${cues.size} voice slot(s), but only ${VOICE_LIMIT - admittedVoiceCount} remain.", cues.first().id)
    }
    cues.forEach { cue ->
      if (!cue.file.isFile || !isAppOwned(cue.file)) {
        throw NativeCommandException(
          "MEDIA_NOT_LOCAL",
          "Cue ${cue.id} media is missing or outside app-owned storage.",
        )
      }
    }
    if (admittedVoiceCount == 0 && !requestAudioFocus(explicitRecoveryEpoch)) {
      throw NativeCommandException("AUDIO_FOCUS_DENIED", "Android did not grant audio focus.")
    }
    reservedVoiceCount += cues.size
    updateActiveSignal()
    updateTransportPlayback()
  }

  private fun admitAndScheduleGroup(show: PreparedShow, group: GroupSpec, generation: Long, origin: TriggerOrigin) {
    val audioChildren = group.children.mapNotNull { show.audio[it.cueId] }
    // Capacity, media and focus are admitted for the complete group before any
    // child is posted, so a group can never partially start because slot 8 was
    // consumed between child offsets.
    admitAudioCues(audioChildren, independent = !origin.belongsToMainSequence)
    group.children.forEach { child ->
      val audio = show.audio[child.cueId]
      if (audio != null) {
        scheduleReservedAudioStart(
          cue = audio,
          delayMs = saturatedAdd(child.offsetMs, audio.preWaitMs),
          generation = generation,
          origin = origin.groupChild(),
        )
      } else {
        scheduleDelayedAction(
          cue = null,
          delayMs = child.offsetMs,
          generation = generation,
          reservationHeld = false,
          mainTransport = origin.belongsToMainSequence,
        ) {
          executeDeferredGroupChild(show, child.cueId)
        }
      }
    }
    if (group.children.isEmpty()) emitAuthoritativeState()
    else emit(mapOf("type" to "STATE", "state" to "playing"))
  }

  private fun executeDeferredGroupChild(show: PreparedShow, cueId: String) {
    show.fades[cueId]?.let {
      fade(it.selector, it.durationMs, it.curve, it.stopAtEnd)
      return
    }
    show.stops[cueId]?.let {
      stopSelected(it.selector)
      return
    }
    throw NativeCommandException("CUE_UNAVAILABLE", "Deferred group child $cueId is unavailable.")
  }

  private fun scheduleReservedAudioStart(
    cue: AudioCueSpec,
    delayMs: Long,
    generation: Long,
    origin: TriggerOrigin,
  ) {
    scheduleDelayedAction(cue, delayMs, generation, reservationHeld = true, mainTransport = origin.belongsToMainSequence) { pending ->
      try {
        startVoice(cue, pending.generation, origin)
      } finally {
        consumeVoiceReservation(pending)
      }
    }
  }

  private fun scheduleDelayedAction(
    cue: AudioCueSpec?,
    delayMs: Long,
    generation: Long,
    reservationHeld: Boolean,
    mainTransport: Boolean = true,
    rootEpoch: Long? = null,
    onCancel: (() -> Unit)? = null,
    fire: (PendingDelayedAction) -> Unit,
  ) {
    val pending = PendingDelayedAction(
      cue = cue,
      generation = generation,
      remainingMs = delayMs.coerceAtLeast(0),
      reservationHeld = reservationHeld,
      fire = fire,
      mainTransport = mainTransport,
      rootEpoch = rootEpoch,
      onCancel = onCancel,
    )
    pendingDelayedActions += pending
    if (!enginePaused) armDelayedAction(pending)
  }

  private fun armDelayedAction(pending: PendingDelayedAction) {
    if (!pendingDelayedActions.contains(pending)) return
    val callback = Runnable {
      if (!pendingDelayedActions.remove(pending)) return@Runnable
      pending.callback = null
      if (pending.generation != triggerGeneration || pending.rootEpoch != null && pending.rootEpoch != mainRootEpoch || recoveryRequired || interruptionGate.isBlocked) {
        releaseVoiceReservation(pending)
        pending.onCancel?.invoke()
        return@Runnable
      }
      try {
        pending.fire(pending)
        checkRootCompletion()
      } catch (error: Exception) {
        releaseVoiceReservation(pending)
        pending.onCancel?.invoke()
        transitioning = false
        val message = error.message ?: "A delayed native cue could not start."
        val code = (error as? NativeCommandException)?.code ?: "DELAYED_CUE_FAILED"
        if (code != "RECOVERABLE_REFUSAL") {
          if (pending.rootEpoch != null) safeStopInternal("root_action_failed", true)
          emitFault(code, message)
        }
        if (voices.isEmpty() && reservedVoiceCount == 0) abandonAudioFocus()
        emitAuthoritativeState()
      }
    }
    pending.callback = callback
    pending.dueAtMonotonicMs = saturatedAdd(SystemClock.elapsedRealtime(), pending.remainingMs)
    commands.postDelayed(callback, pending.remainingMs)
  }

  private fun consumeVoiceReservation(pending: PendingDelayedAction) {
    if (!pending.reservationHeld) {
      throw NativeCommandException("VOICE_RESERVATION_LOST", "The delayed cue lost its reserved voice slot.")
    }
    pending.reservationHeld = false
    reservedVoiceCount = (reservedVoiceCount - 1).coerceAtLeast(0)
    updateActiveSignal()
  }

  private fun releaseVoiceReservation(pending: PendingDelayedAction) {
    if (!pending.reservationHeld) return
    pending.reservationHeld = false
    reservedVoiceCount = (reservedVoiceCount - 1).coerceAtLeast(0)
    updateActiveSignal()
  }

  private fun startReservedVoice(cue: AudioCueSpec, generation: Long, origin: TriggerOrigin, onStarted: (() -> Unit)? = null) {
    val reservation = PendingDelayedAction(cue, generation, 0, true, {})
    try {
      startVoice(cue, generation, origin, onStarted)
    } finally {
      consumeVoiceReservation(reservation)
      if (voices.isEmpty() && reservedVoiceCount == 0) abandonAudioFocus()
    }
  }

  private fun startVoice(cue: AudioCueSpec, generation: Long, origin: TriggerOrigin, onStarted: (() -> Unit)? = null) {
    requireSystemAudioAvailable()
    val admissionEpoch = interruptionGate.epoch
    if (generation != triggerGeneration || recoveryRequired || !interruptionGate.admits(admissionEpoch, explicitRecoveryEpoch == admissionEpoch)) {
      throw NativeCommandException("STALE_TRIGGER", "The delayed cue belongs to a cancelled run generation.")
    }
    if (!cue.file.isFile || !isAppOwned(cue.file)) {
      throw NativeCommandException("MEDIA_NOT_LOCAL", "Cue media is missing or outside app-owned storage.")
    }
    val controllerEpoch = NativeRemoteCoordinator.commandEpoch("VOICE_PREPARATION")
    val voice = createVoice(cue, origin, null)
    try { adoptVoice(voice, generation, false, controllerEpoch = controllerEpoch, onStarted = onStarted) }
    catch (error: Exception) {
      voices.remove(voice.id)
      onVoiceStarted.remove(voice.id)
      if (mainVoiceId == voice.id) mainVoiceId = null
      processors.remove(voice.envelope)
      runCatching(voice.player::release)
      throw error
    }
  }

  /** Quiet players stay outside active voices, events, visuals and system clocks. */
  private fun createVoice(cue: AudioCueSpec, origin: TriggerOrigin, rootEpoch: Long?, voiceId: String = UUID.randomUUID().toString()): Voice {
    val envelope = PcmGainEnvelopeProcessor(interruptionGate)
    val effectiveDurationMs = ((cue.trimOutMs ?: cue.sourceDurationMs) - cue.trimInMs).coerceAtLeast(0)
    val fadeOutStart = if (cue.endBehavior != "loop" && cue.fadeOutMs > 0 && effectiveDurationMs > 0) {
      (effectiveDurationMs - (cue.fadeOutMs * cue.playbackRate).toLong()).coerceAtLeast(0)
    } else {
      null
    }
    envelope.configureCue(
      baseGain = cue.gain,
      fadeInMs = cue.fadeInMs,
      fadeOutStartMs = fadeOutStart,
      fadeOutDurationMs = cue.fadeOutMs,
      curve = cue.curve,
      rate = cue.playbackRate,
    )

    val renderers = object : DefaultRenderersFactory(this) {
      override fun buildAudioSink(
        context: Context,
        enableFloatOutput: Boolean,
        enableAudioOutputPlaybackParams: Boolean,
      ): AudioSink = DefaultAudioSink.Builder(context)
        .setEnableFloatOutput(false)
        .setAudioProcessors(arrayOf(envelope))
        .build()
    }

    val player = ExoPlayer.Builder(this, renderers)
      .setLooper(commandThread.looper)
      .setAudioAttributes(mediaAudioAttributes(), false)
      .setHandleAudioBecomingNoisy(false)
      .setWakeMode(C.WAKE_MODE_LOCAL)
      .build()

    try {
      val itemBuilder = MediaItem.Builder()
        .setMediaId(cue.id)
        .setUri(Uri.fromFile(cue.file))
      val clipping = MediaItem.ClippingConfiguration.Builder()
        .setStartPositionMs(cue.trimInMs)
      cue.trimOutMs?.let(clipping::setEndPositionMs)
      itemBuilder.setClippingConfiguration(clipping.build())

      val voice = Voice(
        id = voiceId,
        cue = cue,
        player = player,
        envelope = envelope,
        mayAutoFollowMainStack = origin.mayAutoFollowMainStack,
        belongsToMainSequence = origin.belongsToMainSequence,
        rootEpoch = rootEpoch,
      )
      player.addListener(object : Player.Listener {
        private var started = false
        override fun onIsPlayingChanged(isPlaying: Boolean) {
          if (isPlaying && !started && voices[voiceId] === voice) {
            started = true
            emit(mapOf("type" to "VOICE_START", "cueId" to cue.id, "voiceId" to voiceId, "mainTransport" to voice.mayAutoFollowMainStack))
            if (voice.rootEpoch == null && isPrimaryMainVoice(voice.id, mainVoiceId, voice.mayAutoFollowMainStack) && omsCrossfade == null) transitioning = false
            onVoiceStarted.remove(voiceId)?.invoke()
            emitRunState()
          }
        }
        override fun onPlaybackStateChanged(playbackState: Int) {
          if (playbackState == Player.STATE_READY && preparedRootVoices[voiceId] === voice) {
            val admission = rootAdmission
            if (admission != null && admission.gate.markReady(voiceId, triggerGeneration, mainRootEpoch)) maybeBeginRootAdmission(admission)
          }
          if (playbackState == Player.STATE_ENDED && voices[voiceId] === voice) finishVoice(voiceId, naturalEnd = true)
        }

        override fun onPlayerError(error: PlaybackException) {
          if (preparedRootVoices[voiceId] === voice) {
            val admission = rootAdmission
            if (admission != null && admission.entries.any { it.key == voiceId } && admission.gate.phase in setOf(RootAdmissionPhase.PREPARING, RootAdmissionPhase.READY)) {
              refuseRootAdmission(admission, "DECODE_FAILED", "Incoming audio could not be decoded. The current cue was retained; repair the media before retrying.")
            } else {
              safeStopInternal("incoming_decode_failed", true)
              emitFault("DECODE_FAILED", "Admitted incoming audio failed. Prepare again before continuing.")
            }
            return
          }
          if (voices[voiceId] !== voice) return
          onVoiceStarted.remove(voiceId)
          if (voice.rootEpoch != null) {
            safeStopInternal("decode_failed", true)
            emitFault("DECODE_FAILED", "A main cue could not be decoded. Prepare again before continuing.")
            return
          }
          if (isPrimaryMainVoice(voice.id, mainVoiceId, voice.mayAutoFollowMainStack)) { transitioning = false; mainCueId = null; mainVoiceId = null; recoveryRequired = true }
          emitFault("DECODE_FAILED", "A local cue could not be decoded.")
          finishVoice(voiceId, naturalEnd = false)
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
          if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT) {
            envelope.restartCueTimeline()
          }
        }
      })
      player.repeatMode = if (cue.endBehavior == "loop") Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
      player.playbackParameters = PlaybackParameters(cue.playbackRate.toFloat(), 1f)
      player.setMediaItem(itemBuilder.build())
      return voice
    } catch (error: Exception) {
      voices.remove(voiceId)
      onVoiceStarted.remove(voiceId)
      if (mainVoiceId == voiceId) mainVoiceId = null
      processors.remove(envelope)
      runCatching(player::release)
      throw NativeCommandException(
        "CUE_START_FAILED",
        error.message ?: "The local cue player could not be initialized.",
      )
    }
  }

  private fun adoptVoice(voice: Voice, generation: Long, alreadyPrepared: Boolean, controllerEpoch: Long? = null, onStarted: (() -> Unit)? = null) {
    requireSystemAudioAvailable()
    val epoch = interruptionGate.epoch
    if (generation != triggerGeneration || recoveryRequired || !interruptionGate.admits(epoch, explicitRecoveryEpoch == epoch) ||
      controllerEpoch != null && !NativeRemoteCoordinator.isCurrentCommand(controllerEpoch) ||
      voice.rootEpoch != null && voice.rootEpoch != mainRootEpoch) throw NativeCommandException("STALE_TRIGGER", "Incoming audio belongs to a cancelled run.")
    if (voices.size >= VOICE_LIMIT) throw NativeCommandException("CAPACITY_REFUSAL", "The reserved voice slot is unavailable.")
    if (!alreadyPrepared) voice.player.prepare()
    val register = {
      voices[voice.id] = voice
      if (voice.mayAutoFollowMainStack) mainVoiceId = voice.id
      if (onStarted != null) onVoiceStarted[voice.id] = onStarted
      processors.add(voice.envelope)
      hasActiveVoices.set(true)
      if (!enginePaused) voice.player.play()
    }
    if (controllerEpoch == null) register()
    else if (!NativeRemoteCoordinator.whileCurrentCommand(controllerEpoch, register)) throw NativeCommandException("STALE_TRIGGER", "Audio was cancelled before admission.")
    updateTransportPlayback()
    emit(mapOf("type" to "STATE", "state" to "playing"))
    scheduleProgress()
    emitRunState()
  }

  private fun finishVoice(voiceId: String, naturalEnd: Boolean) {
    val voice = voices.remove(voiceId) ?: return
    val wasMainVoice = isPrimaryMainVoice(voice.id, mainVoiceId, voice.mayAutoFollowMainStack)
    if (wasMainVoice) mainVoiceId = null
    onVoiceStarted.remove(voiceId)
    invalidateFadeTracking(setOf(voiceId))
    processors.remove(voice.envelope)
    voice.player.release()
    emit(mapOf("type" to "VOICE_END", "cueId" to voice.cue.id, "voiceId" to voice.id, "mainTransport" to voice.mayAutoFollowMainStack))
    afterVoiceSetChanged()
    if (prepared?.transportMode == "oms" && voice.rootEpoch != null) { checkRootCompletion(); return }
    if (
      naturalEnd &&
      voice.mayAutoFollowMainStack &&
      voice.cue.endBehavior == "autoFollow" && prepared?.transportMode != "oms"
    ) {
      val show = prepared ?: return
      val endedIndex = show.cueOrder.indexOf(voice.cue.id)
      if (endedIndex < 0) return
      val nextId = show.cueOrder.getOrNull(endedIndex + 1) ?: run { emitRunState(); return }
      try {
        trigger(nextId, triggerGeneration, TriggerOrigin.MAIN_STACK)
        selectedIndex = endedIndex + 1
        mainCueId = nextId
        goIndex = maxOf(goIndex, endedIndex + 2)
        emit(
          mapOf(
            "type" to "REMOTE_COMMAND",
            "command" to "GO",
            "handledNatively" to true,
            "cueId" to nextId,
            "reason" to "audio-auto-follow",
          ),
        )
      } catch (error: Exception) {
        val code = (error as? NativeCommandException)?.code ?: "AUTO_FOLLOW_REJECTED"
        emitFault(code, error.message ?: "The next automatic cue was rejected.")
      }
    }
    emitRunState()
  }

  private fun triggerWait(wait: WaitSpec, generation: Long, origin: TriggerOrigin) {
    // A Hit or group child is never permitted to move the ordered GO stack.
    if (!wait.continueAutomatically || origin != TriggerOrigin.MAIN_STACK) {
      emit(mapOf("type" to "STATE", "state" to "ready"))
      return
    }

    cancelPendingAutoWait()
    val pending = PendingAutoWait(
      cueId = wait.id,
      generation = generation,
      remainingMs = wait.durationMs,
    )
    pendingAutoWait = pending
    if (!enginePaused) armAutoWait(pending)
    updateTransportPlayback()
    emit(mapOf("type" to "STATE", "state" to if (enginePaused) "paused" else "playing"))
  }

  private fun armAutoWait(pending: PendingAutoWait) {
    if (pendingAutoWait !== pending || pending.generation != triggerGeneration) return
    val callback = Runnable {
      if (pendingAutoWait !== pending || pending.generation != triggerGeneration) return@Runnable
      pendingAutoWait = null
      pending.callback = null
      continueMainStackAfter(pending.cueId, pending.generation)
    }
    pending.callback = callback
    pending.dueAtMonotonicMs = saturatedAdd(SystemClock.elapsedRealtime(), pending.remainingMs)
    commands.postDelayed(callback, pending.remainingMs)
  }

  private fun continueMainStackAfter(cueId: String, generation: Long) {
    val show = prepared ?: return
    val completedIndex = show.cueOrder.indexOf(cueId)
    if (completedIndex < 0) return
    val nextIndex = completedIndex + 1
    val nextId = show.cueOrder.getOrNull(nextIndex) ?: run {
      updateTransportPlayback()
      emit(mapOf("type" to "STATE", "state" to "stopped"))
      emitRunState()
      return
    }
    try {
      trigger(nextId, generation, TriggerOrigin.MAIN_STACK)
      selectedIndex = nextIndex
      mainCueId = nextId
      goIndex = maxOf(goIndex, nextIndex + 1)
      emit(
        mapOf(
          "type" to "REMOTE_COMMAND",
          "command" to "GO",
          "handledNatively" to true,
          "cueId" to nextId,
          "reason" to "wait-auto-follow",
        ),
      )
    } catch (error: Exception) {
      val code = (error as? NativeCommandException)?.code ?: "AUTO_FOLLOW_REJECTED"
      emitFault(code, error.message ?: "The next automatic cue was rejected.")
      emitAuthoritativeState()
    }
    emitRunState()
  }

  private fun pausePendingAutoWait() {
    val pending = pendingAutoWait ?: return
    val callback = pending.callback ?: return
    commands.removeCallbacks(callback)
    pending.callback = null
    pending.remainingMs = (pending.dueAtMonotonicMs - SystemClock.elapsedRealtime()).coerceAtLeast(0)
  }

  private fun resumePendingAutoWait() {
    pendingAutoWait?.let(::armAutoWait)
  }

  private fun cancelPendingAutoWait() {
    pendingAutoWait?.callback?.let(commands::removeCallbacks)
    pendingAutoWait = null
  }

  private fun pausePendingDelayedActions() {
    pendingDelayedActions.forEach { pending ->
      val callback = pending.callback ?: return@forEach
      commands.removeCallbacks(callback)
      pending.callback = null
      pending.remainingMs =
        (pending.dueAtMonotonicMs - SystemClock.elapsedRealtime()).coerceAtLeast(0)
    }
  }

  private fun resumePendingDelayedActions() {
    pendingDelayedActions.toList().forEach(::armDelayedAction)
  }

  private fun cancelAllDelayedActions() {
    pendingDelayedActions.toList().forEach(::cancelDelayedAction)
    reservedVoiceCount = 0
    updateActiveSignal()
  }

  private fun cancelDelayedAction(pending: PendingDelayedAction) {
    if (!pendingDelayedActions.remove(pending)) return
    pending.callback?.let(commands::removeCallbacks)
    pending.callback = null
    releaseVoiceReservation(pending)
    pending.onCancel?.invoke()
  }

  private fun cancelPendingStarts(selector: Selector) {
    val selected = pendingDelayedActions.filter { pending ->
      when (selector) {
        Selector.All -> true
        is Selector.CueIds -> pending.cue?.id?.let(selector.values::contains) == true
        is Selector.Tags -> pending.cue?.tags?.any(selector.values::contains) == true
      }
    }
    selected.forEach(::cancelDelayedAction)
    if (voices.isEmpty() && reservedVoiceCount == 0) abandonAudioFocus()
    checkRootCompletion()
  }

  private fun pauseAll() {
    if (recoveryRequired) {
      throw NativeCommandException("RECOVERY_REQUIRED", "The interrupted engine cannot be paused or resumed.")
    }
    if (enginePaused) {
      throw NativeCommandException("ALREADY_PAUSED", "The audio engine is already paused.")
    }
    if (voices.isEmpty() && pendingDelayedActions.isEmpty() && pendingAutoWait == null && rootAdmission == null && !rootHeldForGo) {
      throw NativeCommandException("NOTHING_TO_PAUSE", "There is no active or pending cue to pause.")
    }
    enginePaused = true
    pausePendingAutoWait()
    pausePendingDelayedActions()
    voices.values.forEach { it.player.pause() }
    updateTransportPlayback()
    emit(mapOf("type" to "STATE", "state" to "paused"))
  }

  private fun resumeAll() {
    requireSystemAudioAvailable()
    if (recoveryRequired || interruptionGate.isBlocked) {
      throw NativeCommandException("RECOVERY_REQUIRED", "Prepare the engine again after interruption.")
    }
    if (!enginePaused) {
      throw NativeCommandException("NOT_PAUSED", "There is no paused native playback to resume.")
    }
    if (voices.isNotEmpty() && !requestAudioFocus()) {
      throw NativeCommandException("AUDIO_FOCUS_DENIED", "Android did not grant audio focus.")
    }
    enginePaused = false
    resumePendingAutoWait()
    resumePendingDelayedActions()
    voices.values.forEach { it.player.play() }
    rootAdmission?.let(::maybeBeginRootAdmission)
    checkRootCompletion()
    updateTransportPlayback()
    emit(mapOf("type" to "STATE", "state" to "playing"))
  }

  private fun panicFade() {
    invalidateRootTransport()
    omsCrossfade = null
    if (enginePaused || voices.isEmpty()) {
      // Paused PCM cannot advance a render-time fade. Silent countdowns have
      // nothing to fade either; cancel their work and release every reservation.
      safeStopInternal("panic", emitInterruption = false)
      emitAuthoritativeState()
      return
    }
    mainCueId = null
    transitioning = true
    emitSafetyStop("panic")
    triggerGeneration = ShowAudioRuntime.nextGeneration()
    cancelPendingAutoWait()
    cancelAllDelayedActions()
    val durationMs = prepared?.panicFadeMs ?: DEFAULT_PANIC_MS
    fade(Selector.All, durationMs, PcmGainEnvelopeProcessor.Curve.SMOOTH, stopAtEnd = true)
  }

  private fun fade(
    selector: Selector,
    durationMs: Long,
    curve: PcmGainEnvelopeProcessor.Curve,
    stopAtEnd: Boolean,
    rootControl: Boolean = false,
  ) {
    if (stopAtEnd) {
      if (!rootControl && (selectVoices(selector).any { it.rootEpoch == mainRootEpoch } || pendingDelayedActions.any { it.rootEpoch == mainRootEpoch && matchesSelector(selector, it.cue) })) rootAdvanceOnCompletion = false
      rootAdmission?.takeIf { admission -> selector == Selector.All || admission.entries.any { matchesSelector(selector, it.cue) } }?.let { cancelRootAdmission(); transitioning = false; rootHeldForGo = mainCueId != null }
      cancelPendingStarts(selector)
    }
    fadeVoiceIds(selectVoices(selector).mapTo(mutableSetOf()) { it.id }, durationMs, curve, stopAtEnd)
  }

  private fun fadeVoiceIds(
    ids: Set<String>,
    durationMs: Long,
    curve: PcmGainEnvelopeProcessor.Curve,
    stopAtEnd: Boolean,
  ) {
    val selectedIds = ids.filterTo(mutableSetOf()) { voices.containsKey(it) }
    invalidateFadeTracking(selectedIds)
    if (selectedIds.isEmpty()) {
      emitAuthoritativeState()
      return
    }
    if (stopAtEnd && durationMs == 0L) {
      stopVoiceIds(selectedIds)
      return
    }
    val operationId = ++nextFadeOperationId
    activeFades[operationId] = FadeOperation(selectedIds.toMutableSet(), stopAtEnd)
    voices.values.filter { selectedIds.contains(it.id) }.forEach { voice ->
      voice.envelope.scheduleFadeToSilence(
        durationMs = durationMs,
        curve = curve,
        onComplete = { commands.post { completeFade(operationId, voice.id) } },
      )
    }
    emit(mapOf("type" to "STATE", "state" to "fading"))
  }

  private fun completeFade(operationId: Long, voiceId: String) {
    val operation = activeFades[operationId] ?: return
    if (!operation.remainingVoiceIds.remove(voiceId)) return
    if (operation.stopAtEnd) {
      stopVoiceIds(setOf(voiceId), invalidateFades = false)
    }
    if (operation.remainingVoiceIds.isEmpty()) {
      activeFades.remove(operationId)
      emitAuthoritativeState()
    }
  }

  private fun invalidateFadeTracking(voiceIds: Set<String>) {
    if (voiceIds.isEmpty()) return
    val emptyOperations = mutableListOf<Long>()
    activeFades.forEach { (id, operation) ->
      operation.remainingVoiceIds.removeAll(voiceIds)
      if (operation.remainingVoiceIds.isEmpty()) emptyOperations += id
    }
    emptyOperations.forEach(activeFades::remove)
  }

  private fun stopSelected(selector: Selector, rootControl: Boolean = false) {
    if (!rootControl && (selectVoices(selector).any { it.rootEpoch == mainRootEpoch } || pendingDelayedActions.any { it.rootEpoch == mainRootEpoch && matchesSelector(selector, it.cue) })) rootAdvanceOnCompletion = false
    rootAdmission?.takeIf { admission -> selector == Selector.All || admission.entries.any { matchesSelector(selector, it.cue) } }?.let { cancelRootAdmission(); transitioning = false; rootHeldForGo = mainCueId != null }
    cancelPendingStarts(selector)
    stopVoiceIds(selectVoices(selector).mapTo(mutableSetOf()) { it.id })
  }

  private fun matchesSelector(selector: Selector, cue: AudioCueSpec?): Boolean = when (selector) {
    Selector.All -> true
    is Selector.CueIds -> cue?.id in selector.values
    is Selector.Tags -> cue?.tags?.any(selector.values::contains) == true
  }

  private fun stopVoiceIds(ids: Set<String>, invalidateFades: Boolean = true) {
    if (invalidateFades) invalidateFadeTracking(ids)
    ids.forEach { id ->
      val voice = voices.remove(id) ?: return@forEach
      onVoiceStarted.remove(id)
      if (mainVoiceId == id) mainVoiceId = null
      voice.envelope.emergencyMute()
      processors.remove(voice.envelope)
      voice.player.stop()
      voice.player.release()
      emit(mapOf("type" to "VOICE_END", "cueId" to voice.cue.id, "voiceId" to voice.id, "mainTransport" to voice.mayAutoFollowMainStack))
    }
    afterVoiceSetChanged()
  }

  private fun selectVoices(selector: Selector): List<Voice> = when (selector) {
    Selector.All -> voices.values.toList()
    is Selector.CueIds -> voices.values.filter { selector.values.contains(it.cue.id) }
    is Selector.Tags -> voices.values.filter { voice -> voice.cue.tags.any(selector.values::contains) }
  }

  private fun seekRehearsal(cueId: String, positionMs: Long) {
    // A cue can also be playing as a Hit or an outgoing overlap instance.
    // Rehearsal seeks address only the currently admitted primary main voice.
    val selected = voices.values.filter { it.cue.id == cueId && isPrimaryMainVoice(it.id, mainVoiceId, it.mayAutoFollowMainStack) }
    if (selected.isEmpty()) {
      throw NativeCommandException("CUE_NOT_ACTIVE", "Cue $cueId is not active and cannot be sought.")
    }
    selected.forEach {
      val source = positionMs.coerceIn(it.cue.trimInMs, (it.cue.trimOutMs ?: it.cue.sourceDurationMs) - 1)
      val relative = sourceToCuePosition(source, it.cue.trimInMs, it.cue.trimOutMs ?: it.cue.sourceDurationMs)
      it.player.seekTo(relative)
      it.envelope.seekCueTimeline(relative)
    }
  }

  private fun safeStopInternal(reason: String, emitInterruption: Boolean) {
    invalidateRootTransport()
    // Capture the audition identity before stop advances the generation and
    // removes its voices. Audition errors never become live Run events.
    if (previewMode && emitInterruption) emitFault(
      if (reason == "system_media_muted" || reason == "dnd_filter_changed") "SYSTEM_AUDIO_SUPPRESSED" else "AUDIO_INTERRUPTED",
      "Audition interrupted by system audio. Check the output and system sound settings, then retry deliberately.",
    )
    omsCrossfade = null
    refusedAutomaticCrossfadeVoiceId = null
    emitSafetyStop(reason)
    mainCueId = null
    mainVoiceId = null
    transitioning = false
    onVoiceStarted.clear()
    triggerGeneration = ShowAudioRuntime.nextGeneration()
    cancelPendingAutoWait()
    cancelAllDelayedActions()
    activeFades.clear()
    enginePaused = false
    voices.values.forEach { voice ->
      voice.envelope.emergencyMute()
      voice.player.stop()
      voice.player.release()
      emit(mapOf("type" to "VOICE_END", "cueId" to voice.cue.id, "voiceId" to voice.id, "mainTransport" to voice.mayAutoFollowMainStack))
    }
    voices.clear()
    processors.clear()
    updateActiveSignal()
    updateTransportPlayback()
    abandonAudioFocus()
    emit(mapOf("type" to "STATE", "state" to "stopped"))
    if (emitInterruption) {
      recoveryRequired = true
      if (!previewMode) emit(mapOf("type" to "INTERRUPTION", "reason" to reason))
    }
  }

  private fun stopMainForSelection() {
    invalidateRootTransport()
    omsCrossfade = null
    refusedAutomaticCrossfadeVoiceId = null
    emitSafetyStop("selection")
    triggerGeneration = ShowAudioRuntime.nextGeneration()
    cancelPendingAutoWait()
    pendingDelayedActions.toList().forEach { pending ->
      if (survivesMainSelection(pending.mainTransport)) {
        // Independent Hit pre-waits retain their deadline and reserved slot.
        pending.generation = triggerGeneration
      } else {
        cancelDelayedAction(pending)
      }
    }
    val mainIds = voices.values.filter { !survivesMainSelection(it.belongsToMainSequence) }.mapTo(mutableSetOf()) { it.id }
    stopVoiceIds(mainIds)
    mainCueId = null
    mainVoiceId = null
    transitioning = false
    if (voices.isEmpty() && pendingDelayedActions.isEmpty()) enginePaused = false
    emitAuthoritativeState()
  }

  private fun afterVoiceSetChanged() {
    finishOmsCrossfadeIfReady()
    rootAdmission?.let(::maybeCommitRootAdmission)
    if (!rootLaunching && rootAdmission == null && rootAwaitingFirstStart && voices.values.none { it.rootEpoch == mainRootEpoch } && pendingDelayedActions.none { it.rootEpoch == mainRootEpoch }) rootAwaitingFirstStart = false
    if (voices.isEmpty() && pendingDelayedActions.isEmpty() && rootAdmission == null && !rootLaunching && !rootAwaitingFirstStart) transitioning = false
    updateActiveSignal()
    updateTransportPlayback()
    if (voices.isEmpty() && reservedVoiceCount == 0) {
      abandonAudioFocus()
    }
    emitAuthoritativeState()
    checkRootCompletion()
  }

  private fun invalidateRootTransport() {
    lastRootRefusal = null
    mainRootEpoch += 1
    rootCompletionQueued = null
    rootHeldForGo = false
    rootAwaitingFirstStart = false
    rootLaunching = false
    cancelRootAdmission()
    preparedRootVoices.keys.toList().forEach(::releasePreparedRootVoice)
  }

  private fun updateTransportPlayback() {
    scheduleSystemAudioCheck()
    refreshBackgroundNotification()
    // Retain the existing private renderer/wake policy for native countdowns
    // while locked. Its clock and play state are never exposed to MediaSession;
    // foreground notification ownership follows the deliberately prepared show.
    if ((prepared != null || NativeRemoteCoordinator.isDiagnostic()) && !transportFailure.hasFailed) {
      if (!transportPlayer.isPlaying) transportPlayer.play()
    } else {
      transportPlayer.pause()
    }
    publishSystemMediaState()
  }

  private fun refreshBackgroundNotification(forceRead: Boolean = false) {
    if (prepared == null || previewMode || destroyed || shutdownRequested) return
    val now = SystemClock.elapsedRealtime()
    if (forceRead || lastBackgroundReadMs?.let { now - it >= BACKGROUND_CHECK_INTERVAL_MS } != false) {
      // Bounded reads reuse the existing native monitor, never the rendering path.
      backgroundObservation = BackgroundReliability.read(this, true, null)
      lastBackgroundReadMs = now
    }
    refreshNotificationMetadata()
  }

  private fun refreshNotificationMetadata() {
    if (!::transportPlayer.isInitialized || prepared == null || previewMode || destroyed || shutdownRequested) return
    val bodies = backgroundNotificationBodies(
      backgroundObservation["batteryOptimizationIgnored"] as? Boolean,
      backgroundObservation["backgroundRestricted"] as? Boolean,
      backgroundObservation["powerSaveMode"] as? Boolean,
      recoveryRequired || interruptionGate.isBlocked,
      !enginePaused && (voices.isNotEmpty() || pendingDelayedActions.isNotEmpty() || pendingAutoWait != null),
      backgroundObservation["batteryLevelPercent"] as? Int,
      backgroundObservation["batteryCharging"] as? Boolean,
      backgroundObservation["thermalState"] as? String,
      backgroundObservation["appStandbyRestricted"] as? Boolean,
      backgroundObservation["systemLowMemory"] as? Boolean,
    )
    val copy = backgroundNotificationCopy(bodies) { body -> notificationString(when (body) {
      BackgroundNotificationBody.BATTERY_WARNING -> R.string.show_audio_notification_battery_warning
      BackgroundNotificationBody.SETTINGS_UNKNOWN -> R.string.show_audio_notification_settings_unknown
      BackgroundNotificationBody.LOW_BATTERY -> R.string.show_audio_notification_low_battery
      BackgroundNotificationBody.HEAT -> R.string.show_audio_notification_heat
      BackgroundNotificationBody.MEMORY -> R.string.show_audio_notification_memory
      BackgroundNotificationBody.RECOVERY -> R.string.show_audio_notification_recovery
      BackgroundNotificationBody.ACTIVE -> R.string.show_audio_notification_active
      BackgroundNotificationBody.PREPARED -> R.string.show_audio_notification_prepared
    }) }
    if (copy == notificationCopy) return
    notificationCopy = copy
    publishSystemMediaState()
  }

  /** Called only on the native command looper, including its existing progress tick. */
  private fun publishSystemMediaState() {
    val show = prepared
    val primaryVoice = mainVoiceId?.let(voices::get)
    fun clip(cue: AudioCueSpec, identity: String, position: Long) = SystemMediaClip(
      identity, position, (cue.trimOutMs ?: cue.sourceDurationMs) - cue.trimInMs,
      cue.playbackRate.toFloat(), cue.endBehavior == "loop",
    )
    val ready = if (mainCueId == null) show?.cueOrder?.getOrNull(selectedIndex)?.let { show.audio[it] } else null
    systemMedia = systemMediaView(SystemMediaObservation(
      prepared = show != null, preview = previewMode,
      closing = destroyed || shutdownRequested || notificationFailed,
      diagnostic = NativeRemoteCoordinator.isDiagnostic(), recovery = recoveryRequired || interruptionGate.isBlocked,
      paused = enginePaused, audible = voices.values.any { it.player.isPlaying },
      workPending = pendingDelayedActions.isNotEmpty() || pendingAutoWait != null || reservedVoiceCount > 0 || rootAdmission != null || rootHeldForGo,
      voices = voices.size, mainClip = primaryVoice?.let { clip(it.cue, it.id, it.player.currentPosition) },
      goAvailable = enginePaused || !transitioning && show != null &&
        (if (show.transportMode == "oms") selectedIndex in show.cueOrder.indices else goIndex in show.cueOrder.indices),
      readyClip = ready?.let { clip(it, it.id, 0) },
    ))
    val notification = OwnedNotification(systemMedia, notificationCopy, NativeRemoteCoordinator.commandEpoch("NOTIFICATION_STATE"))
    ownedNotification = notification
    if (::sessionPlayer.isInitialized) sessionPlayer.refresh()
    val key = notification.key()
    if (key != requestedNotificationKey) {
      requestedNotificationKey = key
      main.post { refreshOwnedPlaybackNotification() }
    }
  }

  override fun onUpdateNotification(session: MediaSession, startInForegroundRequired: Boolean) {
    // Own the entire update path. Calling super would let Media3's timeout and
    // asynchronous provider callbacks demote a Ready/paused prepared show.
    if (session === mediaSession) refreshOwnedPlaybackNotification()
  }

  private fun refreshOwnedPlaybackNotification() {
    if (destroyed || shutdownRequested || notificationFailed || !ShowAudioRuntime.isCurrent(this)) return
    val notificationState = ownedNotification
    val state = notificationState.view
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (!state.retainForeground) {
      if (postedNotificationKey != null) {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        manager.cancel(DefaultMediaNotificationProvider.DEFAULT_NOTIFICATION_ID)
        postedNotificationKey = null
      }
      return
    }
    val session = mediaSession ?: return
    val epoch = notificationState.epoch ?: return
    val key = notificationState.key()
    if (postedNotificationKey == key) return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) manager.createNotificationChannel(NotificationChannel(
        DefaultMediaNotificationProvider.DEFAULT_CHANNEL_ID, notificationString(R.string.show_audio_notification_channel), NotificationManager.IMPORTANCE_LOW,
      ).apply { setSound(null, null); enableVibration(false) })
      val builder = NotificationCompat.Builder(this, DefaultMediaNotificationProvider.DEFAULT_CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_media_play).setContentTitle(notificationString(R.string.show_audio_notification_title))
        .setContentText(notificationState.copy?.details ?: notificationString(R.string.show_audio_notification_prepared))
        .setContentIntent(sessionActivityIntent).setSilent(true).setOnlyAlertOnce(true).setOngoing(true)
        // Android 12+ may otherwise defer a newly prepared show's status card.
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .setShowWhen(false).setCategory(NotificationCompat.CATEGORY_TRANSPORT).setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      var actions = 0
      fun action(icon: Int, title: Int, mediaKey: String) {
        val intent = Intent(NOTIFICATION_ACTION).setPackage(packageName)
          .setData(Uri.Builder().scheme("showcontrol-notification").authority(notificationOwner).appendPath(epoch.toString()).appendPath(mediaKey).build())
          .putExtra("owner", notificationOwner).putExtra("epoch", epoch).putExtra("key", mediaKey)
        builder.addAction(icon, notificationString(title), PendingIntent.getBroadcast(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        actions += 1
      }
      val playbackCard = systemMediaUsesPlaybackCard(state)
      if (state.canNavigate && (playbackCard || !state.canGo || !state.canPauseResume)) action(android.R.drawable.ic_media_previous, R.string.show_audio_notification_previous, "MEDIA_PREVIOUS")
      if (state.canPauseResume) action(
        if (state.playWhenReady) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
        if (state.playWhenReady) androidx.media3.session.R.string.media3_controls_pause_description else R.string.show_audio_notification_resume,
        if (state.playWhenReady) "MEDIA_PAUSE" else "MEDIA_PLAY",
      )
      if (state.canGo && state.phase != SystemMediaPhase.PAUSED) action(android.R.drawable.ic_media_next, R.string.show_audio_notification_go, "MEDIA_NEXT")
      if (!playbackCard && state.canStop) action(android.R.drawable.ic_menu_close_clear_cancel, R.string.show_audio_notification_stop, "MEDIA_STOP")
      if (playbackCard) {
        builder.setStyle(MediaStyleNotificationHelper.MediaStyle(session).setShowActionsInCompactView(*(0 until minOf(actions, 3)).toList().toIntArray()))
      } else {
        // An inactive MediaStyle card can disappear from Android's shade after
        // its idle timeout despite an ongoing foreground NotificationRecord.
        // Ready/paused/waiting/recovery need a durable status and return action.
        builder.setStyle(NotificationCompat.BigTextStyle().bigText(notificationState.copy?.details ?: notificationString(R.string.show_audio_notification_prepared)))
      }
      val notification = builder.build()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(
        DefaultMediaNotificationProvider.DEFAULT_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
      ) else startForeground(DefaultMediaNotificationProvider.DEFAULT_NOTIFICATION_ID, notification)
      postedNotificationKey = key
    } catch (_: Exception) {
      // Protection failure cannot leave the UI claiming a safe armed service.
      notificationFailed = true
      interruptionGate.interrupt()
      NativeRemoteCoordinator.commandEpoch("STOP_ALL")
      emergencyMuteAll()
      commands.postAtFrontOfQueue {
        if (!destroyed && ShowAudioRuntime.isCurrent(this)) {
          safeStopInternal("foreground_unavailable", emitInterruption = true)
          emitFault("FOREGROUND_UNAVAILABLE", "Android could not protect background playback. Check app notification and battery settings, then prepare again.")
          main.post { stopSelf() }
        }
      }
    }
  }

  private fun updateActiveSignal() {
    hasActiveVoices.set(voices.isNotEmpty() || reservedVoiceCount > 0)
  }

  private fun emitAuthoritativeState() {
    val state = when {
      enginePaused &&
        (voices.isNotEmpty() || pendingDelayedActions.isNotEmpty() || pendingAutoWait != null) -> "paused"
      voices.any { it.value.player.isPlaying } ||
        pendingDelayedActions.isNotEmpty() ||
        (pendingAutoWait != null && !enginePaused) -> "playing"
      prepared != null -> "ready"
      else -> "stopped"
    }
    emit(mapOf("type" to "STATE", "state" to state))
    emitRunState()
  }

  private fun scheduleProgress() {
    commands.removeCallbacks(progressTick)
    if (voices.isNotEmpty() || pendingDelayedActions.isNotEmpty() || pendingAutoWait != null) commands.post(progressTick)
  }

  private val progressTick = object : Runnable {
    override fun run() {
      voices.values.toList().forEach { voice ->
        emit(
          mapOf(
            "type" to "PROGRESS",
            "cueId" to voice.cue.id,
            "voiceId" to voice.id,
            "mainTransport" to voice.mayAutoFollowMainStack,
            "positionMs" to voice.player.currentPosition,
            "durationMs" to voice.player.duration.coerceAtLeast(0),
          ),
        )
        if (prepared?.transportMode == "oms" && isPrimaryMainVoice(voice.id, mainVoiceId, voice.mayAutoFollowMainStack) && !transitioning && voice.id != refusedAutomaticCrossfadeVoiceId && voice.cue.endBehavior != "loop") {
          val next = prepared?.cueOrder?.getOrNull(selectedIndex + 1)?.let { prepared?.audio?.get(it) }
          val remaining = (voice.player.duration - voice.player.currentPosition) / voice.cue.playbackRate
          if (voice.player.duration > 0 && voice.cue.crossfadeEnabled && next?.autoPlay == true && remaining <= next.preWaitMs + voice.cue.crossfadeMs) {
            try { advanceOms() } catch (error: NativeCommandException) {
              if (error.code != "RECOVERABLE_REFUSAL") { safeStopInternal("auto_advance_failed", true); emitFault(error.code, error.message) }
            }
          }
        }
      }
      emitRunState()
      if (voices.isNotEmpty() || pendingDelayedActions.isNotEmpty() || pendingAutoWait != null) commands.postDelayed(this, PROGRESS_INTERVAL_MS)
    }
  }

  private fun handleRemotePlay() {
    commands.post {
      if (previewMode) return@post
      if (prepared == null) return@post
      try {
        if (prepared?.transportMode == "oms") executeSemantic(JSONObject().put("type", "RESUME")) else if (enginePaused) resumeAll()
        emitRunState()
        emit(mapOf("type" to "REMOTE_COMMAND", "command" to "PAUSE_RESUME"))
      } catch (error: Exception) {
        val code = (error as? NativeCommandException)?.code ?: "REMOTE_RESUME_REJECTED"
        emitFault(code, error.message ?: "The lock-screen resume command was rejected.")
      }
    }
  }

  private fun handleRemotePause() {
    commands.post {
      if (previewMode) return@post
      if (prepared == null) return@post
      try {
        if (prepared?.transportMode == "oms") executeSemantic(JSONObject().put("type", "PAUSE"))
        else if (!enginePaused && (voices.isNotEmpty() || pendingDelayedActions.isNotEmpty() || pendingAutoWait != null)) pauseAll()
        emit(mapOf("type" to "REMOTE_COMMAND", "command" to "PAUSE_RESUME"))
        emitRunState()
      } catch (error: Exception) {
        val code = (error as? NativeCommandException)?.code ?: "REMOTE_PAUSE_REJECTED"
        emitFault(code, error.message ?: "The lock-screen pause command was rejected.")
      }
    }
  }

  private fun handleRemoteGo() {
    val capturedEpoch = NativeRemoteCoordinator.commandEpoch("GO") ?: return
    commands.post {
      if (!NativeRemoteCoordinator.isCurrentCommand(capturedEpoch)) return@post
      if (previewMode) return@post
      val show = prepared ?: return@post
      if (show.transportMode == "oms") {
        try { executeSemantic(JSONObject().put("type", "GO")); emitRunState() } catch (error: Exception) { emitFault("REMOTE_GO_REJECTED", error.message ?: "GO rejected.") }
        return@post
      }
      try {
        if (enginePaused) resumeAll() else advanceLegacyCue("media-session")
        emitRunState()
      } catch (error: Exception) {
        val code = (error as? NativeCommandException)?.code ?: "REMOTE_GO_REJECTED"
        emitFault(code, error.message ?: "The lock-screen GO command was rejected.")
      }
    }
  }

  /** Executes on the native command queue for both touch and remote GO. */
  private fun advanceLegacyCue(reason: String) {
    val show = prepared ?: return
    if (recoveryRequired || enginePaused) return
    val cueId = show.cueOrder.getOrNull(goIndex) ?: return
    cancelPendingAutoWait()
    trigger(cueId, triggerGeneration, TriggerOrigin.MAIN_STACK)
    selectedIndex = goIndex
    mainCueId = cueId
    goIndex += 1
    scheduleProgress()
    emit(mapOf("type" to "REMOTE_COMMAND", "command" to "GO", "handledNatively" to true, "cueId" to cueId, "reason" to reason))
  }

  private fun syncGoIndex(cueId: String) {
    val index = prepared?.cueOrder?.indexOf(cueId) ?: -1
    if (index >= goIndex) goIndex = index + 1
  }

  private inner class SessionCallback : MediaSession.Callback {
    // The OS must discover the exported media service. Admission, rather than a
    // signature permission on the service, protects it from unrelated apps.
    override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult =
      if (controller.isTrusted || controller.packageName == packageName) {
        // Default session permissions advertise rating despite having no such
        // implementation. Only the semantic player controls are supported.
        MediaSession.ConnectionResult.AcceptedResultBuilder(session).setAvailableSessionCommands(SessionCommands.EMPTY).build()
      } else MediaSession.ConnectionResult.reject()
    override fun onMediaButtonEvent(
      session: MediaSession,
      controllerInfo: MediaSession.ControllerInfo,
      intent: Intent,
    ): Boolean {
      // Framework media-button callbacks may have an unknown legacy controller
      // identity. The framework session authenticates this path; exported
      // service Intents are excluded in onStartCommand instead.
      val event = if (Build.VERSION.SDK_INT >= 33) {
        intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
      } else {
        @Suppress("DEPRECATION")
        intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT)
      } ?: return true
      if (event.action != KeyEvent.ACTION_DOWN || event.repeatCount > 0) return true

      val mediaKey = when (event.keyCode) {
        KeyEvent.KEYCODE_MEDIA_PLAY -> "MEDIA_PLAY"
        KeyEvent.KEYCODE_MEDIA_PAUSE -> "MEDIA_PAUSE"
        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_HEADSETHOOK -> "MEDIA_PLAY_PAUSE"
        KeyEvent.KEYCODE_MEDIA_NEXT -> "MEDIA_NEXT"
        KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "MEDIA_PREVIOUS"
        KeyEvent.KEYCODE_MEDIA_STOP -> "MEDIA_STOP"
        else -> return false
      }
      // Media-session delivery often has no stable physical device identity.
      routeMediaCommand(mediaKey)
      return true
    }
  }

  private fun routeMediaCommand(key: String) {
    if (destroyed || shutdownRequested || notificationFailed || !ShowAudioRuntime.isCurrent(this)) return
    if (NativeRemoteCoordinator.mediaInput(key)) return
    val type = when (key) { "MEDIA_NEXT" -> "GO"; "MEDIA_PLAY" -> "RESUME"; "MEDIA_PAUSE" -> "PAUSE"; "MEDIA_PLAY_PAUSE" -> "PAUSE_RESUME"; "MEDIA_PREVIOUS" -> "PREVIOUS"; "MEDIA_STOP" -> "STOP_ALL"; else -> return }
    val epoch = NativeRemoteCoordinator.commandEpoch(type) ?: return
    dispatchSemantic(JSONObject().put("type", type).put("controllerEpoch", epoch).toString(), {}, { _, _ -> })
  }

  private fun emergencyStop(reason: String, emitInterruption: Boolean, interruptionEpoch: Long) {
    // The shared PCM latch already mutes current and late-created voices.
    // Mutating their individual mute bits here could poison a replacement
    // audition which is being prepared behind that same latch.
    val current = ShowAudioRuntime.whileCurrent(this) {
      if (destroyed || shutdownRequested) false else interruptionGate.whileCurrentInterruption(interruptionEpoch) {
        // Identity and global epoch mutation share the runtime lock: a legacy
        // focus callback cannot race detach and invalidate a replacement.
        NativeRemoteCoordinator.commandEpoch("STOP_ALL")
      }
    } == true
    if (current) commands.postAtFrontOfQueue {
      if (!destroyed && !shutdownRequested && ShowAudioRuntime.isCurrent(this) && interruptionGate.isCurrentInterruption(interruptionEpoch)) {
        if (reason == "phone_call") systemAudioPolicy.markInterrupted()
        safeStopInternal(reason, emitInterruption)
      }
    }
  }

  private fun emergencyMuteAll() {
    processors.forEach(PcmGainEnvelopeProcessor::emergencyMute)
  }

  private fun routeChanged(reason: String) {
    if (destroyed || shutdownRequested) return
    val current = routeDescription()
    val change = ShowAudioRuntime.whileCurrent(this) {
      if (destroyed || shutdownRequested) return@whileCurrent null
      val previous = knownRoute.getAndSet(current)
      if (!shouldInvalidateAudioRoute(reason, previous, current, hasActiveVoices.get(), NativeRemoteCoordinator.commandEpoch("ROUTE_CHANGE") != null)) return@whileCurrent null
      previous to interruptionGate.interrupt()
    } ?: return
    val (previous, interruptionEpoch) = change
    commands.postAtFrontOfQueue {
      if (destroyed || shutdownRequested || !ShowAudioRuntime.isCurrent(this)) return@postAtFrontOfQueue
      if (!interruptionGate.isCurrentInterruption(interruptionEpoch)) return@postAtFrontOfQueue
      safeStopInternal(reason, emitInterruption = previewMode)
      recoveryRequired = true
      emit(
        mapOf(
          "type" to "ROUTE_CHANGE",
          "previous" to previous,
          "current" to knownRoute.get(),
          "safeStopped" to true,
          "reason" to reason,
        ),
      )
    }
  }

  private fun routeDescription(): String = audioManager
    .getDevices(AudioManager.GET_DEVICES_OUTPUTS)
    .filter { it.isSink }
    .map { "type-${it.type}" }.sorted().joinToString(separator = "+")
    .ifBlank { "none" }

  private fun readSystemAudioObservation(): SystemAudioObservation {
    val filter = runCatching {
      (getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager)?.currentInterruptionFilter
    }.getOrNull()?.takeIf { it in 1..4 }
    val muted = runCatching { audioManager.isStreamMute(AudioManager.STREAM_MUSIC) }.getOrNull()
    val mode = runCatching { audioManager.mode }.getOrNull()?.takeIf { it >= 0 }
    return SystemAudioObservation(filter, muted, mode)
  }

  private fun beginSystemAudioObservation() {
    val observation = readSystemAudioObservation()
    val reason = systemAudioSuppressionReason(observation)
    if (reason != null) {
      interruptionGate.interrupt()
      throw NativeCommandException(
        if (reason == "phone_call") "AUDIO_INTERRUPTED" else "SYSTEM_AUDIO_SUPPRESSED",
        if (reason == "phone_call") "A phone call is ringing or active. Wait until it ends, then prepare again." else "Android is muting media audio. Check media mute and Do Not Disturb, then prepare again.",
      )
    }
    systemAudioPolicy.reset(observation)
  }

  private fun observeSystemAudioPolicy(): String? {
    val reason = systemAudioPolicy.observe(readSystemAudioObservation()) ?: return null
    interruptionGate.interrupt()
    NativeRemoteCoordinator.commandEpoch("STOP_ALL")
    emergencyMuteAll()
    safeStopInternal(reason, emitInterruption = true)
    return reason
  }

  private fun requireSystemAudioAvailable() {
    val reason = observeSystemAudioPolicy()
    if (reason != null) {
      throw NativeCommandException(
        if (reason == "phone_call") "AUDIO_INTERRUPTED" else "SYSTEM_AUDIO_SUPPRESSED",
        if (reason == "phone_call") "A phone call is ringing or active. Wait until it ends, then prepare again." else "Media mute or Do Not Disturb changed. Check system sound settings and prepare again.",
      )
    }
  }

  private fun registerAudioModeListener() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    runCatching {
      val listener = AudioManager.OnModeChangedListener { mode ->
        if (prepared != null && !destroyed && !shutdownRequested && !interruptionGate.isBlocked && isPhoneCallAudioMode(mode)) {
          // Read current mode before latching: an old RINGTONE callback after
          // the call ended cannot invalidate a replacement preparation.
          val currentMode = runCatching { audioManager.mode }.getOrNull()
          if (isPhoneCallAudioMode(currentMode)) {
            val epoch = interruptionGate.interrupt()
            emergencyStop("phone_call", emitInterruption = true, interruptionEpoch = epoch)
          }
        }
      }
      audioManager.addOnModeChangedListener(ContextCompat.getMainExecutor(this), listener)
      audioModeListener = listener
    }
    // Older Android versions and unavailable listeners retain the bounded
    // native monitor plus synchronous prepare/start/resume checks.
  }

  private fun scheduleSystemAudioCheck() {
    if (prepared == null || destroyed || shutdownRequested) {
      commands.removeCallbacks(systemAudioCheck)
      systemAudioCheckScheduled = false
    } else if (!systemAudioCheckScheduled) {
      systemAudioCheckScheduled = true
      // Public DND-change broadcasts require policy access on Android 10+.
      // This bounded native observation also covers silent Ready/paused runs;
      // it does not claim instant detection or request policy permissions.
      commands.postDelayed(systemAudioCheck, SYSTEM_AUDIO_CHECK_INTERVAL_MS)
    }
  }

  private fun requestAudioFocus(recoveryEpoch: Long? = null): Boolean {
    val admissionEpoch = interruptionGate.epoch
    if (!interruptionGate.admits(admissionEpoch, recoveryEpoch == admissionEpoch)) return false
    val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = focusRequest ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(
          android.media.AudioAttributes.Builder()
            .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC)
            .build(),
        )
        // Without this flag Android may duck and restore MEDIA/MUSIC silently,
        // bypassing the loss callback and the deliberate recovery requirement.
        .setWillPauseWhenDucked(true)
        .setAcceptsDelayedFocusGain(false)
        .setOnAudioFocusChangeListener(focusListener, main)
        .build()
        .also { focusRequest = it }
      audioManager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    } else {
      @Suppress("DEPRECATION")
      audioManager.requestAudioFocus(
        focusListener,
        AudioManager.STREAM_MUSIC,
        AudioManager.AUDIOFOCUS_GAIN,
      ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }
    val admitted = granted && interruptionGate.admits(admissionEpoch, recoveryEpoch == admissionEpoch)
    focusGranted.set(admitted)
    if (granted && !admitted) abandonAudioFocus()
    return admitted
  }

  private fun abandonAudioFocus() {
    focusGranted.set(false)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let(audioManager::abandonAudioFocusRequest)
    } else {
      @Suppress("DEPRECATION")
      audioManager.abandonAudioFocus(focusListener)
    }
  }

  private fun registerNoisyReceiver() {
    val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(noisyReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      registerReceiver(noisyReceiver, filter)
    }
    noisyReceiverRegistered = true
  }

  private fun createTransportPlayer(): ExoPlayer {
    val player = ExoPlayer.Builder(this)
      .setLooper(commandThread.looper)
      .setAudioAttributes(mediaAudioAttributes(), false)
      .setHandleAudioBecomingNoisy(false)
      .setWakeMode(C.WAKE_MODE_LOCAL)
      .build()
    try {
    transportFailure.attach(player)
    player.addListener(object : Player.Listener {
      override fun onPlayerError(error: PlaybackException) { onTransportFailed(player) }
    })
    player.repeatMode = Player.REPEAT_MODE_ONE
    // Generated zero PCM guarantees silence independently of cache contents.
    // A client-volume mute makes Android exclude this prepared transport from
    // media-button routing until a real cue plays. Keep gain at unity while
    // the separate public player continues to report truthful Ready/Paused.
    player.volume = 1f
    player.setMediaSource(SilenceMediaSource.Factory()
      .setDurationUs(SILENT_TRANSPORT_DURATION_US)
      .createMediaSource())
    player.prepare()
    return player
    } catch (error: Throwable) {
      releaseTransportPlayer(player)
      throw error
    }
  }

  private fun requireTransportCommand(type: String) {
    if (!transportFailure.admitsCommand(type)) throw NativeCommandException("TRANSPORT_FAILED", TRANSPORT_FAILURE_MESSAGE)
  }

  private fun releaseTransportPlayer(player: ExoPlayer) {
    transportFailure.release(player)
    player.release()
  }

  private fun onTransportFailed(player: ExoPlayer) {
    if (!transportFailure.fail(player, shutdownRequested, destroyed)) return
    // This callback runs on the same native command looper as preparation.
    // Latch PCM before cancelling work; focus gain and remote input cannot
    // revive an owner whose background playback support has failed.
    interruptionGate.interrupt()
    NativeRemoteCoordinator.commandEpoch("STOP_ALL")
    emergencyMuteAll()
    recoveryRequired = true
    if (!::transportPlayer.isInitialized || prepared == null) {
      main.post { failStartup("TRANSPORT_FAILED", TRANSPORT_FAILURE_MESSAGE) }
      return
    }
    val audition = previewMode
    if (audition) emitFault("TRANSPORT_FAILED", TRANSPORT_FAILURE_MESSAGE)
    safeStopInternal("transport_failed", emitInterruption = false)
    if (audition) {
      prepared = null; snapshotJson = null; previewMode = false
      main.post { stopSelf() }
    } else {
      // Retain immutable identity for Recovery and UI reattachment. Only a
      // deliberate exit destroys this owner; preparation cannot reset its latch.
      emitFault("TRANSPORT_FAILED", TRANSPORT_FAILURE_MESSAGE)
      emitRunState()
    }
  }

  private fun saturatedAdd(left: Long, right: Long): Long =
    if (Long.MAX_VALUE - left < right) Long.MAX_VALUE else left + right

  private fun mediaAudioAttributes(): AudioAttributes = AudioAttributes.Builder()
    .setUsage(C.USAGE_MEDIA)
    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
    .build()

  private fun parseSnapshot(json: String): PreparedShow {
    val root = JSONObject(json)
    if (root.optInt("schemaVersion", -1) !in 1..2) throw IllegalArgumentException("Only RunSnapshot schema 1 or 2 is supported.")
    if (root.optInt("voiceLimit", -1) != VOICE_LIMIT) throw IllegalArgumentException("RunSnapshot voiceLimit must be 8.")

    val audio = linkedMapOf<String, AudioCueSpec>()
    val groups = linkedMapOf<String, GroupSpec>()
    val fades = linkedMapOf<String, FadeSpec>()
    val stops = linkedMapOf<String, StopSpec>()
    val waits = linkedMapOf<String, WaitSpec>()
    val cues = root.requireObject("cues")
    cues.keys().forEach { id ->
      val cue = cues.getJSONObject(id)
      when (cue.requireString("type")) {
        "audio" -> {
          val media = cue.requireObject("mediaAsset")
          val file = requireAppOwnedFile(media.requireString("localUri"))
          val gainDb = cue.optDouble("gainDb", 0.0)
          audio[id] = AudioCueSpec(
            id = id,
            file = file,
            tags = cue.optJSONArray("tags").toStringSet(),
            trimInMs = cue.optLong("trimInMs", 0).coerceAtLeast(0),
            trimOutMs = cue.nullableLong("trimOutMs"),
            sourceDurationMs = media.optLong("durationMs", 0).coerceAtLeast(0),
            gain = 10.0.pow(gainDb / 20.0).toFloat().coerceIn(0f, MAX_GAIN),
            fadeInMs = cue.optLong("fadeInMs", 0).coerceAtLeast(0),
            fadeOutMs = cue.optLong("fadeOutMs", 0).coerceAtLeast(0),
            curve = parseCurve(cue.optString("fadeCurve", "smooth")),
            preWaitMs = cue.optLong("preWaitMs", 0).coerceAtLeast(0),
            endBehavior = cue.optString("endBehavior", "stopAndReadyNext"),
            playbackRate = cue.optDouble("playbackRate", 1.0).also { require(it.isFinite() && it in 0.7..2.0) },
            autoPlay = cue.optBoolean("autoPlay", false),
            crossfadeEnabled = cue.optBoolean("crossfadeEnabled", false),
            crossfadeMs = cue.optLong("crossfadeMs", 2000).also { require(it in 0..86_400_000) },
          )
        }
        "group" -> {
          val children = cue.requireArray("children").objects().map { child ->
            GroupChild(
              cueId = child.requireString("cueId"),
              offsetMs = child.optLong("offsetMs", 0).coerceAtLeast(0),
            )
          }
          groups[id] = GroupSpec(id, children)
        }
        "fade" -> fades[id] = FadeSpec(
          selector = parseSelector(cue.requireObject("selector")),
          durationMs = cue.optLong("durationMs", 0).coerceAtLeast(0),
          curve = parseCurve(cue.optString("curve", "smooth")),
          stopAtEnd = cue.optBoolean("stopAtEnd", false),
        )
        "stop" -> stops[id] = StopSpec(parseSelector(cue.requireObject("selector")))
        "wait" -> waits[id] = WaitSpec(
          id = id,
          durationMs = cue.optLong("durationMs", 0).coerceAtLeast(0),
          continueAutomatically = cue.optString("continue", "manual") == "auto",
        )
        else -> throw IllegalArgumentException("Cue $id has an unsupported type.")
      }
    }

    groups.values.flatMap(GroupSpec::children).forEach {
      if (groups.containsKey(it.cueId)) {
        throw IllegalArgumentException("Nested group child ${it.cueId} is unsupported in schema 1.")
      }
      if (
        !audio.containsKey(it.cueId) &&
        !fades.containsKey(it.cueId) &&
        !stops.containsKey(it.cueId)
      ) {
        throw IllegalArgumentException(
          "Group child ${it.cueId} must resolve to an audio, fade, or stop cue.",
        )
      }
    }

    return PreparedShow(
      audio = audio,
      groups = groups,
      fades = fades,
      stops = stops,
      waits = waits,
      cueOrder = root.requireArray("cueOrder").strings(),
      panicFadeMs = root.optLong("panicFadeMs", DEFAULT_PANIC_MS).coerceAtLeast(0),
      transportMode = if (root.optInt("schemaVersion") == 2) root.optString("transportMode", "legacyCueStack") else "legacyCueStack",
      sessionPurpose = root.optString("sessionPurpose", "performance").also { require(it in listOf("performance", "rehearsal")) { "Invalid runtime session purpose." } },
      showId = root.optString("showId"),
      setId = root.optString("setId"),
      revisionId = root.optString("revisionId"),
      presentationLocale = backgroundPresentationLocale(root.optString("presentationLocale")),
    )
  }

  private fun parseSelector(json: JSONObject): Selector = when (json.requireString("kind")) {
    "all" -> Selector.All
    "cueIds" -> Selector.CueIds(json.requireArray("cueIds").strings().toSet())
    "tags" -> Selector.Tags(json.requireArray("tags").strings().toSet())
    else -> throw IllegalArgumentException("The cue selector is unsupported.")
  }

  private fun parseCurve(value: String): PcmGainEnvelopeProcessor.Curve = when (value) {
    "linear" -> PcmGainEnvelopeProcessor.Curve.LINEAR
    "equalPower" -> PcmGainEnvelopeProcessor.Curve.EQUAL_POWER
    else -> PcmGainEnvelopeProcessor.Curve.SMOOTH
  }

  private fun requireAppOwnedFile(localUri: String): File {
    val uri = localUri.toUri()
    if (uri.scheme != "file") throw IllegalArgumentException("Only app-owned file URIs are accepted.")
    if (!uri.authority.isNullOrEmpty() && uri.authority != "localhost") throw IllegalArgumentException("Remote file authorities are not local media.")
    val path = uri.path ?: throw IllegalArgumentException("The local media path is missing.")
    val file = File(path).canonicalFile
    if (!file.isFile || !isAppOwned(file)) throw IllegalArgumentException("Local media is missing or outside app-owned storage.")
    return file
  }

  private fun isAppOwned(file: File): Boolean {
    val root = filesDir.canonicalFile.path + File.separator
    return file.canonicalFile.path.startsWith(root)
  }

  private fun JSONObject.requireString(key: String): String = getString(key).also {
    if (it.isBlank()) throw IllegalArgumentException("$key must not be blank.")
  }
  private fun JSONObject.requireObject(key: String): JSONObject = getJSONObject(key)
  private fun JSONObject.requireArray(key: String): JSONArray = getJSONArray(key)
  private fun JSONObject.nullableLong(key: String): Long? = if (isNull(key) || !has(key)) null else getLong(key)
  private fun JSONArray.strings(): List<String> = (0 until length()).map(::getString)
  private fun JSONArray.objects(): List<JSONObject> = (0 until length()).map(::getJSONObject)
  private fun JSONArray?.toStringSet(): Set<String> = this?.strings()?.toSet() ?: emptySet()

  private fun emit(event: Map<String, Any?>) {
    if (previewMode) {
      if (event["type"] in listOf("PROGRESS", "STATE", "VOICE_START", "VOICE_END")) emitPreviewState()
      return
    }
    if (preparingSnapshot) return
    val enriched = event + mapOf("generation" to triggerGeneration, "monotonicMs" to SystemClock.elapsedRealtime(), "showId" to (prepared?.showId ?: ""), "setId" to (prepared?.setId ?: ""), "revisionId" to (prepared?.revisionId ?: ""), "currentCueId" to (mainCueId ?: ""), "selectedCueId" to (prepared?.cueOrder?.getOrNull(selectedIndex) ?: ""), "playbackRate" to (mainCueId?.let { prepared?.audio?.get(it)?.playbackRate } ?: 1.0))
    main.post { ShowAudioRuntime.emit(this, enriched) }
    sendRunBroadcast(enriched)
  }
  private fun emitPreviewState() {
    val cue = prepared?.audio?.values?.firstOrNull() ?: return
    val voice = voices.values.firstOrNull()
    val trimOut = cue.trimOutMs ?: cue.sourceDurationMs
    val event = mapOf("type" to "PREVIEW_STATE", "generation" to triggerGeneration, "cueId" to cue.id,
      "phase" to if (voice == null) "stopped" else if (enginePaused) "paused" else "playing",
      "positionMs" to (cue.trimInMs + (voice?.player?.currentPosition ?: 0)).coerceIn(cue.trimInMs, trimOut),
      "trimInMs" to cue.trimInMs, "trimOutMs" to trimOut)
    main.post { ShowAudioRuntime.emit(this, event) }
  }
  private fun emitSafetyStop(reason: String) {
    if (!previewMode && !preparingSnapshot) sendRunBroadcast(mapOf("type" to "SAFETY_STOP", "reason" to reason, "generation" to triggerGeneration))
  }
  private fun emitSemanticReceipt(command: JSONObject, result: String) {
    if (!previewMode) sendRunBroadcast(mapOf("type" to "SEMANTIC_RECEIPT", "eventId" to command.optString("eventId"), "result" to result, "generation" to triggerGeneration, "nativeCommandId" to nativeSequence, "monotonicMs" to SystemClock.elapsedRealtime()))
  }

  private fun sendRunBroadcast(event: Map<String, Any?>) {
    val timed = if (event.containsKey("monotonicMs")) event else event + ("monotonicMs" to SystemClock.elapsedRealtime())
    if (ShowAudioRuntime.isCurrent(this)) sendBroadcast(Intent("app.showcontrol.RUN_STATE").setPackage(packageName).putExtra("event", JSONObject(timed).toString()))
  }

  private fun emitFault(code: String, message: String) {
    if (previewMode) {
      val event = mapOf("type" to "PREVIEW_ERROR", "code" to code, "message" to message, "generation" to triggerGeneration, "cueId" to (prepared?.audio?.values?.firstOrNull()?.id ?: ""))
      main.post { ShowAudioRuntime.emit(this, event) }
      return
    }
    emit(mapOf("type" to "FAULT", "code" to code, "message" to message))
  }

  private fun runOnCommands(block: () -> Unit) {
    if (Looper.myLooper() == commandThread.looper) {
      block()
      return
    }
    val latch = CountDownLatch(1)
    commands.post {
      try {
        block()
      } finally {
        latch.countDown()
      }
    }
    latch.await(COMMAND_SHUTDOWN_TIMEOUT_MS, TimeUnit.MILLISECONDS)
  }

  private companion object {
    const val NOTIFICATION_ACTION = "app.showcontrol.audio.NOTIFICATION_ACTION"
    const val TRANSPORT_FAILURE_MESSAGE = "Background playback support failed. Leave the session, check the audio output, and prepare again deliberately."
    const val VOICE_LIMIT = 8
    const val DEFAULT_PANIC_MS = 2_000L
    const val PROGRESS_INTERVAL_MS = 100L
    const val SYSTEM_AUDIO_CHECK_INTERVAL_MS = 1_000L
    const val BACKGROUND_CHECK_INTERVAL_MS = 30_000L
    const val ENGINE_STARTUP_TIMEOUT_MS = 15_000L
    const val COMMAND_SHUTDOWN_TIMEOUT_MS = 2_000L
    const val MAX_GAIN = 4f
    const val SILENT_TRANSPORT_DURATION_US = 1_000_000L
  }
}
