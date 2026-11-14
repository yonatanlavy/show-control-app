import { compileRunSnapshot, type ControllerProfile, type Cue, type MediaAsset, type Show } from '../domain';
export const SHOW_BUNDLE_SCHEMA_VERSION = 1 as const;
export interface ShowBundleFileV1 { readonly path: string; readonly sha256: string; readonly bytes: number; readonly mediaAssetId: string }
export interface PortableMediaAssetV1 extends Omit<MediaAsset, 'localUri'> { readonly bundlePath: string }
export interface PortableShowV1 extends Omit<Show, 'media'> { readonly media: Readonly<Record<string, PortableMediaAssetV1>> }
export interface ShowBundleManifestV1 {
  readonly format: 'showbundle';
  readonly schemaVersion: 1;
  readonly exportId: string;
  readonly show: PortableShowV1;
  readonly controllerProfiles: readonly ControllerProfile[];
  readonly files: readonly ShowBundleFileV1[];
}
export interface ArchiveEntry {
  readonly path: string;
  readonly kind: 'file' | 'directory' | 'symlink' | 'hardlink';
  readonly bytes: number;
  readonly compressedBytes: number;
  readonly sha256: string;
}
export interface BundleLimits { readonly maxFiles: number; readonly maxFileBytes: number; readonly maxTotalBytes: number; readonly maxCompressionRatio: number }
export const DEFAULT_BUNDLE_LIMITS: BundleLimits = { maxFiles: 500, maxFileBytes: 1_000_000_000, maxTotalBytes: 4_000_000_000, maxCompressionRatio: 200 };
export type BundleIssueCode = 'INVALID_MANIFEST' | 'INVALID_SHOW' | 'FUTURE_SCHEMA' | 'UNSAFE_ENTRY' | 'UNSAFE_PATH' | 'RESERVED_PATH' | 'DUPLICATE_PATH' | 'MISSING_FILE' | 'UNEXPECTED_FILE' | 'CHECKSUM_MISMATCH' | 'SIZE_MISMATCH' | 'ARCHIVE_BOMB';
export interface BundleIssue { readonly code: BundleIssueCode; readonly path?: string; readonly message: string }
export type BundleValidation = { readonly ok: true; readonly manifest: ShowBundleManifestV1 } | { readonly ok: false; readonly issues: readonly BundleIssue[] };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const finiteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const safeInteger = (value: unknown, minimum = 0): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
const sha256 = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const safePath = (path: string) => path.length > 0 && path.length <= 1024 && path.normalize('NFC') === path &&
  !path.includes('\\') && !/[\u0000-\u001f\u007f]/.test(path) && !path.startsWith('/') && !/^[a-z]:/i.test(path) &&
  path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
const stringArray = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every(nonEmptyString);

