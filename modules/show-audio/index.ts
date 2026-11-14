import { requireOptionalNativeModule } from 'expo';
import type { EngineCommand, EngineEvent, NativeRunState, SessionPurpose, Subscription } from '../../src/audio/contracts';
import type { AppLocale, ResolvedCue, RunSnapshot } from '../../src/domain';
import type { BackgroundReliabilityStatus, BackgroundSettingsTarget, SettingsOpenResult } from '../../src/platform/background-reliability';
export interface NativeMediaProbe { readonly durationMs: number; readonly codec: string; readonly channels: number; readonly sampleRate: number }

type RawModule = {
  prepare(snapshotJson: string): Promise<void>;
  dispatch(commandJson: string): Promise<void>;
  dispatchUrgent?(commandJson: string): Promise<void>;
  shutdown(): Promise<void>;
  getState(): Promise<NativeRunState>;
  getPreparedSession?(): Promise<{ snapshotJson: string; state: NativeRunState; commandIdWatermark: number } | null>;
  getBackgroundReliability?(): Promise<BackgroundReliabilityStatus>;
  openBackgroundSettings?(target: BackgroundSettingsTarget): Promise<SettingsOpenResult>;
  dispatchSemantic(commandJson: string): Promise<void>;
  probeMedia(uri: string): Promise<NativeMediaProbe>;
  sha256File(uri: string): Promise<string>;
  waveform(uri: string, bucketCount: number): Promise<readonly number[]>;
  previewCue(cueJson: string, positionMs: number, initialPaused: boolean): Promise<void>;
  seekPreview(positionMs: number): Promise<void>;
  pausePreview(): Promise<void>;
  resumePreview(): Promise<void>;
  stopPreview(): Promise<void>;
  addListener(eventName: 'onEngineEvent', listener: (event: EngineEvent) => void): Subscription;
};

let raw: RawModule | null = null;
let loadFailure: unknown;
// Captured into the next native preparation only. This never changes a live
// owner's language, device locale, transport, or persisted song data.
let presentationLocale: AppLocale | undefined;

try {
  raw = requireOptionalNativeModule<RawModule>('ShowAudio');
} catch (error) {
  loadFailure = error;
}

export type ShowAudioAvailability =
  | { readonly available: true }
  | { readonly available: false; readonly reason: string };

export function getShowAudioAvailability(): ShowAudioAvailability {
  if (raw) return { available: true };
  const detail = loadFailure instanceof Error ? ` ${loadFailure.message}` : '';
  return {
    available: false,
    reason: `ShowAudio is unavailable. Build the native development client; Expo Go, Jest, and web are unsupported.${detail}`,
  };
}

function required(): RawModule {
  if (!raw) {
    const availability = getShowAudioAvailability();
    throw new Error(availability.available ? 'ShowAudio is unavailable.' : availability.reason);
  }
  return raw;
}

export default {
  availability: getShowAudioAvailability,
  configurePresentationLocale: (locale: AppLocale) => { presentationLocale = locale; },
  prepare: (snapshot: RunSnapshot, sessionPurpose: SessionPurpose = 'performance') => required().prepare(JSON.stringify({ ...snapshot, sessionPurpose, presentationLocale })),
  dispatch: (command: EngineCommand) => required().dispatch(JSON.stringify(command)),
  dispatchUrgent: (command: EngineCommand) => {
    const native = required();
    return native.dispatchUrgent
      ? native.dispatchUrgent(JSON.stringify(command))
      : native.dispatch(JSON.stringify(command));
  },
  shutdown: () => required().shutdown(),
  getState: () => required().getState(),
  getPreparedSession: () => required().getPreparedSession?.() ?? Promise.resolve(null),
  getBackgroundReliability: () => {
    const native = required();
    if (!native.getBackgroundReliability) throw new Error('Background status requires the updated native app.');
    return native.getBackgroundReliability();
  },
  openBackgroundSettings: (target: BackgroundSettingsTarget) => {
    const native = required();
    if (!native.openBackgroundSettings) throw new Error('System settings shortcuts require the updated native app.');
    return native.openBackgroundSettings(target);
  },
  dispatchSemantic: (command: {type: string; cueId?: string; delayMs?: number; eventId?: string; generation?: number; capturedCueId?: string}) => required().dispatchSemantic(JSON.stringify(command)),
  probeMedia: (uri: string) => required().probeMedia(uri),
  sha256File: (uri: string) => required().sha256File(uri),
  hashFile: (uri: string) => required().sha256File(uri),
  waveform: (uri: string, bucketCount = 1024) => required().waveform(uri, bucketCount),
  previewCue: (cue: ResolvedCue, positionMs = cue.type === 'audio' ? cue.trimInMs : 0, initialPaused = false) => required().previewCue(JSON.stringify(cue), positionMs, initialPaused),
  seekPreview: (positionMs: number) => required().seekPreview(positionMs),
  pausePreview: () => required().pausePreview(),
  resumePreview: () => required().resumePreview(),
  stopPreview: () => required().stopPreview(),
  addListener: (listener: (event: EngineEvent) => void) => required().addListener('onEngineEvent', listener),
};
