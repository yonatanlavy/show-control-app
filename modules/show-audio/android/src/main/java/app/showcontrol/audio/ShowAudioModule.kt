@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package app.showcontrol.audio

import android.content.Context
import android.content.Intent
import android.app.Activity
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Expo bridge only. Playback ownership stays in [ShowAudioService]. */
class ShowAudioModule : Module() {
  @Volatile private var emitterActive = true
  private val engineEmitter: (Map<String, Any?>) -> Unit = ::emit

  override fun definition() = ModuleDefinition {
    Name("ShowAudio")
    Events("onEngineEvent")
    OnDestroy { emitterActive = false; ShowAudioRuntime.unbindEmitter(engineEmitter) }

    AsyncFunction("prepare") { snapshotJson: String, promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        promise.reject("NO_ANDROID_CONTEXT", "The Android application context is unavailable.", null)
        return@AsyncFunction
      }

      ShowAudioRuntime.prepare(
        context = context,
        snapshotJson = snapshotJson,
        emitter = engineEmitter,
        resolve = { promise.resolve(null) },
        reject = { code, message -> promise.reject(code, message, null) },
      )
    }

    AsyncFunction("dispatch") { commandJson: String, promise: Promise ->
      ShowAudioRuntime.dispatch(
        commandJson = commandJson,
        resolve = { promise.resolve(null) },
        reject = { code, message -> promise.reject(code, message, null) },
      )
    }

    AsyncFunction("dispatchUrgent") { commandJson: String, promise: Promise ->
      ShowAudioRuntime.dispatchUrgent(
        commandJson = commandJson,
        resolve = { promise.resolve(null) },
        reject = { code, message -> promise.reject(code, message, null) },
      )
    }

    AsyncFunction("shutdown") { promise: Promise ->
      ShowAudioRuntime.shutdown(
        resolve = { promise.resolve(null) },
        reject = { code, message -> promise.reject(code, message, null) },
      )
    }
    AsyncFunction("getState") { promise: Promise -> ShowAudioRuntime.getState { promise.resolve(it) } }
    AsyncFunction("getPreparedSession") { promise: Promise -> ShowAudioRuntime.getPreparedSession(engineEmitter, { promise.resolve(it) }, { code, message -> promise.reject(code, message, null) }) }
    AsyncFunction("getBackgroundReliability") { promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      if (context == null) promise.reject("NO_ANDROID_CONTEXT", "The Android application context is unavailable.", null)
      else ShowAudioRuntime.getBackgroundReliability(context) { promise.resolve(it) }
    }
    AsyncFunction("openBackgroundSettings") { target: String, promise: Promise ->
      ShowAudioRuntime.openBackgroundSettings(appContext.currentActivity, target, { promise.resolve(it) }, { code, message -> promise.reject(code, message, null) })
    }
    AsyncFunction("dispatchSemantic") { json: String, promise: Promise -> ShowAudioRuntime.semantic(json, { promise.resolve(null) }, { code, message -> promise.reject(code, message, null) }) }
    AsyncFunction("probeMedia") { uri: String -> AudioFileTools.probe(requireNotNull(appContext.reactContext).applicationContext, uri) }
    AsyncFunction("sha256File") { uri: String -> AudioFileTools.hash(requireNotNull(appContext.reactContext).applicationContext, uri) }
    AsyncFunction("waveform") { uri: String, buckets: Int -> AudioFileTools.waveform(requireNotNull(appContext.reactContext).applicationContext, uri, buckets) }
    AsyncFunction("previewCue") { json: String, positionMs: Double, initialPaused: Boolean, promise: Promise -> ShowAudioRuntime.preview(requireNotNull(appContext.reactContext).applicationContext, json, positionMs.toLong(), initialPaused, engineEmitter, { promise.resolve(null) }, { code, message -> promise.reject(code, message, null) }) }
    AsyncFunction("seekPreview") { positionMs: Double, promise: Promise -> ShowAudioRuntime.seekPreview(positionMs.toLong(), { promise.resolve(null) }, { code, message -> promise.reject(code, message, null) }) }
    AsyncFunction("pausePreview") { promise: Promise -> ShowAudioRuntime.setPreviewPaused(true, { promise.resolve(null) }, { code, message -> promise.reject(code, message, null) }) }
    AsyncFunction("resumePreview") { promise: Promise -> ShowAudioRuntime.setPreviewPaused(false, { promise.resolve(null) }, { code, message -> promise.reject(code, message, null) }) }
    AsyncFunction("stopPreview") { promise: Promise -> ShowAudioRuntime.stopPreview { promise.resolve(null) } }
  }

  private fun emit(event: Map<String, Any?>) {
    if (emitterActive) sendEvent("onEngineEvent", event)
  }
}

