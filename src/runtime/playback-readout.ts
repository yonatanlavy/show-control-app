import type { ShowSessionState } from './show-session'

export type PlaybackReadout = {
  readonly kind: 'unknown' | 'prepared' | 'measured'
  /** Position and duration remain cue-relative source time. */
  readonly positionMs: number | null
  readonly durationMs: number | null
  /** Display clocks are real time at the saved playback rate. */
  readonly elapsedMs: number | null
  readonly remainingMs: number | null
  readonly fraction: number | null
}

const unknown: PlaybackReadout = Object.freeze({ kind: 'unknown', positionMs: null, durationMs: null, elapsedMs: null, remainingMs: null, fraction: null })

/** A read-only projection: metadata can describe a prepared pass, never audible position. */
export function playbackReadout(state: ShowSessionState): PlaybackReadout {
  if (state.nativeSessionPending || !state.snapshot || !['ready', 'stopped', 'running', 'paused', 'fading'].includes(state.phase)) return unknown
  const cueId = state.currentCueId || state.selectedCueId
  const cue = state.snapshot.cues[cueId]
  if (cue?.type !== 'audio') return unknown
  const rate = cue.playbackRate ?? 1
  if (!Number.isFinite(rate) || rate < 0.7 || rate > 2) return unknown

  const position = state.progressPositionMs
  const duration = state.progressDurationMs
  // An incoming delay does not invalidate the outgoing voice's measurements.
  if (['running', 'paused', 'fading'].includes(state.phase) && state.mainSequenceVoiceCount !== 0 && state.activeVoiceCount > 0 && state.currentCueId === cueId && state.progressCueId === cueId &&
      position !== null && duration !== null && Number.isFinite(position) && Number.isFinite(duration) && position >= 0 && duration > 0) {
    const bounded = Math.min(position, duration)
    return { kind: 'measured', positionMs: bounded, durationMs: duration, elapsedMs: bounded / rate, remainingMs: (duration - bounded) / rate, fraction: bounded / duration }
  }

  // A retained legacy current cue may have finished. Do not invent its final
  // position, or present a queued command/countdown as a fresh selected start.
  if (!['ready', 'stopped'].includes(state.phase) || state.currentCueId || state.selectedCueId !== cueId || state.countdownRemainingMs !== 0 || state.pendingCommandIds.length) return unknown
  const sourceDuration = cue.mediaAsset?.durationMs
  const trimEnd = cue.trimOutMs ?? sourceDuration
  if (sourceDuration === undefined || !Number.isFinite(sourceDuration) || sourceDuration <= 0 || !Number.isFinite(cue.trimInMs) || cue.trimInMs < 0 ||
      trimEnd === undefined || !Number.isFinite(trimEnd) || trimEnd > sourceDuration || trimEnd <= cue.trimInMs) return unknown
  const playable = trimEnd - cue.trimInMs
  return { kind: 'prepared', positionMs: 0, durationMs: playable, elapsedMs: 0, remainingMs: playable / rate, fraction: 0 }
}
