import type { AudioEngine, EngineCommand, EngineEvent, NativeRunState, Subscription } from '../../src/audio'
import { sampleControllerProfiles, sampleShow, type RunSnapshot } from '../../src/domain'
import { ShowSession } from '../../src/runtime/show-session'
import { playbackReadout } from '../../src/runtime/playback-readout'

class RootEvents implements AudioEngine {
  readonly commands: EngineCommand[] = []
  private listeners = new Set<(event: EngineEvent) => void>()
  state!: NativeRunState
  rejection: unknown = null
  async prepare(snapshot: RunSnapshot) {
    this.state = { type: 'RUN_STATE', generation: 4, showId: snapshot.showId, setId: snapshot.setId, revisionId: snapshot.revisionId,
      transportMode: 'oms', phase: 'playing', selectedCueId: 'root-group', currentCueId: 'root-group', nextCueId: 'opening',
      currentCueIndex: 0, nextCueIndex: 1, activeVoiceCount: 2, mainSequenceVoiceCount: 1, hasPendingActions: true, countdownRemainingMs: 0 }
  }
  async dispatch(command: EngineCommand) {
    this.commands.push(command)
    if (this.rejection) { const failure = this.rejection; this.rejection = null; throw failure }
  }
  async shutdown() { /* Native resources are exercised by installed integration checks. */ }
  subscribe(listener: (event: EngineEvent) => void): Subscription { this.listeners.add(listener); return { remove: () => this.listeners.delete(listener) } }
  emit(event: EngineEvent) { for (const listener of this.listeners) listener(event) }
}
async function grouped() {
  const engine = new RootEvents()
  const session = new ShowSession({ engine })
  const show = { ...sampleShow, schemaVersion: 2 as const, cues: { ...sampleShow.cues,
    'root-group': { id: 'root-group', name: 'Ordered group', type: 'group' as const, tags: [], children: [{ cueId: 'bed', offsetMs: 0 }] } },
  sets: sampleShow.sets.map((set) => set.id === 'set-main' ? { ...set, transportMode: 'oms' as const, cueOrder: ['root-group', 'opening'] } : set) }
  await session.prepareShow(show, 'set-main', sampleControllerProfiles)
  engine.emit(engine.state)
  return { engine, session }
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

describe('recoverable native root admission', () => {
  it('retains the group, active Hits, pending children and an unknown group clock after refusal; retry is explicit', async () => {
    const { engine, session } = await grouped()
    expect(session.go()).toBe(1)
    engine.emit({ ...engine.state, phase: 'fading' })
    engine.emit({ type: 'TRANSITION_REFUSED', code: 'DECODE_FAILED', message: 'Incoming audio failed preparation', generation: 4 })
    engine.emit(engine.state)
    expect(session.getState()).toMatchObject({ phase: 'running', currentCueId: 'root-group', selectedCueId: 'root-group', activeVoiceCount: 2,
      mainSequenceVoiceCount: 1, hasPendingActions: true, pendingCommandIds: [] })
    expect(playbackReadout(session.getState()).kind).toBe('unknown')
    await settle()
    expect(engine.commands).toHaveLength(1)
    expect(session.go()).toBe(2)
    await settle()
    expect(engine.commands.map((command) => command.type)).toEqual(['GO', 'GO'])
  })
  it('recognizes only the native recoverable code and leaves ordinary decoder/bridge failures behind the recovery gate', async () => {
    const { engine, session } = await grouped()
    engine.rejection = Object.assign(new Error('Incoming capacity refused'), { code: 'RECOVERABLE_REFUSAL' })
    expect(session.go()).toBe(1)
    await settle()
    expect(session.getState()).toMatchObject({ phase: 'running', currentCueId: 'root-group', pendingCommandIds: [] })
    engine.rejection = new Error('RECOVERABLE_REFUSAL text without trusted native code')
    expect(session.go()).toBe(2)
    await settle()
    expect(session.getState().phase).toBe('fault')
    expect(session.go()).toBeNull()
    expect(session.stopAll()).not.toBeNull()
  })
  it('does not let stale or post-interruption refusal events clear a required recovery', async () => {
    const { engine, session } = await grouped()
    engine.emit({ type: 'TRANSITION_REFUSED', code: 'DECODE_FAILED', message: 'Old root', generation: 3 })
    expect(session.getState().detail).not.toContain('Old root')
    engine.emit({ type: 'INTERRUPTION', reason: 'call' })
    engine.emit({ type: 'TRANSITION_REFUSED', code: 'CAPACITY_REFUSAL', message: 'Late refusal', generation: 4 })
    expect(session.getState()).toMatchObject({ phase: 'interrupted', detail: 'call' })
    expect(session.go()).toBeNull()
  })
  it('reports capacity without discarding native ownership or moving selection', async () => {
    const { engine, session } = await grouped()
    engine.emit({ ...engine.state, activeVoiceCount: 8 })
    engine.emit({ type: 'CAPACITY_REFUSAL', cueId: 'opening', activeVoices: 8, limit: 8 })
    expect(session.getState()).toMatchObject({ phase: 'running', activeVoiceCount: 8, currentCueId: 'root-group', selectedCueId: 'root-group' })
    expect(session.go()).not.toBeNull()
  })
  it('restores native refusal feedback after UI suspension without replaying GO', async () => {
    const { engine, session } = await grouped()
    engine.emit({ ...engine.state, transitionRefusal: { code: 'DECODE_FAILED', message: 'Incoming media was retained for repair' } })
    expect(session.getState()).toMatchObject({ phase: 'running', currentCueId: 'root-group', detail: expect.stringContaining('TRANSITION_REFUSED: DECODE_FAILED') })
    await settle()
    expect(engine.commands).toEqual([])
  })
})
