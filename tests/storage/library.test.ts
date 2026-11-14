import { DatabaseSync } from 'node:sqlite';
import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';
import { sampleControllerProfiles, sampleShow, type ControllerProfile, type MediaAsset, type Show } from '../../src/domain';
import { normalizeInput } from '../../src/controllers';
import { duplicateSetDocument, duplicateShowDocument, exactOrder, newAudioCue, newShow, removeCueDocument, upgradeShowDocument } from '../../src/library/operations';
import { DEFAULT_LIBRARY_SETTINGS, REVISION_HISTORY_PAGE_SIZE, type RevisionHistoryCursor } from '../../src/library/types';
import { validateLocalShow } from '../../src/library/validate';
import { migrateSqlite, SQLITE_MIGRATIONS } from '../../src/storage/contracts';
import { libraryPayloadUris, makeLibraryManifest, materializeLibraryShow, unboundControllerProfiles, validateLibraryManifest } from '../../src/storage/library-bundle';
import { expoSqliteDriver, LIBRARY_SQLITE_MIGRATIONS, migrateLibrary, portableSettings, readSetting, replaceLibrary, SqlitePromptRepository, SqliteShowRepository, writeSetting } from '../../src/storage/sqlite';
import { extractStoredEntry, inspectStoredZip, safeArchivePath, writeStoredZip, type ZipReader } from '../../src/storage/zip';

const ids = () => { let count = 0; return () => `copy-${++count}`; };
const now = () => '2026-10-13T00:00:00Z';
function sqliteFixture(afterRun?: (sql: string) => void): { db: SQLiteDatabase; close(): void } {
  const raw = new DatabaseSync(':memory:');
  const port = {
    execAsync: async (sql: string) => { raw.exec(sql); },
    runAsync: async (sql: string, ...values: unknown[]) => { const parameters = Array.isArray(values[0]) ? values[0] : values; const result = raw.prepare(sql).run(...parameters as (string | number | null)[]); afterRun?.(sql); return result; },
    getFirstAsync: async (sql: string, ...values: unknown[]) => raw.prepare(sql).get(...(Array.isArray(values[0]) ? values[0] : values) as (string | number | null)[]) ?? null,
    getAllAsync: async (sql: string, ...values: unknown[]) => raw.prepare(sql).all(...(Array.isArray(values[0]) ? values[0] : values) as (string | number | null)[]),
    withExclusiveTransactionAsync: async (work: (tx: unknown) => Promise<void>) => { raw.exec('BEGIN IMMEDIATE'); try { await work(port); raw.exec('COMMIT'); } catch (error) { raw.exec('ROLLBACK'); throw error; } },
  };
  return { db: port as unknown as SQLiteDatabase, close: () => raw.close() };
}

