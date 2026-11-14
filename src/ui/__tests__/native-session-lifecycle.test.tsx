import { act, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { EngineEvent, PreparedNativeSession } from '../../audio';
import { compileRunSnapshot, sampleControllerProfiles, sampleShow } from '../../domain';
import { I18nProvider } from '../../i18n';
import { DEFAULT_LIBRARY_SETTINGS } from '../../library/types';
import { isCriticalSessionActive, setCriticalSessionActive } from '../../runtime';
import { AppProvider, useApp } from '../AppProvider';
import { useCriticalScreenAwake } from '../use-critical-screen-awake';

const mockRead = jest.fn(); const mockPrepare = jest.fn().mockResolvedValue(undefined); const mockDispatch = jest.fn().mockResolvedValue(undefined); const mockShutdown = jest.fn().mockResolvedValue(undefined);
const mockAudioListeners = new Set<(event: EngineEvent) => void>();
const mockControllerStop = jest.fn().mockResolvedValue(undefined); const mockDisarm = jest.fn().mockResolvedValue(undefined); const mockPreviewStop = jest.fn().mockResolvedValue(undefined);
const mockControllerStart = jest.fn().mockResolvedValue(undefined);
const mockLibrarySnapshot = { status: 'ready', saving: false, shows: [sampleShow], selectedShowId: sampleShow.id, selectedSetId: 'set-main', controllerProfiles: sampleControllerProfiles, settings: DEFAULT_LIBRARY_SETTINGS };
let mockNativeState: PreparedNativeSession['state'] | undefined;
const mockActivate = jest.fn().mockResolvedValue(undefined); const mockDeactivate = jest.fn().mockResolvedValue(undefined);
const mockStates = new Set<(state: AppStateStatus) => void>();
const mockEngine = { prepare: mockPrepare, dispatch: mockDispatch, shutdown: mockShutdown, getPreparedSession: () => mockRead(), getState: async () => mockNativeState ?? prepared().state,
  subscribe: (listener: (event: EngineEvent) => void) => { mockAudioListeners.add(listener); return { remove: () => { mockAudioListeners.delete(listener); } }; } };
jest.mock('../../audio', () => ({ ...jest.requireActual('../../audio'), resolveNativeAudioEngine: () => ({ available: true, engine: mockEngine }) }));
jest.mock('../../library', () => ({ createLibraryStore: () => ({ getSnapshot: () => mockLibrarySnapshot, subscribe: () => () => undefined, initialize: async () => undefined, clearError: jest.fn() }) }));
jest.mock('../../../modules/show-audio', () => ({ __esModule: true, default: { availability: () => ({ available: true }), addListener: () => ({ remove: () => undefined }), stopPreview: () => mockPreviewStop() } }));
jest.mock('../../../modules/show-controller', () => ({ __esModule: true, default: { isAvailable: () => true, stop: () => mockControllerStop(), addInputListener: () => ({ remove: () => undefined }), addHealthListener: () => ({ remove: () => undefined }), addScanListener: () => ({ remove: () => undefined }), configure: async () => undefined, configureProfile: async () => undefined, start: () => mockControllerStart(), health: async () => ({}) } }));
jest.mock('../../../modules/show-voice', () => ({ VoiceNative: { getStatus: async () => ({ available: true, armed: true }), subscribe: () => ({ remove: () => undefined }), disarm: () => mockDisarm() } }));
jest.mock('../../../modules/show-visual', () => ({ __esModule: true, default: { configure: async () => undefined } }));
jest.mock('../../music/downloads', () => ({ MusicDownloads: { recover: async () => undefined } }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: (tag: string) => mockActivate(tag), deactivateKeepAwake: (tag: string) => mockDeactivate(tag) }));

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function prepared(purpose: 'performance' | 'rehearsal' = 'performance'): PreparedNativeSession {
  const compiled = compileRunSnapshot({ ...sampleShow, schemaVersion: 2, sets: sampleShow.sets.map((set) => ({ ...set, transportMode: 'oms' })) }, 'set-main', sampleControllerProfiles);
  if (!compiled.ok) throw new Error('Fixture');
  return { snapshotJson: JSON.stringify({ ...compiled.snapshot, sessionPurpose: purpose }), commandIdWatermark: 10, state: { type: 'RUN_STATE', showId: sampleShow.id, setId: 'set-main', revisionId: sampleShow.revisionId, generation: 4, sessionPurpose: purpose, phase: 'playing', transportMode: 'oms', selectedCueId: 'opening', currentCueId: 'opening', nextCueId: 'crossfade', currentCueIndex: 0, nextCueIndex: 1, activeVoiceCount: 1, countdownRemainingMs: 0 } };
}
let app: ReturnType<typeof useApp>;
function Probe() { const value = useApp(); useEffect(() => { app = value; }, [value]); return null; }
function Awake({ enabled }: { enabled: boolean }) { useCriticalScreenAwake(enabled); return null; }
function mount() { return render(<I18nProvider><AppProvider><Probe /></AppProvider></I18nProvider>); }
function lifecycle(state: AppStateStatus) { mockStates.forEach((listener) => listener(state)); }
beforeEach(() => {
  jest.clearAllMocks(); mockRead.mockReset().mockResolvedValue(null); mockShutdown.mockReset().mockResolvedValue(undefined); mockPrepare.mockReset().mockResolvedValue(undefined);
  mockActivate.mockReset().mockResolvedValue(undefined); mockDeactivate.mockReset().mockResolvedValue(undefined); mockControllerStart.mockReset().mockResolvedValue(undefined); mockStates.clear(); mockAudioListeners.clear(); mockNativeState = undefined; setCriticalSessionActive(false);
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => { mockStates.add(listener); return { remove: () => { mockStates.delete(listener); } }; });
});
afterEach(() => { jest.restoreAllMocks(); setCriticalSessionActive(false); });

