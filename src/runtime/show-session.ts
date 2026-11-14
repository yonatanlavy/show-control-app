import {
  SerializedCommandRouter,
  type AudioEngine,
  type EngineCommand,
  type EngineEvent,
  type NativeRunState,
  type PreparedNativeSession,
  type SessionPurpose,
  type Subscription,
} from '../audio';
import {
  compileRunSnapshot,
  type ControllerCommand,
  type ControllerProfile,
  type Id,
  type RunSnapshot,
  type Show,
} from '../domain';
import { validateLocalShow } from '../domain/validate-show';

export type SessionPhase =
  | 'unavailable'
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'running'
  | 'paused'
  | 'fading'
  | 'stopped'
  | 'interrupted'
  | 'fault';

export interface ShowSessionState {
  /** The native owner is being inspected, or a failed inspection is not yet confirmed silent. */
  readonly nativeSessionPending?: boolean;
  readonly sessionPurpose: SessionPurpose;
  readonly engineAvailable: boolean;
  readonly phase: SessionPhase;
  readonly detail: string;
  readonly snapshot: RunSnapshot | null;
  readonly currentCueIndex: number;
  readonly nextCueIndex: number;
  readonly currentCueId: Id;
  readonly nextCueId: Id;
  readonly selectedCueId: Id;
  readonly countdownRemainingMs: number;
  readonly nativeGeneration: number;
  readonly playbackRate: number;
  readonly activeVoiceCount: number;
  readonly hasPendingActions?: boolean | null;
  readonly mainSequenceVoiceCount?: number | null;
  readonly progressCueId: Id;
  readonly progressPositionMs: number | null;
  readonly progressDurationMs: number | null;
  readonly pendingCommandIds: readonly number[];
  readonly lastEvent: EngineEvent | null;
}

/** Main selection can be Ready while independent native Hits are still active. */
export function canPauseResumeSession(state: Pick<ShowSessionState, 'snapshot' | 'nativeSessionPending' | 'phase' | 'activeVoiceCount' | 'countdownRemainingMs' | 'hasPendingActions'>): boolean {
  return state.snapshot !== null && !state.nativeSessionPending &&
    ['ready', 'running', 'paused', 'fading', 'stopped'].includes(state.phase) &&
    (['running', 'paused', 'fading'].includes(state.phase) || state.activeVoiceCount > 0 || state.countdownRemainingMs > 0 || state.hasPendingActions === true);
}

export function hasOnlyIndependentVoices(state: Pick<ShowSessionState, 'activeVoiceCount' | 'mainSequenceVoiceCount' | 'currentCueId'>): boolean {
  return state.activeVoiceCount > 0 && (state.mainSequenceVoiceCount === 0 || state.mainSequenceVoiceCount == null && !state.currentCueId);
}

/** Missing or invalid optional observations never become reassuring zero/false. */
function nativeWorkObservation(state: NativeRunState): Pick<ShowSessionState, 'hasPendingActions' | 'mainSequenceVoiceCount'> {
  const count = state.mainSequenceVoiceCount;
  return {
    hasPendingActions: typeof state.hasPendingActions === 'boolean' ? state.hasPendingActions : null,
    mainSequenceVoiceCount: typeof count === 'number' && Number.isInteger(count) && count >= 0 && count <= 8 && count <= state.activeVoiceCount ? count : null,
  };
}

export type PrepareShowResult =
  | { readonly ok: true; readonly snapshot: RunSnapshot; readonly nativePrepared: boolean }
  | { readonly ok: false; readonly detail: string };

export interface ShowSessionOptions {
  readonly engine: AudioEngine | null;
  readonly unavailableReason?: string;
  readonly now?: () => number;
}

function cloneAndFreeze<T>(value: T): T {
  const clone = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== 'object' || Object.isFrozen(candidate)) return;
    for (const child of Object.values(candidate as Record<string, unknown>)) freeze(child);
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : 'The native audio engine reported an unknown failure.';
}

function initialState(engineAvailable: boolean, detail: string): ShowSessionState {
  return Object.freeze({
    sessionPurpose: 'performance',
    nativeSessionPending: false,
    engineAvailable,
    phase: engineAvailable ? 'idle' : 'unavailable',
    detail,
    snapshot: null,
    currentCueIndex: -1,
    nextCueIndex: 0,
    currentCueId: '',
    nextCueId: '',
    selectedCueId: '',
    countdownRemainingMs: 0,
    nativeGeneration: 0,
    playbackRate: 1,
    activeVoiceCount: 0,
    hasPendingActions: null,
    mainSequenceVoiceCount: null,
    progressCueId: '',
    progressPositionMs: null,
    progressDurationMs: null,
    pendingCommandIds: Object.freeze([]),
    lastEvent: null,
  });
}

