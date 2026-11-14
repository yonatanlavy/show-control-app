import type { CueSelector, Id, RunSnapshot } from '../domain';

export type EngineCommand =
  | { readonly id: number; readonly type: 'GO' | 'PLAY' | 'PREVIOUS' | 'SKIP' | 'REPLAY' }
  | { readonly id: number; readonly type: 'SELECT' | 'START_SELECTED'; readonly cueId: Id }
  | { readonly id: number; readonly type: 'SCHEDULE'; readonly command: { readonly type: string; readonly cueId?: Id }; readonly delayMs: number }
  | { readonly id: number; readonly type: 'TRIGGER_CUE' | 'TRIGGER_GROUP' | 'TRIGGER_HIT'; readonly cueId: Id }
  | { readonly id: number; readonly type: 'PAUSE' | 'RESUME' | 'PANIC_FADE' | 'STOP_ALL' }
  | { readonly id: number; readonly type: 'FADE'; readonly selector: CueSelector; readonly durationMs: number; readonly stopAtEnd: boolean }
  | { readonly id: number; readonly type: 'STOP'; readonly selector: CueSelector }
  | { readonly id: number; readonly type: 'SEEK_REHEARSAL'; readonly cueId: Id; readonly positionMs: number };

export type EngineEvent =
  | NativeRunState
  | NativePreviewState
  /** The native engine has semantically accepted this command. Rejected commands never ACK. */
  | { readonly type: 'ACK'; readonly commandId: number; readonly receivedAtMonotonicMs: number }
  | { readonly type: 'VOICE_START' | 'VOICE_END'; readonly cueId: Id; readonly voiceId: string; readonly mainTransport?: boolean }
  | { readonly type: 'STATE'; readonly state: 'ready' | 'playing' | 'paused' | 'fading' | 'stopped' }
  // Native progress is cue-relative source time; editor seek/preview inputs are absolute source time.
  | { readonly type: 'PROGRESS'; readonly cueId: Id; readonly positionMs: number; readonly durationMs: number; readonly voiceId?: string; readonly mainTransport?: boolean }
  | { readonly type: 'INTERRUPTION'; readonly reason: string }
  | { readonly type: 'ROUTE_CHANGE'; readonly previous: string; readonly current: string; readonly safeStopped: boolean }
  | {
      readonly type: 'REMOTE_COMMAND';
      readonly command: 'GO';
      /**
       * Native remote controls perform their transport action before emitting
       * this notification. JavaScript must update its view of the run only and
       * must never dispatch the command a second time.
       */
      readonly handledNatively: true;
      /** The exact ordered cue accepted by the native run pointer. */
      readonly cueId: Id;
      readonly reason?: string;
    }
  | {
      readonly type: 'REMOTE_COMMAND';
      readonly command: 'PAUSE_RESUME';
      readonly handledNatively?: true;
      readonly reason?: string;
    }
  | { readonly type: 'CAPACITY_REFUSAL'; readonly cueId: Id; readonly activeVoices: number; readonly limit: 8 }
  /** Incoming preparation was refused without disturbing the outgoing root. */
  | { readonly type: 'TRANSITION_REFUSED'; readonly code: string; readonly message: string; readonly cueId?: Id; readonly generation?: number; readonly monotonicMs?: number }
  /** Isolated editor audition failure; it must never alter the armed transport. */
  | { readonly type: 'PREVIEW_ERROR'; readonly code: string; readonly message: string; readonly generation?: number; readonly cueId?: Id }
  | { readonly type: 'FAULT'; readonly code: string; readonly message: string };

export interface Subscription { remove(): void }
export type SessionPurpose = 'performance' | 'rehearsal';

/** Isolated audition state, never a Run transition or an audience-display event. */
export interface NativePreviewState {
  readonly type: 'PREVIEW_STATE';
  readonly generation: number;
  readonly cueId: Id;
  readonly phase: 'playing' | 'paused' | 'stopped';
  readonly positionMs: number;
  readonly trimInMs: number;
  readonly trimOutMs: number;
}

export interface NativeRunState {
  readonly type: 'RUN_STATE';
  readonly generation: number;
  readonly showId?: Id;
  readonly setId?: Id;
  readonly revisionId?: Id;
  readonly transportMode: 'legacyCueStack' | 'oms';
  readonly sessionPurpose?: SessionPurpose;
  readonly phase: 'ready' | 'playing' | 'paused' | 'fading' | 'stopped' | 'interrupted';
  readonly selectedCueId: Id;
  readonly currentCueId: Id;
  readonly nextCueId: Id;
  readonly currentCueIndex: number;
  readonly nextCueIndex: number;
  readonly activeVoiceCount: number;
  /** Scheduled/suspended native actions or reserved audio starts; absent on older bridges. */
  readonly hasPendingActions?: boolean;
  /** Active ordered-sequence voices, including group children and crossfade tails. */
  readonly mainSequenceVoiceCount?: number;
  /** Retained natively so foreground reconciliation can explain a refused next cue. */
  readonly transitionRefusal?: { readonly code: string; readonly message: string } | null;
  readonly countdownRemainingMs: number;
  readonly playbackRate?: number;
}

/** One atomic, read-only observation of the surviving native owner. */
export interface PreparedNativeSession {
  readonly snapshotJson: string;
  readonly state: NativeRunState;
  /** New bridge commands must remain above all IDs already admitted natively. */
  readonly commandIdWatermark: number;
}

export interface AudioEngine {
  prepare(snapshot: RunSnapshot, sessionPurpose?: SessionPurpose): Promise<void>;
  dispatch(command: EngineCommand): Promise<void>;
  /** Safety-only path that must not wait behind an ordinary bridge dispatch. */
  dispatchUrgent?(command: EngineCommand): Promise<void>;
  subscribe(listener: (event: EngineEvent) => void): Subscription;
  shutdown(): Promise<void>;
  getState?(): Promise<NativeRunState>;
  getPreparedSession?(): Promise<PreparedNativeSession | null>;
}

export type EngineCommandWithoutId = EngineCommand extends infer Command
  ? Command extends { readonly id: number }
    ? Omit<Command, 'id'>
    : never
  : never;
