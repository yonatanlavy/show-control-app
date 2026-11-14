import { useRouter } from 'expo-router'
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BackHandler, FlatList, Keyboard, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { color, font, opacity, radius, size, space, themeColors, useThemeColors } from '../design'
import { useI18n, type MessageKey } from '../i18n'
import { useApp } from './AppProvider'
import { FloatingStopwatch } from './FloatingStopwatch'
import { SectionLabel, StudioMasthead, StudioWelcome, ToolGrid } from './studio-components'
import { useSessionStopwatch } from './SessionStopwatch'
import { compileRunSnapshot } from '../domain'
import { playbackReadout } from '../runtime/playback-readout'
import { canPauseResumeSession, hasOnlyIndependentVoices, type ShowSessionState } from '../runtime/show-session'
import { BackupPanel } from './BackupPanel'
import { BackgroundReliabilityPanel } from './BackgroundReliabilityPanel'
import { VoiceCapacity } from './VoiceCapacity'
import { CueTitle } from './CueTitle'
import { ControllerPreparationFallback, needsControllerPreparationFallback } from './ControllerPreparationFallback'
import { CollectionViewport } from './CollectionViewport'
import { CollectionRow } from './workflow-components'
import { CollectionSearch, collectionSearchMatches } from './CollectionSearch'
import { useMounted } from './navigation'
import { operationErrorKey, OperationStatus } from './library-screens'
import { ShowIdentityContext, useShowIdentities } from './ShowIdentityContext'
import { AppShell, AppText, Badge, Button, ChoiceChip, CoverTile, Disclosure, IconButton, Progress, SectionCard, SectionHeader, Segments, StatusBanner, Surface, TaskRow, uiStyles, useWordBreakFallback, ValueSlider, WorkflowStep } from './primitives'
export { LibraryScreen, BuilderScreen } from './library-screens'
export { ControllersScreen } from './controller-screen'

