import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getDocumentAsync } from 'expo-document-picker';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { MediaAsset } from '../../src/domain';
import { MediaImportTransaction, type MediaAssetRepository } from '../../src/storage/contracts';
import { ExpoMediaFiles, libraryDirectory } from '../../src/storage/media-files';
import { importLibraryBackup } from '../../src/storage/backup';

let mockDocumentUri = '';
let mockCopyFailure = false;
let mockPromotionFailure = false;
let mockDeleteFailure = false;
let mockFreeSpace = 10_000_000_000;
const mockCopies: (() => void)[] = [];
jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual<typeof import('node:crypto')>('node:crypto').randomUUID() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('../../modules/show-audio', () => ({ __esModule: true, default: {
  probeMedia: async () => ({ durationMs: 30000, codec: 'pcm', channels: 1, sampleRate: 44100 }),
  sha256File: async (uri: string) => jest.requireActual<typeof import('node:crypto')>('node:crypto').createHash('sha256')
    .update(jest.requireActual<typeof import('node:fs')>('node:fs').readFileSync(jest.requireActual<typeof import('node:url')>('node:url').fileURLToPath(uri))).digest('hex'),
} }));
jest.mock('expo-file-system', () => {
  const fs = jest.requireActual<typeof import('node:fs')>('node:fs');
  const uriPath = (uri: string) => jest.requireActual<typeof import('node:url')>('node:url').fileURLToPath(uri);
  const uri = (parts: (string | { uri: string })[]) => parts.map((part) => typeof part === 'string' ? part : part.uri).reduce((base, part) => `${base.replace(/\/$/, '')}/${part}`, '').slice(1);
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = uri(parts); }
    create() { fs.mkdirSync(uriPath(this.uri), { recursive: true }); }
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = uri(parts); }
    get exists() { return fs.existsSync(uriPath(this.uri)); }
    get size() { return this.exists ? fs.statSync(uriPath(this.uri)).size : null; }
    copy(destination: File): Promise<void> {
      // SDK 57's native coroutine finishes after the JavaScript call returns.
      return new Promise((resolve, reject) => mockCopies.push(() => {
        try {
          if (mockCopyFailure) { fs.writeFileSync(uriPath(destination.uri), fs.readFileSync(uriPath(this.uri)).subarray(0, 32)); throw new Error('native copy failed'); }
          fs.copyFileSync(uriPath(this.uri), uriPath(destination.uri)); resolve();
        } catch (error) { reject(error); }
      }));
    }
    move(destination: File): Promise<void> {
      return new Promise((resolve, reject) => mockCopies.push(() => {
        try {
          if (mockPromotionFailure && this.uri.includes('/staging/') && destination.uri.includes('/media/')) throw new Error('native promotion failed');
          fs.renameSync(uriPath(this.uri), uriPath(destination.uri)); this.uri = destination.uri; resolve();
        }
        catch (error) { reject(error); }
      }));
    }
    delete() { if (mockDeleteFailure) throw new Error('native cleanup failed'); fs.unlinkSync(uriPath(this.uri)); }
  }
  return { Directory, File, Paths: { get document() { return mockDocumentUri; }, get availableDiskSpace() { return mockFreeSpace; } } };
});

const settle = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };
const finishNativeCopies = async () => { for (let index = 0; index < 20; index++) { await settle(); if (!mockCopies.length) return; mockCopies.shift()!(); } throw new Error('Unexpected copy loop'); };
let root = '';
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'show-import-')); mockDocumentUri = pathToFileURL(join(root, 'documents')).href; mockCopyFailure = false; mockPromotionFailure = false; mockDeleteFailure = false; mockFreeSpace = 10_000_000_000; mockCopies.length = 0; });
afterEach(() => {
  if (!resolve(root).startsWith(resolve(join(tmpdir(), 'show-import-')))) throw new Error('Unexpected test cleanup path');
  rmSync(root, { recursive: true, force: true });
});

