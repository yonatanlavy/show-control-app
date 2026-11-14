package com.android.billingclient.api
import android.app.Activity
import android.content.Context
import android.os.Looper

class BillingResult(val responseCode: Int, val debugMessage: String = "synthetic")
interface BillingClientStateListener { fun onBillingSetupFinished(result: BillingResult); fun onBillingServiceDisconnected() }
interface PurchasesUpdatedListener { fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) }
class ProductDetails(val productId: String = "remove_promotions", val oneTimePurchaseOfferDetailsList: List<Offer>? = listOf(Offer())) {
  val name = "Synthetic product"; val description = "Synthetic description"
  class Offer(val formattedPrice: String = "test-price", val priceCurrencyCode: String = "test-currency", val offerToken: String? = null)
}
class Purchase(val products: List<String> = listOf("remove_promotions"), val purchaseState: Int = PurchaseState.PURCHASED, val isAcknowledged: Boolean = false) {
  val purchaseToken = "synthetic-only"
  object PurchaseState { const val UNSPECIFIED_STATE = 0; const val PURCHASED = 1; const val PENDING = 2 }
}
class ProductResult(val productDetailsList: List<ProductDetails>, val unfetchedProductList: List<Unfetched> = emptyList()) { class Unfetched(val statusCode: Int) }
class BillingClient private constructor(val listener: PurchasesUpdatedListener) {
  var isReady = readyOnBuild
  var closed = false
  var launches = 0
  var productCalls = 0
  var purchaseCalls = 0
  var acknowledgeCalls = 0
  var offMainCalls = 0
  var launchResult = BillingResult(BillingResponseCode.OK)
  var onLaunch: (() -> Unit)? = null
  val connections = mutableListOf<BillingClientStateListener>()
  val products = ArrayDeque<(BillingResult, ProductResult) -> Unit>()
  val purchases = ArrayDeque<(BillingResult, List<Purchase>) -> Unit>()
  val acknowledgements = ArrayDeque<(BillingResult) -> Unit>()
  private fun called() { check(!closed); if (Looper.myLooper() != Looper.main) offMainCalls++ }
  fun startConnection(callback: BillingClientStateListener) { called(); connections += callback }
  fun endConnection() { if (Looper.myLooper() != Looper.main) offMainCalls++; closed = true }
  fun queryProductDetailsAsync(params: QueryProductDetailsParams, done: (BillingResult, ProductResult) -> Unit) { called(); productCalls++; products.addLast(done) }
  fun queryPurchasesAsync(params: QueryPurchasesParams, done: (BillingResult, List<Purchase>) -> Unit) { called(); purchaseCalls++; purchases.addLast(done) }
  fun acknowledgePurchase(params: AcknowledgePurchaseParams, done: (BillingResult) -> Unit) { called(); acknowledgeCalls++; acknowledgements.addLast(done) }
  fun launchBillingFlow(activity: Activity, params: BillingFlowParams): BillingResult { called(); launches++; onLaunch?.invoke(); return launchResult }
  fun product(value: ProductDetails = ProductDetails(), code: Int = 0) { products.removeFirst()(BillingResult(code), ProductResult(listOf(value))); Looper.main.drain() }
  fun owned(values: List<Purchase> = emptyList(), code: Int = 0) { purchases.removeFirst()(BillingResult(code), values); Looper.main.drain() }
  fun connected(index: Int = connections.lastIndex, code: Int = 0) { if (code == 0) isReady = true; connections[index].onBillingSetupFinished(BillingResult(code)); Looper.main.drain() }
  fun update(values: MutableList<Purchase>? = mutableListOf(Purchase()), code: Int = 0) { listener.onPurchasesUpdated(BillingResult(code), values); Looper.main.drain() }
  fun ack(code: Int = 0) { acknowledgements.removeFirst()(BillingResult(code)); Looper.main.drain() }
  class Builder { private lateinit var listener: PurchasesUpdatedListener
    fun setListener(value: PurchasesUpdatedListener) = apply { listener = value }
    fun enablePendingPurchases(value: PendingPurchasesParams) = this
    fun enableAutoServiceReconnection() = this
    fun build() = BillingClient(listener).also { clients += it }
  }
  object BillingResponseCode { const val OK = 0; const val USER_CANCELED = 1; const val SERVICE_UNAVAILABLE = 2; const val SERVICE_DISCONNECTED = -1; const val ITEM_ALREADY_OWNED = 7 }
  object ProductType { const val INAPP = "inapp" }
  companion object { var readyOnBuild = true; val clients = mutableListOf<BillingClient>(); fun newBuilder(context: Context) = Builder() }
}
class PendingPurchasesParams { class Builder { fun enableOneTimeProducts() = this; fun build() = PendingPurchasesParams() }; companion object { fun newBuilder() = Builder() } }
class QueryPurchasesParams { class Builder { fun setProductType(type: String) = this; fun build() = QueryPurchasesParams() }; companion object { fun newBuilder() = Builder() } }
class QueryProductDetailsParams {
  class Product { class Builder { fun setProductId(id: String) = this; fun setProductType(type: String) = this; fun build() = Product() }; companion object { fun newBuilder() = Builder() } }
  class Builder { fun setProductList(products: List<Product>) = this; fun build() = QueryProductDetailsParams() }; companion object { fun newBuilder() = Builder() }
}
class AcknowledgePurchaseParams { class Builder { fun setPurchaseToken(token: String) = this; fun build() = AcknowledgePurchaseParams() }; companion object { fun newBuilder() = Builder() } }
class BillingFlowParams {
  class ProductDetailsParams { class Builder { fun setProductDetails(details: ProductDetails) = this; fun setOfferToken(token: String) = this; fun build() = ProductDetailsParams() }; companion object { fun newBuilder() = Builder() } }
  class Builder { fun setProductDetailsParamsList(values: List<ProductDetailsParams>) = this; fun build() = BillingFlowParams() }; companion object { fun newBuilder() = Builder() }
}
