package app.showcontrol.controller

fun main() {
  for (suspend in listOf(false, true)) for (repeat in 1..40) {
    val life = KeyboardCaptureLifetime()
    check(life.attach() == null && !life.isRequested() && !life.isAttached())
    val first = life.start()
    check(first.resetInput && !life.isAttached())
    life.didAttach(first.epoch)
    check(life.isActive(first.epoch))
    val cleanup = if (suspend) life.suspend() else life.stop()
    check(!life.isAttached() && !life.isActive(first.epoch))
    val latest = if (suspend && repeat % 2 == 0) life.attach()!! else life.start()
    check(latest.resetInput && !life.isCurrent(cleanup) && !life.mayAttach(first.epoch))
    life.didAttach(latest.epoch)
    life.didAttach(first.epoch)
    check(life.isActive(latest.epoch) && life.isAttached()) { "Stale install changed current capture" }
    repeat(repeat) {
      val again = life.attach()!!
      check(!again.resetInput && !life.isAttached()) { "Repeated active attach must preserve input while reporting pending state" }
      life.didAttach(again.epoch)
      check(life.isActive(again.epoch) && !life.isActive(latest.epoch))
    }
    val end = life.stop()
    check(life.isCurrent(end) && !life.mayAttach(end) && !life.isAttached() && life.attach() == null)
    life.didAttach(latest.epoch)
    check(!life.isAttached())
  }
  println("Capture lifetime: 80 stop/suspend/restart scenarios, 1,640 active reattachments, stale installs, truthful pending state and final stop passed")
}