function validSelector(value: unknown): boolean {
  if (!object(value) || !['all', 'cueIds', 'tags'].includes(String(value.kind))) return false;
  if (value.kind === 'all') return true;
  return value.kind === 'cueIds' ? stringArray(value.cueIds) : stringArray(value.tags);
}
function validCue(value: unknown, key: string): value is Cue {
  if (!object(value) || value.id !== key || !nonEmptyString(value.name) || !stringArray(value.tags)) return false;
  switch (value.type) {
    case 'audio':
      return nonEmptyString(value.mediaAssetId) && safeInteger(value.trimInMs) &&
        (value.trimOutMs === undefined || (safeInteger(value.trimOutMs, 1) && value.trimOutMs > value.trimInMs)) &&
        finiteNumber(value.gainDb) && safeInteger(value.fadeInMs) && safeInteger(value.fadeOutMs) && safeInteger(value.preWaitMs) &&
        ['linear', 'smooth', 'equalPower'].includes(String(value.fadeCurve)) && ['stopAndReadyNext', 'autoFollow', 'loop'].includes(String(value.endBehavior));
    case 'group':
      return Array.isArray(value.children) && value.children.every((child) => object(child) && nonEmptyString(child.cueId) && safeInteger(child.offsetMs));
    case 'fade':
      return validSelector(value.selector) && safeInteger(value.durationMs) && ['linear', 'smooth', 'equalPower'].includes(String(value.curve)) && typeof value.stopAtEnd === 'boolean';
    case 'stop':
      return validSelector(value.selector);
    case 'wait':
      return safeInteger(value.durationMs) && ['manual', 'auto'].includes(String(value.continue));
    default:
      return false;
  }
}
function validControllerCommand(value: unknown): boolean {
  if (!object(value) || !nonEmptyString(value.type)) return false;
  return ['GO', 'PANIC_FADE', 'PAUSE_RESUME', 'REPLAY', 'PREVIOUS', 'SKIP', 'STOP_ALL'].includes(value.type) ||
    (value.type === 'TRIGGER_HIT' && nonEmptyString(value.cueId));
}
function parseControllerProfiles(value: unknown): ControllerProfile[] | null {
  if (!Array.isArray(value)) return null;
  const profiles: ControllerProfile[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    if (!object(candidate) || !nonEmptyString(candidate.id) || ids.has(candidate.id) || !nonEmptyString(candidate.name) || !Array.isArray(candidate.bindings) ||
        !candidate.bindings.every((binding) => object(binding) && nonEmptyString(binding.inputKey) && validControllerCommand(binding.command))) return null;
    ids.add(candidate.id);
    profiles.push(candidate as unknown as ControllerProfile);
  }
  return profiles;
}
function parsePortableShow(value: unknown): { portable: PortableShowV1; materialized: Show } | null {
  if (!object(value) || !nonEmptyString(value.id) || !nonEmptyString(value.revisionId) || !nonEmptyString(value.name) ||
      !nonEmptyString(value.updatedAt) || !safeInteger(value.panicFadeMs) || !Array.isArray(value.sets) || !object(value.cues) || !object(value.media) ||
      (value.controllerProfileId !== undefined && !nonEmptyString(value.controllerProfileId))) return null;
  const setIds = new Set<string>();
  if (!value.sets.every((set) => object(set) && nonEmptyString(set.id) && !setIds.has(set.id) && setIds.add(set.id) &&
      nonEmptyString(set.name) && stringArray(set.cueOrder) && stringArray(set.hitCueIds))) return null;
  for (const [key, cue] of Object.entries(value.cues)) if (!validCue(cue, key)) return null;
  const media: Record<string, MediaAsset> = {};
  for (const [key, mediaValue] of Object.entries(value.media)) {
    if (!object(mediaValue) || 'localUri' in mediaValue || mediaValue.id !== key || !sha256(mediaValue.checksumSha256) ||
        !safePath(String(mediaValue.bundlePath ?? '')) || !safeInteger(mediaValue.bytes, 1) || !safeInteger(mediaValue.durationMs, 1) ||
        !nonEmptyString(mediaValue.codec) || !safeInteger(mediaValue.channels, 1) || !safeInteger(mediaValue.sampleRate, 1)) return null;
    media[key] = { id: key, checksumSha256: mediaValue.checksumSha256 as string, localUri: `bundle://${mediaValue.bundlePath as string}`,
      bytes: mediaValue.bytes as number, durationMs: mediaValue.durationMs as number, codec: mediaValue.codec,
      channels: mediaValue.channels as number, sampleRate: mediaValue.sampleRate as number };
  }
  return { portable: value as unknown as PortableShowV1, materialized: { ...(value as unknown as Omit<Show, 'media'>), media } };
}

