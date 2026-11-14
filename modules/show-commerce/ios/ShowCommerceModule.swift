import ExpoModulesCore
import Foundation
import StoreKit
import UIKit
import ShowAudio

private let removePromotionsProductId = "remove_promotions"
private typealias StoreSnapshot = [String: Any]

private enum CommerceError: LocalizedError {
  case productNotConfigured, productTypeMismatch, unverified, unknownPurchaseResult
  case closed, busy, showChanged, timeout, activityUnavailable
  var errorDescription: String? {
    switch self {
    case .productNotConfigured: return "The remove_promotions product is unavailable in this storefront."
    case .productTypeMismatch: return "The product must be configured as a non-consumable."
    case .unverified: return "The current App Store transaction could not be verified. Restore purchases to retry."
    case .unknownPurchaseResult: return "The App Store returned an unsupported purchase result."
    case .closed: return "The store module stopped. Completed purchases remain recoverable through Restore purchase."
    case .busy: return "A store operation is already in progress."
    case .showChanged: return "Show preparation changed while the store request was pending. Retry after leaving the show."
    case .timeout: return "The store request timed out. Retry when the storefront is available."
    case .activityUnavailable: return "A visible app screen is required to open the storefront."
    }
  }
}

/// The lifetime cut is immediate even when Expo teardown arrives off-main.
private final class StoreLifetime: @unchecked Sendable {
  private let lock = NSLock()
  private var closed = false
  var isAlive: Bool { lock.lock(); defer { lock.unlock() }; return !closed }
  func close() { lock.lock(); defer { lock.unlock() }; closed = true }
}

@MainActor private final class StoreRequest {
  let id = UUID()
  let idleEpoch: Int64
  let continuation: CheckedContinuation<StoreSnapshot, Error>
  var task: Task<Void, Never>?
  var deadline: Task<Void, Never>?
  var handedOff = false
  init(_ epoch: Int64, _ continuation: CheckedContinuation<StoreSnapshot, Error>) {
    idleEpoch = epoch; self.continuation = continuation
  }
}

@MainActor private final class StoreOwner {
  private let lifetime: StoreLifetime
  private let emit: (StoreSnapshot) -> Void
  private var requests: [UUID: StoreRequest] = [:]
  private var interactive: UUID?
  private var updates: Task<Void, Never>?
  private var reconciling = false
  private var deliveries: [String: Transaction] = [:]
  private var completing = Set<String>()
  private var completedTransactions = Set<UInt64>()

  init(lifetime: StoreLifetime, emit: @escaping (StoreSnapshot) -> Void) { self.lifetime = lifetime; self.emit = emit }

  func close() {
    updates?.cancel(); updates = nil
    deliveries.removeAll(); completing.removeAll(); completedTransactions.removeAll()
    let abandoned = Array(requests.values)
    abandoned.forEach { finish($0, .failure(CommerceError.closed)) }
  }
  private func check(_ request: StoreRequest) throws {
    guard lifetime.isAlive, requests[request.id] === request else { throw CommerceError.closed }
    try Task.checkCancellation()
    if !request.handedOff && !NativeRemoteCoordinator.isCurrentIdleEpoch(request.idleEpoch) { throw CommerceError.showChanged }
  }
  private func finish(_ request: StoreRequest, _ result: Result<StoreSnapshot, Error>) {
    guard requests[request.id] === request else { return }
    requests.removeValue(forKey: request.id)
    if interactive == request.id { interactive = nil }
    request.deadline?.cancel(); request.deadline = nil
    request.task?.cancel(); request.task = nil
    request.continuation.resume(with: lifetime.isAlive ? result : .failure(CommerceError.closed))
  }
  private func deadline(_ request: StoreRequest) {
    request.deadline?.cancel()
    request.deadline = Task { [weak self, weak request] in
      do { try await Task.sleep(nanoseconds: 30_000_000_000) } catch { return }
      guard let self, let request else { return }
      self.finish(request, .failure(CommerceError.timeout))
    }
  }
  private func perform(interactive isInteractive: Bool = false, work: @escaping @MainActor (StoreRequest) async throws -> StoreSnapshot) async throws -> StoreSnapshot {
    try await withCheckedThrowingContinuation { continuation in
      guard lifetime.isAlive else { continuation.resume(throwing: CommerceError.closed); return }
      guard let epoch = NativeRemoteCoordinator.captureIdleEpoch() else { continuation.resume(throwing: CommerceError.showChanged); return }
      guard requests.count < 32, !isInteractive || interactive == nil else { continuation.resume(throwing: CommerceError.busy); return }
      let request = StoreRequest(epoch, continuation)
      requests[request.id] = request
      if isInteractive { interactive = request.id }
      deadline(request)
      request.task = Task { [self] in
        do { try check(request); let value = try await work(request); finish(request, .success(value)) }
        catch { finish(request, .failure(error)) }
      }
      listenForUpdates()
    }
  }
  private func requireVisible() throws {
    guard UIApplication.shared.applicationState == .active else { throw CommerceError.activityUnavailable }
    guard UIApplication.shared.connectedScenes.contains(where: { $0.activationState == .foregroundActive }) else { throw CommerceError.activityUnavailable }
  }
  private func publish(_ value: StoreSnapshot) {
    if lifetime.isAlive && NativeRemoteCoordinator.captureIdleEpoch() != nil { emit(value) }
  }

