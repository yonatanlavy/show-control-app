import { act, render } from '@testing-library/react-native'
import type { EngineEvent } from '../../audio'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { sampleControllerProfiles, sampleShow } from '../../domain'
import { I18nProvider } from '../../i18n'
import { DEFAULT_LIBRARY_SETTINGS, type LibrarySnapshot } from '../../library/types'
import { isCriticalSessionActive } from '../../runtime'
import { isDeviceSettingsActionPending, withDeviceSettingsAction } from '../../runtime/device-settings-action'
import { AppProvider, useApp } from '../AppProvider'
import { operationErrorKey, useTaskFeedback } from '../feedback'

let mockSnapshot: LibrarySnapshot
let mockListener: () => void = () => undefined
const mockSequence: string[] = []
const mockStopPreview = jest.fn<Promise<void>, []>()
const mockPrepare = jest.fn<Promise<void>, [unknown]>()
const mockVisualPrepare = jest.fn<Promise<void>, [unknown]>()
let mockControllerAvailable = false
const mockControllerStart = jest.fn<Promise<void>, []>()
const mockPreview = jest.fn<Promise<void>, [unknown, number, boolean?]>()
const mockSeekPreview = jest.fn().mockResolvedValue(undefined)
const mockPausePreview = jest.fn().mockResolvedValue(undefined)
const mockResumePreview = jest.fn().mockResolvedValue(undefined)
let mockAudioAvailable = true
let mockPreviewListener: (event: EngineEvent) => void = () => undefined
const mockEngine = { prepare: mockPrepare, dispatch: jest.fn().mockResolvedValue(undefined), subscribe: () => ({ remove: () => undefined }), shutdown: jest.fn().mockResolvedValue(undefined) }
jest.mock('../../library', () => ({ createLibraryStore: () => ({ getSnapshot: () => mockSnapshot, subscribe: (listener: () => void) => { mockListener = listener; return () => undefined }, initialize: async () => undefined, clearError: jest.fn() }) }))
jest.mock('../../audio', () => ({ ...jest.requireActual('../../audio'), resolveNativeAudioEngine: () => ({ available: true, engine: mockEngine }) }))
jest.mock('../../../modules/show-audio', () => ({ __esModule: true, default: { availability: () => ({ available: mockAudioAvailable }), addListener: (listener: (event: EngineEvent) => void) => { mockPreviewListener = listener; return { remove: () => undefined } }, stopPreview: () => mockStopPreview(), previewCue: (cue: unknown, position: number, initialPaused: boolean) => mockPreview(cue, position, initialPaused), seekPreview: (position: number) => mockSeekPreview(position), pausePreview: () => mockPausePreview(), resumePreview: () => mockResumePreview() } }))
jest.mock('../../../modules/show-controller', () => ({ __esModule: true, default: { isAvailable: () => mockControllerAvailable,
  stop: async () => undefined, configure: async () => undefined, configureProfile: async () => undefined,
  start: () => mockControllerStart(), health: async () => ({ readyCount: 0 }), addInputListener: () => ({ remove: () => undefined }), addHealthListener: () => ({ remove: () => undefined }), addScanListener: () => ({ remove: () => undefined }) } }))
jest.mock('../../../modules/show-visual', () => ({ __esModule: true, default: { configure: async () => undefined, prepare: (snapshot: unknown) => mockVisualPrepare(snapshot) } }))
jest.mock('../../../modules/show-voice', () => ({ VoiceNative: { getStatus: async () => ({ available: false }), subscribe: () => ({ remove: () => undefined }), disarm: async () => undefined } }))
let app: ReturnType<typeof useApp>
let feedback: ReturnType<typeof useTaskFeedback>
function Probe() { const value = useApp(); const taskFeedback = useTaskFeedback(); useEffect(() => { app = value; feedback = taskFeedback }, [value, taskFeedback]); return null }
function mount() { return render(<I18nProvider><AppProvider><Probe /></AppProvider></I18nProvider>) }
async function confirm() { await act(async () => { app.toggleCheck('local'); app.toggleCheck('readable'); app.toggleCheck('order') }) }
function deferred() { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done }); return { promise, resolve } }