/** Remaining time rounds up so a cue with 400 ms left never reads 00:00 and a fresh 3:00 cue reads 03:00. */
export function formatTime(milliseconds: number | null, rounding: 'floor' | 'ceil' = 'floor') { if (milliseconds === null || !Number.isFinite(milliseconds)) return null; const seconds = Math.max(0, Math[rounding](milliseconds / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }
function useBlockLiveBack() { useEffect(() => { const subscription = BackHandler.addEventListener('hardwareBackPress', () => true); return () => subscription.remove() }, []) }
interface NonLiveScreenProps { readonly promotion?: ReactNode }
interface SettingsScreenProps extends NonLiveScreenProps { readonly commerceControls?: ReactNode }

function finishedRun(session: ShowSessionState): boolean {
  const snapshot = session.snapshot
  if (!snapshot?.cueOrder.length || session.nativeSessionPending || session.countdownRemainingMs > 0 || session.pendingCommandIds.length || session.nextCueId) return false
  // Empty selection alone can mean startup or recovery. The native exhausted
  // cursor distinguishes completion from Stop, which retains the OMS selection.
  return snapshot.transportMode === 'oms'
    ? session.phase === 'stopped' && !session.currentCueId && !session.selectedCueId && session.nextCueIndex === snapshot.cueOrder.length + 1
    : ['ready', 'stopped'].includes(session.phase) && session.activeVoiceCount === 0 && session.nextCueIndex === snapshot.cueOrder.length
}

function CueDeck({ compact = false, feedback, finished = false }: { compact?: boolean; feedback?: string | undefined; finished?: boolean }) {
  const { t } = useI18n(); const colors = useThemeColors(); const { show, set, cueIndex, currentCueId, nextCueId, session } = useApp()
  const runShow = session.snapshot; const names = runShow?.cues ?? show?.cues ?? {}
  const order = runShow?.cueOrder ?? set?.cueOrder ?? []; const ordinal = order.indexOf(currentCueId || session.selectedCueId || '') + 1
  const timing = playbackReadout(session); const known = timing.kind !== 'unknown'
  const position = timing.positionMs; const duration = timing.durationMs
  const cue = names[currentCueId] ?? names[session.selectedCueId]
  const elapsed = formatTime(timing.elapsedMs) ?? t('common.notMeasured'); const remaining = formatTime(timing.remainingMs, 'ceil') ?? t('common.notMeasured')
  const loop = cue?.type === 'audio' && cue.endBehavior === 'loop'
  const elapsedLabel = t(loop ? 'run.loopPosition' : 'run.elapsed'); const remainingLabel = t(loop ? 'run.loopRemaining' : 'run.remaining')
  const artworkId = cue?.type === 'audio' ? cue.artworkAssetId : undefined
  const artwork = artworkId ? (runShow?.visualAssets ?? show?.visualAssets)?.[artworkId] : undefined
  const title = finished ? t('common.complete') : cue?.name ?? t('common.ready')
  const nextName = names[nextCueId]?.name ?? t('common.complete')
  const displayedOrdinal = finished ? order.length : ordinal || Math.max(cueIndex + 1, 0)
  return <View style={[styles.readout, compact && styles.readoutCompact]}>
    <Surface raised style={{ ...styles.compactSurface, padding: compact ? space.xs : space.sm, gap: compact ? space.xxs : space.xs, flex: 1, minHeight: 0, justifyContent: 'space-between', borderColor: colors.accentSurface, borderRadius: radius.xl }}><View style={uiStyles.row}><CoverTile title={title} uri={artwork?.kind === 'image' ? artwork.localUri : undefined} small /><View style={uiStyles.grow}><View style={uiStyles.row}><AppText tone="eyebrow" maxFontSizeMultiplier={font.scale.stageMax} style={{ color: colors.accent }}>{t('run.now')}</AppText><AppText tone="caption" maxFontSizeMultiplier={font.scale.stageMax} muted numberOfLines={1} accessibilityLabel={`${displayedOrdinal} / ${order.length}`} style={styles.runOrdinal}>{`\u2066${displayedOrdinal} / ${order.length}\u2069`}</AppText>{runShow ? <VoiceCapacity active={session.activeVoiceCount} limit={runShow.voiceLimit} stageSafe style={uiStyles.grow} /> : null}</View><CueTitle name={title} compact style={styles.nowName} /></View></View>
      {/* Clocks follow the unmirrored progress bar: elapsed sits at its origin in every language. Compact
          clocks drop their captions, so they keep tabular mono digits and remaining carries a minus sign. */}
      <View style={styles.timeRow}><View accessible accessibilityLabel={elapsedLabel} accessibilityValue={{ text: elapsed }} style={uiStyles.grow}>{compact ? null : <AppText tone="caption" maxFontSizeMultiplier={font.scale.stageMax} numberOfLines={1} adjustsFontSizeToFit muted style={styles.clockCaption}>{elapsedLabel}</AppText>}<AppText tone="time" maxFontSizeMultiplier={font.scale.stageMax} numberOfLines={1} adjustsFontSizeToFit style={compact && styles.compactClock}>{known ? elapsed : '—'}</AppText></View><View accessible accessibilityLabel={remainingLabel} accessibilityValue={{ text: remaining }} style={uiStyles.grow}>{compact ? null : <AppText tone="caption" maxFontSizeMultiplier={font.scale.stageMax} numberOfLines={1} adjustsFontSizeToFit muted style={styles.clockCaption}>{remainingLabel}</AppText>}<AppText tone="time" maxFontSizeMultiplier={font.scale.stageMax} numberOfLines={1} adjustsFontSizeToFit style={compact && styles.compactClock}>{known ? compact ? `−${remaining}` : remaining : '—'}</AppText></View></View>
      <Progress value={position !== null && duration !== null ? position / duration : null} accessibilityText={t('common.notMeasured')} direction="ltr" />
    </Surface><Surface style={{ ...styles.compactSurface, borderRadius: radius.lg }}><View style={uiStyles.row}><AppText tone="eyebrow" maxFontSizeMultiplier={font.scale.stageMax} muted>{t('run.next')}</AppText><AppText tone={feedback ? 'caption' : 'label'} maxFontSizeMultiplier={font.scale.stageMax} numberOfLines={compact ? 2 : 1} adjustsFontSizeToFit accessibilityLabel={feedback ? `${t('run.next')}: ${nextName}. ${feedback}` : nextName} accessibilityLiveRegion={feedback ? 'polite' : 'none'} style={[styles.nextName, compact && styles.compactNextName, uiStyles.grow, feedback && { color: colors.warning }]}>{feedback ?? nextName}</AppText></View></Surface>
  </View>
}

export { RehearsalScreen } from './rehearsal-screen'
const requiredChecks = ['local', 'readable', 'order'] as const
const recommendedChecks = ['remote', 'output', 'battery', 'notifications', 'venue'] as const
const checkKey: Record<string, MessageKey> = { local: 'preflight.local', readable: 'preflight.readable', order: 'preflight.order', remote: 'preflight.remote', output: 'preflight.output', battery: 'preflight.battery', notifications: 'preflight.notifications', venue: 'preflight.venue' }
export function PreflightScreen({ promotion }: NonLiveScreenProps = {}) {
  const identities = useShowIdentities()
  const router = useRouter(); const mounted = useMounted(); const { t } = useI18n(); const { show, set, libraryState, checks, toggleCheck, session, armShow, busy } = useApp()
  const [diagnostics, setDiagnostics] = useState(false)
  const canPrepare = !!show && !!set?.cueOrder.length && requiredChecks.every((key) => checks[key]) && session.engineAvailable && session.phase !== 'preparing' && !busy
  const needsTouch = needsControllerPreparationFallback(show, set, libraryState.controllerProfiles)
  const canArm = canPrepare && !needsTouch
  const checksDisabled = busy || session.phase === 'preparing'
  const remaining = requiredChecks.filter((key) => !checks[key]).length
  // An observed result shown beside the operator's manual confirmations. It never gates Arm by
  // itself: arming compiles again and refuses on failure, so this only reports what Arm will find.
  const automatic = useMemo(() => {
    if (!show || !set?.cueOrder.length) return null
    // Mirror what preparation compiles: the touch fallback prepares without the saved remote
    // profile (AppProvider's touchShow), so its controller issues are not reported as refusals.
    const { controllerProfileId: _savedProfile, ...touchShow } = show
    try { return compileRunSnapshot(needsTouch ? touchShow : show, set.id, libraryState.controllerProfiles) } catch { return null }
  }, [libraryState.controllerProfiles, needsTouch, set, show])
  const armHelp = !set?.cueOrder.length ? t('edge.playlistEmpty') : !session.engineAvailable ? t('preflight.engineUnavailable') : remaining ? t('use.preflight.left', { count: remaining }) : needsTouch ? t('remote.touchTitle') : canArm ? t('use.preflight.ready') : t('common.loading')
  const renderCheck = (key: string) => <Pressable key={key} accessibilityRole="checkbox" accessibilityLabel={t(checkKey[key]!)} accessibilityState={{ checked: checks[key], disabled: checksDisabled }} disabled={checksDisabled} onPress={() => toggleCheck(key)} style={({ pressed }) => [styles.checkRow, pressed && styles.press, checksDisabled && { opacity: opacity.disabled }]}><AppText tone="label" style={checks[key] ? styles.successText : styles.warningText}>{checks[key] ? '✓' : '○'}</AppText><AppText style={uiStyles.grow}>{t(checkKey[key]!)}</AppText></Pressable>
  return <AppShell current="/preflight" footer={promotion} actionBar={<><AppText tone="caption" accessibilityLiveRegion="polite">{armHelp}</AppText><Button label={t('preflight.arm')} variant="go" disabled={!canArm} state={session.phase === 'preparing' ? 'loading' : 'idle'} accessibilityHint={armHelp} onPress={() => { void armShow().then((armed) => { if (armed && mounted.current) { router.dismissAll(); router.replace('/run') } }) }} /></>}>
    <SectionHeader title={t('preflight.title')} subtitle={t('preflight.demo')} /><Surface><AppText tone="label">{show?.name ?? t('common.empty')}</AppText><ShowIdentityContext identity={show ? identities.get(show.id) : undefined} /><AppText tone="caption" muted>{set?.name ?? t('preflight.resolve')}</AppText><Badge label={session.engineAvailable ? t('preflight.engine') : t('preflight.engineUnavailable')} tone={session.engineAvailable ? 'success' : 'warning'} /></Surface><OperationStatus />
    {session.phase === 'fault' ? <Surface><AppText>{t('common.errorHelp')}</AppText><Button label={t('common.diagnostics')} onPress={() => setDiagnostics(!diagnostics)} />{diagnostics ? <AppText selectable>{session.detail}</AppText> : null}</Surface> : null}
    <SectionCard icon="shield" title={t('preflight.required')} caption={t('preflight.checksDone', { done: requiredChecks.filter((key) => checks[key]).length, total: requiredChecks.length })}>{automatic ? <StatusBanner tone={automatic.ok ? 'success' : 'warning'} title={automatic.ok ? t('edge.preflight.autoPass') : t('edge.preflight.autoFail', { count: automatic.issues.length })}>{automatic.ok ? null : <Disclosure title={t('common.diagnostics')}><AppText selectable tone="caption">{automatic.issues.map((issue) => issue.message).join('\n')}</AppText></Disclosure>}</StatusBanner> : null}{requiredChecks.map(renderCheck)}</SectionCard>
    <ControllerPreparationFallback purpose="performance" disabled={!canPrepare} hint={armHelp} onPrepared={() => { if (mounted.current) { router.dismissAll(); router.replace('/run') } }} />
    <SectionCard icon="shield" title={t('use.audio.title')}><AppText tone="caption" muted>{t('use.audio.media')}</AppText><Disclosure title={t('preflight.notifications')}><AppText>{t('use.audio.dnd')}</AppText></Disclosure></SectionCard>
    <BackgroundReliabilityPanel />
    <Disclosure title={t('preflight.recommended')} summary={t('preflight.resolve')}><Surface>{recommendedChecks.map(renderCheck)}</Surface></Disclosure>
  </AppShell>
}

export function RunScreen() {
  useBlockLiveBack()
  const router = useRouter(); const { t, isRTL } = useI18n(); const colors = useThemeColors(); const viewport = useWindowDimensions(); const insets = useSafeAreaInsets()
  const landscape = viewport.width > viewport.height; const compact = landscape || viewport.height < size.contentMax + size.control
  const contentWidth = Math.min(viewport.width - insets.left - insets.right, size.contentMax)
  const contentHeight = viewport.height - insets.top - insets.bottom - (compact ? space.xs : space.md) * 2
  const wrappedFooter = landscape && contentHeight >= size.goCompact + size.control * 4 + space.xs * 4
  const paneWidth = (contentWidth - space.xs * 3) / 2
  const landscapePane = landscape ? { flex: 0, flexBasis: 'auto' as const, width: paneWidth, minWidth: paneWidth, maxWidth: paneWidth } : undefined
  const footerSlot = [uiStyles.grow, wrappedFooter ? styles.footerSlot : styles.footerSlotUnwrapped]
  const { session, error, touchGuard, blackout, setTouchGuard, setBlackout, go, panic, stopAll, pauseResume, voiceStatus, disarmVoice, runTask, triggerHit } = useApp(); const { visible: timer, setVisible: setTimer } = useSessionStopwatch(); const [hitsOpen, setHitsOpen] = useState(false)
  const recoveryRequired = ['interrupted', 'fault', 'unavailable'].includes(session.phase)
  const finished = finishedRun(session)
  const canGo = !finished && ['ready', 'running', 'paused', 'fading', 'stopped'].includes(session.phase) && session.pendingCommandIds.length === 0 && (session.snapshot?.transportMode !== 'oms' || session.phase === 'paused' || (session.phase !== 'fading' && !session.countdownRemainingMs))
  const names = session.snapshot?.cues ?? {}
  const goTarget = session.phase === 'paused' ? session.currentCueId || session.selectedCueId : session.snapshot?.transportMode === 'oms' && ['ready', 'stopped'].includes(session.phase) ? session.selectedCueId : session.nextCueId
  const actionLabel = session.phase === 'paused' ? t('run.resume') : session.phase === 'running' ? t('run.next') : t('run.go')
  const pausedCountdown = session.phase === 'paused' && session.countdownRemainingMs > 0
  const pausedWork = session.phase === 'paused' && session.activeVoiceCount === 0 && session.hasPendingActions === true
  const pausedHits = session.phase === 'paused' && hasOnlyIndependentVoices(session)
  const resumeDetail = pausedCountdown ? t('use.run.pausedDelay', { seconds: Math.ceil(session.countdownRemainingMs / 1000) }) : pausedWork ? t('run.scheduledActions') : pausedHits ? t('run.hits') : goTarget ? names[goTarget]?.name ?? goTarget : ''
  const goLabel = finished ? t('common.complete') : session.phase === 'paused' ? `${actionLabel}${resumeDetail ? ` · ${resumeDetail}` : ''}` : session.countdownRemainingMs > 0 ? t('run.countdown', { seconds: Math.ceil(session.countdownRemainingMs / 1000) }) : `${actionLabel}${goTarget ? ` · ${names[goTarget]?.name ?? goTarget}` : ''}`
  const actionHint = recoveryRequired ? t('run.playbackWarning') : touchGuard ? t('run.unlock') : error ? t(operationErrorKey(error)) : session.countdownRemainingMs > 0 ? t(session.phase === 'paused' ? 'use.run.pausedDelay' : 'run.countdown', { seconds: Math.ceil(session.countdownRemainingMs / 1000) }) : session.pendingCommandIds.length || session.phase === 'fading' ? t('use.run.wait') : session.phase === 'paused' ? t('use.run.resume') : finished ? t('use.run.finished') : session.phase === 'running' ? t('use.run.advance') : t('use.run.ready')
  // Blackout is a low-light stage, not just a darker canvas: GO and routine tools dim in place.
  // Panic, Guard and the blackout exit keep their normal treatment; recovery breaks blackout visibly.
  const dim = blackout && !recoveryRequired
  const compactFeedback = compact && (recoveryRequired || touchGuard || error || session.countdownRemainingMs > 0 || session.pendingCommandIds.length || session.phase === 'fading' || finished) ? actionHint : undefined
  return <SafeAreaView style={[styles.runShell, { backgroundColor: blackout ? color.blackout : colors.canvas, direction: isRTL ? 'rtl' : 'ltr' }]}><View style={[styles.runContent, { width: contentWidth }, compact && styles.compactRunContent, landscape && styles.landscapeRun]}>
    <View accessibilityElementsHidden={hitsOpen} importantForAccessibility={hitsOpen ? 'no-hide-descendants' : 'auto'} style={[styles.statusPane, { direction: isRTL ? 'rtl' : 'ltr' }, landscapePane]}><View style={styles.stageStatus}><View style={uiStyles.grow}><Badge label={finished ? t('common.complete') : t(`state.${session.phase}` as MessageKey)} tone={finished || canGo ? 'success' : 'warning'} /></View><View style={uiStyles.grow}><Badge label={t('run.remoteUnverified')} tone="warning" /></View><View style={uiStyles.grow}><Badge label={t('run.outputUnverified')} tone="warning" /></View></View>
      {blackout && !recoveryRequired ? <Surface style={{ ...styles.blackoutPanel, height: compact ? size.runReadoutCompact : size.runReadout }}><Badge label={t('run.blackoutOn')} tone="warning" /><AppText tone="title" numberOfLines={1} adjustsFontSizeToFit style={styles.blackoutTitle}>{names[session.currentCueId]?.name ?? t('common.ready')}</AppText></Surface> : <CueDeck compact={compact} feedback={compactFeedback} finished={finished} />}
    </View>
    <View style={[styles.controlsPane, landscapePane]}><View style={[styles.controlStage, compact && styles.controlStageCompact]}><View style={styles.buttonRow}><View style={uiStyles.grow}><Button label={t('run.recovery')} compact={compact} stageSafe dimmed={dim} disabled={touchGuard && !recoveryRequired} onPress={() => { stopAll(); router.push('/recovery') }} /></View><View style={uiStyles.grow}><Button label={t('run.fade', { seconds: (session.snapshot?.panicFadeMs ?? 2000) / 1000 })} compact={compact} stageSafe variant="danger" onPress={() => { panic(); router.push('/recovery') }} /></View></View>
      <Button label={goLabel} compact={compact} variant="go" dimmed={dim} disabled={touchGuard || !canGo || (!goTarget && !['running', 'paused'].includes(session.phase))} onPress={go} />
      <View style={styles.buttonRow}><View style={uiStyles.grow}><Button label={touchGuard ? t('run.guardOn') : t('run.guard')} compact={compact} stageSafe variant="ghost" accessibilityHint={touchGuard ? t('run.unlock') : undefined} onPress={() => { if (!touchGuard) setTouchGuard(true) }} onLongPress={() => { if (touchGuard) setTouchGuard(false) }} onAccessibilityActivate={() => setTouchGuard(!touchGuard)} state={touchGuard ? 'confirmed' : 'idle'} /></View><View style={uiStyles.grow}><Button label={blackout ? t('run.blackoutOn') : t('run.blackout')} compact={compact} stageSafe variant="ghost" disabled={touchGuard && !blackout} onPress={() => { if (blackout) { setBlackout(false); setTouchGuard(false) } else setBlackout(true) }} state={blackout ? 'confirmed' : 'idle'} /></View></View>{compact ? null : <View style={styles.guardMessage}><AppText tone="caption" muted numberOfLines={1} adjustsFontSizeToFit accessibilityLiveRegion="polite">{actionHint}</AppText></View>}</View>
<View key={wrappedFooter ? 'wrapped-tools' : 'single-row-tools'} style={[styles.statusFoot, wrappedFooter && styles.wrappedFooter]}><View style={footerSlot}><Button label={t('run.hits')} compact={compact} stageSafe dimmed={dim} disabled={touchGuard || !session.snapshot?.hitCueIds.length} variant="ghost" onPress={() => { setHitsOpen(!hitsOpen); setTimer(false) }} /></View><View style={footerSlot}><Button label={session.phase === 'paused' ? t('run.resume') : t('run.pause')} compact={compact} stageSafe dimmed={dim} disabled={touchGuard || !canPauseResumeSession(session)} variant="ghost" onPress={pauseResume} /></View><View style={footerSlot}><Button label={t('edge.timer.short')} accessibilityLabel={t('timer.title')} compact={compact} stageSafe dimmed={dim} disabled={touchGuard} variant="ghost" onPress={() => { setTimer(!timer); setHitsOpen(false) }} /></View><View style={footerSlot}><Button label={voiceStatus?.armed ? t('edge.voice.disarmShort') : t('voice.off')} accessibilityLabel={voiceStatus?.armed ? t('voice.disarm') : t('voice.off')} compact={compact} stageSafe dimmed={dim && !voiceStatus?.armed} disabled={!voiceStatus?.armed} variant={voiceStatus?.armed ? 'danger' : 'ghost'} onPress={() => { void runTask(disarmVoice) }} /></View></View>
    </View>{hitsOpen ? <View style={[styles.timerSafeArea, { height: compact ? size.runReadoutCompact + size.control : size.runReadout + size.controlLarge }, landscape && { width: '48%' }]}><Surface raised style={uiStyles.grow}><View style={uiStyles.row}><AppText tone="label" style={uiStyles.grow}>{t('run.hits')}</AppText>{session.snapshot ? <VoiceCapacity active={session.activeVoiceCount} limit={session.snapshot.voiceLimit} stageSafe /> : null}</View>
      {/* Sound-producing Hits keep complete labels and are spaced apart against accidental neighbours. */}
      <FlatList testID="run-hit-list" style={styles.hitViewport} contentContainerStyle={styles.hitList} data={session.snapshot?.hitCueIds ?? []} keyExtractor={(id) => id}
        initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7} removeClippedSubviews={false}
        renderItem={({ item: id }) => <Button label={names[id]?.name ?? id} disabled={touchGuard || recoveryRequired || session.phase === 'paused'} accessibilityHint={session.phase === 'paused' ? t('use.run.resume') : undefined} onPress={() => triggerHit(id)} />} />
      <Button label={t('common.cancel')} onPress={() => setHitsOpen(false)} /></Surface></View> : null}<View pointerEvents={timer ? 'box-none' : 'none'} style={[styles.timerSafeArea, { height: compact ? size.runReadoutCompact + size.control : size.runReadout + size.controlLarge }, landscape && { width: '48%' }, !timer && styles.hiddenTimer]}><FloatingStopwatch visible={timer} availableWidth={contentWidth * (landscape ? 0.48 : 1)} availableHeight={compact ? size.runReadoutCompact + size.control : size.runReadout + size.controlLarge} onHide={() => setTimer(false)} /></View>
  </View></SafeAreaView>
}

export function RecoveryScreen() {
  useBlockLiveBack()
  const router = useRouter(); const mounted = useMounted(); const { t } = useI18n(); const { replay, previous, skip, selectCue, startCue, panic, stopAll, exitShow, session, voiceStatus, disarmVoice, runTask } = useApp()
  const selectedId = session.selectedCueId
  const viewport = useWindowDimensions()
  const [typing, setTyping] = useState(() => Keyboard.isVisible() === true)
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setTyping(true))
    const hidden = Keyboard.addListener('keyboardDidHide', () => setTyping(false))
    return () => { shown.remove(); hidden.remove() }
  }, [])
  const landscape = viewport.width > viewport.height
  const keyboardOnly = typing && landscape
  const scope = session.snapshot ? `${session.snapshot.showId}:${session.snapshot.revisionId}:${session.snapshot.setId}:${session.sessionPurpose}` : 'unprepared'
  // A native selection invalidates old commands, not the operator's search.
  const commandScope = `${scope}:${session.nativeGeneration}`
  const [filter, setFilter] = useState({ scope, query: '' })
  const query = filter.scope === scope ? filter.query : ''
  const recoveryHeaderHeight = useRef(0)
  const [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)
  const recoveryRequired = ['interrupted', 'fault', 'unavailable'].includes(session.phase)
  const playbackDisabled = leaving || !session.snapshot || !['ready', 'running', 'paused', 'fading', 'stopped'].includes(session.phase)
  const intent = useRef({ scope: commandScope, snapshot: session.snapshot, selectedId, phase: session.phase, disabled: playbackDisabled, pending: session.pendingCommandIds.length > 0 })
  useLayoutEffect(() => {
    intent.current = { scope: commandScope, snapshot: session.snapshot, selectedId, phase: session.phase, disabled: playbackDisabled, pending: session.pendingCommandIds.length > 0 }
  }, [playbackDisabled, commandScope, selectedId, session.phase, session.pendingCommandIds.length, session.snapshot])
  const currentIntent = () => mounted.current && !leavingRef.current && intent.current.scope === commandScope && intent.current.snapshot === session.snapshot && !intent.current.disabled
  const perform = (command: () => number | null) => { if (currentIntent() && !intent.current.pending) command() }
  const leave = async (destination: '/' | '/help' | '/rehearsal' | '/preflight', stopFirst = false) => {
    if (!mounted.current || leavingRef.current || intent.current.scope !== commandScope || intent.current.snapshot !== session.snapshot) return null
    leavingRef.current = true; setLeaving(true)
    try {
      if (stopFirst) stopAll()
      if (!await exitShow()) throw new Error('PLAYBACK_FAULT: Silent shutdown could not be confirmed. Retry before preparing again.')
      const latest = intent.current
      const sameOwner = (latest.scope === commandScope && latest.snapshot === session.snapshot) || (latest.snapshot === null && ['idle', 'unavailable'].includes(latest.phase))
      if (mounted.current && sameOwner && latest.phase !== 'preparing') { router.dismissAll(); router.replace(destination) }
    } finally { leavingRef.current = false; if (mounted.current) setLeaving(false) }
  }
  const recheck = () => leave(session.sessionPurpose === 'rehearsal' ? '/rehearsal' : '/preflight')
  const matches = useMemo(() => (session.snapshot?.cueOrder ?? []).map((id, index) => ({ id, index }))
    .filter(({ id }) => collectionSearchMatches(query, session.snapshot?.cues[id]?.name ?? id)), [query, session.snapshot])
  const selectedCue = session.snapshot?.cues[selectedId]
  const startDisabled = playbackDisabled || !selectedCue || session.pendingCommandIds.length > 0
  const startSelected = () => { if (currentIntent() && !startDisabled && !intent.current.pending && intent.current.selectedId === selectedId) { Keyboard.dismiss(); startCue(selectedId) } }
  const header = <View style={uiStyles.gap} onLayout={(event) => { recoveryHeaderHeight.current = event.nativeEvent.layout.height }}><OperationStatus nativeRecoveryHandled={recoveryRequired} />
    <Surface raised>{session.snapshot?.showName ? <AppText tone="label" numberOfLines={2}>{session.snapshot.showName}</AppText> : null}<Badge label={t(`state.${session.phase}` as MessageKey)} tone="warning" />{recoveryRequired ? <><AppText accessibilityLiveRegion="polite">{t('use.audio.recovery')}</AppText><Button label={t('use.audio.recheck')} variant="primary" disabled={leaving} state={leaving ? 'loading' : 'idle'} onPress={() => { void runTask(recheck, { silent: true }) }} /></> : null}{voiceStatus?.armed ? <Button label={t('voice.disarm')} variant="danger" onPress={() => { void runTask(disarmVoice) }} /> : null}<Button label={t('recovery.armed')} disabled={playbackDisabled} onPress={() => { if (currentIntent()) router.replace(session.sessionPurpose === 'rehearsal' ? '/rehearsal' : '/run') }} /><Button label={t('recovery.exit')} variant="danger" disabled={leaving} onPress={() => { void runTask(() => leave('/'), { silent: true }) }} /></Surface>
    <Surface><View style={styles.buttonRow}><Button label={t('recovery.replay')} disabled={playbackDisabled || session.pendingCommandIds.length > 0 || !(session.selectedCueId || session.currentCueId)} onPress={() => perform(replay)} /><Button label={t('recovery.previous')} disabled={playbackDisabled || session.pendingCommandIds.length > 0} onPress={() => perform(previous)} /><Button label={t('recovery.skip')} disabled={playbackDisabled || session.pendingCommandIds.length > 0} onPress={() => perform(skip)} /></View></Surface>
    <View style={uiStyles.gap}><Disclosure title={t('common.diagnostics')}><AppText selectable muted>{session.detail}</AppText>{!voiceStatus?.armed ? <Badge label={t('voice.off')} /> : null}</Disclosure><Button label={t('recovery.silent')} disabled={leaving} onPress={() => { void runTask(() => leave('/help', true), { silent: true }) }} /></View>
    <SectionCard icon="list" title={t('command.SELECT')}>{/* With nothing selected mid-show, the silent-selection help below is the instruction; never an import prompt. */}{selectedCue ? <CueTitle tone="label" name={selectedCue.name} /> : <AppText tone="label" muted>{t('edge.noSelection')}</AppText>}<Button label={t('recovery.select')} variant="primary" disabled={startDisabled} onPress={startSelected} /><AppText tone="caption" muted>{t('practice.selectionHelp')}</AppText></SectionCard>
  </View>
  return <AppShell current="/more" scroll={false} hideNavigation allowCriticalKeyboard footer={<View style={[styles.recoverySafety, typing && { paddingVertical: 0 }]}><View style={uiStyles.grow}><Button stageSafe label={t('recovery.stop')} variant="danger" onPress={stopAll} /></View><View style={uiStyles.grow}><Button stageSafe label={t('recovery.fade')} variant="danger" onPress={panic} /></View></View>}>
    <View style={typing ? { gap: 0 } : uiStyles.gap}>{typing ? null : landscape ? <View style={uiStyles.row}><AppText tone="label" accessibilityRole="header">{t('recovery.title')}</AppText><Badge label={t('use.library.results', { count: matches.length, total: session.snapshot?.cueOrder.length ?? 0 })} /></View> : <SectionHeader title={t('recovery.title')} subtitle={t('recovery.subtitle')} />}<CollectionSearch compact={typing || landscape} value={query} onChange={(value) => setFilter({ scope, query: value })} label={t('finder.search')} resultCount={matches.length} totalCount={session.snapshot?.cueOrder.length ?? 0} /></View>
    <View style={[uiStyles.grow, keyboardOnly && { display: 'none' }]} accessibilityElementsHidden={keyboardOnly} importantForAccessibility={keyboardOnly ? 'no-hide-descendants' : 'auto'}>
    <CollectionViewport sections={[{ key: 'recovery', data: matches, heading: !matches.length && query.trim() ? <View style={uiStyles.gap}><AppText muted>{t('use.library.noCues')}</AppText><AppText tone="caption" muted>{t('use.library.searchHelp')}</AppText></View> : null }]} resetKey={`${query}:${typing}`} scopeKey={scope} getResetOffset={() => query.trim() ? recoveryHeaderHeight.current : 0} header={header} footer={<View />}
      keyExtractor={(row) => row.id} renderItem={(row, index) => {
        const cue = session.snapshot?.cues[row.id]
        const name = cue?.name ?? row.id
        const selected = selectedId === row.id
        return <CollectionRow title={name} label={`${String(row.index + 1).padStart(2, '0')} · ${name}`} hint={t('practice.selectionHelp')} selected={selected} disabled={playbackDisabled} last={index === matches.length - 1}
          leading={<AppText tone="caption" muted>{String(row.index + 1).padStart(2, '0')}</AppText>} onPress={() => { if (currentIntent()) { Keyboard.dismiss(); selectCue(row.id) } }}
          action={selected ? <IconButton label={`${t('recovery.select')} · ${name}`} icon="play" emphasis disabled={startDisabled} onPress={startSelected} /> : null} />
      }} /></View>
  </AppShell>
}

