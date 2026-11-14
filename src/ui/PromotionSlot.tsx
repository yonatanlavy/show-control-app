import { StyleSheet, View } from 'react-native'
import { color, radius, size, space } from '../design'
import type { PromoSurface } from '../promotions/contracts'
import { useI18n } from '../i18n'
import { AppText, Badge, uiStyles } from './primitives'

export const PROMOTION_SLOT_HEIGHT = size.go + space.lg

/**
 * Bundled, rights-safe first-party placement. It has no image, tracking, remote
 * content, or click target. Only non-live route modules may import it.
 */
export function PromotionSlot({ surface }: { readonly surface: PromoSurface }) {
  const { t } = useI18n()
  const accessibilityLabel = [t('promo.label'), t('promo.title'), t('promo.body'), t('promo.liveRule')].join('. ')

  return <View testID={`first-party-promotion:${surface}`} style={styles.frame}>
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="summary"
      style={styles.slot}
    >
      <View style={uiStyles.row}>
        <Badge label={t('promo.label')} />
        <AppText tone="caption" muted numberOfLines={1} adjustsFontSizeToFit style={uiStyles.grow}>
          {t('promo.liveRule')}
        </AppText>
      </View>
      <AppText tone="label" numberOfLines={1} adjustsFontSizeToFit>{t('promo.title')}</AppText>
      <AppText tone="caption" muted numberOfLines={2} adjustsFontSizeToFit>{t('promo.body')}</AppText>
    </View>
  </View>
}

const styles = StyleSheet.create({
  frame: {
    height: PROMOTION_SLOT_HEIGHT,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: color.canvas,
    borderTopColor: color.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  slot: {
    flex: 1,
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderColor: color.borderStrong,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: color.surfaceRaised,
  },
})
