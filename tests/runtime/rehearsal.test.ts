import type { AudioEngine, EngineCommand, EngineEvent, NativeRunState, SessionPurpose, Subscription } from '../../src/audio'
import { sampleControllerProfiles, sampleShow, type Show } from '../../src/domain'
import { isCriticalShowSession, ShowSession } from '../../src/runtime'

function fixture(): Show {
  const original = structuredClone(sampleShow)
  const opening = original.cues.opening
  if (opening?.type !== 'audio') throw new Error('Audio fixture is missing')
  return { ...original, schemaVersion: 2, cues: { ...original.cues, opening: { ...opening, trimInMs: 1000, trimOutMs: 21000, playbackRate: 2 } },
    sets: [{ ...original.sets[0]!, transportMode: 'oms', cueOrder: ['opening', 'bed'] }] }
}

class RehearsalEngine implements AudioEngine {
  private readonly listeners = new Set<(event: EngineEvent) => void>()
  readonly prepare = jest.fn(async (snapshot: Parameters<AudioEngine['prepare']>[0], purpose?: SessionPurpose) => {
    this.nativeState = { type: 'RUN_STATE', generation: 1, sessionPurpose: purpose ?? 'performance', transportMode: snapshot.transportMode ?? 'legacyCueStack',
      showId: snapshot.showId, setId: snapshot.setId, revisionId: snapshot.revisionId, phase: 'ready',
      selectedCueId: snapshot.cueOrder[0] ?? '', currentCueId: '', nextCueId: snapshot.cueOrder[1] ?? '',
      currentCueIndex: -1, nextCueIndex: 1, activeVoiceCount: 0, countdownRemainingMs: 0 }
  })
  readonly dispatch = jest.fn<Promise<void>, [EngineCommand]>().mockResolvedValue(undefined)
  readonly dispatchUrgent = jest.fn<Promise<void>, [EngineCommand]>().mockResolvedValue(undefined)
  readonly shutdown = jest.fn<Promise<void>, []>().mockResolvedValue(undefined)
  readonly getState = jest.fn(async () => this.nativeState)
  nativeState!: NativeRunState
  subscribe(listener: (event: EngineEvent) => void): Subscription { this.listeners.add(listener); return { remove: () => this.listeners.delete(listener) } }
  emit(event: EngineEvent) { this.listeners.forEach((listener) => listener(event)) }
  publish(changes: Partial<NativeRunState>) { this.nativeState = { ...this.nativeState, ...changes }; this.emit(this.nativeState) }
}

async function prepared() {
  const show = fixture(); const engine = new RehearsalEngine(); const session = new ShowSession({ engine })
  const result = await session.prepareShow(show, 'set-main', sampleControllerProfiles, 'rehearsal')
  expect(result).toMatchObject({ ok: true, nativePrepared: true })
  return { show, engine, session }
}

