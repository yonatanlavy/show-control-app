import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import { useEffect } from 'react'
import { ScrollView, TextInput } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import type { EngineCommand, EngineEvent, NativeRunState, SessionPurpose } from '../../audio'
import { sampleControllerProfiles, sampleShow, type AppLocale, type RunSnapshot, type Show } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import { DEFAULT_LIBRARY_SETTINGS, type LibrarySnapshot } from '../../library/types'
import { isCriticalSessionActive, setCriticalSessionActive } from '../../runtime'
import { AppProvider, useApp } from '../AppProvider'
import { RehearsalScreen } from '../rehearsal-screen'
import { RunScreen } from '../screens'

let mockSnapshot: LibrarySnapshot
let mockNativeState: NativeRunState
let mockEngineAvailable = true
const mockEngineListeners = new Set<(event: EngineEvent) => void>()
const mockRouter = { push: jest.fn(), replace: jest.fn() }
const mockWaveform = jest.fn<Promise<readonly number[]>, [string]>()
const mockStopPreview = jest.fn<Promise<void>, []>()
const mockVisualPrepare = jest.fn<Promise<void>, [RunSnapshot]>()
const mockPrepare = jest.fn<Promise<void>, [RunSnapshot, SessionPurpose?]>()
const mockDispatch = jest.fn<Promise<void>, [EngineCommand]>()
const mockUrgent = jest.fn<Promise<void>, [EngineCommand]>()
const mockShutdown = jest.fn<Promise<void>, []>()
const mockEngine = {
  prepare: mockPrepare, dispatch: mockDispatch, dispatchUrgent: mockUrgent, shutdown: mockShutdown,
  getState: async () => mockNativeState,
  subscribe: (listener: (event: EngineEvent) => void) => { mockEngineListeners.add(listener); return { remove: () => mockEngineListeners.delete(listener) } },
}
const mockLibrary = { getSnapshot: () => mockSnapshot, subscribe: () => () => undefined,
  initialize: async () => undefined, clearError: jest.fn(), waveform: mockWaveform,
}
jest.mock('../../library', () => ({ createLibraryStore: () => mockLibrary }))
jest.mock('../../audio', () => ({ ...jest.requireActual('../../audio'), resolveNativeAudioEngine: () => mockEngineAvailable ? { available: true, engine: mockEngine } : { available: false, reason: 'Native backend unavailable' } }))
jest.mock('../../../modules/show-audio', () => ({ __esModule: true, default: {
  availability: () => ({ available: mockEngineAvailable }), stopPreview: () => mockStopPreview(), addListener: () => ({ remove: () => undefined }),
} }))
jest.mock('../../../modules/show-controller', () => ({ __esModule: true, default: { isAvailable: () => false } }))
jest.mock('../../../modules/show-visual', () => ({ __esModule: true, default: { configure: async () => undefined, prepare: (snapshot: RunSnapshot) => mockVisualPrepare(snapshot) } }))
jest.mock('../../../modules/show-voice', () => ({ VoiceNative: { getStatus: async () => ({ available: false }), subscribe: () => ({ remove: () => undefined }), disarm: async () => undefined } }))
jest.mock('../../music/downloads', () => ({ MusicDownloads: { recover: async () => null } }))
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))
let app: ReturnType<typeof useApp>
function Probe() { const value = useApp(); useEffect(() => { app = value }, [value]); return null }
function fixture(): Show {
  const original = structuredClone(sampleShow); const opening = original.cues.opening
  if (opening?.type !== 'audio') throw new Error('Audio fixture is missing')
  return { ...original, schemaVersion: 2, cues: { ...original.cues, opening: { ...opening, trimInMs: 1000, trimOutMs: 21000, playbackRate: 2 } },
    sets: [{ ...original.sets[0]!, transportMode: 'oms', cueOrder: ['opening', 'bed'] }] }
}
const appView = (surface: 'run' | 'rehearsal' = 'rehearsal') => <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}><I18nProvider><AppProvider><Probe />{surface === 'run' ? <RunScreen /> : <RehearsalScreen />}</AppProvider></I18nProvider></SafeAreaInsetsContext.Provider>
const mount = () => render(appView())
async function prepare(screen: ReturnType<typeof mount>) {
  await waitFor(() => expect(screen.getByRole('button', { name: messages.en['practice.prepare'] })).toBeEnabled())
  fireEvent.press(screen.getByRole('button', { name: messages.en['practice.prepare'] }))
  await waitFor(() => expect(app.session.phase).toBe('ready'))
  expect(screen.getByText(messages.en['practice.lockedShort'])).toBeTruthy()
  expect(screen.getByLabelText(messages.en['practice.locked'])).toBeTruthy()
}
async function openSeekTools(screen: ReturnType<typeof mount>) {
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: messages.en['practice.seekTools'] })) })
}
async function publish(changes: Partial<NativeRunState>) {
  await act(async () => {
    mockNativeState = { ...mockNativeState, ...changes }
    if (changes.phase === 'playing' && changes.currentCueId) {
      mockEngineListeners.forEach((listener) => listener({ type: 'VOICE_START', cueId: changes.currentCueId!, voiceId: `native-${mockNativeState.generation}-${changes.currentCueId}`, mainTransport: true }))
    }
    mockEngineListeners.forEach((listener) => listener(mockNativeState))
  })
}
async function progress(positionMs: number, mainTransport = true) {
  await act(async () => mockEngineListeners.forEach((listener) => listener({ type: 'PROGRESS', cueId: 'opening', positionMs, durationMs: 20000, mainTransport })))
}
beforeEach(() => {
  jest.clearAllMocks(); mockEngineListeners.clear(); mockEngineAvailable = true; setCriticalSessionActive(false)
  const show = fixture()
  mockSnapshot = { status: 'ready', saving: false, shows: [show], selectedShowId: show.id, selectedSetId: 'set-main', controllerProfiles: sampleControllerProfiles,
    settings: { ...DEFAULT_LIBRARY_SETTINGS, externalDisplayEnabled: true, onboardingCompleted: true } }
  mockNativeState = { type: 'RUN_STATE', generation: 0, transportMode: 'legacyCueStack', sessionPurpose: 'performance', phase: 'stopped',
    selectedCueId: '', currentCueId: '', nextCueId: '', currentCueIndex: -1, nextCueIndex: 0, activeVoiceCount: 0, countdownRemainingMs: 0 }
  mockStopPreview.mockResolvedValue(undefined); mockVisualPrepare.mockResolvedValue(undefined); mockWaveform.mockResolvedValue([0.1, 0.8, 0.4])
  mockDispatch.mockResolvedValue(undefined); mockUrgent.mockResolvedValue(undefined); mockShutdown.mockResolvedValue(undefined)
  mockPrepare.mockImplementation(async (snapshot, purpose) => {
    mockNativeState = { type: 'RUN_STATE', generation: 1, transportMode: snapshot.transportMode ?? 'legacyCueStack', sessionPurpose: purpose ?? 'performance',
      showId: snapshot.showId, setId: snapshot.setId, revisionId: snapshot.revisionId, phase: 'ready', selectedCueId: 'opening', currentCueId: '',
      nextCueId: 'bed', currentCueIndex: -1, nextCueIndex: 1, activeVoiceCount: 0, countdownRemainingMs: 0 }
  })
})