const maxPreparedSnapshotCharacters = 8 * 1024 * 1024;
function restoredSnapshot(json: string): { snapshot: RunSnapshot; purpose: SessionPurpose } {
  if (typeof json !== 'string' || !json.length || json.length > maxPreparedSnapshotCharacters) throw new Error('Native snapshot size is invalid');
  const raw = JSON.parse(json) as RunSnapshot & { sessionPurpose?: SessionPurpose };
  if (!raw || typeof raw !== 'object' || raw.voiceLimit !== 8 || ![1, 2].includes(raw.schemaVersion) ||
      !raw.cues || typeof raw.cues !== 'object' || Array.isArray(raw.cues) || !Array.isArray(raw.media) ||
      !Array.isArray(raw.cueOrder) || !Array.isArray(raw.hitCueIds)) throw new Error('Native snapshot shape is invalid');
  const purpose = raw.sessionPurpose ?? 'performance';
  if (purpose !== 'performance' && purpose !== 'rehearsal') throw new Error('Native session purpose is invalid');
  const media = Object.fromEntries(raw.media.map((asset) => [asset.id, asset]));
  if (Object.keys(media).length !== raw.media.length) throw new Error('Native media identities are duplicated');
  const cues = Object.fromEntries(Object.entries(raw.cues).map(([id, resolved]) => {
    const { mediaAsset, ...cue } = resolved;
    if (cue.type === 'audio' && (!mediaAsset || JSON.stringify(mediaAsset) !== JSON.stringify(media[cue.mediaAssetId]))) throw new Error('Resolved native audio differs from its immutable media');
    return [id, cue];
  }));
  const show: Show = {
    id: raw.showId, revisionId: raw.revisionId, name: raw.showName, updatedAt: 'native-prepared-session', schemaVersion: raw.schemaVersion,
    sets: [{ id: raw.setId, name: raw.setName, cueOrder: raw.cueOrder, hitCueIds: raw.hitCueIds, ...(raw.transportMode ? { transportMode: raw.transportMode } : {}) }],
    cues, media, panicFadeMs: raw.panicFadeMs,
    ...(raw.controllerProfile ? { controllerProfileId: raw.controllerProfile.id } : {}),
    ...(raw.visualAssets ? { visualAssets: raw.visualAssets } : {}),
    ...(raw.fallbackVisualAssetId ? { fallbackVisualAssetId: raw.fallbackVisualAssetId } : {}),
    ...(raw.voiceRules ? { voiceRules: raw.voiceRules } : {}),
  };
  validateLocalShow(show, raw.controllerProfile ? [raw.controllerProfile] : []);
  const compiled = compileRunSnapshot(show, raw.setId, raw.controllerProfile ? [raw.controllerProfile] : []);
  if (!compiled.ok || Object.keys(compiled.snapshot.cues).length !== Object.keys(cues).length) throw new Error('Native snapshot cannot be compiled exactly');
  return { snapshot: compiled.snapshot, purpose };
}

function validateRestoredState(value: PreparedNativeSession, snapshot: RunSnapshot, purpose: SessionPurpose): void {
  const state = value.state;
  const ids = [state?.selectedCueId, state?.currentCueId, state?.nextCueId];
  if (!state || state.type !== 'RUN_STATE' || state.showId !== snapshot.showId || state.setId !== snapshot.setId || state.revisionId !== snapshot.revisionId ||
      (state.sessionPurpose ?? 'performance') !== purpose || state.transportMode !== (snapshot.transportMode ?? 'legacyCueStack') ||
      !['ready', 'playing', 'paused', 'fading', 'stopped', 'interrupted'].includes(state.phase) ||
      !Number.isSafeInteger(state.generation) || state.generation < 0 || !Number.isSafeInteger(value.commandIdWatermark) || value.commandIdWatermark < 0 || value.commandIdWatermark >= Number.MAX_SAFE_INTEGER ||
      !Number.isInteger(state.activeVoiceCount) || state.activeVoiceCount < 0 || state.activeVoiceCount > 8 ||
      state.hasPendingActions !== undefined && typeof state.hasPendingActions !== 'boolean' ||
      state.mainSequenceVoiceCount !== undefined && (!Number.isInteger(state.mainSequenceVoiceCount) || state.mainSequenceVoiceCount < 0 || state.mainSequenceVoiceCount > state.activeVoiceCount) ||
      !Number.isFinite(state.countdownRemainingMs) || state.countdownRemainingMs < 0 || state.countdownRemainingMs > 86_400_000 ||
      !Number.isInteger(state.currentCueIndex) || state.currentCueIndex < -1 || state.currentCueIndex > snapshot.cueOrder.length ||
      !Number.isInteger(state.nextCueIndex) || state.nextCueIndex < 0 || state.nextCueIndex > snapshot.cueOrder.length + 1 ||
      state.playbackRate !== undefined && (!Number.isFinite(state.playbackRate) || state.playbackRate < 0.7 || state.playbackRate > 2) ||
      ids.some((id) => typeof id !== 'string' || id !== '' && !snapshot.cueOrder.includes(id)) ||
      state.nextCueId !== (snapshot.cueOrder[state.nextCueIndex] ?? '')) throw new Error('Native state does not match its immutable snapshot');
}

/**
 * Owns the application-side view of one prepared native run.
 *
 * The class never schedules cue transitions or gain changes. Native engine
 * events are the only clock for playback state, and a relaunch always creates
 * a fresh silent session that must be prepared deliberately.
 */
