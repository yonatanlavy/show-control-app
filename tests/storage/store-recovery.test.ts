import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as SQLite from 'expo-sqlite';
import { sampleShow, sampleControllerProfiles } from '../../src/domain';
import { createLibraryStore } from '../../src/library/store';
import { ensureLibraryDirectories } from '../../src/storage/media-files';
import { migrateLibrary, readSetting, replaceLibrary, retryLibraryRead, SqliteShowRepository, writeSetting } from '../../src/storage/sqlite';
import { setCriticalSessionActive } from '../../src/runtime/critical-session-gate';
import { importLibraryBackup } from '../../src/storage/backup';
import { checkedName, copiedLibraryName } from '../../src/library/names';

jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual<typeof import('node:crypto')>('node:crypto').randomUUID() }));
jest.mock('expo-file-system', () => ({ Directory: class { uri = 'file:///documents/library/recovery'; } }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(), backupDatabaseAsync: jest.fn() }));
jest.mock('../../modules/show-audio', () => ({ __esModule: true, default: {} }));
const mockVisualProbe = jest.fn(); const mockVisualHash = jest.fn(); const mockStage = jest.fn(); const mockCommit = jest.fn(); const mockRemove = jest.fn();
jest.mock('../../modules/show-visual', () => ({ __esModule: true, default: { probeVisual: (uri: string) => mockVisualProbe(uri) } }));
jest.mock('../../src/storage/backup', () => ({ exportLibraryBackup: jest.fn(), importLibraryBackup: jest.fn() }));
jest.mock('../../src/storage/media-files', () => ({ ensureLibraryDirectories: jest.fn(), libraryDirectory: () => ({ uri: 'file:///documents/library' }), requireFreeSpace: jest.fn(), ExpoMediaFiles: class { stage(uri: string) { return mockStage(uri) } sha256(uri: string) { return mockVisualHash(uri) } commit(...args: unknown[]) { return mockCommit(...args) } remove(uri: string) { return mockRemove(uri) } }, pickMedia: jest.fn() }));

const opened = jest.mocked(SQLite.openDatabaseAsync);
const directories = jest.mocked(ensureLibraryDirectories);
let root = '';
let path = '';
let failSelectionWrites = false;
let exclusiveTransactions = 0;
let holdPreferences: (() => Promise<void>) | undefined;
let preferencesFailure: Error | undefined;
let preferencesWrites = 0;
const connections: { db: SQLite.SQLiteDatabase; close(): void }[] = [];
function connection() {
  const raw = new DatabaseSync(path); let closed = false;
  const values = (input: unknown[]) => (Array.isArray(input[0]) ? input[0] : input) as (string | number | null)[];
  const close = () => { if (!closed) { raw.close(); closed = true; } };
  const port = {
    execAsync: async (sql: string) => { raw.exec(sql); },
    runAsync: async (sql: string, ...input: unknown[]) => { const result = raw.prepare(sql).run(...values(input)); if (failSelectionWrites && sql.includes('library_settings') && input[0] === 'selection') throw new Error('selection write interrupted'); if (sql.includes('library_settings') && input[0] === 'preferences') { preferencesWrites += 1; if (preferencesFailure) throw preferencesFailure; await holdPreferences?.(); } return result; },
    getFirstAsync: async (sql: string, ...input: unknown[]) => raw.prepare(sql).get(...values(input)) ?? null,
    getAllAsync: async (sql: string, ...input: unknown[]) => raw.prepare(sql).all(...values(input)),
    withExclusiveTransactionAsync: async (work: (tx: unknown) => Promise<void>) => { exclusiveTransactions += 1; raw.exec('BEGIN IMMEDIATE'); try { await work(port); raw.exec('COMMIT'); } catch (error) { raw.exec('ROLLBACK'); throw error; } },
    closeAsync: async () => close(),
  };
  const result = { db: port as unknown as SQLite.SQLiteDatabase, close }; connections.push(result); return result;
}
beforeEach(async () => {
  jest.clearAllMocks(); failSelectionWrites = false; exclusiveTransactions = 0; holdPreferences = undefined; preferencesFailure = undefined; preferencesWrites = 0; setCriticalSessionActive(false); directories.mockImplementation(() => undefined);
  mockVisualProbe.mockReset(); mockVisualHash.mockReset().mockResolvedValue('a'.repeat(64)); mockStage.mockReset(); mockCommit.mockReset(); mockRemove.mockReset().mockResolvedValue(undefined);
  root = mkdtempSync(join(tmpdir(), 'show-store-test-')); path = join(root, 'library.db');
  const seed = connection(); await migrateLibrary(seed.db, async () => undefined);
  for (const profile of sampleControllerProfiles) await seed.db.runAsync('INSERT INTO controller_profiles VALUES (?, ?)', profile.id, JSON.stringify(profile));
  await new SqliteShowRepository(seed.db).save(sampleShow); seed.close();
  opened.mockImplementation(async () => connection().db);
});
afterEach(() => {
  setCriticalSessionActive(false); connections.splice(0).forEach((item) => item.close());
  if (!resolve(root).startsWith(resolve(join(tmpdir(), 'show-store-test-')))) throw new Error('Unexpected test cleanup path');
  rmSync(root, { recursive: true, force: true });
});

