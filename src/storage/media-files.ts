import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import ShowAudio from '../../modules/show-audio';
import type { MediaAsset } from '../domain';
import type { MediaCommitResult, MediaImportPort, PickedMedia, ProbedMedia } from './contracts';
import type { ZipReader, ZipWriter } from './zip';

let activeFileJobs = 0;
const activeStaging = new Set<string>();
const canonicalPromotions = new Map<string, Promise<unknown>>();
/** Separate stores/adapters may prepare together; only one may promote a given path. */
async function serializeCanonicalPromotion<T>(uri: string, work: () => Promise<T>): Promise<T> {
  const previous = canonicalPromotions.get(uri) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(work); canonicalPromotions.set(uri, pending);
  try { return await pending; }
  finally { if (canonicalPromotions.get(uri) === pending) canonicalPromotions.delete(uri); }
}
export function beginFileJob(): () => void {
  activeFileJobs += 1; let finished = false;
  return () => { if (!finished) { finished = true; activeFileJobs -= 1; } };
}
const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
/** Only old, source-owned temporary paths. Canonical media, recovery and ZIPs are never swept. */
export function cleanupAbandonedStaging(now = Date.now(), canClean: () => boolean = () => true): number {
  if (activeFileJobs || activeStaging.size || !canClean()) return 0;
  let removed = 0; const cutoff = now - 24 * 60 * 60 * 1000;
  const old = (entry: File | Directory) => { const modified = entry.info().modificationTime; return typeof modified === 'number' && Number.isFinite(modified) && modified > 0 && modified < cutoff; };
  for (const name of ['staging', 'backups']) {
    const directory = new Directory(libraryDirectory(), name);
    if (!directory.exists) continue;
    for (const entry of directory.list()) {
      if (activeFileJobs || activeStaging.size || !canClean()) return removed;
      const prefix = directory.uri.replace(/\/$/, '') + '/';
      if (!entry.uri.startsWith(prefix) || entry.uri.slice(prefix.length).includes('/') || !old(entry)) continue;
      const recognized = entry instanceof File
        ? new RegExp(`^${uuid}\\.${name === 'staging' ? 'stage' : 'partial'}$`).test(entry.name)
        : name === 'staging' && new RegExp(`^${uuid}$`).test(entry.name) && abandonedBackupTree(entry, old);
      if (!recognized) continue;
      try { entry.delete(); removed += 1; } catch { /* A later idle launch may retry inaccessible temporary content. */ }
    }
  }
  return removed;
}
function abandonedBackupTree(directory: Directory, old: (entry: File | Directory) => boolean): boolean {
  let count = 0;
  for (const entry of directory.list()) {
    if (++count > 503 || !old(entry)) return false;
    if (entry instanceof File) { if (entry.name !== 'archive.zip') return false; }
    else {
      if (!['media', 'visuals'].includes(entry.name)) return false;
      for (const payload of entry.list()) if (++count > 503 || !(payload instanceof File) || !/^[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(payload.name) || !old(payload)) return false;
    }
  }
  return true;
}

export const libraryDirectory = () => new Directory(Paths.document, 'show-control-library');
export function ensureLibraryDirectories(): void {
  for (const name of ['', 'media', 'visuals', 'staging', 'backups', 'recovery']) new Directory(libraryDirectory(), name).create({ intermediates: true, idempotent: true });
}
export function requireFreeSpace(bytes: number): void {
  const free = Paths.availableDiskSpace;
  if (!Number.isSafeInteger(bytes) || bytes < 0 || !Number.isFinite(free) || free < bytes + 32_000_000) throw new Error('Not enough free storage to complete this operation safely.');
}
export async function pickMedia(type: string | string[]): Promise<PickedMedia | null> {
  const result = await DocumentPicker.getDocumentAsync({ type, multiple: false, copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error('The picker did not return a file.');
  return { sourceUri: asset.uri, displayName: asset.name, ...(asset.size === undefined ? {} : { declaredBytes: asset.size }), ...(asset.mimeType === undefined ? {} : { mimeType: asset.mimeType }) };
}
export class ExpoMediaFiles implements MediaImportPort {
  constructor(private readonly commitGuard?: () => void) {}
  async stage(sourceUri: string): Promise<{ uri: string; bytes: number }> {
    if (!/^(file|content):\/\//.test(sourceUri)) throw new Error('Only local file selections can be imported.');
    if (/[\u0000-\u001f]/.test(sourceUri)) throw new Error('Invalid local file selection.');
    if (sourceUri.startsWith('file://')) {
      const authority = /^file:\/\/([^/]*)(?:\/|$)/.exec(sourceUri)?.[1] ?? '';
      if (authority && authority.toLowerCase() !== 'localhost') throw new Error('Only local file selections can be imported.');
    }
    ensureLibraryDirectories();
    const source = new File(sourceUri); const sourceBytes = source.size;
    if (sourceBytes !== null && sourceBytes > 0) requireFreeSpace(sourceBytes * 2);
    const target = new File(libraryDirectory(), 'staging', `${randomUUID()}.stage`);
    activeStaging.add(target.uri);
    try {
      // SDK 57 copies asynchronously; measure only after the destination is complete.
      await source.copy(target);
      const bytes = target.size;
      if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('Media is empty or its file size is invalid.');
      requireFreeSpace(bytes);
      return { uri: target.uri, bytes };
    } catch (error) {
      try { if (target.exists) target.delete(); } catch { /* Preserve the copy/storage failure; idle cleanup may retry the partial. */ }
      finally { activeStaging.delete(target.uri); }
      throw error;
    }
  }
  probe(uri: string): Promise<ProbedMedia> { return ShowAudio.probeMedia(uri); }
  sha256(uri: string): Promise<string> { return ShowAudio.sha256File(uri); }
  async reuseExisting(asset: MediaAsset, stagedUri: string): Promise<MediaAsset> {
    const prefix = libraryDirectory().uri.replace(/\/$/, '') + '/';
    const managedName = asset.localUri.startsWith(prefix) ? asset.localUri.slice(prefix.length) : '';
    if (!/^media\/[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(managedName) ||
        managedName.split('/')[1]?.split('.')[0] !== asset.checksumSha256) throw new Error('Shared media location is invalid.');
    const file = new File(asset.localUri);
    if (file.exists && file.size === asset.bytes && await this.sha256(file.uri) === asset.checksumSha256) return asset;
    // Promotion also repairs an interrupted or damaged canonical copy, retaining
    // the original in recovery and leaving picker files untouched.
    const repaired = await this.commit(stagedUri, managedName);
    if (repaired.uri !== asset.localUri || repaired.bytes !== asset.bytes || repaired.checksumSha256 !== asset.checksumSha256)
      throw new Error('Shared media repair failed integrity verification.');
    return asset;
  }
  async commit(stagedUri: string, managedName: string): Promise<MediaCommitResult> {
    if (!/^(media|visuals)\/[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(managedName)) throw new Error('Managed file name is invalid.');
    const source = new File(stagedUri); const bytes = source.size; const checksum = await this.sha256(stagedUri);
    if (managedName.split('/')[1]?.split('.')[0] !== checksum) throw new Error('Managed file checksum does not match its name.');
    const target = new File(libraryDirectory(), managedName);
    const verified = async () => target.exists && target.size === bytes && await this.sha256(target.uri) === checksum;
    if (await verified()) return { uri: target.uri, bytes, checksumSha256: checksum, managedName, created: false, ownership: 'app-owned' };
    this.commitGuard?.(); requireFreeSpace(bytes);
    const pendingUri = new File(libraryDirectory(), 'staging', `${randomUUID()}.stage`).uri;
    const pending = new File(pendingUri); activeStaging.add(pendingUri);
    try {
      // Never expose a partial checksum-named file. Copy and verify first, then
      // rename on the same volume. A failed copy is safe to retry immediately.
      await source.copy(pending);
      if (pending.size !== bytes || await this.sha256(pendingUri) !== checksum) throw new Error('The managed copy failed integrity verification.');
      return await serializeCanonicalPromotion<MediaCommitResult>(target.uri, async () => {
        this.commitGuard?.();
        // Recheck inside a per-path lease. Two completed copies must never both
        // move the same target or claim creation when one merely reuses it.
        const canonical = new File(libraryDirectory(), managedName);
        if (canonical.exists && canonical.size === bytes && await this.sha256(canonical.uri) === checksum)
          return { uri: canonical.uri, bytes, checksumSha256: checksum, managedName, created: false, ownership: 'app-owned' };
        this.commitGuard?.(); const created = !canonical.exists;
        let damagedUri: string | undefined;
        if (canonical.exists) {
          damagedUri = new File(libraryDirectory(), 'recovery', `${randomUUID()}.damaged-${managedName.startsWith('media/') ? 'media' : 'visual'}`).uri;
          await canonical.move(new File(damagedUri));
        }
        try {
          this.commitGuard?.();
          // File.move changes its object's URI. Retain separate canonical and
          // staging identities so cleanup can never delete the promoted asset.
          await pending.move(new File(libraryDirectory(), managedName));
        } catch (error) {
          const original = new File(libraryDirectory(), managedName);
          if (damagedUri && !original.exists) await new File(damagedUri).move(original).catch(() => undefined);
          throw error;
        }
        const promoted = new File(libraryDirectory(), managedName);
        if (promoted.size !== bytes || await this.sha256(promoted.uri) !== checksum) throw new Error('The managed copy failed integrity verification.');
        return { uri: promoted.uri, bytes, checksumSha256: checksum, managedName, created, ownership: 'app-owned' };
      });
    } finally {
      try { const temporary = new File(pendingUri); if (temporary.exists) temporary.delete(); }
      catch { /* A redundant temporary file must not fail completed promotion or mask its error. */ }
      finally { activeStaging.delete(pendingUri); }
    }
  }
  async remove(uri: string): Promise<void> {
    // Import cleanup cannot remove canonical assets or arbitrary caller paths.
    const stagingPrefix = new Directory(libraryDirectory(), 'staging').uri.replace(/\/$/, '') + '/';
    if (!uri.startsWith(stagingPrefix) || !new RegExp(`^${uuid}\\.stage$`).test(uri.slice(stagingPrefix.length))) throw new Error('Only staged files may be removed by import cleanup.');
    try { const file = new File(uri); if (file.exists) file.delete(); } finally { activeStaging.delete(uri); }
  }
}
export function fileReader(file: File): ZipReader {
  const size = file.size;
  return { size, read: async (offset, length) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > size) throw new Error('File read is out of bounds.');
    const handle = file.open(); try { handle.offset = offset; return handle.readBytes(length); } finally { handle.close(); }
  } };
}
export function fileWriter(file: File): { sink: ZipWriter; close: () => void } {
  file.create({ overwrite: false, intermediates: true });
  const handle = (() => { try { return file.open(); } catch (error) { try { if (file.exists) file.delete(); } catch { /* Preserve the opening error. */ } throw error; } })();
  return { sink: { write: async (bytes) => { handle.writeBytes(bytes); } }, close: () => handle.close() };
}