export class ShowSession {
  private readonly listeners = new Set<(state: ShowSessionState) => void>();
  private readonly activeVoices = new Set<string>();
  private progressVoiceId: string | null = null;
  private readonly pendingMainGo = new Map<number, number>();
  private readonly acknowledgements = new Map<number, Extract<EngineEvent, { type: 'ACK' }>>();
  private readonly router: SerializedCommandRouter | null;
  private engineSubscription: Subscription | null = null;
  private state: ShowSessionState;
  private prepareGeneration = 0;
  private failedPrepareGeneration: number | null = null;
  private acceptingPlaybackCommands = false;
  private playbackRecoveryRequired = false;
  private attaching = false;
  private attachmentEvents: EngineEvent[] = [];
  private attachmentOverflow = false;
  private adoptedNativeVoiceState = false;

  constructor(private readonly options: ShowSessionOptions) {
    const detail = options.engine ? 'The native audio engine has not been prepared.' : (options.unavailableReason ?? 'The native audio engine is unavailable.');
    this.state = initialState(options.engine !== null, detail);
    if (options.engine?.getPreparedSession) this.state = Object.freeze({ ...this.state, phase: 'preparing', nativeSessionPending: true });
    this.router = options.engine
      ? new SerializedCommandRouter(
          options.engine,
          options.now,
          (command, error) => this.handleDispatchError(command, error),
          (commands) => this.handleCancelledCommands(commands),
        )
      : null;
    this.listenToEngine();
  }

  getState(): ShowSessionState {
    return this.state;
  }

  subscribe(listener: (state: ShowSessionState) => void): Subscription {
    this.listeners.add(listener);
    return { remove: () => this.listeners.delete(listener) };
  }

  canAttachPreparedSession(): boolean { return typeof this.options.engine?.getPreparedSession === 'function'; }

  /** Adopt a same-process native owner; never prepare, resume or replay it. */
  async attachPreparedSession(): Promise<boolean> {
    this.listenToEngine();
    if (!this.options.engine?.getPreparedSession) return false;
    const generation = ++this.prepareGeneration;
    this.attaching = true; this.attachmentEvents = []; this.attachmentOverflow = false;
    this.acceptingPlaybackCommands = false; this.playbackRecoveryRequired = false;
    this.router?.invalidatePendingCommands();
    this.patch({ nativeSessionPending: true, phase: 'preparing', detail: 'Inspecting the existing native audio owner.' });
    try {
      const existing = await this.options.engine.getPreparedSession();
      if (generation !== this.prepareGeneration) return false;
      if (this.attachmentOverflow) throw new Error('Native attachment event buffer exceeded its bound');
      if (existing === null) {
        this.attaching = false; this.attachmentEvents = [];
        this.state = initialState(true, 'No prepared native run remains. Prepare deliberately before playback.'); this.notify();
        return false;
      }
      const { snapshot, purpose } = restoredSnapshot(existing.snapshotJson);
      validateRestoredState(existing, snapshot, purpose);
      this.router?.advanceCommandId(existing.commandIdWatermark);
      const buffered = this.attachmentEvents; this.attachmentEvents = []; this.attaching = false;
      this.resetRunTracking();
      this.adoptedNativeVoiceState = true;
      this.patch({ snapshot: cloneAndFreeze(snapshot), sessionPurpose: purpose, phase: 'ready', nativeSessionPending: false, detail: 'The existing native run was restored without replaying audio.' });
      this.handleEngineEvent(existing.state);
      const observedAt = 'monotonicMs' in existing.state && typeof existing.state.monotonicMs === 'number' ? existing.state.monotonicMs : -1;
      for (const event of buffered) {
        const timestamp = 'monotonicMs' in event && typeof event.monotonicMs === 'number' ? event.monotonicMs : -1;
        const safety = ['INTERRUPTION', 'ROUTE_CHANGE', 'FAULT'].includes(event.type);
        // Millisecond equality cannot establish that a generic STATE was newer
        // than the authoritative atomic observation. Native RUN_STATE owns it.
        if (safety || event.type === 'RUN_STATE' && timestamp > observedAt) this.handleEngineEvent(event);
      }
      this.acceptingPlaybackCommands = !this.playbackRecoveryRequired;
      return true;
    } catch (failure) {
      if (generation !== this.prepareGeneration) return false;
      this.attaching = false; this.attachmentEvents = [];
      this.blockPlaybackForRecovery();
      let confirmedSilent = false;
      try { await this.options.engine.shutdown(); confirmedSilent = true; } catch { /* Keep the critical recovery gate closed until an explicit exit succeeds. */ }
      if (generation !== this.prepareGeneration) return false;
      this.patch({ nativeSessionPending: !confirmedSilent, phase: 'fault', snapshot: null, detail: `NATIVE_SESSION_LOST: Existing playback could not be restored: ${errorDetail(failure)}` });
      return false;
    }
  }

  /** Remove this interface's listeners and stale work while the native owner continues. */
  detach(): void {
    this.prepareGeneration += 1; this.attaching = false; this.attachmentEvents = [];
    this.acceptingPlaybackCommands = false; this.router?.invalidatePendingCommands();
    this.engineSubscription?.remove(); this.engineSubscription = null;
    this.pendingMainGo.clear(); this.acknowledgements.clear(); this.listeners.clear();
  }

