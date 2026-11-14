import { useRouter } from 'expo-router'
import { type PropsWithChildren, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, type LayoutChangeEvent, type NativeSyntheticEvent, Platform, Pressable, ScrollView, type StyleProp, StyleSheet, Switch, Text, TextInput, type TextInputProps, type TextLayoutEventData, type TextProps, type TextStyle, useWindowDimensions, View, type ViewStyle } from 'react-native'
import { SafeAreaInsetsContext, SafeAreaView } from 'react-native-safe-area-context'
import { color, font, opacity, radius, size, space, useThemeColors } from '../design'
import { useBundledFontsLoaded } from '../design/FontProvider'
import { useI18n, type MessageKey } from '../i18n'
import { isCriticalSessionActive } from '../runtime'
import { controllerReviewRoute, isControllerRepairError, operationErrorKey, taskRetryKey, type TaskFailure, useTaskFeedback } from './feedback'
import { AppIcon, type IconName } from './icons'
import { KeyboardAvoidanceContext } from './keyboard-avoidance'

type Tone = 'body' | 'caption' | 'label' | 'title' | 'display' | 'time' | 'eyebrow'
export function AppText({ tone = 'body', muted, style, ...props }: TextProps & { tone?: Tone; muted?: boolean }) {
  const { isRTL, locale } = useI18n()
  const bundledFontsLoaded = useBundledFontsLoaded()
  const directionNeutral = tone === 'time'
  const bold = tone === 'title' || tone === 'display'
  const strong = tone === 'label' || tone === 'eyebrow'
  const family = locale === 'ar' ? font.family.bodyFallback : isRTL
    ? bold ? font.family.bodyHebrewBold : strong ? font.family.bodyHebrewStrong : font.family.bodyHebrew
    : bold ? font.family.bodyLatinBold : strong ? font.family.bodyLatinStrong : font.family.bodyLatin
  const fallbackFamily = directionNeutral || StyleSheet.flatten(style)?.fontFamily === font.family.mono ? font.family.monoFallback : font.family.bodyFallback
  const fallbackWeight = fallbackFamily === font.family.monoFallback ? font.weight.regular : bold ? font.weight.bold : strong ? font.weight.semibold : font.weight.regular
  // Fixed line-height spans prevent Android's autosizing from converging at
  // large text sizes. Let fitted text use the resized font's natural metrics.
  const composed = [styles.text, textTones[tone], isRTL && !directionNeutral && styles.rtlText, !directionNeutral && { fontFamily: family, fontWeight: locale === 'ar' ? bold ? font.weight.bold : strong ? font.weight.semibold : font.weight.regular : font.weight.regular }, directionNeutral && styles.directionNeutral, muted && styles.muted, style, !bundledFontsLoaded && { fontFamily: fallbackFamily, fontWeight: fallbackWeight }, props.adjustsFontSizeToFit && { lineHeight: undefined }]
  const fit = useFitFloor(props, composed)
  return <>{<Text {...props} {...fit.textProps} allowFontScaling style={[composed, fit.floorStyle]} />}{fit.probe}</>
}

const fitFloorDefault = 0.72
const plainText = (children: ReactNode): string | null => {
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children) && children.every((child) => typeof child === 'string' || typeof child === 'number' || child === null || child === false)) return children.filter((child) => typeof child === 'string' || typeof child === 'number').join('')
  return null
}
/**
 * React Native's New Architecture ignores `minimumFontScale`: both iOS and Android
 * fit down to a 4-pt floor, so a long cue name could become unreadable on stage.
 * An invisible probe measures the label at full size in the same width; when
 * fitting would fall below the floor, the label renders at the floor size and
 * ellipsizes instead. The probe never takes layout space or assistive focus, and
 * nothing is measured until the visible text has reported its own width.
 */
function useFitFloor(props: TextProps, composed: StyleProp<TextStyle>) {
  const content = props.adjustsFontSizeToFit ? plainText(props.children) : null
  const [width, setWidth] = useState(0)
  const [floored, setFloored] = useState<string | null>(null)
  if (content === null || content.length === 0) return { textProps: {}, floorStyle: undefined, probe: null }
  const floor = Math.min(1, Math.max(0.1, props.minimumFontScale ?? fitFloorDefault))
  const key = `${width}\u0000${content}`
  const belowFloor = floored === key
  const lines = Math.max(1, props.numberOfLines ?? 1)
  const textProps: Partial<TextProps> = {
    onLayout: (event) => { props.onLayout?.(event); const next = Math.round(event.nativeEvent.layout.width); if (Number.isFinite(next) && next > 0) setWidth((current) => current === next ? current : next) },
    ...(belowFloor ? { adjustsFontSizeToFit: false, ellipsizeMode: 'tail' as const } : {}),
  }
  const fontSize = (StyleSheet.flatten(composed) as TextStyle | undefined)?.fontSize ?? font.size.body
  const probe = width > 0 ? <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.fitProbe, { width }]}><Text testID="fit-floor-probe" allowFontScaling maxFontSizeMultiplier={props.maxFontSizeMultiplier} style={[composed, styles.fitProbeText]} onTextLayout={(event) => {
    const total = event.nativeEvent.lines.reduce((sum, line) => sum + (Number.isFinite(line.width) ? line.width : 0), 0)
    // Word wrapping wastes some of each extra line, so multi-line capacity is discounted.
    const capacity = width * lines * (lines > 1 ? 0.9 : 1)
    const next = total > 0 && capacity / total < floor ? key : null
    setFloored((current) => current === next ? current : next)
  }}>{content}</Text></View> : null
  return { textProps, floorStyle: belowFloor ? { fontSize: fontSize * floor } : undefined, probe }
}

export function Surface({ children, raised, style }: PropsWithChildren<{ raised?: boolean; style?: ViewStyle }>) {
  const colors = useThemeColors()
  return <View style={[styles.surface, raised && styles.raised, { backgroundColor: raised ? colors.surfaceRaised : colors.surface }, style]}>{children}</View>
}

