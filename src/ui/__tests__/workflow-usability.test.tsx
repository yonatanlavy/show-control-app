import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Keyboard, Platform, ScrollView } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import type { DownloadJob, DownloadSource } from '../../../modules/show-downloads'
import { sampleControllerProfiles, sampleShow } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import { DEFAULT_LIBRARY_SETTINGS } from '../../library/types'
import type { BackupExportOptions } from '../../storage/backup-progress'
import { HelperSettings, MusicDownloads } from '../../music/downloads'
import { recommendMusic } from '../../ai/music-recommendations'
import { DownloadsPanel, MusicFinderScreen } from '../music-screens'
import { PreflightScreen, RecoveryScreen, SettingsScreen } from '../screens'
import { AppShell, AppText, Field } from '../primitives'
import { HelpScreen } from '../help-screen'
import { operationErrorKey } from '../feedback'

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissAll: jest.fn(), back: jest.fn(), canGoBack: jest.fn() }
const mockTaskResults: unknown[] = []
let mockRetry: (() => Promise<unknown>) | null = null
const mockLibrary = {
  importAudio: jest.fn(), select: jest.fn(), exportBackup: jest.fn(), shareBackup: jest.fn(), clearError: jest.fn(),
  getSnapshot: () => ({ shows: [sampleShow] }),
}
const mockApp = {
  library: mockLibrary, show: sampleShow, set: sampleShow.sets[0], busy: false, liveSession: false,
  libraryState: { status: 'ready', shows: [sampleShow], controllerProfiles: sampleControllerProfiles, saving: false, selectedShowId: sampleShow.id, selectedSetId: sampleShow.sets[0]!.id, settings: DEFAULT_LIBRARY_SETTINGS },
  checks: { local: true, readable: true, order: true }, toggleCheck: jest.fn(), armShow: jest.fn(),
  error: null, clearError: jest.fn(), retryLastTask: jest.fn(),
  previewLibrarySong: jest.fn(), stopPreview: jest.fn().mockResolvedValue(undefined),
  replay: jest.fn(), previous: jest.fn(), skip: jest.fn(), selectCue: jest.fn(), startCue: jest.fn(),
  panic: jest.fn(), stopAll: jest.fn(), exitShow: jest.fn(), voiceStatus: null as { armed: boolean } | null, disarmVoice: jest.fn(),
  session: {
    engineAvailable: true, phase: 'ready', selectedCueId: 'opening', currentCueId: '', pendingCommandIds: [] as number[], detail: '', sessionPurpose: 'performance',
    snapshot: { ...sampleShow, showName: sampleShow.name, cueOrder: sampleShow.sets[0]!.cueOrder, hitCueIds: sampleShow.sets[0]!.hitCueIds },
  },
  runTask: async (work: () => Promise<unknown>) => { try { const result = await work(); mockRetry = null; if (result !== null) mockTaskResults.push(result); return true } catch (error) { mockRetry = error instanceof Error && error.name === 'AbortError' ? null : work; return false } },
}
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter, useLocalSearchParams: () => ({}),
  useFocusEffect: function useFocusEffect(effect: () => void | (() => void)) {
    const React = jest.requireActual<typeof import('react')>('react')
    React.useEffect(effect, [effect])
  },
}))
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('../../music/downloads', () => ({ checkedHelperUrl: jest.requireActual('../../music/downloads').checkedHelperUrl, MusicDownloads: { jobs: jest.fn(), search: jest.fn() }, HelperSettings: { read: jest.fn(), save: jest.fn(), resolve: jest.fn() }, hasDownloadTarget: () => true }))
jest.mock('../../ai/music-recommendations', () => ({ recommendMusic: jest.fn() }))

const wrap = (content: React.ReactNode) => <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}><I18nProvider>{content}</I18nProvider></SafeAreaInsetsContext.Provider>
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const activeJob: DownloadJob = { id: 'loading-job', stage: 'downloading', percent: 62, title: 'Local download', url: 'https://example.com/audio', showId: sampleShow.id, setId: sampleShow.sets[0]!.id, category: 'ambient', createdAt: 1 }

