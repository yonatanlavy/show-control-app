import type { AudioEngine, EngineCommand, EngineEvent } from '../../src/audio';
import { SerializedCommandRouter } from '../../src/audio';
import { normalizeInput, validateProfile } from '../../src/controllers';
import { sampleShow, type ControllerProfile } from '../../src/domain';
import { InMemoryShowRepository, MediaImportTransaction, migrateSqlite, validateShowBundle, type ArchiveEntry, type MediaAssetRepository, type MediaImportPort, type PortableMediaAssetV1, type PortableShowV1, type ShowBundleManifestV1, type SqliteDriver, type SqliteExecutor } from '../../src/storage';
import { activePromotions, type PromoManifestV1 } from '../../src/promotions';

const subscription = { remove() {} };
describe('command and controller boundaries', () => {
  it('suppresses bounce duplicates and gives panic priority over queued work', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const dispatched: EngineCommand[] = [];
    let first = true;
    const engine: AudioEngine = { prepare: async () => undefined, dispatch: async (command: EngineCommand) => { dispatched.push(command); if (first) { first = false; await gate; } },
      subscribe: (_listener: (event: EngineEvent) => void) => subscription, shutdown: async () => undefined };
    const cancelled: EngineCommand[] = [];
    const router = new SerializedCommandRouter(engine, () => 1000, undefined, (commands) => cancelled.push(...commands));
    expect(router.enqueue({ type: 'TRIGGER_CUE', cueId: 'opening' }, 'button-1')).toBe(1);
    expect(router.enqueue({ type: 'TRIGGER_CUE', cueId: 'bed' }, 'button-2')).toBe(2);
    expect(router.enqueue({ type: 'TRIGGER_CUE', cueId: 'opening' }, 'button-1')).toBeNull();
    expect(router.enqueue({ type: 'PANIC_FADE' }, 'panic')).toBe(3);
    release(); await Promise.resolve(); await Promise.resolve();
    expect(dispatched.map((x) => x.type)).toEqual(['TRIGGER_CUE', 'PANIC_FADE']);
    expect(dispatched.map((x) => x.id)).toEqual([1, 3]);
    expect(cancelled.map((x) => x.id)).toEqual([1, 2]);
  });
  it('validates safety bindings and ignores key-up/repeat events', () => {
    const profile: ControllerProfile = { id: 'p', name: 'remote', bindings: [
      { inputKey: 'next', command: { type: 'GO' } }, { inputKey: 'back', command: { type: 'PANIC_FADE' } }] };
    expect(validateProfile(profile)).toEqual([]);
    const base = { adapterId: 'hid', deviceId: 'd', inputKey: 'next', monotonicMs: 1 };
    expect(normalizeInput({ ...base, phase: 'up', isRepeat: false }, profile)).toBeNull();
    expect(normalizeInput({ ...base, phase: 'down', isRepeat: true }, profile)).toBeNull();
    expect(normalizeInput({ ...base, phase: 'down', isRepeat: false }, profile)?.command.type).toBe('GO');
  });
});

