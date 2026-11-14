import { View } from 'react-native'
import { useI18n, type MessageKey } from '../i18n'
import { MUSIC_CATEGORIES, type MusicCategory } from '../music/categories'
import { ChoiceChip, uiStyles } from './primitives'
export function CategoryPicker({ selected, onChange, disabled = false, single = false }: { selected: readonly MusicCategory[]; onChange: (categories: MusicCategory[]) => void; disabled?: boolean; single?: boolean }) {
  const { t } = useI18n()
  return <View style={uiStyles.wrap}>{MUSIC_CATEGORIES.map((category) => <ChoiceChip key={category} label={t(('category.' + category) as MessageKey)} disabled={disabled} selected={selected.includes(category)} onPress={() => onChange(single ? [category] : selected.includes(category) ? selected.filter((value) => value !== category) : [...selected, category])} />)}</View>
}
