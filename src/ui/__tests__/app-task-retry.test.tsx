import { act, render } from '@testing-library/react-native'
import { useEffect } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { sampleShow, type AudioCue } from '../../domain'
import { I18nProvider } from '../../i18n'
import { DEFAULT_LIBRARY_SETTINGS, type LibrarySnapshot } from '../../library/types'
import { AppProvider, useApp } from '../AppProvider'
import { useTaskFeedback } from '../feedback'
import { withDeviceSettingsAction } from '../../runtime/device-settings-action'

const mockRecover = jest.fn().mockResolvedValue(undefined)
let mockSnapshot: LibrarySnapshot
const mockLibraryListeners = new Set<() => void>()
const mockInitialize = jest.fn().mockResolvedValue(undefined)
const mockClearError = jest.fn(() => { if (mockSnapshot.status === 'ready' && mockSnapshot.error) { const { error: removed, ...snapshot } = mockSnapshot; void removed; mockSnapshot = snapshot; mockLibraryListeners.forEach((listener) => listener()) } })
jest.mock('../../library', () => ({ createLibraryStore: () => ({ getSnapshot: () => mockSnapshot, subscribe: (listener: () => void) => { mockLibraryListeners.add(listener); return () => { mockLibraryListeners.delete(listener) } }, initialize: () => mockInitialize(), clearError: () => mockClearError() }) }))
jest.mock('../../audio', () => ({ ...jest.requireActual('../../audio'), resolveNativeAudioEngine: () => ({ available: false, reason: 'No native audio in this test' }) }))
jest.mock('../../../modules/show-audio', () => ({ __esModule: true, default: { availability: () => ({ available: false }) } }))
jest.mock('../../../modules/show-controller', () => ({ __esModule: true, default: { isAvailable: () => false } }))
jest.mock('../../../modules/show-voice', () => ({ VoiceNative: { getStatus: async () => ({ available: false }), subscribe: () => ({ remove: () => undefined }), disarm: async () => undefined } }))
jest.mock('../../music/downloads', () => ({ MusicDownloads: { recover: (...args: unknown[]) => mockRecover(...args) } }))

let app: ReturnType<typeof useApp>
let feedback: ReturnType<typeof useTaskFeedback>
const listeners = new Set<(state: AppStateStatus) => void>()
function Probe() { const value = useApp(); const notices = useTaskFeedback(); useEffect(() => { app = value; feedback = notices }, [value, notices]); return null }
async function mount() { const screen = render(<I18nProvider><AppProvider><Probe /></AppProvider></I18nProvider>); await act(async () => undefined); mockRecover.mockClear(); mockInitialize.mockClear(); return screen }
function foreground() { listeners.forEach((listener) => listener('active')) }
function deferred() { let resolve!: () => void; let reject!: (error: Error) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
beforeEach(() => {
  jest.clearAllMocks(); mockRecover.mockReset().mockResolvedValue(undefined); mockInitialize.mockReset().mockResolvedValue(undefined); listeners.clear()
  mockLibraryListeners.clear(); mockSnapshot = { status: 'ready', saving: false, shows: [sampleShow], selectedShowId: sampleShow.id, selectedSetId: sampleShow.sets[0]!.id, controllerProfiles: [], settings: DEFAULT_LIBRARY_SETTINGS }
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => { listeners.add(listener); return { remove: () => { listeners.delete(listener) } } })
})
afterEach(() => jest.restoreAllMocks())

