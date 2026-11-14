import { z } from 'zod';
import { compileRunSnapshot } from './compiler';
import type { ControllerProfile, Show } from './model';

// Local documents follow domain bounds. ZIP entry counts and payload sizes belong
// exclusively to the archive adapter; they must never limit local authoring.
const id = z.string().min(1).max(256).refine((value) => value.trim() === value && !['__proto__', 'prototype', 'constructor'].includes(value));
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positive = integer.min(1);
const strings = z.array(id);
const curve = z.enum(['linear', 'smooth', 'equalPower']);
const selector = z.discriminatedUnion('kind', [z.object({ kind: z.literal('all') }).strict(), z.object({ kind: z.literal('cueIds'), cueIds: strings }).strict(), z.object({ kind: z.literal('tags'), tags: strings }).strict()]);
const cueBase = { id, name: id, tags: strings, colorToken: id.optional(), notes: z.string().optional() };
const cue = z.discriminatedUnion('type', [
  z.object({ ...cueBase, type: z.literal('audio'), mediaAssetId: id, trimInMs: integer, trimOutMs: integer.optional(), gainDb: z.number().finite(), fadeInMs: integer, fadeOutMs: integer, fadeCurve: curve, preWaitMs: integer,
    endBehavior: z.enum(['stopAndReadyNext', 'autoFollow', 'loop']), playbackRate: z.number().finite().min(0.7).max(2).optional(), autoPlay: z.boolean().optional(), crossfadeEnabled: z.boolean().optional(), crossfadeMs: integer.optional(), artworkAssetId: id.optional(), visualAssetId: id.optional() }).strict(),
  z.object({ ...cueBase, type: z.literal('group'), children: z.array(z.object({ cueId: id, offsetMs: integer }).strict()) }).strict(),
  z.object({ ...cueBase, type: z.literal('fade'), selector, durationMs: integer, curve, stopAtEnd: z.boolean() }).strict(),
  z.object({ ...cueBase, type: z.literal('stop'), selector }).strict(),
  z.object({ ...cueBase, type: z.literal('wait'), durationMs: integer, continue: z.enum(['manual', 'auto']) }).strict(),
]);
const media = z.object({ id, checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i), localUri: z.string().min(1).max(4096), bytes: positive, durationMs: positive,
  codec: id, channels: z.number().int().min(1).max(32), sampleRate: z.number().int().min(1).max(384000) }).strict();
const visual = z.object({ id, kind: z.enum(['image', 'video']), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i), localUri: z.string().min(1).max(4096), bytes: positive,
  mimeType: id, width: positive, height: positive, durationMs: positive.optional() }).strict();
const voiceAction = z.union([z.object({ type: z.enum(['GO', 'PAUSE', 'RESUME', 'STOP_ALL', 'PANIC_FADE']) }).strict(), z.object({ type: z.literal('PLAY'), cueId: id }).strict()]);
const showSchema = z.object({ id, revisionId: id, name: id, updatedAt: z.string().min(1), schemaVersion: z.union([z.literal(1), z.literal(2)]).optional(), panicFadeMs: integer, controllerProfileId: id.optional(),
  sets: z.array(z.object({ id, name: id, cueOrder: strings, hitCueIds: strings, transportMode: z.enum(['legacyCueStack', 'oms']).optional(), routineText: z.string().max(8192).optional() }).strict()),
  cues: z.record(id, cue), media: z.record(id, media), visualAssets: z.record(id, visual).optional(), fallbackVisualAssetId: id.optional(),
  voiceRules: z.array(z.object({ id, phrases: z.array(id).min(1).max(20), locale: z.enum(['en', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ar']), enabled: z.boolean(), cueId: id.optional(), action: voiceAction, delayMs: integer.max(3_600_000) }).strict()).optional(),
}).strict();

const controllerCommand = z.union([
  z.object({ type: z.enum(['GO', 'PANIC_FADE', 'PAUSE_RESUME', 'REPLAY', 'PREVIOUS', 'SKIP', 'STOP_ALL', 'PAUSE', 'RESUME']) }).strict(),
  z.object({ type: z.enum(['TRIGGER_HIT', 'PLAY', 'SELECT']), cueId: id }).strict(),
]);
const controllerProfiles = z.array(z.object({ id, name: id, bindings: z.array(z.object({ inputKey: id, adapterId: id.optional(), deviceId: id.optional(), command: controllerCommand }).strict()) }).strict());

/** Definitions must remain well-formed even when saved controls are not ready to run. */
export function validateControllerProfileDefinitions(profiles: readonly ControllerProfile[]): void {
  if (!controllerProfiles.safeParse(profiles).success || new Set(profiles.map((profile) => profile.id)).size !== profiles.length) throw new Error('Controller profile document is invalid.');
  for (const profile of profiles) {
    const inputs = profile.bindings.map((binding) => [binding.adapterId ?? '*', binding.deviceId ?? '*', binding.inputKey].join('\u001f'));
    if (new Set(inputs).size !== inputs.length) throw new Error('Controller profile has colliding inputs.');
  }
}

/** Validate editable content, never controller readiness or a runnable session. */
export function validateShowDocument(show: Show): void {
  if (!showSchema.safeParse(show).success) throw new Error('Local show document is invalid.');
  for (const [key, asset] of [...Object.entries(show.media), ...Object.entries(show.visualAssets ?? {})])
    if (asset.id !== key) throw new Error('Local media identity is inconsistent.');
  for (const [key, definition] of Object.entries(show.cues)) {
    if (definition.id !== key) throw new Error('Local cue identity is inconsistent.');
    if (definition.type === 'audio' && !show.media[definition.mediaAssetId]) throw new Error('Local cue refers to missing audio.');
    if (definition.type === 'group' && definition.children.some((child) => !show.cues[child.cueId])) throw new Error('Local group refers to a missing cue.');
  }
  // Saved assignments can be incomplete or refer to songs moved during editing.
  // This projection is used only for validation; no snapshot leaves this function.
  // Actual preparation still compiles the original show and complete profile.
  const { controllerProfileId: _savedController, ...content } = show;
  for (const set of content.sets) {
    const compiled = compileRunSnapshot(content, set.id);
    if (!compiled.ok) throw new Error(`Local show is invalid: ${compiled.issues.map((issue) => issue.code).join(', ')}.`);
  }
}

/** Retain existing repository callers while separating authoring from preparation. */
export function validateLocalShow(show: Show, _profiles: readonly ControllerProfile[] = []): void {
  validateShowDocument(show);
}
