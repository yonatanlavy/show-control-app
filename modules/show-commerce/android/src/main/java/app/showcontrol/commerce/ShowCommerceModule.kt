package app.showcontrol.commerce

import android.os.Handler
import android.os.Looper
import app.showcontrol.audio.NativeRemoteCoordinator
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

private const val REMOVE_PROMOTIONS = "remove_promotions"
private const val LOOKUP_TIMEOUT_MS = 30_000L
private const val MAX_REQUESTS = 32
private class StoreFailure(val code: String, message: String) : Exception(message)

/** Optional work; lookup cannot hold an audio preparation lease. */
class ShowCommerceModule : Module(), PurchasesUpdatedListener {
  private val main = Handler(Looper.getMainLooper())
  private val requestLock = Any()
  @Volatile private var destroyed = false
  private var nextRequest = 0L
  private val requests = mutableMapOf<Long, Request>()
  private var interactiveRequest: Request? = null
  private var pendingPurchase: Request? = null
  private var reconcilingUpdate = false
  private var billingClient: BillingClient? = null
  private var clientGeneration = 0L
  private var connecting = false
  private var connectionGeneration = 0L
  private data class Waiting(val request: Request, val ready: () -> Unit, val error: (BillingResult) -> Unit)
  private val waiting = mutableListOf<Waiting>()
  private val deliveries = LinkedHashMap<String, Purchase>()
  private val completingDeliveries = mutableMapOf<String, Request>()
  private val confirmedDeliveryTokens = LinkedHashSet<String>()

  private inner class Request(val id: Long, val delegate: Promise, val idleEpoch: Long) : Promise {
    var clientEpoch: Long? = null
    var handedOff = false
    var awaitingSystemResult = false
    var timeout: Runnable? = null
    fun armTimeout() {
      cancelTimeout()
      timeout = Runnable { reject("E_STORE_TIMEOUT", "The store request timed out. Retry when the storefront is available.", null) }
        .also { main.postDelayed(it, LOOKUP_TIMEOUT_MS) }
    }
    fun cancelTimeout() { timeout?.let(main::removeCallbacks); timeout = null }
    override fun resolve(value: Any?) = finish(this) { delegate.resolve(value) }
    override fun reject(code: String?, message: String?, cause: Throwable?) = finish(this) { delegate.reject(code, message, cause) }
  }

  override fun definition() = ModuleDefinition {
    Name("ShowCommerce")
    Events("onEntitlementChanged")
    AsyncFunction("product") { promise: Promise -> admit(promise) { request ->
      queryProductDetails(request, { request.resolve(productSnapshot(it)) }, { code, message -> request.reject(code, message, null) })
    } }.runOnQueue(Queues.MAIN)
    AsyncFunction("currentEntitlement") { promise: Promise -> admit(promise) { queryEntitlement(it, false) } }.runOnQueue(Queues.MAIN)
    AsyncFunction("purchase") { promise: Promise -> admit(promise, interactive = true, purchase = true, work = ::beginPurchase) }.runOnQueue(Queues.MAIN)
    AsyncFunction("restore") { promise: Promise -> admit(promise, interactive = true) { queryEntitlement(it, true) } }.runOnQueue(Queues.MAIN)
    AsyncFunction("completeDelivery") { deliveryId: String, promise: Promise -> admit(promise) { request ->
      val purchase = deliveries[deliveryId] ?: throw StoreFailure("E_DELIVERY_UNAVAILABLE", "Restore purchase to recover the current store delivery.")
      if (completingDeliveries.containsKey(deliveryId)) throw StoreFailure("E_DELIVERY_IN_PROGRESS", "Store confirmation is already in progress.")
      completingDeliveries[deliveryId] = request
      withConnected(request, onReady = {
        val admitted = NativeRemoteCoordinator.whileIdleEpoch(request.idleEpoch) {
          request.handedOff = true
          acknowledgeIfNeeded(purchase, request, {
            if (confirmedDeliveryTokens.size >= MAX_REQUESTS) confirmedDeliveryTokens.remove(confirmedDeliveryTokens.first())
            confirmedDeliveryTokens.add(purchase.purchaseToken)
            deliveries.remove(deliveryId)
            request.resolve(null)
          }, { request.reject("E_ACKNOWLEDGE_PURCHASE", it, null) })
          true
        } == true
        if (!admitted) request.reject("E_STORE_SHOW_CHANGED", "Store confirmation is deferred until after the show.", null)
      }, onError = { request.reject("E_STORE_CONNECTION", storeMessage("Store confirmation is unavailable", it), null) })
    } }.runOnQueue(Queues.MAIN)
    OnDestroy {
      val abandoned = synchronized(requestLock) {
        destroyed = true
        requests.values.toList().also { requests.clear(); interactiveRequest = null; pendingPurchase = null }
      }
      abandoned.forEach { request ->
        request.cancelTimeout()
        runCatching { request.delegate.reject("E_STORE_DISCONNECTED", "The store module stopped. Completed purchases remain recoverable through Restore purchase.", null) }
      }
      onMain {
        deliveries.clear(); completingDeliveries.clear(); confirmedDeliveryTokens.clear()
        waiting.clear(); connecting = false; connectionGeneration += 1; clientGeneration += 1
        val previous = billingClient; billingClient = null
        runCatching { previous?.endConnection() }
      }
    }
  }