export function SectionCard({ title, caption, children, icon }: PropsWithChildren<{ title: string; caption?: string; icon?: IconName }>) {
  const colors = useThemeColors()
  return <Surface style={{ borderRadius: radius.xl }}><View style={[styles.cardHeading, { borderColor: colors.borderSubtle }]}>{icon ? <View style={[styles.headingIcon, { backgroundColor: colors.accentSurface }]}><AppIcon name={icon} tint={colors.accent} /></View> : null}<View style={uiStyles.grow}><AppText accessibilityRole="header" tone="label">{title}</AppText>{caption ? <AppText tone="caption" muted>{caption}</AppText> : null}</View></View>{children}</Surface>
}
export function CoverTile({ title, uri, small = false, large = false, poster = false, hero = false }: { title: string; uri?: string | undefined; small?: boolean; large?: boolean; poster?: boolean; hero?: boolean }) {
  const colors = useThemeColors()
  const [failedUri, setFailedUri] = useState<string | undefined>()
  const initials = [...title.trim()].filter((letter) => /[\p{L}\p{N}]/u.test(letter)).slice(0, 2).join('').toLocaleUpperCase() || '♪'
  const seed = [...title].reduce((value, character) => (value + character.codePointAt(0)!) % 997, 0)
  const palettes = [[colors.accentSurface, colors.accent, colors.purpleAccent], [colors.purpleAccentSurface, colors.purpleAccent, colors.tagOrange], [colors.successSurface, colors.success, colors.accent], [colors.warningSurface, colors.tagOrange, colors.warning]] as const
  const palette = palettes[seed % palettes.length]!
  const extent = poster ? size.coverPoster : hero ? size.coverHero : large ? size.goCompact : small ? size.control : size.controlLarge
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.coverTile, { width: extent, height: extent, backgroundColor: palette[0] }]}>{uri && uri !== failedUri ? <Image source={{ uri }} style={styles.coverImage} onError={() => setFailedUri(uri)} /> : <><View style={{ position: 'absolute', width: extent * 1.5, height: extent * 1.5, borderRadius: extent, borderWidth: extent / 5, borderColor: palette[1], top: -extent / 2, left: extent / 4 }} /><View style={{ position: 'absolute', width: extent, height: extent, borderRadius: seed % 2 ? extent : radius.sm, borderWidth: extent / 8, borderColor: palette[2], bottom: -extent / 3, left: -extent / 3, transform: [{ rotate: '-35deg' }] }} /><View style={{ position: 'absolute', width: extent / 2, height: extent / 2, borderRadius: extent, backgroundColor: colors.canvas, top: extent / 4, left: extent / 4, borderWidth: extent / 24, borderColor: palette[0] }} /><View style={{ position: 'absolute', width: extent / 12, height: extent / 12, borderRadius: extent, backgroundColor: palette[1], top: extent * 11 / 24, left: extent * 11 / 24 }} />{poster || hero || large ? <View style={[styles.coverMonogram, { backgroundColor: palette[0] }]}><AppText tone="caption" style={{ color: colors.text }}>{initials}</AppText></View> : null}</>}</View>
}
/** Visible keyboard/switch focus without changing layout (outline is drawn outside the box). */
export function useFocusRing() {
  const [focused, setFocused] = useState(false)
  return { focused, focusHandlers: { onFocus: () => setFocused(true), onBlur: () => setFocused(false) } }
}
export function TaskRow({ label, body, glyph = '›', onPress, disabled = false }: { label: string; body?: string; glyph?: string; onPress: () => void; disabled?: boolean }) {
  const colors = useThemeColors(); const { isRTL } = useI18n(); const { focused, focusHandlers } = useFocusRing()
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={body} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} {...focusHandlers} style={({ pressed }) => [styles.taskRow, pressed && { backgroundColor: colors.surfacePressed }, focused && styles.focused, disabled && styles.disabled]}><View style={uiStyles.grow}><AppText tone="label">{label}</AppText>{body ? <AppText tone="caption" muted>{body}</AppText> : null}</View>{glyph === '›' ? <AppIcon name="chevron" rtl={isRTL} /> : <AppText tone="title" style={{ color: colors.accent }}>{glyph}</AppText>}</Pressable>
}
export function Disclosure({ title, children, initiallyOpen = false, summary, leading }: PropsWithChildren<{ title: string; initiallyOpen?: boolean; summary?: string; leading?: ReactNode }>) {
  const [open, setOpen] = useState(initiallyOpen)
  const colors = useThemeColors(); const { focused, focusHandlers } = useFocusRing()
  return <View style={uiStyles.gap}><Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} {...focusHandlers} style={({ pressed }) => [styles.disclosure, { backgroundColor: pressed ? colors.surfacePressed : colors.surface, borderColor: open ? colors.border : colors.borderSubtle }, focused && styles.focused]}>{leading}<View style={uiStyles.grow}><AppText tone="label">{title}</AppText>{!open && summary ? <AppText tone="caption" muted>{summary}</AppText> : null}</View><AppIcon name={open ? 'minus' : 'plus'} tint={colors.textSubtle} /></Pressable>{open ? children : null}</View>
}
// A line may legitimately end at whitespace or a break-friendly mark; anything else split a word.
const breakFriendlyEnd = /[\s­\-‐-—/·]$/u
export const splitsWord = (lines: readonly { text: string }[]) => lines.length > 1 && lines.slice(0, -1).some((line) => !breakFriendlyEnd.test(line.text))
/**
 * Stack a horizontal group once any of its labels would break mid-word at the
 * current width (for example German compounds in three equal segments). The
 * decision is keyed to the labels and width, so rotating wider or changing
 * language re-measures instead of staying stacked forever.
 */
export function useWordBreakFallback(signature: string, enabled = true) {
  const [width, setWidth] = useState(0)
  const [brokenAt, setBrokenAt] = useState<{ signature: string; width: number } | null>(null)
  const broken = enabled && brokenAt !== null && brokenAt.signature === signature && (brokenAt.width === 0 || width <= brokenAt.width)
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width); if (!Number.isFinite(next) || next <= 0) return
    setWidth(next); setBrokenAt((current) => current && current.width === 0 ? { ...current, width: next } : current)
  }, [])
  const onTextLayout = (event: NativeSyntheticEvent<TextLayoutEventData>) => { if (enabled && !broken && splitsWord(event.nativeEvent.lines)) setBrokenAt({ signature, width }) }
  return { broken, onLayout, onTextLayout }
}

