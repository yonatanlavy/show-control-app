import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AppState, PermissionsAndroid, Platform } from 'react-native'
import ShowAudio from '../../modules/show-audio'
import ShowVisual from '../../modules/show-visual'
import { VoiceNative, type VoiceStatus } from '../../modules/show-voice'
import ShowController, { type ControllerDiagnosticMode, type ControllerHealth, type ControllerScanEvent, type NativeControllerInput } from '../../modules/show-controller'
import { resolveNativeAudioEngine } from '../audio'
import type { NativePreviewState, SessionPurpose } from '../audio/contracts'
import { bindInput, eligibleDiagnosticInput, normalizeInput, samePhysicalInput } from '../controllers'
import { ThemeProvider } from '../design'
import { compileRunSnapshot, controllerPreparationIssues, type AudioCue, type ControllerBinding, type ControllerCommand, type ResolvedCue, type RunSnapshot, type Show, type ShowSet } from '../domain'
import { useI18n } from '../i18n'
import { createLibraryStore, type LibrarySnapshot, type LibraryStore } from '../library'
import { isCriticalSessionActive, isCriticalShowSession, setCriticalSessionActive, ShowSession, type ShowSessionState } from '../runtime'
import { isDeviceSettingsActionPending, subscribeDeviceSettingsActions } from '../runtime/device-settings-action'
import { FeedbackContext, type FeedbackOptions, type TaskFeedback } from './feedback'
import { MusicDownloads } from '../music/downloads'
import { SessionStopwatchProvider } from './SessionStopwatch'
import { useCriticalScreenAwake } from './use-critical-screen-awake'

