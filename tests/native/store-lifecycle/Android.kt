package android.os

class Looper {
  private data class Work(val at: Long, val action: Runnable)
  private val work = mutableListOf<Work>()
  private var clock = 0L
  fun post(action: Runnable, delay: Long = 0): Boolean { work += Work(clock + delay, action); return true }
  fun remove(action: Runnable) { work.removeAll { it.action === action } }
  fun drain() { var count = 0; while (true) {
    val next = work.filter { it.at <= clock }.minByOrNull { it.at } ?: return
    work.remove(next); on(this) { next.action.run() }; check(++count < 1000)
  } }
  fun advance(ms: Long) { clock += ms; drain() }
  companion object {
    val main = Looper(); private var current: Looper? = null
    fun getMainLooper() = main
    fun myLooper() = current
    fun <T> on(target: Looper?, action: () -> T): T { val before = current; current = target; try { return action() } finally { current = before } }
  }
}
class Handler(val looper: Looper) {
  fun post(action: Runnable) = looper.post(action)
  fun postDelayed(action: Runnable, delay: Long) = looper.post(action, delay)
  fun removeCallbacks(action: Runnable) = looper.remove(action)
}