  private listenToEngine(): void {
    if (!this.engineSubscription) this.engineSubscription = this.options.engine?.subscribe((event) => this.handleEngineEvent(event)) ?? null;
  }

  async prepareShow(show: Show, setId: Id, profiles: readonly ControllerProfile[] = [], sessionPurpose: SessionPurpose = 'performance'): Promise<PrepareShowResult> {
    if (this.attaching || this.state.nativeSessionPending) return { ok: false, detail: 'Wait for the existing native session to be inspected or exited.' };
    this.listenToEngine();
    const generation = ++this.prepareGeneration;
    this.acceptingPlaybackCommands = false;
    this.playbackRecoveryRequired = false;
    this.router?.invalidatePendingCommands();
    this.failedPrepareGeneration = null;
    this.patch({ sessionPurpose });
    const compiled = compileRunSnapshot(show, setId, profiles);
    if (!compiled.ok) {
      const detail = compiled.issues.map((issue) => issue.message).join(' ');
      this.patch({ phase: 'fault', detail, snapshot: null, currentCueIndex: -1, nextCueIndex: 0, currentCueId: '', nextCueId: '' });
      return { ok: false, detail };
    }

    const snapshot = cloneAndFreeze(compiled.snapshot);
    this.resetRunTracking();

    if (!this.options.engine) {
      const detail = this.options.unavailableReason ?? 'The native audio engine is unavailable.';
      this.patch({
        engineAvailable: false,
        phase: 'unavailable',
        detail,
        snapshot,
        nextCueId: snapshot.cueOrder[0] ?? '',
      });
      return { ok: true, snapshot, nativePrepared: false };
    }

    this.patch({
      engineAvailable: true,
      phase: 'preparing',
      detail: 'Preparing local audio in the native engine.',
      snapshot,
      nextCueId: snapshot.cueOrder[0] ?? '',
    });

    try {
      if (sessionPurpose === 'rehearsal') await this.options.engine.prepare(snapshot, sessionPurpose);
      else await this.options.engine.prepare(snapshot);
      if (generation !== this.prepareGeneration) {
        return { ok: false, detail: 'A newer preparation replaced this run.' };
      }
      if (this.failedPrepareGeneration === generation || this.state.phase === 'interrupted' || this.state.phase === 'fault') {
        return { ok: false, detail: this.state.detail };
      }
      this.patch({ phase: 'ready', detail: 'The immutable run snapshot is prepared.' });
      if (snapshot.schemaVersion === 2) await this.reconcile();
      if (generation !== this.prepareGeneration) {
        return { ok: false, detail: 'A newer preparation replaced this run.' };
      }
      const reconciled = this.getState();
      if (this.failedPrepareGeneration === generation || reconciled.phase === 'interrupted' || reconciled.phase === 'fault') {
        return { ok: false, detail: reconciled.detail };
      }
      this.acceptingPlaybackCommands = true;
      return { ok: true, snapshot, nativePrepared: true };
    } catch (error) {
      if (generation !== this.prepareGeneration) {
        return { ok: false, detail: 'A newer preparation replaced this run.' };
      }
      const detail = errorDetail(error);
      this.patch({ phase: 'fault', detail });
      return { ok: false, detail };
    }
  }

  go(inputFingerprint?: string): number | null {
    const snapshot = this.state.snapshot;
    if (snapshot?.schemaVersion === 2) {
      if (!this.canStartCue() && this.state.phase !== 'paused') return null;
      if (snapshot.transportMode === 'oms' && this.state.phase !== 'paused' && (this.state.countdownRemainingMs > 0 || this.state.phase === 'fading')) return null;
      return this.enqueue({ type: 'GO' }, inputFingerprint);
    }
    // Do not queue a second audible transition while receipt of the first is
    // uncertain. This also prevents a panic preemption from leaving a removed
    // lower-priority GO recorded as pending in the application view.
    if (!snapshot || !this.canStartCue() || this.pendingMainGo.size > 0) return null;
    const cueId = snapshot.cueOrder[this.state.nextCueIndex];
    if (!cueId) return null;
    const cue = snapshot.cues[cueId];
    if (!cue) return null;
    const command = cue.type === 'group'
      ? { type: 'TRIGGER_GROUP' as const, cueId }
      : { type: 'TRIGGER_CUE' as const, cueId };
    const commandId = this.enqueue(command, inputFingerprint);
    if (commandId !== null) {
      this.pendingMainGo.set(commandId, this.state.nextCueIndex);
      // Native bridges may deliver the ACK event before their dispatch promise
      // returns to this synchronous caller. Reconcile that event immediately
      // instead of leaving the run permanently pending.
      const earlyAcknowledgement = this.acknowledgements.get(commandId);
      if (earlyAcknowledgement) {
        const cueIndex = this.pendingMainGo.get(commandId);
        this.pendingMainGo.delete(commandId);
        if (cueIndex !== undefined) this.advancePointer(cueIndex, earlyAcknowledgement);
      } else {
        this.publishPendingCommands();
      }
    }
    return commandId;
  }

