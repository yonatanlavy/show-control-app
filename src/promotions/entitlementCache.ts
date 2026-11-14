import Storage from 'expo-sqlite/kv-store'
import { useEffect, useSyncExternalStore } from 'react'

const CACHE_KEY = 'show-control.remove-promotions-entitlement.v1'

export interface CachedPromotionEntitlement {
  readonly hydrated: boolean
  readonly owned: boolean
  readonly status: 'owned' | 'not_owned' | 'pending' | 'unknown'
  readonly updatedAtEpochMs: number | null
}

const EMPTY_CACHE: CachedPromotionEntitlement = Object.freeze({
  hydrated: false,
  owned: false,
  status: 'unknown',
  updatedAtEpochMs: null,
})

let snapshot = EMPTY_CACHE
let hydratePromise: Promise<void> | null = null
let revision = 0
let writeTail: Promise<void> = Promise.resolve()
const listeners = new Set<() => void>()

function emit(next: CachedPromotionEntitlement) {
  snapshot = Object.freeze(next)
  revision += 1
  for (const listener of [...listeners]) {
    try { listener() } catch { /* An obsolete screen cannot prevent durable ownership. */ }
  }
}

function isCachedEntitlement(value: unknown): value is CachedPromotionEntitlement {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<CachedPromotionEntitlement>
  return typeof item.owned === 'boolean' &&
    ['owned', 'not_owned', 'pending', 'unknown'].includes(item.status ?? '') &&
    item.owned === (item.status === 'owned') &&
    (item.updatedAtEpochMs === null || (typeof item.updatedAtEpochMs === 'number' && Number.isFinite(item.updatedAtEpochMs) && item.updatedAtEpochMs >= 0))
}

export function getCachedPromotionEntitlement() { return snapshot }

export function subscribeCachedPromotionEntitlement(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Reads only the local SQLite-backed cache; it never contacts a storefront. */
export function hydratePromotionEntitlementCache(): Promise<void> {
  if (snapshot.hydrated) return Promise.resolve()
  if (hydratePromise) return hydratePromise
  const startedAtRevision = revision
  hydratePromise = Promise.resolve().then(() => Storage.getItem(CACHE_KEY)).then((stored) => {
    if (revision !== startedAtRevision) return
    if (!stored) {
      emit({ ...EMPTY_CACHE, hydrated: true })
      return
    }
    try {
      const parsed: unknown = JSON.parse(stored)
      if (isCachedEntitlement(parsed)) emit({ ...parsed, hydrated: true })
      else emit({ ...EMPTY_CACHE, hydrated: true })
    } catch {
      // Corrupt cache is safely ignored. The next idle storefront refresh replaces it.
      emit({ ...EMPTY_CACHE, hydrated: true })
    }
  }).catch(() => {
    // Cache I/O must never block show preparation or live controls.
    if (revision === startedAtRevision) emit({ ...EMPTY_CACHE, hydrated: true })
  })
  return hydratePromise
}

export type EntitlementSaveResult = 'saved' | 'not-saved' | 'preserved'

export async function cachePromotionEntitlement(next: Omit<CachedPromotionEntitlement, 'hydrated' | 'updatedAtEpochMs'>): Promise<EntitlementSaveResult> {
  if (!['owned', 'not_owned', 'unknown', 'pending'].includes(next.status) || next.owned !== (next.status === 'owned')) throw new Error('Inconsistent store ownership result')
  if (next.status === 'unknown' || next.status === 'pending') {
    await hydratePromotionEntitlementCache()
    if (!snapshot.owned) emit({ ...snapshot, status: next.status })
    // Uncertainty is not revocation. In particular, a failed local read must
    // not overwrite an earlier durable purchase which may still be recoverable.
    return 'preserved'
  }
  const value: CachedPromotionEntitlement = { ...next, hydrated: true, updatedAtEpochMs: Date.now() }
  emit(value)
  let result: EntitlementSaveResult = 'saved'
  // SQLite KV writes are individually atomic; serialize them so an older slow
  // completion cannot replace a newer store result on the next launch.
  const write = writeTail.then(async () => {
    try { await Storage.setItem(CACHE_KEY, JSON.stringify(value)) }
    catch { result = 'not-saved' } // In-memory ownership remains valid.
  })
  writeTail = write
  await write
  return result
}

export function useCachedPromotionEntitlement(allowHydration = true) {
  useEffect(() => {
    if (allowHydration) void hydratePromotionEntitlementCache()
  }, [allowHydration])
  return useSyncExternalStore(
    subscribeCachedPromotionEntitlement,
    getCachedPromotionEntitlement,
    getCachedPromotionEntitlement,
  )
}

export function resetPromotionEntitlementCacheForTests() {
  snapshot = EMPTY_CACHE
  hydratePromise = null
  revision = 0
  writeTail = Promise.resolve()
  listeners.clear()
}
