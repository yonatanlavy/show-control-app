import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import { Alert, Modal, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { compileRunSnapshot, sampleControllerProfiles, sampleShow } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import { LibraryScreen, BuilderScreen, OperationStatus } from '../library-screens'
import { RecoveryScreen, RunScreen } from '../screens'
import { ValueSlider } from '../primitives'
import { FeedbackContext } from '../feedback'

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() }
const mockLibrary = { createShow: jest.fn(), renameShow: jest.fn(), removeShow: jest.fn(), exportBackup: jest.fn().mockResolvedValue('file:///library/backup.zip'), shareBackup: jest.fn().mockResolvedValue(undefined), importBackup: jest.fn(), select: jest.fn(), updateCue: jest.fn(), waveform: jest.fn().mockResolvedValue([0.2, 0.8, 0.4]), history: jest.fn().mockResolvedValue([]), trash: jest.fn().mockResolvedValue([]), saveShow: jest.fn(), getSnapshot: () => mockApp.libraryState }
const mockPanic = jest.fn(); const mockPrevious = jest.fn(); const mockGo = jest.fn(); const mockSelect = jest.fn(); const mockStart = jest.fn()
const mockCompiled = compileRunSnapshot(sampleShow, sampleShow.sets[0]!.id, sampleControllerProfiles)
if (!mockCompiled.ok) throw new Error('The Run fixture must compile to a real immutable media shape')
const mockApp = {
  show: sampleShow, set: sampleShow.sets[0], library: mockLibrary,
  libraryState: { shows: [sampleShow], selectedShowId: sampleShow.id, settings: { locale: 'en', theme: 'darkBlue' }, status: 'ready', saving: false, controllerProfiles: [] },
  runTask: async (work: () => Promise<unknown>) => { await work(); return true }, busy: false, error: null as string | null, clearError: jest.fn(),
  touchGuard: false, blackout: false, setTouchGuard: jest.fn(), setBlackout: jest.fn(), go: mockGo, panic: mockPanic, stopAll: jest.fn(), pauseResume: jest.fn(),
  replay: jest.fn(), previous: mockPrevious, skip: jest.fn(), selectCue: mockSelect, startCue: mockStart, exitShow: jest.fn().mockResolvedValue(true),
  session: { phase: 'ready', snapshot: { ...mockCompiled.snapshot, transportMode: 'oms' }, activeVoiceCount: 0, pendingCommandIds: [], selectedCueId: 'opening', currentCueId: '', nextCueId: 'bed', countdownRemainingMs: 0, currentCueIndex: 0, nextCueIndex: 1, nativeSessionPending: false, hasPendingActions: false, detail: '', progressCueId: '', progressPositionMs: null, progressDurationMs: null },
  currentCueId: '', nextCueId: 'bed', cueIndex: 0, preview: jest.fn(), stopPreview: jest.fn().mockResolvedValue(undefined),
}
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: function useFocusEffect(effect: () => void | (() => void)) {
    const React = jest.requireActual<typeof import('react')>('react')
    React.useEffect(effect, [effect])
  },
}))
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
const wrap = (screen: React.ReactNode) => <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}><I18nProvider>{screen}</I18nProvider></SafeAreaInsetsContext.Provider>