describe('global Retry owns the failed operation', () => {
  it('prioritizes committed-library recovery and discards the failed import callback after reopening', async () => {
    await mount()
    const stalePreview = app.preview; const staleScrub = app.scrub; const staleResume = app.resumePreview
    const code = 'RESTORE_COMMITTED_RELOAD_REQUIRED: The backup was restored'
    const imported = { ...sampleShow, id: 'restored-show', revisionId: 'restored-version' }
    const restore = jest.fn(async () => {
      mockSnapshot = { ...mockSnapshot, status: 'error', error: code }; mockLibraryListeners.forEach((listener) => listener())
      throw new Error('A temporary task error must not hide the committed-library warning')
    })
    await act(async () => { expect(await app.runTask(restore)).toBe(false) })
    expect(feedback.failure?.detail).toBe(code); expect(feedback.failure?.dismiss).toBeUndefined()
    expect(app.show).toBeNull(); expect(app.set).toBeNull()
    await expect(stalePreview(sampleShow.cues.opening as AudioCue)).rejects.toThrow('RESTORE_COMMITTED_RELOAD_REQUIRED')
    await expect(staleScrub(sampleShow.cues.opening as AudioCue, 0)).rejects.toThrow('RESTORE_COMMITTED_RELOAD_REQUIRED')
    await expect(staleResume()).rejects.toThrow('RESTORE_COMMITTED_RELOAD_REQUIRED')
    await expect(app.previewLibrarySong(sampleShow.id, 'opening')).rejects.toThrow('RESTORE_COMMITTED_RELOAD_REQUIRED')
    await act(async () => { expect(await app.beginRehearsal()).toBe(false) })
    mockInitialize.mockImplementationOnce(async () => {
      const { error: previous, ...ready } = mockSnapshot; void previous
      mockSnapshot = { ...ready, status: 'ready', shows: [sampleShow, imported], selectedShowId: imported.id }; mockLibraryListeners.forEach((listener) => listener())
    })
    await act(async () => { feedback.failure!.retry() })
    expect(mockInitialize).toHaveBeenCalledTimes(1); expect(restore).toHaveBeenCalledTimes(1)
    expect(app.show?.id).toBe(imported.id); expect(feedback.failure).toBeNull()
    await act(async () => { expect(await app.retryLastTask()).toBe(false) })
    expect(restore).toHaveBeenCalledTimes(1)
  })
  it('keeps a failed reopen retryable without reverting to the original mutation', async () => {
    await mount()
    const code = 'RESTORE_COMMITTED_RELOAD_REQUIRED: Reopen required'
    const restore = jest.fn(async () => {
      mockSnapshot = { ...mockSnapshot, status: 'error', error: code }; mockLibraryListeners.forEach((listener) => listener())
      throw new Error(code)
    })
    await act(async () => { expect(await app.runTask(restore)).toBe(false) })
    mockInitialize.mockRejectedValueOnce(new Error('Still unavailable'))
    await act(async () => { expect(await app.retryLastTask()).toBe(false) })
    expect(feedback.failure?.detail).toBe(code); expect(restore).toHaveBeenCalledTimes(1)
    mockInitialize.mockImplementationOnce(async () => {
      const { error: previous, ...ready } = mockSnapshot; void previous
      mockSnapshot = { ...ready, status: 'ready' }; mockLibraryListeners.forEach((listener) => listener())
    })
    await act(async () => { expect(await app.retryLastTask()).toBe(true) })
    await act(async () => { expect(await app.retryLastTask()).toBe(false) })
    expect(mockInitialize).toHaveBeenCalledTimes(2); expect(restore).toHaveBeenCalledTimes(1)
  })
  it('checks current library availability even when Retry was captured from an older render', async () => {
    await mount(); const staleRetry = app.retryLastTask
    const work = jest.fn().mockRejectedValue(new Error('Old import failed'))
    await act(async () => { await app.runTask(work) })
    act(() => {
      mockSnapshot = { ...mockSnapshot, status: 'error', error: 'Library unavailable' }; mockLibraryListeners.forEach((listener) => listener())
    })
    await act(async () => { expect(await staleRetry()).toBe(true) })
    expect(mockInitialize).toHaveBeenCalledTimes(1); expect(work).toHaveBeenCalledTimes(1)
  })
  it('hides stale editable selection while library reopening is in progress', async () => {
    await mount(); expect(app.show?.id).toBe(sampleShow.id)
    act(() => { mockSnapshot = { ...mockSnapshot, status: 'loading' }; mockLibraryListeners.forEach((listener) => listener()) })
    expect(app.show).toBeNull(); expect(app.set).toBeNull()
    await act(async () => { mockSnapshot = { ...mockSnapshot, status: 'ready' }; mockLibraryListeners.forEach((listener) => listener()) })
    expect(app.show?.id).toBe(sampleShow.id)
  })
  it('preserves a failed import, its Retry and feedback while device settings are pending', async () => {
    await mount()
    const importFile = jest.fn().mockRejectedValueOnce(new Error('Invalid imported audio')).mockResolvedValueOnce(null)
    await act(async () => { expect(await app.runTask(importFile)).toBe(false) })
    const settings = deferred(); let pending!: Promise<void>
    act(() => { pending = withDeviceSettingsAction(() => settings.promise) })
    expect(app.busy).toBe(true); expect(app.error).toBe('Invalid imported audio'); expect(feedback.failure?.detail).toBe('Invalid imported audio')
    await act(async () => { settings.resolve(); await pending })
    expect(app.busy).toBe(false); expect(app.error).toBe('Invalid imported audio')
    await act(async () => { expect(await app.retryLastTask()).toBe(true) })
    expect(importFile).toHaveBeenCalledTimes(2)
  })

  it('does not replace an import Retry with a failed settings action', async () => {
    await mount()
    const importFile = jest.fn().mockRejectedValueOnce(new Error('Invalid imported audio')).mockResolvedValueOnce(null)
    await act(async () => { expect(await app.runTask(importFile)).toBe(false) })
    await act(async () => { await expect(withDeviceSettingsAction(async () => { throw new Error('Settings unavailable') })).rejects.toThrow('Settings unavailable') })
    expect(app.error).toBe('Invalid imported audio'); expect(app.busy).toBe(false)
    await act(async () => { expect(await app.retryLastTask()).toBe(true) })
    expect(importFile).toHaveBeenCalledTimes(2)
  })

  it('does not replace existing success feedback when a device action completes', async () => {
    await mount()
    await act(async () => { await app.runTask(async () => 'saved', { message: 'common.saved' }) })
    const before = feedback.feedback
    await act(async () => { expect(await withDeviceSettingsAction(async () => 'opened')).toBe('opened') })
    expect(feedback.feedback).toBe(before); expect(app.error).toBeNull(); expect(app.busy).toBe(false)
  })

  it('retains an import retry when foreground download recovery completes after that import fails', async () => {
    await mount()
    const recovery = deferred(); mockRecover.mockReturnValueOnce(recovery.promise)
    act(foreground)
    const importFile = jest.fn().mockRejectedValueOnce(new Error('Declared file size is invalid')).mockResolvedValueOnce(null)
    await act(async () => { expect(await app.runTask(importFile)).toBe(false) })
    expect(app.error).toBe('Declared file size is invalid')
    await act(async () => recovery.resolve())
    await act(async () => { expect(await app.retryLastTask()).toBe(true) })
    expect(importFile).toHaveBeenCalledTimes(2); expect(mockRecover).toHaveBeenCalledTimes(1)
  })

  it('retains a failed picker action across a subsequent successful foreground reconciliation', async () => {
    await mount()
    const importFile = jest.fn().mockRejectedValueOnce(new Error('Empty media')).mockResolvedValueOnce(null)
    await act(async () => { expect(await app.runTask(importFile)).toBe(false) })
    await act(async () => foreground())
    expect(app.error).toBe('Empty media'); expect(feedback.failure?.detail).toBe('Empty media')
    await act(async () => { expect(await app.retryLastTask()).toBe(true) })
    expect(importFile).toHaveBeenCalledTimes(2); expect(mockRecover).toHaveBeenCalledTimes(1)
  })

  it('preserves visible import failure and its Retry when settings-return recovery fails', async () => {
    await mount()
    const importFile = jest.fn().mockRejectedValueOnce(new Error('Unusable imported audio')).mockResolvedValueOnce(null)
    await act(async () => { expect(await app.runTask(importFile)).toBe(false) })
    mockRecover.mockRejectedValueOnce(new Error('Download recovery unavailable'))
    await act(async () => { await withDeviceSettingsAction(async () => { foreground() }) })
    expect(app.error).toBe('Unusable imported audio'); expect(feedback.failure?.detail).toBe('Unusable imported audio')
    await act(async () => { expect(await app.retryLastTask()).toBe(true) })
    expect(importFile).toHaveBeenCalledTimes(2); expect(mockRecover).toHaveBeenCalledTimes(1)
  })

  it('surfaces and retries foreground recovery failure when there is no earlier failed action', async () => {
    await mount(); mockRecover.mockRejectedValueOnce(new Error('Download recovery unavailable'))
    await act(async () => foreground())
    expect(app.error).toBe('Download recovery unavailable'); expect(feedback.failure?.detail).toBe('Download recovery unavailable')
    await act(async () => { expect(await app.retryLastTask()).toBe(true) })
    expect(mockRecover).toHaveBeenCalledTimes(2); expect(app.error).toBeNull(); expect(feedback.failure).toBeNull()
  })

  it('keeps existing success feedback after returning from settings triggers foreground recovery', async () => {
    await mount(); await act(async () => { await app.runTask(async () => 'saved', { message: 'common.saved' }) })
    const before = feedback.feedback
    await act(async () => { await withDeviceSettingsAction(async () => { foreground() }) })
    expect(feedback.feedback).toBe(before); expect(mockRecover).toHaveBeenCalledTimes(1); expect(app.error).toBeNull()
  })

  it('does not erase a newer failure when an unrelated pending operation is cancelled', async () => {
    await mount()
    const old = deferred(); let oldTask!: Promise<boolean>
    act(() => { oldTask = app.runTask(() => old.promise, { silent: true }) })
    const importFile = jest.fn().mockRejectedValueOnce(new Error('Unusable audio')).mockResolvedValueOnce(null)
    await act(async () => { expect(await app.runTask(importFile)).toBe(false) })
    const cancellation = new Error('Cancelled'); cancellation.name = 'AbortError'
    await act(async () => { old.reject(cancellation); expect(await oldTask).toBe(false) })
    await act(async () => { expect(await app.retryLastTask()).toBe(true) })
    expect(importFile).toHaveBeenCalledTimes(2)
  })

  it('clears a retry after that same operation succeeds instead of replaying it again', async () => {
    await mount()
    const importFile = jest.fn().mockRejectedValueOnce(new Error('Invalid audio')).mockResolvedValueOnce(null)
    await act(async () => { expect(await app.runTask(importFile)).toBe(false) })
    await act(async () => { expect(await app.retryLastTask()).toBe(true); expect(await app.retryLastTask()).toBe(false) })
    expect(importFile).toHaveBeenCalledTimes(2)
  })

  it('keeps a newer failed action when an earlier retry succeeds afterward', async () => {
    await mount()
    const earlier = deferred()
    const first = jest.fn().mockRejectedValueOnce(new Error('First error')).mockReturnValueOnce(earlier.promise)
    const second = jest.fn().mockRejectedValueOnce(new Error('Second error')).mockResolvedValueOnce(null)
    await act(async () => { expect(await app.runTask(first)).toBe(false) })
    let retrying!: Promise<boolean>
    act(() => { retrying = app.retryLastTask() })
    await act(async () => { expect(await app.runTask(second)).toBe(false) })
    await act(async () => { earlier.resolve(); expect(await retrying).toBe(true) })
    await act(async () => { expect(await app.retryLastTask()).toBe(true) })
    expect(first).toHaveBeenCalledTimes(2); expect(second).toHaveBeenCalledTimes(2)
  })

  it('acknowledges a stored import error before explicit Retry so cancelling the reopened picker stays clear', async () => {
    await mount()
    const importFile = jest.fn().mockImplementationOnce(async () => {
      mockSnapshot = { ...mockSnapshot, error: 'Declared file size is invalid' }; mockLibraryListeners.forEach((listener) => listener())
      throw new Error('Declared file size is invalid')
    }).mockResolvedValueOnce(null)
    await act(async () => { expect(await app.runTask(importFile)).toBe(false) })
    expect(feedback.failure?.detail).toBe('Declared file size is invalid')
    await act(async () => { expect(await app.retryLastTask()).toBe(true) })
    expect(mockClearError).toHaveBeenCalledTimes(1); expect(importFile).toHaveBeenCalledTimes(2)
    expect(app.libraryState.error).toBeUndefined(); expect(app.error).toBeNull(); expect(feedback.failure).toBeNull()
    await act(async () => { expect(await app.retryLastTask()).toBe(false) })
    expect(mockClearError).toHaveBeenCalledTimes(1)
  })

  it('retains the new durable error when an explicit retry fails again', async () => {
    await mount()
    let attempt = 0
    const importFile = jest.fn(async (): Promise<null> => {
      const detail = ++attempt === 1 ? 'Declared file size is invalid' : 'Audio cannot be decoded'
      mockSnapshot = { ...mockSnapshot, error: detail }; mockLibraryListeners.forEach((listener) => listener())
      throw new Error(detail)
    })
    await act(async () => { expect(await app.runTask(importFile)).toBe(false) })
    await act(async () => { expect(await app.retryLastTask()).toBe(false) })
    expect(mockClearError).toHaveBeenCalledTimes(1)
    expect(app.libraryState.error).toBe('Audio cannot be decoded'); expect(feedback.failure?.detail).toBe('Audio cannot be decoded')
    importFile.mockResolvedValueOnce(null)
    await act(async () => { expect(await app.retryLastTask()).toBe(true) })
    expect(importFile).toHaveBeenCalledTimes(3); expect(feedback.failure).toBeNull()
  })

  it('keeps initialization failures on the initialize retry path without dismissing their store error', async () => {
    await mount()
    act(() => { mockSnapshot = { ...mockSnapshot, status: 'error', error: 'Library database is unavailable' }; mockLibraryListeners.forEach((listener) => listener()) })
    expect(feedback.failure?.dismiss).toBeUndefined()
    mockInitialize.mockClear()
    await act(async () => { feedback.failure!.retry() })
    expect(mockInitialize).toHaveBeenCalledTimes(1); expect(mockClearError).not.toHaveBeenCalled()
    expect(app.libraryState.status).toBe('error'); expect(app.libraryState.error).toBe('Library database is unavailable')
  })
})