describe('complete arm flow', () => {
  it.each([['SYSTEM_AUDIO_SUPPRESSED', 'use.audio.suppressed'], ['AUDIO_INTERRUPTED', 'use.audio.interrupted']] as const)('retains the native audition reason %s for translated recovery', async (code, key) => {
    mount(); const cue = sampleShow.cues.opening; if (cue?.type !== 'audio') throw new Error('Fixture')
    await act(async () => { await app.preview(cue, 1500) })
    const before = app.session
    await act(async () => { mockPreviewListener({ type: 'PREVIEW_ERROR', code, message: 'Audition stopped by system policy' }) })
    expect(app.error).toContain(code)
    expect(operationErrorKey(app.error!)).toBe(key)
    expect(app.session).toBe(before)
  })
  it('reprepares changed tuning silently when seeking a paused audition', async () => {
    mount(); const cue = sampleShow.cues.opening; if (cue?.type !== 'audio') throw new Error('Fixture')
    await act(async () => { await app.preview(cue, 1500); await app.pausePreview(); await app.scrub({ ...cue, playbackRate: 2, gainDb: -12 }, 6000, false) })
    expect(mockPreview).toHaveBeenLastCalledWith(expect.objectContaining({ playbackRate: 2, gainDb: -12 }), 6000, true)
    expect(mockResumePreview).not.toHaveBeenCalled()
  })
  it('does not trap a read-only editor when the native audition module is unavailable', async () => {
    mockAudioAvailable = false
    try { mount(); await act(async () => { await expect(app.stopPreview()).resolves.toBeUndefined() }); expect(mockStopPreview).not.toHaveBeenCalled() }
    finally { mockAudioAvailable = true }
  })
  it('keeps native audition progress and pause separate from the show session', async () => {
    mount(); const cue = sampleShow.cues.opening; if (cue?.type !== 'audio') throw new Error('Fixture')
    await act(async () => { await app.preview(cue, 1500) }); const before = app.session
    await act(async () => { mockPreviewListener({ type: 'PREVIEW_STATE', generation: 10, cueId: cue.id, phase: 'playing', positionMs: 2300, trimInMs: 0, trimOutMs: 12000 }) })
    expect(app.previewState?.positionMs).toBe(2300); expect(app.session).toBe(before)
    await act(async () => { await app.pausePreview(); mockPreviewListener({ type: 'PREVIEW_STATE', generation: 10, cueId: cue.id, phase: 'paused', positionMs: 2300, trimInMs: 0, trimOutMs: 12000 }); await app.scrub(cue, 2500, false) })
    expect(mockPausePreview).toHaveBeenCalledTimes(1); expect(mockSeekPreview).toHaveBeenCalledWith(2500); expect(mockResumePreview).not.toHaveBeenCalled()
    await act(async () => { await app.stopPreview(); mockPreviewListener({ type: 'PREVIEW_STATE', generation: 10, cueId: cue.id, phase: 'playing', positionMs: 4000, trimInMs: 0, trimOutMs: 12000 }) })
    expect(app.previewState).toBeNull(); expect(app.session).toBe(before)
  })
  it('restarts audible scrubbing after a native preview reaches its end', async () => {
    mount(); const cue = sampleShow.cues.opening; if (cue?.type !== 'audio') throw new Error('Fixture')
    await act(async () => { await app.preview(cue, 1500); mockPreviewListener({ type: 'PREVIEW_STATE', generation: 3, cueId: cue.id, phase: 'stopped', positionMs: 0, trimInMs: 0, trimOutMs: 12000 }); await app.scrub(cue, 2000) })
    expect(mockPreview).toHaveBeenCalledTimes(2); expect(mockSeekPreview).not.toHaveBeenCalled()
  })
  it('ignores progress and errors from a replaced audition of the same song', async () => {
    mount(); const cue = sampleShow.cues.opening; if (cue?.type !== 'audio') throw new Error('Fixture')
    await act(async () => { await app.preview(cue, 1500); mockPreviewListener({ type: 'PREVIEW_STATE', generation: 10, cueId: cue.id, phase: 'playing', positionMs: 2300, trimInMs: 0, trimOutMs: 12000 }); await app.preview(cue, 4000) })
    await act(async () => { mockPreviewListener({ type: 'PREVIEW_STATE', generation: 10, cueId: cue.id, phase: 'playing', positionMs: 2800, trimInMs: 0, trimOutMs: 12000 }); mockPreviewListener({ type: 'PREVIEW_ERROR', generation: 10, cueId: cue.id, code: 'DECODE_FAILED', message: 'Old failure' }) })
    expect(app.previewState).toBeNull(); expect(app.error).toBeNull()
    await act(async () => { mockPreviewListener({ type: 'PREVIEW_STATE', generation: 11, cueId: cue.id, phase: 'playing', positionMs: 4100, trimInMs: 0, trimOutMs: 12000 }) })
    expect(app.previewState?.positionMs).toBe(4100)
  })
  it('ignores cancellation errors from an audition superseded by Stop', async () => {
    mount(); const cue = sampleShow.cues.opening; if (cue?.type !== 'audio') throw new Error('Fixture')
    let reject!: (reason: Error) => void; mockPreview.mockReturnValueOnce(new Promise<void>((_resolve, fail) => { reject = fail }))
    await act(async () => { const start = app.runTask(() => app.preview(cue)); await app.stopPreview(); reject(new Error('PREVIEW_CANCELLED')); expect(await start).toBe(true) })
    expect(app.error).toBeNull(); expect(app.previewState).toBeNull()
  })
  beforeEach(() => { jest.clearAllMocks(); mockPreview.mockResolvedValue(undefined); mockControllerAvailable = false; mockSequence.length = 0; mockSnapshot = { status: 'ready', saving: false, shows: [sampleShow], selectedShowId: sampleShow.id, selectedSetId: sampleShow.sets[0]!.id, controllerProfiles: sampleControllerProfiles, settings: { ...DEFAULT_LIBRARY_SETTINGS, externalDisplayEnabled: true } }; mockStopPreview.mockResolvedValue(undefined); mockPrepare.mockImplementation(async () => { mockSequence.push('audio') }); mockVisualPrepare.mockImplementation(async () => { mockSequence.push('visual') }) })
  it('reports an asynchronous audition failure and retries that audition without changing the show transport', async () => {
    mount(); const cue = sampleShow.cues.opening; if (cue?.type !== 'audio') throw new Error('Fixture is not audio')
    await act(async () => { await app.preview(cue, 1500) })
    const before = app.session
    await act(async () => { mockPreviewListener({ type: 'PREVIEW_ERROR', code: 'DECODE_FAILED', message: 'Decoder failed' }) })
    expect(app.error).toContain('PREVIEW_FAILED'); expect(app.session).toBe(before)
    await act(async () => { expect(await app.retryLastTask()).toBe(true) })
    expect(mockPreview).toHaveBeenCalledTimes(2); expect(mockPreview.mock.calls[1]![1]).toBe(1500)
    await act(async () => { await app.stopPreview(); app.clearError(); mockPreviewListener({ type: 'PREVIEW_ERROR', code: 'DECODE_FAILED', message: 'Late error' }) })
    expect(app.error).toBeNull()
  })
  it('can retry scrubbing after the native audition preparation rejects', async () => {
    mount(); const cue = sampleShow.cues.opening; if (cue?.type !== 'audio') throw new Error('Fixture is not audio')
    mockPreview.mockRejectedValueOnce(new Error('File could not be decoded'))
    await act(async () => { await expect(app.scrub(cue, 1500)).rejects.toThrow('decoded') })
    await act(async () => { await expect(app.scrub(cue, 1600)).resolves.toBeUndefined() })
    expect(mockPreview).toHaveBeenCalledTimes(2); expect(mockPreview.mock.calls[1]![1]).toBe(1600)
  })
  it('latches the entire asynchronous preparation and prepares visuals before audio once', async () => {
    mount(); await confirm(); const stop = deferred(); mockStopPreview.mockReturnValueOnce(stop.promise); let first!: Promise<boolean>
    await act(async () => { first = app.armShow(); expect(isCriticalSessionActive()).toBe(true); expect(await app.armShow()).toBe(false) })
    expect(app.busy).toBe(true); expect(mockPrepare).not.toHaveBeenCalled()
    await act(async () => { stop.resolve(); expect(await first).toBe(true) }); expect(mockSequence).toEqual(['visual', 'audio']); expect(mockPrepare).toHaveBeenCalledTimes(1)
  })
  it('blocks arm during a task admitted in the same frame', async () => {
    mount(); await confirm(); const save = deferred(); let pending!: Promise<boolean>
    await act(async () => { pending = app.runTask(() => save.promise); expect(await app.armShow()).toBe(false) }); expect(mockPrepare).not.toHaveBeenCalled(); await act(async () => { save.resolve(); await pending })
  })
  it('blocks both preparation modes while a device action is pending in the same frame', async () => {
    mount(); await confirm(); const permission = deferred(); let pending!: Promise<void>
    await act(async () => {
      pending = withDeviceSettingsAction(() => permission.promise)
      expect(await app.armShow()).toBe(false); expect(await app.beginRehearsal()).toBe(false)
    })
    expect(app.busy).toBe(true); expect(mockPrepare).not.toHaveBeenCalled()
    await act(async () => { permission.resolve(); await pending })
    expect(app.busy).toBe(false)
    await act(async () => { expect(await app.armShow()).toBe(true) })
    expect(mockPrepare).toHaveBeenCalledTimes(1)
  })
  it('keeps a device action leased across interface teardown and blocks a replacement provider', async () => {
    const screen = mount(); await confirm(); const permission = deferred(); let pending!: Promise<void>
    act(() => { pending = withDeviceSettingsAction(() => permission.promise) })
    screen.unmount(); expect(isDeviceSettingsActionPending()).toBe(true)
    mount(); await confirm()
    expect(app.busy).toBe(true)
    await act(async () => { expect(await app.armShow()).toBe(false); expect(await app.beginRehearsal()).toBe(false) })
    expect(mockPrepare).not.toHaveBeenCalled()
    await act(async () => { permission.resolve(); await pending })
    expect(app.busy).toBe(false)
    await act(async () => { expect(await app.beginRehearsal()).toBe(true) })
  })
  it('refuses a device action after native preparation has already won admission', async () => {
    mount(); await confirm(); const stop = deferred(); mockStopPreview.mockReturnValueOnce(stop.promise)
    const deviceAction = jest.fn().mockResolvedValue(undefined); let pending!: Promise<boolean>
    await act(async () => {
      pending = app.armShow()
      await expect(withDeviceSettingsAction(deviceAction)).rejects.toThrow('LIVE_SESSION_LOCKED')
    })
    expect(deviceAction).not.toHaveBeenCalled()
    await act(async () => { stop.resolve(); expect(await pending).toBe(true) })
  })
  it.each(['background', 'inactive', 'unknown'] as const)('refuses hidden or unknown app-state preparation: %s', async (state) => {
    mount(); await confirm(); const original = AppState.currentState
    try {
      jest.replaceProperty(AppState, 'currentState', state)
      await act(async () => { expect(await app.armShow()).toBe(false); expect(await app.beginRehearsal()).toBe(false) })
      expect(mockPrepare).not.toHaveBeenCalled()
      jest.replaceProperty(AppState, 'currentState', 'active')
      await act(async () => { expect(await app.armShow()).toBe(true) })
    } finally { jest.replaceProperty(AppState, 'currentState', original) }
  })
  it('does not announce a completed import when the system picker is cancelled', async () => {
    mount(); await act(async () => { await app.runTask(async () => undefined) }); expect(feedback.feedback?.message).toBe('common.complete')
    await act(async () => { expect(await app.runTask(async () => null)).toBe(true) }); expect(feedback.feedback).toBeNull(); expect(app.busy).toBe(false); expect(app.error).toBeNull()
  })
  it('rejects an editor preview or scrub admitted before the preparation render updates', async () => {
    mount(); await confirm(); const stop = deferred(); mockStopPreview.mockReturnValueOnce(stop.promise); let pending!: Promise<boolean>
    const cue = sampleShow.cues.opening; if (cue?.type !== 'audio') throw new Error('Fixture is not audio')
    await act(async () => { pending = app.armShow(); await expect(app.preview(cue)).rejects.toThrow('editor.previewSafety'); await expect(app.scrub(cue, 1000)).rejects.toThrow('editor.previewSafety') })
    expect(mockPreview).not.toHaveBeenCalled(); await act(async () => { stop.resolve(); expect(await pending).toBe(true) })
  })
  it('keeps manual control available when a configured controller cannot start', async () => {
    mockControllerAvailable = true; mockControllerStart.mockRejectedValueOnce(new Error('Bluetooth unavailable'))
    mount(); await confirm(); await act(async () => { expect(await app.armShow()).toBe(true) })
    expect(app.session.phase).toBe('ready'); expect(app.error).toContain('Bluetooth unavailable'); await act(async () => { expect(app.go()).not.toBeNull() })
  })
  it('rejects confirmations for a newer revision even before its subscription rerenders', async () => {
    mount(); await confirm(); mockSnapshot = { ...mockSnapshot, shows: [{ ...sampleShow, revisionId: 'newer' }] }
    await act(async () => { expect(await app.armShow()).toBe(false) }); expect(mockPrepare).not.toHaveBeenCalled()
    await act(async () => { mockListener() }); await confirm(); await act(async () => { expect(await app.armShow()).toBe(true) }); expect((mockPrepare.mock.calls[0]![0] as { revisionId: string }).revisionId).toBe('newer')
  })
  it('reads saving from persistence rather than a previous render', async () => {
    mount(); await confirm(); mockSnapshot = { ...mockSnapshot, saving: true }; await act(async () => { expect(await app.armShow()).toBe(false) }); expect(mockPrepare).not.toHaveBeenCalled()
  })
  it('releases failed setup and permits a deliberate retry', async () => {
    mount(); await confirm(); mockStopPreview.mockRejectedValueOnce(new Error('Preview output failed')); await act(async () => { expect(await app.armShow()).toBe(false) }); expect(app.busy).toBe(false); expect(isCriticalSessionActive()).toBe(false); await act(async () => { expect(await app.armShow()).toBe(true) })
  })
  it('never prepares audio after the provider unmounts during preview shutdown', async () => {
    const screen = mount(); await confirm(); const stop = deferred(); mockStopPreview.mockReturnValueOnce(stop.promise); let pending!: Promise<boolean>; await act(async () => { pending = app.armShow() }); screen.unmount(); await act(async () => { stop.resolve(); expect(await pending).toBe(false) }); expect(mockPrepare).not.toHaveBeenCalled(); expect(isCriticalSessionActive()).toBe(false)
  })
})
