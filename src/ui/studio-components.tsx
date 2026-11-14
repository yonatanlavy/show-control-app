import { type ReactNode, useState } from 'react'
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { font, opacity, radius, size, space, useThemeColors } from '../design'
import { type Show } from '../domain'
import { useI18n } from '../i18n'
import { AppIcon, type IconName } from './icons'
import { AppText, Badge, CoverTile, uiStyles } from './primitives'

/** Artwork is presentational: it never starts a preview or mutates song data. */
export function showArtwork(show: Show): string | undefined {
  for (const set of show.sets) for (const id of set.cueOrder) {
    const cue = show.cues[id]
    if (cue?.type === 'audio' && cue.artworkAssetId) {
      const image = show.visualAssets?.[cue.artworkAssetId]
      if (image?.kind === 'image') return image.localUri
    }
  }
  return undefined
}

export function StudioMasthead() {
  const { t } = useI18n(); const colors = useThemeColors()
  return <View style={styles.masthead}><View style={[uiStyles.row, { maxWidth: '100%' }]}><View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.brand, { backgroundColor: colors.accentSurface }]}>{[space.sm, space.lg, space.md].map((height) => <View key={height} style={{ width: space.xxs, height, backgroundColor: colors.accent, borderRadius: radius.round }} />)}</View><AppText tone="eyebrow" numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.textMuted, flexShrink: 1 }}>{t('common.appName')}</AppText></View><View style={styles.offline}><View accessible={false} style={[styles.dot, { backgroundColor: colors.success }]} /><AppText tone="caption" muted>{t('library.offline')}</AppText></View></View>
}

export function SectionLabel({ title, trailing }: { title: string; trailing?: ReactNode }) {
  const colors = useThemeColors()
  return <View style={uiStyles.row}><AppText accessibilityRole="header" tone="eyebrow" style={{ color: colors.textMuted }}>{title}</AppText><View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />{trailing}</View>
}

/** Shared preparation identity. Reading content grows; live controls never use it. */
export function WorkflowHero({ title, body, icon, eyebrow, children }: { title: string; body?: string; icon: IconName; eyebrow?: string; children?: ReactNode }) {
  const colors = useThemeColors()
  return <View style={[styles.workflowHero, { backgroundColor: colors.surfaceRaised, borderColor: colors.borderSubtle }]}><View style={uiStyles.row}><View accessible={false} style={[styles.workflowMark, { backgroundColor: colors.accentSurface }]}><AppIcon name={icon} tint={colors.accent} /></View><View style={uiStyles.grow}>{eyebrow ? <AppText tone="eyebrow" style={{ color: colors.accent }}>{eyebrow}</AppText> : null}<AppText tone="title" accessibilityRole="header">{title}</AppText></View></View>{body ? <AppText muted>{body}</AppText> : null}{children}</View>
}

/** One named task with a full-size target, a readable explanation and focus state. */
export function ActionCard({ title, detail, icon, onPress, disabled = false, tone = 'accent' }: { title: string; detail?: string; icon: IconName; onPress: () => void; disabled?: boolean; tone?: 'accent' | 'neutral' }) {
  const colors = useThemeColors(); const { isRTL } = useI18n(); const [focused, setFocused] = useState(false)
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={detail} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.actionCard, { backgroundColor: pressed ? colors.surfacePressed : colors.surfaceRaised, borderColor: focused ? colors.accent : colors.borderSubtle, opacity: disabled ? opacity.disabled : 1 }]}><View accessible={false} style={[styles.toolIcon, { backgroundColor: tone === 'accent' ? colors.accentSurface : colors.surface }]}><AppIcon name={icon} tint={tone === 'accent' ? colors.accent : colors.textMuted} /></View><View style={[uiStyles.grow, styles.toolCopy]}><AppText tone="label">{title}</AppText>{detail ? <AppText tone="caption" muted>{detail}</AppText> : null}</View><AppIcon name="chevron" rtl={isRTL} tint={colors.textSubtle} /></Pressable>
}

export function StudioWelcome({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  const colors = useThemeColors(); const { t } = useI18n()
  return <View style={[styles.welcome, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}><View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.welcomeArt}><View style={styles.welcomeBack}><CoverTile title={t('nav.library')} large /></View><View style={styles.welcomeFront}><CoverTile title={t('common.appName')} poster /></View><View style={styles.welcomeSide}><CoverTile title={t('nav.rehearsal')} large /></View></View><AppText tone="title" accessibilityRole="header" style={styles.welcomeText}>{title}</AppText><AppText muted style={styles.welcomeText}>{body}</AppText>{action}</View>
}

export function ShowHero({ title, eyebrow, subtitle, artworkUri, badge, action, children, compact = true }: { title: string; eyebrow: string; subtitle?: string | undefined; artworkUri?: string | undefined; badge?: string; action?: ReactNode; children?: ReactNode; compact?: boolean }) {
  const colors = useThemeColors(); const viewport = useWindowDimensions()
  const stacked = (!compact && viewport.width < size.control * 7.5) || viewport.fontScale > font.scale.stageMax
  return <View style={[styles.hero, compact && { padding: space.md, gap: space.sm }, { backgroundColor: colors.surfaceRaised, borderColor: colors.borderSubtle }]}><View style={[styles.heroBody, stacked && styles.stacked]}><View style={[styles.heroCopy, stacked && { flex: 0, width: '100%' }]}><AppText tone="eyebrow" style={{ color: colors.accent }}>{eyebrow}</AppText><AppText tone="title" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} accessibilityRole="header">{title}</AppText>{subtitle ? <AppText tone="caption" muted>{subtitle}</AppText> : null}{badge ? <Badge label={badge} tone="success" /> : null}</View><View accessible={false} importantForAccessibility="no-hide-descendants" style={compact ? { width: size.goCompact, height: size.goCompact } : styles.artStack}>{compact ? <CoverTile title={title} uri={artworkUri} large /> : <><View style={[styles.backSleeve, { backgroundColor: colors.accentSurface, borderColor: colors.accent }]} /><View style={[styles.record, { backgroundColor: colors.canvas, borderColor: colors.border }]} /><View style={styles.heroCover}><CoverTile title={title} uri={artworkUri} large /></View></>}</View></View>{children}{action}</View>
}

