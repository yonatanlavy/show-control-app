import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { AppState, BackHandler, Linking, Platform, StyleSheet, useWindowDimensions, View } from 'react-native'
import ShowController, { type NativeControllerInput } from '../../modules/show-controller'
import { diagnosticAction, eligibleDiagnosticInput, normalizeInput, remoteActions, remoteExamples, samePhysicalInput, validateProfile, type RemoteKind } from '../controllers'
import { font, radius, size, space, useThemeColors } from '../design'
import { controllerPreparationIssues, type ControllerBinding, type ControllerCommand } from '../domain'
import { useI18n, type MessageKey } from '../i18n'
import { useApp } from './AppProvider'
import { AppIcon, type IconName } from './icons'
import { operationErrorKey, OperationStatus } from './library-screens'
import { useMounted } from './navigation'
import { AppShell, AppText, Badge, Button, ChoiceChip, Disclosure, IconButton, Progress, SectionHeader, Segments, StatusBanner, Surface, uiStyles, WorkflowStep } from './primitives'
import { CollectionRow, WorkflowDialog } from './workflow-components'
import { controllerInputLabel, controllerRemovalLabel } from './controller-input-label'
import { ShowIdentityContext, useShowIdentities } from './ShowIdentityContext'

const icons: Record<typeof remoteActions[number], IconName> = { GO: 'next', PAUSE_RESUME: 'pause', PREVIOUS: 'previous', STOP_ALL: 'stop', PANIC_FADE: 'stop' }
const help: Record<typeof remoteActions[number], MessageKey> = { GO: 'remote.goHelp', PAUSE_RESUME: 'remote.pauseHelp', PREVIOUS: 'remote.previousHelp', STOP_ALL: 'remote.stopHelp', PANIC_FADE: 'remote.panicHelp' }
type ActiveDialog = { action: typeof remoteActions[number]; showId: string; sessionId: string; expired?: boolean; failed?: boolean }
type Dialog = (ActiveDialog & { kind: 'learn' }) | (ActiveDialog & { kind: 'test' }) | { kind: 'remove'; binding: ControllerBinding; showId: string }
type SetupSection = 'connection' | 'buttons' | 'check'

/** Original physical diagram. It is decorative, static and never mirrored in RTL. */
function RemoteFace() {
  const colors = useThemeColors()
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.remoteFrame, { backgroundColor: colors.canvas, borderColor: colors.borderStrong }]}><View style={[styles.remoteLight, { backgroundColor: colors.accent }]} /><View style={styles.remotePad}><AppIcon name="plus" /><View style={styles.remoteButtons}><AppIcon name="previous" /><View style={[styles.remoteCenter, { backgroundColor: colors.surfaceRaised }]}><AppIcon name="play" tint={colors.text} /></View><View style={[styles.remoteNext, { backgroundColor: colors.accentSurface }]}><AppIcon name="next" tint={colors.accent} /></View></View><View style={[styles.remoteMinus, { backgroundColor: colors.textMuted }]} /></View><View style={[styles.remoteSlot, { backgroundColor: colors.border }]} /></View>
}
function ActionRow({ action, children }: { action: typeof remoteActions[number]; children?: ReactNode }) {
  const { t } = useI18n(); const colors = useThemeColors()
  return <View style={[styles.actionRow, { borderColor: colors.borderSubtle }]}><View style={[styles.actionIcon, { backgroundColor: action === 'GO' ? colors.accentSurface : colors.surfaceRaised }]}><AppIcon name={icons[action]} tint={action === 'GO' ? colors.accent : colors.textMuted} /></View><View style={uiStyles.grow}><AppText tone="label" style={action === 'GO' ? { color: colors.accent } : undefined}>{t(`command.${action}`)}</AppText><AppText muted tone="caption">{t(help[action])}</AppText>{children}</View></View>
}

