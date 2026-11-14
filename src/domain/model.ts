export type Id = string;
export type TransportMode = 'legacyCueStack' | 'oms';
export type AppLocale = 'en' | 'he' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ru' | 'ja' | 'ar';
export type StageTheme = 'darkBlue' | 'purpleNight' | 'cobra';
export type FadeCurve = 'linear' | 'smooth' | 'equalPower';
export type EndBehavior = 'stopAndReadyNext' | 'autoFollow' | 'loop';
export type CueSelector =
  | { kind: 'all' }
  | { kind: 'cueIds'; cueIds: readonly Id[] }
  | { kind: 'tags'; tags: readonly string[] };

export interface MediaAsset {
  readonly id: Id;
  readonly checksumSha256: string;
  readonly localUri: string;
  readonly bytes: number;
  readonly durationMs: number;
  readonly codec: string;
  readonly channels: number;
  readonly sampleRate: number;
}

interface CueBase {
  readonly id: Id;
  readonly name: string;
  readonly colorToken?: string;
  readonly notes?: string;
  readonly tags: readonly string[];
}

export interface AudioCue extends CueBase {
  readonly type: 'audio';
  readonly mediaAssetId: Id;
  readonly trimInMs: number;
  readonly trimOutMs?: number;
  readonly gainDb: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  readonly fadeCurve: FadeCurve;
  readonly preWaitMs: number;
  readonly endBehavior: EndBehavior;
  readonly playbackRate?: number;
  readonly autoPlay?: boolean;
  readonly crossfadeEnabled?: boolean;
  readonly crossfadeMs?: number;
  readonly artworkAssetId?: Id;
  readonly visualAssetId?: Id;
}

export interface VisualAsset {
  readonly id: Id;
  readonly kind: 'image' | 'video';
  readonly checksumSha256: string;
  readonly localUri: string;
  readonly bytes: number;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly durationMs?: number;
}

export type VoiceAction =
  | { readonly type: 'GO' | 'PAUSE' | 'RESUME' | 'STOP_ALL' | 'PANIC_FADE' }
  | { readonly type: 'PLAY'; readonly cueId: Id };

export interface VoiceRule {
  readonly id: Id;
  readonly phrases: readonly string[];
  readonly locale: AppLocale;
  readonly enabled: boolean;
  readonly cueId?: Id;
  readonly action: VoiceAction;
  readonly delayMs: number;
}

export interface GroupChild {
  readonly cueId: Id;
  readonly offsetMs: number;
}

export interface GroupCue extends CueBase {
  readonly type: 'group';
  readonly children: readonly GroupChild[];
}

export interface FadeCue extends CueBase {
  readonly type: 'fade';
  readonly selector: CueSelector;
  readonly durationMs: number;
  readonly curve: FadeCurve;
  readonly stopAtEnd: boolean;
}

export interface StopCue extends CueBase {
  readonly type: 'stop';
  readonly selector: CueSelector;
}

export interface WaitCue extends CueBase {
  readonly type: 'wait';
  readonly durationMs: number;
  readonly continue: 'manual' | 'auto';
}

export type Cue = AudioCue | GroupCue | FadeCue | StopCue | WaitCue;

export interface ShowSet {
  readonly routineText?: string;
  readonly id: Id;
  readonly name: string;
  readonly cueOrder: readonly Id[];
  readonly hitCueIds: readonly Id[];
  readonly transportMode?: TransportMode;
}

export interface Show {
  readonly id: Id;
  readonly revisionId: Id;
  readonly name: string;
  readonly updatedAt: string;
  readonly sets: readonly ShowSet[];
  readonly cues: Readonly<Record<Id, Cue>>;
  readonly media: Readonly<Record<Id, MediaAsset>>;
  readonly controllerProfileId?: Id;
  readonly panicFadeMs: number;
  readonly schemaVersion?: 1 | 2;
  readonly visualAssets?: Readonly<Record<Id, VisualAsset>>;
  readonly fallbackVisualAssetId?: Id;
  readonly voiceRules?: readonly VoiceRule[];
}

export interface ControllerBinding {
  readonly inputKey: string;
  readonly adapterId?: string;
  readonly deviceId?: string;
  readonly command: ControllerCommand;
}

export interface ControllerProfile {
  readonly id: Id;
  readonly name: string;
  readonly bindings: readonly ControllerBinding[];
}

export type ControllerCommand =
  | { type: 'GO' }
  | { type: 'PANIC_FADE' }
  | { type: 'PAUSE_RESUME' }
  | { type: 'REPLAY' }
  | { type: 'PREVIOUS' }
  | { type: 'SKIP' }
  | { type: 'STOP_ALL' }
  | { type: 'PLAY' | 'SELECT'; cueId: Id }
  | { type: 'PAUSE' | 'RESUME' }
  | { type: 'TRIGGER_HIT'; cueId: Id };

export type ResolvedCue = Cue & { readonly mediaAsset?: MediaAsset };

export interface RunSnapshot {
  readonly schemaVersion: 1 | 2;
  readonly transportMode?: TransportMode;
  readonly revisionId: Id;
  readonly showId: Id;
  readonly showName: string;
  readonly setId: Id;
  readonly setName: string;
  readonly cues: Readonly<Record<Id, ResolvedCue>>;
  readonly cueOrder: readonly Id[];
  readonly hitCueIds: readonly Id[];
  readonly media: readonly MediaAsset[];
  readonly voiceLimit: 8;
  readonly panicFadeMs: number;
  readonly controllerProfile?: ControllerProfile;
  readonly visualAssets?: Readonly<Record<Id, VisualAsset>>;
  readonly fallbackVisualAssetId?: Id;
  readonly voiceRules?: readonly VoiceRule[];
}
