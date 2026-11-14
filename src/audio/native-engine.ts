import type { AudioEngine, EngineCommand, EngineEvent, SessionPurpose, Subscription } from './contracts';
import type { RunSnapshot } from '../domain';
import ShowAudio from '../../modules/show-audio';

export type NativeAudioEngineResolution =
  | { readonly available: true; readonly engine: AudioEngine }
  | { readonly available: false; readonly reason: string };

export class NativeAudioEngine implements AudioEngine {
  prepare(snapshot: RunSnapshot, sessionPurpose: SessionPurpose = 'performance'): Promise<void> { return ShowAudio.prepare(snapshot, sessionPurpose); }
  dispatch(command: EngineCommand): Promise<void> { return ShowAudio.dispatch(command); }
  dispatchUrgent(command: EngineCommand): Promise<void> { return ShowAudio.dispatchUrgent(command); }
  subscribe(listener: (event: EngineEvent) => void): Subscription { return ShowAudio.addListener(listener); }
  shutdown(): Promise<void> { return ShowAudio.shutdown(); }
  getState() { return ShowAudio.getState(); }
  getPreparedSession() { return ShowAudio.getPreparedSession(); }
}

export function resolveNativeAudioEngine(): NativeAudioEngineResolution {
  const availability = ShowAudio.availability();
  return availability.available
    ? { available: true, engine: new NativeAudioEngine() }
    : { available: false, reason: availability.reason };
}