  func product() async throws -> StoreSnapshot {
    try await perform { request in
      let product = try await self.loadProduct()
      try self.check(request)
      return ["productId": removePromotionsProductId, "title": product.displayName, "description": product.description,
        "displayPrice": product.displayPrice, "source": "app_store"]
    }
  }
  func currentEntitlement() async throws -> StoreSnapshot {
    try await perform { request in try await self.entitlement(request) }
  }
  func purchase() async throws -> StoreSnapshot {
    try await perform(interactive: true) { request in
      try self.requireVisible()
      let product = try await self.loadProduct()
      try self.check(request)
      let current = try await self.entitlement(request)
      try self.check(request)
      if current["owned"] as? Bool == true { return self.purchaseSnapshot(current, "already_owned") }
      if current["status"] as? String == "unknown" { throw CommerceError.unverified }
      try self.requireVisible()
      // This is the final app-side admission check. No mutex is retained over
      // the async system checkout or user interaction. System UI timing still
      // requires the store/device matrix; cancellation cannot undo a charge.
      try self.check(request)
      request.handedOff = true; request.deadline?.cancel(); request.deadline = nil
      switch try await product.purchase() {
      case .success(let verification):
        switch verification {
        case .verified(let transaction):
          guard transaction.productID == removePromotionsProductId else { throw CommerceError.unverified }
          try self.check(request)
          let value = try self.deliverySnapshot(transaction); self.publish(value)
          return self.purchaseSnapshot(value, "purchased")
        case .unverified: throw CommerceError.unverified
        }
      case .pending:
        try self.check(request)
        let value = self.pendingSnapshot(); self.publish(value)
        return self.purchaseSnapshot(value, "pending")
      case .userCancelled:
        try self.check(request)
        return self.purchaseSnapshot(self.notOwnedSnapshot(), "cancelled")
      @unknown default: throw CommerceError.unknownPurchaseResult
      }
    }
  }
  func restore() async throws -> StoreSnapshot {
    try await perform(interactive: true) { request in
      try self.requireVisible(); try self.check(request)
      // AppStore.sync may ask for authentication. A lookup timeout must not
      // enable another system dialog while the first one awaits the user.
      request.handedOff = true; request.deadline?.cancel(); request.deadline = nil
      try await AppStore.sync()
      try self.check(request); self.deadline(request)
      let value = try await self.entitlement(request)
      self.publish(value); return value
    }
  }
  func completeDelivery(_ id: String) async throws {
    _ = try await perform { request in
      guard let transaction = self.deliveries[id] else { throw CommerceError.unverified }
      guard !self.completing.contains(id) else { throw CommerceError.busy }
      self.completing.insert(id)
      defer { self.completing.remove(id) }
      try self.check(request)
      // Ownership has already been committed by the caller. Never retain the
      // audio admission mutex over StoreKit's asynchronous finish operation.
      request.handedOff = true
      await transaction.finish()
      try self.check(request)
      if self.completedTransactions.count >= 32, let first = self.completedTransactions.first { self.completedTransactions.remove(first) }
      self.completedTransactions.insert(transaction.id)
      self.deliveries.removeValue(forKey: id)
      return self.ownedSnapshot()
    }
  }
  private func loadProduct() async throws -> Product {
    guard let product = try await Product.products(for: [removePromotionsProductId]).first else { throw CommerceError.productNotConfigured }
    guard product.type == .nonConsumable else { throw CommerceError.productTypeMismatch }
    guard !product.displayPrice.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw CommerceError.productNotConfigured }
    return product
  }
  private func entitlement(_ request: StoreRequest) async throws -> StoreSnapshot {
    var uncertain = false
    for await result in Transaction.currentEntitlements {
      try check(request)
      switch result {
      case .verified(let transaction) where transaction.productID == removePromotionsProductId:
        return try deliverySnapshot(transaction)
      case .unverified(let transaction, _) where transaction.productID == removePromotionsProductId:
        uncertain = true
      default: continue
      }
    }
    try check(request)
    return uncertain ? snapshot(false, "unknown", "not_applicable", "The App Store transaction could not be verified.") : notOwnedSnapshot()
  }
  private func listenForUpdates() {
    guard updates == nil else { return }
    updates = Task { [weak self] in
      for await result in Transaction.updates {
        guard !Task.isCancelled, let self, self.lifetime.isAlive else { return }
        let relevant: Bool
        switch result {
        case .verified(let transaction): relevant = transaction.productID == removePromotionsProductId
        case .unverified(let transaction, _): relevant = transaction.productID == removePromotionsProductId
        }
        guard relevant, self.interactive == nil, !self.reconciling, NativeRemoteCoordinator.captureIdleEpoch() != nil else { continue }
        self.reconciling = true
        do { let value = try await self.currentEntitlement(); self.publish(value) } catch { /* Reconcile again on the next deliberate idle refresh. */ }
        self.reconciling = false
      }
    }
  }
  private func snapshot(_ owned: Bool, _ status: String, _ verification: String, _ detail: String) -> StoreSnapshot {
    ["productId": removePromotionsProductId, "owned": owned, "status": status, "verification": verification, "source": "app_store", "detail": detail]
  }
  private func deliverySnapshot(_ transaction: Transaction) throws -> StoreSnapshot {
    if completedTransactions.contains(transaction.id) { return ownedSnapshot() }
    let existing = deliveries.first(where: { $0.value.id == transaction.id })?.key
    let id: String
    if let existing { id = existing }
    else {
      if deliveries.count >= 32 {
        guard let expendable = deliveries.keys.first(where: { !completing.contains($0) }) else { throw CommerceError.busy }
        deliveries.removeValue(forKey: expendable)
      }
      id = UUID().uuidString; deliveries[id] = transaction
    }
    var value = ownedSnapshot(); value["deliveryId"] = id; return value
  }
  private func ownedSnapshot() -> StoreSnapshot { snapshot(true, "owned", "storekit_verified", "App Store entitlement verified.") }
  private func pendingSnapshot() -> StoreSnapshot { snapshot(false, "pending", "not_applicable", "The purchase is pending approval or payment.") }
  private func notOwnedSnapshot() -> StoreSnapshot { snapshot(false, "not_owned", "not_applicable", "No current App Store entitlement was found.") }
  private func purchaseSnapshot(_ value: StoreSnapshot, _ outcome: String) -> StoreSnapshot { var result = value; result["outcome"] = outcome; return result }
}