/**
 * Process-local rendezvous between the Expo bridge and MediaSessionService.
 * No snapshot or audible state is persisted, so a new process always starts silent.
 */
object ShowAudioRuntime {
  private data class PendingPrepare(
    val snapshotJson: String,
    val resolve: () -> Unit,
    val reject: (String, String) -> Unit,
  )

  private val lock = Any()
  private var generation = 0L
  private var service: ShowAudioService? = null
  private var startingService: ShowAudioService? = null
  private data class StartupFailure(val code: String, val message: String, val prepare: PendingPrepare?, val preview: PendingPreview?)
  private var startupFailure: StartupFailure? = null
  private val main = Handler(Looper.getMainLooper())
  private var emitter: ((Map<String, Any?>) -> Unit)? = null
  private var pendingPrepare: PendingPrepare? = null
  private data class PendingPreview(val json: String, val positionMs: Long, val initialPaused: Boolean, val resolve: () -> Unit, val reject: (String, String) -> Unit)
  private var pendingPreview: PendingPreview? = null
  private var pendingDiagnosticTransport = false
  fun setDiagnosticTransport(context: Context, active: Boolean) {
    val attached = synchronized(lock) {
      check(!active || startupFailure == null) { "Wait for the previous native audio owner to finish shutting down." }
      pendingDiagnosticTransport = active; service
    }
    if (attached != null) attached.setDiagnosticTransport(active)
    else if (active) context.startService(Intent(context, ShowAudioService::class.java))
  }

  fun prepare(
    context: Context,
    snapshotJson: String,
    emitter: (Map<String, Any?>) -> Unit,
    resolve: () -> Unit,
    reject: (String, String) -> Unit,
  ) {
    val preparation = NativeRemoteCoordinator.beginPreparation()
    val request = PendingPrepare(snapshotJson,
      { NativeRemoteCoordinator.endPreparation(preparation); resolve() },
      { code, message -> NativeRemoteCoordinator.endPreparation(preparation); reject(code, message) },
    )
    var refused = false
    var shouldStart = false
    val attached = synchronized(lock) {
      val current = service
      if (startupFailure != null || current == null && (pendingPrepare != null || pendingPreview != null)) refused = true
      else {
        this.emitter = emitter
        if (current == null) { pendingPrepare = request; shouldStart = startingService == null }
      }
      current
    }
    if (refused) { request.reject("OWNER_NOT_READY", "Audio preparation or shutdown is already in progress. Try again after it finishes."); return }

    if (attached != null) {
      attached.prepareSnapshot(snapshotJson, request.resolve, request.reject)
      return
    }

    if (!shouldStart) return
    val intent = Intent(context, ShowAudioService::class.java)
    try {
      // Preparation is a foreground user action. The service protects a
      // prepared show with its own ongoing media notification, independently
      // of whether any cue (or the silent diagnostic renderer) is playing.
      context.startService(intent)
    } catch (error: Exception) {
      val current = synchronized(lock) { if (pendingPrepare === request) { pendingPrepare = null; true } else false }
      if (current) request.reject("SERVICE_START_FAILED", error.message ?: "The Android audio service could not start.")
    }
  }

  fun dispatch(
    commandJson: String,
    resolve: () -> Unit,
    reject: (String, String) -> Unit,
  ) {
    val attached = synchronized(lock) { service }
    if (attached == null) {
      reject("ENGINE_NOT_PREPARED", "Prepare the native audio engine before dispatching commands.")
      return
    }
    attached.dispatchCommand(commandJson, resolve, reject)
  }

  fun dispatchUrgent(
    commandJson: String,
    resolve: () -> Unit,
    reject: (String, String) -> Unit,
  ) {
    val attached = synchronized(lock) { service }
    if (attached == null) {
      reject("ENGINE_NOT_PREPARED", "Prepare the native audio engine before dispatching commands.")
      return
    }
    attached.dispatchUrgentCommand(commandJson, resolve, reject)
  }

