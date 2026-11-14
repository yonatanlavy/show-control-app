import type { SQLiteDatabase } from 'expo-sqlite';
import type { ControllerProfile, MediaAsset, Show } from '../domain';
import { copyDocument, upgradeShowDocument } from '../library/operations';
import { DEFAULT_LIBRARY_SETTINGS, REVISION_HISTORY_PAGE_SIZE, type AssistantPromptInput, type AssistantPromptKind, type AssistantPromptRecord, type LibrarySettings, type RevisionHistoryCursor, type RevisionHistoryPage, type ShowRevision } from '../library/types';
import { migrateSqlite, SQLITE_MIGRATIONS, type MediaAssetRepository, type ShowRepository, type ShowSummary, type SqliteDriver, type SqliteExecutor, type SqlValueMap } from './contracts';

export const LIBRARY_SQLITE_MIGRATIONS = [...SQLITE_MIGRATIONS, { version: 2, name: 'oms-revisions-settings-recovery', statements: [
  'CREATE TABLE IF NOT EXISTS show_revisions (id TEXT PRIMARY KEY NOT NULL, show_id TEXT NOT NULL, created_at TEXT NOT NULL, prompt TEXT, document_json TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS revision_show_time ON show_revisions(show_id, created_at DESC)',
  'CREATE TABLE IF NOT EXISTS library_settings (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS deleted_shows (id TEXT PRIMARY KEY NOT NULL, deleted_at TEXT NOT NULL, document_json TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS migration_ledger (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)',
] }, { version: 3, name: 'complete-assistant-prompt-history', statements: [
  "CREATE TABLE IF NOT EXISTS assistant_prompts (id TEXT PRIMARY KEY NOT NULL, show_id TEXT NOT NULL, created_at TEXT NOT NULL, prompt TEXT NOT NULL, response TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('answer','clarification','edit','generateArtwork','generateMusic')), before_revision_id TEXT)",
  'CREATE INDEX IF NOT EXISTS assistant_prompt_show_time ON assistant_prompts(show_id, created_at DESC)',
] }] as const;
export const LIBRARY_DATABASE_VERSION = 3;
type SQLConnection = Pick<SQLiteDatabase, 'runAsync' | 'getFirstAsync' | 'getAllAsync' | 'execAsync'>;
/** This is connection-local; Expo exclusive transactions open a separate handle. */
export async function configureLibraryBusyTimeout(db: Pick<SQLiteDatabase, 'execAsync'>): Promise<void> {
  await db.execAsync('PRAGMA busy_timeout = 1000');
}
/** Retry only read-only startup queries, never transaction bodies or mutations. */
export async function retryLibraryRead<T>(read: () => Promise<T>): Promise<T> {
  const delays = [75, 225];
  for (let attempt = 0; ; attempt += 1) {
    try { return await read(); }
    catch (error) {
      const busy = error instanceof Error && /\b(?:database(?: table| schema)? is (?:locked|busy)|SQLITE_(?:BUSY|LOCKED)(?:_\w+)?)\b/i.test(error.message);
      if (!busy || attempt >= delays.length) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}
const executor = (db: SQLConnection): SqliteExecutor => ({
  execute: async (sql, parameters = []) => { if (parameters.length) await db.runAsync(sql, [...parameters]); else await db.execAsync(sql); },
  first: <T extends SqlValueMap>(sql: string, parameters: readonly (string | number | null)[] = []) => db.getFirstAsync<T>(sql, [...parameters]),
});
export function expoSqliteDriver(db: SQLiteDatabase): SqliteDriver {
  return { ...executor(db), exclusiveTransaction: async <T>(work: (tx: SqliteExecutor) => Promise<T>): Promise<T> => {
    let result!: T;
    await db.withExclusiveTransactionAsync(async (tx) => { result = await work(executor(tx)); });
    return result;
  } };
}
function parseShow(json: string): Show { return upgradeShowDocument(JSON.parse(json) as Show); }
export class SqliteShowRepository implements ShowRepository {
  constructor(private readonly db: SQLiteDatabase) {}
  async list(): Promise<readonly ShowSummary[]> {
    const rows = await this.db.getAllAsync<{ id: string; revision_id: string; name: string; updated_at: string }>('SELECT id, revision_id, name, updated_at FROM shows ORDER BY updated_at DESC, name');
    return rows.map((row) => ({ id: row.id, revisionId: row.revision_id, name: row.name, updatedAt: row.updated_at }));
  }
  async all(): Promise<readonly Show[]> { return (await this.db.getAllAsync<{ document_json: string }>('SELECT document_json FROM shows ORDER BY updated_at DESC, name')).map((row) => parseShow(row.document_json)); }
  async get(id: string): Promise<Show | null> {
    const row = await this.db.getFirstAsync<{ document_json: string }>('SELECT document_json FROM shows WHERE id = ?', id);
    return row ? parseShow(row.document_json) : null;
  }
  async save(show: Show, prompt?: string, signal?: AbortSignal, restoreDeleted = false, commitGuard?: () => void): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      commitGuard?.();
      if (signal?.aborted) throw new Error('Import cancelled.');
      await this.saveIn(tx, show, prompt);
      if (restoreDeleted) await tx.runAsync('DELETE FROM deleted_shows WHERE id = ?', show.id);
      if (signal?.aborted) throw new Error('Import cancelled.');
      commitGuard?.();
    });
  }
  async saveIn(tx: SQLConnection, show: Show, prompt?: string): Promise<void> {
    const json = JSON.stringify(show);
    await tx.runAsync('INSERT OR REPLACE INTO shows (id, revision_id, name, updated_at, document_json) VALUES (?, ?, ?, ?, ?)', show.id, show.revisionId, show.name, show.updatedAt, json);
    await tx.runAsync('INSERT OR IGNORE INTO show_revisions (id, show_id, created_at, prompt, document_json) VALUES (?, ?, ?, ?, ?)', show.revisionId, show.id, show.updatedAt, prompt ?? null, json);
    for (const asset of Object.values(show.media)) await tx.runAsync('INSERT OR REPLACE INTO media_assets (id, checksum_sha256, local_uri, bytes, metadata_json) VALUES (?, ?, ?, ?, ?)', asset.id, asset.checksumSha256, asset.localUri, asset.bytes, JSON.stringify(asset));
  }
  async delete(id: string, commitGuard?: () => void): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      commitGuard?.();
      await this.deleteIn(tx, id);
      commitGuard?.();
    });
  }
  async deleteIn(tx: SQLConnection, id: string): Promise<void> {
    await tx.runAsync('INSERT OR REPLACE INTO deleted_shows (id, deleted_at, document_json) SELECT id, ?, document_json FROM shows WHERE id = ?', new Date().toISOString(), id);
    await tx.runAsync('DELETE FROM shows WHERE id = ?', id);
  }
  async history(showId: string, cursor?: RevisionHistoryCursor): Promise<RevisionHistoryPage> {
    if (cursor !== undefined && (!cursor || typeof cursor !== 'object' || typeof cursor.createdAt !== 'string' || !cursor.createdAt || cursor.createdAt.length > 128 || typeof cursor.id !== 'string' || !cursor.id || cursor.id.length > 1024)) throw new Error('Invalid revision history cursor.');
    // Keep complete documents in SQLite. Even a very long history crosses the
    // bridge as at most one page of metadata, with deterministic timestamp ties.
    const where = cursor ? ' AND (created_at < ? OR (created_at = ? AND id < ?))' : '';
    const parameters = cursor ? [showId, cursor.createdAt, cursor.createdAt, cursor.id, REVISION_HISTORY_PAGE_SIZE + 1] : [showId, REVISION_HISTORY_PAGE_SIZE + 1];
    const rows = await this.db.getAllAsync<{ id: string; created_at: string; prompt: string | null }>(`SELECT id, created_at, prompt FROM show_revisions WHERE show_id = ?${where} ORDER BY created_at DESC, id DESC LIMIT ?`, parameters);
    const revisions = rows.slice(0, REVISION_HISTORY_PAGE_SIZE).map((row) => ({ id: row.id, createdAt: row.created_at, ...(row.prompt === null ? {} : { prompt: row.prompt }) }));
    const last = revisions.at(-1);
    return { revisions, nextCursor: rows.length > REVISION_HISTORY_PAGE_SIZE && last ? { createdAt: last.createdAt, id: last.id } : null };
  }
  async revision(showId: string, revisionId: string): Promise<ShowRevision | null> {
    const row = await this.db.getFirstAsync<{ id: string; created_at: string; prompt: string | null; document_json: string }>('SELECT id, created_at, prompt, document_json FROM show_revisions WHERE show_id = ? AND id = ?', showId, revisionId);
    return row ? { id: row.id, createdAt: row.created_at, ...(row.prompt === null ? {} : { prompt: row.prompt }), show: parseShow(row.document_json) } : null;
  }
  async trash(): Promise<readonly Show[]> {
    return (await this.db.getAllAsync<{ document_json: string }>('SELECT document_json FROM deleted_shows ORDER BY deleted_at DESC')).map((row) => parseShow(row.document_json));
  }
}
export class SqliteMediaRepository implements MediaAssetRepository {
  constructor(private readonly db: SQLiteDatabase, private readonly commitGuard?: () => void) {}
  private async find(sql: string, value: string): Promise<MediaAsset | null> {
    const row = await this.db.getFirstAsync<{ metadata_json: string }>(sql, value);
    return row ? JSON.parse(row.metadata_json) as MediaAsset : null;
  }
  get(id: string): Promise<MediaAsset | null> { return this.find('SELECT metadata_json FROM media_assets WHERE id = ?', id); }
  getByChecksum(checksum: string): Promise<MediaAsset | null> { return this.find('SELECT metadata_json FROM media_assets WHERE checksum_sha256 = ?', checksum); }
  async save(asset: MediaAsset): Promise<void> { await this.db.withExclusiveTransactionAsync(async (tx) => {
    this.commitGuard?.();
    await tx.runAsync('INSERT OR REPLACE INTO media_assets (id, checksum_sha256, local_uri, bytes, metadata_json) VALUES (?, ?, ?, ?, ?)', asset.id, asset.checksumSha256, asset.localUri, asset.bytes, JSON.stringify(asset));
    this.commitGuard?.();
  }); }
  async delete(id: string): Promise<void> { await this.db.runAsync('DELETE FROM media_assets WHERE id = ?', id); }
}
export class SqlitePromptRepository {
  constructor(private readonly db: SQLiteDatabase) {}
  async record(showId: string, entry: AssistantPromptInput, id: string, createdAt: string, commitGuard?: () => void): Promise<void> {
    if (typeof entry.prompt !== 'string' || !entry.prompt.trim() || entry.prompt.length > 32_000 ||
        typeof entry.response !== 'string' || entry.response.length > 256_000 ||
        !['answer', 'clarification', 'edit', 'generateArtwork', 'generateMusic'].includes(entry.kind)) throw new Error('Assistant prompt history entry is invalid.');
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      commitGuard?.();
      const show = await tx.getFirstAsync<{ id: string }>('SELECT id FROM shows WHERE id = ? UNION SELECT id FROM deleted_shows WHERE id = ?', showId, showId);
      if (!show) throw new Error('Show does not exist.');
      if (entry.beforeRevisionId !== undefined) {
        const revision = await tx.getFirstAsync<{ id: string }>('SELECT id FROM show_revisions WHERE id = ? AND show_id = ?', entry.beforeRevisionId, showId);
        if (!revision) throw new Error('The original show revision is not available.');
      }
      // Only the documented text and undo target are written; provider keys/configuration are never serialized here.
      await tx.runAsync('INSERT INTO assistant_prompts (id, show_id, created_at, prompt, response, kind, before_revision_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, showId, createdAt, entry.prompt, entry.response, entry.kind, entry.beforeRevisionId ?? null);
      commitGuard?.();
    });
  }
  async list(showId: string): Promise<readonly AssistantPromptRecord[]> {
    const rows = await this.db.getAllAsync<{ id: string; created_at: string; prompt: string; response: string; kind: AssistantPromptKind; before_revision_id: string | null }>(
      'SELECT id, created_at, prompt, response, kind, before_revision_id FROM assistant_prompts WHERE show_id = ? ORDER BY created_at DESC, rowid DESC', showId);
    return rows.map((row) => ({ id: row.id, createdAt: row.created_at, prompt: row.prompt, response: row.response, kind: row.kind,
      ...(row.before_revision_id === null ? {} : { beforeRevisionId: row.before_revision_id }) }));
  }
}
export async function readSetting<T>(db: SQLConnection, key: string, fallback: T): Promise<T> {
  const row = await db.getFirstAsync<{ value_json: string }>('SELECT value_json FROM library_settings WHERE key = ?', key);
  return row ? JSON.parse(row.value_json) as T : fallback;
}
export async function writeSetting(db: SQLConnection, key: string, value: unknown): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO library_settings (key, value_json) VALUES (?, ?)', key, JSON.stringify(value));
}
export function portableSettings(value: unknown): LibrarySettings {
  const raw = value && typeof value === 'object' ? value as Partial<LibrarySettings> : {};
  const locale = ['en', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ar'].includes(String(raw.locale)) ? raw.locale! : 'en';
  const theme = ['darkBlue', 'purpleNight', 'cobra'].includes(String(raw.theme)) ? raw.theme! : 'darkBlue';
  const model = (candidate: unknown, fallback: string) => typeof candidate === 'string' && /^[\w.:-]{1,100}$/.test(candidate) ? candidate : fallback;
  return { locale, theme, onboardingCompleted: raw.onboardingCompleted === true, externalDisplayEnabled: raw.externalDisplayEnabled === true,
    voiceModel: raw.voiceModel === 'small' ? 'small' : 'base', assistantProvider: raw.assistantProvider === 'anthropic' ? 'anthropic' : 'openai',
    assistantModel: model(raw.assistantModel, DEFAULT_LIBRARY_SETTINGS.assistantModel), artworkModel: model(raw.artworkModel, DEFAULT_LIBRARY_SETTINGS.artworkModel), musicModel: model(raw.musicModel, DEFAULT_LIBRARY_SETTINGS.musicModel) };
}
export async function listProfiles(db: SQLConnection): Promise<readonly ControllerProfile[]> {
  return (await db.getAllAsync<{ profile_json: string }>('SELECT profile_json FROM controller_profiles')).map((row) => JSON.parse(row.profile_json) as ControllerProfile);
}
export async function migrateLibrary(db: SQLiteDatabase, backup: () => Promise<void>): Promise<void> {
  const version = (await retryLibraryRead(() => db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')))?.user_version;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) throw new Error('Database schema could not be verified. Preserve the original database.');
  if (version > LIBRARY_DATABASE_VERSION) throw new Error('Database schema is newer than this app. Preserve it and use the newer app to export.');
  if (version >= 2) {
    const ledger = await retryLibraryRead(() => db.getAllAsync<{ version: number; applied_at: string }>('SELECT version, applied_at FROM migration_ledger'));
    if (ledger.some((entry) => !LIBRARY_SQLITE_MIGRATIONS.some((migration) => migration.version === entry.version) || entry.version > version || !Number.isFinite(Date.parse(entry.applied_at))))
      throw new Error('Database migration history is unsupported. Preserve the original database.');
    // A current, completed migration needs no journal-mode change, transaction or
    // document rewrite. The previous Activity may still be committing settings.
    if (version === LIBRARY_DATABASE_VERSION && ledger.some((entry) => entry.version === version)) {
      const journal = await retryLibraryRead(() => db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode'));
      if (journal?.journal_mode.toLowerCase() !== 'wal') {
        const configured = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode = WAL');
        // SQLite in-memory databases cannot use WAL. Managed on-device files
        // must establish WAL successfully before becoming a usable library.
        if (!['wal', 'memory'].includes(configured?.journal_mode.toLowerCase() ?? '')) throw new Error('The library journal could not be prepared safely.');
      }
      return;
    }
  }
  if (version > 0 && version < LIBRARY_DATABASE_VERSION) await backup();
  await migrateSqlite(expoSqliteDriver(db), LIBRARY_SQLITE_MIGRATIONS);
  await db.withExclusiveTransactionAsync(async (tx) => {
    await configureLibraryBusyTimeout(tx);
    const repository = new SqliteShowRepository(db);
    const rows = await tx.getAllAsync<{ document_json: string }>('SELECT document_json FROM shows');
    for (const row of rows) await repository.saveIn(tx, parseShow(row.document_json));
    await tx.runAsync('INSERT OR IGNORE INTO migration_ledger (version, applied_at) VALUES (?, ?)', LIBRARY_DATABASE_VERSION, new Date().toISOString());
  });
}
export async function replaceLibrary(db: SQLiteDatabase, shows: readonly Show[], profiles: readonly ControllerProfile[], settings: LibrarySettings, commitGuard?: () => void, selection?: { readonly showId: string; readonly setId: string | null }, preservePreferences = false): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    commitGuard?.();
    const repository = new SqliteShowRepository(db);
    // Restore merges as new identities; existing user work and revision history remain recoverable.
    for (const show of shows) await repository.saveIn(tx, copyDocument(show));
    for (const profile of profiles) await tx.runAsync('INSERT OR REPLACE INTO controller_profiles (id, profile_json) VALUES (?, ?)', profile.id, JSON.stringify(profile));
    if (!preservePreferences) await writeSetting(tx, 'preferences', portableSettings(settings));
    if (selection) await writeSetting(tx, 'selection', selection);
    commitGuard?.();
  });
}