export function Segments<T extends string>({ options, selected, onChange, disabled = false, keepInline = false }: { options: readonly { value: T; label: string }[]; selected: T; onChange: (value: T) => void; disabled?: boolean; keepInline?: boolean }) {
  const colors = useThemeColors()
  const viewport = useWindowDimensions()
  const fallback = useWordBreakFallback(options.map((option) => option.label).join('\u0000'), !keepInline)
  const stacked = !keepInline && (viewport.fontScale > font.scale.stageMax || fallback.broken)
  return <View onLayout={fallback.onLayout} style={[styles.segments, stacked && styles.segmentsStacked, { backgroundColor: colors.canvas, borderColor: colors.borderSubtle }]}>{options.map((option) => <Segment key={option.value} label={option.label} selected={selected === option.value} disabled={disabled} stacked={stacked} onPress={() => onChange(option.value)} {...(stacked ? {} : { onTextLayout: fallback.onTextLayout })} />)}</View>
}

function Segment({ label, selected, disabled, stacked, onPress, onTextLayout }: { label: string; selected: boolean; disabled: boolean; stacked: boolean; onPress: () => void; onTextLayout?: TextProps['onTextLayout'] }) {
  const colors = useThemeColors(); const [focused, setFocused] = useState(false)
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.segment, stacked && styles.segmentStacked, { backgroundColor: pressed ? colors.surfacePressed : selected ? colors.accentSurface : colors.transparent, borderColor: focused ? colors.accent : selected ? colors.border : colors.transparent }, disabled && styles.disabled]}><AppText tone="caption" onTextLayout={onTextLayout} style={[styles.segmentLabel, { color: selected ? colors.accent : colors.textMuted }]}>{label}</AppText></Pressable>
}

export function IconButton({ label, icon, onPress, disabled = false, selected = false, emphasis = false }: { label: string; icon: IconName; onPress: () => void; disabled?: boolean; selected?: boolean; emphasis?: boolean }) {
  const colors = useThemeColors(); const { isRTL } = useI18n()
  const [focused, setFocused] = useState(false)
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.iconButton, (selected || emphasis) && { backgroundColor: colors.accentSurface }, pressed && { backgroundColor: colors.surfacePressed }, focused && styles.focused, disabled && styles.disabled]}><AppIcon name={icon} rtl={isRTL} tint={selected || emphasis ? colors.accent : colors.textMuted} /></Pressable>
}
export function ChoiceChip({ label, selected, onPress, disabled = false }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  const colors = useThemeColors(); const { focused, focusHandlers } = useFocusRing()
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} {...focusHandlers} style={({ pressed }) => [styles.choiceChip, { backgroundColor: selected ? colors.accentSurface : colors.surfaceRaised, borderColor: selected ? colors.accent : colors.borderSubtle }, pressed && { backgroundColor: colors.surfacePressed }, focused && styles.focused, disabled && styles.disabled]}>{selected ? <AppIcon name="check" tint={colors.accent} /> : null}<AppText tone="caption" style={{ color: selected ? colors.accent : colors.textMuted, flexShrink: 1 }}>{label}</AppText></Pressable>
}
export function StatusBanner({ title, body, tone = 'neutral', children, loading = false }: PropsWithChildren<{ title: string; body?: string; tone?: 'neutral' | 'warning' | 'success'; loading?: boolean }>) {
  const colors = useThemeColors()
  const ink = tone === 'warning' ? colors.warning : tone === 'success' ? colors.success : colors.accent
  // The glyph, not color alone, carries the tone; the toned edge separates warnings from ordinary cards.
  return <Surface style={{ backgroundColor: tone === 'warning' ? colors.warningSurface : tone === 'success' ? colors.successSurface : colors.surface, borderColor: tone === 'neutral' ? colors.borderSubtle : ink }}><View style={[uiStyles.row, styles.bannerRow]}><View style={[styles.bannerMark, { borderColor: ink }]}>{loading ? <ActivityIndicator size="small" color={ink} /> : tone === 'neutral' ? <View style={[styles.bannerDot, { backgroundColor: ink }]} /> : <AppText tone="eyebrow" maxFontSizeMultiplier={font.scale.stageMax} style={[styles.bannerGlyph, { color: ink }]}>{tone === 'warning' ? '!' : '✓'}</AppText>}</View><View style={uiStyles.grow}><AppText tone="label" accessibilityLiveRegion="polite">{title}</AppText>{body ? <AppText tone="caption" muted>{body}</AppText> : null}</View></View>{children}</Surface>
}
export function WorkflowStep({ number, title, detail, complete = false }: { number: number; title: string; detail?: string; complete?: boolean }) {
  const colors = useThemeColors()
  return <View style={styles.taskRow}><View style={[styles.stepNumber, { backgroundColor: complete ? colors.successSurface : colors.accentSurface }]}><AppText tone="label" style={{ color: complete ? colors.success : colors.accent }}>{complete ? '✓' : number}</AppText></View><View style={uiStyles.grow}><AppText tone="label">{title}</AppText>{detail ? <AppText tone="caption" muted>{detail}</AppText> : null}</View></View>
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'go' | 'ghost'
type AsyncState = 'idle' | 'loading' | 'error' | 'confirmed'
export function Button({ label, onPress, onLongPress, onAccessibilityActivate, variant = 'secondary', disabled, state = 'idle', accessibilityHint, accessibilityLabel, stageSafe = false, compact = false, dimmed = false }:
  { label: string; onPress?: (() => void) | undefined; onLongPress?: (() => void) | undefined; onAccessibilityActivate?: (() => void) | undefined; variant?: ButtonVariant; disabled?: boolean; state?: AsyncState; accessibilityHint?: string | undefined; accessibilityLabel?: string; stageSafe?: boolean; compact?: boolean; dimmed?: boolean }) {
  const [focused, setFocused] = useState(false)
  const colors = useThemeColors()
  const visibleLabel = state === 'loading' ? `${label}…` : state === 'confirmed' ? `✓ ${label}` : state === 'error' ? `⚠ ${label}` : label
  const split = variant === 'go' ? visibleLabel.indexOf(' · ') : -1
  // Only error/confirmed replace the fill; loading keeps the variant's own ink so
  // a busy primary or near-white GO label stays legible instead of white-on-white.
  const stateFill = state === 'error' || state === 'confirmed'
  return <Pressable
    accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={accessibilityHint}
    accessibilityState={{ disabled: Boolean(disabled || state === 'loading'), busy: state === 'loading', selected: state === 'confirmed' }} disabled={disabled || state === 'loading'}
    accessibilityActions={onLongPress ? [{ name: 'activate', label: accessibilityHint ?? label }] : undefined}
    onAccessibilityAction={onLongPress ? (event) => { if (!disabled && state !== 'loading' && event.nativeEvent.actionName === 'activate') (onAccessibilityActivate ?? onLongPress)() } : undefined}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={onPress} onLongPress={onLongPress}
    style={({ pressed }) => [styles.button, buttonVariants[variant], variant === 'primary' && { backgroundColor: colors.accent, borderColor: colors.accent }, variant === 'secondary' && { backgroundColor: colors.surfaceRaised }, stageSafe && styles.stageSafe, compact && stageSafe && { height: size.control, paddingVertical: space.xxs, paddingHorizontal: space.xs }, compact && variant === 'go' && { minHeight: size.goCompact, height: size.goCompact }, dimmed && styles.dimmed, pressed && (dimmed ? styles.dimmedPressed : variant === 'go' ? styles.goPressed : styles.pressed), focused && styles.focused, (disabled || state === 'loading') && styles.disabled, state === 'error' && styles.error, state === 'confirmed' && styles.confirmed]}
  ><AppText tone={variant === 'go' ? 'display' : 'label'} maxFontSizeMultiplier={variant === 'go' ? font.scale.goMax : stageSafe ? font.scale.stageMax : undefined} numberOfLines={variant === 'go' ? 2 : stageSafe ? 1 : undefined} adjustsFontSizeToFit={variant === 'go' || stageSafe} minimumFontScale={0.72} style={[styles.buttonLabel, variant === 'go' && styles.goInk, variant === 'primary' && styles.primaryInk, variant === 'danger' && styles.dangerText, stateFill && styles.stateInk, dimmed && styles.dimmedInk]}>{split >= 0 ? visibleLabel.slice(0, split) : visibleLabel}</AppText>{split >= 0 ? <AppText tone="label" maxFontSizeMultiplier={font.scale.goCueMax} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.buttonLabel, styles.goInk, stateFill && styles.stateInk, dimmed && styles.dimmedInk]}>{visibleLabel.slice(split + 3)}</AppText> : null}</Pressable>
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'success' | 'warning' }) {
  const colors = useThemeColors()
  return <View style={[styles.badge, badgeTones[tone], (tone === 'accent' || tone === 'neutral') && { backgroundColor: tone === 'accent' ? colors.accentSurface : colors.surfaceRaised }]}><AppText tone="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={tone === 'neutral' ? undefined : styles.badgeInk}>{label}</AppText></View>
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  // Past the chrome cap the display title needs the full width; the action drops below it.
  const { fontScale } = useWindowDimensions()
  const stacked = Boolean(action) && fontScale > font.scale.stageMax
  return <View style={styles.sectionHeader}><View style={stacked ? styles.sectionHeaderStacked : uiStyles.row}><AppText accessibilityRole="header" tone="display" style={stacked ? undefined : uiStyles.grow}>{title}</AppText>{action}</View>{subtitle ? <AppText tone="caption" muted>{subtitle}</AppText> : null}</View>
}

