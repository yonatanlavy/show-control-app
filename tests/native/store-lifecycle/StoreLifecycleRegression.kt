package app.showcontrol.commerce
import android.os.Looper
import app.showcontrol.audio.NativeRemoteCoordinator
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues

private class Receipt : Promise {
  var values = mutableListOf<Any?>(); var errors = mutableListOf<String?>()
  override fun resolve(value: Any?) { values += value }
  override fun reject(code: String?, message: String?, cause: Throwable?) { errors += code }
  val settled get() = values.size + errors.size
}
private class Fixture(ready: Boolean = true) {
  val module = ShowCommerceModule(); val definition = module.definition()
  init { NativeRemoteCoordinator.setArmed(false); NativeRemoteCoordinator.endDiagnostics(); BillingClient.readyOnBuild = ready }
  fun call(name: String) = Receipt().also { definition.call(name, it) }
  fun complete(receipt: Receipt) = Receipt().also { definition.call("completeDelivery", it, (receipt.values.single() as Map<*, *>)["deliveryId"] as String) }
  fun complete(id: String) = Receipt().also { definition.call("completeDelivery", it, id) }
  val sdk get() = BillingClient.clients.last()
  fun productLookup() { if (sdk.purchases.isNotEmpty()) sdk.owned(); if (sdk.products.isNotEmpty()) sdk.product(); if (sdk.purchases.isNotEmpty()) sdk.owned() }
  fun close() { definition.destroy() }
}
private fun Receipt.outcome() = (values.single() as Map<*, *>)["outcome"]
private fun Receipt.owned() = (values.single() as Map<*, *>)["owned"]
fun main() {
  val failures = mutableListOf<String>(); var count = 0
  fun test(name: String, run: () -> Unit) { count++; try { run() } catch (error: Throwable) { failures += name; println("FAIL $name: ${error.message}") } }
  test("native methods explicitly use the main queue") {
    val f = Fixture(); check(f.definition.functions.values.all { it.queue == Queues.MAIN }); f.close()
  }
  test("purchase slot is reserved before product lookup") {
    val f = Fixture(); val first = f.call("purchase"); val second = f.call("purchase")
    check(second.errors.size == 1 && first.settled == 0); f.productLookup(); check(f.sdk.launches == 1); f.close()
  }
  test("queued connection promises settle at teardown") {
    val f = Fixture(false); val request = f.call("product"); f.close(); check(request.errors.size == 1 && request.values.isEmpty())
  }
  test("late metadata cannot publish after teardown") {
    val f = Fixture(); val request = f.call("product"); f.close(); f.sdk.product()
    check(request.errors.size == 1 && request.values.isEmpty())
  }
  test("missing offer rejects instead of throwing from a callback") {
    val f = Fixture(); val request = f.call("product")
    check(runCatching { f.sdk.product(ProductDetails(oneTimePurchaseOfferDetailsList = emptyList())) }.isSuccess)
    check(request.errors.size == 1); f.close()
  }
  test("armed native ownership blocks raw commerce admission") {
    val f = Fixture(); val before = BillingClient.clients.size; NativeRemoteCoordinator.setArmed(true)
    val request = f.call("purchase"); check(request.errors.size == 1 && BillingClient.clients.size == before); f.close(); NativeRemoteCoordinator.setArmed(false)
  }
  test("arming during lookup prevents delayed checkout") {
    val f = Fixture(); val request = f.call("purchase"); NativeRemoteCoordinator.setArmed(true); f.productLookup()
    check(f.sdk.launches == 0 && request.errors.size == 1); f.close(); NativeRemoteCoordinator.setArmed(false)
  }
  test("a prepare and exit round trip cannot revive old checkout work") {
    val f = Fixture(); val request = f.call("purchase"); NativeRemoteCoordinator.setArmed(true); NativeRemoteCoordinator.setArmed(false); f.productLookup()
    check(f.sdk.launches == 0 && request.errors.size == 1); f.close()
  }
  test("backgrounding during lookup prevents new checkout") {
    val f = Fixture(); val request = f.call("purchase"); f.module.appContext.currentActivity!!.focused = false; f.productLookup()
    check(f.sdk.launches == 0 && request.errors.size == 1); f.close()
  }
  test("lookup timeout releases an optional store request") {
    val f = Fixture(); val request = f.call("product"); Looper.main.advance(31_000)
    check(request.errors.size == 1); f.sdk.product(); check(request.settled == 1); f.close()
  }
  test("already-owned purchase reconciles without another checkout") {
    val f = Fixture(); val request = f.call("purchase"); f.sdk.product()
    // Existing ownership is a separate authoritative query before checkout.
    check(f.sdk.purchases.isNotEmpty()); f.sdk.owned(listOf(Purchase(isAcknowledged = true)))
    check(request.outcome() == "already_owned" && request.owned() == true && f.sdk.launches == 0); f.close()
  }
  test("pending purchase does not open another checkout or acknowledge") {
    val f = Fixture(); val request = f.call("purchase"); f.sdk.product()
    check(f.sdk.purchases.isNotEmpty()); f.sdk.owned(listOf(Purchase(purchaseState = Purchase.PurchaseState.PENDING)))
    check(request.outcome() == "pending" && request.owned() == false && f.sdk.launches == 0 && f.sdk.acknowledgeCalls == 0); f.close()
  }
  test("an unspecified ownership state cannot revoke an offline purchase") {
    val f = Fixture(); val request = f.call("currentEntitlement")
    f.sdk.owned(listOf(Purchase(purchaseState = Purchase.PurchaseState.UNSPECIFIED_STATE)))
    check(request.errors.single() == "E_PURCHASE_STATE" && request.values.isEmpty()); f.close()
  }
  test("pending ownership beats an unrelated unspecified matching record") {
    val f = Fixture(); val request = f.call("currentEntitlement")
    f.sdk.owned(listOf(Purchase(purchaseState = 0), Purchase(purchaseState = 2)))
    check(request.owned() == false && (request.values.single() as Map<*, *>)["status"] == "pending"); f.close()
  }
  test("blank localized price blocks direct purchase before UI") {
    val f = Fixture(); val request = f.call("purchase")
    f.sdk.product(ProductDetails(oneTimePurchaseOfferDetailsList = listOf(ProductDetails.Offer(formattedPrice = " "))))
    if(f.sdk.purchases.isNotEmpty()) f.sdk.owned()
    check(f.sdk.launches == 0 && request.errors.single() == "E_NO_ELIGIBLE_OFFER"); f.close()
  }
  test("purchase and restore share interactive admission during metadata lookup") {
    val f = Fixture(); val purchase = f.call("purchase"); val restore = f.call("restore")
    check(purchase.settled == 0 && restore.errors.single() == "E_PURCHASE_IN_PROGRESS"); f.close()
  }
  test("restore admission excludes a simultaneous purchase") {
    val f = Fixture(); val restore = f.call("restore"); val purchase = f.call("purchase")
    check(restore.settled == 0 && purchase.errors.single() == "E_PURCHASE_IN_PROGRESS"); f.sdk.owned(); check(restore.settled == 1); f.close()
  }
  test("destruction settles all queued operation kinds once") {
    for (name in listOf("product", "currentEntitlement", "restore", "purchase")) {
      val f = Fixture(false); val request = f.call(name); val sdk = f.sdk; f.close(); sdk.connected()
      check(request.errors.single() == "E_STORE_DISCONNECTED" && request.settled == 1 && sdk.closed && sdk.offMainCalls == 0)
    }
  }
  test("late ownership and acknowledgement callbacks cannot publish after destroy") {
    val f = Fixture(); val request = f.call("restore"); val sdk = f.sdk
    sdk.owned(listOf(Purchase())); val completion = f.complete(request); check(sdk.acknowledgeCalls == 1)
    f.module.events.clear(); f.close(); sdk.ack()
    check(request.owned() == true && completion.errors.single() == "E_STORE_DISCONNECTED" && completion.settled == 1 && f.module.events.isEmpty())
  }
  test("late purchase updates never recreate a destroyed client") {
    val f = Fixture(); f.call("product"); val sdk = f.sdk; f.close(); val clients = BillingClient.clients.size
    sdk.update(); check(BillingClient.clients.size == clients && f.module.events.isEmpty())
  }
  test("SDK callbacks and teardown are marshalled to main") {
    val f = Fixture(false); val request = f.call("restore"); f.sdk.connected(); f.sdk.owned(listOf(Purchase())); val completion = f.complete(request); f.sdk.ack()
    check(request.owned() == true && completion.settled == 1 && f.sdk.offMainCalls == 0); f.close(); check(f.sdk.offMainCalls == 0)
  }
  test("lookup timeout closes a stuck connection and Retry gets a fresh client") {
    val f = Fixture(false); val first = f.call("product"); val old = f.sdk; Looper.main.advance(31_000)
    check(first.settled == 1 && old.closed); val second = f.call("product"); val next = f.sdk
    check(next !== old); old.connected(); check(second.settled == 0 && next.productCalls == 0)
    next.connected(); next.product(); check(second.settled == 1); f.close()
  }
  test("system checkout does not time out into another purchase after thirty seconds") {
    val f = Fixture(); val first = f.call("purchase"); f.productLookup(); if(f.sdk.purchases.isNotEmpty()) f.sdk.owned()
    check(f.sdk.launches == 1); Looper.main.advance(31_000); val next = f.call("purchase")
    check(first.settled == 0 && next.errors.single() == "E_PURCHASE_IN_PROGRESS")
    f.sdk.update(code = 1); check(first.outcome() == "cancelled"); f.close()
  }
  test("synchronous checkout cancellation callback settles once") {
    val f = Fixture(); val first = f.call("purchase"); f.sdk.onLaunch = { f.sdk.update(code = 1) }
    f.productLookup(); if(f.sdk.purchases.isNotEmpty()) f.sdk.owned()
    check(first.settled == 1 && first.outcome() == "cancelled"); f.close()
  }
  test("pending updates grant no ownership and a later verified query can restore") {
    val f = Fixture(); val request = f.call("purchase"); f.productLookup(); if(f.sdk.purchases.isNotEmpty()) f.sdk.owned()
    f.sdk.update(mutableListOf(Purchase(purchaseState = 2)))
    check(request.outcome() == "pending" && request.owned() == false && f.sdk.acknowledgeCalls == 0)
    val restored = f.call("restore"); f.sdk.owned(listOf(Purchase())); val completion = f.complete(restored); f.sdk.ack(); check(restored.owned() == true && completion.settled == 1); f.close()
  }
  test("already-owned SDK response requires a current owned record") {
    val f = Fixture(); val request = f.call("purchase"); f.sdk.launchResult = com.android.billingclient.api.BillingResult(7)
    f.productLookup(); if(f.sdk.launches == 0 && f.sdk.purchases.isNotEmpty()) f.sdk.owned()
    check(f.sdk.purchases.isNotEmpty()); f.sdk.owned(); check(request.errors.single() == "E_ENTITLEMENT_UNCONFIRMED"); f.close()
  }
  test("bad SDK ownership response preserves unknown rather than claiming not owned") {
    val f = Fixture(); val request = f.call("currentEntitlement"); f.sdk.owned(code = 2)
    check(request.values.isEmpty() && request.errors.single() == "E_ENTITLEMENT_QUERY"); f.close()
  }
  test("a main preparation lease blocks commerce before the armed flag exists") {
    val f = Fixture(); val epoch = NativeRemoteCoordinator.captureIdleEpoch()!!; val lease = NativeRemoteCoordinator.beginPreparation()
    val before = BillingClient.clients.size; val request = f.call("purchase")
    check(request.errors.single() == "E_STORE_SHOW_ACTIVE" && before == BillingClient.clients.size)
    check(!NativeRemoteCoordinator.isCurrentIdleEpoch(epoch)); NativeRemoteCoordinator.endPreparation(lease)
    check(!NativeRemoteCoordinator.isCurrentIdleEpoch(epoch) && NativeRemoteCoordinator.captureIdleEpoch() != null); f.close()
  }
  test("failed preparation roundtrip invalidates old store metadata") {
    val f = Fixture(); val request = f.call("purchase"); val lease = NativeRemoteCoordinator.beginPreparation(); NativeRemoteCoordinator.endPreparation(lease)
    f.productLookup(); check(f.sdk.launches == 0 && request.errors.single() == "E_STORE_SHOW_CHANGED"); f.close()
  }
  test("diagnostic setup invalidates pending checkout and later idle does not revive it") {
    val f = Fixture(); val request = f.call("purchase"); NativeRemoteCoordinator.beginDiagnostics(); NativeRemoteCoordinator.endDiagnostics()
    f.productLookup(); check(f.sdk.launches == 0 && request.errors.single() == "E_STORE_SHOW_CHANGED"); f.close()
  }
  test("admitted system purchase can settle after show preparation without publishing an event") {
    val f = Fixture(); val request = f.call("purchase"); f.productLookup(); if(f.sdk.purchases.isNotEmpty()) f.sdk.owned()
    NativeRemoteCoordinator.setArmed(true); f.sdk.update()
    check(request.owned() == true && f.module.events.isEmpty() && f.sdk.acknowledgeCalls == 0)
    check(f.complete(request).errors.single() == "E_STORE_SHOW_ACTIVE")
    NativeRemoteCoordinator.setArmed(false); val completion = f.complete(request); f.sdk.ack(); check(completion.settled == 1); f.close()
  }
  test("metadata requests are bounded and all released at teardown") {
    val f = Fixture(false); val requests = (1..33).map { f.call("product") }
    check(requests.last().errors.single() == "E_STORE_BUSY" && f.sdk.connections.size == 1)
    f.close(); check(requests.all { it.settled == 1 })
  }
  test("lost activity is rechecked after lookup") {
    for (kind in listOf("missing", "finishing", "destroyed")) {
      val f = Fixture(); val request = f.call("purchase")
      when(kind){"missing" -> f.module.appContext.currentActivity = null; "finishing" -> f.module.appContext.currentActivity!!.isFinishing = true; else -> f.module.appContext.currentActivity!!.isDestroyed = true}
      f.productLookup(); if(f.sdk.purchases.isNotEmpty()) f.sdk.owned()
      check(f.sdk.launches == 0 && request.errors.single() == "E_ACTIVITY_UNAVAILABLE"); f.close()
    }
  }
  test("duplicate purchase update during acknowledgement does not settle twice") {
    val f = Fixture(); val request = f.call("purchase"); f.productLookup(); if(f.sdk.purchases.isNotEmpty()) f.sdk.owned()
    f.sdk.update(); val confirmation = f.complete(request); f.sdk.update(); check(f.sdk.acknowledgeCalls == 1)
    f.sdk.ack(); check(request.settled == 1 && confirmation.settled == 1); f.close()
  }
  test("purchased ownership is returned before SDK acknowledgement") {
    val f = Fixture(); val request = f.call("purchase"); f.productLookup(); f.sdk.update()
    check(request.owned() == true && (request.values.single() as Map<*, *>)["deliveryId"] is String && f.sdk.acknowledgeCalls == 0)
    val confirmation = f.complete(request); check(confirmation.settled == 0 && f.sdk.acknowledgeCalls == 1)
    f.sdk.ack(); check(confirmation.settled == 1); f.close()
  }
  test("unknown delivery handles cannot acknowledge a purchase or create a client") {
    val f = Fixture(); val before = BillingClient.clients.size; val completion = f.complete("not-a-delivery")
    check(completion.errors.single() == "E_DELIVERY_UNAVAILABLE" && before == BillingClient.clients.size); f.close()
  }
  test("two confirmation callers cannot acknowledge the same delivery concurrently") {
    val f = Fixture(); val request = f.call("restore"); f.sdk.owned(listOf(Purchase()))
    val first = f.complete(request); val second = f.complete(request)
    check(first.settled == 0 && second.errors.single() == "E_DELIVERY_IN_PROGRESS" && f.sdk.acknowledgeCalls == 1)
    f.sdk.ack(); check(first.settled == 1); f.close()
  }
  test("failed store confirmation remains recoverable through the same delivery") {
    val f = Fixture(); val request = f.call("restore"); f.sdk.owned(listOf(Purchase()))
    val first = f.complete(request); f.sdk.ack(2); check(first.errors.single() == "E_ACKNOWLEDGE_PURCHASE")
    val retry = f.complete(request); f.sdk.ack(); check(retry.settled == 1 && retry.errors.isEmpty()); f.close()
  }
  test("late acknowledgement cannot complete a new Retry after a timeout") {
    val f = Fixture(); val request = f.call("restore"); f.sdk.owned(listOf(Purchase()))
    val first = f.complete(request); Looper.main.advance(31_000); check(first.errors.single() == "E_STORE_TIMEOUT")
    val next = f.complete(request); f.sdk.ack(); check(next.settled == 0)
    f.sdk.ack(); check(next.settled == 1 && first.settled == 1); f.close()
  }
  test("unfinished ownership can be recovered by a new native owner") {
    val first = Fixture(); val before = first.call("restore"); first.sdk.owned(listOf(Purchase())); first.close()
    val next = Fixture(); val restored = next.call("restore"); next.sdk.owned(listOf(Purchase()))
    check(restored.owned() == true && next.sdk.acknowledgeCalls == 0)
    check((before.values.single() as Map<*, *>)["deliveryId"] != (restored.values.single() as Map<*, *>)["deliveryId"])
    val completed = next.complete(restored); next.sdk.ack(); check(completed.settled == 1); next.close()
  }
  test("a stale unacknowledged snapshot cannot reopen an already confirmed delivery") {
    val f = Fixture(); val first = f.call("restore"); f.sdk.owned(listOf(Purchase()))
    val done = f.complete(first); f.sdk.ack(); check(done.settled == 1)
    val stale = f.call("currentEntitlement"); f.sdk.owned(listOf(Purchase()))
    check(stale.owned() == true && (stale.values.single() as Map<*, *>)["deliveryId"] == null && f.sdk.acknowledgeCalls == 1); f.close()
  }
  check(failures.isEmpty()) { "${failures.size}/$count actual-module regressions failed: ${failures.joinToString()}" }
  println("Passed $count actual-module store lifecycle cases; synthetic SDK only")
}
