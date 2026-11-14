import type { StyleProp, TextStyle } from 'react-native'
import { font } from '../design'
import { useI18n } from '../i18n'
import { AppText } from './primitives'

/** Allocated native voices, not an estimate of audible output or pending work. */
export function VoiceCapacity({ active, limit, stageSafe = false, style }: {
  readonly active: number
  readonly limit: number
  readonly stageSafe?: boolean
  readonly style?: StyleProp<TextStyle>
}) {
  const { t, locale } = useI18n()
  const prefix = t('refine.voices')
  const ratio = `${active.toLocaleString(locale)} / ${limit.toLocaleString(locale)}`
  return <AppText tone="caption" muted style={style} accessibilityLabel={`${prefix}: ${ratio}`}
    {...(stageSafe ? { numberOfLines: 1, adjustsFontSizeToFit: true, maxFontSizeMultiplier: font.scale.stageMax } : {})}>
    {`${prefix}: \u2066${ratio}\u2069`}
  </AppText>
}
