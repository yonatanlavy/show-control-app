package android.content

class Intent(val context: Context, val type: Class<*>)
open class Context {
  var serviceStarts = 0
  var startFailure = false
  fun startService(intent: Intent) { if(startFailure) error("Synthetic service start failure"); serviceStarts++ }
}