describe('library naming boundaries', () => {
  it('accepts the full normalized boundary and rejects an invalid supplied name without truncation', () => {
    expect(checkedName('  ' + 'e\u0301'.repeat(200) + '  ')).toBe('é'.repeat(200));
    expect(() => checkedName('x'.repeat(201))).toThrow('200');
    expect(() => checkedName('   ')).toThrow('200');
  });
  it('shortens only a generated prefix and never splits a surrogate pair', () => {
    const original = '😀'.repeat(100);
    const copied = copiedLibraryName(original);
    expect(copied).toBe('😀'.repeat(97) + ' copy');
    expect(copied).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(original).toHaveLength(200);
  });
  it('duplicates maximum-length show and playlist names through real persistence and retains the originals', async () => {
    const library = createLibraryStore(); await library.initialize();
    const source = await library.createShow('x'.repeat(200));
    await library.renameSet(source.id, source.sets[0]!.id, 'p'.repeat(200));
    const copy = await library.duplicateShow(source.id);
    expect(copy.id).not.toBe(source.id); expect(copy.name).toBe('x'.repeat(195) + ' copy');
    const withPlaylist = await library.duplicateSet(source.id, source.sets[0]!.id);
    expect(withPlaylist.sets.map((set) => set.name)).toEqual(['p'.repeat(200), 'p'.repeat(195) + ' copy']);
    const before = library.getSnapshot().shows;
    await expect(library.duplicateShow(source.id, 'z'.repeat(201))).rejects.toThrow('200');
    expect(library.getSnapshot().shows).toEqual(before);
    const reopened = createLibraryStore(); await reopened.initialize();
    expect(reopened.getSnapshot().shows.find((show) => show.id === source.id)?.name).toBe('x'.repeat(200));
    expect(reopened.getSnapshot().shows.find((show) => show.id === copy.id)?.name).toBe(copy.name);
    expect(reopened.getSnapshot().shows.find((show) => show.id === source.id)?.sets.map((set) => set.name)).toEqual(withPlaylist.sets.map((set) => set.name));
  });
  it('duplicates a valid 256-character cue name within its existing cue bound and preserves saved tuning', async () => {
    const library = createLibraryStore(); await library.initialize();
    const original = library.getSnapshot().shows[0]!;
    const source = original.cues.opening;
    if (source?.type !== 'audio') throw new Error('Audio fixture missing');
    const name = 'x'.repeat(256);
    await library.updateCue(original.id, source.id, { name, gainDb: -23, fadeInMs: 1350 });
    const copied = await library.duplicateCue(original.id, original.sets[0]!.id, source.id);
    const addedId = copied.sets[0]!.cueOrder.at(-1)!;
    expect(addedId).not.toBe(source.id);
    expect(copied.cues[addedId]).toMatchObject({ name: 'x'.repeat(251) + ' copy', gainDb: -23, fadeInMs: 1350 });
    expect(copied.cues[source.id]).toMatchObject({ name, gainDb: -23, fadeInMs: 1350 });
  });
});

describe('library read ownership', () => {
  type Part = 'shows' | 'profiles' | 'preferences' | 'selection';
  const cases = (['shows', 'profiles', 'preferences', 'selection'] as const).flatMap((failed, index, parts) =>
    (['async', 'sync'] as const).map((mode) => ({ failed, held: parts[(index + 1) % parts.length]!, mode })));
  function holdReader(db: SQLite.SQLiteDatabase, failed: Part, held: Part, mode: 'async' | 'sync') {
    let release!: () => void; let entered!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve });
    const started = new Promise<void>((resolve) => { entered = resolve });
    const failure = new Error('Unreadable library ' + failed);
    const readAll = db.getAllAsync.bind(db); const readFirst = db.getFirstAsync.bind(db);
    const part = (sql: string, input: unknown[]): Part | undefined => {
      const parameters = Array.isArray(input[0]) ? input[0] : input;
      if (sql.startsWith('SELECT document_json FROM shows')) return 'shows';
      if (sql === 'SELECT profile_json FROM controller_profiles') return 'profiles';
      if (sql === 'SELECT value_json FROM library_settings WHERE key = ?') return parameters[0] as Part;
      return undefined;
    };
    const run = (sql: string, input: unknown[], read: () => Promise<unknown>) => {
      const selected = part(sql, input);
      if (selected === failed) { if (mode === 'sync') throw failure; return Promise.reject(failure); }
      if (selected === held) { entered(); return pending.then(read); }
      return read();
    };
    db.getAllAsync = ((sql: string, ...input: unknown[]) => run(sql, input, () => readAll(sql, ...(input as SQLite.SQLiteBindValue[])))) as SQLite.SQLiteDatabase['getAllAsync'];
    db.getFirstAsync = ((sql: string, ...input: unknown[]) => run(sql, input, () => readFirst(sql, ...(input as SQLite.SQLiteBindValue[])))) as SQLite.SQLiteDatabase['getFirstAsync'];
    return { release, started, failure, close: jest.spyOn(db, 'closeAsync') };
  }
  const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };
  it.each(cases)('retains startup connection when $failed rejects $mode while $held is pending', async ({ failed, held, mode }) => {
    const beforeHandle = connection(); const before = await new SqliteShowRepository(beforeHandle.db).get(sampleShow.id); beforeHandle.close();
    let reader!: ReturnType<typeof holdReader>;
    let connected!: () => void; const connectionStarted = new Promise<void>((resolve) => { connected = resolve });
    opened.mockImplementationOnce(async () => { const db = connection().db; reader = holdReader(db, failed, held, mode); connected(); return db; });
    const library = createLibraryStore(); let settled = false;
    const loading = library.initialize(); const outcome = loading.catch((error: unknown) => error).finally(() => { settled = true });
    // Opening the handle completes before the gated reader is reached.
    await connectionStarted;
    await reader.started; await flush();
    try {
      expect(settled).toBe(false); expect(reader.close).not.toHaveBeenCalled();
      expect(library.getSnapshot().status).toBe('loading');
      expect(library.initialize()).toBe(loading); expect(opened).toHaveBeenCalledTimes(1);
    } finally { reader.release(); await outcome; }
    expect(await outcome).toBe(reader.failure); expect(reader.close).toHaveBeenCalledTimes(1);
    expect(library.getSnapshot()).toMatchObject({ status: 'error', error: reader.failure.message });
    await library.initialize(); expect(library.getSnapshot().status).toBe('ready');
    expect(library.getSnapshot().shows[0]!.cues).toEqual(before!.cues); expect(opened).toHaveBeenCalledTimes(2);
  });
  it.each(cases)('retains restore read ownership when $failed rejects $mode while $held is pending', async ({ failed, held, mode }) => {
    const library = createLibraryStore(); await library.initialize(); const original = library.getSnapshot().shows[0]!;
    const restored = { ...original, id: 'owned-restored', revisionId: 'owned-restored-version' };
    let reader!: ReturnType<typeof holdReader>;
    let committed!: () => void; const restoreCommitted = new Promise<void>((resolve) => { committed = resolve });
    jest.mocked(importLibraryBackup).mockImplementationOnce(async (db) => {
      await replaceLibrary(db, [restored], [], library.getSnapshot().settings, undefined, { showId: restored.id, setId: restored.sets[0]!.id });
      reader = holdReader(db, failed, held, mode); committed(); return 1;
    });
    let settled = false; const outcome = library.importBackup().catch((error: unknown) => error).finally(() => { settled = true });
    await restoreCommitted;
    await reader.started; await flush();
    try {
      expect(settled).toBe(false); expect(library.getSnapshot()).toMatchObject({ status: 'ready', saving: true });
      // A caller rechecking initialization cannot close this active read batch.
      await library.initialize(); expect(reader.close).not.toHaveBeenCalled(); expect(opened).toHaveBeenCalledTimes(1);
    } finally { reader.release(); await outcome; }
    expect(await outcome).toEqual(expect.objectContaining({ message: expect.stringContaining('RESTORE_COMMITTED_RELOAD_REQUIRED') }));
    expect(library.getSnapshot().status).toBe('error'); expect(reader.close).not.toHaveBeenCalled();
    await library.initialize(); expect(reader.close).toHaveBeenCalledTimes(1);
    expect(library.getSnapshot()).toMatchObject({ status: 'ready', selectedShowId: restored.id });
    expect(library.getSnapshot().shows.map((show) => show.id).sort()).toEqual([original.id, restored.id].sort());
    expect(jest.mocked(importLibraryBackup)).toHaveBeenCalledTimes(1);
  });
  it.each([null, {}])('fails closed on missing integrity observation %p', async (observation) => {
    let close!: jest.SpyInstance;
    opened.mockImplementationOnce(async () => {
      const db = connection().db; const read = db.getFirstAsync.bind(db); close = jest.spyOn(db, 'closeAsync');
      db.getFirstAsync = (async (sql: string, ...input: unknown[]) => sql === 'PRAGMA quick_check' ? observation : read(sql, ...(input as SQLite.SQLiteBindValue[]))) as SQLite.SQLiteDatabase['getFirstAsync'];
      return db;
    });
    const library = createLibraryStore(); const transactions = exclusiveTransactions;
    await expect(library.initialize()).rejects.toThrow('integrity');
    expect(library.getSnapshot().status).toBe('error'); expect(close).toHaveBeenCalledTimes(1); expect(exclusiveTransactions).toBe(transactions);
    await library.initialize(); expect(library.getSnapshot().shows[0]!.id).toBe(sampleShow.id);
  });
});

