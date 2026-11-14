package app.showcontrol.controller

import android.content.Intent
import org.json.JSONObject
import app.showcontrol.audio.NativeRemoteCoordinator
import app.showcontrol.audio.ShowAudioRuntime

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import io.flic.flic2libandroid.Flic2Button
import io.flic.flic2libandroid.Flic2ButtonListener
import io.flic.flic2libandroid.Flic2Manager
import io.flic.flic2libandroid.Flic2ScanCallback
import java.util.UUID
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.atomic.AtomicLong

/**
 * Process-owned Flic runtime. The foreground service owns its armed lifetime; the Expo module is
 * only an observer. This prevents React-host teardown from removing the one native listener per
 * paired button.
 */
internal object ShowControllerRuntime {
  interface Observer {
    fun onInput(event: Map<String, Any>)
    fun onHealth(event: Map<String, Any>)
    fun onScan(event: Map<String, Any>)
  }

  interface PairCallback {
    fun onSuccess(result: Map<String, Any>)
    fun onError(code: String, message: String, error: Throwable? = null)
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  private val observers = CopyOnWriteArraySet<Observer>()
  private val buttonListeners = mutableMapOf<String, Flic2ButtonListener>()
  private val pressed = mutableSetOf<String>()
  private val pressTimes = LinkedHashMap<String, Long>()
  private val inputSequence = AtomicLong(0)
  private var bindings = emptyList<JSONObject>()
  private val keyboardTextGate = KeyboardTextInputGate()
  private var diagnosticMode = "off"
  private var diagnosticSessionId = ""
  private val pairingScan = PairingScan<PairCallback>()
  @Synchronized fun setDiagnosticMode(mode: String) {
    require(mode in setOf("off", "learn", "test"))
    if (mode == "off") NativeRemoteCoordinator.endDiagnostics() else NativeRemoteCoordinator.beginDiagnostics()
    diagnosticMode = mode
    diagnosticSessionId = if (mode == "off") "" else UUID.randomUUID().toString()
    try { applicationContext?.let { ShowAudioRuntime.setDiagnosticTransport(it, mode != "off") } }
    catch (error: Exception) { NativeRemoteCoordinator.endDiagnostics(); diagnosticMode = "off"; diagnosticSessionId = ""; throw error }
    pressed.clear()
    pressTimes.clear()
    emitHealth()
  }
  fun installMediaHandler() { NativeRemoteCoordinator.setMediaHandler(::forwardMediaInput) }
  fun forwardMediaInput(inputKey: String, deviceId: String): Boolean {
    val consumed = emitInput("system-media", deviceId, inputKey, "down", false, false, 0L)
    emitInput("system-media", deviceId, inputKey, "up", false, false, 0L)
    return consumed
  }
  @Synchronized fun configureProfile(json: String) {
    NativeRemoteCoordinator.requireIdle()
    val array = JSONObject(json).getJSONArray("bindings")
    require(array.length() <= 256)
    bindings = (0 until array.length()).map { array.getJSONObject(it) }.sortedByDescending { (if (it.has("adapterId")) 1 else 0) + (if (it.has("deviceId")) 1 else 0) }
  }
  private val sourceSessionId = UUID.randomUUID().toString()

  @Volatile private var applicationContext: Context? = null
  @Volatile private var manager: Flic2Manager? = null
  @Volatile private var configured = false
  @Volatile private var active = false
  @Volatile private var serviceOwnsLifecycle = false
  @Volatile private var backgroundRequested = true
  @Volatile private var staleQueueMaxAgeMs = 15_000L
  @Volatile private var staleEventsSuppressed = 0L
  @Volatile private var inputsDroppedWithoutBridge = 0L

  fun addObserver(observer: Observer) {
    observers.add(observer)
    applicationContext?.let { observer.onHealth(healthSnapshot(it)) }
  }

  fun removeObserver(observer: Observer) {
    observers.remove(observer)
  }

  fun configure(context: Context, staleMs: Long, background: Boolean) {
    applicationContext = context.applicationContext
    staleQueueMaxAgeMs = staleMs.coerceIn(0L, 120_000L)
    backgroundRequested = background
    configured = true
    emitHealth()
  }

  fun setServiceOwnsLifecycle(ownsLifecycle: Boolean) {
    serviceOwnsLifecycle = ownsLifecycle
    emitHealth()
  }

  fun start(context: Context) {
    applicationContext = context.applicationContext
    val flic = ensureManager(context)
    active = true
    flic.buttons.forEach { attach(it, connect = true) }
    emitHealth()
  }