  private fun onMain(work: () -> Unit) { if (Looper.myLooper() == Looper.getMainLooper()) work() else main.post { work() } }
  private fun alive(request: Request): Boolean = synchronized(requestLock) { !destroyed && requests[request.id] === request }
  private fun admit(promise: Promise, interactive: Boolean = false, purchase: Boolean = false, work: (Request) -> Unit) {
    val epoch = NativeRemoteCoordinator.captureIdleEpoch()
    val request = synchronized(requestLock) {
      val code = when {
        destroyed -> "E_STORE_DISCONNECTED"
        epoch == null -> "E_STORE_SHOW_ACTIVE"
        requests.size >= MAX_REQUESTS -> "E_STORE_BUSY"
        interactive && interactiveRequest != null -> "E_PURCHASE_IN_PROGRESS"
        else -> null
      }
      if (code != null) { promise.reject(code, "Store access is unavailable. Leave the prepared show or finish the current store request first.", null); return }
      Request(++nextRequest, promise, requireNotNull(epoch)).also {
        requests[it.id] = it
        if (interactive) interactiveRequest = it
        if (purchase) pendingPurchase = it
      }
    }
    request.armTimeout()
    continueRequest(request) { work(request) }
  }
  private fun finish(request: Request, reply: () -> Unit) {
    synchronized(requestLock) {
      if (destroyed || requests[request.id] !== request) return
      requests.remove(request.id)
      if (interactiveRequest === request) interactiveRequest = null
      if (pendingPurchase === request) pendingPurchase = null
      completingDeliveries.entries.removeAll { it.value === request }
      request.cancelTimeout()
      waiting.removeAll { it.request === request }
      runCatching(reply)
    }
    if (connecting && waiting.isEmpty() && pendingPurchase?.handedOff != true) {
      connecting = false; connectionGeneration += 1; clientGeneration += 1
      val previous = billingClient; billingClient = null
      runCatching { previous?.endConnection() }
    }
  }
  private fun continueRequest(request: Request, work: () -> Unit) = onMain {
    if (!alive(request)) return@onMain
    if (!request.handedOff && !NativeRemoteCoordinator.isCurrentIdleEpoch(request.idleEpoch)) {
      request.reject("E_STORE_SHOW_CHANGED", "Show preparation changed while the store request was pending. Retry after leaving the show.", null)
      return@onMain
    }
    if (request.clientEpoch != null && request.clientEpoch != clientGeneration) {
      request.reject("E_STORE_CONNECTION_CHANGED", "The store connection changed. Retry the request.", null)
      return@onMain
    }
    try { work() }
    catch (error: StoreFailure) { request.reject(error.code, error.message, null) }
    catch (error: Exception) { request.reject("E_STORE_REQUEST", "The store request could not finish. Retry or restore purchases.", error) }
  }
  private fun emitSnapshot(snapshot: Map<String, Any>) = synchronized(requestLock) {
    if (!destroyed && NativeRemoteCoordinator.captureIdleEpoch() != null) runCatching { sendEvent("onEntitlementChanged", snapshot) }
    Unit
  }

