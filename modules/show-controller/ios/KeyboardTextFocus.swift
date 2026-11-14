import Foundation
import UIKit

private final class KeyboardTextFocusProbe: NSObject { var editing: Bool? }

extension UIResponder {
  @objc fileprivate func showControlKeyboardTextFocus(_ sender: Any?) {
    (sender as? KeyboardTextFocusProbe)?.editing = self is UITextInput
  }
}

/** Main-queue responder observation; bridge threads read only a locked boolean. */
final class KeyboardTextFocus {
  private let lock = NSLock()
  private var value = true
  var editing: Bool { lock.lock(); defer { lock.unlock() }; return value }
  func invalidate() { lock.lock(); value = true; lock.unlock() }
  func refresh() {
    guard Thread.isMainThread else { invalidate(); return }
    let probe = KeyboardTextFocusProbe()
    let handled = UIApplication.shared.sendAction(#selector(UIResponder.showControlKeyboardTextFocus(_:)), to: nil, from: probe, for: nil)
    lock.lock(); value = handled ? probe.editing ?? true : false; lock.unlock()
  }
}