  fun stop() {
    setDiagnosticMode("off")
    NativeRemoteCoordinator.setMediaHandler(null)
    cancelScan()
    manager?.buttons?.forEach { button ->
      buttonListeners.remove(button.bdAddr)?.let(button::removeListener)
      button.disconnectOrAbortPendingConnection()
    }
    pressed.clear()
    active = false
    emitHealth()
  }

  fun cancelScan() {
    val pending = pairingScan.cancel()
    manager?.stopScan()
    pending?.onError("E_CANCELLED", "Pairing cancelled.")
    emitScan("cancelled", "Pairing scan was cancelled.")
  }

  @Synchronized fun forwardGenericInput(
    deviceId: String,
    inputKey: String,
    phase: String,
    reportedRepeat: Boolean,
    editing: Boolean,
  ): Boolean {
    require(phase == "down" || phase == "up") { "phase must be down or up" }
    val binding = genericBinding(deviceId, inputKey)
    val diagnostic = NativeRemoteCoordinator.isDiagnostic()
    val identity = "generic-native:$deviceId:$inputKey"
    val disposition = keyboardTextGate.route(identity, phase, editing, diagnostic, binding?.optJSONObject("command")?.optString("type"))
    if (disposition != KeyboardTextDisposition.CONTROLLER) {
      // A down may precede focus, with its up delivered to the editor. Clear
      // native held/bounce state silently; typed keys never cross the bridge.
      pressed.remove(identity)
      pressTimes.remove(identity)
      return disposition == KeyboardTextDisposition.SUPPRESS
    }
    emitInput("generic-native", deviceId, inputKey, phase, reportedRepeat, false, 0L)
    return diagnostic || binding != null
  }

  @Synchronized
  fun hasGenericBinding(deviceId: String, inputKey: String): Boolean = genericBinding(deviceId, inputKey) != null

  private fun genericBinding(deviceId: String, inputKey: String): JSONObject? = bindings.firstOrNull {
    it.optString("inputKey") == inputKey && (!it.has("adapterId") || it.optString("adapterId") == "generic-native") && (!it.has("deviceId") || it.optString("deviceId") == deviceId)
  }

  @Synchronized
  fun resetGenericPressed() { pressed.removeAll { it.startsWith("generic-native:") }; pressTimes.keys.removeAll { it.startsWith("generic-native:") }; keyboardTextGate.reset(); emitHealth() }

  /** Publish only after the UI queue has actually installed its current lease. */
  fun notifyGenericCaptureChanged() = emitHealth()

  fun scanAndPair(context: Context, callback: PairCallback) {
    NativeRemoteCoordinator.requireIdle()
    if (!hasBluetoothPermissions(context)) {
      callback.onError(
        "E_BLUETOOTH_PERMISSION",
        "Nearby-device permission is required before starting Flic pairing.",
      )
      return
    }
    if (!pairingScan.begin(callback)) { callback.onError("E_FLIC_PAIR", "A pairing scan is already running."); return }
    emitScan("scanning", "Hold the Flic button for at least six seconds.")
    mainHandler.postDelayed({ if (pairingScan.finish(callback) != null) { manager?.stopScan(); callback.onError("E_FLIC_PAIR", "Flic pairing timed out. Try again near the phone."); emitScan("failed", "Flic pairing timed out. Try again near the phone.") } }, 90_000L)
    try {
      ensureManager(context).startScan(object : Flic2ScanCallback {
        override fun onDiscoveredAlreadyPairedButton(button: Flic2Button) {
          if (pairingScan.isCurrent(callback)) emitScan("already_paired", "An already paired Flic was found; keep holding the new button.")
        }

        override fun onDiscovered(bdAddr: String) {
          if (pairingScan.isCurrent(callback)) emitScan("discovered", "A Flic was found and is connecting.")
        }

        override fun onConnected() {
          if (pairingScan.isCurrent(callback)) emitScan("verifying", "The Flic is connected and being verified.")
        }

        override fun onAskToAcceptPairRequest() {
          if (pairingScan.isCurrent(callback)) emitScan("system_confirmation", "Accept the Android Pair & Connect dialog.")
        }

        override fun onComplete(result: Int, subCode: Int, button: Flic2Button?) {
          if (pairingScan.finish(callback) == null) return
          if (result == Flic2ScanCallback.RESULT_SUCCESS && button != null) {
            attach(button, connect = false)
            emitScan("paired", "The Flic is paired and ready.")
            emitHealth()
            callback.onSuccess(
              mapOf(
                "deviceId" to button.bdAddr,
                "name" to (button.name ?: "Flic 2"),
                "paired" to true,
                "initialPairingMayRequireInternet" to true,
              ),
            )
          } else {
            val detail = Flic2Manager.errorCodeToString(result)
            emitScan("failed", "Flic pairing failed: $detail ($subCode).")
            callback.onError("E_FLIC_PAIR", "Flic pairing failed: $detail ($subCode).")
          }
        }
      })
    } catch (error: SecurityException) {
      if (pairingScan.finish(callback) == null) return
      emitScan("failed", "Bluetooth permission is missing.")
      callback.onError("E_BLUETOOTH_PERMISSION", error.message ?: "Bluetooth permission is missing.", error)
    } catch (error: Throwable) {
      if (pairingScan.finish(callback) == null) return
      emitScan("failed", "Flic pairing could not start.")
      callback.onError("E_FLIC_PAIR", error.message ?: "Flic pairing could not start.", error)
    }
  }