describe('native full-sequence rehearsal session', () => {
  it('pauses native delayed work before any voice starts and clears its observation after Stop', async () => {
    const { engine, session } = await prepared()
    engine.publish({ phase: 'ready', activeVoiceCount: 0, hasPendingActions: true, mainSequenceVoiceCount: 0 })
    expect(session.pauseResume()).not.toBeNull()
    await Promise.resolve(); await Promise.resolve()
    expect(engine.dispatch.mock.calls.map(([command]) => command.type)).toEqual(['PAUSE'])
    engine.publish({ phase: 'paused', hasPendingActions: true })
    expect(session.getState()).toMatchObject({ hasPendingActions: true, mainSequenceVoiceCount: 0 })
    session.stopAll()
    engine.publish({ phase: 'ready', hasPendingActions: false })
    expect(session.getState()).toMatchObject({ hasPendingActions: false, mainSequenceVoiceCount: 0 })
    expect(session.pauseResume()).toBeNull()
  })

  it('does not inherit pending-work certainty from an older bridge or after recovery', async () => {
    const { engine, session } = await prepared()
    engine.publish({ phase: 'ready', activeVoiceCount: 0, hasPendingActions: true, mainSequenceVoiceCount: 0 })
    const { hasPendingActions: _pending, mainSequenceVoiceCount: _main, ...older } = engine.nativeState
    engine.emit(older)
    expect(session.getState()).toMatchObject({ hasPendingActions: null, mainSequenceVoiceCount: null })
    expect(session.pauseResume()).toBeNull()
    engine.publish({ phase: 'interrupted', hasPendingActions: true, mainSequenceVoiceCount: 0 })
    expect(session.getState()).toMatchObject({ hasPendingActions: null, mainSequenceVoiceCount: null })
    expect(session.pauseResume()).toBeNull()
  })

  it.each([{ hasPendingActions: 'yes', mainSequenceVoiceCount: -1 }, { hasPendingActions: 1, mainSequenceVoiceCount: 9 }, { hasPendingActions: null, mainSequenceVoiceCount: 0.5 }])('keeps malformed live optional observations unknown: %j', async (observation) => {
    const { engine, session } = await prepared()
    engine.emit({ ...engine.nativeState, ...observation } as unknown as NativeRunState)
    expect(session.getState()).toMatchObject({ hasPendingActions: null, mainSequenceVoiceCount: null })
    expect(session.pauseResume()).toBeNull()
    expect(engine.dispatch).not.toHaveBeenCalled()
  })

  it.each(['ready', 'stopped'] as const)('pauses independent Hits while the main pointer is %s, without advancing it', async (phase) => {
    const { engine, session } = await prepared()
    engine.publish({ phase, currentCueId: '', activeVoiceCount: 1 })
    expect(session.pauseResume()).not.toBeNull()
    await Promise.resolve(); await Promise.resolve()
    expect(engine.dispatch.mock.calls.map(([command]) => command.type)).toEqual(['PAUSE'])
    expect(session.getState()).toMatchObject({ phase, selectedCueId: 'opening', currentCueId: '' })
    engine.publish({ phase: 'paused' })
    expect(session.pauseResume()).not.toBeNull()
    await Promise.resolve(); await Promise.resolve()
    expect(engine.dispatch.mock.calls.map(([command]) => command.type)).toEqual(['PAUSE', 'RESUME'])
  })

  it('does not enable pause for idle silence or reopen playback after interruption with retained Hit counts', async () => {
    const { engine, session } = await prepared()
    expect(session.pauseResume()).toBeNull()
    engine.publish({ phase: 'interrupted', activeVoiceCount: 8 })
    expect(session.pauseResume()).toBeNull()
    engine.publish({ phase: 'ready', activeVoiceCount: 8 })
    expect(session.pauseResume()).toBeNull()
    expect(engine.dispatch).not.toHaveBeenCalled()
    expect(session.stopAll()).not.toBeNull()
  })

  it('follows the native legacy cue-stack pointer after selection, pause and completion', async () => {
    const show = fixture(); const engine = new RehearsalEngine(); const session = new ShowSession({ engine })
    const legacy = { ...show, sets: [{ ...show.sets[0]!, transportMode: 'legacyCueStack' as const }] }
    engine.prepare.mockImplementationOnce(async (snapshot, purpose) => {
      engine.nativeState = { type: 'RUN_STATE', generation: 1, sessionPurpose: purpose ?? 'performance', transportMode: 'legacyCueStack', showId: snapshot.showId, setId: snapshot.setId, revisionId: snapshot.revisionId,
        phase: 'ready', selectedCueId: 'opening', currentCueId: '', nextCueId: 'opening', currentCueIndex: -1, nextCueIndex: 0, activeVoiceCount: 0, countdownRemainingMs: 0 }
    })
    await session.prepareShow(legacy, 'set-main', sampleControllerProfiles, 'rehearsal')
    expect(engine.getState).toHaveBeenCalledTimes(1)
    expect(session.getState()).toMatchObject({ nextCueIndex: 0, nextCueId: 'opening' })
    session.select('bed'); engine.publish({ generation: 2, selectedCueId: 'bed', nextCueId: 'bed', nextCueIndex: 1 })
    session.go(); await Promise.resolve(); await Promise.resolve()
    expect(engine.dispatch.mock.calls.map(([command]) => command.type)).toEqual(['SELECT', 'GO'])
    expect(engine.dispatch.mock.calls.some(([command]) => command.type === 'TRIGGER_CUE')).toBe(false)
    engine.publish({ phase: 'paused', currentCueId: 'bed', currentCueIndex: 1, activeVoiceCount: 1, nextCueId: '', nextCueIndex: 2 })
    session.go(); await Promise.resolve(); await Promise.resolve()
    expect(engine.dispatch.mock.calls.at(-1)?.[0].type).toBe('GO')
    engine.publish({ phase: 'ready', activeVoiceCount: 0 })
    expect(session.getState()).toMatchObject({ nextCueIndex: 2, nextCueId: '', activeVoiceCount: 0 })
    await session.shutdown()
  })
  it('prepares a deeply immutable revision silently and hands rehearsal to the native owner', async () => {
    const { show, engine, session } = await prepared()
    expect(engine.prepare.mock.calls[0]).toHaveLength(2)
    expect(engine.prepare.mock.calls[0]![1]).toBe('rehearsal')
    expect(session.getState()).toMatchObject({ sessionPurpose: 'rehearsal', phase: 'ready', selectedCueId: 'opening', currentCueId: '', activeVoiceCount: 0 })
    expect(isCriticalShowSession(session.getState())).toBe(true)
    const snapshot = session.getState().snapshot!
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.cues.opening)).toBe(true)
    expect(snapshot.cues.opening).not.toBe(show.cues.opening)
    const mutableOriginal = show.cues.opening as { name: string }; mutableOriginal.name = 'Later builder edit'
    expect(snapshot.cues.opening!.name).toBe('House to stage')
    expect(engine.dispatch).not.toHaveBeenCalled(); expect(engine.dispatchUrgent).not.toHaveBeenCalled()
  })

  it('retains safe locked controls after native preparation fails without automatically retrying playback', async () => {
    const engine = new RehearsalEngine(); engine.prepare.mockRejectedValueOnce(new Error('Local decode failed'))
    const session = new ShowSession({ engine })
    await expect(session.prepareShow(fixture(), 'set-main', sampleControllerProfiles, 'rehearsal')).resolves.toMatchObject({ ok: false, detail: 'Local decode failed' })
    expect(session.getState()).toMatchObject({ sessionPurpose: 'rehearsal', phase: 'fault' })
    expect(isCriticalShowSession(session.getState())).toBe(true)
    expect(session.go()).toBeNull()
    expect(session.panic()).not.toBeNull(); expect(session.stopAll()).not.toBeNull()
    expect(engine.dispatch).not.toHaveBeenCalled()
    expect(engine.dispatchUrgent.mock.calls.map(([command]) => command.type)).toEqual(['PANIC_FADE', 'STOP_ALL'])
  })

  it.each(['performance', undefined] as const)('refuses native preparation reconciled as %s rather than rehearsal', async (purpose) => {
    const engine = new RehearsalEngine()
    engine.getState.mockImplementation(async () => {
      const { sessionPurpose: _purpose, ...withoutPurpose } = engine.nativeState
      return purpose === undefined ? withoutPurpose : { ...withoutPurpose, sessionPurpose: purpose }
    })
    const session = new ShowSession({ engine })
    await expect(session.prepareShow(fixture(), 'set-main', sampleControllerProfiles, 'rehearsal')).resolves.toMatchObject({ ok: false, detail: expect.stringContaining('NATIVE_SESSION_LOST') })
    expect(session.getState().phase).toBe('fault'); expect(session.go()).toBeNull()
    expect(engine.dispatch).not.toHaveBeenCalled()
  })

  it('fails closed on foreground mode replacement and uses urgent stop when native audio remains active', async () => {
    const { engine, session } = await prepared()
    engine.publish({ phase: 'playing', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 1 })
    engine.getState.mockResolvedValue({ ...engine.nativeState, sessionPurpose: 'performance' })
    await expect(session.reconcile()).rejects.toThrow('NATIVE_SESSION_LOST')
    expect(session.getState()).toMatchObject({ phase: 'fault', sessionPurpose: 'rehearsal' })
    expect(engine.dispatchUrgent).toHaveBeenCalledWith(expect.objectContaining({ type: 'STOP_ALL' }))
    expect(engine.dispatch).not.toHaveBeenCalled()
  })

  it('ignores streamed performance-mode state without replaying commands into a rehearsal', async () => {
    const { engine, session } = await prepared(); const before = session.getState()
    engine.emit({ ...engine.nativeState, sessionPurpose: 'performance', generation: 100, phase: 'playing', currentCueId: 'bed', selectedCueId: 'bed' })
    expect(session.getState()).toBe(before)
    expect(engine.dispatch).not.toHaveBeenCalled(); expect(engine.dispatchUrgent).not.toHaveBeenCalled()
  })

  it('sends absolute source-time seek values without scaling by playback rate and rejects invalid positions', async () => {
    const { engine, session } = await prepared()
    engine.publish({ phase: 'playing', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 1, playbackRate: 2 })
    expect(session.seekRehearsal('opening', 12500)).not.toBeNull()
    expect(engine.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SEEK_REHEARSAL', cueId: 'opening', positionMs: 12500 }))
    for (const position of [Number.NaN, Number.POSITIVE_INFINITY, -1]) expect(session.seekRehearsal('opening', position)).toBeNull()
    expect(session.seekRehearsal('outside-set', 1000)).toBeNull()
    expect(engine.dispatch).toHaveBeenCalledTimes(1)
  })

  it('makes selection silent and keeps the visible selection native-owned until confirmation arrives', async () => {
    const { engine, session } = await prepared()
    expect(session.select('bed')).not.toBeNull()
    expect(session.select('reveal')).toBeNull()
    expect(engine.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SELECT', cueId: 'bed' }))
    expect(engine.dispatch.mock.calls.some(([command]) => ['GO', 'PLAY', 'START_SELECTED'].includes(command.type))).toBe(false)
    expect(session.getState().selectedCueId).toBe('opening')
    engine.publish({ generation: 2, selectedCueId: 'bed', currentCueId: '', nextCueId: '', currentCueIndex: -1, nextCueIndex: 2 })
    expect(session.getState()).toMatchObject({ phase: 'ready', selectedCueId: 'bed', currentCueId: '' })
    expect(session.go()).not.toBeNull(); await Promise.resolve()
    expect(engine.dispatch.mock.calls.at(-1)![0].type).toBe('GO')
  })

  it('uses only current main-voice native progress and does not let a same-song Hit overwrite it', async () => {
    const { engine, session } = await prepared()
    engine.publish({ phase: 'playing', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 1 })
    engine.emit({ type: 'PROGRESS', cueId: 'opening', positionMs: 2500, durationMs: 20000, mainTransport: true })
    expect(session.getState()).toMatchObject({ progressCueId: 'opening', progressPositionMs: 2500, progressDurationMs: 20000 })
    engine.emit({ type: 'PROGRESS', cueId: 'opening', positionMs: 9000, durationMs: 20000, mainTransport: false })
    engine.emit({ type: 'PROGRESS', cueId: 'bed', positionMs: 4000, durationMs: 112000, mainTransport: true })
    expect(session.getState().progressPositionMs).toBe(2500)
    expect(engine.dispatch).not.toHaveBeenCalled()
  })

  it('retains native voice count after foreground reconciliation when earlier voice notifications were missed', async () => {
    const { engine, session } = await prepared()
    // The native owner kept playing while JavaScript missed VOICE_START.
    engine.nativeState = { ...engine.nativeState, phase: 'playing', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 1 }
    await session.reconcile()
    engine.emit({ type: 'PROGRESS', cueId: 'opening', positionMs: 2500, durationMs: 20000, mainTransport: true })
    engine.emit({ type: 'PROGRESS', cueId: 'opening', positionMs: 9000, durationMs: 20000, mainTransport: false })
    engine.emit({ type: 'VOICE_END', cueId: 'reveal', voiceId: 'unobserved-hit', mainTransport: false })
    engine.emit({ type: 'STATE', state: 'playing' })
    expect(session.getState()).toMatchObject({ phase: 'running', activeVoiceCount: 1, progressPositionMs: 2500 })
    expect(engine.dispatch).not.toHaveBeenCalled(); expect(engine.dispatchUrgent).not.toHaveBeenCalled()
    engine.publish({ generation: 2, phase: 'ready', currentCueId: '', currentCueIndex: -1, activeVoiceCount: 0 })
    expect(session.getState().activeVoiceCount).toBe(0)
  })

  it('ignores GO while transitioning and deliberately resumes a paused countdown while retaining urgent safety', async () => {
    const { engine, session } = await prepared()
    engine.publish({ phase: 'fading', currentCueId: 'opening', currentCueIndex: 0, countdownRemainingMs: 1500 })
    expect(session.go()).toBeNull()
    engine.publish({ phase: 'paused' })
    expect(session.go()).not.toBeNull()
    expect(engine.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'GO' }))
    expect(session.panic()).not.toBeNull(); expect(session.stopAll()).not.toBeNull()
    expect(engine.dispatchUrgent.mock.calls.map(([command]) => command.type)).toEqual(['PANIC_FADE', 'STOP_ALL'])
  })

  it('preserves the rehearsal snapshot and safety path when silent exit cannot be confirmed, then permits a deliberate retry', async () => {
    const { engine, session } = await prepared(); const snapshot = session.getState().snapshot
    engine.shutdown.mockRejectedValueOnce(new Error('Native owner did not stop'))
    await expect(session.exitRun()).resolves.toBe(false)
    expect(session.getState()).toMatchObject({ phase: 'fault', sessionPurpose: 'rehearsal', snapshot })
    expect(isCriticalShowSession(session.getState())).toBe(true); expect(session.go()).toBeNull()
    expect(session.stopAll()).not.toBeNull()
    expect(engine.dispatchUrgent).toHaveBeenCalledWith(expect.objectContaining({ type: 'STOP_ALL' }))
    await expect(session.exitRun()).resolves.toBe(true)
    expect(session.getState()).toMatchObject({ phase: 'idle', sessionPurpose: 'performance', snapshot: null, currentCueId: '', activeVoiceCount: 0 })
    expect(isCriticalShowSession(session.getState())).toBe(false); expect(engine.dispatch).not.toHaveBeenCalled()
  })

  it('cannot seek a performance session after rehearsal exits, and keeps the default prepare call compatible', async () => {
    const { show, engine, session } = await prepared()
    await session.exitRun(); await session.prepareShow(show, 'set-main', sampleControllerProfiles)
    expect(engine.prepare.mock.calls[1]).toHaveLength(1)
    expect(session.getState().sessionPurpose).toBe('performance')
    expect(session.seekRehearsal('opening', 1500)).toBeNull()
    expect(engine.dispatch).not.toHaveBeenCalled()
  })

  it('never re-enters Ready when a pending rehearsal prepare resolves after explicit exit', async () => {
    let complete!: () => void
    const engine = new RehearsalEngine(); engine.prepare.mockReturnValueOnce(new Promise<void>((resolve) => { complete = resolve }))
    const session = new ShowSession({ engine })
    const preparation = session.prepareShow(fixture(), 'set-main', sampleControllerProfiles, 'rehearsal')
    expect(session.getState().phase).toBe('preparing')
    await session.exitRun(); complete()
    await expect(preparation).resolves.toMatchObject({ ok: false })
    expect(session.getState()).toMatchObject({ phase: 'idle', snapshot: null, sessionPurpose: 'performance' })
    expect(engine.dispatch).not.toHaveBeenCalled(); expect(engine.getState).not.toHaveBeenCalled()
  })
  it('clears progress at a new main cue/generation and does not show an old cursor during same-song countdown', async () => {
    const { engine, session } = await prepared()
    engine.publish({ phase: 'playing', currentCueId: 'opening', activeVoiceCount: 1 })
    engine.emit({ type: 'PROGRESS', cueId: 'opening', positionMs: 6000, durationMs: 20000, mainTransport: true })
    expect(session.getState().progressPositionMs).toBe(6000)
    engine.publish({ phase: 'paused' })
    expect(session.getState().progressPositionMs).toBe(6000)
    engine.publish({ generation: 2, phase: 'ready', currentCueId: '', activeVoiceCount: 0 })
    expect(session.getState()).toMatchObject({ progressCueId: '', progressPositionMs: null, progressDurationMs: null })
    engine.publish({ phase: 'fading', currentCueId: 'opening', countdownRemainingMs: 2000 })
    expect(session.getState().progressPositionMs).toBeNull()
    engine.publish({ phase: 'playing', currentCueId: 'bed', countdownRemainingMs: 0, activeVoiceCount: 1 })
    engine.emit({ type: 'PROGRESS', cueId: 'opening', positionMs: 9000, durationMs: 20000, mainTransport: true })
    expect(session.getState().progressPositionMs).toBeNull()
  })
})
