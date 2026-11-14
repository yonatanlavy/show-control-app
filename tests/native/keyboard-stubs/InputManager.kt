package android.hardware.input
import android.os.Handler
class InputManager {
  interface InputDeviceListener { fun onInputDeviceAdded(deviceId: Int); fun onInputDeviceChanged(deviceId: Int); fun onInputDeviceRemoved(deviceId: Int) }
  var listener: InputDeviceListener? = null
  fun registerInputDeviceListener(next: InputDeviceListener, handler: Handler) { listener = next }
  fun unregisterInputDeviceListener(old: InputDeviceListener) { if (listener === old) listener = null }
}
