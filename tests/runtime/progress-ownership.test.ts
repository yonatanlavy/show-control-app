import type { AudioEngine, EngineCommand, EngineEvent, NativeRunState } from '../../src/audio'
import { sampleControllerProfiles, sampleShow, type RunSnapshot } from '../../src/domain'
import { playbackReadout } from '../../src/runtime/playback-readout'
import { ShowSession } from '../../src/runtime/show-session'

class NativeEvents implements AudioEngine {
  private readonly listeners = new Set<(event: EngineEvent) => void>()
  state!: NativeRunState
  async prepare(snapshot: RunSnapshot) {
    this.state = { type: 'RUN_STATE', generation: 1, showId: snapshot.showId, setId: snapshot.setId, revisionId: snapshot.revisionId,
      transportMode: snapshot.transportMode ?? 'legacyCueStack', phase: 'ready', selectedCueId: 'opening', currentCueId: '', nextCueId: 'bed', currentCueIndex: -1, nextCueIndex: 1, activeVoiceCount: 0, countdownRemainingMs: 0 }
  }
  async dispatch(_command: EngineCommand) { /* This fixture publishes native observations only. */ }
  async shutdown() { /* No native resources in this event fixture. */ }
  getState = async () => this.state
  subscribe(listener: (event: EngineEvent) => void) { this.listeners.add(listener); return { remove: () => this.listeners.delete(listener) } }
  emit(event: EngineEvent) { this.listeners.forEach((listener) => listener(event)) }
}
async function running() {
  const engine = new NativeEvents(); const session = new ShowSession({ engine })
  await session.prepareShow({ ...sampleShow, schemaVersion: 2, sets: sampleShow.sets.map((set) => ({ ...set, transportMode: 'oms' })) }, 'set-main', sampleControllerProfiles)
  engine.state = { ...engine.state, phase: 'playing', currentCueId: 'opening', currentCueIndex: 0, activeVoiceCount: 2 }
  engine.emit(engine.state)
  engine.emit({ type: 'VOICE_START', cueId: 'opening', voiceId: 'main-a', mainTransport: true })
  engine.emit({ type: 'PROGRESS', cueId: 'opening', voiceId: 'main-a', mainTransport: true, positionMs: 6000, durationMs: 20000 })
  expect(session.getState().progressPositionMs).toBe(6000)
  return { engine, session }
}

describe('native progress voice ownership', () => {
  it('clears a retained main clock when native ownership reaches zero and rejects its late progress', async () => {
    const { engine, session } = await running()
    engine.emit({ ...engine.state, phase: 'paused', activeVoiceCount: 1, mainSequenceVoiceCount: 0, hasPendingActions: false })
    expect(session.getState()).toMatchObject({ currentCueId: 'opening', activeVoiceCount: 1, progressPositionMs: null, progressDurationMs: null })
    engine.emit({ type: 'PROGRESS', cueId: 'opening', voiceId: 'main-a', mainTransport: true, positionMs: 7000, durationMs: 20000 })
    expect(playbackReadout(session.getState()).kind).toBe('unknown')
    expect(session.getState().progressPositionMs).toBeNull()
  })
  it('clears ended outgoing progress when a Hit keeps the delayed transition alive', async () => {
    const { engine, session } = await running()
    engine.emit({ ...engine.state, phase: 'fading', countdownRemainingMs: 1800 })
    engine.emit({ type: 'VOICE_END', cueId: 'opening', voiceId: 'main-a', mainTransport: true })
    engine.emit({ ...engine.state, phase: 'fading', countdownRemainingMs: 1500, activeVoiceCount: 1 })
    expect(session.getState()).toMatchObject({ currentCueId: 'opening', activeVoiceCount: 1, progressCueId: '', progressPositionMs: null, progressDurationMs: null })
    expect(playbackReadout(session.getState()).kind).toBe('unknown')
  })
  it('does not let an independent same-cue Hit erase main progress', async () => {
    const { engine, session } = await running()
    engine.emit({ type: 'VOICE_END', cueId: 'opening', voiceId: 'same-cue-hit', mainTransport: false })
    expect(session.getState().progressPositionMs).toBe(6000)
  })
  it('preserves replacement progress when an older main voice of the same cue ends', async () => {
    const { engine, session } = await running()
    engine.emit({ type: 'VOICE_START', cueId: 'opening', voiceId: 'main-b', mainTransport: true })
    expect(session.getState().progressPositionMs).toBeNull()
    engine.emit({ type: 'PROGRESS', cueId: 'opening', voiceId: 'main-b', mainTransport: true, positionMs: 2000, durationMs: 20000 })
    engine.emit({ type: 'VOICE_END', cueId: 'opening', voiceId: 'main-a', mainTransport: true })
    expect(session.getState().progressPositionMs).toBe(2000)
    engine.emit({ type: 'VOICE_END', cueId: 'opening', voiceId: 'main-b', mainTransport: true })
    expect(session.getState().progressPositionMs).toBeNull()
  })
  it('clears unidentified progress only for an explicitly identified main end', async () => {
    const { engine, session } = await running()
    engine.emit({ type: 'PROGRESS', cueId: 'opening', mainTransport: true, positionMs: 3000, durationMs: 20000 })
    engine.emit({ type: 'VOICE_END', cueId: 'opening', voiceId: 'ambiguous-end' })
    expect(session.getState().progressPositionMs).toBe(3000)
    engine.emit({ type: 'VOICE_END', cueId: 'opening', voiceId: 'main-without-progress-id', mainTransport: true })
    expect(session.getState().progressPositionMs).toBeNull()
  })
})
