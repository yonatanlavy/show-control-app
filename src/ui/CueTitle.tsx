import type { StyleProp, TextStyle } from 'react-native'
import { useI18n } from '../i18n'
import { AppText } from './primitives'

/** First-strong isolate: a user-typed name keeps its own direction inside an RTL paragraph. */
export const isolateName = (name: string, rtl: boolean) => rtl ? `⁨${name}⁩` : name

/**
 * Preserve the cue identity while native text layout fits its reading region.
 * In Hebrew/Arabic the paragraph is forced RTL; without isolation iOS reorders
 * Latin names ("Lovely Day (Remix)" would read "(Lovely Day (Remix").
 */
export function CueTitle({ name, compact = false, tone = 'title', style }: {
  name: string; compact?: boolean; tone?: 'title' | 'label'; style?: StyleProp<TextStyle>
}) {
  const { isRTL } = useI18n()
  return <AppText tone={tone} accessibilityLabel={name} numberOfLines={compact ? 1 : 2}
    adjustsFontSizeToFit={compact} textBreakStrategy="balanced" ellipsizeMode="tail" style={style}>{isolateName(name, isRTL)}</AppText>
}
