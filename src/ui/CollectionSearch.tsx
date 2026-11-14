import { Keyboard, type LayoutChangeEvent, View } from 'react-native'
import { useI18n } from '../i18n'
import { AppText, Field, IconButton, uiStyles } from './primitives'

export function collectionSearchMatches(query: string, ...values: (string | undefined)[]) {
  if (!query.trim()) return true
  const text = values.join(' ').normalize('NFKC').toLowerCase()
  return query.normalize('NFKC').trim().toLowerCase().split(/\s+/).every((word) => text.includes(word))
}

/** Shared preparation search; filtering never mutates the underlying collection. */
export function CollectionSearch({ value, onChange, label, resultCount, totalCount, onLayout, compact = false, maxLength = 256 }: {
  value: string; onChange: (value: string) => void; label: string
  resultCount: number; totalCount: number; onLayout?: (event: LayoutChangeEvent) => void; compact?: boolean; maxLength?: number
}) {
  const { t } = useI18n()
  return <View testID="collection-search" onLayout={onLayout} style={compact ? { gap: 0 } : uiStyles.gap}>
    <View style={[uiStyles.row, { alignItems: 'flex-end' }]}>
      <View style={uiStyles.grow}><Field label={label} value={value} onChange={onChange} maxLength={maxLength} disableFullscreenUI compact={compact} hideLabel={compact} placeholder={label} returnKeyType="search" onSubmit={Keyboard.dismiss} /></View>
      {value ? <IconButton label={t('use.library.clearSearch')} icon="close" onPress={() => onChange('')} /> : null}
    </View>
    {!compact && value.trim() ? <AppText tone="caption" muted accessibilityLiveRegion="polite">{t('use.library.results', { count: resultCount, total: totalCount })}</AppText> : null}
  </View>
}