describe('visual native inspection lifetime', () => {
  const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };
  const picked = { sourceUri: 'file:///picker/owned.png', displayName: 'owned.png', declaredBytes: 1000 };
  it.each([['metadata', 'async'], ['checksum', 'async'], ['metadata', 'sync'], ['checksum', 'sync']] as const)('holds the temporary visual when %s rejects %s while the other native reader remains pending', async (reader, mode) => {
    const library = createLibraryStore(); await library.initialize(); const before = library.getSnapshot().shows[0]!;
    let metadataDone!: (value: unknown) => void; let metadataFailed!: (error: Error) => void;
    let hashDone!: (value: string) => void; let hashFailed!: (error: Error) => void;
    const metadata = new Promise((resolve, reject) => { metadataDone = resolve; metadataFailed = reject });
    const hash = new Promise<string>((resolve, reject) => { hashDone = resolve; hashFailed = reject });
    mockStage.mockResolvedValue({ uri: 'file:///documents/library/staging/owned.stage', bytes: 1000 });
    mockVisualProbe.mockReturnValue(metadata); mockVisualHash.mockReturnValue(hash);
    const failure = new Error('Native visual ' + reader + ' failed');
    if (mode === 'sync') (reader === 'metadata' ? mockVisualProbe : mockVisualHash).mockImplementation(() => { throw failure });
    const pending = library.importVisual(before.id, picked); let settled = false;
    const outcome = pending.catch((error: unknown) => error).finally(() => { settled = true });
    try {
      await flush(); if (mode === 'async') { if (reader === 'metadata') metadataFailed(failure); else hashFailed(failure); }
      await flush(); expect(settled).toBe(false); expect(mockRemove).not.toHaveBeenCalled(); expect(mockCommit).not.toHaveBeenCalled();
      expect(library.getSnapshot().saving).toBe(true);
    } finally { metadataDone({ kind: 'image', mimeType: 'image/png', width: 20, height: 20 }); hashDone('a'.repeat(64)); await outcome; }
    expect(await outcome).toBe(failure); expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(library.getSnapshot().shows[0]).toEqual(before); expect(library.getSnapshot().saving).toBe(false);
    expect((await new SqliteShowRepository(connection().db).get(before.id))!.revisionId).toBe(before.revisionId);
  });
  it.each(['cancel', 'arm'] as const)('does not begin visual inspection when %s occurs during staging', async (change) => {
    const library = createLibraryStore(); await library.initialize(); const before = library.getSnapshot().shows[0]!;
    let staged!: (value: { uri: string; bytes: number }) => void;
    mockStage.mockReturnValue(new Promise((resolve) => { staged = resolve }));
    mockVisualProbe.mockResolvedValue({ kind: 'image', mimeType: 'image/png', width: 20, height: 20 });
    const controller = new AbortController(); const pending = library.importVisual(before.id, picked, controller.signal);
    const outcome = pending.catch((error: unknown) => error); await flush();
    if (change === 'cancel') controller.abort(); else setCriticalSessionActive(true);
    staged({ uri: 'file:///documents/library/staging/owned.stage', bytes: 1000 });
    expect(await outcome).toEqual(expect.objectContaining({ message: change === 'cancel' ? 'Import cancelled.' : 'library.armed' }));
    expect(mockVisualProbe).not.toHaveBeenCalled(); expect(mockVisualHash).not.toHaveBeenCalled(); expect(mockCommit).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledTimes(1); expect(library.getSnapshot().shows[0]).toEqual(before);
  });
});

