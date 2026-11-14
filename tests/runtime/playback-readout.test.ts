import { compileRunSnapshot, sampleControllerProfiles, sampleShow, type AudioCue, type ResolvedCue } from '../../src/domain'
import { playbackReadout } from '../../src/runtime/playback-readout'
import { ShowSession, type ShowSessionState } from '../../src/runtime/show-session'

function fixture(): ShowSessionState {
  const show = structuredClone(sampleShow)
  const original = show.cues.opening
  if (original?.type !== 'audio') throw new Error('Audio fixture missing')
  const compiled = compileRunSnapshot({ ...show, cues: { ...show.cues, opening: { ...original, trimInMs: 1000, trimOutMs: 21000, playbackRate: 2 } } }, 'set-main', sampleControllerProfiles)
  if (!compiled.ok) throw new Error('Fixture did not compile')
  return { ...new ShowSession({ engine: null }).getState(), engineAvailable: true, snapshot: compiled.snapshot, phase: 'ready', selectedCueId: 'opening' }
}
function withAudio(state: ShowSessionState, changes: Partial<AudioCue & Pick<ResolvedCue, 'mediaAsset'>>): ShowSessionState {
  const cue = state.snapshot!.cues.opening
  if (cue?.type !== 'audio') throw new Error('Audio fixture missing')
  return { ...state, snapshot: { ...state.snapshot!, cues: { ...state.snapshot!.cues, opening: { ...cue, ...changes } } } }
}
function playing(): ShowSessionState {
  return { ...fixture(), phase: 'running', activeVoiceCount: 1, currentCueId: 'opening', progressCueId: 'opening', progressPositionMs: 6000, progressDurationMs: 20000 }
}

describe('authoritative playback readout', () => {
  it('rejects a retained main clock when native ownership confirms only independent voices remain', () => {
    expect(playbackReadout({ ...playing(), mainSequenceVoiceCount: 0 }).kind).toBe('unknown')
    expect(playbackReadout({ ...playing(), mainSequenceVoiceCount: 1 }).kind).toBe('measured')
    expect(playbackReadout({ ...playing(), mainSequenceVoiceCount: null }).kind).toBe('measured')
  })

  it.each([0.7, 1, 2])('describes the saved trimmed pass at %sx without creating native progress', (rate) => {
    const state = withAudio(fixture(), { playbackRate: rate })
    expect(playbackReadout(state)).toEqual({ kind: 'prepared', positionMs: 0, durationMs: 20000, elapsedMs: 0, remainingMs: 20000 / rate, fraction: 0 })
    expect(state.progressPositionMs).toBeNull(); expect(state.currentCueId).toBe('')
  })
  it('uses default rate and the immutable media ending when trim-out is omitted', () => {
    const state = fixture(); const cue = state.snapshot!.cues.opening
    if (cue?.type !== 'audio' || !cue.mediaAsset) throw new Error('Resolved media missing')
    const audio = { ...cue }; delete audio.playbackRate; delete audio.trimOutMs
    const changed = withAudio(state, audio)
    // Removing optional keys must remove them from the resolved cue, not merge them back.
    const snapshot = { ...changed.snapshot!, cues: { ...changed.snapshot!.cues, opening: audio } }
    expect(playbackReadout({ ...changed, snapshot }).remainingMs).toBe(cue.mediaAsset.durationMs - cue.trimInMs)
  })
  it.each(['running', 'paused', 'fading'] as const)('uses matching native source time during %s, including an outgoing countdown', (phase) => {
    expect(playbackReadout({ ...playing(), phase, countdownRemainingMs: 1800 })).toEqual({ kind: 'measured', positionMs: 6000, durationMs: 20000, elapsedMs: 3000, remainingMs: 7000, fraction: 0.3 })
  })
  it('clamps an end observation and keeps loop clocks relative to the current pass', () => {
    expect(playbackReadout({ ...playing(), progressPositionMs: 21000 })).toMatchObject({ elapsedMs: 10000, remainingMs: 0, fraction: 1 })
    expect(playbackReadout(withAudio(playing(), { endBehavior: 'loop' }))).toMatchObject({ elapsedMs: 3000, remainingMs: 7000 })
  })
  it('keeps the prepared main clock independent of a Hit and ignores its progress', () => {
    expect(playbackReadout({ ...fixture(), activeVoiceCount: 1, progressCueId: 'reveal', progressPositionMs: 9000, progressDurationMs: 10000 })).toMatchObject({ kind: 'prepared', elapsedMs: 0, remainingMs: 10000 })
    expect(playbackReadout({ ...playing(), progressCueId: 'reveal' }).kind).toBe('unknown')
  })
  it('resets a stopped selection from metadata and refuses retained legacy completion progress', () => {
    expect(playbackReadout({ ...fixture(), phase: 'stopped' })).toMatchObject({ kind: 'prepared', elapsedMs: 0, fraction: 0 })
    expect(playbackReadout({ ...playing(), phase: 'ready', activeVoiceCount: 0 }).kind).toBe('unknown')
  })
  it.each(['idle', 'preparing', 'fault', 'interrupted', 'unavailable'] as const)('does not invent a clock in %s', (phase) => {
    expect(playbackReadout({ ...playing(), phase }).kind).toBe('unknown')
  })
  it('rejects unconfirmed inspection, pending starts, silent countdowns and absent selection', () => {
    for (const state of [{ ...fixture(), nativeSessionPending: true }, { ...fixture(), pendingCommandIds: [1] }, { ...fixture(), countdownRemainingMs: 500 }, { ...playing(), activeVoiceCount: 0 }, { ...fixture(), selectedCueId: '' }, { ...fixture(), snapshot: null }]) {
      expect(playbackReadout(state).kind).toBe('unknown')
    }
  })
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])('rejects invalid native positions %s', (position) => {
    expect(playbackReadout({ ...playing(), progressPositionMs: position }).kind).toBe('unknown')
  })
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid native durations %s', (duration) => {
    expect(playbackReadout({ ...playing(), progressDurationMs: duration }).kind).toBe('unknown')
  })
  it.each([0, 0.6, 2.1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid saved rates %s', (rate) => {
    expect(playbackReadout(withAudio(fixture(), { playbackRate: rate })).kind).toBe('unknown')
  })
  it.each([{ trimInMs: -1 }, { trimInMs: Number.NaN }, { trimOutMs: 999 }, { trimOutMs: Number.POSITIVE_INFINITY }, { trimOutMs: 99999999 }])('does not measure invalid saved trim %j', (changes) => {
    expect(playbackReadout(withAudio(fixture(), changes)).kind).toBe('unknown')
  })
})
