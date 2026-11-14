package android.os
class Looper { companion object { fun getMainLooper() = Looper() } }
class Handler(looper: Looper) {
  fun post(action: () -> Unit) { val hook = onPost; if (hook == null) action() else hook(action) }
  companion object { var onPost: (((() -> Unit)) -> Unit)? = null }
}
