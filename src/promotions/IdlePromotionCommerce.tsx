import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { AppState } from 'react-native'
import ShowCommerce, {
  type CommerceEntitlement,
  type CommerceProduct,
  type CommercePurchaseResult,
} from '../../modules/show-commerce'
import { useI18n, type MessageKey } from '../i18n'
import { AppText, Badge, Button, Surface, uiStyles } from '../ui/primitives'
import type { PromoSurface } from './contracts'
import { EntitlementGatedPromotionSlot } from './CachedPromotionSlot'
import { isCriticalSessionActive } from '../runtime/critical-session-gate'
import { useCriticalSessionActive } from '../ui/use-critical-session-active'
import {
  cachePromotionEntitlement,
  getCachedPromotionEntitlement,
  hydratePromotionEntitlementCache,
  useCachedPromotionEntitlement,
} from './entitlementCache'

type IdlePromoSurface = Extract<PromoSurface, 'library' | 'builder' | 'controller' | 'settings'>
type Operation = 'idle' | 'purchase' | 'restore'
interface CommerceGateway {
  product(): Promise<CommerceProduct>
  currentEntitlement(): Promise<CommerceEntitlement>
  purchase(): Promise<CommercePurchaseResult>
  restore(): Promise<CommerceEntitlement>
  completeDelivery?(deliveryId: string): Promise<void>
  addEntitlementListener?(listener: (event: CommerceEntitlement) => void): { remove(): void }
}

let refreshInFlight: Promise<CommerceEntitlement> | null = null
let refreshObservers: Set<() => boolean> | null = null
let commerceGateway: CommerceGateway = ShowCommerce
let interactiveOwner: symbol | null = null
let observationVersion = 0

export function setIdleCommerceGatewayForTests(gateway: CommerceGateway) {
  commerceGateway = gateway
  refreshInFlight = null
  refreshObservers = null
  interactiveOwner = null
  observationVersion += 1
}

async function remember(entitlement: CommerceEntitlement, stillCurrent: () => boolean = () => true) {
  const saved = await cachePromotionEntitlement({ owned: entitlement.owned, status: entitlement.status })
  if (saved === 'saved' && entitlement.owned && entitlement.deliveryId) {
    if (!stillCurrent() || !getCachedPromotionEntitlement().owned || isCriticalSessionActive() || !commerceGateway.completeDelivery) return 'confirmation-pending' as const
    try { await commerceGateway.completeDelivery(entitlement.deliveryId) }
    catch { return 'confirmation-pending' as const }
  }
  return saved
}

/** Storefront refresh is intentionally reachable only from idle-route components. */
export async function refreshIdleEntitlement(stillEligible: () => boolean = () => true) {
  if (isCriticalSessionActive()) throw new Error('Storefront access is disabled during a critical show session')
  await hydratePromotionEntitlementCache()
  if (isCriticalSessionActive() || !stillEligible()) throw new Error('Storefront access is disabled outside its active idle surface')
  if (interactiveOwner) throw new Error('An interactive store request is already in progress')
  if (!refreshInFlight) {
    const version = observationVersion
    const observers = new Set([stillEligible])
    refreshObservers = observers
    const canCommit = () => version === observationVersion && !isCriticalSessionActive() && [...observers].some((eligible) => eligible())
    const read = async () => commerceGateway.currentEntitlement()
    const pending = read().then(async (entitlement) => {
      if (canCommit()) await remember(entitlement, canCommit)
      return entitlement
    }).finally(() => { if (refreshInFlight === pending) { refreshInFlight = null; refreshObservers = null } })
    refreshInFlight = pending
  } else if (refreshObservers) {
    if (refreshObservers.size >= 64) refreshObservers.delete(refreshObservers.values().next().value!)
    refreshObservers.add(stillEligible)
  }
  return refreshInFlight
}