describe('connected OMS UI', () => {
  it.each([
    ['landscape', 844, 390, 'CAPACITY_REFUSAL', 'run.capacityWarning'],
    ['landscape', 844, 390, 'TRANSITION_REFUSED', 'practice.transitionRefused'],
    ['short portrait', 360, 640, 'CAPACITY_REFUSAL', 'run.capacityWarning'],
    ['short portrait', 360, 640, 'TRANSITION_REFUSED', 'practice.transitionRefused'],
  ] as const)('explains refusal in %s Run at %s × %s for %s without moving safety controls', (_layout, width, height, error, key) => {
    const dimensions = jest.spyOn(jest.requireActual<typeof import('react-native')>('react-native'), 'useWindowDimensions').mockReturnValue({ width, height, scale: 1, fontScale: 1.5 })
    const before = { ...mockApp.session }; const current = mockApp.currentCueId
    const controlSize = (style: StyleProp<ViewStyle>) => { const value = StyleSheet.flatten(style); return { height: value.height, minHeight: value.minHeight, paddingVertical: value.paddingVertical } }
    try {
      Object.assign(mockApp.session, { phase: 'running', currentCueId: 'opening', activeVoiceCount: 1 })
      mockApp.currentCueId = 'opening'
      const screen = render(wrap(<RunScreen />))
      const panicName = messages.en['run.fade'].replace('{seconds}', '2')
      const goName = `${messages.en['run.next']} · Tension bed`
      const goSize = controlSize(screen.getByRole('button', { name: goName }).props.style)
      const panicSize = controlSize(screen.getByRole('button', { name: panicName }).props.style)
      mockApp.error = error; screen.rerender(wrap(<RunScreen />))
      const feedback = screen.getByText(messages.en[key])
      expect(feedback.props.accessibilityLabel).toContain('Tension bed')
      expect(feedback.props.accessibilityLabel).toContain(messages.en[key])
      expect(feedback.props.accessibilityLiveRegion).toBe('polite')
      expect(screen.getByRole('button', { name: goName })).toBeEnabled()
      expect(mockGo).not.toHaveBeenCalled()
      fireEvent.press(screen.getByRole('button', { name: goName })); expect(mockGo).toHaveBeenCalledTimes(1)
      mockApp.error = null; mockApp.session.phase = 'fading'; screen.rerender(wrap(<RunScreen />))
      expect(screen.queryByText(messages.en[key])).toBeNull()
      expect(screen.getByText(messages.en['use.run.wait'])).toBeTruthy()
      expect(screen.getByRole('button', { name: /^GO/ })).toBeDisabled()
      expect(controlSize(screen.getByRole('button', { name: /^GO/ }).props.style)).toEqual(goSize)
      expect(controlSize(screen.getByRole('button', { name: panicName }).props.style)).toEqual(panicSize)
      expect(screen.getByRole('button', { name: panicName })).toBeEnabled()
    } finally { Object.assign(mockApp.session, before); mockApp.currentCueId = current; mockApp.error = null; dimensions.mockRestore() }
  })

  it('shows completion only after the native OMS cursor has passed the final song and keeps GO silent', () => {
    const dimensions = jest.spyOn(jest.requireActual<typeof import('react-native')>('react-native'), 'useWindowDimensions').mockReturnValue({ width: 844, height: 390, scale: 1, fontScale: 1 })
    const before = { ...mockApp.session }; const aliases = { currentCueId: mockApp.currentCueId, nextCueId: mockApp.nextCueId }
    try {
      const order = mockApp.session.snapshot.cueOrder; const finalId = order[order.length - 1]!
      Object.assign(mockApp.session, { phase: 'running', currentCueId: finalId, selectedCueId: finalId, nextCueId: '', currentCueIndex: order.length - 1, nextCueIndex: order.length, activeVoiceCount: 1 })
      mockApp.currentCueId = finalId; mockApp.nextCueId = ''
      const screen = render(wrap(<RunScreen />))
      expect(screen.getByRole('button', { name: messages.en['run.next'] })).toBeEnabled()
      expect(screen.queryByText(messages.en['use.run.finished'])).toBeNull()
      Object.assign(mockApp.session, { phase: 'stopped', currentCueId: '', selectedCueId: '', nextCueId: '', currentCueIndex: -1, nextCueIndex: order.length + 1, activeVoiceCount: 0 })
      mockApp.currentCueId = ''; screen.rerender(wrap(<RunScreen />))
      expect(screen.getByRole('button', { name: messages.en['common.complete'] })).toBeDisabled()
      expect(screen.getByText(messages.en['use.run.finished'])).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: messages.en['common.complete'] })); expect(mockGo).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: messages.en['run.recovery'] })).toBeEnabled()
      expect(screen.getByRole('button', { name: messages.en['run.fade'].replace('{seconds}', '2') })).toBeEnabled()
      // Independent Hits and their scheduled work do not reopen the main stack.
      Object.assign(mockApp.session, { activeVoiceCount: 2, hasPendingActions: true }); screen.rerender(wrap(<RunScreen />))
      expect(screen.getByRole('button', { name: messages.en['common.complete'] })).toBeDisabled()
      expect(screen.getByRole('button', { name: messages.en['run.pause'] })).toBeEnabled()
      Object.assign(mockApp.session, { selectedCueId: finalId, nextCueIndex: order.length, phase: 'ready', activeVoiceCount: 0, hasPendingActions: false })
      screen.rerender(wrap(<RunScreen />))
      expect(screen.queryByText(messages.en['use.run.finished'])).toBeNull()
      expect(screen.getByRole('button', { name: `${messages.en['run.go']} · ${mockApp.session.snapshot.cues[finalId]!.name}` })).toBeEnabled()
    } finally { Object.assign(mockApp.session, before); Object.assign(mockApp, aliases); dimensions.mockRestore() }
  })

  it('marks an exhausted legacy cue stack complete only after its remaining audio ends', () => {
    const before = { ...mockApp.session }; const aliases = { currentCueId: mockApp.currentCueId, nextCueId: mockApp.nextCueId }
    try {
      const order = mockApp.session.snapshot.cueOrder; const finalId = order[order.length - 1]!
      Object.assign(mockApp.session, { snapshot: { ...mockApp.session.snapshot, transportMode: 'legacyCueStack' }, phase: 'running', currentCueId: finalId, selectedCueId: finalId, nextCueId: '', nextCueIndex: order.length, activeVoiceCount: 1 })
      mockApp.currentCueId = finalId; mockApp.nextCueId = ''
      const screen = render(wrap(<RunScreen />))
      expect(screen.queryByRole('button', { name: messages.en['common.complete'] })).toBeNull()
      Object.assign(mockApp.session, { phase: 'ready', activeVoiceCount: 0 }); screen.rerender(wrap(<RunScreen />))
      expect(screen.getByRole('button', { name: messages.en['common.complete'] })).toBeDisabled()
      expect(mockGo).not.toHaveBeenCalled()
    } finally { Object.assign(mockApp.session, before); Object.assign(mockApp, aliases) }
  })

  it.each(['unprepared', 'interrupted', 'fault', 'inspecting'] as const)('does not call %s Run state a finished set merely because selection is empty', (kind) => {
    const dimensions = jest.spyOn(jest.requireActual<typeof import('react-native')>('react-native'), 'useWindowDimensions').mockReturnValue({ width: 844, height: 390, scale: 1, fontScale: 1 })
    const before = { ...mockApp.session }; const aliases = { currentCueId: mockApp.currentCueId, nextCueId: mockApp.nextCueId }
    try {
      Object.assign(mockApp.session, { phase: kind === 'interrupted' || kind === 'fault' ? kind : 'stopped', currentCueId: '', selectedCueId: '', nextCueId: '', activeVoiceCount: 0, nextCueIndex: kind === 'unprepared' ? 0 : mockApp.session.snapshot.cueOrder.length + 1, nativeSessionPending: kind === 'inspecting' })
      mockApp.currentCueId = ''; mockApp.nextCueId = ''
      const screen = render(wrap(<RunScreen />))
      expect(screen.queryByRole('button', { name: messages.en['common.complete'] })).toBeNull()
      expect(screen.queryByText(messages.en['use.run.finished'])).toBeNull()
      expect(mockGo).not.toHaveBeenCalled()
    } finally { Object.assign(mockApp.session, before); Object.assign(mockApp, aliases); dimensions.mockRestore() }
  })

  it('keeps Hit-only Pause subject to Touch Guard and recovery without moving its control', () => {
    const before = { ...mockApp.session }; const guarded = mockApp.touchGuard
    try {
      Object.assign(mockApp.session, { phase: 'ready', activeVoiceCount: 8 })
      mockApp.touchGuard = false
      const screen = render(wrap(<RunScreen />))
      const pause = () => screen.getByRole('button', { name: messages.en['run.pause'] })
      const originalStyle = StyleSheet.flatten(pause().props.style)
      expect(pause()).toBeEnabled()
      mockApp.touchGuard = true; screen.rerender(wrap(<RunScreen />))
      expect(pause()).toBeDisabled()
      mockApp.touchGuard = false; mockApp.session.phase = 'interrupted'; screen.rerender(wrap(<RunScreen />))
      expect(pause()).toBeDisabled()
      expect(StyleSheet.flatten(pause().props.style)).toMatchObject({ height: originalStyle.height, minHeight: originalStyle.minHeight, paddingVertical: originalStyle.paddingVertical })
    } finally { Object.assign(mockApp.session, before); mockApp.touchGuard = guarded }
  })

  it('labels the prepared Run loop clock as position and time until repeat', () => {
    const before = { ...mockApp.session }
    try {
      const audio = mockCompiled.snapshot.cues.opening
      if (audio?.type !== 'audio') throw new Error('Audio fixture is missing')
      Object.assign(mockApp.session, { snapshot: { ...mockCompiled.snapshot, transportMode: 'oms', cues: { ...mockCompiled.snapshot.cues, opening: { ...audio, trimInMs: 1000, trimOutMs: 21000, playbackRate: 2, endBehavior: 'loop' } } }, phase: 'ready', currentCueId: '', selectedCueId: 'opening', activeVoiceCount: 0 })
      const screen = render(wrap(<RunScreen />))
      expect(screen.getByLabelText(messages.en['run.loopPosition']).props.accessibilityValue.text).toBe('00:00')
      expect(screen.getByLabelText(messages.en['run.loopRemaining']).props.accessibilityValue.text).toBe('00:10')
    } finally { Object.assign(mockApp.session, before) }
  })

  it('reads a prepared Run clock from saved media and clears it in Recovery without moving GO or panic', () => {
    const before = { ...mockApp.session }
    try {
      const audio = mockCompiled.snapshot.cues.opening
      if (audio?.type !== 'audio') throw new Error('Audio fixture is missing')
      Object.assign(mockApp.session, { snapshot: { ...mockCompiled.snapshot, transportMode: 'oms', cues: { ...mockCompiled.snapshot.cues, opening: { ...audio, trimInMs: 1000, trimOutMs: 21000, playbackRate: 2 } } }, phase: 'ready', currentCueId: '', activeVoiceCount: 0, selectedCueId: 'opening' })
      const screen = render(wrap(<RunScreen />))
      const go = screen.getByRole('button', { name: `${messages.en['run.go']} · House to stage` })
      const goStyle = StyleSheet.flatten(go.props.style)
      expect(screen.getByLabelText(messages.en['run.elapsed']).props.accessibilityValue.text).toBe('00:00')
      expect(screen.getByLabelText(messages.en['run.remaining']).props.accessibilityValue.text).toBe('00:10')
      expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(0)
      mockApp.session.phase = 'interrupted'; screen.rerender(wrap(<RunScreen />))
      expect(screen.getByLabelText(messages.en['run.elapsed']).props.accessibilityValue.text).toBe(messages.en['common.notMeasured'])
      expect(screen.getByLabelText(messages.en['run.remaining']).props.accessibilityValue.text).toBe(messages.en['common.notMeasured'])
      expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({ text: messages.en['common.notMeasured'] })
      expect(StyleSheet.flatten(screen.getByRole('button', { name: /^GO/ }).props.style)).toMatchObject({ minHeight: goStyle.minHeight, paddingVertical: goStyle.paddingVertical })
    } finally { Object.assign(mockApp.session, before) }
  })

  it('exposes Recovery through Touch Guard and blackout after an interruption while keeping GO and panic fixed', () => {
    const screen = render(wrap(<RunScreen />))
    const goName = `${messages.en['run.go']} · ${sampleShow.cues.opening!.name}`
    const dimensions = (style: StyleProp<ViewStyle>) => { const flat = StyleSheet.flatten(style); return { minHeight: flat?.minHeight, height: flat?.height, width: flat?.width, padding: flat?.padding, paddingHorizontal: flat?.paddingHorizontal, paddingVertical: flat?.paddingVertical } }
    const goStyle = dimensions(screen.getByRole('button', { name: goName }).props.style)
    const panicName = messages.en['run.fade'].replace('{seconds}', String(sampleShow.panicFadeMs / 1000))
    const panicStyle = dimensions(screen.getByRole('button', { name: panicName }).props.style)
    mockApp.touchGuard = true; mockApp.blackout = true; mockApp.session.phase = 'interrupted'
    screen.rerender(wrap(<RunScreen />))
    expect(screen.getByRole('button', { name: /^GO/ })).toBeDisabled()
    expect(dimensions(screen.getByRole('button', { name: /^GO/ }).props.style)).toEqual(goStyle)
    expect(dimensions(screen.getByRole('button', { name: panicName }).props.style)).toEqual(panicStyle)
    expect(screen.getByRole('button', { name: panicName })).toBeEnabled()
    expect(screen.getByRole('button', { name: messages.en['run.recovery'] })).toBeEnabled()
    expect(screen.getByText(messages.en['run.now'])).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: messages.en['run.recovery'] }))
    expect(mockRouter.push).toHaveBeenCalledWith('/recovery')
    expect(mockGo).not.toHaveBeenCalled()
    mockApp.touchGuard = false; mockApp.blackout = false
  })
  it('shows one playlist deletion confirmation and restores management actions on Cancel', () => {
    const screen = render(wrap(<BuilderScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['library.playlists'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.manage'] + ' · ' + sampleShow.sets[0]!.name }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.delete'] }))
    expect(screen.getByText(messages.en['common.confirmDelete'])).toBeTruthy()
    expect(screen.getAllByRole('button', { name: messages.en['common.delete'] })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: messages.en['common.rename'] })).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.cancel'] }))
    expect(screen.getByRole('button', { name: messages.en['common.rename'] })).toBeEnabled()
  })
  it('shows one persistent hosted failure instead of duplicating it inside the page', () => {
    mockApp.error = 'CAPACITY_REFUSAL'
    const retry = jest.fn()
    const screen = render(wrap(<FeedbackContext.Provider value={{ feedback: null, dismiss: jest.fn(), undo: jest.fn(), failure: { detail: mockApp.error, busy: false, retry, dismiss: jest.fn() } }}><BuilderScreen /></FeedbackContext.Provider>))
    expect(screen.getAllByText(messages.en['run.capacityWarning'])).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: messages.en['common.retry'] })).toHaveLength(1)
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] })); expect(retry).toHaveBeenCalledTimes(1)
  })
  beforeEach(() => { jest.clearAllMocks(); mockApp.error = null; mockApp.touchGuard = false; mockApp.blackout = false; mockApp.session.phase = 'ready'; mockApp.session.selectedCueId = 'opening'; mockLibrary.updateCue.mockResolvedValue(undefined); mockApp.runTask = async (work: () => Promise<unknown>) => { await work(); return true } })
  it.each([
    ["Call to function 'ShowAudio.probeMedia' has been rejected: Failed to instantiate extractor", 'error.mediaUnreadable'],
    ['Invalid ZIP archive checksum', 'error.backupInvalid'],
  ] as const)('explains a rejected file without asking the operator to change unrelated settings: %s', (error, key) => {
    mockApp.error = error
    const screen = render(wrap(<OperationStatus />))
    expect(screen.getByText(messages.en[key])).toBeTruthy()
    expect(screen.getByRole('button', { name: messages.en['common.retry'] })).toBeEnabled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.dismiss'] }))
    expect(mockApp.clearError).toHaveBeenCalledTimes(1)
  })
  it('creates a named show and invokes full-library export through persistence', async () => {
    const screen = render(wrap(<LibraryScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['library.create'] }))
    fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), 'Evening magic')
    fireEvent.press(within(screen.UNSAFE_getByType(Modal)).getByRole('button', { name: messages.en['library.create'] }))
    await waitFor(() => expect(mockLibrary.createShow).toHaveBeenCalledWith('Evening magic'))
    fireEvent.press(screen.getByRole('button', { name: messages.en['settings.backup'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['library.backup'] }))
    await waitFor(() => expect(mockLibrary.exportBackup).toHaveBeenCalledWith(expect.objectContaining({ share: false, signal: expect.any(AbortSignal) })))
    await waitFor(() => expect(mockLibrary.shareBackup).toHaveBeenCalledWith('file:///library/backup.zip', expect.objectContaining({ signal: expect.any(AbortSignal) })))
  })
  it('persists song tuning from accessible slider actions', async () => {
    const screen = render(wrap(<BuilderScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['editor.open'] + ' · ' + sampleShow.cues.opening!.name }))
    const rate = screen.getByRole('adjustable', { name: messages.en['editor.speed'] })
    fireEvent(rate, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    await waitFor(() => expect(mockLibrary.updateCue).toHaveBeenCalledWith(sampleShow.id, 'opening', { playbackRate: 1.05 }))
  })
  it('rolls back failed tuning without losing an unsaved name and makes Retry visible', async () => {
    mockLibrary.updateCue.mockRejectedValueOnce(new Error('ENOSPC')); mockApp.runTask = async (work) => { try { await work(); return true } catch { return false } }
    const screen = render(wrap(<BuilderScreen />)); fireEvent.press(screen.getByRole('button', { name: messages.en['editor.open'] + ' · ' + sampleShow.cues.opening!.name })); fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.details'] })); fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), 'https://example.com/song')
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.audio'] }))
    fireEvent(screen.getByRole('adjustable', { name: messages.en['editor.speed'] }), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    await waitFor(() => expect(screen.getByText(messages.en['editor.savedError'])).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.details'] })); expect(screen.getByLabelText(messages.en['common.name']).props.value).toBe('https://example.com/song')
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.audio'] })); expect(screen.getByRole('adjustable', { name: messages.en['editor.speed'] }).props.accessibilityValue.now).toBe(1)
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] })); await waitFor(() => expect(screen.queryByText(messages.en['editor.savedError'])).toBeNull()); expect(mockLibrary.updateCue).toHaveBeenLastCalledWith(sampleShow.id, 'opening', { playbackRate: 1.05 })
  })
  it('keeps panic reachable under touch guard and uses selected native cue for ready GO', () => {
    mockApp.touchGuard = true
    const screen = render(wrap(<RunScreen />))
    expect(screen.getByRole('button', { name: `GO · ${sampleShow.cues.opening!.name}` })).toBeDisabled()
    const panic = screen.getByRole('button', { name: messages.en['run.fade'].replace('{seconds}', '2') })
    expect(panic).toBeEnabled(); fireEvent.press(panic); expect(mockPanic).toHaveBeenCalledTimes(1)
  })
  it.each([
    // Remaining rounds up (17.14 s → 00:18) so a countdown never reads 00:00 while audio still plays.
    [0.7, '00:04', '00:18'], [1.5, '00:02', '00:08'], [2, '00:01', '00:06'], [undefined, '00:03', '00:12'],
  ] as const)('shows real playable time at rate %s while retaining native source progress', (rate, elapsed, remaining) => {
    const before = { ...mockApp.session }; const previousCurrent = mockApp.currentCueId
    const original = sampleShow.cues.opening
    if (original?.type !== 'audio') throw new Error('Audio fixture is missing')
    const audio = { ...original }; delete audio.playbackRate
    if (rate !== undefined) audio.playbackRate = rate
    try {
      Object.assign(mockApp.session, { snapshot: { ...before.snapshot, cues: { ...before.snapshot.cues, opening: audio } }, phase: 'running', activeVoiceCount: 1, currentCueId: 'opening', progressCueId: 'opening', progressPositionMs: 3000, progressDurationMs: 15000 })
      mockApp.currentCueId = 'opening'
      const screen = render(wrap(<RunScreen />))
      expect(screen.getByLabelText(messages.en['run.elapsed']).props.accessibilityValue.text).toBe(elapsed)
      expect(screen.getByLabelText(messages.en['run.remaining']).props.accessibilityValue.text).toBe(remaining)
      expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(20)
    } finally { Object.assign(mockApp.session, before); mockApp.currentCueId = previousCurrent }
  })
  it('labels a paused countdown Resume with remaining time and restores countdown after resuming', () => {
    const before = { ...mockApp.session }
    try {
      Object.assign(mockApp.session, { phase: 'paused', currentCueId: '', selectedCueId: 'opening', countdownRemainingMs: 1800 })
      const screen = render(wrap(<RunScreen />))
      const resume = screen.getByRole('button', { name: `${messages.en['run.resume']} · ${messages.en['use.run.pausedDelay'].replace('{seconds}', '2')}` })
      expect(resume).toBeEnabled(); fireEvent.press(resume); expect(mockGo).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('button', { name: messages.en['run.countdown'].replace('{seconds}', '2') })).toBeNull()
      const panicName = messages.en['run.fade'].replace('{seconds}', '2')
      expect(screen.getByRole('button', { name: panicName })).toBeEnabled()
      mockApp.session.phase = 'fading'; screen.rerender(wrap(<RunScreen />))
      expect(screen.getByRole('button', { name: messages.en['run.countdown'].replace('{seconds}', '2') })).toBeDisabled()
      expect(screen.getByRole('button', { name: panicName })).toBeEnabled()
    } finally { Object.assign(mockApp.session, before) }
  })
  it('saves an exact 53 millisecond fade without slider quantization', async () => {
    const screen = render(wrap(<BuilderScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['editor.open'] + ' · ' + sampleShow.cues.opening!.name }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.playback'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['studio.fades'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['workflow.exactTiming'].replace('{name}', messages.en['editor.fadeIn']) }))
    fireEvent.changeText(screen.getByDisplayValue('1.2'), '0.053')
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.saveField'].replace('{name}', messages.en['editor.fadeIn']) }))
    await waitFor(() => expect(mockLibrary.updateCue).toHaveBeenCalledWith(sampleShow.id, 'opening', { fadeInMs: 53 }))
  })
  it('uses canonical color names when songs are tagged manually', async () => {
    const screen = render(wrap(<BuilderScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['editor.open'] + ' · ' + sampleShow.cues.opening!.name }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.details'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['tag.red'] }))
    await waitFor(() => expect(mockLibrary.updateCue).toHaveBeenCalledWith(sampleShow.id, 'opening', { colorToken: 'red' }))
  })
  it('makes recovery selection silent until a separate start action', () => {
    const screen = render(wrap(<RecoveryScreen />))
    const orderedId = sampleShow.sets[0]!.cueOrder[1]!
    fireEvent.press(screen.getByRole('button', { name: sampleShow.cues[orderedId]!.name }))
    expect(mockSelect).toHaveBeenCalledWith(orderedId); expect(mockStart).not.toHaveBeenCalled()
    mockApp.session.selectedCueId = orderedId
    screen.rerender(wrap(<RecoveryScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['recovery.select'] }))
    expect(mockStart).toHaveBeenCalledWith(orderedId)
  })
  it('keeps Recovery Panic and Stop outside the scrolling content', () => {
    const screen = render(wrap(<RecoveryScreen />)); const scroll = screen.UNSAFE_getByType(ScrollView)
    expect(scroll.findAllByProps({ accessibilityLabel: messages.en['recovery.fade'] })).toHaveLength(0)
    expect(scroll.findAllByProps({ accessibilityLabel: messages.en['recovery.stop'] })).toHaveLength(0)
    fireEvent.press(screen.getByRole('button', { name: messages.en['recovery.fade'] }))
    expect(mockPanic).toHaveBeenCalledTimes(1)
  })
  it('does not navigate a completed exit into a replacement activity after Recovery unmounts', async () => {
    let finish!: (exited: boolean) => void
    mockApp.exitShow.mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve }))
    const screen = render(wrap(<RecoveryScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['recovery.exit'] })); screen.unmount()
    await act(async () => { finish(true) })
    expect(mockRouter.replace).not.toHaveBeenCalled(); expect(mockRouter.dismissAll).not.toHaveBeenCalled()
  })
  it('finishes creation without navigating when its Library screen was replaced', async () => {
    let finish!: () => void
    mockLibrary.createShow.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    const screen = render(wrap(<LibraryScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['library.create'] }))
    fireEvent.press(within(screen.UNSAFE_getByType(Modal)).getByRole('button', { name: messages.en['library.create'] })); screen.unmount()
    await act(async () => { finish() })
    expect(mockLibrary.createShow).toHaveBeenCalledTimes(1); expect(mockRouter.push).not.toHaveBeenCalled()
  })

  it('keeps a cancelled rename from changing the show', async () => {
    const screen = render(wrap(<LibraryScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.manage'] + ' · ' + sampleShow.name }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.rename'] }))
    fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), 'A different show')
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.cancel'] }))
    expect(mockLibrary.renameShow).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(messages.en['common.name'])).toBeNull()
    expect(screen.getByText(sampleShow.name)).toBeTruthy()
  })
  it('opens a focused song editor silently and returns to the ordered list', async () => {
    const screen = render(wrap(<BuilderScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['editor.open'] + ' · ' + sampleShow.cues.opening!.name }))
    expect(mockApp.preview).not.toHaveBeenCalled()
    expect(screen.queryAllByRole('button', { name: messages.en['common.manage'] + ' · ' + sampleShow.cues.crossfade!.name })).toHaveLength(0)
    fireEvent.press(screen.getAllByRole('button', { name: messages.en['workflow.backPlaylist'] })[0]!)
    await waitFor(() => expect(screen.getAllByRole('button', { name: messages.en['common.manage'] + ' · ' + sampleShow.cues.crossfade!.name }).length).toBeGreaterThan(0))
  })
  it('keeps deletion within its dialog and preserves the show when cancelled', () => {
    const screen = render(wrap(<LibraryScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.manage'] + ' · ' + sampleShow.name }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.delete'] }))
    expect(screen.getByText(messages.en['common.confirmDelete'])).toBeTruthy()
    expect(mockLibrary.removeShow).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.cancel'] }))
    expect(screen.getByRole('button', { name: messages.en['common.rename'] })).toBeTruthy()
    expect(mockLibrary.removeShow).not.toHaveBeenCalled()
  })
  it('retains an unsaved name if saving on Back fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    try {
      mockLibrary.updateCue.mockRejectedValueOnce(new Error('ENOSPC'))
      mockApp.runTask = async (work) => { try { await work(); return true } catch { return false } }
      const screen = render(wrap(<BuilderScreen />))
      fireEvent.press(screen.getByRole('button', { name: messages.en['editor.open'] + ' · ' + sampleShow.cues.opening!.name }))
      fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.details'] }))
      fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), 'Revised opening')
      fireEvent.press(screen.getAllByRole('button', { name: messages.en['workflow.backPlaylist'] })[0]!)
      expect(alert).toHaveBeenCalledWith(messages.en['workflow.unsaved'], messages.en['workflow.unsavedHelp'], expect.any(Array))
      const save = alert.mock.calls[0]![2]!.find((button) => button.text === messages.en['common.save'])!
      await act(async () => save.onPress?.())
      expect(screen.getByLabelText(messages.en['common.name']).props.value).toBe('Revised opening')
      expect(screen.queryByRole('button', { name: messages.en['editor.open'] + ' · ' + sampleShow.cues.bed!.name })).toBeNull()
    } finally { alert.mockRestore() }
  })

  it('clamps accessible slider changes to source bounds', () => {
    const change = jest.fn(); const screen = render(wrap(<ValueSlider label="Position" value={10} min={0} max={10} onChange={change} />))
    fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    expect(change).toHaveBeenCalledWith(10)
  })
  it('commits a dragged waveform position on release', () => {
    const change = jest.fn(); const screen = render(wrap(<ValueSlider label="Position" value={0} min={0} max={10} step={0.001} onChange={change} peaks={[0.1, 0.7, 0.3]} />))
    const slider = screen.getByRole('adjustable')
    fireEvent(slider, 'layout', { nativeEvent: { layout: { width: 100 } } })
    fireEvent(slider, 'touchMove', { nativeEvent: { locationX: 53 } })
    expect(change).not.toHaveBeenCalled()
    fireEvent(slider, 'touchEnd', { nativeEvent: { locationX: 53 } })
    expect(change).toHaveBeenCalledWith(5.3)
  })
  it('accumulates rapid accessible slider presses before the saved value returns', () => {
    const change = jest.fn(); const screen = render(wrap(<ValueSlider label="Rate" value={1} min={0.7} max={2} step={0.05} onChange={change} />))
    const slider = screen.getByRole('adjustable')
    fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }); fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    expect(change.mock.calls.map(([value]) => value)).toEqual([1.05, 1.1])
  })
  it('does not change a timing slider while vertically scrolling past it', () => {
    const change = jest.fn(); const screen = render(wrap(<ValueSlider label="Fade" value={0} min={0} max={10} onChange={change} />)); const slider = screen.getByRole('adjustable')
    fireEvent(slider, 'layout', { nativeEvent: { layout: { width: 100 } } }); fireEvent(slider, 'touchStart', { nativeEvent: { locationX: 10, locationY: 10 } }); fireEvent(slider, 'touchMove', { nativeEvent: { locationX: 12, locationY: 50 } }); fireEvent(slider, 'touchEnd', { nativeEvent: { locationX: 12, locationY: 50 } }); expect(change).not.toHaveBeenCalled()
  })
  it('keeps Ready Pause silent and shows the native selected ordinal', () => {
    const screen = render(wrap(<RunScreen />)); expect(screen.getByRole('button', { name: messages.en['run.pause'] })).toBeDisabled(); expect(screen.getByLabelText(`1 / ${sampleShow.sets[0]!.cueOrder.length}`)).toBeTruthy()
  })
  it('has every message and interpolation slot in all ten languages', () => {
    expect(Object.keys(messages)).toHaveLength(10)
    for (const dictionary of Object.values(messages)) {
      expect(Object.keys(dictionary).sort()).toEqual(Object.keys(messages.en).sort())
      for (const key of Object.keys(messages.en) as (keyof typeof messages.en)[]) {
        const slots = (text: string) => [...text.matchAll(/\{([^}]+)\}/g)].map((item) => item[1]).sort()
        expect(slots(dictionary[key])).toEqual(slots(messages.en[key]))
      }
    }
  })
})
