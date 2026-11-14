import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import * as Sharing from 'expo-sharing';
import ShowAudio from '../../modules/show-audio';
import ShowVisual from '../../modules/show-visual';
import { compileRunSnapshot, type ControllerProfile } from '../../src/domain';
import { newAudioCue, newShow } from '../../src/library/operations';
import { DEFAULT_LIBRARY_SETTINGS, type LibrarySnapshot } from '../../src/library/types';
import { exportLibraryBackup, importLibraryBackup, shareLibraryBackup } from '../../src/storage/backup';
import { makeLibraryManifest, type LibraryBundleManifest } from '../../src/storage/library-bundle';
import { beginFileJob, cleanupAbandonedStaging, ensureLibraryDirectories, ExpoMediaFiles, libraryDirectory } from '../../src/storage/media-files';
import { listProfiles, migrateLibrary, readSetting, SqliteShowRepository, writeSetting } from '../../src/storage/sqlite';
import { writeStoredZip } from '../../src/storage/zip';

let mockDocumentUri = '';
let mockDeleteFailure = false;
jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual<typeof import('node:crypto')>('node:crypto').randomUUID() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('../../modules/show-audio', () => ({ __esModule: true, default: {
  probeMedia: async () => ({ durationMs: 30000, codec: 'pcm', channels: 1, sampleRate: 44100 }),
  sha256File: jest.fn(async (uri: string) => jest.requireActual<typeof import('node:crypto')>('node:crypto').createHash('sha256').update(jest.requireActual<typeof import('node:fs')>('node:fs').readFileSync(jest.requireActual<typeof import('node:url')>('node:url').fileURLToPath(uri))).digest('hex')),
} }));
jest.mock('../../modules/show-visual', () => ({ __esModule: true, default: { probeVisual: jest.fn() } }));
jest.mock('expo-file-system', () => {
  const fs = jest.requireActual<typeof import('node:fs')>('node:fs'); const url = jest.requireActual<typeof import('node:url')>('node:url');
  const uri = (parts: (string | { uri: string })[]) => parts.map((part) => typeof part === 'string' ? part : part.uri).reduce((base, part) => `${base.replace(/\/$/, '')}/${part}`, '').slice(1);
  class File {
    uri: string; constructor(...parts: (string | { uri: string })[]) { this.uri = uri(parts); }
    get name() { return this.uri.split('/').at(-1)!; } get exists() { return fs.existsSync(url.fileURLToPath(this.uri)); } get size() { return fs.statSync(url.fileURLToPath(this.uri)).size; }
    create() { const path = url.fileURLToPath(this.uri); fs.mkdirSync(jest.requireActual<typeof import('node:path')>('node:path').dirname(path), { recursive: true }); fs.writeFileSync(path, new Uint8Array(), { flag: 'wx' }); }
    async copy(destination: File) { fs.copyFileSync(url.fileURLToPath(this.uri), url.fileURLToPath(destination.uri)); }
    async move(destination: File) { fs.renameSync(url.fileURLToPath(this.uri), url.fileURLToPath(destination.uri)); this.uri = destination.uri; }
    delete() { fs.unlinkSync(url.fileURLToPath(this.uri)); } info() { return { modificationTime: fs.statSync(url.fileURLToPath(this.uri)).mtimeMs }; }
    open() { const fd = fs.openSync(url.fileURLToPath(this.uri), 'r+'); return { offset: 0, readBytes(length: number) { const data = Buffer.alloc(length); const count = fs.readSync(fd, data, 0, length, this.offset); this.offset += count; return data.subarray(0, count); }, writeBytes(bytes: Uint8Array) { fs.writeSync(fd, bytes, 0, bytes.length, this.offset); this.offset += bytes.length; }, close() { fs.closeSync(fd); } }; }
  }
  class Directory {
    uri: string; constructor(...parts: (string | { uri: string })[]) { this.uri = uri(parts); }
    get name() { return this.uri.split('/').filter(Boolean).at(-1)!; } get exists() { return fs.existsSync(url.fileURLToPath(this.uri)); }
    create() { fs.mkdirSync(url.fileURLToPath(this.uri), { recursive: true }); } info() { return { modificationTime: fs.statSync(url.fileURLToPath(this.uri)).mtimeMs }; }
    list() { return fs.readdirSync(url.fileURLToPath(this.uri)).map((name) => fs.statSync(url.fileURLToPath(`${this.uri}/${name}`)).isDirectory() ? new Directory(this, name) : new File(this, name)); }
    delete() { if (mockDeleteFailure) throw new Error('cleanup unavailable'); fs.rmSync(url.fileURLToPath(this.uri), { recursive: true }); }
  }
  return { Directory, File, Paths: { get document() { return mockDocumentUri; }, availableDiskSpace: 10_000_000_000 } };
});
let root = ''; let snapshot: LibrarySnapshot;
beforeEach(() => {
  jest.clearAllMocks(); mockDeleteFailure = false; jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true); jest.mocked(Sharing.shareAsync).mockResolvedValue(undefined);
  root = mkdtempSync(join(tmpdir(), 'show-backup-')); mockDocumentUri = pathToFileURL(join(root, 'documents')).href; ensureLibraryDirectories();
  const bytes = Buffer.alloc(600_000, 17); const checksum = createHash('sha256').update(bytes).digest('hex');
  const mediaPath = join(fileURLToPath(libraryDirectory().uri), 'media', `${checksum}.wav`); writeFileSync(mediaPath, bytes);
  const show = newShow('Fixture', randomUUID, () => '2026-10-14T00:00:00Z'); const cue = newAudioCue('audio', 'Opening', randomUUID);
  const media = { id: 'audio', checksumSha256: checksum, localUri: pathToFileURL(mediaPath).href, bytes: bytes.length, durationMs: 30000, codec: 'pcm', channels: 1, sampleRate: 44100 };
  snapshot = { status: 'ready', saving: false, shows: [{ ...show, cues: { [cue.id]: cue }, media: { audio: media }, sets: [{ ...show.sets[0]!, cueOrder: [cue.id] }], voiceRules: [{ id: 'rule', phrases: ['applause'], locale: 'en', enabled: true, action: { type: 'GO' }, delayMs: 0 }] }], controllerProfiles: [], settings: DEFAULT_LIBRARY_SETTINGS, selectedShowId: show.id, selectedSetId: show.sets[0]!.id };
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
function database() {
  const raw = new DatabaseSync(':memory:'); const port = {
    execAsync: async (sql: string) => raw.exec(sql),
    runAsync: async (sql: string, ...values: unknown[]) => raw.prepare(sql).run(...values as (string | number | null)[]),
    getFirstAsync: async (sql: string, ...values: unknown[]) => raw.prepare(sql).get(...values as (string | number | null)[]) ?? null,
    getAllAsync: async (sql: string, ...values: unknown[]) => raw.prepare(sql).all(...values as (string | number | null)[]),
    withExclusiveTransactionAsync: async (work: (tx: unknown) => Promise<void>) => { raw.exec('BEGIN IMMEDIATE'); try { await work(port); raw.exec('COMMIT'); } catch (error) { raw.exec('ROLLBACK'); throw error; } },
  }; return { db: port as unknown as SQLiteDatabase, close: () => raw.close() };
}
const imageBytes = () => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j28sAAAAASUVORK5CYII=', 'base64');
function waveBytes() {
  const bytes = Buffer.alloc(4044); bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(4000, 40); return bytes;
}
async function writeFixtureArchive(manifest: LibraryBundleManifest, path: string, payload: Uint8Array): Promise<string> {
  const text = Buffer.from(JSON.stringify(manifest)); const chunks: Uint8Array[] = [];
  await writeStoredZip([{ path: 'manifest.json', bytes: text.length, read: async (offset, length) => text.subarray(offset, offset + length) }, { path, bytes: payload.length, read: async (offset, length) => payload.subarray(offset, offset + length) }], { write: async (bytes) => { chunks.push(bytes); } });
  const destination = join(root, 'crossed-payload.zip'); writeFileSync(destination, Buffer.concat(chunks)); return pathToFileURL(destination).href;
}
describe('complete backup workflow and conservative cleanup', () => {
  it.each(['empty', 'GO only', 'unavailable Hit'] as const)('round trips an attached %s profile as preserved, unbound authoring data without making it runnable', async (kind) => {
    const fixture = database(); const show = snapshot.shows[0]!;
    const profile: ControllerProfile = { id: 'profile-in-progress', name: 'Learning buttons', bindings: kind === 'empty' ? [] : [
      { inputKey: 'KEYCODE_MEDIA_NEXT', adapterId: 'generic-native', deviceId: 'private-pedal', command: { type: 'GO' } },
      ...(kind === 'unavailable Hit' ? [
        { inputKey: 'KEYCODE_MEDIA_PREVIOUS', adapterId: 'generic-native', deviceId: 'private-pedal', command: { type: 'PANIC_FADE' as const } },
        { inputKey: 'KEYCODE_H', adapterId: 'generic-native', deviceId: 'private-pedal', command: { type: 'TRIGGER_HIT' as const, cueId: 'removed-Hit' } },
      ] : []),
    ] };
    snapshot = { ...snapshot, shows: [{ ...show, controllerProfileId: profile.id }], controllerProfiles: [profile] };
    try {
      await migrateLibrary(fixture.db, async () => undefined);
      const protectedShow = newShow('Retained work', randomUUID, () => '2026-10-14T00:00:00Z'); await new SqliteShowRepository(fixture.db).save(protectedShow);
      const uri = await exportLibraryBackup(snapshot, { share: false });
      expect(Sharing.shareAsync).not.toHaveBeenCalled(); expect(JSON.stringify(snapshot.controllerProfiles)).toContain(kind === 'empty' ? 'Learning buttons' : 'private-pedal');
      await expect(importLibraryBackup(fixture.db, { sourceUri: uri, displayName: 'drafts.zip' })).resolves.toBe(1);
      const shows = await new SqliteShowRepository(fixture.db).all(); const restored = shows.find((value) => value.name === show.name)!; const profiles = await listProfiles(fixture.db);
      expect(shows.find((value) => value.id === protectedShow.id)).toEqual(protectedShow);
      expect(restored.id).not.toBe(show.id); expect(restored.controllerProfileId).not.toBe(profile.id); expect(restored.controllerProfileId).toBe(profiles[0]!.id);
      expect(profiles[0]!.bindings.map((binding) => ({ inputKey: binding.inputKey, command: binding.command }))).toEqual(profile.bindings.map((binding) => ({ inputKey: binding.inputKey, command: binding.command })));
      expect(profiles[0]!.bindings.every((binding) => binding.adapterId === 'unbound')).toBe(true); expect(JSON.stringify(profiles)).not.toContain('private-pedal');
      expect(compileRunSnapshot(restored, restored.sets[0]!.id, profiles).ok).toBe(false);
      expect(restored.sets[0]!.cueOrder).toEqual(show.sets[0]!.cueOrder); expect(restored.voiceRules).toEqual(show.voiceRules);
    } finally { fixture.close(); }
  });

  it('rejects a missing attached controller profile before probing, promoting or changing any library record', async () => {
    const fixture = database(); const audioProbe = jest.spyOn(ShowAudio, 'probeMedia'); const promote = jest.spyOn(ExpoMediaFiles.prototype, 'commit');
    try {
      await migrateLibrary(fixture.db, async () => undefined);
      const protectedShow = newShow('Existing library', randomUUID, () => '2026-10-14T00:00:00Z'); await new SqliteShowRepository(fixture.db).save(protectedShow);
      await writeSetting(fixture.db, 'preferences', { ...DEFAULT_LIBRARY_SETTINGS, theme: 'cobra' });
      const tables = ['shows', 'show_revisions', 'media_assets', 'controller_profiles', 'library_settings'];
      const rows = () => Promise.all(tables.map((table) => fixture.db.getAllAsync(`SELECT * FROM ${table} ORDER BY rowid`)));
      const before = await rows(); const source = { ...snapshot.shows[0]!, controllerProfileId: 'missing-profile' };
      const manifest = makeLibraryManifest([source], [], snapshot.settings, source.id, source.sets[0]!.id, randomUUID());
      const uri = await writeFixtureArchive(manifest, manifest.files[0]!.path, readFileSync(fileURLToPath(source.media.audio!.localUri)));
      const completed = jest.fn();
      await expect(importLibraryBackup(fixture.db, { sourceUri: uri, displayName: 'missing-profile.zip' }, undefined, { onResult: completed })).rejects.toThrow(/missing controller profile/i);
      expect(await rows()).toEqual(before); expect(completed).not.toHaveBeenCalled(); expect(audioProbe).not.toHaveBeenCalled(); expect(promote).not.toHaveBeenCalled();
    } finally { audioProbe.mockRestore(); promote.mockRestore(); fixture.close(); }
  });

  it.each(['audio', 'visual'] as const)('rejects a crossed-folder %s asset before native probing, promotion or any library mutation', async (kind) => {
    const fixture = database(); const audioProbe = jest.spyOn(ShowAudio, 'probeMedia'); const promote = jest.spyOn(ExpoMediaFiles.prototype, 'commit'); const visualProbe = jest.mocked(ShowVisual.probeVisual);
    try {
      await migrateLibrary(fixture.db, async () => undefined);
      const protectedShow = newShow('Existing work', randomUUID, () => '2026-10-14T00:00:00Z'); await new SqliteShowRepository(fixture.db).save(protectedShow);
      await writeSetting(fixture.db, 'preferences', { ...DEFAULT_LIBRARY_SETTINGS, theme: 'cobra' });
      await writeSetting(fixture.db, 'selection', { showId: protectedShow.id, setId: protectedShow.sets[0]!.id });
      const tables = ['shows', 'show_revisions', 'media_assets', 'controller_profiles', 'library_settings'] as const;
      const rows = () => Promise.all(tables.map((table) => fixture.db.getAllAsync(`SELECT * FROM ${table} ORDER BY rowid`)));
      const before = await rows(); const base = fileURLToPath(libraryDirectory().uri);
      const canonicalBefore = { media: readdirSync(join(base, 'media')), visuals: readdirSync(join(base, 'visuals')) };
      // The wrong decoder would accept the bytes; the asset declaration must
      // choose its own validated folder before any native inspection occurs.
      const bytes = kind === 'audio' ? imageBytes() : waveBytes(); const checksum = createHash('sha256').update(bytes).digest('hex');
      const source = snapshot.shows[0]!; const asset = source.media.audio!;
      const declared = kind === 'audio' ? { ...source, media: { audio: { ...asset, checksumSha256: checksum, bytes: bytes.length, localUri: 'file:///fixture/source.png' } } }
        : { ...source, media: {}, cues: {}, sets: source.sets.map((set) => ({ ...set, cueOrder: [], hitCueIds: [] })), visualAssets: { screen: { id: 'screen', kind: 'image' as const, checksumSha256: checksum, localUri: 'file:///fixture/source.wav', bytes: bytes.length, mimeType: 'image/png', width: 1, height: 1 } }, fallbackVisualAssetId: 'screen' };
      const manifest = makeLibraryManifest([declared], [], snapshot.settings, declared.id, declared.sets[0]!.id, randomUUID()); const original = manifest.shows[0]!;
      const wrongPath = `${kind === 'audio' ? 'visuals' : 'media'}/${checksum}.${kind === 'audio' ? 'png' : 'wav'}`;
      const changedShow = kind === 'audio' ? { ...original, media: { audio: { ...original.media.audio!, bundlePath: wrongPath } } }
        : { ...original, visualAssets: { screen: { ...original.visualAssets.screen!, bundlePath: wrongPath } } };
      const changed = { ...manifest, shows: [changedShow], files: [{ ...manifest.files[0]!, path: wrongPath }] };
      const uri = await writeFixtureArchive(changed, wrongPath, bytes); const completed = jest.fn();
      if (kind === 'audio') { audioProbe.mockRejectedValue(new Error('PNG is not audio')); visualProbe.mockResolvedValue({ kind: 'image', width: 1, height: 1, mimeType: 'image/png' }); }
      else { audioProbe.mockResolvedValue({ durationMs: 250, codec: 'pcm', channels: 1, sampleRate: 8000 }); visualProbe.mockRejectedValue(new Error('WAV is not an image')); }
      await expect(importLibraryBackup(fixture.db, { sourceUri: uri, displayName: 'crossed-payload.zip' }, undefined, { onResult: completed })).rejects.toThrow('Backup manifest');
      expect(audioProbe).not.toHaveBeenCalled(); expect(visualProbe).not.toHaveBeenCalled(); expect(promote).not.toHaveBeenCalled(); expect(completed).not.toHaveBeenCalled();
      expect(await rows()).toEqual(before); expect(readdirSync(join(base, 'media'))).toEqual(canonicalBefore.media); expect(readdirSync(join(base, 'visuals'))).toEqual(canonicalBefore.visuals); expect(readdirSync(join(base, 'staging'))).toEqual([]);
      expect(readFileSync(fileURLToPath(asset.localUri))).toHaveLength(asset.bytes);
    } finally { audioProbe.mockRestore(); visualProbe.mockReset(); promote.mockRestore(); fixture.close(); }
  });
  it('round-trips mixed audio and visuals with attached covers, settings and inert restored controllers', async () => {
    const fixture = database(); const audioProbe = jest.spyOn(ShowAudio, 'probeMedia'); const visualProbe = jest.mocked(ShowVisual.probeVisual);
    try {
      const bytes = imageBytes(); const checksum = createHash('sha256').update(bytes).digest('hex'); const path = join(fileURLToPath(libraryDirectory().uri), 'visuals', `${checksum}.png`); writeFileSync(path, bytes);
      const source = snapshot.shows[0]!; const cue = Object.values(source.cues)[0]!;
      if (cue.type !== 'audio') throw new Error('Audio fixture required');
      const profile = { id: 'source-profile', name: 'Source controller', bindings: [{ adapterId: 'generic-native', deviceId: 'private-pedal', inputKey: 'KEYCODE_PAGE_DOWN', command: { type: 'GO' as const } }, { adapterId: 'generic-native', deviceId: 'private-pedal', inputKey: 'KEYCODE_PAGE_UP', command: { type: 'PANIC_FADE' as const } }] };
      const mixed = { ...snapshot, shows: [{ ...source, controllerProfileId: profile.id, cues: { [cue.id]: { ...cue, artworkAssetId: 'screen', visualAssetId: 'screen' } }, visualAssets: { screen: { id: 'screen', kind: 'image' as const, checksumSha256: checksum, localUri: pathToFileURL(path).href, bytes: bytes.length, mimeType: 'image/png', width: 1, height: 1 } }, fallbackVisualAssetId: 'screen' }], controllerProfiles: [profile], settings: { ...snapshot.settings, locale: 'he' as const, theme: 'purpleNight' as const, externalDisplayEnabled: true } };
      const uri = await exportLibraryBackup(mixed, { share: false }); await migrateLibrary(fixture.db, async () => undefined);
      visualProbe.mockResolvedValue({ kind: 'image', width: 1, height: 1, mimeType: 'image/png' });
      expect(await importLibraryBackup(fixture.db, { sourceUri: uri, displayName: 'mixed.zip' })).toBe(1);
      const restored = (await new SqliteShowRepository(fixture.db).all())[0]!; const restoredCue = restored.cues[cue.id];
      expect(restoredCue).toMatchObject({ artworkAssetId: 'screen', visualAssetId: 'screen' }); expect(restored.fallbackVisualAssetId).toBe('screen');
      expect(readFileSync(fileURLToPath(restored.media.audio!.localUri))).toEqual(readFileSync(fileURLToPath(source.media.audio!.localUri)));
      expect(readFileSync(fileURLToPath(restored.visualAssets!.screen!.localUri))).toEqual(bytes);
      expect(audioProbe).toHaveBeenCalledTimes(1); expect(visualProbe).toHaveBeenCalledTimes(1);
      expect(await readSetting(fixture.db, 'preferences', null)).toMatchObject({ locale: 'he', theme: 'purpleNight', externalDisplayEnabled: false });
      const profiles = await listProfiles(fixture.db); expect(profiles).toHaveLength(1); expect(restored.controllerProfileId).toBe(profiles[0]!.id); expect(profiles[0]!.id).not.toBe(profile.id);
      expect(profiles[0]!.bindings.map((binding) => binding.adapterId)).toEqual(['unbound', 'unbound']); expect(JSON.stringify(profiles)).not.toContain('private-pedal');
    } finally { audioProbe.mockRestore(); visualProbe.mockReset(); fixture.close(); }
  });
  it('preserves the saved ZIP after a failed share and shares that same file without another hash/export', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false); let saved = ''; const results: unknown[] = [];
    await expect(exportLibraryBackup(snapshot, { onSaved: (uri) => { saved = uri; }, onResult: (value) => results.push(value) })).rejects.toThrow('saved');
    expect(existsSync(fileURLToPath(saved))).toBe(true); expect(results).toEqual([expect.objectContaining({ kind: 'export', shows: 1, playlists: 1, songs: 1, files: 1 })]);
    const hashes = jest.mocked(ShowAudio.sha256File).mock.calls.length; await shareLibraryBackup(saved);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(saved, expect.any(Object)); expect(jest.mocked(ShowAudio.sha256File).mock.calls).toHaveLength(hashes);
    expect(readdirSync(join(fileURLToPath(libraryDirectory().uri), 'backups'))).toHaveLength(1);
  });
  it('cancels partial export, cleans only its partial archive and retains immutable media', async () => {
    const controller = new AbortController();
    await expect(exportLibraryBackup(snapshot, { share: false, signal: controller.signal, onProgress: (value) => { if (value.stage === 'writing' && value.completedBytes > 10_000) controller.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(readdirSync(join(fileURLToPath(libraryDirectory().uri), 'backups'))).toEqual([]); expect(readFileSync(fileURLToPath(snapshot.shows[0]!.media.audio!.localUri))).toHaveLength(600_000); expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
  it('reports a missing saved ZIP before opening the share sheet', async () => {
    const uri = pathToFileURL(join(fileURLToPath(libraryDirectory().uri), 'backups', `Show-Control-2026-10-14-${randomUUID()}.zip`)).href;
    await expect(shareLibraryBackup(uri)).rejects.toThrow('BACKUP_FILE_MISSING'); expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
  it.each(['validating', 'saving'] as const)('cancels %s restore without changing the committed library or retaining staging', async (stage) => {
    const uri = await exportLibraryBackup(snapshot, { share: false }); const fixture = database(); const controller = new AbortController();
    try {
      await migrateLibrary(fixture.db, async () => undefined); await new SqliteShowRepository(fixture.db).save(snapshot.shows[0]!);
      await expect(importLibraryBackup(fixture.db, { sourceUri: uri, displayName: 'backup.zip' }, undefined, { signal: controller.signal, onProgress: (value) => { if (value.stage === stage) controller.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
      expect((await new SqliteShowRepository(fixture.db).all()).map((show) => show.id)).toEqual([snapshot.shows[0]!.id]); expect(readdirSync(join(fileURLToPath(libraryDirectory().uri), 'staging'))).toEqual([]);
    } finally { fixture.close(); }
  });
  it('restores complete tuning and voice data with truthful result counts and independent identities', async () => {
    const uri = await exportLibraryBackup(snapshot, { share: false }); const fixture = database(); const result = jest.fn();
    try {
      await migrateLibrary(fixture.db, async () => undefined);
      expect(await importLibraryBackup(fixture.db, { sourceUri: uri, displayName: 'backup.zip' }, undefined, { onResult: result })).toBe(1);
      const restored = (await new SqliteShowRepository(fixture.db).all())[0]!; expect(restored.id).not.toBe(snapshot.shows[0]!.id); expect(restored.voiceRules).toEqual(snapshot.shows[0]!.voiceRules);
      expect(result).toHaveBeenCalledWith({ kind: 'restore', shows: 1, playlists: 1, songs: 1, files: 1 });
    } finally { fixture.close(); }
  });
  it('repairs damaged shared audio from a verified backup and preserves the damaged original for recovery', async () => {
    const uri = await exportLibraryBackup(snapshot, { share: false }); const fixture = database();
    const original = snapshot.shows[0]!.media.audio!; const mediaPath = fileURLToPath(original.localUri);
    const verifiedBytes = readFileSync(mediaPath); const damagedBytes = Buffer.from('damaged app-owned audio'); writeFileSync(mediaPath, damagedBytes);
    try {
      await migrateLibrary(fixture.db, async () => undefined); await new SqliteShowRepository(fixture.db).save(snapshot.shows[0]!);
      expect(await importLibraryBackup(fixture.db, { sourceUri: uri, displayName: 'backup.zip' })).toBe(1);
      expect(readFileSync(mediaPath).equals(verifiedBytes)).toBe(true);
      const recovery = join(fileURLToPath(libraryDirectory().uri), 'recovery'); const preserved = readdirSync(recovery);
      expect(preserved).toHaveLength(1); expect(readFileSync(join(recovery, preserved[0]!)).equals(damagedBytes)).toBe(true);
      expect(await new SqliteShowRepository(fixture.db).all()).toHaveLength(2);
    } finally { fixture.close(); }
  });
  it('does not report a committed restore as failed when a UI observer or temporary cleanup fails', async () => {
    const uri = await exportLibraryBackup(snapshot, { share: false, onSaved: () => { throw new Error('observer unavailable'); } }); const fixture = database();
    try {
      await migrateLibrary(fixture.db, async () => undefined); mockDeleteFailure = true;
      expect(await importLibraryBackup(fixture.db, { sourceUri: uri, displayName: 'backup.zip' }, undefined, { onResult: () => { throw new Error('observer unavailable'); } })).toBe(1);
      expect(await new SqliteShowRepository(fixture.db).all()).toHaveLength(1);
    } finally { fixture.close(); }
  });
  it('only removes old recognized temporaries while idle, preserving recent, unknown, canonical and saved files', () => {
    const base = fileURLToPath(libraryDirectory().uri); const old = new Date(Date.now() - 2 * 86400000); const make = (relative: string) => { const path = join(base, relative); writeFileSync(path, 'temporary'); utimesSync(path, old, old); return path; };
    const abandoned = make(`staging/${randomUUID()}.stage`); const partial = make(`backups/${randomUUID()}.partial`); const unknown = make('staging/user-important.txt'); const saved = make(`backups/Show-Control-2026-10-14-${randomUUID()}.zip`);
    const recent = join(base, 'staging', `${randomUUID()}.stage`); writeFileSync(recent, 'fresh'); const active = beginFileJob(); expect(cleanupAbandonedStaging()).toBe(0); active();
    expect(cleanupAbandonedStaging(Date.now(), () => false)).toBe(0); expect(cleanupAbandonedStaging()).toBe(2);
    expect(existsSync(abandoned)).toBe(false); expect(existsSync(partial)).toBe(false); for (const path of [unknown, recent, saved, fileURLToPath(snapshot.shows[0]!.media.audio!.localUri)]) expect(existsSync(path)).toBe(true);
    expect(statSync(saved).size).toBeGreaterThan(0);
  });
  it('retains a backup staging directory if any child is new or unknown', () => {
    const base = fileURLToPath(libraryDirectory().uri); const directory = join(base, 'staging', randomUUID()); mkdirSync(directory); writeFileSync(join(directory, 'archive.zip'), 'new'); const old = new Date(Date.now() - 2 * 86400000); utimesSync(directory, old, old);
    expect(cleanupAbandonedStaging()).toBe(0); utimesSync(join(directory, 'archive.zip'), old, old); writeFileSync(join(directory, 'unknown'), 'keep'); utimesSync(join(directory, 'unknown'), old, old); utimesSync(directory, old, old); expect(cleanupAbandonedStaging()).toBe(0); expect(existsSync(directory)).toBe(true);
  });
});
