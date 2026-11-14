import type { AudioEngine, EngineCommand, EngineEvent, NativeRunState, PreparedNativeSession, SessionPurpose } from '../../src/audio';
import { SerializedCommandRouter } from '../../src/audio';
import { compileRunSnapshot, sampleControllerProfiles, sampleShow, type RunSnapshot } from '../../src/domain';
import { isCriticalShowSession, ShowSession } from '../../src/runtime';

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const show = { ...sampleShow, schemaVersion: 2 as const, sets: sampleShow.sets.map((set) => ({ ...set, transportMode: 'oms' as const })) };
function snapshot(): RunSnapshot { const compiled = compileRunSnapshot(show, 'set-main', sampleControllerProfiles); if (!compiled.ok) throw new Error('Fixture'); return compiled.snapshot; }
function envelope(purpose: SessionPurpose = 'performance'): { snapshotJson: string; state: NativeRunState; commandIdWatermark: number } {
  const run = snapshot();
  return { snapshotJson: JSON.stringify({ ...run, sessionPurpose: purpose }), commandIdWatermark: 55, state: {
    type: 'RUN_STATE', showId: run.showId, setId: run.setId, revisionId: run.revisionId, sessionPurpose: purpose,
    generation: 9, transportMode: 'oms', phase: 'playing', selectedCueId: 'opening', currentCueId: 'opening', nextCueId: 'crossfade', currentCueIndex: 0, nextCueIndex: 1,
    activeVoiceCount: 1, countdownRemainingMs: 0, playbackRate: 1,
  } };
}
class ExistingEngine implements AudioEngine {
  existing: PreparedNativeSession | null = envelope();
  listeners = new Set<(event: EngineEvent) => void>();
  prepare = jest.fn<Promise<void>, [RunSnapshot, SessionPurpose?]>().mockResolvedValue(undefined);
  shutdown = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  dispatch = jest.fn<Promise<void>, [EngineCommand]>().mockImplementation(async (command) => { if (this.existing) this.existing = { ...this.existing, commandIdWatermark: command.id }; });
  getPreparedSession = jest.fn<Promise<PreparedNativeSession | null>, []>().mockImplementation(async () => this.existing);
  getState = jest.fn<Promise<NativeRunState>, []>().mockImplementation(async () => this.existing!.state);
  subscribe(listener: (event: EngineEvent) => void) { this.listeners.add(listener); return { remove: () => { this.listeners.delete(listener); } }; }
  emit(event: EngineEvent) { this.listeners.forEach((listener) => listener(event)); }
}