public final class ShowCommerceModule: Module {
  private let lifetime = StoreLifetime()
  private var owner: StoreOwner?
  @MainActor private func store() throws -> StoreOwner {
    guard lifetime.isAlive else { throw CommerceError.closed }
    if let owner { return owner }
    let created = StoreOwner(lifetime: lifetime) { [weak self] value in self?.sendEvent("onEntitlementChanged", value) }
    owner = created; return created
  }
  public func definition() -> ModuleDefinition {
    Name("ShowCommerce")
    Events("onEntitlementChanged")
    AsyncFunction("product") { () async throws -> StoreSnapshot in let owner = try await self.store(); return try await owner.product() }
    AsyncFunction("currentEntitlement") { () async throws -> StoreSnapshot in let owner = try await self.store(); return try await owner.currentEntitlement() }
    AsyncFunction("purchase") { () async throws -> StoreSnapshot in let owner = try await self.store(); return try await owner.purchase() }
    AsyncFunction("restore") { () async throws -> StoreSnapshot in let owner = try await self.store(); return try await owner.restore() }
    AsyncFunction("completeDelivery") { (id: String) async throws in let owner = try await self.store(); try await owner.completeDelivery(id) }
    OnDestroy {
      self.lifetime.close()
      Task { @MainActor in self.owner?.close(); self.owner = nil }
    }
  }
}