beforeEach(() => {
  jest.clearAllMocks(); mockTaskResults.length = 0; mockRetry = null
  mockApp.busy = false; mockApp.liveSession = false; mockApp.checks = { local: true, readable: true, order: true }
  mockApp.voiceStatus = null
  mockApp.session = { ...mockApp.session, engineAvailable: true, phase: 'ready', selectedCueId: 'opening', pendingCommandIds: [] }
  mockApp.armShow.mockResolvedValue(false); mockApp.exitShow.mockResolvedValue(true)
  mockLibrary.select.mockResolvedValue(undefined); mockLibrary.importAudio.mockResolvedValue(null); mockLibrary.shareBackup.mockResolvedValue(undefined)
  jest.mocked(MusicDownloads.jobs).mockResolvedValue([]); jest.mocked(MusicDownloads.search).mockResolvedValue([])
  jest.mocked(HelperSettings.read).mockResolvedValue(null); jest.mocked(HelperSettings.save).mockResolvedValue(undefined)
  jest.mocked(HelperSettings.resolve).mockImplementation(async (url, token) => ({ url, token }))
  jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined)
})
afterEach(() => { expect(recommendMusic).not.toHaveBeenCalled(); jest.restoreAllMocks() })

describe('whole-workflow usability protections without provider requests', () => {
  it.each(['TRANSPORT_FAILED', 'PREVIEW_FAILED: TRANSPORT_FAILED: native service failed', 'PLAYBACK_FAULT: TRANSPORT_FAILED'])('explains service recovery without blaming a valid song: %s', (error) => {
    expect(operationErrorKey(error)).toBe('background.transportFailed')
  })
  it.each(['AUDIO_INTERRUPTED', 'PREVIEW_FAILED: Audio preview was interrupted', 'PLAYBACK_FAULT: audio_focus', 'PLAYBACK_FAULT: phone_call'])('explains interruption recovery without blaming the media file: %s', (error) => {
    expect(operationErrorKey(error)).toBe('use.audio.interrupted')
  })
  it.each(['SYSTEM_AUDIO_SUPPRESSED', 'PLAYBACK_FAULT: system_media_muted', 'PLAYBACK_FAULT: dnd_filter_changed'])('explains system audio recovery before a generic playback error: %s', (error) => {
    expect(operationErrorKey(error)).toBe('use.audio.suppressed')
  })
  it('explains system sound policies without pretending to detect or change them', () => {
    const screen = render(wrap(<PreflightScreen />))
    expect(screen.getByText(messages.en['use.audio.media'])).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: messages.en['preflight.notifications'] }))
    expect(screen.getByText(messages.en['use.audio.dnd'])).toBeTruthy()
    expect(mockApp.armShow).not.toHaveBeenCalled()
    screen.unmount()
    const help = render(wrap(<HelpScreen />))
    fireEvent.changeText(help.getByLabelText(messages.en['use.help.search']), 'Do Not Disturb')
    expect(help.getByText(messages.en['use.audio.dnd'])).toBeTruthy()
    expect(help.getByText(messages.en['use.audio.recovery'])).toBeTruthy()
  })

  it.each(['interrupted', 'fault'])('blocks unusable Recovery playback after %s but keeps safety controls and deliberate recheck', async (phase) => {
    mockApp.session.phase = phase
    const exiting = deferred<boolean>(); mockApp.exitShow.mockReturnValueOnce(exiting.promise)
    const screen = render(wrap(<RecoveryScreen />))
    expect(screen.getByText(messages.en['use.audio.recovery'])).toBeTruthy()
    for (const key of ['recovery.replay', 'recovery.previous', 'recovery.skip', 'recovery.select', 'recovery.armed'] as const) {
      expect(screen.getByRole('button', { name: messages.en[key] })).toBeDisabled()
      fireEvent.press(screen.getByRole('button', { name: messages.en[key] }))
    }
    expect(mockApp.replay).not.toHaveBeenCalled(); expect(mockApp.startCue).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['recovery.stop'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['recovery.fade'] }))
    expect(mockApp.stopAll).toHaveBeenCalledTimes(1); expect(mockApp.panic).toHaveBeenCalledTimes(1)
    const recheck = screen.getByRole('button', { name: messages.en['use.audio.recheck'] })
    fireEvent.press(recheck); fireEvent.press(recheck)
    expect(mockApp.exitShow).toHaveBeenCalledTimes(1); expect(mockRouter.replace).not.toHaveBeenCalled()
    await act(async () => exiting.resolve(true))
    expect(mockRouter.replace).toHaveBeenCalledWith('/preflight')
    expect(mockApp.armShow).not.toHaveBeenCalled()
  })

  it('does not leave Recovery if silent shutdown fails, and returns rehearsal to its silent preparation', async () => {
    mockApp.session.phase = 'interrupted'; mockApp.session.sessionPurpose = 'rehearsal'
    mockApp.exitShow.mockResolvedValueOnce(false)
    const screen = render(wrap(<RecoveryScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.audio.recheck'] }))
    await waitFor(() => expect(screen.getByRole('button', { name: messages.en['use.audio.recheck'] })).toBeEnabled())
    expect(mockRouter.replace).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.audio.recheck'] }))
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/rehearsal'))
    expect(mockApp.startCue).not.toHaveBeenCalled()
    mockApp.session.sessionPurpose = 'performance'
  })

  it('searches help topics with relevant results, an explicit empty state and Clear', () => {
    const screen = render(wrap(<HelpScreen />))
    fireEvent.changeText(screen.getByLabelText(messages.en['use.help.search']), 'backup')
    expect(screen.getByText(messages.en['backup.restoreHelp'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: messages.en['editor.title'] })).toBeNull()
    fireEvent.changeText(screen.getByLabelText(messages.en['use.help.search']), 'unmatched-help-topic')
    expect(screen.getByText(messages.en['use.help.noMatches'])).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.clearSearch'] }))
    expect(screen.getByRole('button', { name: messages.en['editor.title'] })).toBeTruthy()
    expect(screen.getByLabelText(messages.en['use.help.search']).props.value).toBe('')
  })
  it('keeps an armed trigger source disarm action visible without opening Recovery diagnostics', async () => {
    mockApp.voiceStatus = { armed: true }
    const screen = render(wrap(<RecoveryScreen />))
    expect(screen.getByRole('button', { name: messages.en['common.diagnostics'] }).props.accessibilityState.expanded).toBe(false)
    fireEvent.press(screen.getByRole('button', { name: messages.en['voice.disarm'] }))
    await waitFor(() => expect(mockApp.disarmVoice).toHaveBeenCalledTimes(1))
    expect(mockApp.startCue).not.toHaveBeenCalled()
  })
  it('submits keyboard actions only while the field is enabled', () => {
    const submit = jest.fn()
    const screen = render(wrap(<Field label="Source" value="a song" onChange={jest.fn()} returnKeyType="search" onSubmit={submit} />))
    fireEvent(screen.getByLabelText('Source'), 'submitEditing')
    expect(submit).toHaveBeenCalledTimes(1)
    screen.rerender(wrap(<Field label="Source" value="a song" onChange={jest.fn()} returnKeyType="search" onSubmit={submit} disabled />))
    fireEvent(screen.getByLabelText('Source'), 'submitEditing')
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('keeps Arm outside scrolling checks and disables Arm and confirmations during preparation', () => {
    const screen = render(wrap(<PreflightScreen />))
    const scroll = screen.UNSAFE_getByType(ScrollView)
    expect(scroll.findAllByProps({ accessibilityLabel: messages.en['preflight.arm'] })).toHaveLength(0)
    expect(screen.getByRole('button', { name: messages.en['preflight.arm'] })).toBeEnabled()
    mockApp.session.phase = 'preparing'; screen.rerender(wrap(<PreflightScreen />))
    expect(screen.getByRole('button', { name: messages.en['preflight.arm'] })).toBeDisabled()
    screen.getAllByRole('checkbox').forEach((check) => expect(check).toBeDisabled())
    fireEvent.press(screen.getByRole('button', { name: messages.en['preflight.arm'] }))
    expect(mockApp.armShow).not.toHaveBeenCalled(); expect(mockApp.toggleCheck).not.toHaveBeenCalled()
  })

  it('keeps a missing required confirmation distinct from unavailable native audio', () => {
    mockApp.checks.order = false
    const screen = render(wrap(<PreflightScreen />))
    expect(screen.getByText(messages.en['use.preflight.left'].replace('{count}', '1'))).toBeTruthy()
    expect(screen.getByRole('button', { name: messages.en['preflight.arm'] })).toBeDisabled()
    mockApp.checks.order = true; mockApp.session.engineAvailable = false
    screen.rerender(wrap(<PreflightScreen />))
    expect(screen.getAllByText(messages.en['preflight.engineUnavailable']).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: messages.en['preflight.arm'] })).toBeDisabled()
  })

  it('filters Recovery silently and follows a subsequent native selection before a deliberate start', () => {
    const screen = render(wrap(<RecoveryScreen />))
    fireEvent.changeText(screen.getByLabelText(messages.en['finder.search']), 'finale')
    expect(screen.queryByRole('button', { name: sampleShow.cues.opening!.name })).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: sampleShow.cues.finale!.name }))
    expect(mockApp.selectCue).toHaveBeenCalledWith('finale'); expect(mockApp.startCue).not.toHaveBeenCalled()
    mockApp.session.selectedCueId = 'finale'; screen.rerender(wrap(<RecoveryScreen />))
    mockApp.session.selectedCueId = 'hold'; screen.rerender(wrap(<RecoveryScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['recovery.select'] }))
    expect(mockApp.startCue).toHaveBeenCalledWith('hold')
    mockApp.startCue.mockClear()
    fireEvent.changeText(screen.getByLabelText(messages.en['finder.search']), 'no such cue')
    // Recovery has no category filter, so it uses the plain no-match guidance.
    expect(screen.getByText(messages.en['use.library.noCues'])).toBeTruthy()
    expect(screen.getByText(messages.en['use.library.searchHelp'])).toBeTruthy()
    expect(screen.queryByText(messages.en['finder.noMatches'])).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.clearSearch'] }))
    expect(screen.getByRole('button', { name: sampleShow.cues.opening!.name })).toBeTruthy()
    expect(mockApp.startCue).not.toHaveBeenCalled()
    const scroll = screen.UNSAFE_getByType(ScrollView)
    expect(scroll.findAllByProps({ accessibilityLabel: messages.en['recovery.fade'] })).toHaveLength(0)
    fireEvent.press(screen.getByRole('button', { name: messages.en['recovery.fade'] }))
    expect(mockApp.panic).toHaveBeenCalledTimes(1)
  })

  it('imports into the captured playlist once and gives no success notice for picker cancellation', async () => {
    const picking = deferred<null>(); mockLibrary.importAudio.mockReturnValueOnce(picking.promise)
    const screen = render(wrap(<MusicFinderScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.import.files'] }))
    const choose = screen.getByRole('button', { name: messages.en['builder.import'] })
    fireEvent.press(choose); fireEvent.press(choose)
    expect(mockLibrary.importAudio).toHaveBeenCalledTimes(1)
    expect(mockLibrary.importAudio).toHaveBeenCalledWith(sampleShow.id, sampleShow.sets[0]!.id, undefined, expect.any(AbortSignal), { category: 'ambient', applyPreset: true })
    await act(async () => picking.resolve(null))
    expect(screen.queryByText(messages.en['use.import.added'].replace('{playlist}', sampleShow.sets[0]!.name))).toBeNull()
    expect(mockTaskResults).toEqual([])
    expect(screen.getByRole('button', { name: messages.en['builder.import'] })).toBeEnabled()
    expect(mockApp.previewLibrarySong).not.toHaveBeenCalled()
  })

  it('guards keyboard search, ignores cancelled late results and permits a deliberate new search', async () => {
    const searching = deferred<DownloadSource[]>(); jest.mocked(MusicDownloads.search).mockReturnValueOnce(searching.promise)
    const screen = render(wrap(<MusicFinderScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['finder.downloadTab'] }))
    fireEvent(screen.getByLabelText(messages.en['download.query']), 'submitEditing')
    expect(MusicDownloads.search).not.toHaveBeenCalled()
    fireEvent.changeText(screen.getByLabelText(messages.en['download.query']), 'quiet piano')
    fireEvent(screen.getByLabelText(messages.en['download.query']), 'submitEditing')
    fireEvent(screen.getByLabelText(messages.en['download.query']), 'submitEditing')
    expect(MusicDownloads.search).toHaveBeenCalledTimes(1); expect(Keyboard.dismiss).toHaveBeenCalledTimes(1)
    const signal = jest.mocked(MusicDownloads.search).mock.calls[0]![1]
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.cancel'] }))
    expect(signal?.aborted).toBe(true)
    await act(async () => searching.resolve([{ title: 'Cancelled late result', uploader: 'Source', durationSeconds: 60, url: 'https://example.com/old' }]))
    expect(screen.queryByText('Cancelled late result')).toBeNull()
    jest.mocked(MusicDownloads.search).mockResolvedValueOnce([{ title: 'Fresh result', uploader: 'Source', durationSeconds: 30, url: 'https://example.com/new' }])
    fireEvent.changeText(screen.getByLabelText(messages.en['download.query']), 'new piano')
    fireEvent(screen.getByLabelText(messages.en['download.query']), 'submitEditing')
    await waitFor(() => expect(screen.getByText('Fresh result')).toBeTruthy())
    expect(screen.queryByText('Cancelled late result')).toBeNull()
  })

  it('owns a fresh cancellable search and suppresses late results when global Retry is used', async () => {
    jest.mocked(MusicDownloads.search).mockRejectedValueOnce(new Error('search failed'))
    const screen = render(wrap(<MusicFinderScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['finder.downloadTab'] }))
    fireEvent.changeText(screen.getByLabelText(messages.en['download.query']), 'piano')
    fireEvent(screen.getByLabelText(messages.en['download.query']), 'submitEditing')
    await waitFor(() => expect(mockRetry).not.toBeNull())
    const originalSignal = jest.mocked(MusicDownloads.search).mock.calls[0]![1]
    const retry = mockRetry!; const searching = deferred<DownloadSource[]>()
    jest.mocked(MusicDownloads.search).mockReturnValueOnce(searching.promise)
    let retried!: Promise<boolean>
    act(() => { retried = mockApp.runTask(retry) })
    expect(screen.getByRole('button', { name: messages.en['common.cancel'] })).toBeEnabled()
    const retrySignal = jest.mocked(MusicDownloads.search).mock.calls[1]![1]
    expect(retrySignal).not.toBe(originalSignal); expect(retrySignal?.aborted).toBe(false)
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.cancel'] }))
    expect(retrySignal?.aborted).toBe(true)
    await act(async () => { searching.resolve([{ title: 'Late retry result', uploader: '', durationSeconds: null, url: 'https://example.com/late' }]); expect(await retried).toBe(false) })
    expect(screen.queryByText('Late retry result')).toBeNull()
    expect(mockTaskResults).toEqual([])
  })

  it('aborts a retried local import when its screen is left', async () => {
    mockLibrary.importAudio.mockRejectedValueOnce(new Error('low storage'))
    const screen = render(wrap(<MusicFinderScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.import.files'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['builder.import'] }))
    await waitFor(() => expect(mockRetry).not.toBeNull())
    const originalSignal = mockLibrary.importAudio.mock.calls[0]![3] as AbortSignal
    const retry = mockRetry!; const importing = deferred<null>()
    mockLibrary.importAudio.mockReturnValueOnce(importing.promise)
    let retried!: Promise<boolean>
    act(() => { retried = mockApp.runTask(retry) })
    const retrySignal = mockLibrary.importAudio.mock.calls[1]![3] as AbortSignal
    expect(retrySignal).not.toBe(originalSignal); expect(retrySignal.aborted).toBe(false)
    screen.unmount(); expect(retrySignal.aborted).toBe(true)
    await act(async () => { importing.resolve(null); await retried })
    expect(mockTaskResults).toEqual([])
  })

  it('rejects global Retry after leaving the finder rather than reopening its picker', async () => {
    mockLibrary.importAudio.mockRejectedValueOnce(new Error('unreadable file'))
    const screen = render(wrap(<MusicFinderScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.import.files'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['builder.import'] }))
    await waitFor(() => expect(mockRetry).not.toBeNull())
    const retry = mockRetry!; screen.unmount()
    await act(async () => { expect(await mockApp.runTask(retry)).toBe(false) })
    expect(mockLibrary.importAudio).toHaveBeenCalledTimes(1)
    expect(mockTaskResults).toEqual([])
  })

  it('preserves a newly entered helper address while saved settings load and waits before saving', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    const reading = deferred<{ url: string; token: string } | null>()
    jest.mocked(HelperSettings.read).mockReturnValueOnce(reading.promise)
    const screen = render(wrap(<MusicFinderScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['finder.downloadTab'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['download.helper'] }))
    fireEvent.changeText(screen.getByLabelText(messages.en['download.address']), 'http://192.168.1.99:8765')
    const pairingCode = 'synthetic_new_helper_pairing_1234567890'
    fireEvent.changeText(screen.getByLabelText(messages.en['download.code']), pairingCode)
    expect(screen.getByRole('button', { name: messages.en['common.save'] })).toBeDisabled()
    expect(screen.getByRole('button', { name: messages.en['download.test'] })).toBeDisabled()
    await act(async () => reading.resolve({ url: 'http://192.168.1.20:8765', token: 'old-helper-token' }))
    expect(screen.getByLabelText(messages.en['download.address']).props.value).toBe('http://192.168.1.99:8765')
    expect(screen.getByLabelText(messages.en['download.code']).props.value).toBe(pairingCode)
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.save'] }))
    await waitFor(() => expect(HelperSettings.save).toHaveBeenCalledWith('http://192.168.1.99:8765', pairingCode))
  })

  it('retries failed helper settings without overwriting a manual address', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    jest.mocked(HelperSettings.read).mockRejectedValueOnce(new Error('secure storage unavailable'))
    const screen = render(wrap(<MusicFinderScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['finder.downloadTab'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['download.helper'] }))
    await waitFor(() => expect(screen.getByText(messages.en['error.downloadHelper'])).toBeTruthy())
    fireEvent.changeText(screen.getByLabelText(messages.en['download.address']), 'http://192.168.1.90:8765')
    jest.mocked(HelperSettings.read).mockResolvedValueOnce({ url: 'http://192.168.1.20:8765', token: 'existing-token' })
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] }))
    await waitFor(() => expect(screen.queryByText(messages.en['error.downloadHelper'])).toBeNull())
    expect(screen.getByLabelText(messages.en['download.address']).props.value).toBe('http://192.168.1.90:8765')
    expect(screen.getByRole('button', { name: messages.en['common.save'] })).toBeDisabled()
    expect(screen.getByText(messages.en['download.pairingRequired'])).toBeTruthy()
    fireEvent.changeText(screen.getByLabelText(messages.en['download.code']), 'synthetic_new_helper_pairing_1234567890')
    expect(screen.getByRole('button', { name: messages.en['common.save'] })).toBeEnabled()
    expect(HelperSettings.save).not.toHaveBeenCalled()
  })

  it('shows download loading before an initial read and only shows empty after it completes', async () => {
    const reading = deferred<DownloadJob[]>(); jest.mocked(MusicDownloads.jobs).mockReturnValueOnce(reading.promise)
    const screen = render(wrap(<DownloadsPanel />))
    expect(screen.getByText(messages.en['common.loading'])).toBeTruthy()
    expect(screen.queryByText(messages.en['download.empty'])).toBeNull()
    await act(async () => reading.resolve([]))
    expect(screen.getByText(messages.en['download.empty'])).toBeTruthy()
    expect(screen.queryByText(messages.en['common.loading'])).toBeNull()
  })

  it('recovers failed download history with Retry and displays measured progress', async () => {
    jest.mocked(MusicDownloads.jobs).mockRejectedValueOnce(new Error('native history unavailable'))
    const screen = render(wrap(<DownloadsPanel />))
    await waitFor(() => expect(screen.getByText(messages.en['error.downloadFailed'])).toBeTruthy())
    expect(screen.queryByText(messages.en['download.empty'])).toBeNull()
    jest.mocked(MusicDownloads.jobs).mockResolvedValue([activeJob])
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] }))
    await waitFor(() => expect(screen.getByText(activeJob.title)).toBeTruthy())
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(62)
    expect(screen.getByText('62%')).toBeTruthy()
    expect(screen.queryByText(messages.en['error.downloadFailed'])).toBeNull()
  })

  it('retains the exact saved backup across Settings tabs and shares it without exporting again', async () => {
    const archive = 'file:///backups/Show%20Control%20QA.zip'
    mockLibrary.exportBackup.mockImplementation(async (options: BackupExportOptions) => { options.onSaved?.(archive); options.onResult?.({ kind: 'export', shows: 1, playlists: 1, songs: 4, files: 3, uri: archive }); return archive })
    const screen = render(wrap(<SettingsScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['settings.backup'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['library.backup'] }))
    await waitFor(() => expect(screen.getByText('Show Control QA.zip')).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: messages.en['settings.appearance'] }))
    expect(screen.queryByText('Show Control QA.zip')).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: messages.en['settings.backup'] }))
    expect(screen.getByText('Show Control QA.zip')).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: messages.en['backup.shareAgain'] }))
    await waitFor(() => expect(mockLibrary.shareBackup).toHaveBeenCalledTimes(2))
    expect(mockLibrary.exportBackup).toHaveBeenCalledTimes(1)
    expect(mockLibrary.shareBackup).toHaveBeenLastCalledWith(archive, expect.any(Object))
  })

  it('returns from a child page by history, with a safe More fallback for direct entry', () => {
    mockRouter.canGoBack.mockReturnValue(true)
    const screen = render(wrap(<AppShell current="/more" navigationRoute="/settings"><AppText>Settings body</AppText></AppShell>))
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.back'] }))
    expect(mockRouter.back).toHaveBeenCalledTimes(1); expect(mockRouter.replace).not.toHaveBeenCalled()
    mockRouter.canGoBack.mockReturnValue(false)
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.back'] }))
    expect(mockRouter.replace).toHaveBeenCalledWith('/more')
  })
})