  fun shutdown(resolve: () -> Unit, reject: (String, String) -> Unit) {
    val target = synchronized(lock) {
      val attached = service; val starting = startingService
      val cancelled = if (attached == null && starting == null) {
        val pending = pendingPrepare to pendingPreview
        pendingPrepare = null; pendingPreview = null; pendingDiagnosticTransport = false; pending
      } else null
      Triple(attached, starting, cancelled)
    }
    val attached = target.first
    if (attached == null) {
      target.second?.let { it.cancelStartup(resolve); return }
      val cancelled = target.third
      cancelled?.first?.reject?.invoke("STARTUP_CANCELLED", "Audio preparation was cancelled before the service started.")
      cancelled?.second?.reject?.invoke("PREVIEW_CANCELLED", "Preview was cancelled before the service started.")
      resolve()
      return
    }
    attached.shutdownEngine(resolve, reject)
  }

  fun beginStartup(starting: ShowAudioService): Boolean = synchronized(lock) {
    if (service != null || startingService != null) return@synchronized false
    startingService = starting
    if (pendingPrepare == null && pendingPreview == null && !pendingDiagnosticTransport) {
      startupFailure = StartupFailure("STARTUP_CANCELLED", "Audio initialization was cancelled.", null, null)
      false
    } else true
  }

  fun failStartup(failed: ShowAudioService, code: String, message: String) {
    synchronized(lock) {
      if (startingService !== failed || startupFailure != null) return
      startupFailure = StartupFailure(code, message, pendingPrepare, pendingPreview)
      pendingPrepare = null; pendingPreview = null; pendingDiagnosticTransport = false
    }
  }

  fun attach(attached: ShowAudioService): Boolean = synchronized(lock) {
      if (startingService !== attached || startupFailure != null || pendingPrepare == null && pendingPreview == null && !pendingDiagnosticTransport) return@synchronized false
      service = attached
      startingService = null
      // Queue captured work before another caller can queue stop/shutdown.
      pendingPrepare?.let { attached.prepareSnapshot(it.snapshotJson, it.resolve, it.reject) }
      pendingPrepare = null
      pendingPreview?.let { attached.previewCue(it.json, it.positionMs, it.initialPaused, it.resolve, it.reject) }
      pendingPreview = null
      if (pendingDiagnosticTransport) attached.setDiagnosticTransport(true)
      true
  }

  fun detach(detached: ShowAudioService) {
    val failure = synchronized(lock) {
      if (service === detached) service = null
      if (startingService !== detached) return@synchronized null
      startingService = null
      val failed = startupFailure ?: StartupFailure("SERVICE_START_FAILED", "The native audio service stopped before initialization completed.", pendingPrepare, pendingPreview)
      pendingPrepare = null; pendingPreview = null; pendingDiagnosticTransport = false; startupFailure = null
      failed
    }
    // Settle only after destruction so Retry can safely start a fresh owner.
    if (failure != null) main.post {
      failure.prepare?.reject?.invoke(failure.code, failure.message)
      failure.preview?.reject?.invoke(failure.code, failure.message)
      // Promise owners report recoverable errors for their captured generation.
      // A duplicate FAULT event here could overwrite a newer run or audition.
    }
  }

  fun nextGeneration(): Long = synchronized(lock) { ++generation }
  fun isCurrent(sender: ShowAudioService): Boolean = synchronized(lock) { service === sender }

  /** Atomic owner admission for short control bookkeeping only. Never wait on
   * a handler or call a player while holding the runtime ownership lock. */
  fun <T> whileCurrent(sender: ShowAudioService, action: () -> T): T? = synchronized(lock) {
    if (service !== sender) null else action()
  }