  fun hasBluetoothPermissions(context: Context): Boolean = if (Build.VERSION.SDK_INT >= 31) {
    context.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED &&
      context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
  } else {
    context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
  }

  fun healthSnapshot(context: Context): Map<String, Any> {
    val buttons = manager?.buttons.orEmpty()
    val ready = buttons.count { it.connectionState == Flic2Button.CONNECTION_STATE_CONNECTED_READY }
    val connecting = buttons.count {
      it.connectionState == Flic2Button.CONNECTION_STATE_CONNECTING ||
        it.connectionState == Flic2Button.CONNECTION_STATE_CONNECTED_STARTING
    }
    @Suppress("DEPRECATION") val adapter = BluetoothAdapter.getDefaultAdapter()
    val bluetooth = try {
      when {
        adapter == null -> "unsupported"
        !hasBluetoothPermissions(context) -> "unauthorized"
        adapter.isEnabled -> "powered_on"
        else -> "powered_off"
      }
    } catch (_: SecurityException) {
      "unauthorized"
    }
    return mapOf(
      "sdkAvailable" to true,
      "configured" to configured,
      "restored" to (manager != null),
      "active" to active,
      "bluetoothState" to bluetooth,
      "pairedCount" to buttons.size,
      "readyCount" to ready,
      "connectingCount" to connecting,
      "staleEventsSuppressed" to staleEventsSuppressed.toDouble(),
      "inputsDroppedWithoutBridge" to inputsDroppedWithoutBridge.toDouble(),
      "bridgeAvailable" to observers.isNotEmpty(),
      "bridgeListenerCount" to observers.size,
      "backgroundRequested" to backgroundRequested,
      "nativeLifecycleOwner" to if (serviceOwnsLifecycle) "foreground_service" else "process_runtime",
      "survivesUserForceQuit" to false,
      "initialPairingMayRequireInternet" to true,
      "detail" to when {
        !active -> "Native controller listening is stopped."
        ready > 0 -> "$ready Flic controller(s) ready."
        else -> "No Flic controller is ready."
      },
      "diagnosticMode" to if (NativeRemoteCoordinator.isDiagnostic()) diagnosticMode else "off",
      "diagnosticSessionId" to if (NativeRemoteCoordinator.isDiagnostic()) diagnosticSessionId else "",
    )
  }

  private fun ensureManager(context: Context): Flic2Manager {
    manager?.let { return it }
    val created = Flic2Manager.initAndGetInstance(context.applicationContext, mainHandler)
    manager = created
    return created
  }

  @Synchronized
  private fun attach(button: Flic2Button, connect: Boolean) {
    if (buttonListeners.containsKey(button.bdAddr)) {
      if (connect) button.connect()
      return
    }
    val listener = object : Flic2ButtonListener() {
      override fun onReady(button: Flic2Button, timestamp: Long) = emitHealth()
      override fun onDisconnect(button: Flic2Button) {
        synchronized(this@ShowControllerRuntime) { val prefix = "flic2:${button.bdAddr}:"; pressed.removeAll { it.startsWith(prefix) }; pressTimes.keys.removeAll { it.startsWith(prefix) } }
        emitHealth()
      }

      override fun onUnpaired(button: Flic2Button) {
        buttonListeners.remove(button.bdAddr)?.let(button::removeListener)
        emitHealth()
      }

      override fun onFailure(button: Flic2Button, errorCode: Int, subCode: Int) {
        emitHealth(
          "Flic connection error: ${Flic2Manager.errorCodeToString(errorCode)} ($subCode).",
        )
      }

      override fun onButtonUpOrDown(
        button: Flic2Button,
        wasQueued: Boolean,
        lastQueued: Boolean,
        timestamp: Long,
        isUp: Boolean,
        isDown: Boolean,
      ) {
        val ageMs = if (wasQueued) (button.readyTimestamp - timestamp).coerceAtLeast(0L) else 0L
        if (wasQueued && ageMs > staleQueueMaxAgeMs) {
          staleEventsSuppressed += 1
          emitHealth()
          return
        }
        val phase = if (isDown) "down" else if (isUp) "up" else return
        emitInput("flic2", button.bdAddr, "primary", phase, false, wasQueued, ageMs)
      }
    }
    buttonListeners[button.bdAddr] = listener
    button.addListener(listener)
    if (connect) button.connect()
  }

