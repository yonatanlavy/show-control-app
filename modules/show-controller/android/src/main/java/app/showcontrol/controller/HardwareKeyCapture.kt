package app.showcontrol.controller

import android.app.Activity
import android.content.Context
import android.hardware.input.InputManager
import android.os.Handler
import android.os.Looper
import android.view.InputDevice
import android.view.KeyEvent
import android.view.Window
import android.view.View
import android.view.ViewTreeObserver
import app.showcontrol.audio.NativeRemoteCoordinator

/** Foreground HID delivery. OS media commands remain owned by ShowAudio's MediaSession. */
internal class HardwareKeyCapture {
  private var window: Window? = null
  private var delegate: Window.Callback? = null
  private var callback: Window.Callback? = null
  private val main = Handler(Looper.getMainLooper())
  private val lifetime = KeyboardCaptureLifetime()
  private var inputManager: InputManager? = null
  private var focusTree: ViewTreeObserver? = null
  @Volatile private var textEditing = true
  private val focusListener = ViewTreeObserver.OnGlobalFocusChangeListener { _, next -> textEditing = editorFocused(next) }
  private val deviceListener = object : InputManager.InputDeviceListener {
    override fun onInputDeviceAdded(deviceId: Int) { if (lifetime.isAttached()) ShowControllerRuntime.resetGenericPressed() }
    override fun onInputDeviceChanged(deviceId: Int) { if (lifetime.isAttached()) ShowControllerRuntime.resetGenericPressed() }
    override fun onInputDeviceRemoved(deviceId: Int) { if (lifetime.isAttached()) ShowControllerRuntime.resetGenericPressed() }
  }
  val listening: Boolean get() = lifetime.isRequested()

  fun start(activity: Activity?) {
    install(activity, lifetime.start())
  }

  fun attach(activity: Activity?) {
    lifetime.attach()?.let { install(activity, it) }
  }

  private fun install(activity: Activity?, request: KeyboardCaptureRequest) {
    if (activity == null) {
      main.post { if (lifetime.mayAttach(request.epoch)) { detach(); ShowControllerRuntime.resetGenericPressed() } }
      return
    }
    activity.runOnUiThread {
      if (!lifetime.mayAttach(request.epoch)) return@runOnUiThread
      val target = activity.window
      val sameWindow = target === window && target.callback === callback
      val original = if (sameWindow) delegate else target.callback
      if (original == null) { detach(); return@runOnUiThread }
      if (!sameWindow) {
        detach()
        ShowControllerRuntime.resetGenericPressed()
        inputManager = activity.getSystemService(Context.INPUT_SERVICE) as InputManager
        inputManager?.registerInputDeviceListener(deviceListener, main)
      } else if (request.resetInput) ShowControllerRuntime.resetGenericPressed()
      if (!lifetime.mayAttach(request.epoch)) return@runOnUiThread
      val wrapper = object : Window.Callback by original {
        override fun dispatchKeyEvent(event: KeyEvent): Boolean {
          if (!lifetime.isActive(request.epoch) || window !== target) return original.dispatchKeyEvent(event)
          val device = event.device
          if (event.keyCode in setOf(KeyEvent.KEYCODE_VOLUME_UP, KeyEvent.KEYCODE_VOLUME_DOWN, KeyEvent.KEYCODE_VOLUME_MUTE, KeyEvent.KEYCODE_MUTE)) return original.dispatchKeyEvent(event)
          if (listening && isMediaKey(event.keyCode) && NativeRemoteCoordinator.isDiagnostic()) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
              val key = when (event.keyCode) {
                KeyEvent.KEYCODE_MEDIA_NEXT -> "MEDIA_NEXT"
                KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "MEDIA_PREVIOUS"
                KeyEvent.KEYCODE_MEDIA_STOP -> "MEDIA_STOP"
                KeyEvent.KEYCODE_MEDIA_PLAY -> "MEDIA_PLAY"
                KeyEvent.KEYCODE_MEDIA_PAUSE -> "MEDIA_PAUSE"
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_HEADSETHOOK -> "MEDIA_PLAY_PAUSE"
                else -> return original.dispatchKeyEvent(event)
              }
              ShowControllerRuntime.forwardMediaInput(key, "system-media")
            }
            return true
          }
          if (!listening || device?.isExternal != true || isMediaKey(event.keyCode) || event.action !in setOf(KeyEvent.ACTION_DOWN, KeyEvent.ACTION_UP)) return original.dispatchKeyEvent(event)
          val key = KeyEvent.keyCodeToString(event.keyCode)
          val deviceId = device.descriptor
          textEditing = editorFocused(activity.currentFocus)
          val consumed = forwardGenericInput(deviceId, key, if (event.action == KeyEvent.ACTION_DOWN) "down" else "up", event.repeatCount > 0)
          return consumed || original.dispatchKeyEvent(event)
        }
      }
      window = target
      delegate = original
      callback = wrapper
      target.callback = wrapper
      if (!sameWindow) focusTree = target.decorView.viewTreeObserver.also { it.addOnGlobalFocusChangeListener(focusListener) }
      textEditing = editorFocused(activity.currentFocus)
      lifetime.didAttach(request.epoch)
      ShowControllerRuntime.notifyGenericCaptureChanged()
    }
  }

  fun stop() {
    val epoch = lifetime.stop()
    main.post { if (lifetime.isCurrent(epoch)) { detach(); ShowControllerRuntime.resetGenericPressed() } }
  }

  fun suspend() {
    val epoch = lifetime.suspend()
    main.post { if (lifetime.isCurrent(epoch)) { detach(); ShowControllerRuntime.resetGenericPressed() } }
  }

  private fun detach() {
    textEditing = true
    focusTree?.let { if (it.isAlive) it.removeOnGlobalFocusChangeListener(focusListener) }
    focusTree = null
    inputManager?.unregisterInputDeviceListener(deviceListener)
    inputManager = null
    val current = window
    if (current != null && current.callback === callback) current.callback = delegate
    window = null
    delegate = null
    callback = null
  }

  /** Bridge callers use the UI-maintained boolean without queueing transport. */
  fun forwardGenericInput(deviceId: String, inputKey: String, phase: String, reportedRepeat: Boolean): Boolean =
    ShowControllerRuntime.forwardGenericInput(deviceId, inputKey, phase, reportedRepeat, !lifetime.isAttached() || window == null || textEditing)

  private fun editorFocused(view: View?): Boolean = try { view?.onCheckIsTextEditor() == true } catch (_: Exception) { true }

  fun health(): Map<String, Any> = mapOf(
    "genericKeyboardListening" to (lifetime.isAttached() && window != null),
    "genericKeyboardConnected" to InputDevice.getDeviceIds().any { id -> InputDevice.getDevice(id)?.let { it.isExternal && (it.supportsSource(InputDevice.SOURCE_KEYBOARD) || it.supportsSource(InputDevice.SOURCE_DPAD)) } == true },
    "genericKeyboardForegroundOnly" to true,
  )

  private fun isMediaKey(key: Int): Boolean = key in setOf(
    KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE,
    KeyEvent.KEYCODE_MEDIA_NEXT, KeyEvent.KEYCODE_MEDIA_PREVIOUS, KeyEvent.KEYCODE_MEDIA_STOP,
    KeyEvent.KEYCODE_MEDIA_FAST_FORWARD, KeyEvent.KEYCODE_MEDIA_REWIND, KeyEvent.KEYCODE_HEADSETHOOK,
  )
}