/** Optional store work never holds a lease on free show preparation. */
async function interactiveStoreRequest<T>(work: () => Promise<T>): Promise<T> {
  if (isCriticalSessionActive() || interactiveOwner) throw new Error('Store request unavailable')
  const owner = Symbol('store request')
  interactiveOwner = owner; observationVersion += 1; refreshInFlight = null
  try { return await work() }
  finally { if (interactiveOwner === owner) interactiveOwner = null }
}

/** Out-of-app approvals are reconciled from the store, never trusted as UI commands. */
function useIdleStoreChanges(critical: boolean, onChange: (stillEligible: () => boolean) => void) {
  const current = useRef(onChange)
  useEffect(() => { current.current = onChange }, [onChange])
  useFocusEffect(useCallback(() => {
    if (critical) return undefined
    let active = true
    const changed = () => {
      if (active && AppState.currentState === 'active' && !isCriticalSessionActive() && !interactiveOwner) {
        current.current(() => active && AppState.currentState === 'active' && !isCriticalSessionActive())
      }
    }
    const foreground = AppState.addEventListener('change', (state) => { if (state === 'active') changed() })
    let native: { remove(): void } | undefined
    try { native = commerceGateway.addEntitlementListener?.(changed) } catch { /* The existing load/Retry surface reports unavailable native stores. */ }
    return () => {
      active = false
      try { foreground?.remove() } catch { /* A broken observer cannot block free navigation. */ }
      try { native?.remove() } catch { /* Teardown never blocks free navigation. */ }
    }
  }, [critical]))
}

export function IdlePromotionSlot({ surface }: { readonly surface: IdlePromoSurface }) {
  const critical = useCriticalSessionActive()
  const entitlement = useCachedPromotionEntitlement(!critical)
  useFocusEffect(useCallback(() => {
    let active = true
    if (!critical) void refreshIdleEntitlement(() => active).catch(() => undefined)
    return () => { active = false }
  }, [critical]))
  useIdleStoreChanges(critical, (stillEligible) => { void refreshIdleEntitlement(stillEligible).catch(() => undefined) })
  if (critical) return null
  return <EntitlementGatedPromotionSlot entitlement={entitlement} surface={surface} />
}