export function SwitchRow({ title, body, value, onValueChange, disabled }: { title: string; body?: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean }) {
  const colors = useThemeColors()
  // The whole row is a touch target (iOS draws a 31-pt switch at the top of a stretched frame);
  // the Switch keeps the single assistive element, and it claims its own touches, so it never toggles twice.
  return <Pressable accessible={false} focusable={false} disabled={disabled} onPress={() => onValueChange(!value)} style={styles.switchRow}><View style={styles.grow}><AppText tone="label">{title}</AppText>{body ? <AppText tone="caption" muted>{body}</AppText> : null}</View><View style={styles.switchSlot}><Switch accessibilityRole="switch" accessibilityLabel={title} accessibilityState={{ disabled: Boolean(disabled), checked: value }} value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ false: colors.border, true: colors.accentSurface }} thumbColor={value ? colors.accent : colors.textMuted} /></View></Pressable>
}

const nav: readonly { key: MessageKey; route: string; icon: IconName }[] = [
  { key: 'nav.library', route: '/', icon: 'library' }, { key: 'nav.builder', route: '/builder', icon: 'list' },
  { key: 'nav.rehearsal', route: '/rehearsal', icon: 'rehearse' }, { key: 'nav.run', route: '/preflight', icon: 'play' },
  { key: 'nav.more', route: '/more', icon: 'more' },
]

export function NavBar({ current, navigationRoute = current }: { current: string; navigationRoute?: string }) {
  const router = useRouter(); const { t } = useI18n(); const colors = useThemeColors()
  return <View style={[styles.nav, { backgroundColor: colors.surface }]}>{nav.map((item) => <Pressable key={item.route} accessibilityRole="button" accessibilityLabel={t(item.key)} accessibilityState={{ selected: current === item.route }} onPress={() => { if (navigationRoute !== item.route) router.dismissTo(item.route as never) }} style={({ pressed }) => [styles.navItem, pressed && { backgroundColor: colors.surfacePressed }]}><View style={[styles.navIcon, current === item.route && { backgroundColor: colors.accentSurface }]}><AppIcon name={item.icon} tint={current === item.route ? colors.accent : colors.textMuted} /></View><AppText tone="caption" maxFontSizeMultiplier={font.scale.stageMax} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: current === item.route ? colors.accent : colors.textMuted }}>{t(item.key)}</AppText></Pressable>)}</View>
}

