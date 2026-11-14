package app.showcontrol.controller
import android.app.Activity
import android.view.KeyEvent
import android.view.View
import android.view.Window
import android.view.InputDevice
import android.os.Handler
import app.showcontrol.audio.NativeRemoteCoordinator

fun main() {
  val activity = Activity()
  var delegated = 0
  activity.window.callback = object : Window.Callback { override fun dispatchKeyEvent(event: KeyEvent): Boolean { delegated++; return false } }
  val editor = View(true)
  activity.currentFocus = editor
  val capture = HardwareKeyCapture()
  capture.start(activity)
  NativeRemoteCoordinator.setArmed(true)
  activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SPACE))
  check(delegated == 1) { "Typing Space was consumed by the real Window callback instead of reaching the editor" }
  check(ShowControllerRuntime.received.isEmpty()) { "Typed keys must not dispatch or enter controller history" }
  activity.currentFocus = null
  check(activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SPACE, 1)))
  check(activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_SPACE)))
  check(delegated == 1 && ShowControllerRuntime.received.isEmpty()) { "A held typing key must not become a controller or default-view activation after blur" }
  check(activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SPACE)))
  check(ShowControllerRuntime.received == listOf("KEYCODE_SPACE:down"))
  activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_SPACE))
  ShowControllerRuntime.received.clear()
  activity.currentFocus = editor
  capture.forwardGenericInput("keyboard-one", "KEYCODE_SPACE", "down", false)
  check(ShowControllerRuntime.received.isEmpty()) { "Bridge route must observe native focus without waiting for a key callback" }
  activity.currentFocus = null
  capture.forwardGenericInput("keyboard-two", "KEYCODE_SPACE", "down", false)
  check(ShowControllerRuntime.received == listOf("KEYCODE_SPACE:down")) { "One device's typing latch must not affect another" }
  capture.forwardGenericInput("keyboard-one", "KEYCODE_SPACE", "up", false)
  ShowControllerRuntime.received.clear()
  activity.currentFocus = editor
  for (safety in listOf("PANIC_FADE", "STOP_ALL")) {
    ShowControllerRuntime.mappings["KEYCODE_ENTER"] = safety
    check(activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER)))
    activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER))
  }
  check(ShowControllerRuntime.received.size == 4) { "Assigned safety keys must remain available while editing" }
  ShowControllerRuntime.received.clear()
  val before = delegated
  activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_UP))
  activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_NEXT))
  activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SPACE, device = InputDevice(isExternal = false)))
  activity.window.callback!!.dispatchKeyEvent(KeyEvent(2, KeyEvent.KEYCODE_SPACE))
  activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SPACE, device = null))
  check(delegated == before + 5 && ShowControllerRuntime.received.isEmpty()) { "OS volume/media/internal/unsupported events must retain delegation" }
  activity.currentFocus = object : View() { override fun onCheckIsTextEditor(): Boolean = throw IllegalStateException("Unavailable focus") }
  activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SPACE))
  check(ShowControllerRuntime.received.isEmpty()) { "Failed focus observations must remain conservative" }
  activity.currentFocus = null
  activity.inputs.listener!!.onInputDeviceRemoved(1)
  capture.forwardGenericInput("keyboard-one", "KEYCODE_SPACE", "down", false)
  check(ShowControllerRuntime.received == listOf("KEYCODE_SPACE:down"))
  capture.attach(activity)
  capture.attach(activity)
  check(activity.window.decorView.viewTreeObserver.count() == 1) { "Repeated attach leaked focus listeners" }
  capture.suspend()
  check(activity.window.decorView.viewTreeObserver.count() == 0 && activity.inputs.listener == null)
  capture.forwardGenericInput("keyboard-one", "KEYCODE_SPACE", "down", false)
  check(ShowControllerRuntime.received.isEmpty()) { "Detached bridge focus is unknown and must not trigger a show" }
  capture.attach(activity)
  activity.currentFocus = editor
  NativeRemoteCoordinator.setArmed(false)
  // Android runOnUiThread executes inline on main, ahead of older posted
  // cleanup. This controls that legal ordering without a timing-based sleep.
  for (suspend in listOf(false, true)) {
    capture.start(activity)
    var oldCleanup: (() -> Unit)? = null
    Handler.onPost = { action -> oldCleanup = action }
    if (suspend) capture.suspend() else capture.stop()
    Handler.onPost = null
    capture.start(activity)
    check(oldCleanup != null)
    oldCleanup!!.invoke()
    check(capture.health()["genericKeyboardListening"] == true) { "Old ${if (suspend) "suspend" else "stop"} cleanup detached a newer capture" }
    capture.stop()
  }
  var obsoleteInstall: (() -> Unit)? = null
  activity.onRunOnUiThread = { action -> obsoleteInstall = action }
  capture.start(activity)
  activity.onRunOnUiThread = null
  capture.stop()
  capture.start(activity)
  obsoleteInstall!!.invoke()
  check(capture.health()["genericKeyboardListening"] == true) { "Late setup adopted an obsolete capture" }
  val oldCallback = activity.window.callback!!
  ShowControllerRuntime.received.clear()
  activity.currentFocus = editor
  oldCallback.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SPACE))
  activity.currentFocus = null
  capture.attach(activity)
  oldCallback.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SPACE))
  check(ShowControllerRuntime.received.isEmpty()) { "An old callback dispatched into the new capture" }
  activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SPACE, 1))
  check(ShowControllerRuntime.received.isEmpty()) { "Reattachment lost the typing latch" }
  activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_SPACE))
  activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SPACE))
  check(ShowControllerRuntime.received == listOf("KEYCODE_SPACE:down"))
  capture.stop()
  val beforeForeign = activity.window.callback
  capture.start(activity)
  activity.currentFocus = null
  ShowControllerRuntime.received.clear()
  val ownedCallback = activity.window.callback!!
  val foreign = object : Window.Callback by ownedCallback {}
  activity.window.callback = foreign
  foreign.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SPACE))
  check(ShowControllerRuntime.received == listOf("KEYCODE_SPACE:down")) { "A legitimate Window callback decorator lost keyboard input" }
  capture.stop()
  check(activity.window.callback === foreign) { "Teardown replaced another Window callback owner" }
  activity.window.callback = beforeForeign
  activity.currentFocus = editor
  capture.start(activity)
  NativeRemoteCoordinator.beginDiagnostics()
  activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SPACE))
  activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_NEXT))
  activity.window.callback!!.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_NEXT, 1))
  check(ShowControllerRuntime.received == listOf("KEYCODE_SPACE:down", "MEDIA_NEXT:media")) { "Explicit silent learning must still receive fresh keyboard/media input" }
  NativeRemoteCoordinator.endDiagnostics()
  capture.stop()
  check(activity.window.decorView.viewTreeObserver.count() == 0 && activity.inputs.listener == null)
  NativeRemoteCoordinator.setArmed(false)
  println("Actual Android Window callback respects text entry (SDK-stub integration)")
}
