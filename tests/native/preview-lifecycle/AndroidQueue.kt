package android.os

class Looper {
  private val work = ArrayDeque<() -> Unit>()
  var closed = false
  fun post(action: () -> Unit): Boolean { if (closed) return false; work.addLast(action); return true }
  fun next(): Boolean { val action = work.removeFirstOrNull() ?: return false; action(); return true }
  fun drain() { var count = 0; while (next()) check(++count < 1000) }
  companion object { val main = Looper(); fun getMainLooper() = main }
}
class Handler(val looper: Looper) { fun post(action: () -> Unit) = looper.post(action) }
