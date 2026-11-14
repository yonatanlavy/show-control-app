package android.app
import android.content.Context
import android.hardware.input.InputManager
import android.view.View
import android.view.Window
open class Activity : Context() {
  val window = Window()
  val inputs = InputManager()
  var currentFocus: View? = null
    set(value) { val old = field; field = value; window.decorView.viewTreeObserver.change(old, value) }
  var onRunOnUiThread: (((() -> Unit)) -> Unit)? = null
  fun runOnUiThread(action: () -> Unit) { val hook = onRunOnUiThread; if (hook == null) action() else hook(action) }
  override fun getSystemService(name: String): Any? = inputs
}
