import { z } from 'zod';
import type { ControllerProfile, MediaAsset, Show, VisualAsset } from '../domain';
import { validateControllerProfileDefinitions, validateShowDocument } from '../domain/validate-show';
import { copyDocument } from '../library/operations';
import type { LibrarySettings } from '../library/types';
import { portableSettings } from './sqlite';
import { safeArchivePath, ZIP_LIMITS, type StoredZipEntry } from './zip';

export interface BackupFile { readonly path: string; readonly sha256: string; readonly bytes: number }
type PortableMedia = Omit<MediaAsset, 'localUri'> & { readonly bundlePath: string };
type PortableVisual = Omit<VisualAsset, 'localUri'> & { readonly bundlePath: string };
export interface PortableLibraryShow extends Omit<Show, 'media' | 'visualAssets'> {
  readonly media: Readonly<Record<string, PortableMedia>>;
  readonly visualAssets: Readonly<Record<string, PortableVisual>>;
}
export interface LibraryBundleManifest {
  readonly format: 'show-control-library';
  readonly schemaVersion: 2;
  readonly exportId: string;
  readonly createdAt: string;
  readonly shows: readonly PortableLibraryShow[];
  readonly controllerProfiles: readonly ControllerProfile[];
  readonly settings: LibrarySettings;
  readonly selectedShowId: string | null;
  readonly selectedSetId: string | null;
  readonly files: readonly BackupFile[];
}
const text = z.string().min(1).max(1000);
const id = z.string().min(1).max(200).refine((value) => !['__proto__', 'prototype', 'constructor'].includes(value));
const time = z.number().int().min(0).max(2_147_483_647);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const stringIds = z.array(id).max(10000);
const selector = z.discriminatedUnion('kind', [z.object({ kind: z.literal('all') }).strict(), z.object({ kind: z.literal('cueIds'), cueIds: stringIds }).strict(), z.object({ kind: z.literal('tags'), tags: z.array(text).max(1000) }).strict()]);
const curve = z.enum(['linear', 'smooth', 'equalPower']);
const base = { id, name: text, tags: z.array(text).max(1000), notes: z.string().max(100000).optional(), colorToken: text.optional() };
const cue = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('audio'), mediaAssetId: id, trimInMs: time, trimOutMs: time.optional(), gainDb: z.number().finite().min(-96).max(12), fadeInMs: time, fadeOutMs: time, fadeCurve: curve, preWaitMs: time,
    endBehavior: z.enum(['stopAndReadyNext', 'autoFollow', 'loop']), playbackRate: z.number().finite().min(0.7).max(2).optional(), autoPlay: z.boolean().optional(), crossfadeEnabled: z.boolean().optional(), crossfadeMs: time.optional(), artworkAssetId: id.optional(), visualAssetId: id.optional() }).strict(),
  z.object({ ...base, type: z.literal('group'), children: z.array(z.object({ cueId: id, offsetMs: time }).strict()).max(10000) }).strict(),
  z.object({ ...base, type: z.literal('fade'), selector, durationMs: time, curve, stopAtEnd: z.boolean() }).strict(),
  z.object({ ...base, type: z.literal('stop'), selector }).strict(),
  z.object({ ...base, type: z.literal('wait'), durationMs: time, continue: z.enum(['manual', 'auto']) }).strict(),
]);
const command = z.union([z.object({ type: z.enum(['GO', 'PANIC_FADE', 'PAUSE_RESUME', 'REPLAY', 'PREVIOUS', 'SKIP', 'STOP_ALL', 'PAUSE', 'RESUME']) }).strict(), z.object({ type: z.enum(['TRIGGER_HIT', 'PLAY', 'SELECT']), cueId: id }).strict()]);
const action = z.union([z.object({ type: z.enum(['GO', 'PAUSE', 'RESUME', 'STOP_ALL', 'PANIC_FADE']) }).strict(), z.object({ type: z.literal('PLAY'), cueId: id }).strict()]);
const locale = z.enum(['en', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ar']);
const portablePath = z.string().refine((path) => safeArchivePath(path) && /^(media|visuals)\/[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(path));
const fileBytes = z.number().int().min(1).max(ZIP_LIMITS.maxFileBytes);
const media = z.object({ id, checksumSha256: hash, bundlePath: portablePath.refine((path) => path.startsWith('media/')), bytes: fileBytes, durationMs: time.min(1), codec: text, channels: z.number().int().min(1).max(32), sampleRate: z.number().int().min(1).max(384000) }).strict();
const visual = z.object({ id, kind: z.enum(['image', 'video']), checksumSha256: hash, bundlePath: portablePath.refine((path) => path.startsWith('visuals/')), bytes: fileBytes, mimeType: text, width: z.number().int().min(1).max(65536), height: z.number().int().min(1).max(65536), durationMs: time.optional() }).strict();
const show = z.object({ id, revisionId: id, name: text, updatedAt: text, schemaVersion: z.union([z.literal(1), z.literal(2)]).optional(), panicFadeMs: time, controllerProfileId: id.optional(),
  sets: z.array(z.object({ id, name: text, cueOrder: stringIds, hitCueIds: stringIds, transportMode: z.enum(['legacyCueStack', 'oms']).optional(), routineText: z.string().max(8192).optional() }).strict()).max(1000),
  cues: z.record(id, cue), media: z.record(id, media), visualAssets: z.record(id, visual), fallbackVisualAssetId: id.optional(),
  voiceRules: z.array(z.object({ id, phrases: z.array(text).min(1).max(100), locale, enabled: z.boolean(), cueId: id.optional(), action, delayMs: time }).strict()).max(10000).optional(),
}).strict();
const preferences = z.object({ locale, theme: z.enum(['darkBlue', 'purpleNight', 'cobra']), onboardingCompleted: z.boolean(), externalDisplayEnabled: z.boolean(), voiceModel: z.enum(['base', 'small']), assistantProvider: z.enum(['openai', 'anthropic']), assistantModel: text, artworkModel: text, musicModel: text }).strict();
const portableAdapter = z.string().regex(/^(flic2|flic|generic-native|hid|media|keyboard|unbound|logical-adapter-\d+)$/);
const portableDeviceRole = z.string().regex(/^logical-device-\d+$/);
const schema = z.object({ format: z.literal('show-control-library'), schemaVersion: z.literal(2), exportId: id, createdAt: text, shows: z.array(show).max(1000),
  controllerProfiles: z.array(z.object({ id, name: text, bindings: z.array(z.object({ inputKey: text, command, adapterId: portableAdapter.optional(), deviceId: portableDeviceRole.optional() }).strict()).max(1000) }).strict()).max(1000), settings: preferences,
  selectedShowId: id.nullable(), selectedSetId: id.nullable(), files: z.array(z.object({ path: portablePath, sha256: hash, bytes: fileBytes }).strict()).max(ZIP_LIMITS.maxFiles - 1),
}).strict();
function extension(uri: string, fallback: string): string { return /\.([a-z0-9]{1,8})$/i.exec(uri)?.[1]?.toLowerCase() ?? fallback; }
/** Logical roles retain compound-input distinctions without exporting device addresses. */
export function portableControllerProfiles(profiles: readonly ControllerProfile[]): readonly ControllerProfile[] {
  const devices = new Map<string, string>();
  const adapters = new Map<string, string>();
  const knownFamilies = new Set(['flic2', 'flic', 'generic-native', 'hid', 'media', 'keyboard', 'unbound']);
  return profiles.map((profile) => ({ id: profile.id, name: profile.name, bindings: profile.bindings.map((binding) => {
    let adapterId: string | undefined;
    if (binding.adapterId !== undefined) {
      if (knownFamilies.has(binding.adapterId)) adapterId = binding.adapterId;
      else { if (!adapters.has(binding.adapterId)) adapters.set(binding.adapterId, `logical-adapter-${adapters.size + 1}`); adapterId = adapters.get(binding.adapterId)!; }
    }
    let deviceId: string | undefined;
    if (binding.deviceId !== undefined || binding.adapterId !== undefined) {
      const identity = JSON.stringify([binding.adapterId ?? null, binding.deviceId ?? null]);
      if (!devices.has(identity)) devices.set(identity, `logical-device-${devices.size + 1}`);
      deviceId = devices.get(identity)!;
    }
    return { inputKey: binding.inputKey, command: copyDocument(binding.command), ...(adapterId ? { adapterId } : {}), ...(deviceId ? { deviceId } : {}) };
  }) }));
}
/** Imported controls stay inert until the performer explicitly learns local hardware. */
export function unboundControllerProfiles(profiles: readonly ControllerProfile[]): readonly ControllerProfile[] {
  return portableControllerProfiles(profiles).map((profile) => ({ ...profile, bindings: profile.bindings.map((binding) => ({ ...binding, adapterId: 'unbound' })) }));
}
export function makeLibraryManifest(shows: readonly Show[], profiles: readonly ControllerProfile[], settings: LibrarySettings, selectedShowId: string | null, selectedSetId: string | null, exportId: string): LibraryBundleManifest {
  // Validate before replacing private identities; portability must not conceal
  // malformed source definitions or silently discard unknown binding fields.
  validateControllerProfileDefinitions(profiles);
  const files = new Map<string, BackupFile>();
  const portableShows = shows.map((value): PortableLibraryShow => {
    const mapAsset = <T extends MediaAsset | VisualAsset>(asset: T, directory: 'media' | 'visuals') => {
      const { localUri, ...metadata } = copyDocument(asset); const path = `${directory}/${asset.checksumSha256}.${extension(localUri, directory === 'media' ? 'audio' : 'visual')}`;
      const previous = files.get(path);
      if (previous && (previous.sha256 !== asset.checksumSha256 || previous.bytes !== asset.bytes)) throw new Error('Conflicting content-addressed assets.');
      files.set(path, { path, sha256: asset.checksumSha256, bytes: asset.bytes }); return { ...metadata, bundlePath: path };
    };
    return { ...copyDocument(value), media: Object.fromEntries(Object.entries(value.media).map(([key, asset]) => [key, mapAsset(asset, 'media')])),
      visualAssets: Object.fromEntries(Object.entries(value.visualAssets ?? {}).map(([key, asset]) => [key, mapAsset(asset, 'visuals')])) };
  });
  return { format: 'show-control-library', schemaVersion: 2, exportId, createdAt: new Date().toISOString(), shows: portableShows,
    controllerProfiles: portableControllerProfiles(profiles),
    settings: portableSettings(settings), selectedShowId, selectedSetId, files: [...files.values()] };
}
export function materializeLibraryShow(value: PortableLibraryShow, resolve: (path: string) => string): Show {
  const convert = <T extends PortableMedia | PortableVisual>(asset: T) => { const { bundlePath, ...metadata } = asset; return { ...metadata, localUri: resolve(bundlePath) }; };
  return { ...value, media: Object.fromEntries(Object.entries(value.media).map(([key, asset]) => [key, convert(asset)])),
    visualAssets: Object.fromEntries(Object.entries(value.visualAssets).map(([key, asset]) => [key, convert(asset)])) };
}
export function libraryPayloadUris(shows: readonly Show[], manifest: LibraryBundleManifest): ReadonlyMap<string, string> {
  const sources = new Map<string, string>();
  for (const portable of manifest.shows) {
    const local = shows.find((show) => show.id === portable.id); if (!local) throw new Error('Backup source show is missing.');
    for (const [key, asset] of Object.entries(portable.media)) { const original = local.media[key]; if (!original) throw new Error('Backup audio source is missing.'); sources.set(asset.bundlePath, original.localUri); }
    for (const [key, asset] of Object.entries(portable.visualAssets)) { const original = local.visualAssets?.[key]; if (!original) throw new Error('Backup visual source is missing.'); sources.set(asset.bundlePath, original.localUri); }
  }
  return sources;
}
export function validateLibraryManifest(raw: unknown, entries: readonly StoredZipEntry[]): LibraryBundleManifest {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error('Backup manifest is invalid or from an unsupported schema.');
  const manifest = parsed.data as LibraryBundleManifest;
  const unique = (values: readonly string[]) => new Set(values).size === values.length;
  if (!unique(manifest.shows.map((value) => value.id)) || !unique(manifest.controllerProfiles.map((value) => value.id))) throw new Error('Backup contains duplicate identities.');
  try { validateControllerProfileDefinitions(manifest.controllerProfiles); }
  catch { throw new Error('Backup contains an invalid controller profile definition.'); }
  const declared = new Map(manifest.files.map((file) => [file.path.toLowerCase(), file]));
  if (declared.size !== manifest.files.length || entries.length !== declared.size + 1) throw new Error('Backup contains duplicate or undeclared payloads.');
  for (const entry of entries) {
    if (entry.path === 'manifest.json') continue;
    const file = declared.get(entry.path.toLowerCase());
    if (!file || file.path !== entry.path || file.bytes !== entry.bytes) throw new Error('Backup file declaration does not match the archive.');
  }
  const used = new Set<string>();
  for (const value of manifest.shows) {
    if (value.controllerProfileId !== undefined && !manifest.controllerProfiles.some((profile) => profile.id === value.controllerProfileId)) throw new Error('Backup refers to a missing controller profile.');
    if (!unique(value.sets.map((set) => set.id))) throw new Error('Backup contains duplicate sets.');
    for (const [key, asset] of [...Object.entries(value.media), ...Object.entries(value.visualAssets)]) {
      const file = declared.get(asset.bundlePath.toLowerCase());
      if (asset.id !== key || !file || file.path !== asset.bundlePath || file.sha256 !== asset.checksumSha256 || file.bytes !== asset.bytes) throw new Error('Backup media declaration is inconsistent.');
      used.add(file.path);
    }
    for (const [key, definition] of Object.entries(value.cues)) if (definition.id !== key) throw new Error('Backup cue identity is inconsistent.');
    for (const definition of Object.values(value.cues)) {
      if (definition.type === 'audio' && !value.media[definition.mediaAssetId]) throw new Error('Backup cue refers to missing audio.');
      if (definition.type === 'group' && definition.children.some((child) => !value.cues[child.cueId])) throw new Error('Backup group refers to a missing cue.');
    }
    const local = materializeLibraryShow(value, (path) => `file:///validated-backup/${path}`);
    try { validateShowDocument(local); }
    catch (failure) { throw new Error(`Backup contains an invalid show: ${failure instanceof Error ? failure.message : String(failure)}`); }
  }
  if (used.size !== declared.size) throw new Error('Backup contains unreferenced payload files.');
  if (manifest.selectedShowId && !manifest.shows.some((value) => value.id === manifest.selectedShowId)) throw new Error('Backup selection is invalid.');
  if (manifest.selectedSetId && !manifest.shows.find((value) => value.id === manifest.selectedShowId)?.sets.some((set) => set.id === manifest.selectedSetId)) throw new Error('Backup set selection is invalid.');
  return manifest;
}
