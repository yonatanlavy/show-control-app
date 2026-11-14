import type {
  ControllerProfile,
  Cue,
  CueSelector,
  Id,
  MediaAsset,
  ResolvedCue,
  RunSnapshot,
  Show,
  ShowSet,
} from './model';

export type CompileIssue = {
  readonly code:
    | 'SET_MISSING'
    | 'CUE_MISSING'
    | 'MEDIA_MISSING'
    | 'NESTED_GROUP'
    | 'GROUP_CAPACITY'
    | 'TARGET_MISSING'
    | 'AUTOFOLLOW_LOOP'
    | 'INVALID_ID'
    | 'INVALID_TIMING'
    | 'INVALID_MEDIA'
    | 'DUPLICATE_ID'
    | 'DUPLICATE_REFERENCE'
    | 'CONTROLLER_MISSING'
    | 'CONTROLLER_INVALID';
  readonly message: string;
  readonly cueId?: Id;
};

export type CompileResult =
  | { readonly ok: true; readonly snapshot: RunSnapshot }
  | { readonly ok: false; readonly issues: readonly CompileIssue[] };

const MAX_ID_LENGTH = 256;
const SHA_256 = /^[a-f0-9]{64}$/i;

function isValidId(value: unknown): value is Id {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function issue(code: CompileIssue['code'], message: string, cueId?: Id): CompileIssue {
  return cueId === undefined ? { code, message } : { code, message, cueId };
}

function duplicateValues(values: readonly Id[]): readonly Id[] {
  const seen = new Set<Id>();
  const duplicates = new Set<Id>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function validateSelector(selector: CueSelector, cue: Cue, show: Show, reachableIds: ReadonlySet<Id>): CompileIssue[] {
  if (selector.kind === 'all') return [];
  const issues: CompileIssue[] = [];
  if (selector.kind === 'cueIds') {
    if (selector.cueIds.length === 0) {
      issues.push(issue('TARGET_MISSING', `${cue.name} has no cue targets.`, cue.id));
    }
    for (const id of selector.cueIds) {
      if (!isValidId(id) || !show.cues[id] || !reachableIds.has(id)) {
        issues.push(issue('TARGET_MISSING', `${cue.name} has an invalid or missing cue target.`, cue.id));
      }
    }
    if (duplicateValues(selector.cueIds).length > 0) {
      issues.push(issue('DUPLICATE_REFERENCE', `${cue.name} repeats a cue target.`, cue.id));
    }
    return issues;
  }
  const validTags = selector.tags.filter((tag) => isValidId(tag));
  if (validTags.length !== selector.tags.length || validTags.length === 0) {
    issues.push(issue('TARGET_MISSING', `${cue.name} has invalid or empty tag targets.`, cue.id));
  } else if (![...reachableIds].some((id) => show.cues[id]?.tags.some((tag) => validTags.includes(tag)))) {
    issues.push(issue('TARGET_MISSING', `${cue.name} has no cue matching its tag targets.`, cue.id));
  }
  if (duplicateValues(selector.tags).length > 0) {
    issues.push(issue('DUPLICATE_REFERENCE', `${cue.name} repeats a tag target.`, cue.id));
  }
  return issues;
}

function validateMedia(asset: MediaAsset, recordId: Id, cue: Cue): CompileIssue[] {
  const invalid = !isValidId(asset.id) || asset.id !== recordId || !SHA_256.test(asset.checksumSha256) ||
    typeof asset.localUri !== 'string' || asset.localUri.length === 0 || asset.localUri.length > 4_096 ||
    !isPositiveSafeInteger(asset.bytes) || !isPositiveSafeInteger(asset.durationMs) ||
    !isValidId(asset.codec) || !Number.isSafeInteger(asset.channels) || asset.channels < 1 || asset.channels > 32 ||
    !Number.isSafeInteger(asset.sampleRate) || asset.sampleRate < 1 || asset.sampleRate > 384_000;
  return invalid ? [issue('INVALID_MEDIA', `${cue.name} has invalid local media metadata.`, cue.id)] : [];
}

function validateCue(cue: Cue, recordId: Id, show: Show, reachableIds: ReadonlySet<Id>): CompileIssue[] {
  const issues: CompileIssue[] = [];
  if (!isValidId(recordId) || !isValidId(cue.id) || cue.id !== recordId || !isValidId(cue.name) ||
      cue.tags.some((tag) => !isValidId(tag))) {
    issues.push(issue('INVALID_ID', `Cue ${recordId || '(empty)'} has an invalid identity, name, or tag.`, recordId));
  }
  if (duplicateValues(cue.tags).length > 0) {
    issues.push(issue('DUPLICATE_REFERENCE', `${cue.name} repeats a tag.`, cue.id));
  }

  if (cue.type === 'audio') {
    const media = show.media[cue.mediaAssetId];
    if (!isValidId(cue.mediaAssetId) || !media) {
      issues.push(issue('MEDIA_MISSING', `${cue.name} has no local media.`, cue.id));
    } else {
      issues.push(...validateMedia(media, cue.mediaAssetId, cue));
    }
    const timingIsInvalid = !isNonNegativeSafeInteger(cue.trimInMs) ||
      (cue.trimOutMs !== undefined && !isNonNegativeSafeInteger(cue.trimOutMs)) ||
      !isNonNegativeSafeInteger(cue.fadeInMs) || !isNonNegativeSafeInteger(cue.fadeOutMs) ||
      !isNonNegativeSafeInteger(cue.preWaitMs) || !Number.isFinite(cue.gainDb) ||
      (cue.playbackRate !== undefined && (!Number.isFinite(cue.playbackRate) || cue.playbackRate < 0.7 || cue.playbackRate > 2)) ||
      (cue.crossfadeMs !== undefined && !isNonNegativeSafeInteger(cue.crossfadeMs)) ||
      (cue.autoPlay !== undefined && typeof cue.autoPlay !== 'boolean') ||
      (cue.crossfadeEnabled !== undefined && typeof cue.crossfadeEnabled !== 'boolean');
    const effectiveEndMs = cue.trimOutMs ?? media?.durationMs;
    if (timingIsInvalid || effectiveEndMs === undefined || !isPositiveSafeInteger(effectiveEndMs) ||
        cue.trimInMs >= effectiveEndMs || (media !== undefined && effectiveEndMs > media.durationMs)) {
      issues.push(issue('INVALID_TIMING', `${cue.name} has invalid trim, gain, fade, or wait timing.`, cue.id));
    }
    for (const assetId of [cue.artworkAssetId, cue.visualAssetId]) {
      if (assetId !== undefined && !show.visualAssets?.[assetId]) {
        issues.push(issue('MEDIA_MISSING', `${cue.name} has missing visual media.`, cue.id));
      }
    }
    if (cue.endBehavior === 'autoFollow' &&
        (media === undefined || !isPositiveSafeInteger(effectiveEndMs) || cue.trimInMs >= effectiveEndMs)) {
      issues.push(issue('AUTOFOLLOW_LOOP', `${cue.name} needs a known finite end before auto-follow.`, cue.id));
    }
  } else if (cue.type === 'group') {
    let audioVoices = 0;
    if (cue.children.length === 0) {
      issues.push(issue('CUE_MISSING', `${cue.name} has no children.`, cue.id));
    }
    for (const child of cue.children) {
      const target = show.cues[child.cueId];
      if (!isValidId(child.cueId) || !target) {
        issues.push(issue('CUE_MISSING', `${cue.name} points to a missing cue.`, cue.id));
      } else {
        if (target.type === 'group') issues.push(issue('NESTED_GROUP', `${cue.name} nests a group.`, cue.id));
        if (target.type === 'audio') audioVoices += 1;
      }
      if (!isNonNegativeSafeInteger(child.offsetMs)) {
        issues.push(issue('INVALID_TIMING', `${cue.name} has an invalid child offset.`, cue.id));
      }
    }
    if (audioVoices > 8) {
      issues.push(issue('GROUP_CAPACITY', `${cue.name} exceeds the eight-voice limit.`, cue.id));
    }
  } else if (cue.type === 'fade') {
    if (!isNonNegativeSafeInteger(cue.durationMs)) {
      issues.push(issue('INVALID_TIMING', `${cue.name} has an invalid fade duration.`, cue.id));
    }
    issues.push(...validateSelector(cue.selector, cue, show, reachableIds));
  } else if (cue.type === 'stop') {
    issues.push(...validateSelector(cue.selector, cue, show, reachableIds));
  } else if (!isNonNegativeSafeInteger(cue.durationMs)) {
    issues.push(issue('INVALID_TIMING', `${cue.name} has an invalid wait duration.`, cue.id));
  }
  return issues;
}

function validateSet(set: ShowSet): CompileIssue[] {
  const issues: CompileIssue[] = [];
  if (!isValidId(set.id) || !isValidId(set.name)) {
    issues.push(issue('INVALID_ID', 'The selected set has an invalid identity or name.'));
  }
  if (set.transportMode !== undefined && set.transportMode !== 'oms' && set.transportMode !== 'legacyCueStack') {
    issues.push(issue('INVALID_ID', 'The selected set has an unsupported transport mode.'));
  }
  for (const id of [...set.cueOrder, ...set.hitCueIds]) {
    if (!isValidId(id)) issues.push(issue('INVALID_ID', 'The selected set contains an invalid cue ID.', id));
  }
  for (const id of duplicateValues(set.cueOrder)) {
    issues.push(issue('DUPLICATE_REFERENCE', `The GO stack repeats cue ${id}.`, id));
  }
  for (const id of duplicateValues(set.hitCueIds)) {
    issues.push(issue('DUPLICATE_REFERENCE', `The Hits shelf repeats cue ${id}.`, id));
  }
  return issues;
}

function validateController(profile: ControllerProfile | undefined, show: Show, set: ShowSet): CompileIssue[] {
  if (show.controllerProfileId === undefined) return [];
  if (!profile) return [issue('CONTROLLER_MISSING', 'The selected controller profile does not exist.')];
  const issues: CompileIssue[] = [];
  if (!isValidId(profile.id) || profile.id !== show.controllerProfileId || !isValidId(profile.name)) {
    issues.push(issue('CONTROLLER_INVALID', 'The selected controller profile has an invalid identity or name.'));
  }
  const inputKeys = profile.bindings.map((binding) => [binding.adapterId ?? '*', binding.deviceId ?? '*', binding.inputKey].join('\u001f'));
  if (profile.bindings.some((binding) => !isValidId(binding.inputKey) ||
      (binding.adapterId !== undefined && !isValidId(binding.adapterId)) ||
      (binding.deviceId !== undefined && !isValidId(binding.deviceId))) || duplicateValues(inputKeys).length > 0) {
    issues.push(issue('CONTROLLER_INVALID', 'The selected controller profile has invalid or colliding inputs.'));
  }
  if (!profile.bindings.some((binding) => binding.command.type === 'GO') ||
      !profile.bindings.some((binding) => binding.command.type === 'PANIC_FADE')) {
    issues.push(issue('CONTROLLER_INVALID', 'The selected controller profile requires separate GO and Panic Fade bindings.'));
  }
  for (const binding of profile.bindings) {
    if (binding.command.type === 'TRIGGER_HIT' &&
        (!show.cues[binding.command.cueId] || !set.hitCueIds.includes(binding.command.cueId))) {
      issues.push(issue('CONTROLLER_INVALID', 'The selected controller profile targets a missing Hit cue.'));
    }
    if ((binding.command.type === 'PLAY' || binding.command.type === 'SELECT') &&
        (!show.cues[binding.command.cueId] || !set.cueOrder.includes(binding.command.cueId))) {
      issues.push(issue('CONTROLLER_INVALID', 'The selected controller profile targets a missing main cue.'));
    }
  }
  return issues;
}

/** The same controller-only admission used by compilation and explicit recovery. */
export function controllerPreparationIssues(show: Show, set: ShowSet, profiles: readonly ControllerProfile[] = []): readonly CompileIssue[] {
  const issues: CompileIssue[] = [];
  if (duplicateValues(profiles.map((profile) => profile.id)).length > 0) {
    issues.push(issue('CONTROLLER_INVALID', 'Controller profile IDs must be unique.'));
  }
  issues.push(...validateController(profiles.find((profile) => profile.id === show.controllerProfileId), show, set));
  return issues;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function compileRunSnapshot(show: Show, setId: Id, profiles: readonly ControllerProfile[] = []): CompileResult {
  const duplicateSetIds = duplicateValues(show.sets.map((set) => set.id));
  const set = show.sets.find((candidate) => candidate.id === setId);
  if (!set) return { ok: false, issues: [issue('SET_MISSING', 'The selected set does not exist.')] };

  const issues: CompileIssue[] = [];
  if (!isValidId(show.id) || !isValidId(show.revisionId) || !isValidId(show.name)) {
    issues.push(issue('INVALID_ID', 'The show has an invalid identity, revision, or name.'));
  }
  if (!isNonNegativeSafeInteger(show.panicFadeMs)) {
    issues.push(issue('INVALID_TIMING', 'The panic fade duration is invalid.'));
  }
  if (duplicateSetIds.length > 0) {
    issues.push(issue('DUPLICATE_ID', 'The show contains duplicate set IDs.'));
  }
  issues.push(...validateSet(set));
  if (show.schemaVersion !== undefined && show.schemaVersion !== 1 && show.schemaVersion !== 2) {
    issues.push(issue('INVALID_ID', 'The show schema is unsupported.'));
  }
  for (const [id, asset] of Object.entries(show.visualAssets ?? {})) {
    if (!isValidId(id) || asset.id !== id || !['image', 'video'].includes(asset.kind) ||
        !SHA_256.test(asset.checksumSha256) || !isPositiveSafeInteger(asset.bytes) ||
        !isPositiveSafeInteger(asset.width) || !isPositiveSafeInteger(asset.height) ||
        typeof asset.localUri !== 'string' || !asset.localUri || !isValidId(asset.mimeType) ||
        (asset.kind === 'video' && !isPositiveSafeInteger(asset.durationMs))) {
      issues.push(issue('INVALID_MEDIA', 'Visual media metadata is invalid.'));
    }
  }
  if (show.fallbackVisualAssetId !== undefined && !show.visualAssets?.[show.fallbackVisualAssetId]) {
    issues.push(issue('MEDIA_MISSING', 'The default visual is missing.'));
  }
  const voiceIds = new Set<string>();
  for (const rule of show.voiceRules ?? []) {
    const actions = ['GO', 'PLAY', 'PAUSE', 'RESUME', 'STOP_ALL', 'PANIC_FADE'];
    if (!isValidId(rule.id) || voiceIds.has(rule.id) || typeof rule.enabled !== 'boolean' ||
        !['en', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ar'].includes(rule.locale) ||
        !Array.isArray(rule.phrases) || rule.phrases.length < 1 || rule.phrases.length > 20 ||
        rule.phrases.some((phrase) => !isValidId(phrase)) || !isNonNegativeSafeInteger(rule.delayMs) ||
        rule.delayMs > 3_600_000 || !actions.includes(rule.action.type) ||
        (rule.cueId !== undefined && !show.cues[rule.cueId]) ||
        (rule.action.type === 'PLAY' && !show.cues[rule.action.cueId])) {
      issues.push(issue('INVALID_ID', 'A voice rule has invalid identity, phrase, timing, or target.'));
    }
    voiceIds.add(rule.id);
  }

  const selectedIds = [...set.cueOrder, ...set.hitCueIds];
  const reachableIds = new Set<Id>();
  for (const id of selectedIds) {
    const cue = show.cues[id];
    if (!cue) {
      issues.push(issue('CUE_MISSING', `Cue ${id} is missing.`, id));
      continue;
    }
    reachableIds.add(id);
    if (cue.type === 'group') {
      for (const child of cue.children) reachableIds.add(child.cueId);
    }
  }

  const cues: Record<Id, ResolvedCue> = {};
  for (const id of reachableIds) {
    const cue = show.cues[id];
    if (!cue) continue;
    issues.push(...validateCue(cue, id, show, reachableIds));
    const mediaAsset = cue.type === 'audio' ? show.media[cue.mediaAssetId] : undefined;
    cues[id] = cue.type === 'audio' && mediaAsset ? { ...cue, mediaAsset } : cue;
  }

  const controllerProfile = profiles.find((profile) => profile.id === show.controllerProfileId);
  issues.push(...controllerPreparationIssues(show, set, profiles));
  if (issues.length > 0) return { ok: false, issues };

  const mediaById = new Map<Id, MediaAsset>();
  for (const cue of Object.values(cues)) {
    if (cue.type === 'audio' && cue.mediaAsset) mediaById.set(cue.mediaAsset.id, cue.mediaAsset);
  }
  const snapshot: RunSnapshot = {
    schemaVersion: show.schemaVersion === 2 || set.transportMode === 'oms' ? 2 : 1,
    transportMode: set.transportMode ?? 'legacyCueStack',
    revisionId: show.revisionId,
    showId: show.id,
    showName: show.name,
    setId: set.id,
    setName: set.name,
    cues,
    cueOrder: [...set.cueOrder],
    hitCueIds: [...set.hitCueIds],
    media: [...mediaById.values()],
    voiceLimit: 8,
    panicFadeMs: show.panicFadeMs,
    ...(show.visualAssets ? { visualAssets: show.visualAssets } : {}),
    ...(show.voiceRules ? { voiceRules: show.voiceRules.filter((rule) =>
      (rule.cueId === undefined || reachableIds.has(rule.cueId)) &&
      (rule.action.type !== 'PLAY' || set.cueOrder.includes(rule.action.cueId))) } : {}),
    ...(show.fallbackVisualAssetId ? { fallbackVisualAssetId: show.fallbackVisualAssetId } : {}),
    ...(controllerProfile ? { controllerProfile } : {}),
  };
  return { ok: true, snapshot: deepFreeze(cloneJson(snapshot)) };
}
