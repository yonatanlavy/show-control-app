package app.showcontrol.audio

import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper

/** Hardware dependencies only. The runner inserts actual service teardown methods. */
class ShowAudioService {
  val commands = Handler(Looper())
  val main = Handler(Looper.getMainLooper())
  var destroyed = false
  var shutdownRequested = false
  var previewMode = false
  var prepared: String? = null
  var snapshotJson: String? = null
  var triggerGeneration = 1L
  var lastCommandId = -1L
  var recoveryRequired = false
  val shutdownCompletions = mutableListOf<() -> Unit>()
  var releasedSessions = 0
  var mediaSession: Session? = Session()
  var stopCalls = 0
  var stopFailure = false
  var releaseFailure = false
  var muted = false
  var safeStops = 0
  var diagnostic = false
  val broadcasts = mutableListOf<Map<String, Any?>>()
  private var stopScheduled = false
  inner class Session {
    fun release() { releasedSessions++; if (releaseFailure) error("Synthetic session release failure") }
  }
  fun safeStopInternal(reason: String, emitInterruption: Boolean) {
    safeStops++; muted = true
    if (stopFailure) error("Synthetic player stop failure")
  }
  fun emergencyMuteAll() { muted = true }
  fun sendRunBroadcast(event: Map<String, Any?>) { broadcasts += event }
  fun stopSelf() {
    if (stopScheduled) return
    stopScheduled = true; stopCalls++
    main.post {
      destroyed = true
      commands.looper.closed = true
      val completions = shutdownCompletions.toList(); shutdownCompletions.clear()
      ShowAudioRuntime.detach(this)
      main.post { completions.forEach { it() } }
    }
  }
  fun failStartup(code: String, message: String) { ShowAudioRuntime.failStartup(this, code, message); stopSelf() }
  fun prepareSnapshot(json: String, resolve: () -> Unit, reject: (String, String) -> Unit) {
    commands.post {
      if (destroyed || shutdownRequested) main.post { reject("OWNER_SHUTTING_DOWN", "closing") }
      else { prepared = json; snapshotJson = json; previewMode = false; NativeRemoteCoordinator.setArmed(true); main.post(resolve) }
    }
  }
  fun previewCue(json: String, position: Long, paused: Boolean, resolve: () -> Unit, reject: (String, String) -> Unit) {
    commands.post { previewMode = true; prepared = json; main.post(resolve) }
  }
  fun setDiagnosticTransport(active: Boolean) { diagnostic = active }
  fun dispatchCommand(json: String, resolve: () -> Unit, reject: (String, String) -> Unit) = resolve()
  fun dispatchUrgentCommand(json: String, resolve: () -> Unit, reject: (String, String) -> Unit) = resolve()
  fun dispatchSemantic(json: String, resolve: () -> Unit, reject: (String, String) -> Unit) = resolve()
  fun getPreparedSession(resolve: (Map<String, Any?>?) -> Unit) = resolve(if (prepared != null && !previewMode) mapOf("showId" to prepared) else null)
  fun getBackgroundReliability(resolve: (Map<String, Any?>) -> Unit) = resolve(emptyMap())
  fun openBackgroundSettings(activity: Activity?, target: String, resolve: (Map<String, Any?>) -> Unit, reject: (String, String) -> Unit) = resolve(emptyMap())
  fun getRunState(resolve: (Map<String, Any?>) -> Unit) = resolve(emptyMap())
  fun seekPreview(position: Long, resolve: () -> Unit, reject: (String, String) -> Unit) = resolve()
  fun setPreviewPaused(paused: Boolean, resolve: () -> Unit, reject: (String, String) -> Unit) = resolve()

  // ACTUAL_CANCEL_STARTUP
  // ACTUAL_SHUTDOWN
  // ACTUAL_STOP_PREVIEW
}

object BackgroundReliability {
  fun read(context: Context, service: Boolean, foreground: Boolean): Map<String, Any?> = emptyMap()
  fun openSettings(activity: Activity?, target: String): Map<String, Any?> = emptyMap()
}