describe('native owner survives an interface remount', () => {
  it('blocks edits, preview and preparation while startup inspection is pending; null reopens idle silently', async () => {
    const reading = deferred<PreparedNativeSession | null>(); mockRead.mockReturnValueOnce(reading.promise); const screen = mount();
    expect(app.busy).toBe(true); expect(app.liveSession).toBe(true); expect(isCriticalSessionActive()).toBe(true);
    await act(async () => { expect(await app.beginRehearsal()).toBe(false); await expect(app.previewLibrarySong('show-demo', 'opening')).rejects.toThrow('editor.previewSafety'); });
    expect(mockPrepare).not.toHaveBeenCalled(); expect(mockDispatch).not.toHaveBeenCalled();
    await act(async () => { reading.resolve(null); }); expect(app.liveSession).toBe(false); expect(app.busy).toBe(false); expect(isCriticalSessionActive()).toBe(false);
    screen.unmount(); expect(mockShutdown).toHaveBeenCalledTimes(1); expect(mockControllerStop).toHaveBeenCalledTimes(1); expect(mockDisarm).toHaveBeenCalledTimes(1); expect(mockPreviewStop).toHaveBeenCalledTimes(1);
  });
  it.each(['performance', 'rehearsal'] as const)('preserves native audio/controller/voice owners when a %s interface unmounts', async (purpose) => {
    mockNativeState = prepared(purpose).state; mockRead.mockResolvedValue(prepared(purpose)); const first = mount(); await act(async () => undefined);
    expect(app.session.phase).toBe('running'); expect(app.session.sessionPurpose).toBe(purpose);
    first.unmount(); expect(isCriticalSessionActive()).toBe(true); expect(mockShutdown).not.toHaveBeenCalled(); expect(mockControllerStop).not.toHaveBeenCalled(); expect(mockDisarm).not.toHaveBeenCalled(); expect(mockPreviewStop).not.toHaveBeenCalled(); expect(mockAudioListeners.size).toBe(0);
    const replacement = mount(); await act(async () => undefined); expect(app.session.phase).toBe('running'); expect(mockRead).toHaveBeenCalledTimes(2); expect(mockPrepare).not.toHaveBeenCalled(); expect(mockDispatch).not.toHaveBeenCalled();
    await act(async () => { lifecycle('background'); lifecycle('active'); }); expect(mockDispatch).not.toHaveBeenCalled(); replacement.unmount();
  });
  it('does not let a destroyed interface adopt late or stop the surviving native owner', async () => {
    const reading = deferred<PreparedNativeSession | null>(); mockRead.mockReturnValueOnce(reading.promise); const screen = mount(); screen.unmount();
    await act(async () => { reading.resolve(prepared()); });
    expect(mockShutdown).not.toHaveBeenCalled(); expect(mockDisarm).not.toHaveBeenCalled(); expect(mockControllerStop).not.toHaveBeenCalled(); expect(isCriticalSessionActive()).toBe(true);
  });
  it('keeps unknown native audio blocked until deliberate exit confirms silence', async () => {
    mockRead.mockRejectedValue(new Error('Atomic read failed')); mockShutdown.mockRejectedValueOnce(new Error('Shutdown unavailable'));
    mount(); await act(async () => undefined); expect(app.liveSession).toBe(true); expect(app.session.phase).toBe('fault'); expect(app.busy).toBe(true); expect(isCriticalSessionActive()).toBe(true);
    await act(async () => { expect(await app.exitShow()).toBe(true); }); expect(app.liveSession).toBe(false); expect(isCriticalSessionActive()).toBe(false);
  });
  it('does not shut down a native preparation that finishes after the interface detaches', async () => {
    const screen = mount(); await act(async () => undefined); const preparing = deferred<void>(); mockPrepare.mockReturnValueOnce(preparing.promise);
    let result!: Promise<boolean>; act(() => { result = app.beginRehearsal(); }); await act(async () => undefined); expect(mockPrepare).toHaveBeenCalledTimes(1);
    screen.unmount(); await act(async () => { preparing.resolve(); expect(await result).toBe(false); });
    expect(mockShutdown).not.toHaveBeenCalled(); expect(mockControllerStop).toHaveBeenCalledTimes(1); expect(mockDisarm).not.toHaveBeenCalled(); expect(isCriticalSessionActive()).toBe(true);
  });
  it('preserves a prepared native show when controller startup finishes after the interface detaches', async () => {
    const screen = mount(); await act(async () => undefined); const starting = deferred<void>(); mockControllerStart.mockReturnValueOnce(starting.promise);
    let result!: Promise<boolean>; act(() => { result = app.beginRehearsal(); }); await act(async () => undefined); expect(mockControllerStart).toHaveBeenCalledTimes(1);
    screen.unmount(); await act(async () => { starting.resolve(); expect(await result).toBe(false); });
    expect(mockShutdown).not.toHaveBeenCalled(); expect(mockDisarm).not.toHaveBeenCalled(); expect(isCriticalSessionActive()).toBe(true);
  });
});