  fun emit(sender: ShowAudioService, event: Map<String, Any?>) {
    synchronized(lock) { if (service === sender) emitter else null }?.invoke(event)
  }
  fun unbindEmitter(previous: (Map<String, Any?>) -> Unit) {
    synchronized(lock) { if (emitter === previous) emitter = null }
  }
  fun getPreparedSession(emitter: (Map<String, Any?>) -> Unit, resolve: (Map<String, Any?>?) -> Unit, reject: (String, String) -> Unit) {
    val attached = synchronized(lock) {
      when (preparedSessionRead(service != null, startingService != null, pendingPrepare != null || pendingPreview != null || pendingDiagnosticTransport || startupFailure != null)) {
        PreparedSessionRead.ATTACHED -> requireNotNull(service).also { this.emitter = emitter }
        PreparedSessionRead.INITIALIZING -> {
          // Null means confirmed empty. A fresh interface must never unlock while
          // an old preparation can still create a native owner behind it.
          reject("OWNER_NOT_READY", "Native audio initialization has not settled. Confirm a silent exit before preparing again.")
          return
        }
        PreparedSessionRead.EMPTY -> { resolve(null); return }
      }
    }
    attached.getPreparedSession(resolve)
  }
  fun getBackgroundReliability(context: Context, resolve: (Map<String, Any?>) -> Unit) {
    val attached = synchronized(lock) { service }
    if (attached != null) attached.getBackgroundReliability(resolve)
    else resolve(BackgroundReliability.read(context, false, false))
  }
  fun openBackgroundSettings(activity: Activity?, target: String, resolve: (Map<String, Any?>) -> Unit, reject: (String, String) -> Unit) {
    val attached = synchronized(lock) {
      service ?: run {
        // This short launch is ordered before another caller can admit prepare.
        try {
          check(startingService == null && pendingPrepare == null && pendingPreview == null && startupFailure == null) { "Wait for native audio preparation or shutdown to finish before changing system settings." }
          NativeRemoteCoordinator.requireIdle()
          resolve(BackgroundReliability.openSettings(activity, target))
        }
        catch (error: Exception) { reject("BACKGROUND_SETTINGS_ARMED", error.message ?: "Disarm before changing system settings.") }
        return
      }
    }
    attached.openBackgroundSettings(activity, target, resolve, reject)
  }
  fun getState(resolve: (Map<String, Any?>) -> Unit) {
    synchronized(lock) { service }?.getRunState(resolve) ?: resolve(mapOf("type" to "RUN_STATE", "generation" to 0, "transportMode" to "legacyCueStack", "phase" to "stopped", "selectedCueId" to "", "currentCueId" to "", "nextCueId" to "", "currentCueIndex" to -1, "nextCueIndex" to 0, "activeVoiceCount" to 0, "hasPendingActions" to false, "mainSequenceVoiceCount" to 0, "countdownRemainingMs" to 0))
  }
  fun semantic(json: String, resolve: () -> Unit, reject: (String, String) -> Unit) { synchronized(lock) { service }?.dispatchSemantic(json, resolve, reject) ?: reject("ENGINE_NOT_PREPARED", "Prepare the run first.") }
  fun preview(context: Context, json: String, positionMs: Long, initialPaused: Boolean, emitter: (Map<String, Any?>) -> Unit, resolve: () -> Unit, reject: (String, String) -> Unit) {
    val request = PendingPreview(json, positionMs, initialPaused, resolve, reject)
    var refused = false; var shouldStart = false
    val attached = synchronized(lock) {
      val current = service
      if (startupFailure != null || current == null && (pendingPrepare != null || pendingPreview != null)) refused = true
      else { this.emitter = emitter; if (current == null) { pendingPreview = request; shouldStart = startingService == null } }
      current
    }
    if (refused) { reject("OWNER_NOT_READY", "Audio preparation or shutdown is already in progress. Try again after it finishes."); return }
    if (attached != null) attached.previewCue(json, positionMs, initialPaused, resolve, reject)
    else if (shouldStart) try { context.startService(Intent(context, ShowAudioService::class.java)) } catch (error: Exception) {
      val current = synchronized(lock) { if (pendingPreview === request) { pendingPreview = null; true } else false }
      if (current) reject("PREVIEW_START_FAILED", error.message ?: "Could not start preview.")
    }
  }
  fun seekPreview(positionMs: Long, resolve: () -> Unit, reject: (String, String) -> Unit) { synchronized(lock) { service }?.seekPreview(positionMs, resolve, reject) ?: reject("NO_PREVIEW", "No preview is playing.") }
  fun setPreviewPaused(paused: Boolean, resolve: () -> Unit, reject: (String, String) -> Unit) { synchronized(lock) { service }?.setPreviewPaused(paused, resolve, reject) ?: reject("NO_PREVIEW", "No preview is playing.") }
  fun stopPreview(resolve: () -> Unit) {
    val target = synchronized(lock) {
      val attached = service
      val pending = pendingPreview
      val starting = startingService?.takeIf {
        attached == null && pendingPrepare == null && !pendingDiagnosticTransport &&
          (pending != null || startupFailure?.preview != null)
      }
      pendingPreview = null
      if (starting != null && startupFailure == null) {
        // Close admission before scheduling destruction. A newer show must not
        // attach to this cancelled startup and then be killed by its cleanup.
        startupFailure = StartupFailure("PREVIEW_CANCELLED", "Preview was stopped before preparation completed.", null, pending)
      }
      Triple(attached, starting, if (starting == null) pending else null)
    }
    target.third?.reject?.invoke("PREVIEW_CANCELLED", "Preview was stopped before preparation completed.")
    when {
      target.first != null -> target.first!!.stopPreview(resolve)
      target.second != null -> target.second!!.cancelStartup(resolve)
      else -> resolve()
    }
  }
}