describe('committed backup reconciliation', () => {
  it('retries a transient refresh read without importing again and keeps the committed set selection', async () => {
    const library = createLibraryStore(); await library.initialize(); const original = library.getSnapshot().shows[0]!;
    const restored = { ...original, id: 'restored', revisionId: 'restored-version', sets: [...original.sets, { ...original.sets[0]!, id: 'chosen-restored-set' }] };
    let reads = 0;
    jest.mocked(importLibraryBackup).mockImplementationOnce(async (db) => {
      await replaceLibrary(db, [restored], [], library.getSnapshot().settings, undefined, { showId: restored.id, setId: 'chosen-restored-set' });
      const read = db.getAllAsync.bind(db);
      db.getAllAsync = (async (sql: string, ...input: unknown[]) => {
        if (sql.startsWith('SELECT document_json FROM shows') && ++reads === 1) throw new Error('SQLITE_BUSY');
        return read(sql, ...(input as SQLite.SQLiteBindValue[]));
      }) as SQLite.SQLiteDatabase['getAllAsync'];
      return 1;
    });
    expect(await library.importBackup()).toBe(1); expect(reads).toBe(2);
    expect(library.getSnapshot()).toMatchObject({ status: 'ready', selectedShowId: restored.id, selectedSetId: 'chosen-restored-set' });
    expect(library.getSnapshot().shows).toHaveLength(2); expect(jest.mocked(importLibraryBackup)).toHaveBeenCalledTimes(1);
  });
  it('reopens committed data instead of replaying an import when the snapshot refresh fails', async () => {
    const library = createLibraryStore(); await library.initialize();
    const original = library.getSnapshot().shows[0]!;
    const restored = { ...original, id: 'restored-show', revisionId: 'restored-version', name: 'Restored show' };
    jest.mocked(importLibraryBackup).mockImplementationOnce(async (db) => {
      await replaceLibrary(db, [restored], [], library.getSnapshot().settings, undefined, { showId: restored.id, setId: restored.sets[0]!.id });
      const read = db.getAllAsync.bind(db);
      db.getAllAsync = (async (sql: string, ...input: unknown[]) => {
        if (sql.startsWith('SELECT document_json FROM shows')) throw new Error('database is busy');
        return read(sql, ...(input as SQLite.SQLiteBindValue[]));
      }) as SQLite.SQLiteDatabase['getAllAsync'];
      return 1;
    });
    let detail = '';
    try { await library.importBackup(); } catch (error) { detail = (error as Error).message; }
    const durable = await new SqliteShowRepository(connection().db).all();
    expect(durable.map((show) => show.id).sort()).toEqual([original.id, restored.id].sort());
    expect({ status: library.getSnapshot().status, detail }).toMatchObject({ status: 'error', detail: expect.stringContaining('RESTORE_COMMITTED_RELOAD_REQUIRED') });
    await expect(library.renameShow(original.id, 'Stale edit')).rejects.toThrow('not ready');
    await library.initialize();
    expect(library.getSnapshot()).toMatchObject({ status: 'ready', selectedShowId: restored.id });
    expect(library.getSnapshot().shows).toHaveLength(2); expect(jest.mocked(importLibraryBackup)).toHaveBeenCalledTimes(1);
  });
  it.each(['profiles', 'preferences', 'selection'] as const)('requires reopen when the committed %s read fails', async (part) => {
    const library = createLibraryStore(); await library.initialize(); let failures = 0;
    jest.mocked(importLibraryBackup).mockImplementationOnce(async (db) => {
      const all = db.getAllAsync.bind(db); const first = db.getFirstAsync.bind(db);
      db.getAllAsync = (async (sql: string, ...input: unknown[]) => {
        if (part === 'profiles' && sql.includes('FROM controller_profiles')) { failures++; throw new Error('SQLITE_IOERR'); }
        return all(sql, ...(input as SQLite.SQLiteBindValue[]));
      }) as SQLite.SQLiteDatabase['getAllAsync'];
      db.getFirstAsync = (async (sql: string, ...input: unknown[]) => {
        if (part !== 'profiles' && sql.includes('FROM library_settings') && input[0] === part) { failures++; throw new Error('SQLITE_IOERR'); }
        return first(sql, ...(input as SQLite.SQLiteBindValue[]));
      }) as SQLite.SQLiteDatabase['getFirstAsync'];
      return 0; // Empty backups still commit preferences; zero is not cancellation.
    });
    await expect(library.importBackup()).rejects.toThrow('RESTORE_COMMITTED_RELOAD_REQUIRED');
    expect(failures).toBe(1); expect(library.getSnapshot().status).toBe('error');
    await library.initialize(); expect(library.getSnapshot().status).toBe('ready');
    expect(jest.mocked(importLibraryBackup)).toHaveBeenCalledTimes(1);
  });
  it('keeps committed recovery explicit when reopening fails, then succeeds without replay', async () => {
    const library = createLibraryStore(); await library.initialize();
    const owner = connections.at(-1)!; const all = owner.db.getAllAsync.bind(owner.db);
    jest.mocked(importLibraryBackup).mockImplementationOnce(async () => {
      owner.db.getAllAsync = (async (sql: string, ...input: unknown[]) => {
        if (sql.startsWith('SELECT document_json FROM shows')) throw new Error('SQLITE_CORRUPT');
        return all(sql, ...(input as SQLite.SQLiteBindValue[]));
      }) as SQLite.SQLiteDatabase['getAllAsync'];
      return 0;
    });
    await expect(library.importBackup()).rejects.toThrow('RESTORE_COMMITTED_RELOAD_REQUIRED');
    opened.mockRejectedValueOnce(new Error('Connection unavailable'));
    await expect(library.initialize()).rejects.toThrow('RESTORE_COMMITTED_RELOAD_REQUIRED');
    expect(library.getSnapshot()).toMatchObject({ status: 'error', error: expect.stringContaining('RESTORE_COMMITTED_RELOAD_REQUIRED') });
    await library.initialize(); expect(library.getSnapshot().status).toBe('ready'); expect(jest.mocked(importLibraryBackup)).toHaveBeenCalledTimes(1);
  });
  it('preserves ordinary pre-commit failure and picker retry semantics', async () => {
    const library = createLibraryStore(); await library.initialize(); const before = library.getSnapshot().shows;
    jest.mocked(importLibraryBackup).mockRejectedValueOnce(new Error('Invalid ZIP archive')).mockResolvedValueOnce(null);
    await expect(library.importBackup()).rejects.toThrow('Invalid ZIP archive');
    expect(library.getSnapshot()).toMatchObject({ status: 'ready', shows: before });
    expect(await library.importBackup()).toBeNull(); expect(jest.mocked(importLibraryBackup)).toHaveBeenCalledTimes(2);
  });
});