describe('visible critical screen wake ownership', () => {
  it('releases on background, exit and unmount, and acquires a fresh tag on return', async () => {
    const screen = render(<Awake enabled={false} />); expect(mockActivate).not.toHaveBeenCalled();
    screen.rerender(<Awake enabled />); await act(async () => undefined); const first = mockActivate.mock.calls[0]![0];
    await act(async () => { lifecycle('background'); }); expect(mockDeactivate).toHaveBeenCalledWith(first);
    await act(async () => { lifecycle('active'); }); const second = mockActivate.mock.calls[1]![0]; expect(second).not.toBe(first);
    screen.rerender(<Awake enabled={false} />); expect(mockDeactivate).toHaveBeenCalledWith(second);
    screen.rerender(<Awake enabled />); screen.unmount(); expect(mockDeactivate).toHaveBeenCalledWith(mockActivate.mock.calls[2]![0]);
  });
  it('cleans a late old activation without releasing the newer foreground tag', async () => {
    const firstActivation = deferred<void>(); mockActivate.mockReturnValueOnce(firstActivation.promise); const screen = render(<Awake enabled />);
    const oldTag = mockActivate.mock.calls[0]![0]; await act(async () => { lifecycle('background'); }); await act(async () => { lifecycle('active'); });
    const newTag = mockActivate.mock.calls[1]![0]; mockDeactivate.mockClear();
    await act(async () => { firstActivation.resolve(); }); expect(mockDeactivate).toHaveBeenCalledWith(oldTag); expect(mockDeactivate).not.toHaveBeenCalledWith(newTag); screen.unmount();
  });
});