describe('same-process native session reattachment', () => {
  it('adopts delayed native work without replay, and pause uses a fresh command above the watermark', async () => {
    const engine = new ExistingEngine(); const value = envelope()
    value.state = { ...value.state, phase: 'ready', currentCueId: '', activeVoiceCount: 0, hasPendingActions: true, mainSequenceVoiceCount: 0 }
    engine.existing = value; const session = new ShowSession({ engine })
    expect(await session.attachPreparedSession()).toBe(true)
    expect(session.getState()).toMatchObject({ hasPendingActions: true, mainSequenceVoiceCount: 0, activeVoiceCount: 0 })
    expect(engine.dispatch).not.toHaveBeenCalled()
    expect(session.pauseResume()).toBe(56)
    expect(engine.dispatch).toHaveBeenLastCalledWith({ id: 56, type: 'PAUSE' })
    expect(engine.prepare).not.toHaveBeenCalled()
  })

  it.each([{ hasPendingActions: 1 }, { hasPendingActions: null }, { mainSequenceVoiceCount: -1 }, { mainSequenceVoiceCount: 2 }, { mainSequenceVoiceCount: 0.5 }])('rejects invalid adopted native observations %j silently', async (observation) => {
    const engine = new ExistingEngine(); const value = envelope()
    value.state = { ...value.state, ...observation } as NativeRunState
    engine.existing = value; const session = new ShowSession({ engine })
    expect(await session.attachPreparedSession()).toBe(false)
    expect(engine.shutdown).toHaveBeenCalledTimes(1)
    expect(engine.dispatch).not.toHaveBeenCalled()
  })

  it.each(['performance', 'rehearsal'] as const)('adopts the exact immutable %s without preparing, replaying or changing the library', async (purpose) => {
    const engine = new ExistingEngine(); engine.existing = envelope(purpose); const session = new ShowSession({ engine });
    engine.existing = { ...engine.existing, snapshotJson: JSON.stringify({ ...JSON.parse(engine.existing.snapshotJson), presentationLocale: 'he' }) };
    expect(isCriticalShowSession(session.getState())).toBe(true); expect(session.go()).toBeNull();
    expect((await session.prepareShow(show, 'set-main', sampleControllerProfiles)).ok).toBe(false);
    expect(await session.attachPreparedSession()).toBe(true);
    expect(session.getState()).toMatchObject({ nativeSessionPending: false, phase: 'running', sessionPurpose: purpose, nativeGeneration: 9, currentCueId: 'opening', activeVoiceCount: 1, snapshot: { showId: show.id, revisionId: show.revisionId } });
    expect(Object.isFrozen(session.getState().snapshot?.cues)).toBe(true);
    expect(session.getState().snapshot).not.toHaveProperty('presentationLocale');
    expect(engine.prepare).not.toHaveBeenCalled(); expect(engine.shutdown).not.toHaveBeenCalled(); expect(engine.dispatch).not.toHaveBeenCalled();
    expect(session.go()).toBe(56); expect(engine.dispatch).toHaveBeenLastCalledWith({ id: 56, type: 'GO' });
  });
  it('detaches queued and late bridge work while native playback continues; a replacement uses the watermark', async () => {
    const engine = new ExistingEngine(); const old = new ShowSession({ engine }); await old.attachPreparedSession();
    const pending = deferred<void>(); engine.dispatch.mockImplementationOnce(async () => pending.promise);
    old.triggerHit('reveal'); old.replay(); old.schedule({ type: 'GO' }, 1000); old.detach();
    expect(engine.shutdown).not.toHaveBeenCalled(); expect(engine.listeners.size).toBe(0);
    engine.emit({ type: 'INTERRUPTION', reason: 'Detached UI cannot reconcile' }); pending.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(engine.dispatch).toHaveBeenCalledTimes(1); expect(old.getState().phase).toBe('running'); expect(old.go()).toBeNull();
    engine.existing = { ...envelope(), commandIdWatermark: 56 };
    const replacement = new ShowSession({ engine }); await replacement.attachPreparedSession();
    expect(replacement.replay()).toBe(57); expect(engine.prepare).not.toHaveBeenCalled(); expect(engine.shutdown).not.toHaveBeenCalled();
  });
  it('starts idle and silent after a dead process returns no prepared native owner', async () => {
    const engine = new ExistingEngine(); engine.existing = null; const session = new ShowSession({ engine });
    expect(await session.attachPreparedSession()).toBe(false);
    expect(session.getState()).toMatchObject({ phase: 'idle', snapshot: null, nativeSessionPending: false });
    expect(isCriticalShowSession(session.getState())).toBe(false); expect(session.go()).toBeNull();
    expect(engine.prepare).not.toHaveBeenCalled(); expect(engine.dispatch).not.toHaveBeenCalled(); expect(engine.shutdown).not.toHaveBeenCalled();
  });
  it.each(['malformed', 'oversized', 'identity', 'purpose', 'watermark', 'cue'] as const)('fails silent on invalid %s instead of adopting or replaying it', async (invalid) => {
    const engine = new ExistingEngine(); const value = envelope();
    if (invalid === 'malformed') value.snapshotJson = '{';
    if (invalid === 'oversized') value.snapshotJson = ' '.repeat(8 * 1024 * 1024 + 1);
    if (invalid === 'identity') value.state = { ...value.state, revisionId: 'wrong' };
    if (invalid === 'purpose') value.state = { ...value.state, sessionPurpose: 'rehearsal' };
    if (invalid === 'watermark') value.commandIdWatermark = -1;
    if (invalid === 'cue') { const raw = JSON.parse(value.snapshotJson); raw.cues.opening.fadeCurve = 'unsafe'; value.snapshotJson = JSON.stringify(raw); }
    engine.existing = value; const session = new ShowSession({ engine });
    expect(await session.attachPreparedSession()).toBe(false);
    expect(engine.shutdown).toHaveBeenCalledTimes(1); expect(engine.prepare).not.toHaveBeenCalled(); expect(engine.dispatch).not.toHaveBeenCalled();
    expect(session.getState()).toMatchObject({ phase: 'fault', nativeSessionPending: false, snapshot: null });
  });
  it('keeps the global critical predicate closed if invalid adoption cannot confirm silence', async () => {
    const engine = new ExistingEngine(); engine.getPreparedSession.mockRejectedValue(new Error('Native read failed')); engine.shutdown.mockRejectedValueOnce(new Error('Native shutdown failed'));
    const session = new ShowSession({ engine }); await session.attachPreparedSession();
    expect(session.getState()).toMatchObject({ phase: 'fault', nativeSessionPending: true, snapshot: null }); expect(isCriticalShowSession(session.getState())).toBe(true);
    expect((await session.prepareShow(show, 'set-main', sampleControllerProfiles)).ok).toBe(false);
    expect(await session.exitRun()).toBe(true); expect(isCriticalShowSession(session.getState())).toBe(false);
  });
  it.each(['panic', 'stopAll'] as const)('honors explicit %s before inspection finishes and ignores its late result', async (action) => {
    const engine = new ExistingEngine(); const reading = deferred<PreparedNativeSession | null>(); engine.getPreparedSession.mockReturnValueOnce(reading.promise);
    const session = new ShowSession({ engine }); const attaching = session.attachPreparedSession(); session[action](); await Promise.resolve();
    reading.resolve(envelope()); expect(await attaching).toBe(false);
    expect(engine.shutdown).toHaveBeenCalledTimes(1); expect(engine.dispatch).not.toHaveBeenCalled(); expect(session.getState()).toMatchObject({ phase: 'idle', snapshot: null });
  });
  it('applies an interruption observed after the atomic read without clearing it with stale queued state', async () => {
    const engine = new ExistingEngine(); const reading = deferred<PreparedNativeSession | null>(); engine.getPreparedSession.mockReturnValueOnce(reading.promise);
    const value = envelope(); Object.assign(value.state, { monotonicMs: 1000 });
    const session = new ShowSession({ engine }); const attaching = session.attachPreparedSession();
    engine.emit(Object.assign({ type: 'STATE', state: 'ready' }, { generation: 9, monotonicMs: 999 }) as EngineEvent);
    engine.emit(Object.assign({ type: 'INTERRUPTION', reason: 'audio_focus' }, { generation: 10, monotonicMs: 1001 }) as EngineEvent);
    reading.resolve(value); expect(await attaching).toBe(true);
    expect(session.getState()).toMatchObject({ phase: 'interrupted', nativeGeneration: 10 }); expect(session.go()).toBeNull(); expect(engine.dispatch).not.toHaveBeenCalled();
  });
  it('does not rewind an authoritative paused state with a generic event stamped in the same millisecond', async () => {
    const engine = new ExistingEngine(); const reading = deferred<PreparedNativeSession | null>(); engine.getPreparedSession.mockReturnValueOnce(reading.promise);
    const value = envelope(); value.state = { ...value.state, phase: 'paused' }; Object.assign(value.state, { monotonicMs: 1000 });
    const session = new ShowSession({ engine }); const attaching = session.attachPreparedSession();
    engine.emit(Object.assign({ type: 'STATE', state: 'playing' }, { generation: 9, monotonicMs: 1000 }) as EngineEvent);
    reading.resolve(value); await attaching; expect(session.getState().phase).toBe('paused'); expect(engine.dispatch).not.toHaveBeenCalled();
  });
  it('preserves observed legacy voice counts when existing voice identities were never seen by this interface', async () => {
    const engine = new ExistingEngine(); const compiled = compileRunSnapshot(sampleShow, 'set-main', sampleControllerProfiles); if (!compiled.ok) throw new Error('Fixture');
    engine.existing = { ...envelope(), snapshotJson: JSON.stringify(compiled.snapshot), state: { ...envelope().state, transportMode: 'legacyCueStack', activeVoiceCount: 3 } };
    const session = new ShowSession({ engine }); await session.attachPreparedSession(); engine.emit({ type: 'VOICE_END', cueId: 'opening', voiceId: 'old-voice' });
    expect(session.getState().activeVoiceCount).toBe(3); engine.emit({ ...engine.existing.state, activeVoiceCount: 2 }); expect(session.getState().activeVoiceCount).toBe(2);
  });
  it('never lowers a router command ID watermark', () => {
    const engine = new ExistingEngine(); const router = new SerializedCommandRouter(engine); router.advanceCommandId(100); router.advanceCommandId(1);
    expect(router.enqueue({ type: 'STOP_ALL' })).toBe(101);
    expect(() => router.advanceCommandId(Number.MAX_SAFE_INTEGER)).toThrow(); expect(() => router.advanceCommandId(-1)).toThrow();
  });
});
