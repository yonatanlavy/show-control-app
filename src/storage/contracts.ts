import type { MediaAsset, Show } from '../domain';
import { inspectStagedFile } from './staged-inspection';

export interface SqlValueMap { readonly [column: string]: string | number | null }
export interface SqliteExecutor {
  execute(sql: string, parameters?: readonly (string | number | null)[]): Promise<void>;
  first<T extends SqlValueMap>(sql: string, parameters?: readonly (string | number | null)[]): Promise<T | null>;
}
export interface SqliteDriver extends SqliteExecutor {
  exclusiveTransaction<T>(work: (transaction: SqliteExecutor) => Promise<T>): Promise<T>;
}
export interface SqliteMigration { readonly version: number; readonly name: string; readonly statements: readonly string[] }
export const SQLITE_MIGRATIONS: readonly SqliteMigration[] = [{
  version: 1, name: 'initial-offline-library', statements: [
    'CREATE TABLE IF NOT EXISTS shows (id TEXT PRIMARY KEY NOT NULL, revision_id TEXT NOT NULL, name TEXT NOT NULL, updated_at TEXT NOT NULL, document_json TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS media_assets (id TEXT PRIMARY KEY NOT NULL, checksum_sha256 TEXT UNIQUE NOT NULL, local_uri TEXT NOT NULL, bytes INTEGER NOT NULL, metadata_json TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS controller_profiles (id TEXT PRIMARY KEY NOT NULL, profile_json TEXT NOT NULL)',
  ],
}];
export async function migrateSqlite(driver: SqliteDriver, migrations = SQLITE_MIGRATIONS): Promise<number> {
  // Journal mode cannot be changed from inside a SQLite transaction.
  await driver.execute('PRAGMA foreign_keys = ON');
  await driver.execute('PRAGMA journal_mode = WAL');
  const row = await driver.first<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version;
  if (typeof current !== 'number' || !Number.isSafeInteger(current) || current < 0 || current > Math.max(0, ...migrations.map((migration) => migration.version))) throw new Error('Database schema is unsupported; preserve the original database.');
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (migration.version <= current) continue;
    if (migration.version !== current + 1) throw new Error(`Missing migration ${current + 1}`);
    await driver.exclusiveTransaction(async (transaction) => {
      for (const sql of migration.statements) await transaction.execute(sql);
      await transaction.execute(`PRAGMA user_version = ${migration.version}`);
    });
    current = migration.version;
  }
  return current;
}
export interface ShowSummary { readonly id: string; readonly revisionId: string; readonly name: string; readonly updatedAt: string }
export interface ShowRepository {
  list(): Promise<readonly ShowSummary[]>;
  get(id: string): Promise<Show | null>;
  save(show: Show): Promise<void>;
  delete(id: string): Promise<void>;
}
export interface MediaAssetRepository {
  get(id: string): Promise<MediaAsset | null>;
  getByChecksum(checksumSha256: string): Promise<MediaAsset | null>;
  save(asset: MediaAsset): Promise<void>;
  delete(id: string): Promise<void>;
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export class InMemoryShowRepository implements ShowRepository {
  private readonly shows = new Map<string, Show>();
  async list(): Promise<readonly ShowSummary[]> {
    return [...this.shows.values()].map(({ id, revisionId, name, updatedAt }) => ({ id, revisionId, name, updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
  }
  async get(id: string): Promise<Show | null> { const value = this.shows.get(id); return value ? clone(value) : null; }
  async save(show: Show): Promise<void> { this.shows.set(show.id, clone(show)); }
  async delete(id: string): Promise<void> { this.shows.delete(id); }
}

export interface PickedMedia { readonly sourceUri: string; readonly displayName: string; readonly declaredBytes?: number; readonly mimeType?: string }
export interface ProbedMedia { readonly durationMs: number; readonly codec: string; readonly channels: number; readonly sampleRate: number }
/**
 * Adapter attestation returned only after the canonical file is durably inside
 * app-owned document storage. The transaction verifies every field before it
 * persists metadata; picker/cache/content-provider locations cannot satisfy it.
 */
export interface MediaCommitResult {
  readonly uri: string;
  readonly managedName: string;
  readonly ownership: 'app-owned';
  readonly bytes: number;
  readonly checksumSha256: string;
  readonly created: boolean;
}
export interface MediaImportPort {
  stage(sourceUri: string): Promise<{ readonly uri: string; readonly bytes: number }>;
  probe(uri: string): Promise<ProbedMedia>;
  sha256(uri: string): Promise<string>;
  commit(stagedUri: string, managedName: string): Promise<MediaCommitResult>;
  /** Production adapters validate/repair shared canonical media before deduplication. */
  reuseExisting?(asset: MediaAsset, stagedUri: string): Promise<MediaAsset>;
  remove(uri: string): Promise<void>;
}
const isPositiveSafeInteger = (value: number): boolean => Number.isSafeInteger(value) && value > 0;
function validateProbe(probe: ProbedMedia): void {
  if (!isPositiveSafeInteger(probe.durationMs)) throw new Error('Decoded duration is invalid');
  if (typeof probe.codec !== 'string' || probe.codec.trim().length === 0 || probe.codec.length > 64) throw new Error('Decoded codec is invalid');
  if (!Number.isSafeInteger(probe.channels) || probe.channels < 1 || probe.channels > 32) throw new Error('Decoded channel count is invalid');
  if (!Number.isSafeInteger(probe.sampleRate) || probe.sampleRate < 1 || probe.sampleRate > 384_000) throw new Error('Decoded sample rate is invalid');
}
export class MediaImportTransaction {
  constructor(private readonly files: MediaImportPort, private readonly assets: MediaAssetRepository, private readonly assertCurrent?: () => void) {}
  async import(picked: PickedMedia, signal?: AbortSignal): Promise<MediaAsset> {
    const asset = await this.prepare(picked, signal);
    if (signal?.aborted) throw new Error('Import cancelled.');
    this.assertCurrent?.();
    await this.assets.save(asset);
    return asset;
  }
  /** Returns a durable inspected asset for an enclosing show+media SQLite transaction. */
  async prepare(picked: PickedMedia, signal?: AbortSignal): Promise<MediaAsset> {
    const checkCancelled = () => { if (signal?.aborted) throw new Error('Import cancelled.'); this.assertCurrent?.(); };
    checkCancelled();
    if (!picked.sourceUri || !picked.displayName) throw new Error('Picked media is invalid');
    if (picked.declaredBytes !== undefined && !isPositiveSafeInteger(picked.declaredBytes)) throw new Error('Declared file size is invalid');
    const staged = await this.files.stage(picked.sourceUri);
    try {
      checkCancelled();
      if (!staged.uri || !isPositiveSafeInteger(staged.bytes)) throw new Error('Staged file is invalid');
      if (picked.declaredBytes !== undefined && picked.declaredBytes !== staged.bytes) throw new Error('Imported file size changed');
      const { metadata: probe, checksum: rawChecksum } = await inspectStagedFile(() => this.files.probe(staged.uri), () => this.files.sha256(staged.uri), checkCancelled);
      checkCancelled();
      validateProbe(probe);
      const checksum = rawChecksum.toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error('Invalid SHA-256 checksum');
      const existing = await this.assets.getByChecksum(checksum);
      if (existing) {
        const reused = this.files.reuseExisting ? await this.files.reuseExisting(existing, staged.uri) : existing;
        checkCancelled();
        return reused;
      }
      const extension = /\.([a-z0-9]{1,8})$/i.exec(picked.displayName)?.[1]?.toLowerCase() ?? 'audio';
      const managedName = `media/${checksum}.${extension}`;
      const committed = await this.files.commit(staged.uri, managedName);
      if (!committed || typeof committed !== 'object' || typeof committed.uri !== 'string' ||
          !committed.uri || committed.uri === staged.uri || committed.managedName !== managedName ||
          committed.ownership !== 'app-owned' || committed.bytes !== staged.bytes ||
          typeof committed.checksumSha256 !== 'string' || committed.checksumSha256.toLowerCase() !== checksum ||
          typeof committed.created !== 'boolean') {
        throw new Error('Managed media commit attestation is invalid');
      }
      const asset: MediaAsset = { id: `media-${checksum}`, checksumSha256: checksum, localUri: committed.uri,
        bytes: staged.bytes, durationMs: probe.durationMs, codec: probe.codec, channels: probe.channels, sampleRate: probe.sampleRate };
      checkCancelled();
      return asset;
    } finally {
      // Canonical checksum paths are never deleted here: another import may have
      // reused one before metadata persistence failed. Reference-aware GC owns
      // cleanup of newly created, unreferenced canonical files.
      await this.files.remove(staged.uri).catch(() => undefined);
    }
  }
}
