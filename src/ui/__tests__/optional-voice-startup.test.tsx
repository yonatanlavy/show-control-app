import { act, render } from '@testing-library/react-native'
import { useEffect } from 'react'
import type { VoiceStatus } from '../../../modules/show-voice'
import { sampleControllerProfiles, sampleShow } from '../../domain'
import { I18nProvider } from '../../i18n'
import { DEFAULT_LIBRARY_SETTINGS } from '../../library/types'
import { setCriticalSessionActive } from '../../runtime'
import { AppProvider, useApp } from '../AppProvider'

const available: VoiceStatus = { available: true, armed: false, modelReady: false, calibrated: false, detail: '' }
const mockGetStatus = jest.fn<Promise<VoiceStatus>, []>()
const mockDisarm = jest.fn<Promise<VoiceStatus>, []>()
const mockRemoveVoiceListener = jest.fn()
let mockVoiceListener: (status: VoiceStatus) => void = () => undefined
const mockInitialize = jest.fn().mockResolvedValue(undefined)
const mockEngine = { prepare: jest.fn().mockResolvedValue(undefined), dispatch: jest.fn().mockResolvedValue(undefined), shutdown: jest.fn().mockResolvedValue(undefined), subscribe: () => ({ remove: () => undefined }) }
const mockSnapshot = { status: 'ready', saving: false, shows: [sampleShow], selectedShowId: sampleShow.id, selectedSetId: sampleShow.sets[0]!.id, controllerProfiles: sampleControllerProfiles, settings: DEFAULT_LIBRARY_SETTINGS }
jest.mock('../../library', () => ({ createLibraryStore: () => ({ getSnapshot: () => mockSnapshot, subscribe: () => () => undefined, initialize: () => mockInitialize(), clearError: jest.fn() }) }))
jest.mock('../../audio', () => ({ ...jest.requireActual('../../audio'), resolveNativeAudioEngine: () => ({ available: true, engine: mockEngine }) }))
jest.mock('../../../modules/show-audio', () => ({ __esModule: true, default: { availability: () => ({ available: true }), addListener: () => ({ remove: () => undefined }), stopPreview: async () => undefined } }))
jest.mock('../../../modules/show-controller', () => ({ __esModule: true, default: { isAvailable: () => false } }))
jest.mock('../../../modules/show-visual', () => ({ __esModule: true, default: { configure: async () => undefined } }))
jest.mock('../../../modules/show-voice', () => ({ VoiceNative: { getStatus: () => mockGetStatus(), disarm: () => mockDisarm(), subscribe: (listener: (status: VoiceStatus) => void) => { mockVoiceListener = listener; return { remove: () => mockRemoveVoiceListener() } } } }))
jest.mock('../../music/downloads', () => ({ MusicDownloads: { recover: async () => undefined } }))

let app: ReturnType<typeof useApp>
function Probe() { const value = useApp(); useEffect(() => { app = value }, [value]); return null }
function mount() { return render(<I18nProvider><AppProvider><Probe /></AppProvider></I18nProvider>) }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
beforeEach(() => {
  jest.clearAllMocks(); setCriticalSessionActive(false)
  mockGetStatus.mockReset().mockResolvedValue(available); mockDisarm.mockReset().mockResolvedValue(available)
  mockEngine.prepare.mockReset().mockResolvedValue(undefined); mockEngine.dispatch.mockReset().mockResolvedValue(undefined); mockEngine.shutdown.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { setCriticalSessionActive(false) })

describe('optional voice startup and teardown failures', () => {
  it.each(['reject', 'throw'] as const)('keeps library and manual GO/panic usable when the initial voice status %ss', async (failure) => {
    if (failure === 'reject') mockGetStatus.mockRejectedValueOnce(new Error('Optional voice backend unavailable'))
    else mockGetStatus.mockImplementationOnce(() => { throw new Error('Optional voice module lookup failed') })
    mount(); await act(async () => undefined)
    expect(mockInitialize).toHaveBeenCalledTimes(1)
    expect(app.libraryState.status).toBe('ready'); expect(app.show?.id).toBe(sampleShow.id); expect(app.busy).toBe(false)
    expect(app.voiceStatus).toEqual({ available: false, armed: false, modelReady: false, calibrated: false, detail: '' })
    expect(app.error).toBeNull(); expect(mockEngine.dispatch).not.toHaveBeenCalled()
    await act(async () => { expect(await app.beginRehearsal()).toBe(true) })
    await act(async () => { expect(app.go()).not.toBeNull() })
    expect(mockEngine.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'TRIGGER_CUE' }))
    await act(async () => { expect(app.panic()).not.toBeNull() })
    expect(mockEngine.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'PANIC_FADE' }))
    expect(mockDisarm).not.toHaveBeenCalled()
  })

  it('preserves an unrelated failure and its deliberate Retry when voice status fails later', async () => {
    const read = deferred<VoiceStatus>(); mockGetStatus.mockReturnValueOnce(read.promise)
    mount(); await act(async () => undefined)
    const save = jest.fn().mockRejectedValueOnce(new Error('Save failed')).mockResolvedValueOnce(null)
    await act(async () => { expect(await app.runTask(save)).toBe(false); read.reject(new Error('Voice unavailable')) })
    expect(app.error).toBe('Save failed'); expect(app.voiceStatus?.available).toBe(false)
    await act(async () => { expect(await app.retryLastTask()).toBe(true) })
    expect(save).toHaveBeenCalledTimes(2)
  })

  it.each(['reject', 'resolve'] as const)('retains a newer native status when the initial read later %ss', async (settlement) => {
    const read = deferred<VoiceStatus>(); mockGetStatus.mockReturnValueOnce(read.promise)
    mount(); const armed = { ...available, armed: true, modelReady: true, calibrated: true }
    await act(async () => { mockVoiceListener(armed) })
    await act(async () => { if (settlement === 'reject') read.reject(new Error('Stale read failed')); else read.resolve(available) })
    expect(app.voiceStatus).toBe(armed); expect(app.error).toBeNull()
  })

  it.each(['reject', 'throw'] as const)('contains optional disarm failure during idle teardown: %s', async (failure) => {
    const screen = mount(); await act(async () => undefined)
    if (failure === 'reject') mockDisarm.mockRejectedValueOnce(new Error('Optional voice shutdown failed'))
    else mockDisarm.mockImplementationOnce(() => { throw new Error('Optional voice module gone') })
    await act(async () => { screen.unmount() })
    expect(mockRemoveVoiceListener).toHaveBeenCalledTimes(1); expect(mockDisarm).toHaveBeenCalledTimes(1)
    expect(mockEngine.shutdown).toHaveBeenCalledTimes(1)
    const replacement = mount(); await act(async () => undefined)
    expect(app.libraryState.status).toBe('ready'); expect(app.error).toBeNull(); expect(app.voiceStatus).toBe(available)
    replacement.unmount()
  })

  it('does not disarm a surviving show owner when its interface unmounts', async () => {
    const screen = mount(); await act(async () => undefined)
    await act(async () => { expect(await app.beginRehearsal()).toBe(true) })
    screen.unmount(); await act(async () => undefined)
    expect(mockDisarm).not.toHaveBeenCalled(); expect(mockEngine.shutdown).not.toHaveBeenCalled()
  })
})