export function AppShell({ children, current, scroll = true, footer, actionBar, hideNavigation = false, navigationRoute, allowCriticalKeyboard = false, hideActionBarWithKeyboard = false }: { children: ReactNode; current: string; scroll?: boolean; footer?: ReactNode; actionBar?: ReactNode; hideNavigation?: boolean; navigationRoute?: string; allowCriticalKeyboard?: boolean; hideActionBarWithKeyboard?: boolean }) {
  const { t, isRTL } = useI18n(); const router = useRouter()
  const colors = useThemeColors()
  const critical = isCriticalSessionActive()
  const viewport = useWindowDimensions(); const insets = useContext(SafeAreaInsetsContext)
  const [bottomHeight, setBottomHeight] = useState(0)
  const [workHeight, setWorkHeight] = useState<number | null>(null)
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible() === true)
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true))
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false))
    return () => { shown.remove(); hidden.remove() }
  }, [])
  // Recovery search deliberately admits the keyboard. Its entire workspace,
  // including Stop/Fade, must dock above it; other critical shells stay fixed.
  const avoidKeyboard = !critical || allowCriticalKeyboard
  useEffect(() => { if (critical && !allowCriticalKeyboard) Keyboard.dismiss() }, [allowCriticalKeyboard, critical])
  const usableHeight = Math.max(0, viewport.height - (insets?.top ?? 0) - (insets?.bottom ?? 0))
  const availableHeight = workHeight === null ? usableHeight : Math.min(usableHeight, workHeight)
  const feedbackHeight = Math.max(0, Math.min(availableHeight / 3, availableHeight - bottomHeight - space.md))
  const showBack = !hideNavigation && !critical && current === '/more' && navigationRoute && navigationRoute !== current
  const content = <View style={[styles.content, allowCriticalKeyboard && keyboardVisible && { paddingVertical: 0, gap: 0 }]}>{showBack ? <View style={uiStyles.row}><Button label={t('use.back')} variant="ghost" onPress={() => { if (router.canGoBack?.()) router.back(); else router.replace(current as never) }} /></View> : null}{children}</View>
  return <KeyboardAvoidanceContext.Provider value><SafeAreaView style={[styles.shell, { backgroundColor: colors.canvas, direction: isRTL ? 'rtl' : 'ltr' }]}>
    <KeyboardAvoidingView testID="app-keyboard-surface" enabled={avoidKeyboard} style={uiStyles.grow} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={allowCriticalKeyboard && Platform.OS === 'android' ? 0 : insets?.top ?? 0} onLayout={({ nativeEvent }) => { const height = nativeEvent.layout.height; if (Number.isFinite(height) && height >= 0) setWorkHeight(height) }}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">{content}</ScrollView> : content}
      {critical ? null : <FeedbackToast maxHeight={feedbackHeight} />}
      <View testID="app-bottom-section" style={styles.bottomSection} onLayout={({ nativeEvent }) => { const height = nativeEvent.layout.height; if (Number.isFinite(height) && height >= 0) setBottomHeight(height) }}>
        {footer}{actionBar && !(hideActionBarWithKeyboard && keyboardVisible) ? <View style={{ paddingHorizontal: space.md, paddingVertical: space.xs, gap: space.xxs, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle }}>{actionBar}</View> : null}
        {hideNavigation || critical || keyboardVisible ? null : <NavBar current={current} {...(navigationRoute ? { navigationRoute } : {})} />}
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView></KeyboardAvoidanceContext.Provider>
}

function FeedbackToast({ maxHeight }: { maxHeight: number }) {
  const { feedback, failure, dismiss, undo } = useTaskFeedback(); const { t } = useI18n(); const colors = useThemeColors()
  const visible = maxHeight > 0
  useEffect(() => { if (!feedback || failure || !visible) return undefined; const timer = setTimeout(dismiss, 10000); return () => clearTimeout(timer) }, [feedback, failure, dismiss, visible])
  const toastStyle = [styles.toast, { maxHeight, backgroundColor: colors.surfaceRaised, borderColor: failure ? colors.warning : colors.borderStrong }]
  if (!visible) return null
  if (failure) return <FailureNotice key={failure.detail} failure={failure} style={toastStyle} />
  if (!feedback) return null
  return <View testID="app-feedback-notice" style={toastStyle}><ScrollView style={styles.feedbackScroll} contentContainerStyle={styles.feedbackContent} keyboardShouldPersistTaps="handled"><View style={uiStyles.row}><AppText style={uiStyles.grow} accessibilityLiveRegion="polite">✓ {t(feedback.message)}</AppText><Pressable accessibilityRole="button" accessibilityLabel={t('common.dismiss')} onPress={dismiss} style={styles.toastDismiss}><AppText>×</AppText></Pressable></View>{feedback.undo ? <Button label={t('library.restoreRevision')} onPress={undo} /> : null}</ScrollView></View>
}

function FailureNotice({ failure, style }: { failure: TaskFailure; style: StyleProp<ViewStyle> }) {
  const { t } = useI18n(); const router = useRouter(); const [diagnostics, setDiagnostics] = useState(false)
return <View testID="app-feedback-notice" style={style}><ScrollView style={styles.feedbackScroll} contentContainerStyle={styles.feedbackContent} keyboardShouldPersistTaps="handled"><AppText tone="label" numberOfLines={1} adjustsFontSizeToFit accessibilityRole="header">{t('common.error')}</AppText><AppText accessibilityLiveRegion="assertive">{t(operationErrorKey(failure.detail))}</AppText>{diagnostics ? <AppText selectable tone="caption">{failure.detail}</AppText> : null}<View testID="app-feedback-actions" style={styles.noticeActions}><View style={styles.noticeAction}><Button stageSafe compact label={t(taskRetryKey(failure.detail))} disabled={failure.busy} onPress={() => { if (isControllerRepairError(failure.detail)) { failure.dismiss?.(); router.push(controllerReviewRoute); return }; if (/STALE_REVISION/.test(failure.detail)) { failure.dismiss?.(); router.push('/builder'); return }; failure.retry() }} /></View><View style={styles.noticeAction}><Button stageSafe compact label={t('common.diagnostics')} variant="ghost" onPress={() => setDiagnostics(!diagnostics)} /></View>{failure.dismiss ? <View style={styles.noticeAction}><Button stageSafe compact label={t('common.dismiss')} variant="ghost" onPress={failure.dismiss} /></View> : null}</View></ScrollView></View>
}

