package android.view
open class View(private val editor: Boolean = false) {
  val viewTreeObserver = ViewTreeObserver()
  open fun onCheckIsTextEditor() = editor
}
class ViewTreeObserver {
  fun interface OnGlobalFocusChangeListener { fun onGlobalFocusChanged(old: View?, next: View?) }
  private val listeners = mutableSetOf<OnGlobalFocusChangeListener>()
  val isAlive = true
  fun addOnGlobalFocusChangeListener(next: OnGlobalFocusChangeListener) { listeners.add(next) }
  fun removeOnGlobalFocusChangeListener(old: OnGlobalFocusChangeListener) { listeners.remove(old) }
  fun change(old: View?, next: View?) { listeners.toList().forEach { it.onGlobalFocusChanged(old, next) } }
  fun count() = listeners.size
}
class Window {
  interface Callback { fun dispatchKeyEvent(event: KeyEvent): Boolean }
  var callback: Callback? = null
  val decorView = View()
}
class InputDevice(val descriptor: String = "keyboard-one", val isExternal: Boolean = true) {
  fun supportsSource(source: Int) = true
  companion object {
    const val SOURCE_KEYBOARD = 257; const val SOURCE_DPAD = 513
    fun getDeviceIds() = intArrayOf(1)
    fun getDevice(id: Int): InputDevice? = InputDevice()
  }
}
class KeyEvent(val action: Int, val keyCode: Int, val repeatCount: Int = 0, val device: InputDevice? = InputDevice()) {
  companion object {
    const val ACTION_DOWN = 0; const val ACTION_UP = 1
    const val KEYCODE_SPACE = 62; const val KEYCODE_ENTER = 66
    const val KEYCODE_VOLUME_UP = 24; const val KEYCODE_VOLUME_DOWN = 25; const val KEYCODE_VOLUME_MUTE = 164; const val KEYCODE_MUTE = 91
    const val KEYCODE_MEDIA_PLAY_PAUSE = 85; const val KEYCODE_MEDIA_PLAY = 126; const val KEYCODE_MEDIA_PAUSE = 127
    const val KEYCODE_MEDIA_NEXT = 87; const val KEYCODE_MEDIA_PREVIOUS = 88; const val KEYCODE_MEDIA_STOP = 86
    const val KEYCODE_MEDIA_FAST_FORWARD = 90; const val KEYCODE_MEDIA_REWIND = 89; const val KEYCODE_HEADSETHOOK = 79
    fun keyCodeToString(key: Int) = if (key == KEYCODE_SPACE) "KEYCODE_SPACE" else if (key == KEYCODE_ENTER) "KEYCODE_ENTER" else "KEYCODE_$key"
  }
}