describe('asynchronous native file-copy import boundary', () => {
  it.each(['parent', 'encoded-parent', 'nested-parent', 'arbitrary', 'query', 'fragment'] as const)('rejects %s cleanup paths without deleting canonical or unrelated files', async (variant) => {
    const files = new ExpoMediaFiles(); const source = join(root, 'picked.wav'); writeFileSync(source, Buffer.alloc(1024, 23));
    const staging = files.stage(pathToFileURL(source).href); await finishNativeCopies(); const staged = await staging;
    const prefix = staged.uri.slice(0, staged.uri.lastIndexOf('/') + 1); const base = fileURLToPath(libraryDirectory().uri);
    const protectedBytes = Buffer.from('Canonical media must survive import cleanup'); const hash = createHash('sha256').update(protectedBytes).digest('hex');
    const canonical = join(base, 'media', `${hash}.wav`); writeFileSync(canonical, protectedBytes);
    const other = join(base, 'staging', 'README.txt'); writeFileSync(other, 'Unrelated file');
    const ownedName = `${randomUUID()}.stage`; const owned = join(base, 'staging', ownedName); writeFileSync(owned, 'Different temporary file');
    const relative = { parent: `../media/${hash}.wav`, 'encoded-parent': `%2e%2e/media/${hash}.wav`, 'nested-parent': `${ownedName}/../../media/${hash}.wav`, arbitrary: 'README.txt', query: `${ownedName}?other=1`, fragment: `${ownedName}#other` }[variant];
    await expect(files.remove(prefix + relative)).rejects.toThrow('Only staged files');
    expect(readFileSync(canonical).equals(protectedBytes)).toBe(true); expect(readFileSync(other, 'utf8')).toBe('Unrelated file');
    expect(readFileSync(owned, 'utf8')).toBe('Different temporary file'); expect(existsSync(fileURLToPath(staged.uri))).toBe(true);
    await files.remove(staged.uri);
  });
  it('retains the native copy error when deleting its partial staging file also fails', async () => {
    const source = join(root, 'picked.wav'); const bytes = Buffer.alloc(1024, 24); writeFileSync(source, bytes);
    mockCopyFailure = true; mockDeleteFailure = true;
    const staged = new ExpoMediaFiles().stage(pathToFileURL(source).href); const failure = expect(staged).rejects.toThrow('native copy failed');
    await finishNativeCopies(); await failure;
    expect(readFileSync(source).equals(bytes)).toBe(true);
    expect(readdirSync(join(fileURLToPath(libraryDirectory().uri), 'staging'))).toHaveLength(1);
  });
  it('returns completed canonical promotion even if removing the redundant copy fails', async () => {
    const source = join(root, 'picked.wav'); const bytes = Buffer.alloc(1024, 26); writeFileSync(source, bytes);
    const hash = createHash('sha256').update(bytes).digest('hex'); const files = new ExpoMediaFiles();
    const staging = files.stage(pathToFileURL(source).href); await finishNativeCopies(); const staged = await staging;
    mockDeleteFailure = true;
    const first = files.commit(staged.uri, `media/${hash}.wav`); const second = new ExpoMediaFiles().commit(staged.uri, `media/${hash}.wav`);
    const outcome = Promise.allSettled([first, second]); await finishNativeCopies(); const results = await outcome;
    expect(results.map((value) => value.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(readFileSync(join(fileURLToPath(libraryDirectory().uri), 'media', `${hash}.wav`)).equals(bytes)).toBe(true);
    mockDeleteFailure = false; await files.remove(staged.uri);
  });
  it('returns an explicit cancelled backup result before creating files or touching the database', async () => {
    jest.mocked(getDocumentAsync).mockResolvedValueOnce({ canceled: true, assets: null });
    const commit = jest.fn(); const guard = jest.fn();
    expect(await importLibraryBackup({ withExclusiveTransactionAsync: commit } as unknown as SQLiteDatabase, undefined, guard)).toBeNull();
    expect(commit).not.toHaveBeenCalled(); expect(guard).not.toHaveBeenCalled(); expect(readdirSync(root)).toEqual([]);
  });
  it.each(['https://example.invalid/song.mp3', 'javascript:alert(1)', 'data:audio/wav;base64,UklGRg==', 'ftp://example.invalid/song.wav', 'file://example.invalid/song.wav', 'file://user:secret@localhost/song.wav'])('refuses URL media before filesystem or network side effects: %s', async (sourceUri) => {
    await expect(new ExpoMediaFiles().stage(sourceUri)).rejects.toThrow('local file');
    expect(mockCopies).toHaveLength(0);
    expect(readdirSync(root)).toEqual([]);
  });
  it('rejects control characters without truncating the selected path', async () => {
    await expect(new ExpoMediaFiles().stage('file:///song.wav\u0000ignored')).rejects.toThrow('Invalid local file');
    expect(mockCopies).toHaveLength(0);
  });
  it.each([32_000_000, Number.NaN])('refuses import before copying when free storage is insufficient or unknown: %s', async (freeSpace) => {
    const source = join(root, 'picked.wav'); const bytes = Buffer.alloc(2048, 25); writeFileSync(source, bytes); mockFreeSpace = freeSpace;
    await expect(new ExpoMediaFiles().stage(pathToFileURL(source).href)).rejects.toThrow('free storage');
    expect(mockCopies).toHaveLength(0); expect(readFileSync(source).equals(bytes)).toBe(true);
    expect(readdirSync(join(fileURLToPath(libraryDirectory().uri), 'staging'))).toEqual([]);
  });
  it('waits for both copies before persisting an inspected managed asset, then reuses it without another canonical copy', async () => {
    const bytes = Buffer.from('RIFF WAVE local media fixture'.repeat(20000));
    const source = join(root, 'picked.wav'); writeFileSync(source, bytes);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const assets = new Map<string, MediaAsset>(); const save = jest.fn(async (asset: MediaAsset) => { assets.set(asset.id, asset); });
    const repository: MediaAssetRepository = { get: async (id) => assets.get(id) ?? null, getByChecksum: async (hash) => [...assets.values()].find((asset) => asset.checksumSha256 === hash) ?? null, save, delete: async (id) => { assets.delete(id); } };
    const importer = new MediaImportTransaction(new ExpoMediaFiles(), repository);
    const picked = { sourceUri: pathToFileURL(source).href, displayName: 'picked.wav', declaredBytes: bytes.length };
    const pending = importer.import(picked);
    await settle(); expect(mockCopies).toHaveLength(1); expect(save).not.toHaveBeenCalled();
    mockCopies.shift()!(); await settle();
    expect(mockCopies).toHaveLength(1); expect(save).not.toHaveBeenCalled();
    mockCopies.shift()!(); await settle();
    expect(mockCopies).toHaveLength(1); expect(save).not.toHaveBeenCalled();
    expect(readdirSync(join(fileURLToPath(libraryDirectory().uri), 'media'))).toEqual([]);
    mockCopies.shift()!(); const asset = await pending;
    expect(asset.bytes).toBe(bytes.length); expect(asset.checksumSha256).toBe(checksum);
    expect(readFileSync(fileURLToPath(asset.localUri)).equals(bytes)).toBe(true);
    expect(readFileSync(source).equals(bytes)).toBe(true); expect(save).toHaveBeenCalledTimes(1);
    const staging = join(fileURLToPath(libraryDirectory().uri), 'staging'); expect(readdirSync(staging)).toEqual([]);
    const second = importer.prepare(picked); await settle(); mockCopies.shift()!();
    expect(await second).toEqual(asset); expect(mockCopies).toHaveLength(0); expect(readdirSync(staging)).toEqual([]);
  });
  it('waits for a rejected copy before deleting its partial staging file and leaves metadata and the selected source untouched', async () => {
    const source = join(root, 'picked.wav'); const bytes = Buffer.alloc(1024, 12); writeFileSync(source, bytes); mockCopyFailure = true;
    const save = jest.fn(async () => undefined);
    const repository: MediaAssetRepository = { get: async () => null, getByChecksum: async () => null, save, delete: async () => undefined };
    const pending = new MediaImportTransaction(new ExpoMediaFiles(), repository).import({ sourceUri: pathToFileURL(source).href, displayName: 'picked.wav' });
    const failure = expect(pending).rejects.toThrow('native copy failed');
    expect(mockCopies).toHaveLength(1); mockCopies.shift()!(); await failure;
    expect(readdirSync(join(fileURLToPath(libraryDirectory().uri), 'staging'))).toEqual([]);
    expect(save).not.toHaveBeenCalled(); expect(existsSync(source)).toBe(true); expect(readFileSync(source).equals(bytes)).toBe(true);
  });
  it('cleans a failed managed copy before retry, without leaving a poisoned canonical path', async () => {
    const source = join(root, 'picked.wav'); const bytes = Buffer.alloc(2048, 15); writeFileSync(source, bytes);
    const repository: MediaAssetRepository = { get: async () => null, getByChecksum: async () => null, save: jest.fn(), delete: async () => undefined };
    const importer = new MediaImportTransaction(new ExpoMediaFiles(), repository); const picked = { sourceUri: pathToFileURL(source).href, displayName: 'picked.wav' };
    const failed = importer.import(picked); const failure = expect(failed).rejects.toThrow('native copy failed');
    await settle(); mockCopies.shift()!(); await settle(); mockCopyFailure = true; mockCopies.shift()!(); await failure;
    const base = fileURLToPath(libraryDirectory().uri); expect(readdirSync(join(base, 'media'))).toEqual([]); expect(readdirSync(join(base, 'staging'))).toEqual([]); expect(repository.save).not.toHaveBeenCalled();
    mockCopyFailure = false; const retry = importer.import(picked); await finishNativeCopies(); const restored = await retry;
    expect(readFileSync(fileURLToPath(restored.localUri)).equals(bytes)).toBe(true); expect(repository.save).toHaveBeenCalledTimes(1);
  });
  it('reports reuse when another importer wins promotion while its verified copy is still pending', async () => {
    const source = join(root, 'picked.wav'); const bytes = Buffer.alloc(2048, 32); writeFileSync(source, bytes); const checksum = createHash('sha256').update(bytes).digest('hex');
    const files = new ExpoMediaFiles(); const stage = files.stage(pathToFileURL(source).href); await finishNativeCopies(); const selected = await stage;
    const winner = files.commit(selected.uri, `media/${checksum}.wav`); const follower = new ExpoMediaFiles().commit(selected.uri, `media/${checksum}.wav`);
    await settle(); expect(mockCopies).toHaveLength(2);
    mockCopies.shift()!(); await settle(); expect(mockCopies).toHaveLength(2);
    // Finish the first promotion while the second verified copy is still pending.
    mockCopies.pop()!(); expect((await winner).created).toBe(true);
    mockCopies.shift()!(); const reused = await follower; expect(reused.created).toBe(false);
    expect(readFileSync(fileURLToPath(reused.uri)).equals(bytes)).toBe(true); await files.remove(selected.uri);
    expect(readdirSync(join(fileURLToPath(libraryDirectory().uri), 'staging'))).toEqual([]);
  });
  it('serializes concurrent promotions from separate adapters so only one owns a newly created canonical file', async () => {
    const source = join(root, 'picked.wav'); const bytes = Buffer.alloc(2048, 33); writeFileSync(source, bytes); const checksum = createHash('sha256').update(bytes).digest('hex');
    const files = new ExpoMediaFiles(); const stage = files.stage(pathToFileURL(source).href); await finishNativeCopies(); const selected = await stage;
    const first = files.commit(selected.uri, `media/${checksum}.wav`); const second = new ExpoMediaFiles().commit(selected.uri, `media/${checksum}.wav`);
    await settle(); expect(mockCopies).toHaveLength(2); mockCopies.shift()!(); mockCopies.shift()!(); await settle();
    expect(mockCopies).toHaveLength(1); await finishNativeCopies();
    const results = await Promise.all([first, second]); expect(results.map((result) => result.created).sort()).toEqual([false, true]);
    expect(results[0]!.uri).toBe(results[1]!.uri); expect(readFileSync(fileURLToPath(results[0]!.uri)).equals(bytes)).toBe(true);
    expect(readdirSync(join(fileURLToPath(libraryDirectory().uri), 'recovery'))).toEqual([]); await files.remove(selected.uri);
  });
  it('rolls back a damaged target if verified promotion fails, then repairs it on deliberate retry', async () => {
    const source = join(root, 'picked.wav'); const bytes = Buffer.alloc(2048, 16); writeFileSync(source, bytes); const checksum = createHash('sha256').update(bytes).digest('hex');
    const files = new ExpoMediaFiles(); const staged = files.stage(pathToFileURL(source).href); await finishNativeCopies(); const selected = await staged;
    const base = fileURLToPath(libraryDirectory().uri); const target = join(base, 'media', `${checksum}.wav`); const damaged = Buffer.from('old damaged file'); writeFileSync(target, damaged);
    mockPromotionFailure = true; const pending = files.commit(selected.uri, `media/${checksum}.wav`); const failure = expect(pending).rejects.toThrow('native promotion failed'); await finishNativeCopies(); await failure;
    expect(readFileSync(target).equals(damaged)).toBe(true); expect(readdirSync(join(base, 'staging'))).toHaveLength(1);
    mockPromotionFailure = false; const retry = files.commit(selected.uri, `media/${checksum}.wav`); await finishNativeCopies(); await retry; await files.remove(selected.uri);
    expect(readFileSync(target).equals(bytes)).toBe(true); expect(readdirSync(join(base, 'recovery'))).toHaveLength(1); expect(readdirSync(join(base, 'staging'))).toEqual([]);
  });
  it('rejects a late critical-session guard before replacing damaged shared bytes', async () => {
    const source = join(root, 'picked.wav'); const bytes = Buffer.alloc(2048, 19); writeFileSync(source, bytes); const checksum = createHash('sha256').update(bytes).digest('hex');
    let critical = false; const files = new ExpoMediaFiles(() => { if (critical) throw new Error('library.armed'); });
    const pendingStage = files.stage(pathToFileURL(source).href); await finishNativeCopies(); const staged = await pendingStage;
    const base = fileURLToPath(libraryDirectory().uri); const target = join(base, 'media', `${checksum}.wav`); const damaged = Buffer.from('damaged but still retained'); writeFileSync(target, damaged);
    const commit = files.commit(staged.uri, `media/${checksum}.wav`); const failure = expect(commit).rejects.toThrow('library.armed'); await settle();
    expect(mockCopies).toHaveLength(1); critical = true; mockCopies.shift()!(); await failure; await files.remove(staged.uri);
    expect(readFileSync(target).equals(damaged)).toBe(true); expect(readdirSync(join(base, 'recovery'))).toEqual([]); expect(readdirSync(join(base, 'staging'))).toEqual([]);
  });
  it('repairs missing or damaged deduplicated media at the same shared path and preserves damaged bytes in recovery', async () => {
    const source = join(root, 'picked.wav'); const bytes = Buffer.alloc(4096, 27); writeFileSync(source, bytes);
    const assets = new Map<string, MediaAsset>();
    const repository: MediaAssetRepository = { get: async (id) => assets.get(id) ?? null,
      getByChecksum: async (hash) => [...assets.values()].find((asset) => asset.checksumSha256 === hash) ?? null,
      save: async (asset) => { assets.set(asset.id, asset); }, delete: async () => undefined };
    const importer = new MediaImportTransaction(new ExpoMediaFiles(), repository);
    const picked = { sourceUri: pathToFileURL(source).href, displayName: 'original.wav' };
    const first = importer.import(picked); await finishNativeCopies();
    const original = await first; const sharedPath = fileURLToPath(original.localUri); unlinkSync(sharedPath);
    const repaired = importer.prepare({ ...picked, displayName: 'renamed.mp3' }); await settle(); mockCopies.shift()!(); await settle();
    expect(mockCopies).toHaveLength(1); await finishNativeCopies(); expect(await repaired).toEqual(original);
    expect(readFileSync(sharedPath).equals(bytes)).toBe(true);
    const damaged = Buffer.from('damaged canonical content'); writeFileSync(sharedPath, damaged);
    const retry = importer.prepare(picked); await finishNativeCopies(); expect(await retry).toEqual(original);
    expect(readFileSync(sharedPath).equals(bytes)).toBe(true);
    const recovery = join(fileURLToPath(libraryDirectory().uri), 'recovery');
    expect(readdirSync(recovery)).toHaveLength(1); expect(readFileSync(join(recovery, readdirSync(recovery)[0]!)).equals(damaged)).toBe(true);
    expect(readFileSync(source).equals(bytes)).toBe(true);
  });
  it('cancels during an asynchronous staging copy without persisting media or leaving a staged file', async () => {
    const source = join(root, 'picked.wav'); writeFileSync(source, Buffer.alloc(2048, 16));
    const save = jest.fn(async () => undefined);
    const repository: MediaAssetRepository = { get: async () => null, getByChecksum: async () => null, save, delete: async () => undefined };
    const controller = new AbortController();
    const pending = new MediaImportTransaction(new ExpoMediaFiles(), repository).import({ sourceUri: pathToFileURL(source).href, displayName: 'picked.wav' }, controller.signal);
    const failure = expect(pending).rejects.toThrow('cancelled'); controller.abort(); mockCopies.shift()!(); await failure;
    expect(save).not.toHaveBeenCalled(); expect(mockCopies).toHaveLength(0);
    expect(readdirSync(join(fileURLToPath(libraryDirectory().uri), 'staging'))).toEqual([]);
  });
});
