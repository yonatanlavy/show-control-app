package expo.modules.kotlin

// Compile boundary only: the implementation under test is Expo's real source.
interface Promise {
  fun resolve(value: Any?)
  fun resolve()
  fun resolve(result: Int)
  fun resolve(result: Boolean)
  fun resolve(result: Double)
  fun resolve(result: Float)
  fun resolve(result: String)
  fun resolve(result: Collection<Any?>)
  fun resolve(result: Map<String, Any?>)
  fun reject(code: String?, message: String?, cause: Throwable?)
}
