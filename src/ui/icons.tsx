import { StyleSheet, View } from 'react-native'
import { color, radius, size, space, useThemeColors } from '../design'

export type IconName = 'more' | 'chevron' | 'back' | 'close' | 'plus' | 'minus' | 'play' | 'stop' | 'download' | 'music' | 'library' | 'list' | 'rehearse' | 'check' | 'next' | 'previous' | 'pause' | 'bluetooth' | 'remote' | 'sliders' | 'display' | 'shield' | 'mic' | 'help'

/** Source-owned native marks. Reading arrows mirror; transport symbols never do. */
export function AppIcon({ name, tint, rtl = false }: { name: IconName; tint?: string; rtl?: boolean }) {
  const colors = useThemeColors(); const ink = tint ?? colors.textMuted
  const line = { backgroundColor: ink }
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.icon, (name === 'chevron' || name === 'back') && rtl && styles.mirrored]}>
    {name === 'more' ? <View style={styles.dots}>{[0, 1, 2].map((dot) => <View key={dot} style={[styles.dot, line]} />)}</View> : null}
    {name === 'chevron' || name === 'back' ? <View style={[styles.chevron, { borderColor: ink }, name === 'back' && styles.back]} /> : null}
    {name === 'plus' || name === 'close' ? <View style={[styles.icon, name === 'close' && { transform: [{ rotate: '45deg' }] }]}><View style={[styles.horizontal, line]} /><View style={[styles.vertical, line]} /></View> : null}
    {name === 'minus' ? <View style={[styles.horizontal, line]} /> : null}
    {name === 'sliders' ? <View style={styles.sliders}>{[space.xxs, space.sm, space.xs].map((offset, index) => <View key={index} style={[styles.fader, line]}><View style={[styles.faderCap, { top: offset, backgroundColor: colors.surface, borderColor: ink }]} /></View>)}</View> : null}
    {name === 'display' ? <><View style={[styles.screen, { borderColor: ink }]} /><View style={[styles.screenStand, line]} /></> : null}
    {name === 'shield' ? <View style={[styles.shield, { borderColor: ink }]}><View style={[styles.check, { borderColor: ink }]} /></View> : null}
    {name === 'mic' ? <><View style={[styles.microphone, { borderColor: ink }]} /><View style={[styles.micStem, line]} /></> : null}
    {name === 'help' ? <View style={[styles.help, { borderColor: ink }]}><View style={[styles.dot, line]} /></View> : null}
    {name === 'play' ? <View style={[styles.play, { borderLeftColor: ink }]} /> : null}
    {name === 'stop' ? <View style={[styles.square, line]} /> : null}
    {name === 'list' || name === 'library' ? <View style={[styles.lines, name === 'library' && { borderWidth: size.iconStroke, borderColor: ink, borderRadius: radius.sm }]}>{[0, 1, 2].map((row) => <View key={row} style={[styles.listLine, line]} />)}</View> : null}
    {name === 'download' ? <><View style={[styles.downloadStem, line]} /><View style={[styles.downloadArrow, { borderColor: ink }]} /><View style={[styles.downloadBase, { borderColor: ink }]} /></> : null}
    {name === 'rehearse' ? <><View style={[styles.circle, { borderColor: ink }]} /><View style={[styles.repeatArrow, { borderColor: ink }]} /></> : null}
    {name === 'music' ? <><View style={[styles.musicStem, line]} /><View style={[styles.musicNote, line]} /><View style={[styles.musicFlag, line]} /></> : null}
    {name === 'check' ? <View style={[styles.check, { borderColor: ink }]} /> : null}
    {name === 'next' || name === 'previous' ? <View style={[styles.transport, name === 'previous' && { transform: [{ scaleX: -1 }] }]}><View style={[styles.play, { borderLeftColor: ink }]} /><View style={[styles.transportBar, line]} /></View> : null}
    {name === 'pause' ? <View style={styles.transport}><View style={[styles.transportBar, line]} /><View style={[styles.transportBar, line]} /></View> : null}
    {name === 'remote' ? <View style={[styles.remote, { borderColor: ink }]}><View style={[styles.remoteDot, line]} /><View style={[styles.remoteDot, line]} /></View> : null}
    {name === 'bluetooth' ? <><View style={[styles.vertical, line]} /><View style={[styles.bluetoothTop, { borderColor: ink }]} /><View style={[styles.bluetoothBottom, { borderColor: ink }]} /></> : null}
  </View>
}

