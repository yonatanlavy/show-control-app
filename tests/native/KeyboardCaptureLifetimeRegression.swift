import Foundation

@main struct KeyboardCaptureLifetimeRegression {
  static func main() {
    for suspend in [false, true] { for count in 1...40 {
      let life = KeyboardCaptureLifetime()
      precondition(life.attach() == nil && !life.isRequested && !life.isAttached)
      let first = life.start()
      precondition(first.resetInput && !life.isAttached)
      life.didAttach(first.epoch)
      precondition(life.isActive(first.epoch))
      let cleanup = suspend ? life.suspend() : life.stop()
      precondition(!life.isAttached && !life.isActive(first.epoch))
      let latest = suspend && count % 2 == 0 ? life.attach()! : life.start()
      precondition(latest.resetInput && !life.isCurrent(cleanup) && !life.mayAttach(first.epoch))
      life.didAttach(latest.epoch); life.didAttach(first.epoch)
      precondition(life.isActive(latest.epoch) && life.isAttached)
      for _ in 0..<count {
        let again = life.attach()!
        precondition(!again.resetInput && !life.isAttached)
        life.didAttach(again.epoch)
        precondition(life.isActive(again.epoch) && !life.isActive(latest.epoch))
      }
      let end = life.stop()
      precondition(life.isCurrent(end) && !life.mayAttach(end) && !life.isAttached && life.attach() == nil)
      life.didAttach(latest.epoch); precondition(!life.isAttached)
    } }
    print("Capture lifetime: 80 stop/suspend/restart scenarios and 1,640 active reattachments passed")
  }
}