export function ControllersScreen({ promotion }: { promotion?: ReactNode } = {}) {
  const identities = useShowIdentities()
  const { t, isRTL } = useI18n(); const colors = useThemeColors(); const viewport = useWindowDimensions(); const mounted = useMounted()
  const params = useLocalSearchParams<{ section?: string | string[] }>(); const requestedSection = Array.isArray(params.section) ? params.section[0] : params.section
  const { show, libraryState, controllerHealth, controllerInputs, controllerScan, pairController, cancelControllerPairing, refreshControllers, beginControllerDiagnostics, endControllerDiagnostics, assignControllerInput, removeControllerBinding, runTask, busy, liveSession, error, clearError } = useApp()
  const [kind, setKind] = useState<RemoteKind>('media'); const [workspace, setWorkspace] = useState({ request: requestedSection, section: (requestedSection === 'buttons' ? 'buttons' : 'connection') as SetupSection }); const [dialogState, setDialog] = useState<Dialog | null>(null); const generation = useRef(0); const setupPending = useRef(false)
  const removalPending = useRef(false); const [removing, setRemoving] = useState(false); const [removeFailed, setRemoveFailed] = useState(false)
  if (workspace.request !== requestedSection) setWorkspace({ request: requestedSection, section: requestedSection === 'buttons' ? 'buttons' : workspace.section })
  const section = workspace.request === requestedSection ? workspace.section : requestedSection === 'buttons' ? 'buttons' : workspace.section
  const setSection = (next: SetupSection) => setWorkspace({ request: requestedSection, section: next })
  const dialog = dialogState?.showId === (show?.id ?? '') ? dialogState : null
  const profile = libraryState.controllerProfiles.find((candidate) => candidate.id === (show?.controllerProfileId ?? `profile-${show?.id ?? ''}`))
  const scanning = !!controllerScan && !['paired', 'failed', 'cancelled'].includes(controllerScan.state)
  const available = ShowController.isAvailable(); const disabled = busy || liveSession || !available || scanning
  const removalDisabled = busy || liveSession || scanning
  const selectedSet = show?.sets.find((candidate) => candidate.id === libraryState.selectedSetId) ?? show?.sets[0]
  const profileIssues = show && selectedSet ? controllerPreparationIssues(show, selectedSet, libraryState.controllerProfiles) : []
  const otherBindings = profile?.bindings.filter((binding) => !remoteActions.some((action) => action === binding.command.type)) ?? []
  const sharedCount = profile ? (libraryState.shows ?? (show ? [show] : [])).filter((candidate) => candidate.controllerProfileId === profile.id).length : 0
  const openRemoval = (binding: ControllerBinding) => { setRemoveFailed(false); setDialog({ kind: 'remove', binding, showId: show?.id ?? '' }) }
  const confirmRemoval = () => {
    if (!dialog || dialog.kind !== 'remove' || removalDisabled || removalPending.current) return
    const target = dialog; removalPending.current = true; setRemoving(true); setRemoveFailed(false)
    void runTask(() => removeControllerBinding(target.binding, target.showId)).then((success) => {
      if (!mounted.current) return
      if (success) setDialog((current) => current === target ? null : current)
      else setRemoveFailed(true)
    }).finally(() => { removalPending.current = false; if (mounted.current) setRemoving(false) })
  }
  const compact = viewport.width < size.control * 7 || viewport.fontScale > font.scale.stageMax
  useEffect(() => {
    if (available && !liveSession) void runTask(refreshControllers, { silent: true })
    return () => { generation.current += 1; if (available) { cancelControllerPairing(); void endControllerDiagnostics().catch(() => undefined) } }
  }, [available, liveSession, refreshControllers, endControllerDiagnostics, runTask, cancelControllerPairing])
  useEffect(() => {
    generation.current += 1
    if (available) void endControllerDiagnostics().then(() => { if (mounted.current) setDialog((current) => current?.showId !== (show?.id ?? '') ? null : current) }).catch(() => undefined)
  }, [show?.id, available, endControllerDiagnostics, mounted])
  useEffect(() => { const listener = AppState.addEventListener('change', (state) => { if (state !== 'active') { generation.current += 1; setDialog((current) => current && current.kind !== 'remove' ? { ...current, expired: true } : current); if (available) void endControllerDiagnostics().catch(() => undefined) } }); return () => listener.remove() }, [available, endControllerDiagnostics])
  const dismiss = () => { generation.current += 1; setDialog(null); void runTask(endControllerDiagnostics, { silent: true }) }
  const diagnostic = !!dialog && dialog.kind !== 'remove'
  useEffect(() => {
    if (!diagnostic) return undefined
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy) { generation.current += 1; setDialog(null); void runTask(endControllerDiagnostics, { silent: true }) }
      return true
    })
    return () => back.remove()
  }, [diagnostic, busy, endControllerDiagnostics, runTask])
  const start = (mode: 'learn' | 'test', action: typeof remoteActions[number] = 'GO') => {
    if (setupPending.current) return
    setupPending.current = true
    const capturedGeneration = ++generation.current; const showId = show?.id ?? ''
    setDialog({ kind: mode, action, showId, sessionId: '' })
    void runTask(async () => {
      const health = await beginControllerDiagnostics(mode)
      if (!mounted.current || generation.current !== capturedGeneration) { await endControllerDiagnostics(); return }
      setDialog({ kind: mode, action, showId, sessionId: health.diagnosticSessionId ?? '' })
    }, { silent: true }).then((success) => { if (!success && mounted.current && generation.current === capturedGeneration) setDialog((current) => current && current.kind !== 'remove' ? { ...current, failed: true } : current) }).finally(() => { setupPending.current = false })
  }
  const uniqueIds = new Set<string>()
  const inputs = dialog && dialog.kind !== 'remove' ? controllerInputs.filter((input) => { if (!eligibleDiagnosticInput(input, dialog.sessionId) || uniqueIds.has(input.eventId)) return false; uniqueIds.add(input.eventId); return true }) : []
  const captured: NativeControllerInput | undefined = inputs[0]
  const matching = captured ? profile?.bindings.find((binding) => samePhysicalInput(binding, captured)) : undefined
  const ended = !!dialog && dialog.kind !== 'remove' && (dialog.expired || !!dialog.sessionId && (controllerHealth?.diagnosticMode !== dialog.kind || controllerHealth.diagnosticSessionId !== dialog.sessionId))
  // Some media remotes report separate PLAY and PAUSE commands. Group their
  // receipt counts in the shared row without changing the actual binding.
  const mapped = inputs.map((input) => diagnosticAction(input, profile)).filter((action) => action !== null).map((action) => action === 'PAUSE' || action === 'RESUME' ? 'PAUSE_RESUME' : action)
  const testCount = Math.min(10, mapped.length)
  const openSettings = () => { void runTask(() => Platform.OS === 'android' ? Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS') : Linking.openSettings(), { silent: true }) }
  const inputLabel = (input: Pick<ControllerBinding, 'inputKey' | 'adapterId' | 'deviceId'>) => controllerInputLabel(input, t)
  const actionName = (command: ControllerCommand) => 'cueId' in command ? t('remote.actionTarget', { action: t(`command.${command.type}`), name: show?.cues[command.cueId]?.name ?? command.cueId }) : t(`command.${command.type}`)
  const removeName = (binding: ControllerBinding) => controllerRemovalLabel(binding, actionName(binding.command), t)
  const targetProblem = (command: ControllerCommand) => {
    if (!('cueId' in command)) return undefined
    if (!show?.cues[command.cueId]) return t('remote.targetMissing')
    const order = command.type === 'TRIGGER_HIT' ? selectedSet?.hitCueIds : selectedSet?.cueOrder
    return order?.includes(command.cueId) ? undefined : t(command.type === 'TRIGGER_HIT' ? 'remote.targetOutsideHit' : 'remote.targetOutside', { name: selectedSet?.name ?? t('common.empty') })
  }
  const otherReceipts = new Map<string, { command: ControllerCommand; count: number }>()
  for (const input of inputs) {
    const command = profile ? normalizeInput(input, profile)?.command : undefined
    if (!command || remoteActions.some((action) => action === command.type) || command.type === 'PAUSE' || command.type === 'RESUME') continue
    const key = JSON.stringify(command); const previous = otherReceipts.get(key)
    otherReceipts.set(key, { command, count: (previous?.count ?? 0) + 1 })
  }
  const connectionGuide = kind === 'media' || kind === 'pedal' || kind === 'custom' ? t(`use.remote.${kind}Guide`) : t(`remote.${kind}Guide`)
  // Keep HID diagnostics in the Activity window. Android's native Modal owns a
  // different window and does not forward key-down through our capture adapter.
  if (dialog && dialog.kind !== 'remove') return <AppShell key="remote-diagnostics" current="/more" navigationRoute="/controllers" hideNavigation><SectionHeader title={dialog.kind === 'learn' ? t('remote.learn', { action: t(`command.${dialog.action}`) }) : t('remote.test')} action={<IconButton label={t('common.close')} icon="close" onPress={dismiss} disabled={busy} />} /><Surface raised style={{ borderRadius: radius.xl, padding: space.lg }}>
    <Badge label={t('remote.silent')} tone="accent" />{ended || dialog.failed ? <StatusBanner title={t(ended ? 'remote.expired' : error ? operationErrorKey(error) : 'common.errorHelp')} tone="warning"><Button label={t('common.retry')} disabled={busy} onPress={() => start(dialog.kind, dialog.action)} /></StatusBanner> : !dialog.sessionId ? <StatusBanner title={t('common.loading')} loading /> : dialog.kind === 'learn' ? <>
      <View style={[styles.inputPanel, { backgroundColor: colors.surfaceRaised }]}><AppIcon name={captured ? 'check' : 'remote'} tint={colors.accent} /><AppText tone="title" accessibilityLiveRegion="polite">{captured ? inputLabel(captured).button : t('remote.waiting')}</AppText>{captured ? <AppText tone="caption" muted>{inputLabel(captured).source}</AppText> : null}</View>
      {matching && matching.command.type !== dialog.action ? <StatusBanner title={t('remote.replace', { action: t(`command.${matching.command.type}` as MessageKey) })} tone="warning" /> : null}{captured?.adapterId === 'system-media' ? <AppText muted>{t('remote.sharedMedia')}</AppText> : null}
      <Button label={t('remote.save')} variant="primary" disabled={!captured || busy || !show || show.id !== dialog.showId} onPress={() => { if (captured) void runTask(() => assignControllerInput({ type: dialog.action }, captured, dialog.showId), { message: 'remote.saved' }).then((success) => { if (success && mounted.current) setDialog(null) }) }} />
    </> : <><AppText tone="title" accessibilityLiveRegion="polite">{t('remote.testCount', { count: testCount })}</AppText><Progress value={testCount / 10} />{remoteActions.map((action) => { const count = mapped.filter((received) => received === action).length; return <View key={action} accessible accessibilityLabel={t(`command.${action}`)} accessibilityValue={{ text: String(count) }} style={uiStyles.row}><AppIcon name={count ? 'check' : icons[action]} tint={count ? colors.success : colors.textSubtle} /><AppText style={uiStyles.grow}>{t(`command.${action}`)}</AppText><AppText tone="label">{count}</AppText></View> })}{testCount >= 10 ? <StatusBanner title={t('remote.testComplete')} tone="success" /> : null}{inputs.length > mapped.length ? <StatusBanner title={t('remote.unknownCount', { count: inputs.length - mapped.length })} tone="warning" /> : null}<AppText muted>{t('remote.testEvidence')}</AppText></>}
    {dialog.kind === 'test' && otherReceipts.size ? <Surface><AppText tone="label">{t('remote.otherActions')}</AppText>{[...otherReceipts].map(([key, receipt]) => <View key={key} accessible accessibilityLabel={actionName(receipt.command)} accessibilityValue={{ text: String(receipt.count) }} style={uiStyles.row}><AppText style={uiStyles.grow}>{actionName(receipt.command)}</AppText><AppText tone="label">{receipt.count}</AppText></View>)}</Surface> : null}
    <Disclosure title={t('remote.troubleshoot')}><AppText>{t('remote.noSignal')}</AppText></Disclosure>
    {dialog.kind === 'learn' ? <Button label={t('common.cancel')} variant="ghost" disabled={busy} onPress={dismiss} /> : null}
  </Surface></AppShell>
  return <AppShell current="/more" navigationRoute="/controllers" footer={promotion} actionBar={<Button label={t('remote.test')} variant="primary" disabled={disabled} onPress={() => start('test')} />}><SectionHeader title={t('controllers.title')} /><OperationStatus />
    {liveSession ? <StatusBanner title={t('remote.armed')} tone="warning" /> : null}
    {!available ? <StatusBanner title={t('controllers.touchFallback')} body={t('remote.localOnly')} tone="warning" /> : null}
    <Surface raised style={{ borderRadius: radius.xl, padding: space.md }}><View style={uiStyles.row}><View style={[styles.actionIcon, { backgroundColor: colors.accentSurface }]}><AppIcon name="remote" tint={colors.accent} /></View><View style={uiStyles.grow}><AppText tone="label">{t('remote.headline')}</AppText><AppText tone="caption" muted>{t('use.remote.summary')}</AppText></View></View>{show ? <><Badge label={show.name} tone="accent" /><ShowIdentityContext identity={identities.get(show.id)} /></> : null}<AppText tone="caption" muted>{t('use.remote.testShortcut')}</AppText></Surface>
    <Segments options={(['connection', 'buttons', 'check'] as const).map((value) => ({ value, label: t(`use.remote.${value}`) }))} selected={section} onChange={setSection} />
    {scanning ? <StatusBanner title={t('remote.pairing')} loading><Button label={t('common.cancel')} onPress={cancelControllerPairing} /></StatusBanner> : null}
    {section === 'connection' ? <Surface style={{ borderRadius: radius.xl, padding: space.lg }}><WorkflowStep number={1} title={t('remote.connect')} /><View style={uiStyles.wrap}>{(['media', 'pedal', 'presenter', 'flic', 'custom'] as const).map((value) => <ChoiceChip key={value} label={t(`remote.${value}`)} selected={kind === value} disabled={busy || liveSession || scanning} onPress={() => setKind(value)} />)}</View><AppText tone="label">{remoteExamples[kind].join(' · ')}</AppText><AppText muted>{connectionGuide}</AppText>{Platform.OS === 'ios' ? <AppText tone="caption" muted>{t('remote.iosSettings')}</AppText> : null}
      {kind !== 'media' && kind !== 'flic' ? <AppText tone="caption" muted>{t('remote.typingHelp')}</AppText> : null}
      {kind === 'flic' && controllerHealth?.sdkAvailable === false ? <StatusBanner title={t('controllers.sdkMissing')} tone="warning" /> : null}
      {kind === 'flic' ? <Button label={t('controllers.pair')} variant="primary" disabled={disabled || controllerHealth?.sdkAvailable === false} onPress={() => { void runTask(pairController) }} /> : <Button label={t('remote.settings')} variant="primary" disabled={busy || liveSession || scanning} onPress={openSettings} />}
      <View style={[styles.healthGrid, compact && styles.heroStack]}><View style={[styles.healthCell, { backgroundColor: colors.canvas, borderColor: colors.borderSubtle }]}><AppText tone="caption" muted>{kind === 'media' ? t('remote.mediaStatus') : t('remote.keyboard')}</AppText><AppText tone="label">{kind === 'media' ? controllerInputs.some((input) => input.adapterId === 'system-media') ? t('remote.signalSeen') : t('common.notMeasured') : controllerHealth?.genericKeyboardConnected === undefined ? t('common.notMeasured') : t(controllerHealth.genericKeyboardConnected ? 'remote.connected' : 'remote.notConnected')}</AppText></View><View style={[styles.healthCell, { backgroundColor: colors.canvas, borderColor: colors.borderSubtle }]}><AppText tone="caption" muted>Flic 2</AppText><AppText tone="label">{controllerHealth?.sdkAvailable === false ? t('controllers.sdkMissing') : t('controllers.health', { paired: controllerHealth?.pairedCount ?? 0, ready: controllerHealth?.readyCount ?? 0, connecting: controllerHealth?.connectingCount ?? 0 })}</AppText></View></View><Button label={t('controllers.refresh')} variant="ghost" disabled={disabled} onPress={() => { void runTask(refreshControllers, { silent: true }) }} />
      <Button label={t('use.remote.assignNext')} onPress={() => setSection('buttons')} />
    </Surface> : section === 'buttons' ? <Surface style={{ borderRadius: radius.xl, padding: space.lg }}><WorkflowStep number={2} title={t('remote.assign')} complete={!!profile && validateProfile(profile).length === 0 && profileIssues.length === 0} />{show ? <><Badge label={show.name} tone="accent" /><ShowIdentityContext identity={identities.get(show.id)} /></> : null}<AppText muted>{t('remote.assignHelp')}</AppText>{remoteActions.map((action, ordinal) => { const assigned = profile?.bindings.filter((binding) => binding.command.type === action) ?? []; return <View key={action} style={styles.mappingAction}><CollectionRow title={t(`command.${action}`)} subtitle={assigned.length ? assigned.map((binding) => inputLabel(binding).button).join(' · ') : t('remote.unassigned')} label={t('remote.learn', { action: t(`command.${action}`) })} disabled={disabled || !show} last={ordinal === remoteActions.length - 1} leading={<View style={[styles.actionIcon, { backgroundColor: action === 'PANIC_FADE' ? colors.dangerSurface : colors.accentSurface }]}><AppIcon name={icons[action]} tint={action === 'PANIC_FADE' ? colors.danger : colors.accent} /></View>} onPress={() => start('learn', action)} /><View style={uiStyles.wrap}>{assigned.map((binding, index) => { const label = inputLabel(binding); return <View key={index} style={[styles.binding, { backgroundColor: colors.surfaceRaised }]}><View style={[uiStyles.grow, styles.bindingIdentity]}><AppText tone="caption">{label.button}</AppText><AppText tone="caption" muted>{label.source}</AppText></View><IconButton label={removeName(binding)} icon="close" disabled={removalDisabled} onPress={() => openRemoval(binding)} /></View> })}</View></View> })}
      {otherBindings.length ? <Surface><AppText tone="label" accessibilityRole="header">{t('remote.otherActions')}</AppText>{otherBindings.map((binding, index) => { const label = inputLabel(binding); return <View key={index} style={uiStyles.gap}><View style={uiStyles.row}><View style={[uiStyles.grow, styles.bindingIdentity]}><AppText tone="label">{actionName(binding.command)}</AppText><AppText tone="caption" muted>{label.button}</AppText><AppText tone="caption" muted>{label.source}</AppText></View><IconButton label={removeName(binding)} icon="close" disabled={removalDisabled} onPress={() => openRemoval(binding)} /></View>{targetProblem(binding.command) ? <AppText tone="caption" style={{ color: colors.warning }}>{targetProblem(binding.command)}</AppText> : null}</View> })}</Surface> : null}
      {sharedCount > 1 ? <StatusBanner title={t('remote.sharedRemoval', { count: sharedCount })} tone="warning" /> : null}
      <AppText tone="caption" muted>{t('remote.panicHelp')}</AppText>{!show ? <AppText>{t('library.emptyBody')}</AppText> : profileIssues.length ? <StatusBanner title={t('remote.touchTitle')} body={t('error.controllerRepair')} tone="warning" /> : profile && validateProfile(profile).length ? <StatusBanner title={t('controllers.incomplete')} tone="warning" /> : null}
      {profile?.bindings.length ? <Disclosure title={t('common.diagnostics')}>{profile.bindings.map((binding, index) => <AppText key={index} tone="caption" selectable>{`\u2066${binding.adapterId ?? '*'} · ${binding.deviceId ?? '*'} · ${binding.inputKey}\u2069 ${isRTL ? '←' : '→'} ${t(`command.${binding.command.type}` as MessageKey)}`}</AppText>)}</Disclosure> : null}
    </Surface> : <Surface style={{ borderRadius: radius.xl, padding: space.lg }}><WorkflowStep number={3} title={t('remote.test')} /><AppText muted>{t('remote.testHelp')}</AppText><AppText tone="caption" muted>{t('remote.testEvidence')}</AppText><Disclosure title={t('remote.controls')}><View style={styles.actionList}>{remoteActions.map((action) => <ActionRow key={action} action={action} />)}</View></Disclosure></Surface>}
    <Disclosure title={t('use.remote.details')}><View style={[styles.hero, compact && styles.heroStack]}><View style={uiStyles.grow}><AppText tone="title">{t('remote.headline')}</AppText><AppText muted>{t('remote.intro')}</AppText></View><RemoteFace /></View><View style={[styles.scope, { backgroundColor: colors.canvas, borderColor: colors.accent }]}><AppText tone="caption" muted>{t('remote.scope')}</AppText></View></Disclosure>
    <Disclosure title={t('remote.troubleshoot')}><AppText>{t('remote.noSignal')}</AppText></Disclosure>
    {dialog ? <WorkflowDialog title={t('remote.remove', { action: actionName(dialog.binding.command) })} onDismiss={dismiss} dismissDisabled={busy || removing}>
      <AppText>{t('remote.removeHelp')}</AppText><AppText tone="label">{inputLabel(dialog.binding).button}</AppText><AppText tone="caption" muted>{inputLabel(dialog.binding).source}</AppText>
      {sharedCount > 1 ? <AppText>{t('remote.sharedRemoval', { count: sharedCount })}</AppText> : null}
      {removeFailed ? <StatusBanner title={t('common.error')} body={t(error && /STALE_REVISION/.test(error) ? 'remote.mappingChanged' : operationErrorKey(error ?? ''))} tone="warning"><Button label={t('remote.reviewButtons')} disabled={busy || removing} onPress={() => { setDialog(null); setSection('buttons'); setRemoveFailed(false); clearError() }} /></StatusBanner> : null}
      <Button label={t('common.delete')} variant="danger" disabled={removalDisabled || removing || Boolean(removeFailed && error && /STALE_REVISION/.test(error))} state={removing ? 'loading' : 'idle'} onPress={confirmRemoval} />
      <Button label={t('common.cancel')} variant="ghost" disabled={busy || removing} onPress={dismiss} />
    </WorkflowDialog> : null}
  </AppShell>
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingVertical: space.sm }, heroStack: { flexDirection: 'column', alignItems: 'stretch' },
  remoteFrame: { width: size.control * 2 + space.md, height: size.control * 3 + space.lg, alignSelf: 'center', borderWidth: size.iconStroke, borderRadius: radius.lg + radius.sm, padding: space.xs, alignItems: 'center', justifyContent: 'space-between', direction: 'ltr' },
  remoteLight: { width: space.xs, height: size.iconStroke, borderRadius: radius.round, marginTop: space.xs }, remotePad: { alignItems: 'center', gap: space.md, paddingVertical: space.xs }, remoteButtons: { flexDirection: 'row', alignItems: 'center', gap: space.xxs }, remoteCenter: { width: space.xl, height: space.xl, borderRadius: radius.round, alignItems: 'center', justifyContent: 'center' }, remoteNext: { width: size.icon, height: space.xl, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' }, remoteMinus: { width: space.sm, height: size.iconStroke }, remoteSlot: { width: space.xl, height: size.iconStroke, marginBottom: space.xs, borderRadius: radius.round },
  actionList: { gap: space.xs }, actionRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.sm }, actionIcon: { width: size.control, height: size.control, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  scope: { borderStartWidth: size.iconStroke, borderRadius: radius.md, padding: space.sm, marginTop: space.xs }, healthGrid: { flexDirection: 'row', gap: space.xs }, healthCell: { flex: 1, padding: space.md, gap: space.xs, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth }, mappingAction: { gap: space.xxs, paddingVertical: space.xs }, binding: { flexDirection: 'row', alignItems: 'center', paddingStart: space.sm, borderRadius: radius.md, minHeight: size.control, width: '100%' }, bindingIdentity: { minWidth: 0, gap: space.xxs, paddingVertical: space.xs }, inputPanel: { alignItems: 'center', borderRadius: radius.lg, padding: space.lg, gap: space.md },
})