describe('complete rehearsal UI with the real session provider', () => {
  it('disables ordinary choices after native-unavailable preparation while preserving silent exit and safety', async () => {
    mockEngineAvailable = false
    const screen = mount()
    await waitFor(() => expect(screen.getByRole('button', { name: messages.en['practice.prepare'] })).toBeEnabled())
    fireEvent.press(screen.getByRole('button', { name: messages.en['practice.prepare'] }))
    await waitFor(() => expect(app.session.phase).toBe('unavailable'))
    await waitFor(() => expect(app.busy).toBe(false))
    expect(app.session.snapshot).not.toBeNull()
    expect(app.session.engineAvailable).toBe(false)
    expect(screen.getByRole('button', { name: messages.en['command.PREVIOUS'] })).toBeDisabled()
    expect(screen.getByRole('button', { name: messages.en['recovery.replay'] })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^GO/ })).toBeDisabled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['practice.select'] }))
    const song = screen.getByRole('button', { name: /^01 · House to stage/ })
    expect(song).toBeDisabled(); fireEvent.press(song)
    fireEvent.press(screen.getByRole('button', { name: messages.en['run.hits'] }))
    const hit = screen.getByRole('button', { name: /^01 · Reveal hit/ })
    expect(hit).toBeDisabled(); fireEvent.press(hit)
    expect(screen.getByRole('button', { name: messages.en['recovery.stop'] })).toBeEnabled()
    expect(screen.getByRole('button', { name: messages.en['recovery.fade'] })).toBeEnabled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['practice.exit'] }))
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/builder'))
    expect(app.session.snapshot).toBeNull(); expect(isCriticalSessionActive()).toBe(false)
    expect(mockStopPreview).not.toHaveBeenCalled(); expect(mockPrepare).not.toHaveBeenCalled(); expect(mockDispatch).not.toHaveBeenCalled(); expect(mockUrgent).not.toHaveBeenCalled(); expect(mockShutdown).not.toHaveBeenCalled()
  })
  it.each(['run', 'rehearsal'] as const)('disables paused Hits in %s while keeping explicit resume and safety available', async (surface) => {
    const screen = mount(); await prepare(screen)
    if (surface === 'run') screen.rerender(appView('run'))
    await publish({ phase: 'paused', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 1 })
    fireEvent.press(screen.getByRole('button', { name: messages.en['run.hits'] }))
    const hitName = surface === 'run' ? 'Reveal hit' : /^01 · Reveal hit/
    const hit = screen.getByRole('button', { name: hitName })
    expect(hit).toBeDisabled()
    fireEvent.press(hit)
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: `${messages.en['run.resume']} · House to stage` })).toBeEnabled()
    const fadeName = surface === 'run' ? messages.en['run.fade'].replace('{seconds}', '2') : messages.en['recovery.fade']
    expect(screen.getByRole('button', { name: fadeName })).toBeEnabled()
    await publish({ phase: 'playing' })
    expect(screen.getByRole('button', { name: hitName })).toBeEnabled()
    fireEvent.press(screen.getByRole('button', { name: hitName }))
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'TRIGGER_HIT', cueId: 'reveal' })))
  })

  it('keeps the next song ahead of collapsed seek tools without reading a waveform or dispatching audio', async () => {
    const screen = mount(); await prepare(screen)
    expect(mockWaveform).not.toHaveBeenCalled()
    expect(screen.getByLabelText(`${messages.en['run.next']}: Tension bed`)).toBeTruthy()
    expect(screen.getByRole('button', { name: messages.en['practice.seekTools'] }).props.accessibilityState.expanded).toBe(false)
    expect(screen.queryByRole('adjustable', { name: messages.en['editor.waveform'] })).toBeNull()
    expect(screen.getByRole('button', { name: `${messages.en['run.go']} · House to stage` })).toBeEnabled()
    expect(screen.getByRole('button', { name: messages.en['recovery.fade'] })).toBeEnabled()
    expect(mockDispatch).not.toHaveBeenCalled(); expect(mockUrgent).not.toHaveBeenCalled()
  })

  it('opens seek tools deliberately, preserves native time and hides the tools without transport commands', async () => {
    const screen = mount(); await prepare(screen)
    const revision = app.session.snapshot
    const tools = screen.getByRole('button', { name: messages.en['practice.seekTools'] })
    fireEvent.press(tools)
    await waitFor(() => expect(mockWaveform).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('adjustable', { name: messages.en['editor.waveform'] })).toBeDisabled()
    await publish({ phase: 'playing', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 1 })
    await progress(12500)
    expect(screen.getByRole('adjustable', { name: messages.en['editor.waveform'] }).props.accessibilityValue.now).toBe(13.5)
    fireEvent.press(screen.getByRole('button', { name: messages.en['practice.seekTools'] }))
    expect(screen.queryByRole('adjustable', { name: messages.en['editor.waveform'] })).toBeNull()
    expect(screen.getByLabelText(`${messages.en['run.elapsed']}: 0:06.250`)).toBeTruthy()
    expect(app.session.snapshot).toBe(revision)
    expect(mockDispatch).not.toHaveBeenCalled(); expect(mockUrgent).not.toHaveBeenCalled()
  })

  it.each(['rehearsal', 'run'] as const)('shows native voice capacity through full, paused, stale and stopped states in %s', async (surface) => {
    const screen = mount(); await prepare(screen)
    if (surface === 'run') screen.rerender(appView('run'))
    const label = (count: number) => `${messages.en['refine.voices']}: ${count} / 8`
    expect(screen.getByLabelText(label(0))).toBeTruthy()
    await publish({ phase: 'playing', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 8 })
    expect(screen.getByLabelText(label(8))).toBeTruthy()
    await act(async () => mockEngineListeners.forEach((listener) => listener({ ...mockNativeState, generation: 0, activeVoiceCount: 2 })))
    expect(screen.getByLabelText(label(8))).toBeTruthy(); expect(screen.queryByLabelText(label(2))).toBeNull()
    await publish({ phase: 'paused' })
    expect(screen.getByLabelText(label(8))).toBeTruthy()
    await publish({ phase: 'ready', currentCueId: '', activeVoiceCount: 0 })
    expect(screen.getByLabelText(label(0))).toBeTruthy()
    expect(mockDispatch).not.toHaveBeenCalled(); expect(mockUrgent).not.toHaveBeenCalled()
  })

  it('ignores a late failed waveform after tools close and reopen on the same song', async () => {
    let rejectOld!: (error: Error) => void; let finishCurrent!: (peaks: readonly number[]) => void
    mockWaveform.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishCurrent = resolve }))
    const screen = mount(); await prepare(screen); await openSeekTools(screen)
    fireEvent.press(screen.getByRole('button', { name: messages.en['practice.seekTools'] }))
    await openSeekTools(screen)
    await act(async () => finishCurrent([0.2, 0.7]))
    await act(async () => rejectOld(new Error('Old reader failed')))
    expect(screen.queryByRole('button', { name: messages.en['common.retry'] })).toBeNull()
    expect(screen.getByRole('adjustable', { name: messages.en['editor.waveform'] })).toBeTruthy()
    expect(mockWaveform).toHaveBeenCalledTimes(2)
    expect(mockDispatch).not.toHaveBeenCalled(); expect(mockUrgent).not.toHaveBeenCalled()
  })

  it('keeps an old song waveform reply out of the newly selected song', async () => {
    let rejectOld!: (error: Error) => void; let finishCurrent!: (peaks: readonly number[]) => void
    mockWaveform.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishCurrent = resolve }))
    const screen = mount(); await prepare(screen); await openSeekTools(screen)
    await publish({ phase: 'ready', currentCueId: '', selectedCueId: 'bed', nextCueId: '' })
    expect(mockWaveform).toHaveBeenCalledTimes(2)
    expect(mockWaveform.mock.calls[1]![0]).not.toBe(mockWaveform.mock.calls[0]![0])
    await act(async () => finishCurrent([0.3, 0.9]))
    await act(async () => rejectOld(new Error('Old media reply')))
    expect(screen.queryByRole('button', { name: messages.en['common.retry'] })).toBeNull()
    expect(screen.getByRole('button', { name: `${messages.en['run.go']} · Tension bed` })).toBeEnabled()
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('collapses seeking on a new native generation and never restarts a media read implicitly', async () => {
    const screen = mount(); await prepare(screen); await openSeekTools(screen)
    await publish({ generation: 2, phase: 'ready', currentCueId: '', selectedCueId: 'opening', activeVoiceCount: 0 })
    expect(screen.getByRole('button', { name: messages.en['practice.seekTools'] }).props.accessibilityState.expanded).toBe(false)
    expect(screen.queryByRole('adjustable', { name: messages.en['editor.waveform'] })).toBeNull()
    expect(mockWaveform).toHaveBeenCalledTimes(1)
    expect(mockDispatch).not.toHaveBeenCalled(); expect(mockUrgent).not.toHaveBeenCalled()
  })

  it('does not reload the waveform on native progress, paused state or independent voice updates', async () => {
    const screen = mount(); await prepare(screen); await openSeekTools(screen)
    await publish({ phase: 'playing', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 1 })
    await progress(1000); await progress(2000); await publish({ phase: 'paused', activeVoiceCount: 4 })
    expect(mockWaveform).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('adjustable', { name: messages.en['editor.waveform'] }).props.accessibilityValue.now).toBe(3)
    expect(screen.getByLabelText(`${messages.en['refine.voices']}: 4 / 8`)).toBeTruthy()
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('retains the full next-song identity for assistive reading before opening secondary tools', async () => {
    const show = mockSnapshot.shows[0]!, next = show.cues.bed!
    const name = 'A very long finale title · סיום המופע · a deliberate encore after the applause'
    mockSnapshot = { ...mockSnapshot, shows: [{ ...show, cues: { ...show.cues, bed: { ...next, name } } }] }
    const screen = mount(); await prepare(screen)
    expect(screen.getByLabelText(`${messages.en['run.next']}: ${name}`)).toBeTruthy()
    expect(mockWaveform).not.toHaveBeenCalled(); expect(mockDispatch).not.toHaveBeenCalled()
  })

  it.each(['en', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ar'] as const)('exposes labelled seeking and the next-song summary in %s', async (locale: AppLocale) => {
    mockSnapshot = { ...mockSnapshot, settings: { ...mockSnapshot.settings, locale } }
    const screen = mount()
    await waitFor(() => expect(screen.getByRole('button', { name: messages[locale]['practice.prepare'] })).toBeEnabled())
    fireEvent.press(screen.getByRole('button', { name: messages[locale]['practice.prepare'] }))
    await waitFor(() => expect(app.session.phase).toBe('ready'))
    expect(screen.getByLabelText(`${messages[locale]['run.next']}: Tension bed`)).toBeTruthy()
    const tools = screen.getByRole('button', { name: messages[locale]['practice.seekTools'] })
    expect(tools.props.accessibilityState.expanded).toBe(false); expect(mockWaveform).not.toHaveBeenCalled()
    await act(async () => fireEvent.press(tools))
    expect(screen.getByRole('adjustable', { name: messages[locale]['editor.waveform'] })).toBeDisabled()
    expect(screen.getByRole('button', { name: messages[locale]['recovery.fade'] })).toBeEnabled()
    expect(mockDispatch).not.toHaveBeenCalled(); expect(mockUrgent).not.toHaveBeenCalled()
  })

  it('keeps current native capacity in the Run Hits panel without hiding safety controls or dispatching sound', async () => {
    const screen = mount(); await prepare(screen); screen.rerender(appView('run'))
    await publish({ phase: 'playing', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 1 })
    fireEvent.press(screen.getByRole('button', { name: messages.en['run.hits'] }))
    expect(screen.getAllByLabelText(`${messages.en['refine.voices']}: 1 / 8`)).toHaveLength(1)
    await publish({ activeVoiceCount: 8 })
    expect(screen.getAllByLabelText(`${messages.en['refine.voices']}: 8 / 8`)).toHaveLength(1)
    expect(screen.getByRole('button', { name: messages.en['run.recovery'] })).toBeEnabled()
    expect(screen.getByRole('button', { name: messages.en['run.fade'].replace('{seconds}', '2') })).toBeEnabled()
    expect(screen.getByRole('button', { name: `${messages.en['run.next']} · Tension bed` })).toBeEnabled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.cancel'] }))
    expect(screen.getByLabelText(`${messages.en['refine.voices']}: 8 / 8`)).toBeTruthy()
    expect(mockDispatch).not.toHaveBeenCalled(); expect(mockUrgent).not.toHaveBeenCalled()
  })

  it('windows the full preparation list and searches its final song without filtering the prepared snapshot', async () => {
    const show = mockSnapshot.shows[0]!, audio = show.cues.opening, hit = show.cues.reveal;
    if (audio?.type !== 'audio' || hit?.type !== 'audio') throw new Error('Audio fixture missing');
    const songs = Array.from({ length: 158 }, (_, index) => ({ ...audio, id: `practice-${index + 2}`, name: `Practice song ${index + 2}` }));
    const hits = Array.from({ length: 39 }, (_, index) => ({ ...hit, id: `practice-hit-${index + 1}`, name: `Practice Hit ${index + 1}` }));
    mockSnapshot = { ...mockSnapshot, shows: [{ ...show, cues: { ...show.cues, ...Object.fromEntries([...songs, ...hits].map((cue) => [cue.id, cue])) },
      sets: [{ ...show.sets[0]!, cueOrder: ['opening', 'bed', ...songs.map((cue) => cue.id)], hitCueIds: ['reveal', ...hits.map((cue) => cue.id)] }] }] };
    const screen = mount(); await waitFor(() => expect(screen.getByText('House to stage')).toBeTruthy());
    expect(screen.queryAllByText(/^Practice song /).length).toBeLessThan(40);
    fireEvent.changeText(screen.getByLabelText(messages.en['use.library.findCue']), 'Ｐｒａｃｔｉｃｅ　ｓｏｎｇ　１５９');
    await waitFor(() => expect(screen.getByText('Practice song 159')).toBeTruthy());
    expect(screen.getByText('160')).toBeTruthy(); expect(screen.queryByText('Practice song 2')).toBeNull();
    await prepare(screen);
    expect(mockPrepare.mock.calls[0]![0].cueOrder).toHaveLength(160); expect(mockPrepare.mock.calls[0]![0].hitCueIds).toHaveLength(40);
    expect(mockDispatch).not.toHaveBeenCalled(); expect(screen.UNSAFE_queryAllByType(TextInput)).toHaveLength(0);
    fireEvent.press(screen.getByRole('button', { name: messages.en['practice.select'] }));
    expect(within(screen.getByTestId('collection-viewport')).getByRole('button', { name: /^01 · House to stage/ })).toBeTruthy();
    expect(within(screen.getByTestId('collection-viewport')).queryAllByText(/^Practice song /).length).toBeLessThan(40);
    fireEvent.press(screen.getByRole('button', { name: messages.en['run.hits'] }));
    expect(within(screen.getByTestId('collection-viewport')).getByRole('button', { name: /^01 · Reveal hit/ })).toBeTruthy();
    expect(within(screen.getByTestId('collection-viewport')).queryAllByText(/^Practice Hit /).length).toBeLessThan(30);
    expect(app.session.snapshot?.cueOrder).toHaveLength(160); expect(app.session.snapshot?.hitCueIds).toHaveLength(40);
  }, 10_000); // Real-provider 200-cue integration budget; not a playback-latency claim.

  it('searches song notes and independent Hits, clears an empty result and preserves original order', async () => {
    const show = mockSnapshot.shows[0]!, cue = show.cues.bed!;
    mockSnapshot = { ...mockSnapshot, shows: [{ ...show, cues: { ...show.cues, bed: { ...cue, notes: 'quiet audience volunteer' } } }] };
    const screen = mount(); await waitFor(() => expect(screen.getByText('House to stage')).toBeTruthy());
    const search = screen.getByLabelText(messages.en['use.library.findCue']);
    fireEvent.changeText(search, 'quiet volunteer');
    await waitFor(() => expect(screen.getByText('Tension bed')).toBeTruthy());
    expect(screen.getByText('02')).toBeTruthy(); expect(screen.queryByText('House to stage')).toBeNull();
    fireEvent.changeText(search, 'reveal');
    await waitFor(() => expect(screen.getByText('Reveal hit')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Reveal hit' })).toBeNull();
    fireEvent.changeText(search, 'nothing matches this');
    await waitFor(() => expect(screen.getByText(messages.en['use.library.noCues'])).toBeTruthy());
    expect(screen.getByRole('button', { name: messages.en['practice.prepare'] })).toBeEnabled();
    fireEvent.press(within(screen.getByTestId('collection-search')).getByRole('button', { name: messages.en['use.library.clearSearch'] }));
    await waitFor(() => expect(screen.getByText('House to stage')).toBeTruthy());
    expect(screen.getByText('Reveal hit')).toBeTruthy(); expect(mockPrepare).not.toHaveBeenCalled(); expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockSnapshot.shows[0]!.sets[0]!.cueOrder).toEqual(['opening', 'bed']);
  });

  it('resets the local pane after a new native generation without issuing a transport command', async () => {
    const screen = mount(); await prepare(screen);
    fireEvent.press(screen.getByRole('button', { name: messages.en['run.hits'] }));
    expect(screen.getByRole('button', { name: 'Reveal hit' }).props.accessibilityHint).toBe(messages.en['practice.hitsHelp']);
    await publish({ generation: 2 });
    expect(screen.getByRole('button', { name: messages.en['use.editor.playback'] }).props.accessibilityState.selected).toBe(true);
    expect(screen.queryByRole('button', { name: 'Reveal hit' })).toBeNull();
    expect(mockDispatch).not.toHaveBeenCalled(); expect(mockUrgent).not.toHaveBeenCalled();
  });

  it('omits the Hit pane for a playlist with no Hits and keeps preparation silent', async () => {
    const show = mockSnapshot.shows[0]!;
    mockSnapshot = { ...mockSnapshot, shows: [{ ...show, sets: [{ ...show.sets[0]!, hitCueIds: [] }] }] };
    const screen = mount(); await prepare(screen);
    expect(screen.queryByRole('button', { name: messages.en['run.hits'] })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: messages.en['practice.select'] }));
    expect(within(screen.getByTestId('collection-viewport')).getByRole('button', { name: 'Tension bed' })).toBeEnabled();
    expect(mockDispatch).not.toHaveBeenCalled(); expect(screen.UNSAFE_queryAllByType(TextInput)).toHaveLength(0);
  });

  it('distinguishes duplicate song names by spoken position and retains live status on both choice panes', async () => {
    const show = mockSnapshot.shows[0]!, bed = show.cues.bed!;
    mockSnapshot = { ...mockSnapshot, shows: [{ ...show, cues: { ...show.cues, bed: { ...bed, name: 'House to stage' } } }] };
    const screen = mount(); await prepare(screen);
    fireEvent.press(screen.getByRole('button', { name: messages.en['practice.select'] }));
    const choices = within(screen.getByTestId('collection-viewport'));
    expect(choices.getByRole('button', { name: /^01 · House to stage · 0:10.000$/ })).toBeTruthy();
    fireEvent.press(choices.getByRole('button', { name: /^02 · House to stage ·/ }));
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SELECT', cueId: 'bed' })));
    await publish({ activeVoiceCount: 3 });
    expect(screen.getByLabelText(`${messages.en['refine.voices']}: 3 / 8`)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: messages.en['run.hits'] }));
    expect(screen.getByLabelText(`${messages.en['refine.voices']}: 3 / 8`)).toBeTruthy();
    expect(mockDispatch.mock.calls.map(([command]) => command.type)).toEqual(['SELECT']);
  });

  it('switches prepared workspaces without transport commands and keeps silent selection separate from GO', async () => {
    const screen = mount(); await prepare(screen); const revision = app.session.snapshot;
    fireEvent.press(screen.getByRole('button', { name: messages.en['practice.select'] }));
    expect(screen.getByRole('button', { name: messages.en['practice.select'] }).props.accessibilityState.selected).toBe(true);
    const bed = within(screen.getByTestId('collection-viewport')).getByRole('button', { name: 'Tension bed' });
    expect(bed.props.accessibilityState.selected).toBe(false); fireEvent.press(bed);
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SELECT', cueId: 'bed' })));
    expect(bed.props.accessibilityState.selected).toBe(false);
    await publish({ phase: 'ready', selectedCueId: 'bed', nextCueId: '', nextCueIndex: 2 });
    expect(within(screen.getByTestId('collection-viewport')).getByRole('button', { name: 'Tension bed' }).props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: messages.en['run.hits'] }));
    expect(screen.getByRole('button', { name: 'Reveal hit' })).toBeEnabled();
    fireEvent.press(screen.getByRole('button', { name: 'Reveal hit' }));
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'TRIGGER_HIT', cueId: 'reveal' })));
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.playback'] }));
    expect(screen.getByRole('button', { name: messages.en['use.editor.playback'] }).props.accessibilityState.selected).toBe(true);
    expect(app.session.snapshot).toBe(revision); expect(app.session.selectedCueId).toBe('bed');
    expect(mockDispatch.mock.calls.map(([command]) => command.type)).toEqual(['SELECT', 'TRIGGER_HIT']);
    expect(screen.getByRole('button', { name: messages.en['recovery.stop'] })).toBeEnabled(); expect(screen.getByRole('button', { name: messages.en['recovery.fade'] })).toBeEnabled();
    expect(screen.UNSAFE_queryAllByType(TextInput)).toHaveLength(0);
  });

  it('blocks ordinary rehearsal choices after interruption while keeping stop and panic usable on every pane', async () => {
    const screen = mount(); await prepare(screen); await openSeekTools(screen); await publish({ phase: 'interrupted' });
    expect(screen.getByRole('button', { name: messages.en['command.PREVIOUS'] })).toBeDisabled();
    expect(screen.getByRole('button', { name: messages.en['recovery.replay'] })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: messages.en['practice.select'] }));
    expect(within(screen.getByTestId('collection-viewport')).getByRole('button', { name: 'Tension bed' })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: messages.en['run.hits'] }));
    expect(screen.getByRole('button', { name: 'Reveal hit' })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: messages.en['recovery.stop'] })); fireEvent.press(screen.getByRole('button', { name: messages.en['recovery.fade'] }));
    expect(mockDispatch).not.toHaveBeenCalled(); expect(mockUrgent.mock.calls.map(([command]) => command.type)).toEqual(['STOP_ALL', 'PANIC_FADE']);
  });

  it('returns a new prepared session to Playback instead of keeping an old Hit pane', async () => {
    const screen = mount(); await prepare(screen);
    fireEvent.press(screen.getByRole('button', { name: messages.en['run.hits'] }));
    fireEvent.press(screen.getByRole('button', { name: messages.en['practice.exit'] }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/builder'));
    await prepare(screen);
    expect(screen.getByRole('button', { name: messages.en['use.editor.playback'] }).props.accessibilityState.selected).toBe(true);
    expect(screen.queryByRole('button', { name: 'Reveal hit' })).toBeNull(); expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('keeps native voice counts visible for groups while withholding an audio clock and seeking', async () => {
    const show = mockSnapshot.shows[0]!
    mockSnapshot = { ...mockSnapshot, shows: [{ ...show,
      cues: { ...show.cues, parallel: { id: 'parallel', name: 'Parallel sequence', type: 'group', tags: [], children: [{ cueId: 'opening', offsetMs: 0 }] } },
      sets: show.sets.map((set) => ({ ...set, transportMode: 'legacyCueStack', cueOrder: [...set.cueOrder, 'parallel'] })),
    }] }
    const screen = mount(); await prepare(screen)
    await publish({ phase: 'paused', currentCueId: 'parallel', selectedCueId: 'parallel', activeVoiceCount: 3, mainSequenceVoiceCount: 2 })
    expect(screen.getByLabelText(`${messages.en['refine.voices']}: 3 / 8`)).toBeTruthy()
    expect(screen.queryByRole('adjustable', { name: messages.en['editor.waveform'] })).toBeNull()
    expect(screen.queryByLabelText(`${messages.en['run.elapsed']}: 0:00.000`)).toBeNull()
    await publish({ activeVoiceCount: 1, mainSequenceVoiceCount: 0 })
    expect(screen.getByLabelText(`${messages.en['refine.voices']}: 1 / 8`)).toBeTruthy()
    expect(screen.getByRole('button', { name: `${messages.en['run.resume']} · ${messages.en['run.hits']}` })).toBeEnabled()
    expect(mockDispatch).not.toHaveBeenCalled()
  })
  it.each(['rehearsal', 'run'] as const)('pauses a delayed Hit with zero voices and truthfully resumes scheduled work in %s', async (surface) => {
    const screen = mount(); await prepare(screen)
    if (surface === 'run') screen.rerender(appView('run'))
    await publish({ phase: 'ready', currentCueId: '', activeVoiceCount: 0, hasPendingActions: true, mainSequenceVoiceCount: 0 })
    const pause = screen.getByRole('button', { name: messages.en['run.pause'] })
    expect(pause).toBeEnabled(); fireEvent.press(pause)
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'PAUSE' })))
    await publish({ phase: 'paused' })
    const resume = screen.getByRole('button', { name: `${messages.en['run.resume']} · Scheduled actions` })
    expect(resume).toBeEnabled(); fireEvent.press(resume)
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'GO' })))
    expect(mockDispatch.mock.calls.map(([command]) => command.type)).toEqual(['PAUSE', 'GO'])
  })

  it.each(['rehearsal', 'run'] as const)('uses native main ownership for a retained legacy pointer in %s', async (surface) => {
    const show = mockSnapshot.shows[0]!
    mockSnapshot = { ...mockSnapshot, shows: [{ ...show, sets: show.sets.map((set) => ({ ...set, transportMode: 'legacyCueStack' })) }] }
    const screen = mount(); await prepare(screen)
    if (surface === 'run') screen.rerender(appView('run'))
    await publish({ phase: 'paused', currentCueId: 'opening', activeVoiceCount: 1, hasPendingActions: false, mainSequenceVoiceCount: 0 })
    const resume = screen.getByRole('button', { name: `${messages.en['run.resume']} · ${messages.en['run.hits']}` })
    expect(resume).toBeEnabled()
    expect(screen.queryByRole('button', { name: `${messages.en['run.resume']} · House to stage` })).toBeNull()
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('does not mislabel active ordered voices as Hits when the main pointer is retained', async () => {
    const screen = mount(); await prepare(screen)
    await publish({ phase: 'paused', currentCueId: 'opening', activeVoiceCount: 3, mainSequenceVoiceCount: 2, hasPendingActions: false })
    expect(screen.getByRole('button', { name: `${messages.en['run.resume']} · House to stage` })).toBeEnabled()
    expect(screen.queryByRole('button', { name: `${messages.en['run.resume']} · ${messages.en['run.hits']}` })).toBeNull()
  })

  it('never offers seeking without a measured main voice, including after it ends while a Hit remains', async () => {
    const screen = mount(); await prepare(screen); await openSeekTools(screen)
    await publish({ phase: 'playing', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 1 })
    expect(screen.getByRole('adjustable', { name: messages.en['editor.waveform'] })).toBeDisabled()
    await progress(4000)
    expect(screen.getByRole('adjustable', { name: messages.en['editor.waveform'] })).toBeEnabled()
    await act(async () => mockEngineListeners.forEach((listener) => listener({ type: 'VOICE_END', cueId: 'opening', voiceId: 'native-1-opening', mainTransport: true })))
    await publish({ phase: 'paused', activeVoiceCount: 1 })
    expect(app.session.progressPositionMs).toBeNull()
    expect(screen.getByRole('adjustable', { name: messages.en['editor.waveform'] })).toBeDisabled()
    expect(screen.getByRole('button', { name: messages.en['rehearsal.back'] })).toBeDisabled()
    expect(screen.getByRole('button', { name: messages.en['rehearsal.forward'] })).toBeDisabled()
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it.each(['rehearsal', 'run'] as const)('pauses and resumes Hit-only playback through %s without changing the main selection', async (surface) => {
    const screen = mount(); await prepare(screen)
    if (surface === 'run') screen.rerender(appView('run'))
    await publish({ phase: 'ready', currentCueId: '', activeVoiceCount: 1 })
    const pause = screen.getByRole('button', { name: messages.en['run.pause'] })
    expect(pause).toBeEnabled(); fireEvent.press(pause)
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'PAUSE' })))
    expect(app.session.phase).toBe('ready')
    await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 130)) })
    await publish({ phase: 'paused' })
    expect(screen.getByRole('button', { name: `${messages.en['run.resume']} · ${messages.en['run.hits']}` })).toBeEnabled()
    expect(screen.queryByRole('button', { name: `${messages.en['run.resume']} · House to stage` })).toBeNull()
    fireEvent.press(screen.getByLabelText(messages.en['run.resume']))
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'RESUME' })))
    expect(mockDispatch.mock.calls.map(([command]) => command.type)).toEqual(['PAUSE', 'RESUME'])
    expect(app.session.selectedCueId).toBe('opening')
    expect(app.session.currentCueId).toBe('')
    await publish({ phase: 'ready', activeVoiceCount: 0 })
    expect(screen.getByRole('button', { name: messages.en['run.pause'] })).toBeDisabled()
  })

  it.each(['rehearsal', 'run'] as const)('describes a paused incoming countdown without naming the outgoing song in %s', async (surface) => {
    const screen = mount(); await prepare(screen)
    if (surface === 'run') screen.rerender(appView('run'))
    await publish({ phase: 'paused', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 1, countdownRemainingMs: 1800 })
    const countdown = messages.en['use.run.pausedDelay'].replace('{seconds}', '2')
    const resume = screen.getByRole('button', { name: `${messages.en['run.resume']} · ${countdown}` })
    expect(resume).toBeEnabled()
    expect(screen.queryByRole('button', { name: `${messages.en['run.resume']} · House to stage` })).toBeNull()
    fireEvent.press(resume)
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'GO' })))
    expect(mockDispatch.mock.calls).toHaveLength(1)
  })

  it('labels looping clocks as the current pass rather than a promised song ending', async () => {
    const show = mockSnapshot.shows[0]!; const audio = show.cues.opening
    if (audio?.type !== 'audio') throw new Error('Audio fixture is missing')
    mockSnapshot = { ...mockSnapshot, shows: [{ ...show, cues: { ...show.cues, opening: { ...audio, endBehavior: 'loop' } } }] }
    const screen = mount(); await prepare(screen)
    expect(screen.getByLabelText(`${messages.en['run.loopPosition']}: 0:00.000`)).toBeTruthy()
    expect(screen.getByLabelText(`${messages.en['run.loopRemaining']}: 0:10.000`)).toBeTruthy()
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('shows the saved trimmed pass at its rate before GO without inventing native playback', async () => {
    const screen = mount(); await prepare(screen); await openSeekTools(screen)
    expect(screen.getByLabelText(`${messages.en['run.elapsed']}: 0:00.000`)).toBeTruthy()
    expect(screen.getByLabelText(`${messages.en['run.remaining']}: 0:10.000`)).toBeTruthy()
    expect(screen.getByRole('adjustable', { name: messages.en['editor.waveform'] })).toBeDisabled()
    expect(app.session.progressPositionMs).toBeNull()
    expect(mockDispatch).not.toHaveBeenCalled(); expect(mockUrgent).not.toHaveBeenCalled()
  })

  it('keeps outgoing native clocks during an incoming countdown while seeking stays disabled', async () => {
    const screen = mount(); await prepare(screen); await openSeekTools(screen)
    await publish({ phase: 'playing', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 1, playbackRate: 2 })
    await progress(4000)
    await publish({ phase: 'fading', countdownRemainingMs: 2000 })
    await progress(6000)
    expect(screen.getByLabelText(`${messages.en['run.elapsed']}: 0:03.000`)).toBeTruthy()
    expect(screen.getByLabelText(`${messages.en['run.remaining']}: 0:07.000`)).toBeTruthy()
    const waveform = screen.getByRole('adjustable', { name: messages.en['editor.waveform'] })
    expect(waveform.props.accessibilityValue.now).toBe(7); expect(waveform).toBeDisabled()
    expect(mockDispatch).not.toHaveBeenCalled(); expect(mockUrgent).not.toHaveBeenCalled()
  })

  it('prepares a legacy playlist silently, uses its next pointer and marks exhaustion without wrapping', async () => {
    const show = mockSnapshot.shows[0]!
    mockSnapshot = { ...mockSnapshot, shows: [{ ...show, sets: show.sets.map((set) => ({ ...set, transportMode: 'legacyCueStack' })) }] }
    mockPrepare.mockImplementationOnce(async (snapshot, purpose) => {
      mockNativeState = { type: 'RUN_STATE', generation: 1, transportMode: 'legacyCueStack', sessionPurpose: purpose ?? 'performance', showId: snapshot.showId, setId: snapshot.setId, revisionId: snapshot.revisionId,
        phase: 'ready', selectedCueId: 'opening', currentCueId: '', nextCueId: 'opening', currentCueIndex: -1, nextCueIndex: 0, activeVoiceCount: 0, countdownRemainingMs: 0 }
    })
    const screen = mount(); await prepare(screen)
    const go = screen.getByRole('button', { name: `${messages.en['run.go']} · House to stage` })
    expect(go).toBeEnabled(); fireEvent.press(go)
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'GO' })))
    await publish({ phase: 'ready', selectedCueId: 'opening', currentCueId: 'opening', currentCueIndex: 0, nextCueId: 'bed', nextCueIndex: 1 })
    expect(screen.getByRole('button', { name: `${messages.en['run.go']} · Tension bed` })).toBeEnabled()
    await publish({ phase: 'ready', selectedCueId: 'bed', currentCueId: 'bed', currentCueIndex: 1, nextCueId: '', nextCueIndex: 2 })
    expect(screen.getByRole('button', { name: messages.en['common.complete'] })).toBeDisabled()
    expect(screen.getByText(messages.en['refine.restart'])).toBeTruthy()
  })
  it('opens the saved playlist silently and requires an explicit prepare action', async () => {
    const screen = mount()
    await waitFor(() => expect(screen.getByRole('button', { name: messages.en['practice.prepare'] })).toBeEnabled())
    expect(screen.getByText(messages.en['practice.silentPrepare'])).toBeTruthy()
    expect(screen.getByText('House to stage')).toBeTruthy(); expect(screen.getByText('Tension bed')).toBeTruthy()
    expect(mockPrepare).not.toHaveBeenCalled(); expect(mockDispatch).not.toHaveBeenCalled(); expect(mockUrgent).not.toHaveBeenCalled()
  })

  it('stops private audition and prepares visuals before native rehearsal, with editing locked and no automatic GO', async () => {
    const screen = mount(); await prepare(screen)
    expect(mockPrepare).toHaveBeenCalledWith(expect.objectContaining({ cueOrder: ['opening', 'bed'] }), 'rehearsal')
    expect(mockStopPreview.mock.invocationCallOrder[0]).toBeLessThan(mockVisualPrepare.mock.invocationCallOrder[0]!)
    expect(mockVisualPrepare.mock.invocationCallOrder[0]).toBeLessThan(mockPrepare.mock.invocationCallOrder[0]!)
    expect(mockDispatch).not.toHaveBeenCalled(); expect(mockUrgent).not.toHaveBeenCalled()
    expect(isCriticalSessionActive()).toBe(true)
    expect(screen.queryByRole('button', { name: messages.en['nav.builder'] })).toBeNull()
    expect(screen.getByRole('button', { name: `${messages.en['run.go']} · House to stage` })).toBeEnabled()
    const cue = mockSnapshot.shows[0]!.cues.opening
    if (cue?.type !== 'audio') throw new Error('Audio fixture is missing')
    await act(async () => { await expect(app.preview(cue)).rejects.toThrow('editor.previewSafety') })
  })

  it('admits rapid prepare presses once and holds the critical gate throughout native preparation', async () => {
    let finish!: () => void; mockPrepare.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    const screen = mount(); await waitFor(() => expect(screen.getByRole('button', { name: messages.en['practice.prepare'] })).toBeEnabled())
    const button = screen.getByRole('button', { name: messages.en['practice.prepare'] })
    fireEvent.press(button); fireEvent.press(button)
    await waitFor(() => expect(mockPrepare).toHaveBeenCalledTimes(1))
    expect(isCriticalSessionActive()).toBe(true); expect(mockDispatch).not.toHaveBeenCalled()
    await act(async () => {
      const snapshot = mockPrepare.mock.calls[0]![0]
      mockNativeState = { ...mockNativeState, transportMode: 'oms', sessionPurpose: 'rehearsal', showId: snapshot.showId, setId: snapshot.setId,
        revisionId: snapshot.revisionId, phase: 'ready', selectedCueId: 'opening', nextCueId: 'bed' }
      finish()
    })
    await waitFor(() => expect(app.session.phase).toBe('ready'))
    expect(mockPrepare).toHaveBeenCalledTimes(1); expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('uses native cue-relative progress for source-time seeking and clamps both ten-second controls', async () => {
    const screen = mount(); await prepare(screen); await openSeekTools(screen)
    expect(screen.getByRole('button', { name: messages.en['rehearsal.back'] })).toBeDisabled()
    await publish({ phase: 'playing', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 1, playbackRate: 2 })
    await progress(12500)
    expect(screen.getByRole('adjustable', { name: messages.en['editor.waveform'] }).props.accessibilityValue.now).toBe(13.5)
    await progress(19000, false)
    expect(screen.getByRole('adjustable', { name: messages.en['editor.waveform'] }).props.accessibilityValue.now).toBe(13.5)
    fireEvent.press(screen.getByRole('button', { name: messages.en['rehearsal.back'] }))
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SEEK_REHEARSAL', cueId: 'opening', positionMs: 3500 })))
    fireEvent.press(screen.getByRole('button', { name: messages.en['rehearsal.forward'] }))
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SEEK_REHEARSAL', cueId: 'opening', positionMs: 20999 })))
    await progress(2000)
    fireEvent.press(screen.getByRole('button', { name: messages.en['rehearsal.back'] }))
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SEEK_REHEARSAL', cueId: 'opening', positionMs: 1000 })))
    expect(mockDispatch.mock.calls.every(([command]) => command.type === 'SEEK_REHEARSAL')).toBe(true)
  })

  it('selects another song silently and plays it only after a separate GO', async () => {
    const screen = mount(); await prepare(screen)
    fireEvent.press(screen.getByRole('button', { name: messages.en['practice.select'] }))
    fireEvent.press(screen.getByRole('button', { name: 'Tension bed' }))
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SELECT', cueId: 'bed' })))
    expect(mockDispatch.mock.calls.map(([command]) => command.type)).toEqual(['SELECT'])
    await publish({ generation: 2, selectedCueId: 'bed', currentCueId: '', nextCueId: '', currentCueIndex: -1, nextCueIndex: 2, phase: 'ready' })
    fireEvent.press(screen.getByRole('button', { name: `${messages.en['run.go']} · Tension bed` }))
    await waitFor(() => expect(mockDispatch.mock.calls.at(-1)![0].type).toBe('GO'))
  })

  it('returns the stopped selection readout to trim start without reusing the previous audible position', async () => {
    const screen = mount(); await prepare(screen); await openSeekTools(screen)
    await publish({ phase: 'playing', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 1 })
    await progress(12500)
    expect(screen.getByRole('adjustable', { name: messages.en['editor.waveform'] }).props.accessibilityValue.now).toBe(13.5)
    fireEvent.press(screen.getByRole('button', { name: messages.en['recovery.stop'] }))
    expect(mockUrgent).toHaveBeenCalledWith(expect.objectContaining({ type: 'STOP_ALL' }))
    await publish({ generation: 2, phase: 'ready', currentCueId: '', currentCueIndex: -1, selectedCueId: 'opening', activeVoiceCount: 0 })
    expect(screen.getByRole('button', { name: messages.en['practice.seekTools'] }).props.accessibilityState.expanded).toBe(false)
    await openSeekTools(screen)
    const waveform = screen.getByRole('adjustable', { name: messages.en['editor.waveform'] })
    expect(waveform.props.accessibilityValue.now).toBe(1)
    expect(waveform).toBeDisabled(); expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('keeps seeking disabled during a silent pre-play countdown while allowing pause and safety controls', async () => {
    const screen = mount(); await prepare(screen); await openSeekTools(screen)
    await publish({ phase: 'fading', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 0, countdownRemainingMs: 1800 })
    expect(screen.getByRole('adjustable', { name: messages.en['editor.waveform'] })).toBeDisabled()
    expect(screen.getByRole('button', { name: messages.en['rehearsal.back'] })).toBeDisabled()
    expect(screen.getByRole('button', { name: messages.en['rehearsal.forward'] })).toBeDisabled()
    expect(screen.getByRole('button', { name: messages.en['run.countdown'].replace('{seconds}', '2') })).toBeDisabled()
    const pause = screen.getByRole('button', { name: messages.en['run.pause'] })
    expect(pause).toBeEnabled(); fireEvent.press(pause)
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'PAUSE' })))
    expect(mockDispatch.mock.calls.every(([command]) => command.type !== 'SEEK_REHEARSAL')).toBe(true)
  })

  it('labels paused countdown GO as Resume with remaining time and restores countdown only after native resume', async () => {
    const screen = mount(); await prepare(screen)
    await publish({ phase: 'paused', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 0, countdownRemainingMs: 1800 })
    const resume = screen.getByRole('button', { name: `${messages.en['run.resume']} · ${messages.en['use.run.pausedDelay'].replace('{seconds}', '2')}` })
    expect(resume).toBeEnabled(); fireEvent.press(resume)
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'GO' })))
    expect(screen.queryByRole('button', { name: messages.en['run.countdown'].replace('{seconds}', '2') })).toBeNull()
    expect(screen.getByRole('button', { name: messages.en['recovery.fade'] })).toBeEnabled()
    await publish({ phase: 'fading' })
    expect(screen.getByRole('button', { name: messages.en['run.countdown'].replace('{seconds}', '2') })).toBeDisabled()
    expect(screen.getByRole('button', { name: messages.en['recovery.fade'] })).toBeEnabled()
  })

  it('routes footer pause, resume, previous and independent Hits to semantic native commands', async () => {
    const screen = mount(); await prepare(screen)
    await publish({ phase: 'playing', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 1 })
    fireEvent.press(screen.getByRole('button', { name: messages.en['run.pause'] }))
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'PAUSE' })))
    // A deliberate second press follows the shared 120 ms input bounce window.
    await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 130)) })
    await publish({ phase: 'paused' })
    fireEvent.press(screen.getByLabelText(messages.en['run.resume']))
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'RESUME' })))
    fireEvent.press(screen.getByRole('button', { name: messages.en['command.PREVIOUS'] }))
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'PREVIOUS' })))
    await publish({ generation: 2, phase: 'ready', currentCueId: '', currentCueIndex: -1, activeVoiceCount: 0 })
    fireEvent.press(screen.getByRole('button', { name: messages.en['run.hits'] }))
    fireEvent.press(screen.getByRole('button', { name: 'Reveal hit' }))
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'TRIGGER_HIT', cueId: 'reveal' })))
    expect(mockDispatch.mock.calls.map(([command]) => command.type)).toEqual(['PAUSE', 'RESUME', 'PREVIOUS', 'TRIGGER_HIT'])
  })

  it.each(['TRANSITION_REFUSED', 'CAPACITY_REFUSAL'] as const)('explains %s without requiring recovery or disabling deliberate retry', async (type) => {
    const screen = mount(); await prepare(screen)
    await publish({ phase: 'playing', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 1 })
    await act(async () => mockEngineListeners.forEach((listener) => listener(type === 'TRANSITION_REFUSED'
      ? { type, code: 'DECODE_FAILED', message: 'Incoming audio failed preparation', generation: 1 }
      : { type, cueId: 'bed', activeVoices: 1, limit: 8 })))
    expect(screen.getByText(messages.en[type === 'TRANSITION_REFUSED' ? 'practice.transitionRefused' : 'run.capacityWarning'])).toBeTruthy()
    expect(screen.queryByText(messages.en['practice.recover'])).toBeNull()
    expect(screen.queryByText(messages.en['run.playbackWarning'])).toBeNull()
    expect(app.session.phase).toBe('running')
    expect(screen.getByRole('button', { name: `${messages.en['run.next']} · Tension bed` })).toBeEnabled()
    expect(screen.getByRole('button', { name: messages.en['recovery.stop'] })).toBeEnabled()
    await act(async () => mockEngineListeners.forEach((listener) => listener({ type: 'INTERRUPTION', reason: 'audio_focus' })))
    expect(screen.getByText(messages.en['practice.recover'])).toBeTruthy()
    expect(screen.queryByText(messages.en['run.playbackWarning'])).toBeNull()
  })

  it('retains fixed, usable stop and panic outside scrolling content when preparation fails', async () => {
    mockPrepare.mockRejectedValueOnce(new Error('Local decode failed'))
    const screen = mount(); await waitFor(() => expect(screen.getByRole('button', { name: messages.en['practice.prepare'] })).toBeEnabled())
    fireEvent.press(screen.getByRole('button', { name: messages.en['practice.prepare'] }))
    await waitFor(() => expect(app.session.phase).toBe('fault'))
    expect(screen.getByText(messages.en['practice.recover'])).toBeTruthy()
    expect(screen.getByRole('button', { name: `${messages.en['run.go']} · House to stage` })).toBeDisabled()
    const scroll = screen.UNSAFE_getByType(ScrollView)
    for (const key of ['recovery.stop', 'recovery.fade'] as const) {
      const button = screen.getByRole('button', { name: messages.en[key] })
      expect(button).toBeEnabled()
      expect(scroll.findAllByProps({ accessibilityLabel: messages.en[key] })).toHaveLength(0)
      fireEvent.press(button)
    }
    expect(mockUrgent.mock.calls.map(([command]) => command.type)).toEqual(['STOP_ALL', 'PANIC_FADE'])
    expect(mockDispatch).not.toHaveBeenCalled(); expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  it('keeps safety controls reachable through a live interruption while disabling GO', async () => {
    const screen = mount(); await prepare(screen)
    await act(async () => mockEngineListeners.forEach((listener) => listener({ type: 'INTERRUPTION', reason: 'audio_focus' })))
    expect(screen.getByText(messages.en['practice.recover'])).toBeTruthy()
    expect(screen.queryByText(messages.en['run.playbackWarning'])).toBeNull()
    expect(screen.getByRole('button', { name: `${messages.en['run.go']} · Tension bed` })).toBeDisabled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['recovery.fade'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['recovery.stop'] }))
    expect(mockUrgent.mock.calls.map(([command]) => command.type)).toEqual(['PANIC_FADE', 'STOP_ALL'])
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('does not navigate or unlock after a failed silent exit, and allows a deliberate retry', async () => {
    const screen = mount(); await prepare(screen)
    let fail!: (reason: Error) => void; mockShutdown.mockReturnValueOnce(new Promise<void>((_resolve, reject) => { fail = reject }))
    const exit = screen.getByRole('button', { name: messages.en['practice.exit'] })
    fireEvent.press(exit); fireEvent.press(exit)
    await waitFor(() => expect(mockShutdown).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: messages.en['practice.exit'] })).toBeDisabled()
    await act(async () => fail(new Error('Native shutdown was not confirmed')))
    await waitFor(() => expect(app.session.phase).toBe('fault'))
    expect(mockRouter.replace).not.toHaveBeenCalled(); expect(isCriticalSessionActive()).toBe(true)
    expect(screen.getByRole('button', { name: messages.en['recovery.stop'] })).toBeEnabled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['practice.exit'] }))
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/builder'))
    expect(mockShutdown).toHaveBeenCalledTimes(2); expect(isCriticalSessionActive()).toBe(false)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('retries a failed waveform without dispatching playback or editing the prepared revision', async () => {
    mockWaveform.mockRejectedValueOnce(new Error('Waveform unavailable'))
    const screen = mount(); await prepare(screen); await openSeekTools(screen)
    await waitFor(() => expect(screen.getByRole('button', { name: messages.en['common.retry'] })).toBeEnabled())
    expect(screen.getByText(messages.en['studio.waveformError'])).toBeTruthy()
    expect(screen.getByRole('adjustable', { name: messages.en['editor.waveform'] })).toBeDisabled()
    const revision = app.session.snapshot
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] }))
    await waitFor(() => expect(mockWaveform).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('button', { name: messages.en['common.retry'] })).toBeNull())
    expect(app.session.snapshot).toBe(revision); expect(mockDispatch).not.toHaveBeenCalled(); expect(mockPrepare).toHaveBeenCalledTimes(1)
  })
  it('shows native completion without implying the first song will restart, then allows silent selection', async () => {
    const screen = mount(); await prepare(screen)
    await publish({ phase: 'stopped', currentCueId: '', selectedCueId: '', nextCueId: '', currentCueIndex: -1, nextCueIndex: 2, activeVoiceCount: 0 })
    expect(screen.getByRole('button', { name: messages.en['common.complete'] })).toBeDisabled()
    expect(screen.getByText(messages.en['refine.restart'])).toBeTruthy()
    expect(screen.queryByRole('adjustable', { name: messages.en['editor.waveform'] })).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: messages.en['practice.select'] }))
    fireEvent.press(screen.getByRole('button', { name: 'Tension bed' }))
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SELECT', cueId: 'bed' })))
    expect(mockDispatch.mock.calls.some(([command]) => command.type === 'GO')).toBe(false)
    await publish({ phase: 'ready', selectedCueId: 'bed' })
    expect(screen.getByRole('button', { name: messages.en['run.go'] + ' · Tension bed' })).toBeEnabled()
  })
  it('locks ordinary commands during a pending exit while preserving both emergency controls', async () => {
    const screen = mount(); await prepare(screen)
    let finish!: () => void; mockShutdown.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['practice.exit'] }))
    expect(screen.getByRole('button', { name: messages.en['run.go'] + ' · House to stage' })).toBeDisabled()
    expect(screen.getByRole('button', { name: messages.en['command.PREVIOUS'] })).toBeDisabled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['recovery.stop'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['recovery.fade'] }))
    expect(mockUrgent.mock.calls.map(([command]) => command.type)).toEqual(['STOP_ALL', 'PANIC_FADE'])
    expect(mockDispatch).not.toHaveBeenCalled()
    await act(async () => finish()); await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/builder'))
  })
})