export function validateShowBundle(raw: unknown, entries: readonly ArchiveEntry[], limits: BundleLimits = DEFAULT_BUNDLE_LIMITS): BundleValidation {
  const issues: BundleIssue[] = [];
  if (!object(raw) || raw.format !== 'showbundle' || !Number.isInteger(raw.schemaVersion) ||
      typeof raw.exportId !== 'string' || raw.exportId.length === 0 || !Array.isArray(raw.files) ||
      !object(raw.show) || !Array.isArray(raw.controllerProfiles))
    return { ok: false, issues: [{ code: 'INVALID_MANIFEST', message: 'Manifest shape is invalid.' }] };
  if ((raw.schemaVersion as number) > SHOW_BUNDLE_SCHEMA_VERSION) issues.push({ code: 'FUTURE_SCHEMA', message: `Schema ${raw.schemaVersion} is newer than this app.` });
  else if (raw.schemaVersion !== SHOW_BUNDLE_SCHEMA_VERSION) issues.push({ code: 'INVALID_MANIFEST', message: 'Unsupported manifest schema.' });
  if (!safeInteger(limits.maxFiles, 1) || !safeInteger(limits.maxFileBytes, 1) || !safeInteger(limits.maxTotalBytes, 1) ||
      !finiteNumber(limits.maxCompressionRatio) || limits.maxCompressionRatio < 1) {
    return { ok: false, issues: [{ code: 'INVALID_MANIFEST', message: 'Bundle limits are invalid.' }] };
  }
  const parsedShow = parsePortableShow(raw.show);
  const profiles = parseControllerProfiles(raw.controllerProfiles);
  if (!parsedShow || !profiles) issues.push({ code: 'INVALID_SHOW', message: 'Portable show or controller profile data is invalid.' });
  if (parsedShow && profiles) {
    if (parsedShow.materialized.controllerProfileId && !profiles.some((profile) => profile.id === parsedShow.materialized.controllerProfileId))
      issues.push({ code: 'INVALID_SHOW', message: 'The referenced controller profile is not included.' });
    for (const set of parsedShow.materialized.sets) {
      const compiled = compileRunSnapshot(parsedShow.materialized, set.id, profiles);
      if (!compiled.ok) issues.push({ code: 'INVALID_SHOW', message: `Set ${set.id} does not compile: ${compiled.issues.map((issue) => issue.code).join(', ')}.` });
    }
  }
  const files = raw.files as unknown[];
  if (files.length > limits.maxFiles) issues.push({ code: 'ARCHIVE_BOMB', message: 'Manifest lists too many files.' });
  const listed = new Map<string, ShowBundleFileV1>();
  const listedMedia = new Set<string>();
  for (const value of files) {
    if (!object(value) || typeof value.path !== 'string' || !sha256(value.sha256) ||
        !safeInteger(value.bytes, 1) ||
        typeof value.mediaAssetId !== 'string' || value.mediaAssetId.length === 0) {
      issues.push({ code: 'INVALID_MANIFEST', message: 'A media entry is invalid.' }); continue;
    }
    const file = value as unknown as ShowBundleFileV1;
    const key = file.path.toLowerCase();
    if (!safePath(file.path)) issues.push({ code: 'UNSAFE_PATH', path: file.path, message: 'Archive paths must be relative and normalized.' });
    if (key === 'manifest.json') issues.push({ code: 'RESERVED_PATH', path: file.path, message: 'manifest.json cannot be a media payload.' });
    if (listed.has(key)) issues.push({ code: 'DUPLICATE_PATH', path: file.path, message: 'Archive path is duplicated.' });
    if (listedMedia.has(file.mediaAssetId)) issues.push({ code: 'INVALID_MANIFEST', path: file.path, message: 'A media asset is listed more than once.' });
    listed.set(key, file);
    listedMedia.add(file.mediaAssetId);
  }
  const archive = new Map<string, ArchiveEntry>();
  let total = 0;
  for (const entry of entries) {
    if (!object(entry) || typeof entry.path !== 'string' || entry.kind !== 'file' || !safeInteger(entry.bytes) || !safeInteger(entry.compressedBytes) || !sha256(entry.sha256)) {
      const path = object(entry) && typeof entry.path === 'string' ? entry.path : null;
      issues.push({ code: 'UNSAFE_ENTRY', ...(path ? { path } : {}), message: 'Archive entry metadata is invalid or not a regular file.' });
      continue;
    }
    total += entry.bytes;
    if (!Number.isSafeInteger(total)) issues.push({ code: 'ARCHIVE_BOMB', message: 'Archive size overflowed safe limits.' });
    const key = entry.path.toLowerCase();
    if (!safePath(entry.path)) issues.push({ code: 'UNSAFE_PATH', path: entry.path, message: 'Archive path is unsafe.' });
    if (archive.has(key)) issues.push({ code: 'DUPLICATE_PATH', path: entry.path, message: 'Archive path is duplicated.' });
    archive.set(key, entry);
    const ratio = entry.compressedBytes === 0 ? (entry.bytes === 0 ? 1 : Infinity) : entry.bytes / entry.compressedBytes;
    if (entry.bytes > limits.maxFileBytes || ratio > limits.maxCompressionRatio) issues.push({ code: 'ARCHIVE_BOMB', path: entry.path, message: 'Archive entry exceeds safety limits.' });
  }
  if (entries.length > limits.maxFiles || total > limits.maxTotalBytes) issues.push({ code: 'ARCHIVE_BOMB', message: 'Archive exceeds aggregate safety limits.' });
  if (!archive.has('manifest.json')) issues.push({ code: 'MISSING_FILE', path: 'manifest.json', message: 'Archive manifest is absent.' });
  for (const [key, file] of listed) {
    const entry = archive.get(key);
    if (!entry) { issues.push({ code: 'MISSING_FILE', path: file.path, message: 'Manifest file is absent.' }); continue; }
    if (entry.bytes !== file.bytes) issues.push({ code: 'SIZE_MISMATCH', path: file.path, message: 'File size does not match manifest.' });
    if (entry.sha256.toLowerCase() !== file.sha256.toLowerCase() || !/^[a-f0-9]{64}$/i.test(file.sha256)) issues.push({ code: 'CHECKSUM_MISMATCH', path: file.path, message: 'Checksum does not match manifest.' });
  }
  for (const [key, entry] of archive) if (key !== 'manifest.json' && !listed.has(key)) issues.push({ code: 'UNEXPECTED_FILE', path: entry.path, message: 'Archive contains an unlisted payload.' });
  if (parsedShow) {
    const portableMedia = Object.values(parsedShow.portable.media);
    if (portableMedia.length !== listed.size) issues.push({ code: 'INVALID_MANIFEST', message: 'Every portable media asset must have exactly one file entry.' });
    for (const media of portableMedia) {
      const file = listed.get(media.bundlePath.toLowerCase());
      if (!file || file.mediaAssetId !== media.id || file.path !== media.bundlePath || file.sha256.toLowerCase() !== media.checksumSha256.toLowerCase() || file.bytes !== media.bytes)
        issues.push({ code: 'INVALID_MANIFEST', path: media.bundlePath, message: 'Portable media and file manifest records do not match.' });
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, manifest: raw as unknown as ShowBundleManifestV1 };
}
