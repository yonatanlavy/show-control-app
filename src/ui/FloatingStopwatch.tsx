import { useEffect, useState } from 'react'
import { PanResponder, StyleSheet, useWindowDimensions, View } from 'react-native'
import { font, radius, size, space, useThemeColors } from '../design'
import { useI18n } from '../i18n'
import { AppText, Button, uiStyles } from './primitives'
import { useSessionStopwatch } from './SessionStopwatch'

function createDragController(initial: { x: number; y: number }, onMove: (position: { x: number; y: number }) => void) {
  let current = initial; let origin = current; let maxX = 0; let maxY = 0; let notify = onMove
  const move = (x: number, y: number) => { current = { x: Math.min(maxX, Math.max(0, x)), y: Math.min(maxY, Math.max(0, y)) }; notify(current) }
  return {
    responder: PanResponder.create({ onStartShouldSetPanResponder: () => true, onPanResponderGrant: () => { origin = current }, onPanResponderMove: (_, gesture) => move(origin.x + gesture.dx, origin.y + gesture.dy) }),
    setBounds: (x: number, y: number) => { maxX = Math.max(0, x); maxY = Math.max(0, y); move(current.x, current.y) },
    sync: (position: { x: number; y: number }, nextNotify: typeof onMove) => { current = position; notify = nextNotify },
    moveBy: (x: number, y: number) => move(current.x + x, current.y + y),
  }
}

/** UI-only stopwatch. Its clock never affects audio or scheduled commands. */
export function FloatingStopwatch({ onHide, visible = true, availableWidth, availableHeight = size.runReadout + size.controlLarge }: { onHide: () => void; visible?: boolean; availableWidth?: number; availableHeight?: number }) {
  const { t } = useI18n(); const colors = useThemeColors()
  const stopwatch = useSessionStopwatch(); const { position, running, elapsedMs, setVisible } = stopwatch
  const [drag] = useState(() => createDragController(position, stopwatch.setPosition)); const viewport = useWindowDimensions()
  useEffect(() => drag.sync(position, stopwatch.setPosition), [drag, position, stopwatch.setPosition])
  useEffect(() => setVisible(visible), [setVisible, visible])
  const panelWidth = Math.max(size.control * 2, Math.min(size.control * 4 + space.sm * 2, (availableWidth ?? Math.min(viewport.width, size.contentMax)) - space.md))
  const handleHeight = Math.max(size.control, Math.min((font.lineHeight.caption + font.lineHeight.time) * viewport.fontScale, availableHeight - size.control * 2 - space.xs * 4))
  const seconds = Math.floor(elapsedMs / 1000); const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  return <View onLayout={(event) => drag.setBounds((availableWidth ?? Math.min(viewport.width, size.contentMax)) - event.nativeEvent.layout.width - space.md, availableHeight - event.nativeEvent.layout.height)} style={[styles.timer, { width: panelWidth, left: position.x, top: position.y, backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong }]}>
    <View {...drag.responder.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={t('timer.title')} accessibilityValue={{ text: clock }} accessibilityHint={t('timer.drag')} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={(event) => drag.moveBy(0, event.nativeEvent.actionName === 'increment' ? space.lg : -space.lg)} style={[styles.handle, { height: handleHeight }]}><AppText tone="caption" numberOfLines={1} adjustsFontSizeToFit>{t('timer.title')} ≡</AppText><AppText tone="time" numberOfLines={1} adjustsFontSizeToFit style={uiStyles.grow}>{clock}</AppText></View>
    <View style={uiStyles.row}><View style={uiStyles.grow}><Button stageSafe compact label={running ? t('edge.timer.pause') : t('edge.timer.start')} accessibilityLabel={running ? t('timer.pause') : t('timer.start')} onPress={running ? stopwatch.pause : stopwatch.start} /></View><View style={uiStyles.grow}><Button stageSafe compact label={t('edge.timer.reset')} accessibilityLabel={t('timer.reset')} onPress={stopwatch.reset} /></View></View><Button stageSafe compact label={t('edge.timer.hide')} accessibilityLabel={t('timer.hide')} variant="ghost" onPress={() => { stopwatch.setVisible(false); onHide() }} />
  </View>
}
const styles = StyleSheet.create({ timer: { position: 'absolute', zIndex: 1, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.xs, gap: space.xs, maxWidth: size.contentMax / 2 }, handle: { minHeight: size.control, alignItems: 'center' } })
