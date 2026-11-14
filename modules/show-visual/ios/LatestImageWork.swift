import Foundation

/// UI-owned requests/publication, with a single decode/result and latest pending slot.
final class LatestImageWork<Value> {
  private struct Request {
    let revision: UInt64
    let load: () throws -> Value
    let complete: (Result<Value, Error>) -> Void
  }
  private let worker = DispatchQueue(label: "show-control.audience-image", qos: .userInitiated)
  private let lock = NSLock()
  private var revision: UInt64 = 0
  private var pending: Request?
  private var running = false
  private var closed = false

  @discardableResult func submit(_ load: @escaping () throws -> Value, complete: @escaping (Result<Value, Error>) -> Void) -> Bool {
    lock.lock()
    guard !closed else { lock.unlock(); return false }
    revision &+= 1; pending = Request(revision: revision, load: load, complete: complete)
    let start = !running; running = true
    lock.unlock()
    if start { startNext() }
    return true
  }
  func cancel() { lock.lock(); revision &+= 1; pending = nil; lock.unlock() }
  func close() { lock.lock(); closed = true; revision &+= 1; pending = nil; lock.unlock() }

  private func startNext() {
    lock.lock()
    guard !closed, let request = pending else { running = false; lock.unlock(); return }
    pending = nil; lock.unlock()
    worker.async { [weak self] in
      guard let self else { return }
      self.lock.lock(); let current = !self.closed && self.revision == request.revision; self.lock.unlock()
      let result: Result<Value, Error> = current ? Result { try request.load() } : .failure(NSError(domain: "ShowVisual", code: 3))
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        self.lock.lock(); let current = !self.closed && self.revision == request.revision; self.lock.unlock()
        if current { request.complete(result) }
        // Obsolete CGImages release here through ARC. Wait for UI consumption
        // before decoding again, bounding results behind a busy UI queue.
        self.startNext()
      }
    }
  }
}