describe('direct revision restore', () => {
  it('restores the requested version even when an unrelated historical document is corrupt', async () => {
    const library = createLibraryStore(); await library.initialize(); const before = library.getSnapshot().shows[0]!.cues;
    await connections.at(-1)!.db.runAsync('INSERT INTO show_revisions VALUES (?, ?, ?, ?, ?)', 'unrelated-damaged', sampleShow.id, '2026-10-24T00:00:00Z', null, '{damaged');
    const restored = await library.restoreRevision(sampleShow.id, sampleShow.revisionId);
    expect(restored.revisionId).not.toBe(sampleShow.revisionId); expect(restored.cues).toEqual(before);
    expect((await library.history(sampleShow.id)).revisions.map((revision) => revision.id)).toEqual(expect.arrayContaining([sampleShow.revisionId, restored.revisionId, 'unrelated-damaged']));
  });
  it('preserves the current show after a selected version is missing, damaged or belongs to another show', async () => {
    const library = createLibraryStore(); await library.initialize(); const before = library.getSnapshot().shows;
    await connections.at(-1)!.db.runAsync('INSERT INTO show_revisions VALUES (?, ?, ?, ?, ?)', 'foreign-version', 'another-show', '2026-10-24T00:00:00Z', null, JSON.stringify(sampleShow));
    await connections.at(-1)!.db.runAsync('INSERT INTO show_revisions VALUES (?, ?, ?, ?, ?)', 'damaged-version', sampleShow.id, '2026-10-24T00:00:00Z', null, '{damaged');
    for (const id of ['missing-version', 'foreign-version', 'damaged-version']) {
      await expect(library.restoreRevision(sampleShow.id, id)).rejects.toThrow();
      expect(library.getSnapshot().shows).toEqual(before);
    }
    expect((await library.restoreRevision(sampleShow.id, sampleShow.revisionId)).cues).toEqual(before[0]!.cues);
  });
  it('keeps revision restore unavailable during a prepared show', async () => {
    const library = createLibraryStore(); await library.initialize(); setCriticalSessionActive(true);
    await expect(library.restoreRevision(sampleShow.id, sampleShow.revisionId)).rejects.toThrow('library.armed');
    expect(library.getSnapshot().shows[0]!.revisionId).toBe(sampleShow.revisionId);
  });
});

