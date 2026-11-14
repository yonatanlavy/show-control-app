import { useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { font, radius, size, space, useThemeColors } from '../design'
import { AppText } from './primitives'

/** Narrowest column a clock such as "3:12.456" stays legible in at the chrome text cap. */
const minimumColumn = size.control * 2

/** Read-only measurements. Long clocks never share a narrow large-text column. */
export function MetricGrid({ items }: { items: readonly { label: string; value: string; neutral?: boolean }[] }) {
  const colors = useThemeColors(); const viewport = useWindowDimensions()
  // The window is only a first-render guess; cards inset the grid, so the measured width decides.
  const [width, setWidth] = useState<number | null>(null)
  const columns = Math.min(items.length, items.length > 3 ? 2 : 3)
  const available = width ?? viewport.width
  const columnWidth = (available - space.xs * Math.max(0, columns - 1)) / Math.max(1, columns)
  const stacked = (width === null && viewport.width < size.control * 6.5) || columnWidth < minimumColumn || viewport.fontScale > font.scale.stageMax
  const paired = !stacked && items.length > 3
  return <View key={stacked ? 'stacked' : paired ? 'paired' : 'row'} onLayout={({ nativeEvent }) => { const next = nativeEvent.layout.width; if (Number.isFinite(next) && next > 0) setWidth(next) }} style={[styles.grid, stacked && styles.stacked]}>{items.map((item) => <View key={item.label} accessible accessibilityRole="text" accessibilityLabel={`${item.label}: ${item.value}`} style={[styles.metric, stacked ? styles.full : paired ? styles.pair : null, { backgroundColor: colors.canvas, borderColor: colors.borderSubtle }]}>
    <AppText tone="caption" muted>{item.label}</AppText><AppText tone="label" numberOfLines={1} adjustsFontSizeToFit style={item.neutral !== false ? styles.number : undefined}>{item.value}</AppText>
  </View>)}</View>
}
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }, stacked: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' },
  metric: { flex: 1, minWidth: size.controlLarge, borderRadius: radius.md, padding: space.sm, gap: space.xxs, borderWidth: StyleSheet.hairlineWidth }, full: { flex: 0, width: '100%' }, pair: { flex: 0, flexBasis: 'auto', width: '48%', minWidth: 0, flexGrow: 1 },
  number: { fontFamily: font.family.mono, direction: 'ltr', writingDirection: 'ltr' },
})
