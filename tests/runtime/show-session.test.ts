import type { AudioEngine, EngineCommand, EngineEvent, NativeRunState, Subscription } from '../../src/audio'
import { sampleControllerProfiles, sampleShow } from '../../src/domain'
import { ShowSession } from '../../src/runtime'

class FakeAudioEngine implements AudioEngine {
  readonly prepared = [] as unknown[]
  readonly dispatched: EngineCommand[] = []
  private readonly listeners = new Set<(event: EngineEvent) => void>()

  async prepare(snapshot: Parameters<AudioEngine['prepare']>[0]) { this.prepared.push(snapshot) }
  async dispatch(command: EngineCommand) { this.dispatched.push(command) }
  subscribe(listener: (event: EngineEvent) => void): Subscription {
    this.listeners.add(listener)
    return { remove: () => this.listeners.delete(listener) }
  }
  async shutdown(): Promise<void> { return undefined }
  emit(event: EngineEvent) { for (const listener of this.listeners) listener(event) }
}

describe('ShowSession native orchestration', () => {
  it('refuses paused Hits without a command or recovery fault and permits them after explicit resume', async () => {
    const engine = new FakeAudioEngine()
    const session = new ShowSession({ engine })
    const show = { ...sampleShow, schemaVersion: 2 as const, sets: sampleShow.sets.map((set) => ({ ...set, transportMode: 'oms' as const })) }
    await session.prepareShow(show, 'set-main', sampleControllerProfiles)
    const state = { type: 'RUN_STATE' as const, generation: 1, transportMode: 'oms' as const, selectedCueId: 'opening', currentCueId: 'opening', nextCueId: 'crossfade', currentCueIndex: 0, nextCueIndex: 1, activeVoiceCount: 1, countdownRemainingMs: 0 }
    engine.emit({ ...state, phase: 'paused' })
    expect(session.triggerHit('reveal')).toBeNull()
    expect(session.dispatchController({ type: 'TRIGGER_HIT', cueId: 'reveal' })).toBeNull()
    expect(engine.dispatched).toEqual([])
    expect(session.getState().phase).toBe('paused')
    engine.emit({ ...state, phase: 'playing' })
    expect(session.triggerHit('reveal')).not.toBeNull()
    expect(engine.dispatched[0]).toMatchObject({ type: 'TRIGGER_HIT', cueId: 'reveal' })
  })

  it.each(['resolve', 'reject'] as const)('discards old queued playback when a replaced bridge later %ss', async (outcome) => {
    let resolveOld!: () => void
    let rejectOld!: (error: Error) => void
    const oldDispatch = new Promise<void>((resolve, reject) => { resolveOld = resolve; rejectOld = reject })
    const engine = new FakeAudioEngine()
    engine.dispatch = async (command) => {
      engine.dispatched.push(command)
      if (command.id === 1) await oldDispatch
    }
    const session = new ShowSession({ engine })
    await session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)
    expect(session.triggerHit('reveal')).toBe(1)
    expect(session.go()).toBe(2)
    await expect(session.exitRun()).resolves.toBe(true)
    await session.prepareShow({ ...sampleShow, revisionId: 'next-run' }, 'set-main', sampleControllerProfiles)
    expect(session.go()).toBe(3)
    expect(engine.dispatched.map((command) => command.id)).toEqual([1, 3])
    if (outcome === 'resolve') resolveOld()
    else rejectOld(new Error('Old bridge failed after the new run was ready'))
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(engine.dispatched.map((command) => command.id)).toEqual([1, 3])
    expect(session.getState()).toMatchObject({ phase: 'ready', snapshot: { revisionId: 'next-run' }, pendingCommandIds: [3] })
  })

  it('does not let a late exit completion erase a deliberately prepared newer run', async () => {
    let finishExit!: () => void
    const engine = new FakeAudioEngine()
    engine.shutdown = () => new Promise<void>((resolve) => { finishExit = resolve })
    const session = new ShowSession({ engine })
    await session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)
    const exiting = session.exitRun()
    await session.prepareShow({ ...sampleShow, revisionId: 'next-run' }, 'set-main', sampleControllerProfiles)
    finishExit()
    await expect(exiting).resolves.toBe(false)
    expect(session.getState()).toMatchObject({ phase: 'ready', snapshot: { revisionId: 'next-run' } })
    expect(session.go()).not.toBeNull()
  })

  it('does not report superseded preparation successful after a delayed native state read', async () => {
    let finishRead!: (state: NativeRunState) => void
    const read = jest.fn<Promise<NativeRunState>, []>().mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve }))
    const engine = Object.assign(new FakeAudioEngine(), { getState: read })
    const session = new ShowSession({ engine })
    const show = { ...sampleShow, schemaVersion: 2 as const, sets: sampleShow.sets.map((set) => ({ ...set, transportMode: 'oms' as const })) }
    const preparing = session.prepareShow(show, 'set-main', sampleControllerProfiles)
    await Promise.resolve()
    await session.exitRun()
    finishRead({ type: 'RUN_STATE', generation: 1, transportMode: 'oms', phase: 'ready', selectedCueId: 'opening', currentCueId: '', nextCueId: 'crossfade', currentCueIndex: -1, nextCueIndex: 1, activeVoiceCount: 0, countdownRemainingMs: 0 })
    await expect(preparing).resolves.toMatchObject({ ok: false, detail: 'A newer preparation replaced this run.' })
    expect(session.getState()).toMatchObject({ phase: 'idle', snapshot: null })
  })

  it('refuses new playback while exit is waiting for confirmed native shutdown', async () => {
    let finishExit!: () => void
    const engine = new FakeAudioEngine()
    engine.shutdown = () => new Promise<void>((resolve) => { finishExit = resolve })
    const session = new ShowSession({ engine })
    await session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)
    const exiting = session.exitRun()
    expect(session.go()).toBeNull()
    expect(session.triggerHit('reveal')).toBeNull()
    expect(session.panic()).not.toBeNull()
    finishExit(); await exiting
    expect(engine.dispatched.map((command) => command.type)).toEqual(['PANIC_FADE'])
  })

  it('does not let an isolated preview failure alter a prepared run', async () => {
    const engine = new FakeAudioEngine(); const session = new ShowSession({ engine })
    await session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)
    const ready = session.getState()
    engine.emit({ type: 'PREVIEW_ERROR', code: 'DECODE_FAILED', message: 'An audition failed' })
    expect(session.getState()).toBe(ready); expect(engine.dispatched).toEqual([])
  })
  it('ignores a superseded preparation failure instead of faulting a newer ready run', async () => {
    let rejectOld!: (error: Error) => void
    const prepare = jest.fn<Promise<void>, [Parameters<AudioEngine['prepare']>[0]]>()
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject }))
      .mockResolvedValue(undefined)
    const engine = Object.assign(new FakeAudioEngine(), { prepare })
    const session = new ShowSession({ engine })
    const oldRun = session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)
    await session.prepareShow({ ...sampleShow, revisionId: 'new-revision' }, 'set-main', sampleControllerProfiles)
    rejectOld(new Error('Old owner failed late'))
    await expect(oldRun).resolves.toMatchObject({ ok: false, detail: 'A newer preparation replaced this run.' })
    expect(session.getState()).toMatchObject({ phase: 'ready', snapshot: { revisionId: 'new-revision' } })
    expect(engine.dispatched).toEqual([])
  })
  it('requires deliberate preparation after the native owner disappears, rather than retaining a false Ready state', async () => {
    const show = { ...sampleShow, schemaVersion: 2 as const, sets: sampleShow.sets.map((set) => ({ ...set, transportMode: 'oms' as const })) }
    let queried: NativeRunState = { type: 'RUN_STATE', showId: show.id, setId: 'set-main', revisionId: show.revisionId, generation: 8, transportMode: 'oms', phase: 'ready', selectedCueId: 'opening', currentCueId: '', nextCueId: 'crossfade', currentCueIndex: -1, nextCueIndex: 1, activeVoiceCount: 0, countdownRemainingMs: 0 }
    const engine = Object.assign(new FakeAudioEngine(), { getState: async () => queried })
    const session = new ShowSession({ engine }); await session.prepareShow(show, 'set-main', sampleControllerProfiles)
    queried = { type: 'RUN_STATE', generation: 0, transportMode: 'legacyCueStack', phase: 'stopped', selectedCueId: '', currentCueId: '', nextCueId: '', currentCueIndex: -1, nextCueIndex: 0, activeVoiceCount: 0, countdownRemainingMs: 0 }
    await expect(session.reconcile()).rejects.toThrow('NATIVE_SESSION_LOST')
    expect(session.getState()).toMatchObject({ phase: 'fault', activeVoiceCount: 0 }); expect(session.go()).toBeNull(); expect(engine.dispatched).toEqual([])
  })
  it('ignores a foreground state read that finishes after a newer preparation', async () => {
    const show = { ...sampleShow, schemaVersion: 2 as const, sets: sampleShow.sets.map((set) => ({ ...set, transportMode: 'oms' as const })) }
    const ready = (revisionId: string): NativeRunState => ({ type: 'RUN_STATE', showId: show.id, setId: 'set-main', revisionId, generation: 8, transportMode: 'oms', phase: 'ready', selectedCueId: 'opening', currentCueId: '', nextCueId: 'crossfade', currentCueIndex: -1, nextCueIndex: 1, activeVoiceCount: 0, countdownRemainingMs: 0 })
    const read = jest.fn<Promise<NativeRunState>, []>().mockResolvedValue(ready(show.revisionId))
    const engine = Object.assign(new FakeAudioEngine(), { getState: read }); const session = new ShowSession({ engine })
    await session.prepareShow(show, 'set-main', sampleControllerProfiles)
    let release!: (event: NativeRunState) => void; read.mockReturnValueOnce(new Promise((resolve) => { release = resolve })); const oldRead = session.reconcile()
    read.mockResolvedValue(ready('new-revision')); await session.prepareShow({ ...show, revisionId: 'new-revision' }, 'set-main', sampleControllerProfiles)
    release(ready('old-owner')); await oldRead
    expect(session.getState()).toMatchObject({ phase: 'ready', snapshot: { revisionId: 'new-revision' } }); expect(engine.dispatched).toEqual([])
  })
  it('accepts a restarted native owner after reprepare and clears its prior selection and countdown', async () => {
    const engine = new FakeAudioEngine()
    const session = new ShowSession({ engine })
    const show = { ...sampleShow, schemaVersion: 2 as const, sets: sampleShow.sets.map((set) => ({ ...set, transportMode: 'oms' as const })) }
    await session.prepareShow(show, 'set-main', sampleControllerProfiles)
    engine.emit({ type: 'RUN_STATE', generation: 20, transportMode: 'oms', phase: 'fading', selectedCueId: 'crossfade', currentCueId: 'crossfade', nextCueId: 'hold', currentCueIndex: 1, nextCueIndex: 2, activeVoiceCount: 1, countdownRemainingMs: 500, playbackRate: 2 })
    await session.prepareShow(show, 'set-main', sampleControllerProfiles)
    expect(session.getState()).toMatchObject({ nativeGeneration: 0, selectedCueId: '', countdownRemainingMs: 0, playbackRate: 1 })
    engine.emit({ type: 'RUN_STATE', generation: 2, transportMode: 'oms', phase: 'ready', selectedCueId: 'opening', currentCueId: '', nextCueId: 'crossfade', currentCueIndex: -1, nextCueIndex: 1, activeVoiceCount: 0, countdownRemainingMs: 0 })
    expect(session.getState()).toMatchObject({ nativeGeneration: 2, selectedCueId: 'opening', phase: 'ready' })
  })

  it('rejects queued run and voice events from a different immutable snapshot', async () => {
    const engine = new FakeAudioEngine()
    const session = new ShowSession({ engine })
    const show = { ...sampleShow, revisionId: 'fresh-revision', schemaVersion: 2 as const, sets: sampleShow.sets.map((set) => ({ ...set, transportMode: 'oms' as const })) }
    await session.prepareShow(show, 'set-main', sampleControllerProfiles)
    engine.emit({ type: 'RUN_STATE', showId: show.id, setId: 'set-main', revisionId: 'old-revision', generation: 100, transportMode: 'oms', phase: 'playing', selectedCueId: 'crossfade', currentCueId: 'crossfade', nextCueId: 'hold', currentCueIndex: 1, nextCueIndex: 2, activeVoiceCount: 1, countdownRemainingMs: 0 })
    const staleVoice: EngineEvent & { revisionId: string } = { type: 'VOICE_START', cueId: 'opening', voiceId: 'stale-voice', mainTransport: true, revisionId: 'old-revision' }
    engine.emit(staleVoice)
    expect(session.getState()).toMatchObject({ nativeGeneration: 0, currentCueId: '', activeVoiceCount: 0 })
    engine.emit({ type: 'RUN_STATE', showId: show.id, setId: 'set-main', revisionId: show.revisionId, generation: 2, transportMode: 'oms', phase: 'ready', selectedCueId: 'opening', currentCueId: '', nextCueId: 'crossfade', currentCueIndex: -1, nextCueIndex: 1, activeVoiceCount: 0, countdownRemainingMs: 0 })
    expect(session.getState()).toMatchObject({ nativeGeneration: 2, selectedCueId: 'opening' })
  })

  it('delegates contextual GO and backward selection to authoritative native state', async () => {
    const engine = new FakeAudioEngine()
    const session = new ShowSession({ engine, now: () => 1000 })
    const show = { ...sampleShow, schemaVersion: 2 as const, sets: sampleShow.sets.map((set) => ({ ...set, transportMode: 'oms' as const })) }
    await session.prepareShow(show, 'set-main', sampleControllerProfiles)
    session.go()
    expect(engine.dispatched[0]).toMatchObject({ type: 'GO' })
    expect(session.getState().currentCueId).toBe('')
    engine.emit({ type: 'RUN_STATE', generation: 2, transportMode: 'oms', phase: 'playing', selectedCueId: 'crossfade', currentCueId: 'crossfade', nextCueId: 'hold', currentCueIndex: 1, nextCueIndex: 2, activeVoiceCount: 2, countdownRemainingMs: 0 })
    expect(session.getState()).toMatchObject({ currentCueId: 'crossfade', selectedCueId: 'crossfade', phase: 'running' })
    session.previous()
    await Promise.resolve()
    expect(engine.dispatched[1]).toMatchObject({ type: 'PREVIOUS' })
    engine.emit({ type: 'RUN_STATE', generation: 3, transportMode: 'oms', phase: 'ready', selectedCueId: 'opening', currentCueId: '', nextCueId: 'crossfade', currentCueIndex: -1, nextCueIndex: 1, activeVoiceCount: 0, countdownRemainingMs: 0 })
    engine.emit({ type: 'RUN_STATE', generation: 2, transportMode: 'oms', phase: 'playing', selectedCueId: 'crossfade', currentCueId: 'crossfade', nextCueId: 'hold', currentCueIndex: 1, nextCueIndex: 2, activeVoiceCount: 2, countdownRemainingMs: 0 })
    expect(session.getState()).toMatchObject({ selectedCueId: 'opening', currentCueId: '', phase: 'ready' })
  })

  it('refuses contextual GO during a running countdown, resumes a paused countdown and bounds delayed commands', async () => {
    const engine = new FakeAudioEngine()
    const session = new ShowSession({ engine })
    const show = { ...sampleShow, schemaVersion: 2 as const, sets: sampleShow.sets.map((set) => ({ ...set, transportMode: 'oms' as const })) }
    await session.prepareShow(show, 'set-main', sampleControllerProfiles)
    engine.emit({ type: 'RUN_STATE', generation: 1, transportMode: 'oms', phase: 'fading', selectedCueId: 'opening', currentCueId: 'opening', nextCueId: 'crossfade', currentCueIndex: 0, nextCueIndex: 1, activeVoiceCount: 0, countdownRemainingMs: 3000 })
    expect(session.go()).toBeNull()
    expect(session.schedule({ type: 'PAUSE' }, -1)).toBeNull()
    expect(session.schedule({ type: 'PAUSE' }, 86_400_001)).toBeNull()
    expect(session.schedule({ type: 'PAUSE' }, 4000)).toBe(1)
    expect(engine.dispatched[0]).toMatchObject({ type: 'SCHEDULE', command: { type: 'PAUSE' }, delayMs: 4000 })
    engine.emit({ type: 'RUN_STATE', generation: 1, transportMode: 'oms', phase: 'paused', selectedCueId: 'opening', currentCueId: 'opening', nextCueId: 'crossfade', currentCueIndex: 0, nextCueIndex: 1, activeVoiceCount: 0, countdownRemainingMs: 3000 })
    expect(session.go()).toBe(2)
    await Promise.resolve()
    expect(engine.dispatched[1]).toMatchObject({ type: 'GO' })
  })
  it('compiles a deeply immutable snapshot but stays explicitly unavailable without native audio', async () => {
    const session = new ShowSession({ engine: null, unavailableReason: 'development client required' })
    const result = await session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.nativePrepared).toBe(false)
    expect(session.getState()).toMatchObject({ phase: 'unavailable', engineAvailable: false, nextCueId: 'opening' })
    expect(Object.isFrozen(result.snapshot)).toBe(true)
    expect(Object.isFrozen(result.snapshot.cueOrder)).toBe(true)
    expect(Object.isFrozen(result.snapshot.cues.opening)).toBe(true)
  })

  it('advances the visible GO pointer only after the native command acknowledgement', async () => {
    const engine = new FakeAudioEngine()
    const session = new ShowSession({ engine, now: () => 1000 })
    await expect(session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)).resolves.toMatchObject({ ok: true, nativePrepared: true })
    const commandId = session.go('touch:go')
    expect(commandId).toBe(1)
    expect(session.getState()).toMatchObject({ currentCueIndex: -1, nextCueId: 'opening' })
    expect(engine.dispatched[0]).toMatchObject({ id: 1, type: 'TRIGGER_CUE', cueId: 'opening' })
    engine.emit({ type: 'ACK', commandId: 1, receivedAtMonotonicMs: 1001 })
    expect(session.getState()).toMatchObject({ currentCueIndex: 0, currentCueId: 'opening', nextCueId: 'crossfade' })
  })

  it('treats native lock-screen GO as notification and never dispatches it twice', async () => {
    const engine = new FakeAudioEngine()
    const session = new ShowSession({ engine })
    await session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)
    engine.emit({ type: 'REMOTE_COMMAND', command: 'GO', cueId: 'opening', handledNatively: true, reason: 'lock-screen' })
    expect(engine.dispatched).toEqual([])
    expect(session.getState()).toMatchObject({ currentCueId: 'opening', nextCueId: 'crossfade' })
  })

  it('does not double-advance when a remote audio voice starts before its GO notification', async () => {
    const engine = new FakeAudioEngine()
    const session = new ShowSession({ engine })
    await session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)
    engine.emit({ type: 'VOICE_START', cueId: 'opening', voiceId: 'remote-opening' })
    expect(session.getState()).toMatchObject({ currentCueIndex: -1, nextCueId: 'opening', activeVoiceCount: 1 })
    engine.emit({ type: 'REMOTE_COMMAND', command: 'GO', cueId: 'opening', handledNatively: true, reason: 'lock-screen' })
    expect(session.getState()).toMatchObject({ currentCueIndex: 0, currentCueId: 'opening', nextCueId: 'crossfade' })
    engine.emit({ type: 'REMOTE_COMMAND', command: 'GO', cueId: 'opening', handledNatively: true, reason: 'duplicate-delivery' })
    expect(session.getState()).toMatchObject({ currentCueIndex: 0, currentCueId: 'opening', nextCueId: 'crossfade' })
  })

  it('does not advance a GO that an urgent panic preempted', async () => {
    const engine = new FakeAudioEngine()
    const session = new ShowSession({ engine })
    await session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)
    expect(session.go('touch:go')).toBe(1)
    expect(session.panic('touch:panic')).toBe(2)
    engine.emit({ type: 'ACK', commandId: 2, receivedAtMonotonicMs: 1002 })
    expect(session.getState()).toMatchObject({ currentCueIndex: -1, pendingCommandIds: [] })
    engine.emit({ type: 'ACK', commandId: 1, receivedAtMonotonicMs: 1001 })
    expect(session.getState()).toMatchObject({ currentCueIndex: -1, currentCueId: '', pendingCommandIds: [] })
    engine.emit({ type: 'ACK', commandId: 1, receivedAtMonotonicMs: 1003 })
    expect(session.getState()).toMatchObject({ currentCueIndex: -1, nextCueId: 'opening' })
  })

  it('reconciles an acknowledgement emitted synchronously during dispatch', async () => {
    const engine = new FakeAudioEngine()
    engine.dispatch = async (command: EngineCommand) => {
      engine.dispatched.push(command)
      engine.emit({ type: 'ACK', commandId: command.id, receivedAtMonotonicMs: 1001 })
    }
    const session = new ShowSession({ engine })
    await session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)
    expect(session.go('touch:go')).toBe(1)
    expect(session.getState()).toMatchObject({ currentCueIndex: 0, currentCueId: 'opening', pendingCommandIds: [] })
  })

  it('refuses a second GO while native receipt of the first remains uncertain', async () => {
    const engine = new FakeAudioEngine()
    const session = new ShowSession({ engine })
    await session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)
    expect(session.go('touch:go-1')).toBe(1)
    expect(session.go('touch:go-2')).toBeNull()
    expect(engine.dispatched).toHaveLength(1)
    expect(session.getState()).toMatchObject({ currentCueIndex: -1, pendingCommandIds: [1] })
  })

  it('dispatches panic immediately and clears queued or in-flight GO bookkeeping', async () => {
    let release!: () => void
    let first = true
    const gate = new Promise<void>((resolve) => { release = resolve })
    const engine = new FakeAudioEngine()
    engine.dispatch = async (command: EngineCommand) => {
      engine.dispatched.push(command)
      if (first) { first = false; await gate }
    }
    const session = new ShowSession({ engine })
    await session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)

    expect(session.triggerHit('reveal', 'hit')).toBe(1)
    expect(session.go('go')).toBe(2)
    expect(session.getState().pendingCommandIds).toEqual([2])
    expect(session.panic('panic')).toBe(3)
    expect(session.getState()).toMatchObject({ currentCueIndex: -1, pendingCommandIds: [] })
    release()
    await Promise.resolve()
    await Promise.resolve()
    expect(engine.dispatched.map((command) => [command.id, command.type])).toEqual([
      [1, 'TRIGGER_HIT'],
      [3, 'PANIC_FADE'],
    ])

    const inFlightEngine = new FakeAudioEngine()
    let releaseGo!: () => void
    const goGate = new Promise<void>((resolve) => { releaseGo = resolve })
    inFlightEngine.dispatch = async (command: EngineCommand) => {
      inFlightEngine.dispatched.push(command)
      if (command.id === 1) await goGate
    }
    const inFlightSession = new ShowSession({ engine: inFlightEngine })
    await inFlightSession.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)
    expect(inFlightSession.go('go')).toBe(1)
    expect(inFlightSession.panic('panic')).toBe(2)
    expect(inFlightSession.getState().pendingCommandIds).toEqual([])
    expect(inFlightEngine.dispatched.map((command) => command.type)).toEqual(['TRIGGER_CUE', 'PANIC_FADE'])
    inFlightEngine.emit({ type: 'ACK', commandId: 1, receivedAtMonotonicMs: 1001 })
    expect(inFlightSession.getState()).toMatchObject({ currentCueId: '', nextCueId: 'opening', pendingCommandIds: [] })
    releaseGo()
    await Promise.resolve()
  })

  it('never changes only the JavaScript pointer for unsupported previous or skip commands', async () => {
    const engine = new FakeAudioEngine()
    const session = new ShowSession({ engine })
    await session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)
    expect(session.dispatchController({ type: 'SKIP' })).toBeNull()
    expect(session.dispatchController({ type: 'PREVIOUS' })).toBeNull()
    expect(session.getState()).toMatchObject({ currentCueIndex: -1, nextCueIndex: 0 })
    expect(engine.dispatched).toEqual([])
  })

  it('surfaces interruption, safe route loss, capacity refusal, and native faults', async () => {
    const engine = new FakeAudioEngine()
    const session = new ShowSession({ engine })
    await session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)
    engine.emit({ type: 'INTERRUPTION', reason: 'call' })
    expect(session.getState().phase).toBe('interrupted')
    engine.emit({ type: 'ROUTE_CHANGE', previous: 'wired', current: 'speaker', safeStopped: true })
    expect(session.getState()).toMatchObject({ phase: 'interrupted' })
    engine.emit({ type: 'CAPACITY_REFUSAL', cueId: 'opening', activeVoices: 8, limit: 8 })
    expect(session.getState()).toMatchObject({ phase: 'interrupted' })
    engine.emit({ type: 'FAULT', code: 'DECODE', message: 'Unreadable media' })
    expect(session.getState()).toMatchObject({ phase: 'fault', detail: 'DECODE: Unreadable media' })
  })

  it('never overwrites an interruption received during native preparation with ready', async () => {
    const engine = new FakeAudioEngine()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    engine.prepare = async () => {
      engine.emit({ type: 'ROUTE_CHANGE', previous: 'wired', current: 'speaker', safeStopped: true })
      await gate
    }
    const session = new ShowSession({ engine })
    const preparing = session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)
    release()
    await expect(preparing).resolves.toMatchObject({ ok: false })
    expect(session.getState()).toMatchObject({ phase: 'interrupted' })
  })

  it('uses native progress only for the current cue and clears it when advancing', async () => {
    const engine = new FakeAudioEngine()
    const session = new ShowSession({ engine })
    await session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)
    expect(session.go('go-1')).toBe(1)
    engine.emit({ type: 'ACK', commandId: 1, receivedAtMonotonicMs: 1 })
    engine.emit({ type: 'PROGRESS', cueId: 'reveal', positionMs: 50, durationMs: 100 })
    expect(session.getState().progressPositionMs).toBeNull()
    engine.emit({ type: 'PROGRESS', cueId: 'opening', positionMs: 1000, durationMs: 78000 })
    expect(session.getState()).toMatchObject({ progressCueId: 'opening', progressPositionMs: 1000, progressDurationMs: 78000 })
    engine.emit({ type: 'PROGRESS', cueId: 'opening', voiceId: 'same-cue-hit', mainTransport: false, positionMs: 9000, durationMs: 78000 })
    expect(session.getState().progressPositionMs).toBe(1000)
    engine.emit({ type: 'STATE', state: 'fading' })
    expect(session.go('go-2')).toBe(2)
    engine.emit({ type: 'ACK', commandId: 2, receivedAtMonotonicMs: 2 })
    expect(session.getState()).toMatchObject({ currentCueId: 'crossfade', progressCueId: '', progressPositionMs: null })
  })

  it('exhausts the stack without wrapping NEXT back to the opening cue', async () => {
    const engine = new FakeAudioEngine()
    const session = new ShowSession({ engine })
    await session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles)
    for (let index = 0; index < 4; index += 1) {
      const id = session.go(`go-${index}`)
      expect(id).not.toBeNull()
      engine.emit({ type: 'ACK', commandId: id!, receivedAtMonotonicMs: index })
    }
    expect(session.getState()).toMatchObject({ currentCueId: 'finale', nextCueIndex: 4, nextCueId: '' })
    expect(session.go('after-complete')).toBeNull()
  })
})