  panic(inputFingerprint?: string): number | null {
    if (this.state.nativeSessionPending) { void this.exitRun(); return null; }
    return this.enqueue({ type: 'PANIC_FADE' }, inputFingerprint);
  }

  stopAll(inputFingerprint?: string): number | null {
    if (this.state.nativeSessionPending) { void this.exitRun(); return null; }
    return this.enqueue({ type: 'STOP_ALL' }, inputFingerprint);
  }

  pauseResume(inputFingerprint?: string): number | null {
    if (!canPauseResumeSession(this.state)) return null;
    return this.enqueue({ type: this.state.phase === 'paused' ? 'RESUME' : 'PAUSE' }, inputFingerprint);
  }

  replay(inputFingerprint?: string): number | null {
    if (this.state.snapshot?.schemaVersion === 2) return this.enqueue({ type: 'REPLAY' }, inputFingerprint);
    const snapshot = this.state.snapshot;
    const cueId = snapshot?.cueOrder[this.state.currentCueIndex];
    if (!cueId || !snapshot) return null;
    const cue = snapshot.cues[cueId];
    if (!cue) return null;
    return this.enqueue(cue.type === 'group' ? { type: 'TRIGGER_GROUP', cueId } : { type: 'TRIGGER_CUE', cueId }, inputFingerprint);
  }

  triggerHit(cueId: Id, inputFingerprint?: string): number | null {
    // Pause freezes the whole native engine, including independent voices.
    // Refuse before dispatch so a deliberate pause never becomes a playback fault.
    if (this.state.phase === 'paused' || !this.state.snapshot?.hitCueIds.includes(cueId)) return null;
    return this.enqueue({ type: 'TRIGGER_HIT', cueId }, inputFingerprint);
  }

  seekRehearsal(cueId: Id, positionMs: number, inputFingerprint?: string): number | null {
    if (this.state.sessionPurpose !== 'rehearsal' || !Number.isFinite(positionMs) || positionMs < 0 || !this.state.snapshot?.cues[cueId]) return null;
    return this.enqueue({ type: 'SEEK_REHEARSAL', cueId, positionMs }, inputFingerprint);
  }

  dispatchController(command: ControllerCommand, inputFingerprint?: string): number | null {
    switch (command.type) {
      case 'GO': return this.go(inputFingerprint);
      case 'PANIC_FADE': return this.panic(inputFingerprint);
      case 'PAUSE_RESUME': return this.pauseResume(inputFingerprint);
      case 'REPLAY': return this.replay(inputFingerprint);
      case 'PREVIOUS': return this.previous(inputFingerprint);
      // Previous and skip need a native pointer command. Never advance only
      // the React view while the background service owns a different GO index.
      case 'SKIP': return this.skip(inputFingerprint);
      case 'STOP_ALL': return this.stopAll(inputFingerprint);
      case 'TRIGGER_HIT': return this.triggerHit(command.cueId, inputFingerprint);
      case 'SELECT': return this.select(command.cueId, inputFingerprint);
      case 'PLAY': return this.startCue(command.cueId, inputFingerprint);
      case 'PAUSE': return this.enqueue({ type: 'PAUSE' }, inputFingerprint);
      case 'RESUME': return this.enqueue({ type: 'RESUME' }, inputFingerprint);
    }
  }