export function normalizeDecimalInput(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit.charCodeAt(0) >= 0x6f0 ? 0x6f0 : 0x660))).replace(/[,٫]/g, '.')
}
export function Field({ label, value, onChange, onSubmit, returnKeyType, secret = false, multiline = false, numeric = false, url = false, disabled = false, placeholder, helper, invalid = false, maxLength, hideLabel = false, disableFullscreenUI = false, compact = false }: { label: string; value: string; onChange: (value: string) => void; onSubmit?: () => void; returnKeyType?: TextInputProps['returnKeyType']; secret?: boolean; multiline?: boolean; numeric?: boolean; url?: boolean; disabled?: boolean; placeholder?: string; helper?: string; invalid?: boolean; maxLength?: number; hideLabel?: boolean; disableFullscreenUI?: boolean; compact?: boolean }) {
  const { isRTL, locale } = useI18n(); const colors = useThemeColors(); const neutral = numeric || secret || url
  const bundledFontsLoaded = useBundledFontsLoaded(); const { focused, focusHandlers } = useFocusRing()
  const family = !bundledFontsLoaded ? neutral ? font.family.monoFallback : font.family.bodyFallback : neutral ? font.family.mono : locale === 'ar' ? font.family.bodyFallback : isRTL ? font.family.bodyHebrew : font.family.bodyLatin
  return <View style={uiStyles.gap}>{hideLabel ? null : <AppText tone="label">{label}</AppText>}<TextInput accessibilityLabel={label} accessibilityHint={helper} {...focusHandlers} value={value} onChangeText={(text) => onChange(numeric ? normalizeDecimalInput(text) : text)} onSubmitEditing={() => { if (!disabled) onSubmit?.() }} returnKeyType={returnKeyType} disableFullscreenUI={disableFullscreenUI} editable={!disabled} secureTextEntry={secret} multiline={multiline} maxLength={maxLength} placeholder={placeholder} placeholderTextColor={colors.textSubtle} selectionColor={colors.accent} keyboardType={numeric ? 'decimal-pad' : url ? 'url' : 'default'} autoCapitalize={neutral ? 'none' : 'sentences'} autoCorrect={!neutral} style={[styles.field, compact && { minHeight: size.control, paddingVertical: space.xxs }, multiline && styles.multilineField, disabled && styles.disabled, { backgroundColor: colors.surfaceRaised, borderColor: invalid ? colors.danger : focused && !disabled ? colors.accent : colors.borderStrong, textAlign: isRTL && !neutral ? 'right' : 'left', writingDirection: isRTL && !neutral ? 'rtl' : 'ltr', fontFamily: family }]} />{helper ? <AppText tone="caption" style={invalid ? { color: colors.danger } : undefined} muted={!invalid}>{helper}</AppText> : null}</View>
}

/** Source-time slider; it never schedules playback or derives engine progress. */
export function ValueSlider({ label, value, min, max, step = 1, adjustmentStep, interactionRange, onChange, onPreview, peaks, continuous = false, disabled = false, formatValue, previewLabel, waveformRange }: { label: string; value: number; min: number; max: number; step?: number; adjustmentStep?: number; interactionRange?: { min: number; max: number }; onChange: (value: number) => void; onPreview?: (() => void) | undefined; peaks?: readonly number[] | undefined; continuous?: boolean; disabled?: boolean; formatValue?: (value: number) => string; previewLabel?: string; waveformRange?: { start: number; end: number } }) {
  const { t } = useI18n(); const colors = useThemeColors(); const [width, setWidth] = useState(0)
  const [dragValue, setDragValue] = useState<number | null>(null); const lastCommitRef = useRef<number | null>(null); const lastScrubRef = useRef(0); const latestValue = useRef(value); const touchOrigin = useRef<{ x: number; y: number } | null>(null); const cancelledTouch = useRef(false)
  // The waveform retains the entire source, while interactions stay inside its playable trim.
  const hasInteractionRange = interactionRange !== undefined
  const validRange = !hasInteractionRange || (Number.isFinite(interactionRange.min) && Number.isFinite(interactionRange.max) && interactionRange.min <= interactionRange.max)
  const interactionMin = hasInteractionRange && validRange ? Math.max(min, Math.min(max, interactionRange.min)) : min
  const interactionMax = hasInteractionRange && validRange ? Math.max(min, Math.min(max, interactionRange.max)) : max
  const interactionDisabled = disabled || (hasInteractionRange && (!validRange || interactionMax <= interactionMin))
  const clampInteraction = (next: number) => Math.max(interactionMin, Math.min(interactionMax, next))
  useEffect(() => { lastCommitRef.current = null; latestValue.current = hasInteractionRange ? Math.max(interactionMin, Math.min(interactionMax, value)) : value }, [value, hasInteractionRange, interactionMin, interactionMax])
  // toPrecision strips binary float noise (0.05 steps otherwise store 1.1500000000000001).
  const normalize = (next: number) => clampInteraction(Number((Math.round(next / step) * step).toPrecision(12)))
  const adjustment = adjustmentStep !== undefined && Number.isFinite(adjustmentStep) && adjustmentStep > 0 ? adjustmentStep : step
  const update = (next: number, isAdjustment = false) => { if (interactionDisabled || !Number.isFinite(next)) return; const normalized = normalize(next); if (lastCommitRef.current === normalized || (hasInteractionRange && isAdjustment && normalized === clampInteraction(latestValue.current))) return; lastCommitRef.current = normalized; latestValue.current = normalized; onChange(normalized) }
  const adjust = (direction: number) => update((hasInteractionRange ? clampInteraction(latestValue.current) : latestValue.current) + direction * adjustment, true)
  const location = (x: number) => min + x / Math.max(1, width) * (max - min)
  const displayed = hasInteractionRange ? clampInteraction(dragValue ?? value) : dragValue ?? value
  const spoken = formatValue?.(displayed) ?? String(Number(displayed.toFixed(3)))
  return <View style={[uiStyles.gap, interactionDisabled && styles.disabled]}><View style={[uiStyles.row, styles.sliderHeader]}><AppText tone="label" style={styles.sliderLabel}>{label}</AppText><View style={[styles.sliderValue, { backgroundColor: colors.accentSurface }]}><AppText tone="caption" maxFontSizeMultiplier={font.scale.stageMax} style={[styles.directionNeutral, { color: colors.accent }]}>{spoken}</AppText></View>{onPreview ? <IconButton label={previewLabel ?? t('common.preview') + ' · ' + label} icon="play" disabled={interactionDisabled} onPress={onPreview} /> : null}</View>
    <View style={[uiStyles.row, { direction: 'ltr' }]}><IconButton label={t('common.decrease') + ' · ' + label} icon="minus" disabled={interactionDisabled || displayed <= interactionMin} onPress={() => adjust(-1)} /><View style={uiStyles.grow}>
    <Pressable disabled={interactionDisabled} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityState={{ disabled: interactionDisabled }} accessibilityValue={{ min: interactionMin, max: interactionMax, now: displayed, text: spoken }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'increment') adjust(1); else if (event.nativeEvent.actionName === 'decrement') adjust(-1) }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} onTouchStart={(event) => { if (interactionDisabled) return; touchOrigin.current = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }; cancelledTouch.current = false; if (width > 0) setDragValue(normalize(location(event.nativeEvent.locationX))) }} onTouchMove={(event) => { const origin = touchOrigin.current; if (origin && Math.abs(event.nativeEvent.locationY - origin.y) > Math.abs(event.nativeEvent.locationX - origin.x) + 4) { cancelledTouch.current = true; setDragValue(null) }; if (interactionDisabled || width <= 0 || cancelledTouch.current) return; const next = location(event.nativeEvent.locationX); setDragValue(normalize(next)); if (continuous && performance.now() - lastScrubRef.current >= 100) { lastScrubRef.current = performance.now(); update(next) } }} onTouchCancel={() => { cancelledTouch.current = true; touchOrigin.current = null; setDragValue(null) }} onTouchEnd={(event) => { if (width > 0 && !cancelledTouch.current) update(location(event.nativeEvent.locationX)); setDragValue(null) }} onPress={(event) => { if (width > 0 && !cancelledTouch.current) update(location(event.nativeEvent.locationX)) }} style={[styles.slider, peaks?.length ? { backgroundColor: colors.canvas, borderColor: colors.borderSubtle, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, paddingVertical: space.sm } : undefined]}>
      {peaks?.length ? <View pointerEvents="none" style={styles.waveform}>{peaks.filter((_, index) => index % Math.max(1, Math.floor(peaks.length / size.go)) === 0).map((peak, index) => <View key={index} style={{ flex: 1, minHeight: space.xxs, height: `${Math.max(0, Math.min(1, peak)) * 100}%`, backgroundColor: colors.accent }} />)}<View style={{ position: 'absolute', left: `${max === min ? 0 : Math.max(0, Math.min(1, (displayed - min) / (max - min))) * 100}%`, top: 0, bottom: 0, width: space.xxs, backgroundColor: colors.text }} /></View> : <View pointerEvents="none"><Progress value={max === min ? 0 : (displayed - min) / (max - min)} /><View style={[styles.sliderThumb, { backgroundColor: colors.accent, left: `${max === min ? 0 : Math.max(0, Math.min(1, (displayed - min) / (max - min))) * 100}%` }]} /></View>}
      {waveformRange && max > min ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: `${Math.max(0, (waveformRange.start - min) / (max - min)) * 100}%`, width: `${Math.max(0, Math.min(1, (waveformRange.end - waveformRange.start) / (max - min))) * 100}%`, borderWidth: size.iconStroke, borderColor: colors.accent, borderRadius: radius.sm }} /> : null}
    </Pressable></View><IconButton label={t('common.increase') + ' · ' + label} icon="plus" disabled={interactionDisabled || displayed >= interactionMax} onPress={() => adjust(1)} /></View>
  </View>
}

