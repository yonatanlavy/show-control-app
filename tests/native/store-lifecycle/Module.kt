package expo.modules.kotlin.modules
import android.app.Activity
import android.content.Context
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues

class AppContext { var reactContext: Context? = Context(); var currentActivity: Activity? = Activity() }
open class Module {
  val appContext = AppContext()
  val events = mutableListOf<Pair<String, Any>>()
  open fun definition(): ModuleDefinition = error("No definition")
  fun sendEvent(name: String, payload: Any) { events += name to payload }
}
class NativeFunction(private val action: (String?, Promise) -> Unit) {
  var queue = Queues.DEFAULT
  fun runOnQueue(value: Queues) = apply { queue = value }
  fun call(promise: Promise, argument: String? = null) = Looper.on(if (queue == Queues.MAIN) Looper.main else null) { action(argument, promise) }
}
class ModuleDefinition(body: ModuleDefinition.() -> Unit) {
  val functions = mutableMapOf<String, NativeFunction>()
  private var close: () -> Unit = {}
  init { body() }
  fun Name(value: String) { check(value == "ShowCommerce") }
  fun Events(vararg names: String) { check(names.toList() == listOf("onEntitlementChanged")) }
  fun AsyncFunction(name: String, action: (Promise) -> Unit): NativeFunction = NativeFunction { _, promise -> action(promise) }.also { functions[name] = it }
  fun AsyncFunction(name: String, action: (String, Promise) -> Unit): NativeFunction = NativeFunction { argument, promise -> action(requireNotNull(argument), promise) }.also { functions[name] = it }
  fun OnDestroy(action: () -> Unit) { close = action }
  fun destroy() { close(); Looper.main.drain() }
  fun call(name: String, promise: Promise, argument: String? = null) { functions.getValue(name).call(promise, argument); Looper.main.drain() }
}