  private fun client(): BillingClient {
    check(!destroyed)
    billingClient?.let { return it }
    val context = appContext.reactContext?.applicationContext ?: throw StoreFailure("E_STORE_CONTEXT", "The app context is unavailable.")
    val next = BillingClient.newBuilder(context).setListener(this)
      .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
      .enableAutoServiceReconnection().build()
    clientGeneration += 1; billingClient = next
    return next
  }
  private fun withConnected(request: Request, onReady: () -> Unit, onError: (BillingResult) -> Unit) {
    val current = client()
    request.clientEpoch = clientGeneration
    if (current.isReady) { onReady(); return }
    waiting += Waiting(request, onReady, onError)
    if (connecting) return
    connecting = true
    val generation = ++connectionGeneration
    current.startConnection(object : BillingClientStateListener {
      override fun onBillingSetupFinished(result: BillingResult) = onMain {
        if (destroyed || billingClient !== current || generation != connectionGeneration) return@onMain
        connecting = false
        val callbacks = waiting.toList(); waiting.clear()
        callbacks.forEach { item -> continueRequest(item.request) {
          if (result.responseCode == BillingClient.BillingResponseCode.OK) item.ready() else item.error(result)
        } }
      }
      override fun onBillingServiceDisconnected() = onMain {
        if (destroyed || billingClient !== current || generation != connectionGeneration) return@onMain
        connecting = false; connectionGeneration += 1
        val callbacks = waiting.toList(); waiting.clear()
        callbacks.forEach { it.request.reject("E_STORE_CONNECTION", "The store disconnected. Retry when available.", null) }
      }
    })
  }
  private fun queryProductDetails(request: Request, onSuccess: (ProductDetails) -> Unit, onError: (String, String) -> Unit) {
    withConnected(request, onReady = {
      val params = QueryProductDetailsParams.newBuilder().setProductList(listOf(
        QueryProductDetailsParams.Product.newBuilder().setProductId(REMOVE_PROMOTIONS).setProductType(BillingClient.ProductType.INAPP).build(),
      )).build()
      client().queryProductDetailsAsync(params) { result, queryResult -> continueRequest(request) {
        if (result.responseCode != BillingClient.BillingResponseCode.OK) onError("E_STORE_QUERY", storeMessage("Product query failed", result))
        else {
          val details = queryResult.productDetailsList.firstOrNull { it.productId == REMOVE_PROMOTIONS }
          if (details == null) onError("E_PRODUCT_NOT_CONFIGURED", "The remove_promotions product is unavailable in this storefront.")
          else onSuccess(details)
        }
      } }
    }, onError = { onError("E_STORE_CONNECTION", storeMessage("Google Play Billing is unavailable", it)) })
  }
  private fun eligibleOffer(details: ProductDetails) = (details.oneTimePurchaseOfferDetailsList?.firstOrNull()
      ?: throw StoreFailure("E_NO_ELIGIBLE_OFFER", "The storefront returned no eligible one-time purchase offer.")
    ).also { if (it.formattedPrice.isBlank()) throw StoreFailure("E_NO_ELIGIBLE_OFFER", "The storefront returned no localized price.") }
  private fun productSnapshot(details: ProductDetails): Map<String, Any> {
    val offer = eligibleOffer(details)
    return mapOf("productId" to REMOVE_PROMOTIONS, "title" to details.name, "description" to details.description,
      "displayPrice" to offer.formattedPrice, "currencyCode" to offer.priceCurrencyCode, "source" to "play_store")
  }
  private fun beginPurchase(request: Request) {
    requireVisibleActivity()
    queryProductDetails(request, onSuccess = { details ->
      eligibleOffer(details)
      readEntitlement(request) { current ->
        when (current["status"]) {
          "owned" -> { request.resolve(purchaseSnapshot(current, "already_owned")); emitSnapshot(current) }
          "pending" -> { request.resolve(purchaseSnapshot(current, "pending")); emitSnapshot(current) }
          else -> launchPurchase(request, details)
        }
      }
    }, onError = { code, message -> request.reject(code, message, null) })
  }
  private fun launchPurchase(request: Request, details: ProductDetails) {
      val offer = eligibleOffer(details)
      val params = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details)
      offer.offerToken?.let(params::setOfferToken)
      val activity = requireVisibleActivity()
      val result = NativeRemoteCoordinator.whileIdleEpoch(request.idleEpoch) {
        request.handedOff = true; request.awaitingSystemResult = true; request.cancelTimeout()
        client().launchBillingFlow(activity, BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(params.build())).build())
      } ?: throw StoreFailure("E_STORE_SHOW_CHANGED", "The prepared show owns the app. Checkout was not opened.")
      if (!alive(request)) return
      when (result.responseCode) {
        BillingClient.BillingResponseCode.OK -> Unit
        BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> { request.awaitingSystemResult = false; request.armTimeout(); queryEntitlement(request, true, "already_owned") }
        BillingClient.BillingResponseCode.USER_CANCELED -> request.resolve(purchaseSnapshot(notOwnedSnapshot("The checkout was cancelled."), "cancelled"))
        else -> request.reject("E_PURCHASE_LAUNCH", storeMessage("Checkout could not open", result), null)
      }
  }
  private fun requireVisibleActivity() = appContext.currentActivity?.takeIf { !it.isFinishing && !it.isDestroyed && it.hasWindowFocus() }
    ?: throw StoreFailure("E_ACTIVITY_UNAVAILABLE", "A visible app screen is required to open checkout.")

  override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
    val copied = purchases?.toList()
    onMain {
      if (destroyed) return@onMain
      val request = pendingPurchase
      if (request?.awaitingSystemResult == true) continueRequest(request) {
        request.awaitingSystemResult = false; request.armTimeout()
        when (result.responseCode) {
          BillingClient.BillingResponseCode.USER_CANCELED -> request.resolve(purchaseSnapshot(notOwnedSnapshot("The checkout was cancelled."), "cancelled"))
          BillingClient.BillingResponseCode.OK -> copied?.firstOrNull { it.products.contains(REMOVE_PROMOTIONS) }?.let { processPurchase(it, request) }
            ?: request.reject("E_PURCHASE_MISSING", "The storefront returned no matching purchase.", null)
          else -> request.reject("E_PURCHASE", storeMessage("Purchase failed", result), null)
        }
      } else if (request == null && !reconcilingUpdate && result.responseCode == BillingClient.BillingResponseCode.OK && copied?.any { it.products.contains(REMOVE_PROMOTIONS) } == true && NativeRemoteCoordinator.captureIdleEpoch() != null) {
        reconcilingUpdate = true
        val receipt = object : Promise {
          override fun resolve(value: Any?) { reconcilingUpdate = false }
          override fun reject(code: String?, message: String?, cause: Throwable?) { reconcilingUpdate = false }
        }
        admit(receipt) { queryEntitlement(it, true) }
      }
    }
  }
  private fun processPurchase(purchase: Purchase, request: Request) {
    when (purchase.purchaseState) {
      Purchase.PurchaseState.PENDING -> { val snapshot = pendingSnapshot(); request.resolve(purchaseSnapshot(snapshot, "pending")); emitSnapshot(snapshot) }
      Purchase.PurchaseState.PURCHASED -> {
        val snapshot = deliverySnapshot(purchase); request.resolve(purchaseSnapshot(snapshot, "purchased")); emitSnapshot(snapshot)
      }
      else -> request.reject("E_PURCHASE_STATE", "The store returned an unspecified purchase state.", null)
    }
  }
  private fun queryEntitlement(request: Request, emit: Boolean, purchaseOutcome: String? = null) {
    readEntitlement(request) { snapshot ->
      if (purchaseOutcome != null && snapshot["owned"] != true) {
        request.reject("E_ENTITLEMENT_UNCONFIRMED", "The storefront reported ownership but its current record could not confirm it. Restore purchases to retry.", null)
      } else {
        request.resolve(if (purchaseOutcome == null) snapshot else purchaseSnapshot(snapshot, purchaseOutcome))
        if (emit) emitSnapshot(snapshot)
      }
    }
  }
  private fun readEntitlement(request: Request, complete: (Map<String, Any>) -> Unit) {
    withConnected(request, onReady = {
      val params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build()
      client().queryPurchasesAsync(params) { result, purchases ->
        val copied = purchases.toList()
        continueRequest(request) {
          if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            request.reject("E_ENTITLEMENT_QUERY", storeMessage("Entitlement query failed", result), null); return@continueRequest
          }
          val purchase = copied.filter { it.products.contains(REMOVE_PROMOTIONS) }.sortedWith(
            compareByDescending<Purchase> { when (it.purchaseState) {
              Purchase.PurchaseState.PURCHASED -> 2
              Purchase.PurchaseState.PENDING -> 1
              else -> 0
            } }.thenByDescending { it.isAcknowledged },
          ).firstOrNull()
          when (purchase?.purchaseState) {
            Purchase.PurchaseState.PURCHASED -> complete(deliverySnapshot(purchase))
            Purchase.PurchaseState.PENDING -> complete(pendingSnapshot())
            null -> complete(notOwnedSnapshot("No current purchase was found."))
            else -> request.reject("E_PURCHASE_STATE", "The storefront returned an unsupported ownership state. Restore purchases to retry.", null)
          }
        }
      }
    }, onError = { request.reject("E_STORE_CONNECTION", storeMessage("The storefront is unavailable", it), null) })
  }
  private fun acknowledgeIfNeeded(purchase: Purchase, request: Request, onSuccess: () -> Unit, onError: (String) -> Unit) {
    if (purchase.isAcknowledged) { onSuccess(); return }
    val params = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchase.purchaseToken).build()
    client().acknowledgePurchase(params) { result -> continueRequest(request) {
      if (result.responseCode == BillingClient.BillingResponseCode.OK) onSuccess()
      else onError(storeMessage("The store did not acknowledge the purchase", result))
    } }
  }
  /** Grant first; the JS owner acknowledges only after its SQLite ownership write succeeds. */
  private fun deliverySnapshot(purchase: Purchase): Map<String, Any> {
    if (purchase.isAcknowledged || confirmedDeliveryTokens.contains(purchase.purchaseToken)) return ownedSnapshot()
    val existing = deliveries.entries.firstOrNull { it.value.purchaseToken == purchase.purchaseToken }?.key
    val id = existing ?: UUID.randomUUID().toString().also { next ->
      if (deliveries.size >= MAX_REQUESTS) {
        val expendable = deliveries.keys.firstOrNull { !completingDeliveries.containsKey(it) }
          ?: throw StoreFailure("E_STORE_BUSY", "Store confirmations are busy. Restore purchases to retry.")
        deliveries.remove(expendable)
      }
      deliveries[next] = purchase
    }
    return ownedSnapshot() + ("deliveryId" to id)
  }
  private fun baseSnapshot(owned: Boolean, status: String, verification: String, detail: String): Map<String, Any> = mapOf(
    "productId" to REMOVE_PROMOTIONS, "owned" to owned, "status" to status, "verification" to verification, "source" to "play_store", "detail" to detail)
  private fun ownedSnapshot() = baseSnapshot(true, "owned", "play_store_reported", "Google Play reports a purchased non-consumable.")
  private fun pendingSnapshot() = baseSnapshot(false, "pending", "not_applicable", "The purchase is pending approval or payment.")
  private fun notOwnedSnapshot(detail: String) = baseSnapshot(false, "not_owned", "not_applicable", detail)
  private fun purchaseSnapshot(snapshot: Map<String, Any>, outcome: String): Map<String, Any> = snapshot + ("outcome" to outcome)
  private fun storeMessage(prefix: String, result: BillingResult) = "$prefix (store response ${result.responseCode}). Check connectivity, store installation, account eligibility and product configuration."
}
