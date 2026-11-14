import { type ReactElement, type ReactNode, useCallback, useContext, useEffect, useRef } from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, SectionList, StyleSheet, View } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { radius, space, useThemeColors } from '../design'
import { KeyboardAvoidanceContext } from './keyboard-avoidance'

export interface CollectionSection<Item> {
  readonly key: string
  readonly data: readonly Item[]
  readonly heading?: ReactNode
}

/** Read-only and preparation lists. Rows are windowed; native transport stays elsewhere. */
export function CollectionViewport<Item>({ sections, renderItem, keyExtractor, header, footer, resetKey, scopeKey, getResetOffset, stickyHeaders = false, compactHeadings = false }: {
  sections: readonly CollectionSection<Item>[]
  renderItem: (item: Item, index: number, sectionKey: string) => ReactElement | null
  keyExtractor: (item: Item, index: number) => string
  header: ReactElement
  footer: ReactElement
  resetKey: string
  scopeKey: string
  getResetOffset?: () => number
  stickyHeaders?: boolean
  compactHeadings?: boolean
}) {
  const list = useRef<SectionList<Item, CollectionSection<Item>>>(null)
  const previousReset = useRef({ resetKey, scopeKey })
  const viewportHeight = useRef<number | null>(null)
  const insets = useContext(SafeAreaInsetsContext)
  const keyboardManagedByShell = useContext(KeyboardAvoidanceContext)
  const colors = useThemeColors()
  const scroll = useCallback((requested: number) => {
    const y = Number.isFinite(requested) ? Math.max(0, requested) : 0
    list.current?.getScrollResponder()?.scrollTo({ x: 0, y, animated: false })
  }, [])
  useEffect(() => {
    if (previousReset.current.resetKey === resetKey && previousReset.current.scopeKey === scopeKey) return
    const scopeChanged = previousReset.current.scopeKey !== scopeKey
    previousReset.current = { resetKey, scopeKey }
    // Query edits keep the search field/results above the keyboard. Changing
    // the show/playlist starts at its heading instead. Native offsets use dp.
    const requested = scopeChanged ? 0 : getResetOffset?.() ?? 0
    scroll(requested)
  }, [getResetOffset, resetKey, scopeKey, scroll])
  return <KeyboardAvoidingView enabled={!keyboardManagedByShell} style={styles.viewport} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={insets?.top ?? 0}>
    <SectionList<Item, CollectionSection<Item>> ref={list} testID="collection-viewport" style={styles.viewport}
    onLayout={(event) => {
      const height = event.nativeEvent.layout.height
      const previous = viewportHeight.current; viewportHeight.current = height
      // A fast first query can precede Android's keyboard resize. Retry only
      // after that smaller viewport exists, not after ordinary feedback changes.
      if (height > 0 && previous !== null && height < previous && Keyboard.isVisible() && resetKey.trim() && getResetOffset) scroll(getResetOffset())
    }}
    sections={sections} keyExtractor={keyExtractor} stickySectionHeadersEnabled={stickyHeaders}
    initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7} removeClippedSubviews={false}
    keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
    ListHeaderComponent={header} ListFooterComponent={footer}
    renderSectionHeader={({ section }) => section.heading ? <View style={[styles.heading, compactHeadings && styles.compactHeading, stickyHeaders && { backgroundColor: colors.canvas }]}>{section.heading}</View> : null}
    renderItem={({ item, index, section }) => <View style={[styles.cell, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, index === 0 && styles.first, index === section.data.length - 1 && styles.last]}>{renderItem(item, index, section.key)}</View>}
  /></KeyboardAvoidingView>
}

const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
  heading: { paddingTop: space.lg, paddingBottom: space.sm },
  compactHeading: { paddingTop: space.xs },
  cell: { paddingHorizontal: space.md, borderStartWidth: StyleSheet.hairlineWidth, borderEndWidth: StyleSheet.hairlineWidth },
  first: { paddingTop: space.xxs, borderTopWidth: StyleSheet.hairlineWidth, borderTopStartRadius: radius.lg, borderTopEndRadius: radius.lg },
  last: { paddingBottom: space.xxs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomStartRadius: radius.lg, borderBottomEndRadius: radius.lg },
})
