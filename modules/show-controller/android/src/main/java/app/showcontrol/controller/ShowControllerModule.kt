package app.showcontrol.controller

import android.content.Context
import app.showcontrol.audio.NativeRemoteCoordinator
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Expo bridge observer. Paired Flic listeners are owned by ShowControllerRuntime/service. */
class ShowControllerModule : Module() {
  private var backgroundRequested = true
  private var staleQueueMaxAgeMs = 15_000L
  private val keyboard = HardwareKeyCapture()

  private val observer = object : ShowControllerRuntime.Observer {
    override fun onInput(event: Map<String, Any>) = sendEvent("onControllerInput", event)
    override fun onHealth(event: Map<String, Any>) = sendEvent("onControllerHealth", event + keyboard.health())
    override fun onScan(event: Map<String, Any>) = sendEvent("onControllerScan", event)
  }

  override fun definition() = ModuleDefinition {
    Name("ShowController")
    Events("onControllerInput", "onControllerHealth", "onControllerScan")

    OnCreate {
      ShowControllerRuntime.addObserver(observer)
      restoreForegroundCapture()
    }

    AsyncFunction("configure") { staleMs: Double, background: Boolean ->
      staleQueueMaxAgeMs = staleMs.toLong().coerceIn(0L, 120_000L)
      backgroundRequested = background
      ShowControllerRuntime.configure(requireContext(), staleQueueMaxAgeMs, background)
    }

    AsyncFunction("start") {
      val context = requireContext()
      ShowControllerRuntime.configure(context, staleQueueMaxAgeMs, backgroundRequested)
      ShowControllerRuntime.installMediaHandler()
      keyboard.start(appContext.currentActivity)
      // Paired HID keyboards do not need this app's Bluetooth scan permission.
      if (ShowControllerRuntime.hasBluetoothPermissions(context)) {
        if (backgroundRequested) ShowControllerService.start(context, staleQueueMaxAgeMs)
        else ShowControllerRuntime.start(context)
      }
    }
    AsyncFunction("configureProfile") { json: String -> ShowControllerRuntime.configureProfile(json) }
    AsyncFunction("setDiagnosticMode") { mode: String -> ShowControllerRuntime.setDiagnosticMode(mode); ShowControllerRuntime.healthSnapshot(requireContext()) + keyboard.health() }

    AsyncFunction("stop") {
      keyboard.stop()
      ShowControllerService.stop(requireContext())
    }

    AsyncFunction("health") {
      ShowControllerRuntime.healthSnapshot(requireContext()) + keyboard.health()
    }

    AsyncFunction("scanAndPair") { promise: Promise ->
      ShowControllerRuntime.scanAndPair(requireContext(), object : ShowControllerRuntime.PairCallback {
        override fun onSuccess(result: Map<String, Any>) = promise.resolve(result)
        override fun onError(code: String, message: String, error: Throwable?) =
          promise.reject(code, message, error)
      })
    }

    Function("cancelScan") {
      ShowControllerRuntime.cancelScan()
    }

    Function("forwardGenericInput") {
        deviceId: String, inputKey: String, phase: String, reportedRepeat: Boolean ->
      keyboard.forwardGenericInput(deviceId, inputKey, phase, reportedRepeat)
      Unit
    }

    OnActivityEntersForeground { restoreForegroundCapture(); keyboard.attach(appContext.currentActivity) }
    // Android's system Pair & Connect activity also pauses our activity.
    // Keep that scan alive; explicit cancellation, teardown and timeout own it.
    OnActivityEntersBackground { keyboard.suspend(); ShowControllerRuntime.setDiagnosticMode("off") }

    OnDestroy {
      keyboard.stop()
      ShowControllerRuntime.cancelScan()
      ShowControllerRuntime.setDiagnosticMode("off")
      // The foreground service remains the Flic lifecycle owner while Armed/background.
      ShowControllerRuntime.removeObserver(observer)
    }
  }

  private fun restoreForegroundCapture() {
    // Recreating only the Expo observer must not lose an already-armed HID
    // capture. Keep the existing profile, service and native command epoch.
    if (NativeRemoteCoordinator.isArmed() && !keyboard.listening) keyboard.start(appContext.currentActivity)
  }

  private fun requireContext(): Context =
    appContext.reactContext?.applicationContext ?: error("React context is not ready.")
}