export function PromotionPurchasePanel() {
  const { t } = useI18n()
  const critical = useCriticalSessionActive()
  const entitlement = useCachedPromotionEntitlement(!critical)
  const [product, setProduct] = useState<CommerceProduct | null>(null)
  const [operation, setOperation] = useState<Operation>('idle')
  const [statusKey, setStatusKey] = useState<MessageKey>('promoCommerce.checking')
  const [canRetry, setCanRetry] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [loadRevision, setLoadRevision] = useState(0)
  const loadAttempt = useRef(0)
  const mounted = useRef(true)
  const operationRef = useRef<Operation>('idle')
  const retryPending = useRef(false)
  useIdleStoreChanges(critical, () => {
    if (mounted.current && operationRef.current === 'idle' && !retryPending.current) setLoadRevision(++loadAttempt.current)
  })
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  useFocusEffect(useCallback(() => {
    if (critical || isCriticalSessionActive()) return undefined
    let active = true
    const isCurrent = () => active && !isCriticalSessionActive() && loadRevision === loadAttempt.current
    const version = observationVersion
    // Async function entry contains a synchronous bridge failure without
    // deferring the native call beyond this focused admission turn.
    const productRead = async () => commerceGateway.product()
    void Promise.all([refreshIdleEntitlement(isCurrent), productRead()]).then(([, nextProduct]) => {
      if (!isCurrent()) return
      setProduct(nextProduct.displayPrice.trim() ? nextProduct : null)
      setCanRetry(!nextProduct.displayPrice.trim())
      if (version === observationVersion && operationRef.current === 'idle') setStatusKey(nextProduct.displayPrice.trim() ? 'promoCommerce.available' : 'promoCommerce.unavailable')
    }).catch(() => {
      if (isCurrent()) {
        setCanRetry(true)
        if (version === observationVersion && operationRef.current === 'idle') setStatusKey('promoCommerce.unavailable')
      }
    }).finally(() => { if (isCurrent()) { retryPending.current = false; setRetrying(false) } })
    return () => { active = false }
  }, [critical, loadRevision]))

  const finishPurchase = async (result: CommercePurchaseResult) => {
    const saved = result.outcome === 'cancelled' && !result.owned ? 'preserved' : await remember(result)
    if (!mounted.current) return
    if (result.owned && saved === 'not-saved') setStatusKey('promoCommerce.cacheNotSaved')
    else if (saved === 'confirmation-pending') setStatusKey('promoCommerce.confirmationPending')
    else if (result.outcome === 'purchased' || result.outcome === 'already_owned') setStatusKey('promoCommerce.purchaseSuccess')
    else if (result.outcome === 'pending') setStatusKey('promoCommerce.pending')
    else setStatusKey('promoCommerce.cancelled')
  }

  const purchase = async () => {
    if (!mounted.current || isCriticalSessionActive() || !product || operationRef.current !== 'idle' || getCachedPromotionEntitlement().owned) return
    operationRef.current = 'purchase'
    setOperation('purchase'); setStatusKey('promoCommerce.purchasing')
    try { await interactiveStoreRequest(async () => finishPurchase(await commerceGateway.purchase())) }
    catch { if (mounted.current) setStatusKey('promoCommerce.error') }
    finally { operationRef.current = 'idle'; if (mounted.current) setOperation('idle') }
  }

  const restore = async () => {
    if (!mounted.current || isCriticalSessionActive() || operationRef.current !== 'idle') return
    operationRef.current = 'restore'
    setOperation('restore'); setStatusKey('promoCommerce.restoring')
    try {
      await interactiveStoreRequest(async () => {
        const restored = await commerceGateway.restore()
        const saved = await remember(restored)
        if (mounted.current) setStatusKey(restored.status === 'unknown' ? 'promoCommerce.unavailable' : restored.status === 'pending' ? 'promoCommerce.pending' : saved === 'not-saved' ? 'promoCommerce.cacheNotSaved' : saved === 'confirmation-pending' ? 'promoCommerce.confirmationPending' : restored.owned ? 'promoCommerce.restoreSuccess' : 'promoCommerce.restoreNone')
      })
    } catch { if (mounted.current) setStatusKey('promoCommerce.error') }
    finally { operationRef.current = 'idle'; if (mounted.current) setOperation('idle') }
  }

  const purchaseLabel = product
    ? t('promoCommerce.purchaseWithPrice', { price: product.displayPrice })
    : t('promoCommerce.purchaseUnavailable')

  if (critical) return null

  return <Surface>
    <AppText tone="label">{t('promoCommerce.title')}</AppText>
    <AppText tone="caption" muted>{t('promoCommerce.body')}</AppText>
    {entitlement.owned ? <Badge label={t('promoCommerce.owned')} tone="success" /> : null}
    <AppText accessibilityLiveRegion="polite" tone="caption" muted>{t(statusKey)}</AppText>
    {canRetry || retrying ? <Button label={t('common.retry')} state={retrying ? 'loading' : 'idle'} disabled={operation !== 'idle'} onPress={() => {
      if (!mounted.current || isCriticalSessionActive() || operationRef.current !== 'idle' || retryPending.current) return
      retryPending.current = true; setRetrying(true); setCanRetry(false); setProduct(null); setStatusKey('promoCommerce.checking'); setLoadRevision(++loadAttempt.current)
    }} /> : null}
    <Button
      label={entitlement.owned ? t('promoCommerce.owned') : purchaseLabel}
      variant="primary"
      state={operation === 'purchase' ? 'loading' : entitlement.owned ? 'confirmed' : 'idle'}
      disabled={!product || entitlement.owned || operation === 'restore'}
      onPress={() => { void purchase() }}
    />
    <Button
      label={t('promoCommerce.restore')}
      state={operation === 'restore' ? 'loading' : 'idle'}
      disabled={operation === 'purchase'}
      onPress={() => { void restore() }}
    />
    <AppText tone="caption" muted style={uiStyles.grow}>{t('promoCommerce.safety')}</AppText>
  </Surface>
}