  @Synchronized
  private fun emitInput(
    adapterId: String,
    deviceId: String,
    inputKey: String,
    phase: String,
    reportedRepeat: Boolean,
    wasQueued: Boolean,
    ageMs: Long,
  ): Boolean {
    val key = "$adapterId:$deviceId:$inputKey"
    val now = SystemClock.elapsedRealtime()
    val bounce = !wasQueued && phase == "down" && pressTimes[key]?.let { now - it < 80L } == true
    if (!wasQueued && phase == "down") { if (pressTimes.size >= 256) pressTimes.remove(pressTimes.keys.first()); pressTimes[key] = now }
    val inferredRepeat = if (wasQueued) false else if (phase == "down") !pressed.add(key) else {
      pressed.remove(key)
      false
    }
    val sequence = inputSequence.incrementAndGet()
    val binding = if (phase == "down" && !reportedRepeat && !inferredRepeat && !bounce && !wasQueued) bindings.firstOrNull {
      it.optString("inputKey") == inputKey && (!it.has("adapterId") || it.optString("adapterId") == adapterId) && (!it.has("deviceId") || it.optString("deviceId") == deviceId)
    } else null
    val diagnostic = NativeRemoteCoordinator.isDiagnostic()
    val defaultType = when (inputKey) {
      "MEDIA_NEXT" -> "GO"
      "MEDIA_PLAY_PAUSE" -> "PAUSE_RESUME"
      "MEDIA_PLAY" -> "RESUME"
      "MEDIA_PAUSE" -> "PAUSE"
      "MEDIA_PREVIOUS" -> "PREVIOUS"
      "MEDIA_STOP" -> "STOP_ALL"
      else -> null
    }
    if (binding != null && !diagnostic) {
      val command = JSONObject(binding.getJSONObject("command").toString()).put("eventId", "$sourceSessionId:$sequence")
      NativeRemoteCoordinator.commandEpoch(command.optString("type"))?.let { epoch ->
        command.put("controllerEpoch", epoch)
        applicationContext?.let { context -> context.sendBroadcast(Intent("app.showcontrol.SEMANTIC_COMMAND").setPackage(context.packageName).putExtra("command", command.toString())) }
      }
    }
    val event = mapOf<String, Any>(
      "eventId" to "$sourceSessionId:$sequence",
      "sourceSessionId" to sourceSessionId,
      "sequence" to sequence.toDouble(),
      "adapterId" to adapterId,
      "deviceId" to deviceId,
      "inputKey" to inputKey,
      "phase" to phase,
      "monotonicMs" to SystemClock.elapsedRealtime().toDouble(),
      "isRepeat" to (reportedRepeat || inferredRepeat || bounce),
      "wasQueued" to wasQueued,
      "ageMs" to ageMs.toDouble(),
      "deliveryEvidence" to "app_received_only",
      "handledNatively" to (diagnostic || binding != null || adapterId == "system-media"),
      "diagnosticMode" to if (diagnostic) diagnosticMode else "off",
      "diagnosticSessionId" to if (diagnostic) diagnosticSessionId else "",
      "resolvedCommandType" to (binding?.getJSONObject("command")?.optString("type") ?: if (adapterId == "system-media") defaultType ?: "" else ""),
    )
    if (observers.isEmpty()) {
      // Never replay a possibly stale GO when a bridge later appears.
      inputsDroppedWithoutBridge += 1
      return diagnostic || binding != null || (phase == "down" && (reportedRepeat || inferredRepeat || bounce || wasQueued))
    }
    observers.forEach { it.onInput(event) }
    return diagnostic || binding != null || (phase == "down" && (reportedRepeat || inferredRepeat || bounce || wasQueued))
  }

  private fun emitHealth(detailOverride: String? = null) {
    val context = applicationContext ?: return
    val snapshot = healthSnapshot(context).let { health ->
      if (detailOverride == null) health else health + ("detail" to detailOverride)
    }
    observers.forEach { it.onHealth(snapshot) }
  }

  private fun emitScan(state: String, detail: String) {
    val event = mapOf<String, Any>(
      "state" to state,
      "detail" to detail,
      "initialPairingMayRequireInternet" to true,
    )
    observers.forEach { it.onScan(event) }
  }
}