describe('offline storage and import', () => {
  it('configures SQLite before applying sequential migrations transactionally', async () => {
    const calls: string[] = []; let userVersion = 0;
    const transaction: SqliteExecutor = {
      execute: async (sql) => { calls.push(`TX:${sql}`); const match = /user_version = (\d+)/.exec(sql); if (match?.[1]) userVersion = Number(match[1]); },
      first: async <T>() => ({ user_version: userVersion }) as T,
    };
    const driver: SqliteDriver = {
      execute: async (sql) => { calls.push(sql); const match = /user_version = (\d+)/.exec(sql); if (match?.[1]) userVersion = Number(match[1]); },
      first: async <T>() => ({ user_version: userVersion }) as T,
      exclusiveTransaction: async <T>(work: (executor: SqliteExecutor) => Promise<T>) => { calls.push('BEGIN'); const value = await work(transaction); calls.push('COMMIT'); return value; },
    };
    await expect(migrateSqlite(driver)).resolves.toBe(1);
    expect(calls.slice(0, 3)).toEqual(['PRAGMA foreign_keys = ON', 'PRAGMA journal_mode = WAL', 'BEGIN']);
    expect(calls.at(-1)).toBe('COMMIT');
    expect(calls).toContain('TX:PRAGMA user_version = 1');
  });
  it('returns defensive copies from the in-memory repository', async () => {
    const repository = new InMemoryShowRepository(); await repository.save(sampleShow);
    const loaded = await repository.get(sampleShow.id); expect(loaded).not.toBe(sampleShow);
    expect(await repository.list()).toEqual([{ id: 'show-demo', revisionId: 'rev-1', name: 'Theatre 45', updatedAt: sampleShow.updatedAt }]);
  });
  it('preserves reused canonical media when metadata persistence fails', async () => {
    const removed: string[] = []; const checksum = 'a'.repeat(64);
    const files: MediaImportPort = { stage: async () => ({ uri: 'tmp://x', bytes: 10 }), probe: async () => ({ durationMs: 2, codec: 'wav', channels: 2, sampleRate: 48000 }),
      sha256: async () => checksum, commit: async (_uri, managedName) => ({ uri: 'docs://media.wav', managedName, ownership: 'app-owned', bytes: 10, checksumSha256: checksum, created: false }), remove: async (uri) => { removed.push(uri); } };
    const assets: MediaAssetRepository = { get: async () => null, getByChecksum: async () => null, save: async () => { throw new Error('db'); }, delete: async () => undefined };
    await expect(new MediaImportTransaction(files, assets).import({ sourceUri: 'picker://x', displayName: 'x.wav' })).rejects.toThrow('db');
    expect(removed).toEqual(['tmp://x']);
  });
  it('deduplicates by checksum before committing a second canonical file', async () => {
    const checksum = 'd'.repeat(64); const existing = { ...sampleShow.media['media-open']!, checksumSha256: checksum };
    const commit = jest.fn<ReturnType<MediaImportPort['commit']>, Parameters<MediaImportPort['commit']>>();
    const files: MediaImportPort = { stage: async () => ({ uri: 'tmp://x', bytes: existing.bytes }), probe: async () => ({ durationMs: existing.durationMs, codec: existing.codec, channels: existing.channels, sampleRate: existing.sampleRate }),
      sha256: async () => checksum, commit, remove: async () => undefined };
    const assets: MediaAssetRepository = { get: async () => null, getByChecksum: async () => existing, save: async () => undefined, delete: async () => undefined };
    await expect(new MediaImportTransaction(files, assets).import({ sourceUri: 'picker://x', displayName: 'x.wav' })).resolves.toEqual(existing);
    expect(commit).not.toHaveBeenCalled();
  });
  it('rejects a commit that cannot attest app ownership, bytes, and checksum', async () => {
    const checksum = 'e'.repeat(64);
    const files: MediaImportPort = { stage: async () => ({ uri: 'tmp://x', bytes: 10 }), probe: async () => ({ durationMs: 2, codec: 'wav', channels: 2, sampleRate: 48000 }),
      sha256: async () => checksum, commit: async (_uri, managedName) => ({ uri: 'cache://media.wav', managedName, ownership: 'app-owned', bytes: 9, checksumSha256: checksum, created: true }), remove: async () => undefined };
    const save = jest.fn();
    const assets: MediaAssetRepository = { get: async () => null, getByChecksum: async () => null, save, delete: async () => undefined };
    await expect(new MediaImportTransaction(files, assets).import({ sourceUri: 'picker://x', displayName: 'x.wav' })).rejects.toThrow('attestation');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('showbundle and promotion isolation', () => {
  const sha = 'b'.repeat(64); const path = 'media/track.wav';
  const portableMedia: PortableMediaAssetV1 = { id: 'media-open', checksumSha256: sha, bundlePath: path, bytes: 10, durationMs: 78_000, codec: 'wav', channels: 2, sampleRate: 48_000 };
  type PortableHasLocalUri = 'localUri' extends keyof PortableMediaAssetV1 ? true : false;
  const portableHasLocalUri: PortableHasLocalUri = false;
  const portableShow: PortableShowV1 = { ...sampleShow,
    cues: { opening: sampleShow.cues.opening! },
    sets: [{ id: 'set-main', name: 'Main show', cueOrder: ['opening'], hitCueIds: [] }],
    media: { 'media-open': portableMedia } };
  const profile: ControllerProfile = { id: 'profile-stage', name: 'Stage', bindings: [
    { inputKey: 'go', command: { type: 'GO' } },
    { inputKey: 'panic', command: { type: 'PANIC_FADE' } },
  ] };
  const manifest: ShowBundleManifestV1 = { format: 'showbundle', schemaVersion: 1, exportId: 'e', show: portableShow, controllerProfiles: [profile],
    files: [{ path, sha256: sha, bytes: 10, mediaAssetId: 'media-open' }] };
  const entries: ArchiveEntry[] = [{ path: 'manifest.json', kind: 'file', bytes: 10, compressedBytes: 10, sha256: 'c'.repeat(64) }, { path, kind: 'file', bytes: 10, compressedBytes: 8, sha256: sha }];
  it('accepts exact archives and rejects traversal, future schema, and bombs', () => {
    expect(portableHasLocalUri).toBe(false);
    expect(validateShowBundle(manifest, entries).ok).toBe(true);
    for (const unsafe of ['../x', '/x', 'C:/x', 'media\\x'])
      expect(validateShowBundle({ ...manifest, files: [{ ...manifest.files[0], path: unsafe }] }, entries).ok).toBe(false);
    expect(validateShowBundle({ ...manifest, schemaVersion: 2 }, entries).ok).toBe(false);
    expect(validateShowBundle(manifest, [{ ...entries[1]!, bytes: 1000, compressedBytes: 1 }], { maxFiles: 2, maxFileBytes: 100, maxTotalBytes: 100, maxCompressionRatio: 10 }).ok).toBe(false);
  });
  it('rejects hostile numeric metadata, reserved manifest payloads, and local paths', () => {
    expect(validateShowBundle(manifest, [{ ...entries[0]!, bytes: Number.NaN }, entries[1]!]).ok).toBe(false);
    expect(validateShowBundle(manifest, [entries[0]!, { ...entries[1]!, compressedBytes: -1 }]).ok).toBe(false);
    expect(() => validateShowBundle(manifest, [entries[0]!, { ...entries[1]!, path: null } as unknown as ArchiveEntry])).not.toThrow();
    expect(validateShowBundle(manifest, [entries[0]!, { ...entries[1]!, path: null } as unknown as ArchiveEntry]).ok).toBe(false);
    const reserved = { ...manifest, show: { ...manifest.show, media: { 'media-open': { ...portableMedia, bundlePath: 'manifest.json' } } },
      files: [{ ...manifest.files[0]!, path: 'manifest.json' }] };
    expect(validateShowBundle(reserved, entries).ok).toBe(false);
    const withLocalUri = { ...manifest, show: { ...manifest.show, media: { 'media-open': { ...portableMedia, localUri: 'file:///private/track.wav' } } } };
    expect(validateShowBundle(withLocalUri, entries).ok).toBe(false);
  });
  it('rejects invalid cue references and missing portable controller profiles', () => {
    const invalidShow = { ...manifest, show: { ...manifest.show, sets: [{ ...manifest.show.sets[0]!, cueOrder: ['missing'] }] } };
    const invalid = validateShowBundle(invalidShow, entries);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.issues.some((issue) => issue.code === 'INVALID_SHOW')).toBe(true);
    const missingController = validateShowBundle({ ...manifest, controllerProfiles: [] }, entries);
    expect(missingController.ok).toBe(false);
    if (!missingController.ok) expect(missingController.issues.some((issue) => issue.code === 'INVALID_SHOW')).toBe(true);
  });
  it('filters time-boxed promos without involving playback state', () => {
    const promos: PromoManifestV1 = { schemaVersion: 1, revision: 1, placements: [
      { id: 'active', surface: 'settings', title: 'A', body: 'B', actionLabel: 'Open', actionUrl: 'https://example.test', startsAtEpochMs: 10, endsAtEpochMs: 20 },
      { id: 'later', surface: 'library', title: 'L', body: 'B', actionLabel: 'Open', actionUrl: 'https://example.test', startsAtEpochMs: 30 }] };
    expect(activePromotions(promos, 15).map((x) => x.id)).toEqual(['active']);
  });
  it('rejects unsafe promotion URLs and enforces an optional first-party host allowlist', () => {
    const base = { id: 'promo', surface: 'settings' as const, title: 'A', body: 'B', actionLabel: 'Open' };
    const manifestFor = (actionUrl: string): PromoManifestV1 => ({ schemaVersion: 1, revision: 1, placements: [{ ...base, actionUrl }] });
    expect(activePromotions(manifestFor('http://promo.example/path'), 15)).toEqual([]);
    expect(activePromotions(manifestFor('https://user:pass@promo.example/path'), 15)).toEqual([]);
    expect(activePromotions(manifestFor('https://promo.example/path'), 15, ['other.example'])).toEqual([]);
    expect(activePromotions(manifestFor('https://promo.example/path'), 15, ['promo.example'])).toHaveLength(1);
  });
});