describe('observed database schema', () => {
  it('merges included music without changing existing documents, preferences or selection', async () => {
    const fixture = sqliteFixture();
    try {
      await migrateLibrary(fixture.db, async () => undefined);
      const repository = new SqliteShowRepository(fixture.db); await repository.save(sampleShow);
      const original = await repository.get(sampleShow.id);
      const preferences = { ...DEFAULT_LIBRARY_SETTINGS, locale: 'he' as const, theme: 'purpleNight' as const, onboardingCompleted: true };
      const selection = { showId: sampleShow.id, setId: sampleShow.sets[0]!.id };
      await writeSetting(fixture.db, 'preferences', preferences); await writeSetting(fixture.db, 'selection', selection);
      await replaceLibrary(fixture.db, [{ ...sampleShow, id: 'included', revisionId: 'included-v1' }], [], DEFAULT_LIBRARY_SETTINGS, undefined, undefined, true);
      expect(await repository.get(sampleShow.id)).toEqual(original);
      expect(await repository.get('included')).not.toBeNull();
      expect(await readSetting(fixture.db, 'preferences', null)).toEqual(preferences);
      expect(await readSetting(fixture.db, 'selection', null)).toEqual(selection);
    } finally { fixture.close(); }
  });
  it.each(['library', 'base'] as const)('does not infer an empty database when the %s schema observation is missing', async (layer) => {
    const fixture = sqliteFixture();
    try {
      await migrateLibrary(fixture.db, async () => undefined);
      await new SqliteShowRepository(fixture.db).save(sampleShow);
      const read = fixture.db.getFirstAsync.bind(fixture.db); const transaction = jest.spyOn(fixture.db, 'withExclusiveTransactionAsync');
      fixture.db.getFirstAsync = (async (sql: string, ...input: unknown[]) => sql === 'PRAGMA user_version' ? null : read(sql, ...(input as SQLiteBindValue[]))) as SQLiteDatabase['getFirstAsync'];
      const backup = jest.fn(async () => undefined);
      await expect(layer === 'library' ? migrateLibrary(fixture.db, backup) : migrateSqlite(expoSqliteDriver(fixture.db), LIBRARY_SQLITE_MIGRATIONS)).rejects.toThrow('schema');
      expect(backup).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled();
      fixture.db.getFirstAsync = read;
      expect((await fixture.db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!.user_version).toBe(3);
      expect((await new SqliteShowRepository(fixture.db).get(sampleShow.id))!.revisionId).toBe(sampleShow.revisionId);
    } finally { fixture.close(); }
  });
});

describe('bounded revision history', () => {
  it('visits every revision once across timestamp ties without fetching show documents', async () => {
    const fixture = sqliteFixture();
    try {
      await migrateLibrary(fixture.db, async () => undefined);
      const repository = new SqliteShowRepository(fixture.db);
      const expected: string[] = [];
      for (let index = 0; index < 63; index += 1) {
        const id = `version-${String(index).padStart(3, '0')}`; expected.push(id);
        // Deliberately unreadable full documents prove browsing never parses them.
        await fixture.db.runAsync('INSERT INTO show_revisions VALUES (?, ?, ?, ?, ?)', id, 'show-a', '2026-10-24T00:00:00Z', null, '{damaged document');
      }
      await fixture.db.runAsync('INSERT INTO show_revisions VALUES (?, ?, ?, ?, ?)', 'foreign', 'show-b', '2026-10-25T00:00:00Z', null, '{}');
      let cursor: RevisionHistoryCursor | undefined; const found: string[] = []; let pages = 0;
      do {
        const page = await repository.history('show-a', cursor); pages += 1;
        expect(page.revisions.length).toBeLessThanOrEqual(REVISION_HISTORY_PAGE_SIZE);
        expect(page.revisions.every((revision) => !('show' in revision))).toBe(true);
        found.push(...page.revisions.map((revision) => revision.id)); cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(pages).toBe(4); expect(found).toEqual(expected.reverse()); expect(new Set(found).size).toBe(63);
      expect((await repository.history('missing')).revisions).toEqual([]);
    } finally { fixture.close(); }
  });
  it('keeps subsequent pages stable when a newer version is inserted', async () => {
    const fixture = sqliteFixture();
    try {
      await migrateLibrary(fixture.db, async () => undefined);
      const repository = new SqliteShowRepository(fixture.db);
      for (let index = 0; index < 21; index += 1) await fixture.db.runAsync('INSERT INTO show_revisions VALUES (?, ?, ?, ?, ?)', `v${String(index).padStart(3, '0')}`, 'show', '2026-10-24T00:00:00Z', null, '{}');
      const first = await repository.history('show'); expect(first.nextCursor).not.toBeNull();
      await fixture.db.runAsync('INSERT INTO show_revisions VALUES (?, ?, ?, ?, ?)', 'new', 'show', '2026-10-25T00:00:00Z', null, '{}');
      const second = await repository.history('show', first.nextCursor!);
      expect(second.revisions.map((revision) => revision.id)).toEqual(['v000']); expect(second.nextCursor).toBeNull();
      expect((await repository.history('show')).revisions[0]!.id).toBe('new');
    } finally { fixture.close(); }
  });
  it('returns one small metadata page from a large history and reads only its selected document', async () => {
    const fixture = sqliteFixture();
    try {
      await migrateLibrary(fixture.db, async () => undefined);
      const repository = new SqliteShowRepository(fixture.db);
      const songIds = Array.from({ length: 170 }, (_, index) => `song-${index}`);
      const large = JSON.stringify({ ...sampleShow, sets: sampleShow.sets.map((set) => ({ ...set, cueOrder: songIds, hitCueIds: [] })), cues: Object.fromEntries(songIds.map((id) => [id, { ...sampleShow.cues.opening, id, notes: 'Large history fixture '.repeat(20) }])) });
      for (let index = 0; index < 1200; index += 1) await fixture.db.runAsync('INSERT INTO show_revisions VALUES (?, ?, ?, ?, ?)', `revision-${String(index).padStart(4, '0')}`, sampleShow.id, '2026-10-24T00:00:00Z', null, large);
      const page = await repository.history(sampleShow.id); expect(page.revisions).toHaveLength(REVISION_HISTORY_PAGE_SIZE);
      expect(JSON.stringify(page).length).toBeLessThan(5000);
      const selected = await repository.revision(sampleShow.id, 'revision-0000'); expect(Object.keys(selected!.show.cues)).toHaveLength(170);
      expect(await repository.revision('another-show', 'revision-0000')).toBeNull(); expect(await repository.revision(sampleShow.id, 'missing')).toBeNull();
      await fixture.db.runAsync('INSERT INTO show_revisions VALUES (?, ?, ?, ?, ?)', 'damaged', sampleShow.id, '2026-10-25T00:00:00Z', null, '{damaged');
      await expect(repository.history(sampleShow.id)).resolves.toMatchObject({ revisions: expect.arrayContaining([expect.objectContaining({ id: 'damaged' })]) });
      await expect(repository.revision(sampleShow.id, 'damaged')).rejects.toThrow();
      expect((await repository.revision(sampleShow.id, 'revision-0000'))!.show.id).toBe(sampleShow.id);
    } finally { fixture.close(); }
  });
  it.each([null, {}, { createdAt: '', id: 'v' }, { createdAt: 'x'.repeat(129), id: 'v' }, { createdAt: 'date', id: '' }, { createdAt: 'date', id: 'x'.repeat(1025) }, { createdAt: 42, id: 'v' }])('rejects malformed cursors without SQL interpolation: %p', async (cursor) => {
    const fixture = sqliteFixture();
    try { await expect(new SqliteShowRepository(fixture.db).history('show', cursor as RevisionHistoryCursor)).rejects.toThrow('Invalid revision history cursor'); }
    finally { fixture.close(); }
  });
});
describe('immutable library operations', () => {
  it('starts imported songs with a manual, untrimmed and predictable playback policy', () => {
    const song = newAudioCue('media-owned', 'Opening', ids());
    expect(song).toMatchObject({ trimInMs: 0, gainDb: -18, playbackRate: 1, preWaitMs: 0,
      fadeInMs: 800, fadeOutMs: 1800, endBehavior: 'stopAndReadyNext', autoPlay: false,
      crossfadeEnabled: false, crossfadeMs: 2000 });
    expect(song.trimOutMs).toBeUndefined();
    expect(song.visualAssetId).toBeUndefined();
    expect(DEFAULT_LIBRARY_SETTINGS).toMatchObject({ theme: 'darkBlue', locale: 'en', onboardingCompleted: false, externalDisplayEnabled: false, voiceModel: 'base' });
  });
  it('duplicates tuning and nested group children independently while retaining media content identities', () => {
    const copy = duplicateSetDocument(sampleShow, 'set-main', 'Second show', ids());
    const duplicate = copy.sets.at(-1)!;
    expect(duplicate.cueOrder).not.toEqual(sampleShow.sets[0]!.cueOrder);
    const group = copy.cues[duplicate.cueOrder[1]!]!;
    expect(group.type).toBe('group');
    if (group.type !== 'group') return;
    const bed = copy.cues[group.children[0]!.cueId]!;
    expect(bed).not.toBe(sampleShow.cues.bed);
    expect(bed.type === 'audio' && bed.mediaAssetId).toBe('media-bed');
    expect(sampleShow.sets).toHaveLength(1);
  });
  it('new sets use OMS but migration retains legacy transport without changing original documents', () => {
    expect(newShow('Show', ids(), now).sets[0]!.transportMode).toBe('oms');
    expect(upgradeShowDocument(sampleShow).sets[0]!.transportMode).toBe('legacyCueStack');
    expect(sampleShow.sets[0]!.transportMode).toBeUndefined();
    const copy = duplicateShowDocument(sampleShow, 'Copy', ids(), now);
    expect(copy.id).not.toBe(sampleShow.id);
    expect(copy.cues.bed).not.toBe(sampleShow.cues.bed);
    expect(copy.cues.crossfade).toEqual(sampleShow.cues.crossfade);
  });
  it('removes a cue from all orders, groups and voice references and rejects destructive reorder omissions', () => {
    const show: Show = { ...sampleShow, voiceRules: [{ id: 'rule', phrases: ['reveal'], locale: 'en', enabled: true, action: { type: 'PLAY', cueId: 'reveal' }, delayMs: 0 }] };
    const changed = removeCueDocument(show, 'reveal');
    expect(changed.voiceRules).toEqual([]);
    expect(changed.sets[0]!.hitCueIds).toEqual([]);
    expect(() => exactOrder(['a', 'b'], ['a', 'a'])).toThrow();
    expect(() => exactOrder(['a', 'b'], ['b'])).toThrow();
  });
});
describe('SQLite persistence and migration boundaries', () => {
  it('rolls back a show/revision/media save if preparation becomes critical before commit', async () => {
    const fixture = sqliteFixture();
    try {
      await migrateLibrary(fixture.db, async () => undefined);
      const repository = new SqliteShowRepository(fixture.db); await repository.save(sampleShow);
      let checks = 0; const guard = () => { if (++checks === 2) throw new Error('library.armed'); };
      await expect(repository.save({ ...sampleShow, revisionId: 'uncommitted', name: 'Must not replace' }, undefined, undefined, false, guard)).rejects.toThrow('library.armed');
      expect((await repository.get(sampleShow.id))!.name).toBe(sampleShow.name);
      expect((await repository.history(sampleShow.id)).revisions.some((value) => value.id === 'uncommitted')).toBe(false);
    } finally { fixture.close(); }
  });
  it('rolls back a full restore, profiles and preferences when the critical guard changes', async () => {
    const fixture = sqliteFixture();
    try {
      await migrateLibrary(fixture.db, async () => undefined);
      const repository = new SqliteShowRepository(fixture.db); await repository.save(sampleShow);
      let checks = 0;
      await expect(replaceLibrary(fixture.db, [{ ...sampleShow, id: 'restored', revisionId: 'restore-rev' }], sampleControllerProfiles,
        { ...DEFAULT_LIBRARY_SETTINGS, theme: 'cobra' }, () => { if (++checks === 2) throw new Error('library.armed'); })).rejects.toThrow('library.armed');
      expect(await repository.get('restored')).toBeNull();
      expect(await fixture.db.getFirstAsync('SELECT value_json FROM library_settings WHERE key = ?', 'preferences')).toBeNull();
      expect(await fixture.db.getAllAsync('SELECT id FROM controller_profiles')).toEqual([]);
    } finally { fixture.close(); }
  });
  it('upgrades v1, retains legacy semantics and durable revisions, and rejects a newer database', async () => {
    const fixture = sqliteFixture();
    try {
      await migrateSqlite(expoSqliteDriver(fixture.db), SQLITE_MIGRATIONS);
      await fixture.db.runAsync('INSERT INTO shows VALUES (?, ?, ?, ?, ?)', sampleShow.id, sampleShow.revisionId, sampleShow.name, sampleShow.updatedAt, JSON.stringify(sampleShow));
      const backup = jest.fn(async () => undefined); await migrateLibrary(fixture.db, backup);
      expect(backup).toHaveBeenCalledTimes(1);
      const repository = new SqliteShowRepository(fixture.db);
      expect((await repository.get(sampleShow.id))!.sets[0]!.transportMode).toBe('legacyCueStack');
      await repository.save({ ...sampleShow, revisionId: 'rev-2', name: 'Changed' }, 'rename');
      expect((await repository.history(sampleShow.id)).revisions.map((row) => row.id).sort()).toEqual(['rev-1', 'rev-2']);
      expect((await repository.get(sampleShow.id))!.name).toBe('Changed');
      await repository.delete(sampleShow.id);
      expect(await repository.get(sampleShow.id)).toBeNull();
      const deleted = (await repository.trash())[0]!; expect(deleted.name).toBe('Changed');
      await repository.save({ ...deleted, revisionId: 'rev-restore' }, 'restore', undefined, true);
      expect(await repository.trash()).toEqual([]);
      expect((await repository.get(sampleShow.id))!.revisionId).toBe('rev-restore');
      await fixture.db.execAsync('PRAGMA user_version = 4');
      await expect(migrateLibrary(fixture.db, backup)).rejects.toThrow('newer');
      expect((await repository.get(sampleShow.id))!.name).toBe('Changed');
    } finally { fixture.close(); }
  });
  it('rolls back every show, revision and media write after an interrupted save or cancellation', async () => {
    let fail = false; const controller = new AbortController();
    const fixture = sqliteFixture((sql) => { if (fail && sql.startsWith('INSERT OR IGNORE INTO show_revisions')) throw new Error('disk-full'); if (fail && sql.startsWith('INSERT OR REPLACE INTO shows')) controller.abort(); });
    try {
      await migrateLibrary(fixture.db, async () => undefined); const repository = new SqliteShowRepository(fixture.db); await repository.save(sampleShow);
      fail = true;
      await expect(repository.save({ ...sampleShow, name: 'Lost', revisionId: 'rev-lost' })).rejects.toThrow('disk-full');
      expect((await repository.get(sampleShow.id))!.name).toBe(sampleShow.name);
      expect((await repository.history(sampleShow.id)).revisions.map((value) => value.id)).toEqual(['rev-1']);
      await expect(repository.save({ ...sampleShow, name: 'Cancelled', revisionId: 'rev-cancel' }, undefined, controller.signal)).rejects.toThrow('cancelled');
      expect((await repository.get(sampleShow.id))!.revisionId).toBe('rev-1');
    } finally { fixture.close(); }
  });
  it('upgrades schema 2 without replacing revisions and records answers, clarifications and generation alongside undoable edits', async () => {
    const fixture = sqliteFixture();
    try {
      await migrateSqlite(expoSqliteDriver(fixture.db), LIBRARY_SQLITE_MIGRATIONS.filter((migration) => migration.version <= 2));
      const shows = new SqliteShowRepository(fixture.db); await shows.save(sampleShow);
      const backup = jest.fn(async () => undefined); await migrateLibrary(fixture.db, backup); expect(backup).toHaveBeenCalledTimes(1);
      const prompts = new SqlitePromptRepository(fixture.db);
      const kinds = ['answer', 'clarification', 'edit', 'generateArtwork', 'generateMusic'] as const;
      for (const [index, kind] of kinds.entries()) await prompts.record(sampleShow.id, { prompt: `Request '${kind}'\nsecond line`, response: `Result ${kind}`, kind,
        ...(kind === 'edit' ? { beforeRevisionId: sampleShow.revisionId } : {}) }, `prompt-${index}`, now());
      await shows.save({ ...sampleShow, revisionId: 'after-edit', name: 'After edit' });
      const history = await prompts.list(sampleShow.id);
      expect(history.map((entry) => entry.kind).sort()).toEqual([...kinds].sort());
      expect(history.find((entry) => entry.kind === 'edit')!.beforeRevisionId).toBe('rev-1');
      const before = (await shows.revision(sampleShow.id, history.find((entry) => entry.kind === 'edit')!.beforeRevisionId!))!;
      await shows.save({ ...before.show, revisionId: 'undo-edit' });
      expect((await shows.get(sampleShow.id))!.name).toBe(sampleShow.name);
      expect(await prompts.list('different-show')).toEqual([]);
      await expect(prompts.record(sampleShow.id, { prompt: 'Missing revision', response: 'No change', kind: 'edit', beforeRevisionId: 'not-saved' }, 'bad', now())).rejects.toThrow('revision');
      expect(await prompts.list(sampleShow.id)).toHaveLength(5);
    } finally { fixture.close(); }
  });
  it('rolls back interrupted prompt writes without changing the show and omits extra provider credentials', async () => {
    let fail = false;
    const fixture = sqliteFixture((sql) => { if (fail && sql.startsWith('INSERT INTO assistant_prompts')) throw new Error('disk-full'); });
    try {
      await migrateLibrary(fixture.db, async () => undefined); const shows = new SqliteShowRepository(fixture.db); await shows.save(sampleShow);
      const prompts = new SqlitePromptRepository(fixture.db);
      const entry = { prompt: 'How many songs?', response: 'Three', kind: 'answer' as const, apiKey: 'private-key' };
      await prompts.record(sampleShow.id, entry, 'answer', now());
      expect(JSON.stringify(await prompts.list(sampleShow.id))).not.toContain('private-key');
      fail = true; await expect(prompts.record(sampleShow.id, { prompt: 'More?', response: 'No', kind: 'clarification' }, 'failed', now())).rejects.toThrow('disk-full');
      expect(await prompts.list(sampleShow.id)).toHaveLength(1);
      expect((await shows.get(sampleShow.id))!.revisionId).toBe('rev-1');
    } finally { fixture.close(); }
  });
  it('saves more than 500 local assets and payloads above archive byte limits while keeping archive export bounded', async () => {
    const media: Record<string, MediaAsset> = {};
    for (let index = 0; index < 600; index++) {
      const checksumSha256 = index.toString(16).padStart(64, '0');
      media[`asset-${index}`] = { id: `asset-${index}`, checksumSha256, localUri: `file:///app/${checksumSha256}.wav`, bytes: 1_000_000_001, durationMs: 10_000, codec: 'wav', channels: 2, sampleRate: 48000 };
    }
    const cue = sampleShow.cues.opening!; if (cue.type !== 'audio') throw new Error('Sample changed.');
    const show: Show = { ...sampleShow, media, cues: { first: { ...cue, id: 'first', mediaAssetId: 'asset-0', trimOutMs: 10_000 } },
      sets: [{ id: 'set', name: 'Unlimited', cueOrder: ['first'], hitCueIds: [] }] };
    expect(() => validateLocalShow(show, sampleControllerProfiles)).not.toThrow();
    const fixture = sqliteFixture();
    try {
      await migrateLibrary(fixture.db, async () => undefined); const repository = new SqliteShowRepository(fixture.db);
      await repository.save(show); expect(Object.keys((await repository.get(show.id))!.media)).toHaveLength(600);
      await repository.save({ ...show, name: 'Renamed large library', revisionId: 'large-edit' });
      expect((await repository.get(show.id))!.name).toBe('Renamed large library');
    } finally { fixture.close(); }
    const manifest = makeLibraryManifest([show], sampleControllerProfiles, DEFAULT_LIBRARY_SETTINGS, show.id, 'set', 'large-backup');
    const entries = [{ path: 'manifest.json', bytes: 10, crc32: 0, dataOffset: 0 }, ...manifest.files.map((file) => ({ path: file.path, bytes: file.bytes, crc32: 0, dataOffset: 0 }))];
    expect(() => validateLibraryManifest(manifest, entries)).toThrow('Backup');
  });
  it('rolls back an AI edit aborted after its first SQL write and still permits the next deliberate save', async () => {
    const controller = new AbortController(); let cancelDuringWrite = false;
    const fixture = sqliteFixture((sql) => { if (cancelDuringWrite && sql.startsWith('INSERT OR REPLACE INTO shows')) controller.abort(); });
    try {
      await migrateLibrary(fixture.db, async () => undefined); const repository = new SqliteShowRepository(fixture.db); await repository.save(sampleShow);
      cancelDuringWrite = true;
      await expect(repository.save({ ...sampleShow, name: 'AI result', revisionId: 'cancelled-ai' }, 'change show', controller.signal)).rejects.toThrow('cancelled');
      expect((await repository.get(sampleShow.id))!.name).toBe(sampleShow.name);
      expect((await repository.history(sampleShow.id)).revisions.some((revision) => revision.id === 'cancelled-ai')).toBe(false);
      cancelDuringWrite = false; await repository.save({ ...sampleShow, name: 'Deliberate edit', revisionId: 'next-deliberate' });
      expect((await repository.get(sampleShow.id))!.name).toBe('Deliberate edit');
    } finally { fixture.close(); }
  });
});
async function zip(files: { path: string; data: Uint8Array }[]): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  await writeStoredZip(files.map(({ path, data }) => ({ path, bytes: data.length, read: async (offset, length) => data.slice(offset, offset + length) })), { write: async (bytes) => { chunks.push(bytes.slice()); } });
  const result = new Uint8Array(chunks.reduce((sum, bytes) => sum + bytes.length, 0)); let offset = 0; for (const bytes of chunks) { result.set(bytes, offset); offset += bytes.length; } return result;
}
const reader = (bytes: Uint8Array): ZipReader => ({ size: bytes.length, read: async (offset, length) => bytes.slice(offset, offset + length) });
describe('streamed ZIP validation and complete portable manifests', () => {
  it('round trips chunked data without loading payloads as one file, and detects corrupt bytes', async () => {
    const payload = Uint8Array.from({ length: 600_000 }, (_value, index) => index % 255);
    const bytes = await zip([{ path: 'manifest.json', data: new Uint8Array([123, 125]) }, { path: 'media/a.wav', data: payload }]);
    const entries = await inspectStoredZip(reader(bytes)); let restored = 0;
    await extractStoredEntry(reader(bytes), entries[1]!, { write: async (chunk) => { expect(chunk.length).toBeLessThanOrEqual(262144); restored += chunk.length; } });
    expect(restored).toBe(payload.length);
    bytes[entries[1]!.dataOffset + 10] = 42;
    await expect(extractStoredEntry(reader(bytes), entries[1]!, { write: async () => undefined })).rejects.toThrow('CRC');
  });
  it('rejects traversal, symlinks, compression, oversized entries and malformed directory offsets before extraction', async () => {
    for (const path of ['../track', '/track', 'C:/track', 'media\\track', 'media/../track', 'media//track']) expect(safeArchivePath(path)).toBe(false);
    const bytes = await zip([{ path: 'manifest.json', data: new Uint8Array([123, 125]) }]);
    const centralOffset = new DataView(bytes.buffer).getUint32(bytes.length - 6, true);
    for (const mutate of [
      (view: DataView) => view.setUint32(centralOffset + 38, 0xa000 << 16, true),
      (view: DataView) => view.setUint16(centralOffset + 10, 8, true),
      (view: DataView) => view.setUint32(centralOffset + 24, 1_000_000_001, true),
      (view: DataView) => view.setUint32(centralOffset + 42, 1, true),
    ]) { const changed = bytes.slice(); mutate(new DataView(changed.buffer)); await expect(inspectStoredZip(reader(changed))).rejects.toThrow(); }
  });
  it('exports every visual/rule/settings field but excludes secrets and source-device identities, then validates domain references', () => {
    const show: Show = { ...sampleShow, schemaVersion: 2, visualAssets: { cover: { id: 'cover', kind: 'image', bytes: 4, checksumSha256: '3'.repeat(64), localUri: 'file:///app/cover.png', mimeType: 'image/png', width: 10, height: 20 } },
      voiceRules: [{ id: 'rule', phrases: ['banana'], locale: 'he', enabled: true, action: { type: 'GO' }, delayMs: 0 }] };
    const profiles = sampleControllerProfiles.map((profile) => ({ ...profile, bindings: profile.bindings.map((binding) => ({ ...binding, adapterId: 'flic', deviceId: 'private-device' })) }));
    const manifest = makeLibraryManifest([show], profiles, { ...DEFAULT_LIBRARY_SETTINGS, secretKey: 'private-key' } as typeof DEFAULT_LIBRARY_SETTINGS, show.id, 'set-main', 'export');
    const entries = [{ path: 'manifest.json', bytes: 10, crc32: 0, dataOffset: 0 }, ...manifest.files.map((file) => ({ path: file.path, bytes: file.bytes, crc32: 0, dataOffset: 0 }))];
    expect(JSON.stringify(manifest)).not.toMatch(/private-key|private-device|localUri/);
    expect(validateLibraryManifest(manifest, entries).shows[0]!.voiceRules).toHaveLength(1);
    const restored = materializeLibraryShow(manifest.shows[0]!, (path) => `file:///new/${path}`);
    expect(restored.visualAssets!.cover!.localUri).toContain('file:///new/');
    const alternate: Show = { ...show, id: 'second-show', visualAssets: { cover: { ...show.visualAssets!.cover!, localUri: 'file:///app/renamed-cover.jpg' } } };
    const both = makeLibraryManifest([show, alternate], profiles, DEFAULT_LIBRARY_SETTINGS, show.id, 'set-main', 'both');
    const sources = libraryPayloadUris([show, alternate], both);
    expect(sources.get(`visuals/${'3'.repeat(64)}.png`)).toBe('file:///app/cover.png');
    expect(sources.get(`visuals/${'3'.repeat(64)}.jpg`)).toBe('file:///app/renamed-cover.jpg');
    expect(() => validateLibraryManifest({ ...manifest, schemaVersion: 3 }, entries)).toThrow();
    expect(() => validateLibraryManifest({ ...manifest, files: [...manifest.files, manifest.files[0]!] }, entries)).toThrow();
    expect(portableSettings({ apiKey: 'private', voiceArmed: true })).toEqual(DEFAULT_LIBRARY_SETTINGS);
  });
  it('saves and backs up two Flic primary buttons with distinct private logical roles and restores inert controls', async () => {
    const profile: ControllerProfile = { id: 'profile-stage', name: 'Two-button Flic', bindings: [
      { inputKey: 'primary', adapterId: 'flic2', deviceId: 'AA:BB:CC:DD:01', command: { type: 'GO' } },
      { inputKey: 'primary', adapterId: 'flic2', deviceId: 'AA:BB:CC:DD:02', command: { type: 'PANIC_FADE' } },
    ] };
    const manifest = makeLibraryManifest([sampleShow], [profile], DEFAULT_LIBRARY_SETTINGS, sampleShow.id, 'set-main', 'two-flic');
    const entries = [{ path: 'manifest.json', bytes: 10, crc32: 0, dataOffset: 0 }, ...manifest.files.map((file) => ({ path: file.path, bytes: file.bytes, crc32: 0, dataOffset: 0 }))];
    expect(() => validateLibraryManifest(manifest, entries)).not.toThrow();
    expect(JSON.stringify(manifest)).not.toContain('AA:BB:CC:DD');
    expect(manifest.controllerProfiles[0]!.bindings.map((binding) => binding.deviceId)).toEqual(['logical-device-1', 'logical-device-2']);
    expect(manifest.controllerProfiles[0]!.bindings.map((binding) => binding.adapterId)).toEqual(['flic2', 'flic2']);
    const restoredProfiles = unboundControllerProfiles(manifest.controllerProfiles);
    const restoredManifest = makeLibraryManifest([sampleShow], restoredProfiles, DEFAULT_LIBRARY_SETTINGS, sampleShow.id, 'set-main', 'restored');
    expect(() => validateLibraryManifest(restoredManifest, entries)).not.toThrow();
    for (const deviceId of ['AA:BB:CC:DD:01', 'AA:BB:CC:DD:02', 'logical-device-1'])
      expect(normalizeInput({ adapterId: 'flic2', deviceId, inputKey: 'primary', phase: 'down', isRepeat: false, monotonicMs: 1 }, restoredProfiles[0]!)).toBeNull();
    const fixture = sqliteFixture();
    try { await migrateLibrary(fixture.db, async () => undefined); const repository = new SqliteShowRepository(fixture.db); await repository.save(sampleShow); expect((await repository.get(sampleShow.id))!.id).toBe(sampleShow.id); }
    finally { fixture.close(); }
  });
  it('keeps incomplete learned controller profiles portable whether attached or saved as a builder draft', () => {
    const { controllerProfileId: _profileId, ...unattachedShow } = sampleShow;
    const draft: ControllerProfile = { id: 'draft', name: 'Learning', bindings: [{ inputKey: 'primary', adapterId: 'flic2', deviceId: 'private-device', command: { type: 'GO' } }] };
    const manifest = makeLibraryManifest([unattachedShow], [draft], DEFAULT_LIBRARY_SETTINGS, unattachedShow.id, 'set-main', 'draft-export');
    const entries = [{ path: 'manifest.json', bytes: 10, crc32: 0, dataOffset: 0 }, ...manifest.files.map((file) => ({ path: file.path, bytes: file.bytes, crc32: 0, dataOffset: 0 }))];
    expect(() => validateLibraryManifest(manifest, entries)).not.toThrow();
    expect(() => validateLibraryManifest({ ...manifest, shows: [{ ...manifest.shows[0]!, controllerProfileId: 'draft' }] }, entries)).not.toThrow();
  });
});