describe('production library retry and queued mutation boundaries', () => {
  it.each(['database schema is locked: main', 'database is busy'])('retries a transient read reported as %s', async (message) => {
    const read = jest.fn<Promise<string>, []>().mockRejectedValueOnce(new Error(message)).mockResolvedValue('committed data');
    await expect(retryLibraryRead(read)).resolves.toBe('committed data');
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('reopens a current library without any exclusive writes while a previous settings connection is still committing', async () => {
    const first = createLibraryStore(); await first.initialize(); let release!: () => void; let entered!: () => void;
    const waiting = new Promise<void>((resolve) => { entered = resolve; }); const continueSaving = new Promise<void>((resolve) => { release = resolve; });
    holdPreferences = async () => { entered(); await continueSaving; }; const save = first.updateSettings({ locale: 'he' }); await waiting;
    const transactionsBeforeReopen = exclusiveTransactions; const recreated = createLibraryStore();
    try {
      await recreated.initialize(); expect(exclusiveTransactions).toBe(transactionsBeforeReopen);
      expect(recreated.getSnapshot().status).toBe('ready'); expect(recreated.getSnapshot().shows[0]!.cues).toMatchObject(sampleShow.cues);
    } finally { release(); await save; holdPreferences = undefined; }
    const afterCommit = createLibraryStore(); await afterCommit.initialize();
    expect(afterCommit.getSnapshot().settings.locale).toBe('he'); expect(afterCommit.getSnapshot().shows).toHaveLength(1);
  });
  it('retries a transient native busy read at most twice on the same owned handle', async () => {
    let checks = 0; let timeoutConfigured = false;
    opened.mockImplementation(async () => {
      const handle = connection().db; const read = handle.getFirstAsync.bind(handle); const exec = handle.execAsync.bind(handle);
      handle.execAsync = jest.fn(async (sql) => { if (sql === 'PRAGMA busy_timeout = 1000') timeoutConfigured = true; return exec(sql); });
      handle.getFirstAsync = (async (sql: string, ...input: unknown[]) => {
        if (sql === 'PRAGMA quick_check' && ++checks < 3) throw new Error("Call to function 'NativeStatement.finalizeAsync' has been rejected. Caused by: database is locked");
        return read(sql, ...(input as SQLite.SQLiteBindValue[]));
      }) as SQLite.SQLiteDatabase['getFirstAsync'];
      return handle;
    });
    const library = createLibraryStore(); await library.initialize();
    expect(checks).toBe(3); expect(timeoutConfigured).toBe(true); expect(opened).toHaveBeenCalledTimes(1);
    expect(library.getSnapshot()).toMatchObject({ status: 'ready', selectedShowId: sampleShow.id });
  });
  it('deliberately re-establishes WAL when a current-schema database has another journal mode', async () => {
    const setup = connection(); await setup.db.execAsync('PRAGMA journal_mode = DELETE'); setup.close(); const transactions = exclusiveTransactions;
    const library = createLibraryStore(); await library.initialize(); expect(exclusiveTransactions).toBe(transactions);
    const journal = await connections.at(-1)!.db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');
    expect(journal?.journal_mode).toBe('wal'); expect(library.getSnapshot().shows[0]!.id).toBe(sampleShow.id);
  });
  it('bounds persistent busy reads and preserves deliberate retry without re-running writes', async () => {
    let checks = 0; let locked = true;
    opened.mockImplementation(async () => {
      const handle = connection().db; const read = handle.getFirstAsync.bind(handle);
      handle.getFirstAsync = (async (sql: string, ...input: unknown[]) => {
        if (sql === 'PRAGMA quick_check') { checks += 1; if (locked) throw new Error('SQLITE_BUSY: database is locked'); }
        return read(sql, ...(input as SQLite.SQLiteBindValue[]));
      }) as SQLite.SQLiteDatabase['getFirstAsync'];
      return handle;
    });
    const library = createLibraryStore(); const before = exclusiveTransactions;
    await expect(library.initialize()).rejects.toThrow('SQLITE_BUSY'); expect(checks).toBe(3); expect(exclusiveTransactions).toBe(before);
    expect(library.getSnapshot().status).toBe('error'); locked = false; await library.initialize();
    expect(checks).toBe(4); expect(opened).toHaveBeenCalledTimes(2); expect(library.getSnapshot().shows).toHaveLength(1);
  });
  it('never retries corruption, unknown migration history or a busy settings mutation', async () => {
    const library = createLibraryStore(); await library.initialize(); const before = library.getSnapshot().settings;
    preferencesFailure = new Error('SQLITE_BUSY: database is locked'); const writes = preferencesWrites;
    await expect(library.updateSettings({ locale: 'he' })).rejects.toThrow('SQLITE_BUSY');
    expect(preferencesWrites).toBe(writes + 1); expect(library.getSnapshot().settings).toEqual(before); preferencesFailure = undefined;
    const setup = connection(); await setup.db.runAsync('INSERT INTO migration_ledger VALUES (?, ?)', 4, new Date().toISOString()); setup.close();
    const unknown = createLibraryStore(); const transactions = exclusiveTransactions;
    await expect(unknown.initialize()).rejects.toThrow('migration history is unsupported'); expect(exclusiveTransactions).toBe(transactions);
    const damaged = createLibraryStore(); let integrityChecks = 0;
    opened.mockImplementation(async () => {
      const handle = connection().db; const read = handle.getFirstAsync.bind(handle);
      handle.getFirstAsync = (async (sql: string, ...input: unknown[]) => { if (sql === 'PRAGMA quick_check') { integrityChecks += 1; throw new Error('database disk image is malformed'); } return read(sql, ...(input as SQLite.SQLiteBindValue[])); }) as SQLite.SQLiteDatabase['getFirstAsync'];
      return handle;
    });
    await expect(damaged.initialize()).rejects.toThrow('malformed'); expect(integrityChecks).toBe(1);
  });
  it('rejects video disguised as a cover before committing or publishing a visual asset', async () => {
    const store = createLibraryStore(); await store.initialize(); const before = store.getSnapshot().shows[0]!
    mockStage.mockResolvedValue({ uri: 'file:///documents/library/staging/visual', bytes: 1000 }); mockRemove.mockResolvedValue(undefined)
    mockVisualProbe.mockResolvedValue({ kind: 'video', mimeType: 'video/mp4', width: 640, height: 480, durationMs: 5000 })
    await expect(store.importVisual(before.id, { sourceUri: 'file:///picker/disguised.png', displayName: 'disguised.png', declaredBytes: 1000 }, undefined, true)).rejects.toThrow('COVER_IMAGE_REQUIRED')
    expect(mockCommit).not.toHaveBeenCalled(); expect(mockRemove).toHaveBeenCalledWith('file:///documents/library/staging/visual')
    expect(store.getSnapshot().shows[0]!.revisionId).toBe(before.revisionId)
    expect(store.getSnapshot().shows[0]!.visualAssets).toEqual(before.visualAssets)
  })
  it('reopens persisted shows and preferences after a cached native handle was released', async () => {
    let cached: ReturnType<typeof connection> | undefined;
    opened.mockImplementation(async (_name, options) => {
      if (cached && options?.useNewConnection !== true) return cached.db;
      cached = connection(); return cached.db;
    });
    const first = createLibraryStore(); await first.initialize();
    await first.updateSettings({ locale: 'he', theme: 'purpleNight' });
    cached!.close();
    const recreated = createLibraryStore(); await recreated.initialize();
    expect(recreated.getSnapshot()).toMatchObject({ status: 'ready', selectedShowId: sampleShow.id, settings: { locale: 'he', theme: 'purpleNight' } });
    expect(recreated.getSnapshot().shows[0]!.cues).toMatchObject(sampleShow.cues);
    expect(recreated.getSnapshot().error).toBeUndefined();
  });
  it('propagates backup picker cancellation without changing documents, settings or selection', async () => {
    const library = createLibraryStore(); await library.initialize(); const before = library.getSnapshot();
    jest.mocked(importLibraryBackup).mockResolvedValueOnce(null);
    expect(await library.importBackup()).toBeNull(); expect(library.getSnapshot()).toEqual(before);
    expect(await new SqliteShowRepository(connections.at(-1)!.db).all()).toHaveLength(1);
  });
  it('rolls back creation and playlist duplication when selecting the result fails, so Retry cannot create hidden duplicates', async () => {
    const library = createLibraryStore(); await library.initialize(); const original = library.getSnapshot().shows[0]!;
    failSelectionWrites = true; await expect(library.createShow('Interrupted show')).rejects.toThrow('selection write interrupted');
    expect(library.getSnapshot().shows.map((show) => show.id)).toEqual([original.id]);
    expect(await new SqliteShowRepository(connections.at(-1)!.db).all()).toHaveLength(1);
    await expect(library.duplicateSet(original.id, original.sets[0]!.id)).rejects.toThrow('selection write interrupted');
    expect((await new SqliteShowRepository(connections.at(-1)!.db).get(original.id))!.sets).toHaveLength(1);
    failSelectionWrites = false; await library.createShow('Deliberate retry'); expect(library.getSnapshot().shows).toHaveLength(2);
  });
  it('rolls back trash deletion and restore when their selection writes fail', async () => {
    const library = createLibraryStore(); await library.initialize(); failSelectionWrites = true;
    await expect(library.removeShow(sampleShow.id)).rejects.toThrow('selection write interrupted');
    expect(library.getSnapshot().selectedShowId).toBe(sampleShow.id); expect(await library.trash()).toEqual([]);
    expect(await new SqliteShowRepository(connections.at(-1)!.db).get(sampleShow.id)).not.toBeNull();
    failSelectionWrites = false; await library.removeShow(sampleShow.id); failSelectionWrites = true;
    await expect(library.restoreDeletedShow(sampleShow.id)).rejects.toThrow('selection write interrupted');
    expect(library.getSnapshot().shows).toEqual([]); expect(await library.trash()).toHaveLength(1);
    failSelectionWrites = false; await library.restoreDeletedShow(sampleShow.id); expect(await library.trash()).toEqual([]);
  });
  it('retries a directory failure, shares a single retry and preserves the existing database', async () => {
    directories.mockImplementationOnce(() => { throw new Error('temporary low storage'); });
    const library = createLibraryStore(); await expect(library.initialize()).rejects.toThrow('low storage');
    expect(library.getSnapshot().status).toBe('error'); expect(opened).not.toHaveBeenCalled();
    library.clearError(); expect(library.getSnapshot().error).toContain('low storage');
    const first = library.initialize(); const second = library.initialize(); expect(first).toBe(second); await first;
    expect(opened).toHaveBeenCalledTimes(1);
    expect(library.getSnapshot()).toMatchObject({ status: 'ready', selectedShowId: sampleShow.id });
    expect(library.getSnapshot().shows[0]!.name).toBe(sampleShow.name);
  });
  it('retries a native open failure without caching rejection or recreating user data', async () => {
    opened.mockRejectedValueOnce(new Error('database temporarily busy'));
    const library = createLibraryStore(); await expect(library.initialize()).rejects.toThrow('temporarily busy');
    await library.initialize(); expect(opened).toHaveBeenCalledTimes(2);
    expect(library.getSnapshot().shows[0]!.cues).toMatchObject(sampleShow.cues);
    expect(Object.keys(library.getSnapshot().shows[0]!.cues).sort()).toEqual(Object.keys(sampleShow.cues).sort());
    expect(library.getSnapshot().error).toBeUndefined();
  });
  it('rejects work queued just before arming and accepts a deliberate retry after exit', async () => {
    const library = createLibraryStore(); await library.initialize();
    const queued = library.renameShow(sampleShow.id, 'Too late'); setCriticalSessionActive(true);
    await expect(queued).rejects.toThrow('library.armed');
    expect(library.getSnapshot().shows[0]!.name).toBe(sampleShow.name);
    await expect(library.updateSettings({ theme: 'cobra' })).rejects.toThrow('library.armed');
    setCriticalSessionActive(false); await library.renameShow(sampleShow.id, 'Retry succeeds');
    expect(library.getSnapshot().shows[0]!.name).toBe('Retry succeeds');
  });
  it('rejects a late whole-document save and preserves newer edits, while merging ordered cue patches', async () => {
    const library = createLibraryStore(); await library.initialize();
    const original = library.getSnapshot().shows[0]!;
    await library.renameShow(original.id, 'Latest name');
    await expect(library.saveShow({ ...original, name: 'Stale overwrite' })).rejects.toThrow('STALE_REVISION');
    expect(library.getSnapshot().shows[0]!.name).toBe('Latest name');
    library.clearError(); expect(library.getSnapshot().error).toBeUndefined();
    await Promise.all([library.updateCue(original.id, 'opening', { gainDb: -6 }), library.updateCue(original.id, 'opening', { preWaitMs: 1234 })]);
    expect(library.getSnapshot().shows[0]!.cues.opening).toMatchObject({ gainDb: -6, preWaitMs: 1234 });
  });
  it('handles deleting the last playlist/show and restores independent work from trash', async () => {
    const library = createLibraryStore(); await library.initialize();
    await library.removeSet(sampleShow.id, sampleShow.sets[0]!.id);
    expect(library.getSnapshot().selectedSetId).toBeNull();
    await library.createSet(sampleShow.id, 'New playlist'); expect(library.getSnapshot().selectedSetId).not.toBeNull();
    await library.removeShow(sampleShow.id); expect(library.getSnapshot().shows).toEqual([]); expect(library.getSnapshot().selectedShowId).toBeNull();
    expect(await library.trash()).toHaveLength(1);
    await library.restoreDeletedShow(sampleShow.id);
    expect(library.getSnapshot().selectedShowId).toBe(sampleShow.id); expect(await library.trash()).toEqual([]);
  });
  it('retains the selected fallback after deleting a playlist, reordering the remainder and reopening', async () => {
    const library = createLibraryStore(); await library.initialize();
    const created = await library.createShow('Fallback selection'); const firstId = created.sets[0]!.id;
    const withSecond = await library.createSet(created.id, 'Second'); const secondId = withSecond.sets.at(-1)!.id;
    const withThird = await library.createSet(created.id, 'Third'); const thirdId = withThird.sets.at(-1)!.id;
    await library.select(created.id, secondId);
    await library.removeSet(created.id, secondId);
    expect(library.getSnapshot().selectedSetId).toBe(firstId);
    await library.reorderSets(created.id, [thirdId, firstId]);
    expect(library.getSnapshot().selectedSetId).toBe(firstId);
    const reopened = createLibraryStore(); await reopened.initialize();
    expect(reopened.getSnapshot().selectedShowId).toBe(created.id);
    expect(reopened.getSnapshot().selectedSetId).toBe(firstId);
    expect(await readSetting(connections.at(-1)!.db, 'selection', null)).toEqual({ showId: created.id, setId: firstId });
  });
  it.each([false, true])('retains an upgraded dangling-selection fallback after reorder/reopen, with failed save %s', async (failSave) => {
    const library = createLibraryStore(); await library.initialize();
    const created = await library.createShow('Existing dangling selection'); const firstId = created.sets[0]!.id;
    const withSecond = await library.createSet(created.id, 'Deleted selection'); const deletedId = withSecond.sets.at(-1)!.id;
    const withThird = await library.createSet(created.id, 'Fallback playlist'); const fallbackId = withThird.sets.at(-1)!.id;
    await library.removeSet(created.id, deletedId);
    await library.reorderSets(created.id, [fallbackId, firstId]);
    // Older builds saved a deleted playlist ID; opening that library only
    // resolves a display fallback and must not introduce a startup write.
    const legacySelection = { showId: created.id, setId: deletedId };
    await writeSetting(connections.at(-1)!.db, 'selection', legacySelection);
    const transactionsBeforeOpen = exclusiveTransactions;
    const upgraded = createLibraryStore(); await upgraded.initialize();
    expect(exclusiveTransactions).toBe(transactionsBeforeOpen);
    expect(upgraded.getSnapshot().selectedSetId).toBe(fallbackId);
    const db = connections.at(-1)!.db; const repository = new SqliteShowRepository(db);
    expect(await readSetting(db, 'selection', null)).toEqual(legacySelection);
    if (failSave) {
      const original = await repository.get(created.id); const history = await repository.history(created.id);
      failSelectionWrites = true;
      await expect(upgraded.reorderSets(created.id, [firstId, fallbackId])).rejects.toThrow('selection write interrupted');
      expect(await repository.get(created.id)).toEqual(original);
      expect(await repository.history(created.id)).toEqual(history);
      expect(upgraded.getSnapshot().shows.find((show) => show.id === created.id)).toEqual(original);
      expect(upgraded.getSnapshot().selectedSetId).toBe(fallbackId);
      expect(await readSetting(db, 'selection', null)).toEqual(legacySelection);
      failSelectionWrites = false;
    }
    await upgraded.reorderSets(created.id, [firstId, fallbackId]);
    expect(upgraded.getSnapshot().selectedSetId).toBe(fallbackId);
    const reopened = createLibraryStore(); await reopened.initialize();
    expect(reopened.getSnapshot().selectedSetId).toBe(fallbackId);
    expect(await readSetting(connections.at(-1)!.db, 'selection', null)).toEqual({ showId: created.id, setId: fallbackId });
  });
  it('rolls back a removed selected playlist and its revision when saving the fallback selection fails', async () => {
    const library = createLibraryStore(); await library.initialize();
    const created = await library.createShow('Atomic fallback');
    const original = await library.createSet(created.id, 'Selected playlist'); const selectedId = original.sets.at(-1)!.id;
    const repository = new SqliteShowRepository(connections.at(-1)!.db);
    const history = await repository.history(created.id);
    failSelectionWrites = true;
    await expect(library.removeSet(created.id, selectedId)).rejects.toThrow('selection write interrupted');
    expect(library.getSnapshot().shows.find((show) => show.id === created.id)).toEqual(original);
    expect(library.getSnapshot().selectedSetId).toBe(selectedId);
    expect(await repository.get(created.id)).toEqual(original);
    expect(await repository.history(created.id)).toEqual(history);
    expect(await readSetting(connections.at(-1)!.db, 'selection', null)).toEqual({ showId: created.id, setId: selectedId });
    failSelectionWrites = false;
    await library.removeSet(created.id, selectedId);
    const reopened = createLibraryStore(); await reopened.initialize();
    expect(reopened.getSnapshot().selectedSetId).toBe(created.sets[0]!.id);
  });
  it('does not rewrite or change the active selection while removing a playlist in another show', async () => {
    const library = createLibraryStore(); await library.initialize();
    const created = await library.createShow('Active show');
    const withSecond = await library.createSet(created.id, 'Active playlist'); const selectedId = withSecond.sets.at(-1)!.id;
    failSelectionWrites = true;
    await library.removeSet(sampleShow.id, sampleShow.sets[0]!.id);
    expect(library.getSnapshot()).toMatchObject({ selectedShowId: created.id, selectedSetId: selectedId });
    expect(library.getSnapshot().shows.find((show) => show.id === sampleShow.id)?.sets).toEqual([]);
    expect(await readSetting(connections.at(-1)!.db, 'selection', null)).toEqual({ showId: created.id, setId: selectedId });
    const reopened = createLibraryStore(); await reopened.initialize();
    expect(reopened.getSnapshot()).toMatchObject({ selectedShowId: created.id, selectedSetId: selectedId });
  });
});
