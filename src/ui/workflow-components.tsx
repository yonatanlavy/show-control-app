import { type PropsWithChildren, type ReactNode, useRef, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { font, opacity, radius, size, space, useThemeColors } from '../design'
import { useI18n } from '../i18n'
import { AppIcon } from './icons'
import { AppText, Button, Field, IconButton, SectionCard, Surface, uiStyles, useFocusRing } from './primitives'
import type { IconName } from './icons'
import { isolateName } from './CueTitle'
import { useMounted } from './navigation'
import { checkedName, validLibraryName } from '../library/names'

export function CollectionRow({ title, subtitle, hint = subtitle, indicator = 'chevron', leading, children, action, label = title, onPress, disabled = false, selected = false, last = false }: PropsWithChildren<{ title: string; subtitle?: string | undefined; hint?: string | undefined; indicator?: 'chevron' | 'play'; leading?: ReactNode; action?: ReactNode; label?: string; onPress: () => void; disabled?: boolean; selected?: boolean; last?: boolean }>) {
  const colors = useThemeColors(); const { isRTL } = useI18n(); const { focused, focusHandlers } = useFocusRing()
  return <View style={[styles.collection, !last && { borderBottomColor: colors.borderSubtle, borderBottomWidth: StyleSheet.hairlineWidth }]}><Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} {...focusHandlers} style={({ pressed }) => [styles.collectionMain, selected && { backgroundColor: colors.surfaceRaised }, pressed && { backgroundColor: colors.surfacePressed }, focused && uiStyles.focusRing, disabled && { opacity: opacity.disabled }]}>{leading}<View style={uiStyles.grow}><AppText tone="label" numberOfLines={2}>{isolateName(title, isRTL)}</AppText>{subtitle ? <AppText tone="caption" muted numberOfLines={2}>{subtitle}</AppText> : null}{children}</View>{!action || selected ? <AppIcon name={selected ? 'check' : indicator} rtl={isRTL && indicator === 'chevron'} tint={selected ? colors.accent : colors.textSubtle} /> : null}</Pressable>{action}</View>
}

/** A titled card, or a plain card when hosted inside a Disclosure that already names it. */
export function PanelFrame({ hosted = false, title, icon, children }: PropsWithChildren<{ hosted?: boolean; title: string; icon?: IconName }>) {
  return hosted ? <Surface style={{ borderRadius: radius.xl }}>{children}</Surface> : <SectionCard title={title} {...(icon ? { icon } : {})}>{children}</SectionCard>
}

/** One native modal, bounded to the viewport. It never overlays an armed Run. */
export function WorkflowDialog({ title, children, onDismiss, dismissDisabled = false }: PropsWithChildren<{ title: string; onDismiss: () => void; dismissDisabled?: boolean }>) {
  const colors = useThemeColors(); const { t, isRTL } = useI18n(); const viewport = useWindowDimensions()
  const close = () => { if (!dismissDisabled) onDismiss() }
  return <Modal transparent animationType="none" onRequestClose={close} statusBarTranslucent><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modal, { backgroundColor: colors.overlay }]}><Pressable accessible={false} importantForAccessibility="no" disabled={dismissDisabled} onPress={close} style={StyleSheet.absoluteFill} /><SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.dialog, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, maxHeight: viewport.height - space.xxl, direction: isRTL ? 'rtl' : 'ltr' }]} accessibilityViewIsModal><View style={[uiStyles.row, styles.dialogHeader]}><AppText tone="title" accessibilityRole="header" accessibilityLabel={title} numberOfLines={2} maxFontSizeMultiplier={font.scale.stageMax} adjustsFontSizeToFit style={uiStyles.grow}>{title}</AppText><IconButton label={t('common.close')} icon="close" onPress={close} disabled={dismissDisabled} /></View><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.dialogContent}>{children}</ScrollView></SafeAreaView></KeyboardAvoidingView></Modal>
}

export function TextEntryForm({ initialValue, label, confirmLabel, placeholder, onConfirm, onCancel, onValueChange, multiline = false, allowEmpty = false, libraryName = false }: { initialValue: string; label: string; confirmLabel: string; placeholder?: string; onConfirm: (value: string) => Promise<boolean>; onCancel: () => void; onValueChange?: (value: string) => void; multiline?: boolean; allowEmpty?: boolean; libraryName?: boolean }) {
  const { t } = useI18n(); const mounted = useMounted(); const [value, setValue] = useState(initialValue); const [working, setWorking] = useState(false); const [failed, setFailed] = useState(false); const pending = useRef(false)
  const invalidName = libraryName && !validLibraryName(value)
  const submit = async () => {
    if (pending.current || invalidName || !allowEmpty && !value.trim()) return
    pending.current = true; setWorking(true); setFailed(false)
    try { const saved = await onConfirm(libraryName ? checkedName(value) : value.trim()); if (!saved && mounted.current) setFailed(true) }
    catch { if (mounted.current) setFailed(true) }
    finally { pending.current = false; if (mounted.current) setWorking(false) }
  }
  return <View style={uiStyles.gap}><Field label={label} value={value} onChange={(next) => { setValue(next); onValueChange?.(next) }} multiline={multiline} disabled={working} invalid={invalidName} {...(libraryName ? { helper: t('use.library.nameLimit'), maxLength: Math.max(1000, initialValue.length) } : { maxLength: multiline ? 8192 : 256 })} {...(placeholder ? { placeholder } : {})} />{failed ? <AppText accessibilityLiveRegion="polite">{t('common.errorHelp')}</AppText> : null}<Button label={confirmLabel} variant="primary" state={working ? 'loading' : 'idle'} disabled={working || invalidName || !allowEmpty && !value.trim()} onPress={() => { void submit() }} /><Button label={t('common.cancel')} variant="ghost" disabled={working} onPress={onCancel} /></View>
}

const styles = StyleSheet.create({
  collection: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  collectionMain: { flex: 1, minHeight: size.controlLarge + space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.xxs, borderRadius: radius.md },
  modal: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingTop: space.xxl },
  dialog: { width: '100%', maxWidth: size.contentMax, borderTopStartRadius: radius.xl, borderTopEndRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, flexShrink: 1 },
  dialogHeader: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md },
  dialogContent: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
})
