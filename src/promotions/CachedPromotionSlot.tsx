import type { PromoSurface } from './contracts'
import { StyleSheet, View } from 'react-native'
import { type CachedPromotionEntitlement, useCachedPromotionEntitlement } from './entitlementCache'
import { PROMOTION_SLOT_HEIGHT, PromotionSlot } from '../ui/PromotionSlot'
import { useCriticalSessionActive } from '../ui/use-critical-session-active'

export function EntitlementGatedPromotionSlot({
  entitlement,
  surface,
}: {
  readonly entitlement: CachedPromotionEntitlement
  readonly surface: PromoSurface
}) {
  if (entitlement.owned) return null
  if (!entitlement.hydrated) {
    return <View
      testID={`promotion-placeholder:${surface}`}
      style={styles.placeholder}
    />
  }
  // Unknown/pending storefront results must not leave a permanent blank footer.
  // A promotion still appears only after a known not-owned result.
  if (entitlement.status !== 'not_owned') return null
  return <PromotionSlot surface={surface} />
}

/** Cache-only gate for Rehearsal and Preflight. No storefront module is imported. */
export function CachedPromotionSlot({ surface }: { readonly surface: Extract<PromoSurface, 'rehearsal' | 'preflight'> }) {
  const critical = useCriticalSessionActive()
  const entitlement = useCachedPromotionEntitlement(!critical)
  if (critical) return null
  return <EntitlementGatedPromotionSlot entitlement={entitlement} surface={surface} />
}

const styles = StyleSheet.create({ placeholder: { height: PROMOTION_SLOT_HEIGHT } })