  previous(inputFingerprint?: string): number | null { return this.state.snapshot?.schemaVersion === 2 ? this.enqueue({ type: 'PREVIOUS' }, inputFingerprint) : null; }
  skip(inputFingerprint?: string): number | null { return this.state.snapshot?.schemaVersion === 2 ? this.enqueue({ type: 'SKIP' }, inputFingerprint) : null; }
  select(cueId: Id, inputFingerprint?: string): number | null { return this.state.snapshot?.cueOrder.includes(cueId) ? this.enqueue({ type: 'SELECT', cueId }, inputFingerprint) : null; }
  startCue(cueId: Id, inputFingerprint?: string): number | null { return this.state.snapshot?.cueOrder.includes(cueId) ? this.enqueue({ type: 'START_SELECTED', cueId }, inputFingerprint) : null; }
  play(inputFingerprint?: string): number | null { return this.enqueue({ type: 'PLAY' }, inputFingerprint); }
  schedule(command: {type: string; cueId?: Id}, delayMs: number): number | null {
    if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 86_400_000) return null;
    return this.enqueue({ type: 'SCHEDULE', command, delayMs });
  }
  async reconcile(): Promise<void> {
    const snapshot = this.state.snapshot; const generation = this.prepareGeneration;
    if (!snapshot || !this.options.engine?.getState || this.state.phase === 'preparing') return;
    let event: NativeRunState;
    try { event = await this.options.engine.getState(); }
    catch (error) {
      if (generation !== this.prepareGeneration || snapshot !== this.state.snapshot) return;
      this.patch({ ...this.blockPlaybackForRecovery(), phase: 'fault', detail: `NATIVE_STATE_UNAVAILABLE: ${errorDetail(error)}` });
      // When playback is uncertain, use the same global priority stop path.
      if (this.state.activeVoiceCount > 0) this.stopAll('reconcile:uncertain');
      throw error;
    }
    if (generation !== this.prepareGeneration || snapshot !== this.state.snapshot) return;
    if (event.type === 'RUN_STATE' && (event.showId !== snapshot.showId || event.setId !== snapshot.setId || event.revisionId !== snapshot.revisionId || (event.sessionPurpose ?? 'performance') !== this.state.sessionPurpose)) {
      const detail = 'NATIVE_SESSION_LOST: The native run is no longer prepared for this revision. Exit and prepare it again.';
      this.activeVoices.clear();
      this.patch({ ...this.blockPlaybackForRecovery(), phase: 'fault', detail, activeVoiceCount: event.activeVoiceCount });
      if (event.activeVoiceCount > 0) this.stopAll('reconcile:replaced');
      throw new Error(detail);
    }
    this.handleEngineEvent(event);
  }

  async shutdown(): Promise<void> {
    this.prepareGeneration += 1;
    this.acceptingPlaybackCommands = false;
    this.attaching = false; this.attachmentEvents = [];
    this.router?.invalidatePendingCommands();
    this.engineSubscription?.remove();
    this.engineSubscription = null;
    this.pendingMainGo.clear();
    this.acknowledgements.clear();
    this.activeVoices.clear();
    if (this.options.engine) {
      try {
        await this.options.engine.shutdown();
      } catch {
        // Teardown cannot safely recover playback. The native implementation is
        // still required to fail silent when its owner is destroyed.
      }
    }
    this.state = initialState(this.options.engine !== null, this.options.engine ? 'The native audio engine is shut down.' : this.state.detail);
    this.notify();
  }

  async exitRun(): Promise<boolean> {
    const generation = ++this.prepareGeneration;
    this.acceptingPlaybackCommands = false;
    this.attaching = false; this.attachmentEvents = [];
    this.router?.invalidatePendingCommands();
    this.failedPrepareGeneration = null;
    this.pendingMainGo.clear();
    this.acknowledgements.clear();
    this.activeVoices.clear();
    if (!this.options.engine) {
      this.state = initialState(false, this.options.unavailableReason ?? 'The native audio engine is unavailable.');
      this.notify();
      return true;
    }
    try {
      await this.options.engine.shutdown();
      if (generation !== this.prepareGeneration) return false;
      this.state = initialState(true, 'The show exited silently. Prepare again before playback.');
      this.notify();
      return true;
    } catch (error) {
      if (generation !== this.prepareGeneration) return false;
      this.patch({ phase: 'fault', detail: `The native engine could not confirm a silent exit: ${errorDetail(error)}` });
      return false;
    }
  }

  private canStartCue(): boolean {
    return ['ready', 'running', 'fading', 'stopped'].includes(this.state.phase) && this.router !== null;
  }

  private enqueue(command: Parameters<SerializedCommandRouter['enqueue']>[0], inputFingerprint?: string): number | null {
    if (!this.router || !this.state.snapshot || this.state.phase === 'preparing' || this.state.phase === 'unavailable') return null;
    if (!this.acceptingPlaybackCommands && command.type !== 'PANIC_FADE' && command.type !== 'STOP_ALL') return null;
    return this.router.enqueue(command, inputFingerprint);
  }

  private handleDispatchError(command: EngineCommand, error: unknown): void {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'RECOVERABLE_REFUSAL') {
      if (this.playbackRecoveryRequired) return;
      this.clearPendingMainGo();
      this.patch({ detail: `TRANSITION_REFUSED: ${errorDetail(error)}`, pendingCommandIds: Object.freeze([]) });
      return;
    }
    this.patch({
      ...this.blockPlaybackForRecovery(),
      phase: 'fault',
      detail: `The native engine rejected ${command.type}: ${errorDetail(error)}`,
    });
  }

  /** A new preparation is the only operation that reopens audible admission. */
  private blockPlaybackForRecovery(): Partial<ShowSessionState> {
    this.acceptingPlaybackCommands = false;
    if (!this.playbackRecoveryRequired) {
      this.playbackRecoveryRequired = true;
      this.router?.invalidatePendingCommands();
    }
    this.pendingMainGo.clear();
    this.acknowledgements.clear();
    return { countdownRemainingMs: 0, hasPendingActions: null, mainSequenceVoiceCount: null, progressCueId: '', progressPositionMs: null, progressDurationMs: null, pendingCommandIds: Object.freeze([]) };
  }

  private handleCancelledCommands(commands: readonly EngineCommand[]): void {
    let changed = false;
    for (const command of commands) changed = this.pendingMainGo.delete(command.id) || changed;
    if (changed) this.publishPendingCommands();
  }

  private handleEngineEvent(event: EngineEvent): void {
    if (event.type === 'PREVIEW_ERROR' || event.type === 'PREVIEW_STATE') return;
    if (this.attaching) { if (this.attachmentEvents.length < 256) this.attachmentEvents.push(event); else this.attachmentOverflow = true; return; }
    const snapshot = this.state.snapshot;
    if (!snapshot) return;
    if (event.type === 'RUN_STATE' && event.sessionPurpose !== undefined && event.sessionPurpose !== this.state.sessionPurpose) return;
    if (snapshot && (
      ('showId' in event && typeof event.showId === 'string' && event.showId !== snapshot.showId) ||
      ('setId' in event && typeof event.setId === 'string' && event.setId !== snapshot.setId) ||
      ('revisionId' in event && typeof event.revisionId === 'string' && event.revisionId !== snapshot.revisionId)
    )) return;
    const eventGeneration = 'generation' in event && typeof event.generation === 'number' ? event.generation : this.state.nativeGeneration;
    if (eventGeneration < this.state.nativeGeneration) return;
    if (this.playbackRecoveryRequired && (
      event.type === 'STATE' || event.type === 'PROGRESS' || event.type === 'VOICE_START' || event.type === 'VOICE_END' || event.type === 'REMOTE_COMMAND' ||
      event.type === 'RUN_STATE' && event.phase !== 'interrupted'
    )) return;
    if (this.state.phase === 'preparing') {
      if (event.type === 'INTERRUPTION' || event.type === 'ROUTE_CHANGE' || event.type === 'CAPACITY_REFUSAL' || event.type === 'FAULT' || event.type === 'RUN_STATE' && event.phase === 'interrupted') {
        this.failedPrepareGeneration = this.prepareGeneration;
      } else {
        this.patch({ lastEvent: event });
        return;
      }
    }

    const progressVoiceEnded = event.type === 'VOICE_END' && event.mainTransport !== false && event.cueId === this.state.currentCueId && event.cueId === this.state.progressCueId &&
      (event.voiceId === this.progressVoiceId || this.progressVoiceId === null && event.mainTransport === true);
    const progressVoiceReplaced = event.type === 'VOICE_START' && event.mainTransport === true && event.cueId === this.state.currentCueId && event.cueId === this.state.progressCueId &&
      this.progressVoiceId !== null && event.voiceId !== this.progressVoiceId;
    switch (event.type) {
      case 'RUN_STATE': {
        if (event.generation < this.state.nativeGeneration) return;
        const work = event.phase === 'interrupted' ? { hasPendingActions: null, mainSequenceVoiceCount: null } : nativeWorkObservation(event);
        this.patch({
          ...(event.phase === 'interrupted' ? this.blockPlaybackForRecovery() : {}),
          ...(event.phase === 'interrupted' && !['interrupted', 'fault'].includes(this.state.phase) ? { detail: 'Native playback was interrupted. Exit and prepare the run again.' } : {}),
          ...(event.phase !== 'interrupted' && event.transitionRefusal ? { detail: `TRANSITION_REFUSED: ${event.transitionRefusal.code}: ${event.transitionRefusal.message}` } : {}),
          ...(event.phase !== 'interrupted' && !event.transitionRefusal && this.state.detail.startsWith('TRANSITION_REFUSED:') &&
            (event.currentCueId !== this.state.currentCueId || event.selectedCueId !== this.state.selectedCueId) ? { detail: '' } : {}),
          ...(event.currentCueId !== this.state.currentCueId || event.generation !== this.state.nativeGeneration || work.mainSequenceVoiceCount === 0 ? { progressCueId: '', progressPositionMs: null, progressDurationMs: null } : {}),
          ...work,
          nativeGeneration: event.generation,
          selectedCueId: event.selectedCueId,
          phase: event.phase === 'playing' ? 'running' : event.phase,
          currentCueId: event.currentCueId,
          nextCueId: event.nextCueId,
          currentCueIndex: event.currentCueIndex,
          nextCueIndex: event.nextCueIndex,
          activeVoiceCount: event.activeVoiceCount,
          countdownRemainingMs: event.phase === 'interrupted' ? 0 : event.countdownRemainingMs,
          playbackRate: event.playbackRate ?? 1,
          lastEvent: event,
        });
        return;
      }
      case 'ACK': {
        // Bridge delivery is not used as a global numeric watermark: a valid
        // lower command may arrive after a higher-priority command's ACK.
        if (this.acknowledgements.has(event.commandId)) return;
        this.acknowledgements.set(event.commandId, event);
        const cueIndex = this.pendingMainGo.get(event.commandId);
        if (cueIndex !== undefined) {
          this.pendingMainGo.delete(event.commandId);
          this.advancePointer(cueIndex, event);
          return;
        }
        break;
      }
      case 'REMOTE_COMMAND':
        // The native remote handler has already advanced/paused/resumed. This is
        // state notification only; redispatching here would double-trigger GO.
        if (snapshot?.schemaVersion !== 2 && event.command === 'GO' && event.handledNatively === true) {
          const cueIndex = this.state.snapshot?.cueOrder.indexOf(event.cueId) ?? -1;
          if (cueIndex >= 0) this.advancePointer(cueIndex, event);
          return;
        }
        break;
      case 'VOICE_START':
        this.activeVoices.add(event.voiceId);
        // A voice can be a Hit or group child. It never proves that the ordered
        // native GO pointer advanced; ACK/REMOTE_COMMAND are authoritative.
        break;
      case 'VOICE_END':
        this.activeVoices.delete(event.voiceId);
        break;
      case 'STATE':
        this.patch({ phase: event.state === 'playing' ? 'running' : event.state, lastEvent: event, ...(snapshot?.schemaVersion === 2 || this.adoptedNativeVoiceState ? {} : { activeVoiceCount: this.activeVoices.size }) });
        return;
      case 'INTERRUPTION':
        this.patch({ ...this.blockPlaybackForRecovery(), nativeGeneration: eventGeneration, phase: 'interrupted', detail: event.reason, lastEvent: event });
        return;
      case 'ROUTE_CHANGE':
        this.patch({
          ...this.blockPlaybackForRecovery(),
          nativeGeneration: eventGeneration,
          phase: event.safeStopped ? 'interrupted' : 'fault',
          detail: `Audio route changed from ${event.previous} to ${event.current}. Explicit recovery is required.`,
          lastEvent: event,
        });
        return;
      case 'CAPACITY_REFUSAL':
        if (this.playbackRecoveryRequired) return;
        this.clearPendingMainGo();
        this.patch({ detail: `The eight-voice limit refused ${event.cueId}. Existing playback was not disturbed.`, lastEvent: event, pendingCommandIds: Object.freeze([]) });
        return;
      case 'TRANSITION_REFUSED':
        if (this.playbackRecoveryRequired) return;
        this.clearPendingMainGo();
        this.patch({ detail: `TRANSITION_REFUSED: ${event.code}: ${event.message}`, lastEvent: event, pendingCommandIds: Object.freeze([]) });
        return;
      case 'FAULT':
        this.patch({ ...this.blockPlaybackForRecovery(), nativeGeneration: eventGeneration, phase: 'fault', detail: `${event.code}: ${event.message}`, lastEvent: event });
        return;
      case 'PROGRESS': {
        if (event.mainTransport === false || this.state.mainSequenceVoiceCount === 0 || event.cueId !== this.state.currentCueId || !Number.isFinite(event.positionMs) || !Number.isFinite(event.durationMs) || event.positionMs < 0 || event.durationMs <= 0) break;
        this.progressVoiceId = event.voiceId ?? null;
        this.patch({
          progressCueId: event.cueId,
          progressPositionMs: Math.min(event.positionMs, event.durationMs),
          progressDurationMs: event.durationMs,
          lastEvent: event,
        });
        return;
      }
    }

    this.patch({
      // Total native voices may still include Hits after the main voice ends.
      // A same-cue replacement must not inherit the previous voice's clock.
      ...(progressVoiceEnded || progressVoiceReplaced ? { progressCueId: '', progressPositionMs: null, progressDurationMs: null } : {}),
      lastEvent: event,
      ...(snapshot?.schemaVersion === 2 || this.adoptedNativeVoiceState ? {} : { activeVoiceCount: this.activeVoices.size }),
      pendingCommandIds: Object.freeze([...this.pendingMainGo.keys()]),
    });
  }

  private advancePointer(cueIndex: number, event: EngineEvent | null = null): void {
    const snapshot = this.state.snapshot;
    if (!snapshot || cueIndex < 0 || cueIndex >= snapshot.cueOrder.length) return;
    if (cueIndex <= this.state.currentCueIndex) {
      this.patch({
        pendingCommandIds: Object.freeze([...this.pendingMainGo.keys()]),
        ...(event ? { lastEvent: event } : {}),
      });
      return;
    }
    const nextCueIndex = cueIndex + 1;
    this.patch({
      currentCueIndex: cueIndex,
      nextCueIndex,
      currentCueId: snapshot.cueOrder[cueIndex] ?? '',
      nextCueId: snapshot.cueOrder[nextCueIndex] ?? '',
      progressCueId: '',
      progressPositionMs: null,
      progressDurationMs: null,
      pendingCommandIds: Object.freeze([...this.pendingMainGo.keys()]),
      ...(event ? { lastEvent: event } : {}),
    });
  }

  private publishPendingCommands(): void {
    this.patch({ pendingCommandIds: Object.freeze([...this.pendingMainGo.keys()]) });
  }

  private resetRunTracking(): void {
    this.adoptedNativeVoiceState = false;
    this.pendingMainGo.clear();
    this.acknowledgements.clear();
    this.activeVoices.clear();
    this.patch({
      currentCueIndex: -1,
      nextCueIndex: 0,
      currentCueId: '',
      nextCueId: '',
      selectedCueId: '',
      nativeGeneration: 0,
      countdownRemainingMs: 0,
      playbackRate: 1,
      activeVoiceCount: 0,
      hasPendingActions: null,
      mainSequenceVoiceCount: null,
      progressCueId: '',
      progressPositionMs: null,
      progressDurationMs: null,
      pendingCommandIds: Object.freeze([]),
      lastEvent: null,
    });
  }

  private patch(patch: Partial<ShowSessionState>): void {
    if (patch.progressCueId === '') this.progressVoiceId = null;
    this.state = Object.freeze({ ...this.state, ...patch });
    this.notify();
  }

  private clearPendingMainGo(): void {
    this.pendingMainGo.clear();
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}
