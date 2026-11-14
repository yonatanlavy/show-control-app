package expo.modules.kotlin.jni

import java.util.concurrent.CopyOnWriteArrayList

data class CallbackInvocation(val kind: String, val value: Any? = null, val code: String? = null)

/** Test boundary for JNI dispatch; contains no Promise settlement logic. */
class JavaCallback(private val beforeDispatch: (CallbackInvocation) -> Unit = {}) {
  val invocations = CopyOnWriteArrayList<CallbackInvocation>()

  private fun dispatch(invocation: CallbackInvocation) {
    beforeDispatch(invocation)
    invocations.add(invocation)
  }

  operator fun invoke() = dispatch(CallbackInvocation("void"))
  operator fun invoke(value: Any?) = dispatch(CallbackInvocation("any", value))
  operator fun invoke(result: Int) = dispatch(CallbackInvocation("int", result))
  operator fun invoke(result: Boolean) = dispatch(CallbackInvocation("boolean", result))
  operator fun invoke(result: Double) = dispatch(CallbackInvocation("double", result))
  operator fun invoke(result: Float) = dispatch(CallbackInvocation("float", result))
  operator fun invoke(result: String) = dispatch(CallbackInvocation("string", result))
  operator fun invoke(result: Collection<Any?>) = dispatch(CallbackInvocation("collection", result))
  operator fun invoke(result: Map<String, Any?>) = dispatch(CallbackInvocation("map", result))
  operator fun invoke(code: String?, errorMessage: String) = dispatch(CallbackInvocation("reject", errorMessage, code))
}