export interface ToolItem { readonly id: string; readonly title: string; readonly detail?: string; readonly icon: IconName; readonly onPress: () => void; readonly disabled?: boolean; readonly tone?: 'accent' | 'purple' | 'green' | 'warm' }
export function ToolGrid({ items }: { items: readonly ToolItem[] }) {
  const colors = useThemeColors(); const { isRTL } = useI18n(); const viewport = useWindowDimensions()
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const stacked = viewport.width < size.control * 7 || viewport.fontScale > font.scale.stageMax
  return <View style={styles.toolGrid}>{items.map((item) => {
    const ink = item.tone === 'purple' ? colors.purpleAccent : item.tone === 'green' ? colors.success : item.tone === 'warm' ? colors.tagOrange : colors.accent
    const fill = item.tone === 'purple' ? colors.purpleAccentSurface : item.tone === 'green' ? colors.successSurface : item.tone === 'warm' ? colors.warningSurface : colors.accentSurface
    return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} accessibilityHint={item.detail} accessibilityState={{ disabled: Boolean(item.disabled) }} disabled={item.disabled} onPress={item.onPress} onFocus={() => setFocusedId(item.id)} onBlur={() => setFocusedId((current) => current === item.id ? null : current)} style={({ pressed }) => [styles.tool, { width: stacked ? '100%' : '48%', backgroundColor: pressed ? colors.surfacePressed : colors.surface, borderColor: focusedId === item.id ? colors.accent : colors.borderSubtle, borderWidth: focusedId === item.id ? size.iconStroke : StyleSheet.hairlineWidth, opacity: item.disabled ? opacity.disabled : 1 }]}><View style={uiStyles.row}><View style={[styles.toolIcon, { backgroundColor: fill }]}><AppIcon name={item.icon} tint={ink} /></View><View style={uiStyles.grow} /><AppIcon name="chevron" rtl={isRTL} tint={colors.textSubtle} /></View><View style={styles.toolCopy}><AppText tone="label" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.9} style={{ fontSize: font.size.body }}>{item.title}</AppText>{item.detail ? <AppText tone="caption" muted>{item.detail}</AppText> : null}</View></Pressable>
  })}</View>
}

export function PrimaryAction({ label, icon, onPress, disabled = false, accessibilityLabel }: { label: string; icon: IconName; onPress: () => void; disabled?: boolean; accessibilityLabel?: string }) {
  const colors = useThemeColors()
  const [focused, setFocused] = useState(false)
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.action, { backgroundColor: pressed ? colors.goPressed : colors.accent, borderColor: focused ? colors.accentInk : colors.transparent, opacity: disabled ? opacity.disabled : 1 }]}><AppIcon name={icon} tint={colors.accentInk} /><AppText tone="label" style={{ color: colors.accentInk, flexShrink: 1, textAlign: 'center' }}>{label}</AppText></Pressable>
}

const styles = StyleSheet.create({
  workflowHero: { padding: space.lg, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, gap: space.md },
  workflowMark: { width: size.controlLarge, height: size.controlLarge, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actionCard: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: size.iconStroke, minHeight: size.goCompact },
  masthead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  welcome: { padding: space.lg, gap: space.md, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth }, welcomeText: { textAlign: 'center' },
  welcomeArt: { height: size.coverPoster + space.xxl, alignItems: 'center', justifyContent: 'center', direction: 'ltr' },
  welcomeBack: { position: 'absolute', start: space.xs, bottom: space.lg, transform: [{ rotate: '-18deg' }] },
  welcomeFront: { zIndex: 1, transform: [{ rotate: '-5deg' }] },
  welcomeSide: { position: 'absolute', end: space.xs, top: space.md, transform: [{ rotate: '18deg' }] },
  brand: { width: size.control, height: size.control, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xxs },
  offline: { flexDirection: 'row', alignItems: 'center', gap: space.xs }, dot: { width: space.xs, height: space.xs, borderRadius: radius.round },
  hero: { padding: space.lg, gap: space.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.xl, overflow: 'hidden' },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: space.md }, stacked: { flexDirection: 'column-reverse', alignItems: 'flex-start' },
  heroCopy: { flex: 1, minWidth: 0, gap: space.xs },
  artStack: { width: size.coverHero, height: size.coverHero, justifyContent: 'center', alignItems: 'flex-start', direction: 'ltr', flexShrink: 0 },
  backSleeve: { position: 'absolute', width: size.goCompact, height: size.goCompact, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, top: space.xl, start: space.sm, transform: [{ rotate: '-12deg' }] },
  record: { position: 'absolute', width: size.goCompact, height: size.goCompact, borderRadius: radius.round, borderWidth: space.xs, top: space.lg, end: 0 },
  heroCover: { transform: [{ rotate: '5deg' }] },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: space.sm },
  tool: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.xl, padding: space.md, gap: space.lg, minHeight: size.coverHero },
  toolIcon: { width: size.control, height: size.control, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' }, toolCopy: { gap: space.xxs },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, borderWidth: size.iconStroke, borderRadius: radius.lg, minHeight: size.controlLarge, paddingHorizontal: space.md, paddingVertical: space.sm },
})