export function Progress({ value, accessibilityText, direction }: { value: number | null; accessibilityText?: string; direction?: 'ltr' | 'rtl' }) {
  const colors = useThemeColors(); const { locale } = useI18n()
  const percent = useMemo(() => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }), [locale])
  const known = value !== null && Number.isFinite(value)
  const normalized = known ? Math.max(0, Math.min(1, value)) : 0
  // Android retains the old spoken description unless the new value includes
  // text too. Explicit text also clears a prior percentage when it is unknown.
  const accessibilityValue = known ? { min: 0, max: 100, now: Math.round(normalized * 100), text: percent.format(normalized) } : { text: accessibilityText ?? '' }
  return <View accessible accessibilityRole="progressbar" accessibilityValue={accessibilityValue} style={[styles.progressTrack, direction && { direction }]}><View style={[styles.progressValue, { flex: normalized, backgroundColor: colors.accent }]} /><View style={{ flex: 1 - normalized }} /></View>
}

// Outline sits outside layout, so keyboard/switch focus never shifts content or Run geometry.
const focusRing = { outlineColor: color.text, outlineStyle: 'solid', outlineWidth: size.iconStroke, outlineOffset: size.iconStroke } as const
export const uiStyles = StyleSheet.create({
  focusRing,
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  grow: { flex: 1 },
  gap: { gap: space.md },
  largeGap: { gap: space.lg },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.border },
})

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: color.canvas },
  field: { minHeight: size.controlLarge, borderColor: color.borderStrong, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.md, color: color.text, fontSize: font.size.body },
  multilineField: { minHeight: size.control * 2, textAlignVertical: 'top' },
  coverTile: { borderRadius: radius.lg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  coverMonogram: { position: 'absolute', bottom: space.xs, start: space.xs, paddingHorizontal: space.xs, paddingVertical: space.xxs, borderRadius: radius.sm },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: space.sm, marginBottom: space.xxs },
  headingIcon: { width: size.control, height: size.control, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  coverImage: { width: '100%', height: '100%' },
  taskRow: { minHeight: size.controlLarge, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs, borderRadius: radius.md },
  disclosure: { minHeight: size.controlLarge, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  segments: { flexDirection: 'row', padding: space.xxs, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, gap: space.xxs },
  segmentsStacked: { flexDirection: 'column' },
  segment: { flex: 1, minWidth: 0, minHeight: size.control, borderRadius: radius.md, borderWidth: size.iconStroke, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xs, paddingVertical: space.xs },
  segmentStacked: { flex: 0, alignSelf: 'stretch' },
  segmentLabel: { width: '100%', alignSelf: 'stretch', textAlign: 'center', lineHeight: undefined },
  iconButton: { minWidth: size.control, minHeight: size.control, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  choiceChip: { minHeight: size.control, minWidth: size.control, paddingHorizontal: space.sm, paddingVertical: space.xs, flexDirection: 'row', alignItems: 'center', gap: space.xxs, borderRadius: radius.round, borderWidth: StyleSheet.hairlineWidth, maxWidth: '100%' },
  // Natural height (an empty frame yields no iOS lines); absolute, so siblings and gaps are unaffected.
  fitProbe: { position: 'absolute', top: 0, start: 0, opacity: 0 },
  fitProbeText: { flex: 0, flexGrow: 0, flexShrink: 0, width: '100%', height: undefined, minHeight: undefined, maxHeight: undefined, margin: 0 },
  bannerRow: { alignItems: 'flex-start' },
  bannerMark: { width: space.xl, height: space.xl, borderRadius: radius.round, borderWidth: size.iconStroke, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bannerDot: { width: space.xs, height: space.xs, borderRadius: radius.round },
  bannerGlyph: { textAlign: 'center', lineHeight: undefined },
  stepNumber: { width: size.control, height: size.control, borderRadius: radius.round, alignItems: 'center', justifyContent: 'center' },
  bottomSection: { flexShrink: 0 },
  toast: { flexShrink: 0, minHeight: 0, marginHorizontal: space.md, marginBottom: space.xs, paddingHorizontal: space.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg },
  feedbackScroll: { flexGrow: 0, flexShrink: 1 },
  feedbackContent: { paddingVertical: space.xs, gap: space.xs },
  toastDismiss: { width: size.control, height: size.control, alignItems: 'center', justifyContent: 'center' },
  // Content-sized basis: actions share one line when their labels fit and wrap
  // (then stretch) when a long translation would otherwise truncate.
  noticeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  noticeAction: { flexGrow: 1, flexShrink: 1, minWidth: size.control },
  slider: { minHeight: size.control, justifyContent: 'center', direction: 'ltr' },
  // The label keeps a readable basis; the value chip and preview wrap below it instead of crushing it.
  sliderHeader: { flexWrap: 'wrap' },
  sliderLabel: { flexGrow: 1, flexShrink: 1, flexBasis: size.goCompact },
  sliderValue: { borderRadius: radius.sm, paddingHorizontal: space.xs, paddingVertical: space.xxs },
  sliderThumb: { position: 'absolute', top: -space.xxs, width: space.md, height: space.md, borderRadius: radius.round, transform: [{ translateX: -space.xs }] },
  waveform: { height: size.control, flexDirection: 'row', alignItems: 'center', gap: StyleSheet.hairlineWidth },
  scroll: { flexGrow: 1 },
  content: { width: '100%', maxWidth: size.contentMax, alignSelf: 'center', flex: 1, padding: space.md, gap: space.lg },
  text: { color: color.text, fontFamily: font.family.bodyLatin, fontSize: font.size.body, lineHeight: font.lineHeight.body },
  // Keep physical text alignment independent of the mirrored Yoga parent.
  rtlText: { fontFamily: font.family.bodyHebrew, direction: 'ltr', textAlign: 'right', writingDirection: 'rtl' },
  directionNeutral: { fontFamily: font.family.mono, textAlign: 'left', writingDirection: 'ltr' },
  muted: { color: color.textMuted },
  surface: { backgroundColor: color.surface, borderColor: color.borderSubtle, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  raised: { backgroundColor: color.surfaceRaised, borderColor: color.border },
  button: { minWidth: size.control, minHeight: size.control, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: color.border },
  buttonLabel: { textAlign: 'center' },
  pressed: { transform: [{ translateY: 1 }] },
  focused: focusRing,
  disabled: { opacity: opacity.disabled },
  error: { borderColor: color.danger, backgroundColor: color.dangerSurface },
  confirmed: { borderColor: color.success, backgroundColor: color.successSurface },
  primary: { backgroundColor: color.accent, borderColor: color.accent },
  secondary: { backgroundColor: color.surfaceRaised },
  danger: { backgroundColor: color.transparent, borderColor: color.danger },
  ghost: { backgroundColor: color.transparent, borderColor: color.transparent },
  go: { minHeight: size.go, height: size.go, backgroundColor: color.go, borderColor: color.go, borderRadius: radius.lg },
  stageSafe: { height: size.controlLarge, paddingHorizontal: space.xs, borderWidth: size.iconStroke },
  // Stage Blackout: same box and position, low-light fill and ink (no geometry change).
  dimmed: { backgroundColor: color.blackout, borderColor: color.borderSubtle },
  dimmedInk: { color: color.textSubtle },
  // Guard can be unlocked while blackout stays on; a press must not flash the bright GO fill on stage.
  dimmedPressed: { backgroundColor: color.surface, transform: [{ translateY: 1 }] },
  goPressed: { backgroundColor: color.goPressed, transform: [{ translateY: 1 }] },
  goInk: { color: color.goInk },
  primaryInk: { color: color.accentInk },
  dangerText: { color: color.danger },
  stateInk: { color: color.text },
  badge: { minHeight: space.xl, maxWidth: '100%', borderRadius: radius.round, paddingHorizontal: space.sm, justifyContent: 'center', alignSelf: 'flex-start', backgroundColor: color.surfaceRaised },
  badgeInk: { color: color.text },
  neutral: { backgroundColor: color.surfaceRaised },
  accent: { backgroundColor: color.accentSurface },
  success: { backgroundColor: color.successSurface },
  warning: { backgroundColor: color.warningSurface },
  sectionHeader: { gap: space.xs, paddingTop: space.sm },
  sectionHeaderStacked: { gap: space.xs, alignItems: 'flex-start' },
  switchRow: { minHeight: size.controlLarge, flexDirection: 'row', alignItems: 'center', gap: space.md },
  switchSlot: { minWidth: size.control, minHeight: size.control, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowReverse: { flexDirection: 'row-reverse' },
  grow: { flex: 1 },
  nav: { minHeight: size.nav, flexDirection: 'row', backgroundColor: color.surface, borderColor: color.borderSubtle, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.xl, marginHorizontal: space.md, marginBottom: space.xs, paddingHorizontal: space.xxs, paddingVertical: space.xs },
  navItem: { minWidth: size.control, flex: 1, minHeight: size.controlLarge, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, paddingHorizontal: space.xxs, gap: space.xxs },
  navIcon: { minWidth: size.control, height: space.xl, borderRadius: radius.round, alignItems: 'center', justifyContent: 'center' },
  navActive: { backgroundColor: color.accentSurface },
  accentText: { color: color.accent },
  progressTrack: { height: space.xs, borderRadius: radius.round, backgroundColor: color.surfacePressed, overflow: 'hidden', flexDirection: 'row' },
  progressValue: { backgroundColor: color.accent, borderRadius: radius.round },
})

const textTones = StyleSheet.create({
  body: {}, caption: { fontSize: font.size.caption, lineHeight: font.lineHeight.caption }, eyebrow: { fontSize: font.size.caption, lineHeight: font.lineHeight.caption }, label: { fontSize: font.size.label, lineHeight: font.lineHeight.label, fontWeight: font.weight.semibold },
  title: { fontSize: font.size.title, lineHeight: font.lineHeight.title, fontWeight: font.weight.bold }, display: { fontSize: font.size.display, lineHeight: font.lineHeight.display, fontWeight: font.weight.bold },
  time: { fontFamily: font.family.mono, fontSize: font.size.time, lineHeight: font.lineHeight.time, fontVariant: ['tabular-nums'] },
})
const buttonVariants = { primary: styles.primary, secondary: styles.secondary, danger: styles.danger, go: styles.go, ghost: styles.ghost }
const badgeTones = { neutral: styles.neutral, accent: styles.accent, success: styles.success, warning: styles.warning }
