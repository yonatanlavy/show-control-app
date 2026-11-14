import type { AudioEngine, EngineCommand, EngineEvent, NativeRunState, SessionPurpose } from '../../src/audio'
import { sampleControllerProfiles, sampleShow, type RunSnapshot, type Show } from '../../src/domain'
import { ShowSession } from '../../src/runtime'

const show: Show = { ...sampleShow, schemaVersion: 2, sets: sampleShow.sets.map((set) => ({ ...set, transportMode: 'oms' })) }
class InterruptionEngine implements AudioEngine {
  private readonly listeners = new Set<(event: EngineEvent) => void>()
  nativeState!: NativeRunState
  readonly dispatch = jest.fn<Promise<void>, [EngineCommand]>().mockResolvedValue(undefined)
  readonly dispatchUrgent = jest.fn<Promise<void>, [EngineCommand]>().mockResolvedValue(undefined)
  readonly shutdown = jest.fn<Promise<void>, []>().mockResolvedValue(undefined)
  readonly prepare = jest.fn(async (snapshot: RunSnapshot, purpose?: SessionPurpose) => {
    this.nativeState = { type: 'RUN_STATE', generation: (this.nativeState?.generation ?? 0) + 1, transportMode: snapshot.transportMode ?? 'legacyCueStack', sessionPurpose: purpose ?? 'performance',
      showId: snapshot.showId, setId: snapshot.setId, revisionId: snapshot.revisionId, phase: 'ready',
      selectedCueId: snapshot.cueOrder[0] ?? '', currentCueId: '', nextCueId: snapshot.cueOrder[1] ?? '', currentCueIndex: -1, nextCueIndex: 1, activeVoiceCount: 0, countdownRemainingMs: 0 }
  })
  readonly getState = jest.fn(async () => this.nativeState)
  subscribe(listener: (event: EngineEvent) => void) { this.listeners.add(listener); return { remove: () => this.listeners.delete(listener) } }
  emit(event: EngineEvent) { this.listeners.forEach((listener) => listener(event)) }
}
function eventWithGeneration<T extends EngineEvent>(event: T, generation: number) { return { ...event, generation, showId: show.id, setId: 'set-main', revisionId: show.revisionId } }
function deferred() { let resolve!: () => void; let reject!: (error: Error) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
async function prepared() { const engine = new InterruptionEngine(); const session = new ShowSession({ engine }); await session.prepareShow(show, 'set-main', sampleControllerProfiles); return { engine, session } }
async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
const interruptions: readonly [string, EngineEvent][] = [
  ['call', { type: 'INTERRUPTION', reason: 'incoming_call' }],
  ['route loss', { type: 'ROUTE_CHANGE', previous: 'wired', current: 'speaker', safeStopped: true }],
  ['native fault', { type: 'FAULT', code: 'MEDIA_SERVICES_RESET', message: 'Prepare the run again' }],
]

describe('interruption closes JS command admission until deliberate preparation', () => {
  it.each(interruptions)('drops queued Replay, Hit and delayed work after %s while keeping panic and stop immediate', async (_name, event) => {
    const { engine, session } = await prepared()
    const bridge = deferred(); engine.dispatch.mockReturnValueOnce(bridge.promise)
    expect(session.replay()).not.toBeNull()
    expect(session.triggerHit('reveal')).not.toBeNull()
    expect(session.schedule({ type: 'PAUSE' }, 4000)).not.toBeNull()
    engine.emit(eventWithGeneration(event, 7))
    expect(session.go()).toBeNull(); expect(session.replay()).toBeNull(); expect(session.triggerHit('reveal')).toBeNull()
    expect(session.startCue('opening')).toBeNull(); expect(session.select('opening')).toBeNull(); expect(session.play()).toBeNull()
    expect(session.schedule({ type: 'RESUME' }, 4000)).toBeNull()
    expect(session.panic()).not.toBeNull(); expect(session.stopAll()).not.toBeNull()
    bridge.resolve(); await flush()
    expect(engine.dispatch.mock.calls.map(([command]) => command.type)).toEqual(['REPLAY'])
    expect(engine.dispatchUrgent.mock.calls.map(([command]) => command.type)).toEqual(['PANIC_FADE', 'STOP_ALL'])
    expect(session.getState().pendingCommandIds).toEqual([])
  })

  it('keeps a late rejected bridge command from replacing the interruption reason or draining its old queue', async () => {
    const { engine, session } = await prepared()
    const bridge = deferred(); engine.dispatch.mockReturnValueOnce(bridge.promise)
    session.replay(); session.triggerHit('reveal')
    engine.emit(eventWithGeneration({ type: 'INTERRUPTION', reason: 'incoming_call' }, 8))
    bridge.reject(new Error('late bridge rejection')); await flush()
    expect(session.getState()).toMatchObject({ phase: 'interrupted', detail: 'incoming_call', nativeGeneration: 8 })
    expect(engine.dispatch).toHaveBeenCalledTimes(1)
  })

  it('rejects bare and stale playback notifications after an interruption and clears old countdown/progress', async () => {
    const { engine, session } = await prepared()
    engine.emit({ ...engine.nativeState, generation: 6, phase: 'playing', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 1, countdownRemainingMs: 2000 })
    engine.emit(eventWithGeneration({ type: 'PROGRESS', cueId: 'opening', positionMs: 2000, durationMs: 78000 }, 6))
    engine.emit(eventWithGeneration({ type: 'INTERRUPTION', reason: 'call' }, 7))
    const interrupted = session.getState()
    engine.emit(eventWithGeneration({ type: 'STATE', state: 'playing' }, 6))
    engine.emit(eventWithGeneration({ type: 'STATE', state: 'ready' }, 7))
    engine.emit({ type: 'STATE', state: 'paused' })
    engine.emit(eventWithGeneration({ type: 'VOICE_START', cueId: 'opening', voiceId: 'late-voice' }, 7))
    engine.emit(eventWithGeneration({ type: 'PROGRESS', cueId: 'opening', positionMs: 5000, durationMs: 78000 }, 7))
    engine.emit({ ...engine.nativeState, generation: 8, phase: 'playing', activeVoiceCount: 1 })
    expect(session.getState()).toBe(interrupted)
    expect(interrupted).toMatchObject({ phase: 'interrupted', nativeGeneration: 7, countdownRemainingMs: 0, progressCueId: '', progressPositionMs: null, progressDurationMs: null })
    expect(session.go()).toBeNull(); expect(engine.dispatch).not.toHaveBeenCalled()
  })

  it('retains recovery after Stop/Panic produces healthy-looking native state', async () => {
    const { engine, session } = await prepared()
    engine.emit(eventWithGeneration({ type: 'INTERRUPTION', reason: 'focus_lost' }, 2))
    session.stopAll(); session.panic()
    engine.emit(eventWithGeneration({ type: 'STATE', state: 'ready' }, 3))
    engine.emit({ ...engine.nativeState, generation: 3, phase: 'stopped' })
    expect(session.getState().phase).toBe('interrupted'); expect(session.replay()).toBeNull()
    expect(engine.dispatchUrgent).toHaveBeenCalledTimes(2)
  })

  it('closes admission when a foreground native state read reveals a missed interruption', async () => {
    const { engine, session } = await prepared()
    engine.nativeState = { ...engine.nativeState, generation: 4, phase: 'interrupted', countdownRemainingMs: 5000 }
    await session.reconcile()
    expect(session.getState()).toMatchObject({ phase: 'interrupted', countdownRemainingMs: 0, nativeGeneration: 4 })
    expect(session.getState().detail).toContain('Exit and prepare the run again')
    expect(session.triggerHit('reveal')).toBeNull(); expect(session.schedule({ type: 'GO' }, 1)).toBeNull()
    expect(engine.dispatch).not.toHaveBeenCalled()
  })

  it('does not turn a preparation-time interrupted RUN_STATE into Ready after prepare resolves', async () => {
    const engine = new InterruptionEngine(); const session = new ShowSession({ engine }); const preparation = deferred()
    engine.prepare.mockImplementationOnce(async () => {
      engine.emit({ type: 'RUN_STATE', generation: 9, transportMode: 'oms', phase: 'interrupted', selectedCueId: 'opening', currentCueId: '', nextCueId: 'crossfade', currentCueIndex: -1, nextCueIndex: 1, activeVoiceCount: 0, countdownRemainingMs: 0 })
      await preparation.promise
    })
    const preparing = session.prepareShow(show, 'set-main', sampleControllerProfiles)
    preparation.resolve()
    await expect(preparing).resolves.toMatchObject({ ok: false })
    expect(session.getState().phase).toBe('interrupted'); expect(session.startCue('opening')).toBeNull()
    expect(engine.dispatch).not.toHaveBeenCalled()
  })

  it('reopens command admission only after a fresh deliberate preparation', async () => {
    const { engine, session } = await prepared()
    engine.emit(eventWithGeneration({ type: 'INTERRUPTION', reason: 'call' }, 5))
    await expect(session.prepareShow(show, 'set-main', sampleControllerProfiles)).resolves.toMatchObject({ ok: true, nativePrepared: true })
    expect(session.getState().phase).toBe('ready'); expect(session.go()).not.toBeNull()
    expect(engine.dispatch.mock.calls.map(([command]) => command.type)).toEqual(['GO'])
  })

  it('reconciles healthy background playback without stopping, replaying or blocking normal commands', async () => {
    const { engine, session } = await prepared()
    engine.nativeState = { ...engine.nativeState, generation: 4, phase: 'playing', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 1 }
    await session.reconcile()
    expect(session.getState()).toMatchObject({ phase: 'running', currentCueId: 'opening', activeVoiceCount: 1 })
    expect(engine.dispatch).not.toHaveBeenCalled(); expect(engine.dispatchUrgent).not.toHaveBeenCalled()
    expect(session.triggerHit('reveal')).not.toBeNull()
  })
})