interface AppValue {
  library: LibraryStore; libraryState: LibrarySnapshot; show: Show | null; set: ShowSet | null
  cueIndex: number; currentCueId: string; nextCueId: string; touchGuard: boolean; blackout: boolean; checks: Readonly<Record<string, boolean>>
  session: ShowSessionState; liveSession: boolean; busy: boolean; error: string | null
  controllerHealth: ControllerHealth | null; lastInput: NativeControllerInput | null; receiptCount: number
  controllerInputs: readonly NativeControllerInput[]; controllerScan: ControllerScanEvent | null
  voiceStatus: VoiceStatus | null; disarmVoice: () => Promise<void>
  setTouchGuard: (value: boolean) => void; setBlackout: (value: boolean) => void; toggleCheck: (key: string) => void
  runTask: (work: () => Promise<unknown>, feedback?: FeedbackOptions) => Promise<boolean>; clearError: () => void; retryLastTask: () => Promise<boolean>
  armShow: () => Promise<boolean>; beginRehearsal: () => Promise<boolean>; go: () => number | null; panic: () => number | null; stopAll: () => number | null
  prepareTouchSession: (purpose: SessionPurpose, expected: Pick<RunSnapshot, 'showId' | 'setId' | 'revisionId'>) => Promise<boolean>
  replay: () => number | null; previous: () => number | null; skip: () => number | null
  startCue: (id: string) => number | null; selectCue: (id: string) => number | null
  seek: (id: string, sourcePositionMs: number) => number | null; triggerHit: (id: string) => number | null
  pauseResume: () => number | null; exitShow: () => Promise<boolean>
  preview: (cue: AudioCue, sourcePositionMs?: number) => Promise<void>; scrub: (cue: AudioCue, sourcePositionMs: number, audible?: boolean) => Promise<void>; stopPreview: () => Promise<void>
  previewLibrarySong: (showId: string, cueId: string) => Promise<void>
  previewState: NativePreviewState | null; pausePreview: () => Promise<void>; resumePreview: () => Promise<void>
  pairController: () => Promise<void>; cancelControllerPairing: () => void; refreshControllers: () => Promise<void>
  beginControllerDiagnostics: (mode: Exclude<ControllerDiagnosticMode, 'off'>) => Promise<ControllerHealth>; endControllerDiagnostics: () => Promise<void>
  assignControllerInput: (command: ControllerCommand, input: NativeControllerInput, showId: string) => Promise<void>
  removeControllerBinding: (binding: ControllerBinding, showId: string) => Promise<void>
}
const AppContext = createContext<AppValue | null>(null)
let latestSessionInterface: ShowSession | null = null
const emptyChecks: Record<string, boolean> = { local: false, readable: false, order: false, remote: false, output: false, battery: false, notifications: false, venue: false }
function createShowSession(): ShowSession {
  const resolution = resolveNativeAudioEngine()
  const session = resolution.available ? new ShowSession({ engine: resolution.engine }) : new ShowSession({ engine: null, unavailableReason: resolution.reason })
  latestSessionInterface = session
  if (session.getState().nativeSessionPending) setCriticalSessionActive(true)
  return session
}
function readableLibrary(library: LibraryStore): LibrarySnapshot {
  const fresh = library.getSnapshot()
  if (fresh.status !== 'ready') throw new Error(fresh.error ?? 'The library is not ready.')
  return fresh
}
function createPreviewController(publish: (state: NativePreviewState | null) => void) {
  let signature = ''; let generation = 0; let preparing: Promise<void> = Promise.resolve()
  let nativeGeneration = -1; let minimumNativeGeneration = -1; let state: NativePreviewState | null = null
  let pausedIntent = false
  let last: { cue: ResolvedCue; position: number; initialPaused: boolean } | null = null; let failure: Error | null = null
  const play = (cue: ResolvedCue, position: number, initialPaused = false) => {
    last = { cue, position, initialPaused }; pausedIntent = initialPaused; signature = JSON.stringify(cue); const captured = ++generation; failure = null; state = null; minimumNativeGeneration = nativeGeneration + 1; publish(null)
    preparing = ShowAudio.previewCue(cue, position, initialPaused).then(() => { if (captured === generation && failure) throw failure }).catch((error: unknown) => { if (captured !== generation) return; signature = ''; throw error })
    return preparing
  }
  return {
    play,
    scrub: async (cue: ResolvedCue, position: number, audible = true) => {
      const key = JSON.stringify(cue)
      if (signature !== key) return play(cue, position, !audible && pausedIntent)
      last = { cue, position, initialPaused: !audible && pausedIntent }
      const captured = generation; await preparing
      if (generation === captured) { await ShowAudio.seekPreview(position); if (audible && state?.phase === 'paused') await ShowAudio.resumePreview() }
    },
    accept: (next: NativePreviewState) => {
      if (!last || next.cueId !== last.cue.id || next.generation < Math.max(nativeGeneration, minimumNativeGeneration)) return
      nativeGeneration = next.generation; state = next; pausedIntent = next.phase === 'paused'
      if (next.phase === 'stopped') signature = ''
      publish(next)
    },
    pause: async () => { await ShowAudio.pausePreview(); pausedIntent = true; if (last) last.initialPaused = true },
    resume: async () => { await ShowAudio.resumePreview(); pausedIntent = false; if (last) last.initialPaused = false },
    fail: (message: string, eventGeneration?: number, cueId?: string) => { if (!last || (cueId && cueId !== last.cue.id) || (eventGeneration !== undefined && eventGeneration < Math.max(nativeGeneration, minimumNativeGeneration))) return false; failure = new Error(`PREVIEW_FAILED: ${message}`); signature = ''; state = null; publish(null); return true },
    retry: () => last ? play(last.cue, last.position, last.initialPaused) : Promise.resolve(),
    stop: async () => { generation += 1; signature = ''; last = null; failure = null; state = null; publish(null); if (ShowAudio.availability().available) await ShowAudio.stopPreview() },
  }
}
export function AppProvider({ children }: PropsWithChildren) {
  const [library] = useState(createLibraryStore); const [libraryState, setLibraryState] = useState(() => library.getSnapshot())
  const [showSession] = useState(createShowSession); const [session, setSession] = useState<ShowSessionState>(() => showSession.getState())
  const [previewState, setPreviewState] = useState<NativePreviewState | null>(null)
  const [previewController] = useState(() => createPreviewController(setPreviewState))
  const stopPreview = useCallback(() => previewController.stop(), [previewController])
  const [touchGuard, setTouchGuard] = useState(false); const [blackout, setBlackoutState] = useState(false)
  const [checkState, setChecks] = useState<{ identity: string; values: Record<string, boolean> }>({ identity: '', values: emptyChecks })
  const checkStateRef = useRef(checkState)
  const deviceSettingsPending = useSyncExternalStore(subscribeDeviceSettingsActions, isDeviceSettingsActionPending, () => false)
  const [pendingTaskCount, setPendingTaskCount] = useState(0); const busy = pendingTaskCount > 0 || session.nativeSessionPending === true || deviceSettingsPending; const [error, setErrorState] = useState<string | null>(null)
  const errorRef = useRef<string | null>(null)
  const setError = useCallback((next: string | null) => { errorRef.current = next; setErrorState(next) }, [])
  const pendingWorkRef = useRef(0); const armingRef = useRef(false); const criticalPreparationRef = useRef(false); const failedTaskRef = useRef<(() => Promise<unknown>) | null>(null)
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null); const feedbackId = useRef(0)
  const mountedRef = useRef(true)
  const dismissFeedback = useCallback(() => setFeedback(null), [])
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])
  const [controllerHealth, setControllerHealth] = useState<ControllerHealth | null>(null); const [lastInput, setLastInput] = useState<NativeControllerInput | null>(null); const [receiptCount, setReceiptCount] = useState(0)
  const [controllerInputs, setControllerInputs] = useState<readonly NativeControllerInput[]>([]); const [controllerScan, setControllerScan] = useState<ControllerScanEvent | null>(null)
  const controllerPairGeneration = useRef(0)
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null)
  const { setLocale } = useI18n()
  const show = libraryState.status === 'ready' ? libraryState.shows.find((candidate) => candidate.id === libraryState.selectedShowId) ?? null : null
  const set = show?.sets.find((candidate) => candidate.id === libraryState.selectedSetId) ?? show?.sets[0] ?? null
  const liveSession = isCriticalShowSession(session)
  useCriticalScreenAwake(liveSession && session.phase !== 'preparing')
  const currentIdentity = JSON.stringify([show?.id ?? null, show?.revisionId ?? null, set?.id ?? null])
  const checks = checkState.identity === currentIdentity ? checkState.values : emptyChecks
  useEffect(() => { const unsubscribe = library.subscribe(() => setLibraryState(library.getSnapshot())); void library.initialize().catch((failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure))); return unsubscribe }, [library, setError])
  useEffect(() => { if (libraryState.status === 'ready') setLocale(libraryState.settings.locale) }, [libraryState.settings.locale, libraryState.status, setLocale])
  useEffect(() => {
    if (!ShowAudio.availability().available) return undefined
    const subscription = ShowAudio.addListener((event) => {
      if (event.type === 'PREVIEW_STATE') { if (!isCriticalSessionActive()) previewController.accept(event); return }
      if (event.type !== 'PREVIEW_ERROR' || isCriticalSessionActive()) return
      const detail = `${event.code}: ${event.message}`
      if (!previewController.fail(detail, event.generation, event.cueId)) return
      setFeedback(null); setError(`PREVIEW_FAILED: ${detail}`)
      failedTaskRef.current = () => { if (isCriticalSessionActive()) return Promise.reject(new Error('editor.previewSafety')); return previewController.retry() }
    })
    return () => subscription.remove()
  }, [previewController, setError])
  useEffect(() => {
    setCriticalSessionActive(criticalPreparationRef.current || isCriticalShowSession(showSession.getState()))
    let previousNativeCue = showSession.getState().currentCueId
    let previousNativeSelection = showSession.getState().selectedCueId
    const subscription = showSession.subscribe((next) => {
      setCriticalSessionActive(criticalPreparationRef.current || isCriticalShowSession(next)); setSession(next)
      const event = next.lastEvent
      const rootChanged = event?.type === 'RUN_STATE' && event.currentCueId !== previousNativeCue
      const selectionChanged = rootChanged || event?.type === 'RUN_STATE' && event.selectedCueId !== previousNativeSelection
      if (event?.type === 'RUN_STATE') { previousNativeCue = event.currentCueId; previousNativeSelection = event.selectedCueId }
      if (event?.type === 'CAPACITY_REFUSAL') setError('CAPACITY_REFUSAL')
      else if (event?.type === 'TRANSITION_REFUSED') setError('TRANSITION_REFUSED')
      else if (event?.type === 'RUN_STATE' && event.phase !== 'interrupted' && event.transitionRefusal) setError('TRANSITION_REFUSED')
      else if (event?.type === 'RUN_STATE' && selectionChanged) {
        if (errorRef.current === 'TRANSITION_REFUSED' || errorRef.current === 'CAPACITY_REFUSAL') setError(null)
      }
      else if (event?.type === 'ROUTE_CHANGE') setError('ROUTE_CHANGE')
      else if (event?.type === 'INTERRUPTION' || event?.type === 'FAULT') setError(`PLAYBACK_FAULT: ${next.detail}`)
    })
    const lifecycle = AppState.addEventListener('change', (state) => { if (state === 'active') void showSession.reconcile().catch(() => undefined) })
    if (showSession.canAttachPreparedSession()) void showSession.attachPreparedSession()
    return () => {
      subscription.remove(); lifecycle.remove()
      if (criticalPreparationRef.current || isCriticalShowSession(showSession.getState())) { showSession.detach(); return }
      if (latestSessionInterface === showSession) setCriticalSessionActive(false)
      void showSession.shutdown(); void previewController.stop().catch(() => undefined)
      if (ShowController.isAvailable()) void ShowController.stop().catch(() => undefined)
    }
  }, [showSession, previewController, setError])
  useEffect(() => {
    let active = true; let observedStatus = false
    const readStatus = async () => {
      try { const value = await VoiceNative.getStatus(); if (active && !observedStatus) setVoiceStatus(value) }
      catch { if (active && !observedStatus) setVoiceStatus({ available: false, armed: false, modelReady: false, calibrated: false, detail: '' }) }
    }
    void readStatus()
    const subscription = VoiceNative.subscribe((value) => { if (active) { observedStatus = true; setVoiceStatus(value) } })
    return () => {
      active = false; subscription.remove()
      if (!criticalPreparationRef.current && !isCriticalShowSession(showSession.getState())) {
        // The optional backend may be unavailable during teardown. There is no
        // mounted interface to update, and failure must not announce disarm success.
        try { void VoiceNative.disarm().catch(() => undefined) } catch { /* Native lookup can also fail synchronously. */ }
      }
    }
  }, [showSession])
  useEffect(() => {
    if (!ShowController.isAvailable()) return undefined
    const inputs = ShowController.addInputListener((event) => {
      if (event.phase === 'down' && !event.isRepeat && !event.wasQueued && event.ageMs === 0) {
        setLastInput(event); setReceiptCount((count) => count + 1)
        setControllerInputs((previous) => previous.some((value) => value.eventId === event.eventId) ? previous : event.diagnosticMode && event.diagnosticMode !== 'off' ? previous.length >= 128 ? previous : [...previous, event] : [...previous.slice(-31), event])
      }
      if (!liveSession || event.handledNatively) return
      const prepared = showSession.getState().snapshot
      const profile = prepared ? prepared.controllerProfile : libraryState.controllerProfiles.find((candidate) => candidate.id === show?.controllerProfileId)
      if (!profile) return
      const normalized = normalizeInput(event, profile)
      if (normalized) showSession.dispatchController(normalized.command, `native:${event.eventId}`)
    })
    const health = ShowController.addHealthListener((next) => setControllerHealth((previous) => previous ? { ...previous, ...next } : next))
    const scan = ShowController.addScanListener(setControllerScan)
    return () => { inputs.remove(); health.remove(); scan.remove() }
  }, [libraryState.controllerProfiles, liveSession, show?.controllerProfileId, showSession])
  const runTask = useCallback(async (work: () => Promise<unknown>, options?: FeedbackOptions, preserveFeedback = false): Promise<boolean> => {
    pendingWorkRef.current += 1; setPendingTaskCount((count) => count + 1)
    if (!preserveFeedback) { setError(null); setFeedback(null) }
    // Foreground download recovery may finish after a picker/import fails.
    // Only the failed operation itself can clear its stored retry callback.
    try { const result = await work(); if (!mountedRef.current) return false; if (failedTaskRef.current === work) failedTaskRef.current = null; if (!preserveFeedback && !options?.silent && result !== null) setFeedback({ id: ++feedbackId.current, message: options?.message ?? 'common.complete', ...(options?.undo ? { undo: options.undo } : {}) }); return true }
    catch (failure) { if (mountedRef.current) { const cancelled = failure instanceof Error && failure.name === 'AbortError'; if (!cancelled && (!preserveFeedback || (!failedTaskRef.current && errorRef.current === null))) { failedTaskRef.current = work; setError(failure instanceof Error ? failure.message : String(failure)) } else if (cancelled && failedTaskRef.current === work) failedTaskRef.current = null }; return false }
    finally { pendingWorkRef.current -= 1; if (mountedRef.current) setPendingTaskCount((count) => Math.max(0, count - 1)) }
  }, [setError])
  const refreshControllers = useCallback(async () => {
    if (isCriticalSessionActive()) throw new Error('REMOTE_SETUP_ARMED')
    const fresh = library.getSnapshot(); const selected = fresh.shows.find((candidate) => candidate.id === fresh.selectedShowId)
    const profile = fresh.controllerProfiles.find((candidate) => candidate.id === (selected?.controllerProfileId ?? `profile-${selected?.id ?? ''}`))
    await ShowController.configure({ background: false })
    await ShowController.configureProfile(profile ?? { id: 'unassigned', name: '', bindings: [] })
    if (isCriticalSessionActive()) throw new Error('REMOTE_SETUP_ARMED')
    await ShowController.start(); if (mountedRef.current) setControllerHealth(await ShowController.health())
  }, [library])
  const endControllerDiagnostics = useCallback(async () => {
    if (!ShowController.isAvailable()) return
    const health = await ShowController.setDiagnosticMode('off')
    if (mountedRef.current) setControllerHealth(health)
  }, [])
  const cancelControllerPairing = useCallback(() => { controllerPairGeneration.current += 1; ShowController.cancelScan(); setControllerScan(null) }, [])
  const beginControllerDiagnostics = useCallback(async (mode: 'learn' | 'test') => {
    if (isCriticalSessionActive()) throw new Error('REMOTE_SETUP_ARMED')
    await previewController.stop(); await refreshControllers()
    if (isCriticalSessionActive()) throw new Error('REMOTE_SETUP_ARMED')
    const health = await ShowController.setDiagnosticMode(mode)
    if (mountedRef.current) { setControllerHealth(health); setLastInput(null); setControllerInputs([]) }
    else await ShowController.setDiagnosticMode('off')
    return health
  }, [previewController, refreshControllers])
  useEffect(() => {
    if (libraryState.status !== 'ready') return
    const recover = () => { if (!isCriticalSessionActive()) void runTask(() => MusicDownloads.recover(library), { silent: true }, true) }
    recover()
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') recover() })
    return () => subscription.remove()
  }, [library, libraryState.status, liveSession, runTask])
  const prepareSession = useCallback(async (purpose: SessionPurpose, touchIdentity?: Pick<RunSnapshot, 'showId' | 'setId' | 'revisionId'>) => {
    const expectedTouch = touchIdentity ? { ...touchIdentity } : null
    const context = (ownsTask: boolean) => {
      const fresh = library.getSnapshot()
      const selectedShow = fresh.shows.find((candidate) => candidate.id === fresh.selectedShowId)
      const selectedSet = selectedShow?.sets.find((candidate) => candidate.id === fresh.selectedSetId) ?? selectedShow?.sets[0]
      const identity = JSON.stringify([selectedShow?.id ?? null, selectedShow?.revisionId ?? null, selectedSet?.id ?? null])
      if (AppState.currentState !== 'active' || isCriticalSessionActive() || isDeviceSettingsActionPending() || armingRef.current || !selectedShow || !selectedSet?.cueOrder.length || isCriticalShowSession(showSession.getState()) || pendingWorkRef.current > (ownsTask ? 1 : 0) || fresh.status !== 'ready' || fresh.saving || (purpose === 'performance' && (checkStateRef.current.identity !== identity || !['local', 'readable', 'order'].every((key) => checkStateRef.current.values[key])))) return null
      return { fresh, selectedShow, selectedSet, identity }
    }
    const initial = context(false)
    if (!initial) return false
    // Global Retry invokes this same work again. It must acquire fresh admission
    // for the captured selection rather than reusing a released preparation lease.
    return runTask(async () => {
      const current = context(true)
      if (!current) throw new DOMException('Cancelled', 'AbortError')
      const { fresh, selectedShow, selectedSet, identity } = current
      if (identity !== initial.identity || expectedTouch && (expectedTouch.showId !== selectedShow.id || expectedTouch.setId !== selectedSet.id || expectedTouch.revisionId !== selectedShow.revisionId)) throw new Error('STALE_REVISION')
      const assignedProfile = fresh.controllerProfiles.find((candidate) => candidate.id === selectedShow.controllerProfileId)
      if (expectedTouch && (!selectedShow.controllerProfileId || controllerPreparationIssues(selectedShow, selectedSet, fresh.controllerProfiles).length === 0)) throw new Error('STALE_REVISION')
      const { controllerProfileId: _savedProfile, ...touchShow } = selectedShow
      const runtimeShow = expectedTouch ? touchShow : selectedShow
      armingRef.current = true; criticalPreparationRef.current = true; setCriticalSessionActive(true)
      let nativePreparationStarted = false
      try {
        const ensureMounted = () => { if (!mountedRef.current) throw new DOMException('Cancelled', 'AbortError') }
        const ensureTouchCurrent = () => {
          ensureMounted()
          if (!expectedTouch) return
          const latest = library.getSnapshot(); const source = latest.shows.find((candidate) => candidate.id === latest.selectedShowId)
          const target = source?.sets.find((candidate) => candidate.id === latest.selectedSetId) ?? source?.sets[0]
          if (latest.status !== 'ready' || latest.saving || source?.id !== expectedTouch.showId || source.revisionId !== expectedTouch.revisionId || target?.id !== expectedTouch.setId) throw new Error('STALE_REVISION')
          if (AppState.currentState !== 'active' || isDeviceSettingsActionPending()) throw new DOMException('Cancelled', 'AbortError')
        }
        const compiled = compileRunSnapshot(runtimeShow, selectedSet.id, fresh.controllerProfiles)
        if (!compiled.ok) throw new Error(compiled.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n'))
        await previewController.stop(); ensureTouchCurrent()
        let controllerConfigured = false
        if (ShowController.isAvailable()) {
          if (expectedTouch) {
            // Clearing is mandatory when the adapter exists. Old native or JS
            // mappings must not replace the intentionally profile-free snapshot.
            await ShowController.stop(); ensureTouchCurrent()
            await ShowController.configureProfile({ id: 'unassigned', name: '', bindings: [] }); ensureTouchCurrent()
          } else {
            try { await ShowController.stop(); ensureMounted(); if (assignedProfile) { await ShowController.configure({ background: true }); ensureMounted(); await ShowController.configureProfile(assignedProfile); ensureMounted(); controllerConfigured = true } }
            catch (failure) { ensureMounted(); setError(`CONTROLLER_SETUP_FAILED: ${failure instanceof Error ? failure.message : String(failure)}`) }
          }
        }
        try { await ShowVisual.configure({ enabled: fresh.settings.externalDisplayEnabled }); ensureTouchCurrent(); if (fresh.settings.externalDisplayEnabled) await ShowVisual.prepare(compiled.snapshot) }
        catch (failure) { if (expectedTouch && failure instanceof Error && (failure.name === 'AbortError' || failure.message === 'STALE_REVISION')) throw failure; setError(failure instanceof Error ? failure.message : String(failure)) }
        ensureTouchCurrent()
        nativePreparationStarted = true
        ShowAudio.configurePresentationLocale?.(fresh.settings.locale)
        const result = await showSession.prepareShow(runtimeShow, selectedSet.id, fresh.controllerProfiles, purpose)
        if (!mountedRef.current) { showSession.detach(); ensureMounted() }
        if (!result.ok || !result.nativePrepared) throw new Error(result.ok ? showSession.getState().detail : result.detail)
        if (controllerConfigured) {
          try { await ShowController.start(); ensureMounted(); const health = await ShowController.health(); ensureMounted(); setControllerHealth(health) }
          catch (failure) { if (!mountedRef.current) { showSession.detach(); ensureMounted() }; setError(`CONTROLLER_SETUP_FAILED: ${failure instanceof Error ? failure.message : String(failure)}`) }
        }
      } finally {
        armingRef.current = false; criticalPreparationRef.current = false
        if (latestSessionInterface === showSession && (mountedRef.current || !nativePreparationStarted)) setCriticalSessionActive(isCriticalShowSession(showSession.getState()))
      }
    }, { silent: true })
  }, [library, previewController, runTask, showSession, setError])
  const value = useMemo<AppValue>(() => ({
    library, libraryState, show, set, cueIndex: session.currentCueIndex, currentCueId: session.currentCueId,
    nextCueId: session.snapshot ? session.nextCueId : (set?.cueOrder[0] ?? ''), touchGuard, blackout, checks, session, liveSession, busy, error,
    controllerHealth, controllerInputs, controllerScan, lastInput, receiptCount, voiceStatus, disarmVoice: async () => { setVoiceStatus(await VoiceNative.disarm()) }, runTask, retryLastTask: () => {
      if (library.getSnapshot().status === 'error') {
        // A failed mutation may already have committed. Reopening owns recovery;
        // its obsolete callback must never be replayed after the library returns.
        failedTaskRef.current = null
        return runTask(() => library.initialize())
      }
      const retry = failedTaskRef.current
      if (!retry) return Promise.resolve(false)
      // A cancelled picker returns before the store starts another transaction.
      // Acknowledge its previous durable error before the deliberate retry.
      library.clearError()
      return runTask(retry)
    }, clearError: () => { setError(null); library.clearError() }, setTouchGuard,
    setBlackout: (next) => { setBlackoutState(next); if (next) setTouchGuard(true) },
    toggleCheck: (key) => {
      const previous = checkStateRef.current
      const values = previous.identity === currentIdentity ? previous.values : emptyChecks
      const next = { identity: currentIdentity, values: { ...values, [key]: !values[key] } }
      checkStateRef.current = next; setChecks(next)
    },
    armShow: () => prepareSession('performance'),
    beginRehearsal: () => prepareSession('rehearsal'),
    prepareTouchSession: (purpose, expected) => prepareSession(purpose, expected),
    go: () => showSession.go('touch:go'), panic: () => showSession.panic('touch:panic'), stopAll: () => showSession.stopAll('touch:stop'),
    replay: () => showSession.replay('touch:replay'), previous: () => showSession.previous('touch:previous'), skip: () => showSession.skip('touch:skip'),
    startCue: (id) => showSession.startCue(id, `touch:start:${id}`), selectCue: (id) => showSession.select(id, `touch:select:${id}`),
    seek: (id, position) => showSession.seekRehearsal(id, position, `touch:seek:${id}:${position}`), triggerHit: (id) => showSession.triggerHit(id, `touch:hit:${id}`),
    pauseResume: () => showSession.pauseResume('touch:pause'), exitShow: async () => { const exited = await showSession.exitRun(); if (exited) { setTouchGuard(false); setBlackoutState(false); setError(null) }; return exited },
    previewLibrarySong: async (showId, cueId) => {
      if (isCriticalSessionActive() || liveSession || session.snapshot) throw new Error('editor.previewSafety')
      const fresh = readableLibrary(library)
      const source = fresh.shows.find((value) => value.id === showId); const cue = source?.cues[cueId]
      if (!source || cue?.type !== 'audio' || !source.media[cue.mediaAssetId]) throw new Error('MISSING_MEDIA')
      await previewController.play({ ...cue, mediaAsset: source.media[cue.mediaAssetId]! }, cue.trimInMs)
    },
    preview: async (cue, position = cue.trimInMs) => { if (isCriticalSessionActive() || liveSession || session.snapshot) throw new Error('editor.previewSafety'); const mediaAsset = readableLibrary(library).shows.find((candidate) => candidate.id === show?.id)?.media[cue.mediaAssetId]; if (!mediaAsset) throw new Error('MISSING_MEDIA'); await previewController.play({ ...cue, mediaAsset }, position) },
    scrub: async (cue, position, audible = true) => { if (isCriticalSessionActive() || liveSession || session.snapshot) throw new Error('editor.previewSafety'); const mediaAsset = readableLibrary(library).shows.find((candidate) => candidate.id === show?.id)?.media[cue.mediaAssetId]; if (!mediaAsset) throw new Error('MISSING_MEDIA'); await previewController.scrub({ ...cue, mediaAsset }, position, audible) },
    stopPreview,
    previewState,
    pausePreview: () => { if (isCriticalSessionActive()) return Promise.reject(new Error('editor.previewSafety')); return previewController.pause() },
    resumePreview: () => { if (isCriticalSessionActive()) return Promise.reject(new Error('editor.previewSafety')); try { readableLibrary(library) } catch (failure) { return Promise.reject(failure) }; return previewController.resume() },
    refreshControllers, beginControllerDiagnostics, endControllerDiagnostics,
    cancelControllerPairing,
    pairController: async () => {
      if (isCriticalSessionActive()) throw new Error('REMOTE_SETUP_ARMED')
      const generation = ++controllerPairGeneration.current
      if (Platform.OS === 'android') {
        const permissions = Number(Platform.Version) >= 31 ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]
        const result = await PermissionsAndroid.requestMultiple(permissions)
        if (controllerPairGeneration.current !== generation || !mountedRef.current) throw new DOMException('Cancelled', 'AbortError')
        if (permissions.some((permission) => result[permission] !== PermissionsAndroid.RESULTS.GRANTED)) throw new Error('REMOTE_PERMISSION_DENIED')
      }
      if (isCriticalSessionActive()) throw new Error('REMOTE_SETUP_ARMED')
      if (controllerPairGeneration.current !== generation || !mountedRef.current) throw new DOMException('Cancelled', 'AbortError')
      await ShowController.configure({ background: false })
      if (controllerPairGeneration.current !== generation || !mountedRef.current) throw new DOMException('Cancelled', 'AbortError')
      await ShowController.scanAndPair(); await refreshControllers()
    },
    assignControllerInput: async (command, input, showId) => {
      if (isCriticalSessionActive()) throw new Error('REMOTE_SETUP_ARMED')
      const native = await ShowController.health()
      if (native.diagnosticMode !== 'learn' || !eligibleDiagnosticInput(input, native.diagnosticSessionId ?? '')) throw new Error('REMOTE_INPUT_EXPIRED')
      const fresh = library.getSnapshot(); const latest = fresh.shows.find((candidate) => candidate.id === showId); if (!latest || fresh.selectedShowId !== showId) throw new Error('STALE_REVISION')
      const profileId = latest.controllerProfileId ?? `profile-${latest.id}`
      const previous = fresh.controllerProfiles.find((candidate) => candidate.id === profileId)
      const profile = bindInput(previous ?? { id: profileId, name: latest.name, bindings: [] }, input, command)
      await library.saveControllerProfile(profile, showId)
      await ShowController.configureProfile(profile); await endControllerDiagnostics()
    },
    removeControllerBinding: async (binding, showId) => {
      if (isCriticalSessionActive()) throw new Error('REMOTE_SETUP_ARMED')
      const fresh = library.getSnapshot(); if (fresh.selectedShowId !== showId) throw new Error('STALE_REVISION')
      const latest = fresh.shows.find((candidate) => candidate.id === showId); const previous = fresh.controllerProfiles.find((candidate) => candidate.id === (latest?.controllerProfileId ?? `profile-${showId}`))
      if (!previous) throw new Error('STALE_REVISION')
      const exact = (candidate: ControllerBinding) => samePhysicalInput(candidate, binding) && candidate.command.type === binding.command.type &&
        (!('cueId' in binding.command) || 'cueId' in candidate.command && candidate.command.cueId === binding.command.cueId)
      if (!previous.bindings.some(exact)) throw new Error('STALE_REVISION')
      // Identical imported rows represent the same action. Remove only those
      // exact semantics; a newer safety action or another target must survive.
      const profile = { ...previous, bindings: previous.bindings.filter((candidate) => !exact(candidate)) }
      await library.saveControllerProfile(profile, showId, previous)
      if (ShowController.isAvailable()) {
        try { await ShowController.configureProfile(profile) }
        catch (failure) {
          // The local removal already committed. Never register deletion as a
          // failed task that Retry could replay; the hub owns native repair.
          setError(`CONTROLLER_SETUP_FAILED: ${failure instanceof Error ? failure.message : String(failure)}`)
        }
      }
    },
  }), [library, libraryState, show, set, session, showSession, prepareSession, previewController, previewState, stopPreview, liveSession, touchGuard, blackout, checks, currentIdentity, busy, error, controllerHealth, controllerInputs, controllerScan, lastInput, receiptCount, voiceStatus, runTask, refreshControllers, beginControllerDiagnostics, endControllerDiagnostics, cancelControllerPairing, setError])
  const failure = libraryState.status === 'error' ? libraryState.error ?? error : error ?? libraryState.error
return <AppContext.Provider value={value}><FeedbackContext.Provider value={{ feedback, dismiss: dismissFeedback, undo: () => { const action = feedback?.undo; setFeedback(null); if (action) void runTask(action) }, failure: failure ? { detail: failure, busy, retry: () => { void value.retryLastTask() }, dismiss: libraryState.status === 'error' ? undefined : value.clearError } : null }}><ThemeProvider theme={libraryState.settings.theme}><SessionStopwatchProvider sessionId={session.snapshot ? `${session.snapshot.showId}:${session.snapshot.setId}:${session.snapshot.revisionId}:${session.sessionPurpose}` : 'idle'}>{children}</SessionStopwatchProvider></ThemeProvider></FeedbackContext.Provider></AppContext.Provider>
}
export function useApp() { const value = useContext(AppContext); if (!value) throw new Error('useApp must be used inside AppProvider'); return value }
