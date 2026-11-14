import type { ControllerProfile, Show } from './model';

export const sampleControllerProfiles: readonly ControllerProfile[] = [{
  id: 'profile-stage',
  name: 'Stage two-button',
  bindings: [
    { inputKey: 'button-1', command: { type: 'GO' } },
    { inputKey: 'button-2', command: { type: 'PANIC_FADE' } },
  ],
}];

export const sampleShow: Show = {
  id: 'show-demo',
  revisionId: 'rev-1',
  name: 'Theatre 45',
  updatedAt: '2026-08-12T00:00:00.000Z',
  panicFadeMs: 2000,
  controllerProfileId: 'profile-stage',
  media: {
    'media-open': { id: 'media-open', checksumSha256: '0'.repeat(64), localUri: 'file:///demo/opening.wav', bytes: 1, durationMs: 78000, codec: 'wav', channels: 2, sampleRate: 48000 },
    'media-bed': { id: 'media-bed', checksumSha256: '1'.repeat(64), localUri: 'file:///demo/bed.m4a', bytes: 1, durationMs: 112000, codec: 'm4a', channels: 2, sampleRate: 48000 },
    'media-hit': { id: 'media-hit', checksumSha256: '2'.repeat(64), localUri: 'file:///demo/hit.wav', bytes: 1, durationMs: 4200, codec: 'wav', channels: 2, sampleRate: 48000 },
  },
  cues: {
    opening: { id: 'opening', name: 'House to stage', type: 'audio', tags: ['program'], mediaAssetId: 'media-open', trimInMs: 0, trimOutMs: 78000, gainDb: -2, fadeInMs: 1200, fadeOutMs: 1800, fadeCurve: 'smooth', preWaitMs: 0, endBehavior: 'stopAndReadyNext' },
    bed: { id: 'bed', name: 'Tension bed', type: 'audio', tags: ['program', 'bed'], mediaAssetId: 'media-bed', trimInMs: 0, trimOutMs: 112000, gainDb: -5, fadeInMs: 900, fadeOutMs: 2000, fadeCurve: 'equalPower', preWaitMs: 0, endBehavior: 'stopAndReadyNext' },
    reveal: { id: 'reveal', name: 'Reveal hit', type: 'audio', tags: ['hit'], mediaAssetId: 'media-hit', trimInMs: 0, trimOutMs: 4200, gainDb: 0, fadeInMs: 0, fadeOutMs: 250, fadeCurve: 'smooth', preWaitMs: 0, endBehavior: 'stopAndReadyNext' },
    crossfade: { id: 'crossfade', name: 'Bed and reveal', type: 'group', tags: ['transition'], children: [{ cueId: 'bed', offsetMs: 0 }, { cueId: 'reveal', offsetMs: 1600 }] },
    hold: { id: 'hold', name: 'Wait for participant', type: 'wait', tags: ['manual'], durationMs: 0, continue: 'manual' },
    finale: { id: 'finale', name: 'Finale fade', type: 'fade', tags: ['program'], selector: { kind: 'all' }, durationMs: 3500, curve: 'smooth', stopAtEnd: true },
  },
  sets: [{ id: 'set-main', name: 'Main show', cueOrder: ['opening', 'crossfade', 'hold', 'finale'], hitCueIds: ['reveal'] }],
};