export const languageNames = { en: 'English', he: 'עברית', es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano', pt: 'Português', ru: 'Русский', ja: '日本語', ar: 'العربية' } as const
export function LanguagePicker() {
  const { library, libraryState, runTask, busy } = useApp()
  return <View style={uiStyles.wrap}>{(Object.keys(languageNames) as (keyof typeof languageNames)[]).map((locale) => <ChoiceChip key={locale} label={languageNames[locale]} disabled={busy || libraryState.status !== 'ready'} selected={libraryState.settings.locale === locale} onPress={() => { void runTask(() => library.updateSettings({ locale })) }} />)}</View>
}
function ThemePicker() {
  const { t } = useI18n(); const { library, libraryState, runTask, busy } = useApp(); const viewport = useWindowDimensions()
  const themes = ['darkBlue', 'purpleNight', 'cobra'] as const
  // Three previews share a phone row only while every name fits whole ("Dunkelblau", "Фиолетовая" can't at ~60 dp).
  const fallback = useWordBreakFallback(themes.map((theme) => t(`theme.${theme}`)).join('\u0000'))
  const unavailable = busy || libraryState.status !== 'ready'; const stacked = viewport.fontScale > font.scale.stageMax || viewport.width < size.control * 7 || fallback.broken
  return <View onLayout={fallback.onLayout} style={stacked ? uiStyles.gap : [uiStyles.row, { alignItems: 'stretch' }]}>{themes.map((theme) => {
    const palette = themeColors[theme]; const selected = libraryState.settings.theme === theme
    return <Pressable key={theme} accessibilityRole="button" accessibilityLabel={t(`theme.${theme}`)} accessibilityState={{ selected, disabled: unavailable }} disabled={unavailable} onPress={() => { void runTask(() => library.updateSettings({ theme })) }} style={({ pressed }) => [styles.themeOption, { flex: stacked ? undefined : 1, minWidth: size.control, gap: space.xs, backgroundColor: palette.canvas, borderColor: selected ? palette.accent : palette.borderSubtle, opacity: unavailable ? opacity.disabled : 1 }, pressed && { backgroundColor: palette.surfaceRaised }]}><View accessible={false} style={{ height: size.controlLarge, backgroundColor: palette.surface, padding: space.xs, borderRadius: radius.sm, justifyContent: 'space-between' }}><View style={{ width: '70%', height: space.xxs, borderRadius: radius.round, backgroundColor: palette.textMuted }} /><View style={{ width: '45%', height: space.xxs, borderRadius: radius.round, backgroundColor: palette.border }} /><View style={{ height: space.sm, borderRadius: radius.sm, backgroundColor: palette.accent }} /></View><AppText tone="caption" onTextLayout={stacked ? undefined : fallback.onTextLayout} style={{ color: selected ? palette.accent : palette.textMuted, width: '100%', alignSelf: 'stretch', lineHeight: undefined }}>{selected ? '✓ ' : ''}{t(`theme.${theme}`)}</AppText></Pressable>
  })}</View>
}
/**
 * Panic fade length. Every step used to start a save that set `busy`, so quick
 * taps were silently dropped. The slider now shows the operator's latest value
 * immediately and saves only the newest value once the previous save settles.
 */
function PanicFadeSetting({ show }: { show: NonNullable<ReturnType<typeof useApp>['show']> }) {
  const { t, locale } = useI18n(); const { library, libraryState, runTask, busy } = useApp(); const mounted = useMounted()
  const [draft, setDraft] = useState<number | null>(null); const [settled, setSettled] = useState(0)
  const saving = useRef(false)
  const decimal = useMemo(() => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), [locale])
  // Saves wait for every other task (including import/restore) and for their own predecessor; only the newest draft is written.
  // Each distinct value is written at most once; a draft clears when the save it started settles (success or failure).
  useEffect(() => {
    if (draft === null || busy || saving.current) return
    const target = draft; saving.current = true
    void runTask(async () => { const latest = library.getSnapshot().shows.find((candidate) => candidate.id === show.id); if (latest && latest.panicFadeMs !== target) await library.saveShow({ ...latest, panicFadeMs: target }) })
      .finally(() => { saving.current = false; if (mounted.current) { setDraft((current) => current === target ? null : current); setSettled((count) => count + 1) } })
  }, [busy, draft, library, mounted, runTask, settled, show.id])
  const valueMs = draft ?? show.panicFadeMs
  const seconds = (milliseconds: number) => decimal.format(milliseconds / 1000)
  return <Surface><Disclosure title={t('command.PANIC_FADE')} summary={`${t('run.fade', { seconds: seconds(valueMs) })} · ${show.name}`}><ValueSlider label={t('editor.fadeOut')} value={valueMs / 1000} min={0} max={30} step={0.1} disabled={libraryState.status !== 'ready'} formatValue={(value) => `${seconds(value * 1000)} s`} onChange={(value) => setDraft(Math.round(value * 1000))} /></Disclosure></Surface>
}
export function SettingsScreen({ promotion, commerceControls }: SettingsScreenProps = {}) {
  const { t } = useI18n(); const router = useRouter(); const { libraryState, show, busy } = useApp()
  const [section, setSection] = useState<'appearance' | 'backup' | 'more'>('appearance')
  return <AppShell current="/more" navigationRoute="/settings" footer={promotion}><SectionHeader title={t('settings.title')} subtitle={t('settings.subtitle')} /><OperationStatus /><Segments options={[{ value: 'appearance', label: t('settings.appearance') }, { value: 'backup', label: t('settings.backup') }, { value: 'more', label: t('use.settings.tools') }]} selected={section} onChange={setSection} disabled={busy} />
    {section === 'appearance' ? <><SectionCard icon="sliders" title={t('settings.appearance')}><ThemePicker /></SectionCard><Surface><Disclosure title={t('settings.language')} summary={languageNames[libraryState.settings.locale]}><LanguagePicker /></Disclosure></Surface></> : null}
    <View style={section === 'backup' ? undefined : { display: 'none' }} accessibilityElementsHidden={section !== 'backup'} importantForAccessibility={section === 'backup' ? 'auto' : 'no-hide-descendants'}><BackupPanel /></View>
    {section === 'more' ? <BackgroundReliabilityPanel /> : null}
    {section === 'more' ? <>{show ? <PanicFadeSetting key={show.id} show={show} /> : null}<SectionCard icon="list" title={t('setup.optional')}><TaskRow label={t('controllers.title')} onPress={() => router.push('/controllers' as never)} /><TaskRow label={t('ai.keys')} onPress={() => router.push('/provider-keys' as never)} /><TaskRow label={t('visual.title')} onPress={() => router.push('/audience-display' as never)} /><TaskRow label={t('help.title')} onPress={() => router.push('/help' as never)} /></SectionCard>{commerceControls}</> : null}
  </AppShell>
}
export function OnboardingScreen() {
  const { t } = useI18n(); const router = useRouter(); const mounted = useMounted(); const { library, runTask, busy, libraryState } = useApp()
  return <AppShell current="/" hideNavigation><StudioMasthead /><StudioWelcome title={t('onboarding.title')} body={t('onboarding.body')} /><OperationStatus /><SectionCard title={t('settings.language')}><LanguagePicker /></SectionCard><SectionCard title={t('nav.run')}><WorkflowStep number={1} title={t('nav.library')} detail={t('builder.import')} /><WorkflowStep number={2} title={t('nav.rehearsal')} detail={t('rehearsal.subtitle')} /><WorkflowStep number={3} title={t('preflight.arm')} detail={t('preflight.resolve')} /></SectionCard><Button label={t('onboarding.finish')} variant="primary" disabled={busy || libraryState.status !== 'ready'} onPress={() => { void runTask(async () => { await library.updateSettings({ onboardingCompleted: true }); if (mounted.current) router.replace('/') }) }} /></AppShell>
}
export { HelpScreen } from './help-screen'
export function MoreScreen() {
  const router = useRouter(); const { t } = useI18n()
  return <AppShell current="/more"><StudioMasthead /><SectionHeader title={t('refine.backstage')} subtitle={t('workflow.moreHelp')} />
    <SectionLabel title={t('nav.run')} /><ToolGrid items={[
      { id: 'preflight', title: t('more.preflight'), icon: 'shield', tone: 'green', onPress: () => router.push('/preflight') },
      { id: 'controllers', title: t('more.controllers'), icon: 'remote', tone: 'purple', onPress: () => router.push('/controllers') },
      { id: 'visuals', title: t('visual.title'), icon: 'display', onPress: () => router.push('/audience-display' as never) },
      { id: 'voice', title: t('voice.title'), icon: 'mic', tone: 'green', onPress: () => router.push('/voice' as never) },
    ]} />
    <SectionLabel title={t('refine.songs')} /><ToolGrid items={[
      { id: 'find', title: t('finder.title'), icon: 'music', tone: 'warm', onPress: () => router.push('/find-music' as never) },
      { id: 'downloads', title: t('download.history'), icon: 'download', onPress: () => router.push('/downloads' as never) },
    ]} />
    <SectionLabel title={t('setup.optional')} /><ToolGrid items={[
      { id: 'assistant', title: t('ai.title'), icon: 'sliders', tone: 'purple', onPress: () => router.push('/assistant' as never) },
      { id: 'music', title: t('music.title'), icon: 'music', tone: 'warm', onPress: () => router.push('/music' as never) },
    ]} />
    <Surface><TaskRow label={t('more.settings')} onPress={() => router.push('/settings' as never)} /><TaskRow label={t('help.title')} onPress={() => router.push('/help' as never)} /></Surface>
  </AppShell>
}
const styles = StyleSheet.create({
  hitViewport: { flex: 1, minHeight: 0 }, hitList: { gap: space.xs, paddingVertical: space.xxs },
  themeOption: { minHeight: size.controlLarge, borderWidth: size.iconStroke, borderRadius: radius.lg, padding: space.md }, themeSwatch: { width: size.control, height: size.control, borderRadius: radius.md },
  compactRunContent: { padding: space.xs, gap: space.xs }, landscapeRun: { flexDirection: 'row', direction: 'ltr' }, statusPane: { gap: space.xs }, stageStatus: { height: size.control, flexDirection: 'row', alignItems: 'center', gap: space.xs }, controlsPane: { flex: 1, flexBasis: 0, minWidth: 0, direction: 'ltr', justifyContent: 'flex-end', gap: space.xs }, compactSurface: { padding: space.sm, gap: space.xs }, readoutCompact: { height: size.runReadoutCompact, gap: space.xs }, controlStageCompact: { height: size.goCompact + size.control * 2 + space.xs * 2, gap: space.xs },
  wrappedFooter: { flexWrap: 'wrap', gap: space.xs }, footerSlot: { flex: 0, flexBasis: 'auto', width: '48%', minWidth: 0 }, footerSlotUnwrapped: { flex: 1, flexBasis: 0, width: 'auto', minWidth: 0 }, runOrdinal: { writingDirection: 'ltr' }, compactNextName: { height: font.lineHeight.caption * 2 },
  hiddenTimer: { display: 'none' }, recoverySafety: { flexDirection: 'row', direction: 'ltr', gap: space.sm, padding: space.sm },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, timeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: space.xs, direction: 'ltr' }, clockCaption: { textAlign: 'left' }, compactClock: { fontSize: font.size.caption, lineHeight: font.lineHeight.caption }, checkRow: { minHeight: size.control, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm }, press: { backgroundColor: color.surfacePressed }, successText: { color: color.success }, warningText: { color: color.warning },
runShell: { flex: 1 }, runContent: { width: '100%', maxWidth: size.contentMax, alignSelf: 'center', flex: 1, padding: space.md, gap: space.sm }, readout: { height: size.runReadout, gap: space.xs }, nowName: { height: font.lineHeight.title }, nextName: { height: font.lineHeight.label }, blackoutPanel: { height: size.runReadout, backgroundColor: color.blackout, justifyContent: 'center' }, blackoutTitle: { color: color.textSubtle }, controlStage: { height: size.go + size.controlLarge * 2 + font.lineHeight.body + space.sm * 3, gap: space.sm }, guardMessage: { height: font.lineHeight.body, justifyContent: 'center' }, statusFoot: { flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'space-between', gap: space.sm, opacity: opacity.muted }, timerSafeArea: { position: 'absolute', top: space.lg, start: 0, end: 0, height: size.runReadout + size.controlLarge, overflow: 'hidden' },
})