const styles = StyleSheet.create({
  icon: { width: size.icon, height: size.icon, alignItems: 'center', justifyContent: 'center', flexShrink: 0, direction: 'ltr' },
  mirrored: { transform: [{ scaleX: -1 }] },
  dots: { flexDirection: 'row', gap: space.xxs }, dot: { width: space.xxs, height: space.xxs, borderRadius: radius.round },
  chevron: { width: space.xs, height: space.xs, borderTopWidth: size.iconStroke, borderRightWidth: size.iconStroke, transform: [{ rotate: '45deg' }] }, back: { transform: [{ rotate: '-135deg' }] },
  horizontal: { position: 'absolute', width: space.md, height: size.iconStroke }, vertical: { position: 'absolute', width: size.iconStroke, height: space.md },
  play: { borderTopWidth: space.xs, borderBottomWidth: space.xs, borderLeftWidth: space.sm, borderTopColor: color.transparent, borderBottomColor: color.transparent },
  square: { width: space.sm, height: space.sm, borderRadius: size.iconStroke },
  lines: { width: size.icon, height: size.icon, justifyContent: 'center', gap: space.xxs, padding: space.xxs }, listLine: { height: size.iconStroke, borderRadius: radius.round },
  downloadStem: { position: 'absolute', top: size.iconStroke, width: size.iconStroke, height: space.sm },
  downloadArrow: { position: 'absolute', top: space.xs, width: space.xs, height: space.xs, borderBottomWidth: size.iconStroke, borderRightWidth: size.iconStroke, transform: [{ rotate: '45deg' }] },
  downloadBase: { position: 'absolute', bottom: size.iconStroke, width: space.md, height: space.xxs, borderBottomWidth: size.iconStroke, borderLeftWidth: size.iconStroke, borderRightWidth: size.iconStroke },
  circle: { width: space.md, height: space.md, borderRadius: radius.round, borderWidth: size.iconStroke, borderTopColor: color.transparent, transform: [{ rotate: '-35deg' }] },
  repeatArrow: { position: 'absolute', top: space.xxs, start: space.xxs, width: space.xs, height: space.xs, borderTopWidth: size.iconStroke, borderStartWidth: size.iconStroke },
  musicStem: { position: 'absolute', start: space.sm, top: space.xxs, height: space.md, width: size.iconStroke },
  musicNote: { position: 'absolute', start: space.xxs, bottom: size.iconStroke, width: space.sm, height: space.xs, borderRadius: radius.round },
  musicFlag: { position: 'absolute', start: space.sm, top: space.xxs, width: space.xs, height: size.iconStroke, transform: [{ rotate: '-15deg' }] },
  check: { width: space.sm, height: space.xs, borderBottomWidth: size.iconStroke, borderStartWidth: size.iconStroke, transform: [{ rotate: '-45deg' }] },
  transport: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, direction: 'ltr' }, transportBar: { height: space.md, width: space.xxs, borderRadius: size.iconStroke },
  remote: { width: space.md, height: size.icon, borderRadius: radius.sm, borderWidth: size.iconStroke, alignItems: 'center', justifyContent: 'center', gap: space.xxs }, remoteDot: { width: space.xxs, height: space.xxs, borderRadius: radius.round },
  bluetoothTop: { position: 'absolute', top: space.xxs, width: space.xs, height: space.xs, borderTopWidth: size.iconStroke, borderEndWidth: size.iconStroke, transform: [{ rotate: '45deg' }] },
  bluetoothBottom: { position: 'absolute', bottom: space.xxs, width: space.xs, height: space.xs, borderBottomWidth: size.iconStroke, borderEndWidth: size.iconStroke, transform: [{ rotate: '-45deg' }] },
  sliders: { flexDirection: 'row', height: space.md, gap: space.xxs }, fader: { width: size.iconStroke, height: space.md }, faderCap: { position: 'absolute', width: space.xxs * 2, height: space.xxs, start: -space.xxs + size.iconStroke / 2, borderWidth: size.iconStroke, borderRadius: radius.round },
  screen: { width: size.icon, height: space.md, borderWidth: size.iconStroke, borderRadius: radius.sm }, screenStand: { width: space.sm, height: size.iconStroke, marginTop: space.xxs },
  shield: { width: size.icon, height: size.icon, borderWidth: size.iconStroke, borderRadius: radius.sm, borderBottomStartRadius: radius.lg, borderBottomEndRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  microphone: { width: space.sm, height: space.md, borderWidth: size.iconStroke, borderRadius: radius.round }, micStem: { width: size.iconStroke, height: space.xs },
  help: { width: size.icon, height: size.icon, borderWidth: size.iconStroke, borderRadius: radius.round, alignItems: 'center', justifyContent: 'center' },
})
