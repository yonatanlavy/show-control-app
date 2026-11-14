import { randomUUID } from 'expo-crypto';
import { Directory, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { strFromU8, strToU8 } from 'fflate';
import ShowAudio from '../../modules/show-audio';
import ShowVisual from '../../modules/show-visual';
import type { ControllerProfile, MediaAsset, Show, VisualAsset } from '../domain';
import { duplicateShowDocument } from '../library/operations';
import type { LibrarySnapshot } from '../library/types';
import type { PickedMedia } from './contracts';
import { libraryPayloadUris, makeLibraryManifest, materializeLibraryShow, unboundControllerProfiles, validateLibraryManifest } from './library-bundle';
import { beginFileJob, ensureLibraryDirectories, ExpoMediaFiles, fileReader, fileWriter, libraryDirectory, pickMedia, requireFreeSpace } from './media-files';
import { replaceLibrary } from './sqlite';
import { extractStoredEntry, inspectStoredZip, writeStoredZip, ZIP_LIMITS, type ZipFileSource } from './zip';
import { checkBackupCancelled, type BackupExportOptions, type BackupOptions, type BackupResult, type BackupStage } from './backup-progress';

function progress(options: BackupOptions, stage: BackupStage, completedBytes = 0, totalBytes: number | null = null, completedFiles = 0, totalFiles: number | null = null) {
  observe(() => options.onProgress?.({ stage, completedBytes, totalBytes, completedFiles, totalFiles }));
}
function observe(callback: () => void): void { try { callback(); } catch { /* A UI observer cannot turn a committed operation into a failure. */ } }
function result(kind: BackupResult['kind'], shows: readonly Show[], files: number, uri?: string): BackupResult {
  return { kind, shows: shows.length, playlists: shows.reduce((count, show) => count + show.sets.length, 0), songs: shows.reduce((count, show) => count + Object.values(show.cues).filter((cue) => cue.type === 'audio').length, 0), files, ...(uri ? { uri } : {}) };
}
/** Deliberate local sharing; never regenerates a completed archive. */
export async function shareLibraryBackup(uri: string, options: BackupOptions = {}): Promise<void> {
  checkBackupCancelled(options.signal);
  const prefix = new Directory(libraryDirectory(), 'backups').uri.replace(/\/$/, '') + '/';
  if (!uri.startsWith(prefix) || !/^Show-Control-\d{4}-\d{2}-\d{2}-[a-f0-9-]{36}\.zip$/.test(uri.slice(prefix.length))) throw new Error('Backup must be a complete app-owned archive.');
  const file = new File(uri); if (!file.exists || file.size < 22) throw new Error('BACKUP_FILE_MISSING: Saved backup is missing. Create a new backup.');
  progress(options, 'sharing');
  if (!await Sharing.isAvailableAsync()) throw new Error('Backup was saved, but file sharing is unavailable on this device.');
  checkBackupCancelled(options.signal);
  await Sharing.shareAsync(uri, { mimeType: 'application/zip', UTI: 'public.zip-archive' });
}

export async function exportLibraryBackup(snapshot: LibrarySnapshot, options: BackupExportOptions = {}): Promise<string> {
  checkBackupCancelled(options.signal); progress(options, 'checking');
  const finishJob = beginFileJob();
  try { return await buildLibraryBackup(snapshot, options); } finally { finishJob(); }
}
async function buildLibraryBackup(snapshot: LibrarySnapshot, options: BackupExportOptions): Promise<string> {
  ensureLibraryDirectories();
  const manifest = makeLibraryManifest(snapshot.shows, snapshot.controllerProfiles, snapshot.settings, snapshot.selectedShowId, snapshot.selectedSetId, randomUUID());
  const text = strToU8(JSON.stringify(manifest));
  if (text.length > ZIP_LIMITS.maxManifestBytes) throw new Error('Backup metadata exceeds the safety limit.');
  const assets = libraryPayloadUris(snapshot.shows, manifest);
  requireFreeSpace(text.length + manifest.files.reduce((sum, value) => sum + value.bytes, 0) + 2_000_000);
  const sources: ZipFileSource[] = [{ path: 'manifest.json', bytes: text.length, read: async (offset, length) => text.slice(offset, offset + length) }];
  let checkedBytes = 0; let checkedFiles = 0; const payloadBytes = manifest.files.reduce((sum, entry) => sum + entry.bytes, 0);
  for (const entry of manifest.files) {
    checkBackupCancelled(options.signal);
    const uri = assets.get(entry.path); if (!uri || !uri.startsWith(libraryDirectory().uri.replace(/\/$/, '') + '/')) throw new Error('Backup requires complete app-owned media.');
    const file = new File(uri);
    if (!file.exists || file.size !== entry.bytes || await ShowAudio.sha256File(uri) !== entry.sha256) throw new Error('Media changed or is missing; backup was not created.');
    checkBackupCancelled(options.signal); checkedBytes += entry.bytes; checkedFiles += 1; progress(options, 'checking', checkedBytes, payloadBytes, checkedFiles, manifest.files.length);
    sources.push({ path: entry.path, bytes: entry.bytes, read: fileReader(file).read });
  }
  // Validate the same domain contract used by restore before writing an archive.
  validateLibraryManifest(manifest, sources.map((source) => ({ path: source.path, bytes: source.bytes, crc32: 0, dataOffset: 0 })));
  const pending = new File(libraryDirectory(), 'backups', `${manifest.exportId}.partial`);
  const output = fileWriter(pending);
  let archiveSaved = false;
  try {
    progress(options, 'writing', 0, payloadBytes + text.length, 0, sources.length);
    await writeStoredZip(sources, output.sink, { ...(options.signal ? { signal: options.signal } : {}), onProgress: (bytes, files) => progress(options, 'writing', bytes, payloadBytes + text.length, files, sources.length) }); output.close();
    checkBackupCancelled(options.signal); progress(options, 'saving');
    const finished = new File(libraryDirectory(), 'backups', `Show-Control-${manifest.createdAt.slice(0, 10)}-${manifest.exportId}.zip`);
    await pending.move(finished); archiveSaved = true;
    const completed = result('export', snapshot.shows, manifest.files.length, finished.uri);
    observe(() => options.onSaved?.(finished.uri)); observe(() => options.onResult?.(completed));
    if (options.share !== false) {
      await shareLibraryBackup(finished.uri, options);
    }
    progress(options, 'complete', payloadBytes + text.length, payloadBytes + text.length, sources.length, sources.length);
    return finished.uri;
  } catch (error) {
    try { output.close(); } catch { /* Already closed after a completed archive. */ }
    try { if (!archiveSaved && pending.exists) pending.delete(); } catch { /* Keep the original failure; idle cleanup can retry abandoned partials. */ }
    throw error;
  }
}
export async function importLibraryBackup(db: SQLiteDatabase, picked?: PickedMedia, commitGuard?: () => void, options: BackupOptions = {}): Promise<number | null> {
  checkBackupCancelled(options.signal); progress(options, 'reading');
  const selected = picked ?? await pickMedia(['application/zip', 'application/octet-stream', '*/*']);
  if (!selected) return null;
  checkBackupCancelled(options.signal);
  if (!/^(file|content):\/\//.test(selected.sourceUri)) throw new Error('Backup must be a local file.');
  ensureLibraryDirectories();
  const staging = new Directory(libraryDirectory(), 'staging', randomUUID()); staging.create({ intermediates: true });
  const finishJob = beginFileJob();
  try {
    const source = new File(selected.sourceUri);
    if (!source.exists || source.size < 22 || source.size > ZIP_LIMITS.maxTotalBytes + 2_000_000) throw new Error('Backup file size is invalid.');
    requireFreeSpace(source.size);
    const archive = new File(staging, 'archive.zip'); await source.copy(archive); checkBackupCancelled(options.signal);
    const reader = fileReader(archive); const entries = await inspectStoredZip(reader, options.signal);
    requireFreeSpace(entries.reduce((sum, entry) => sum + entry.bytes, 0) * 2);
    const manifestEntry = entries.find((entry) => entry.path === 'manifest.json')!;
    const chunks: Uint8Array[] = []; await extractStoredEntry(reader, manifestEntry, { write: async (bytes) => { chunks.push(bytes); } }, options.signal ? { signal: options.signal } : {});
    const manifestBytes = new Uint8Array(manifestEntry.bytes); let offset = 0; for (const chunk of chunks) { manifestBytes.set(chunk, offset); offset += chunk.length; }
    const manifest = validateLibraryManifest(JSON.parse(strFromU8(manifestBytes)) as unknown, entries);
    const files = new ExpoMediaFiles(() => { checkBackupCancelled(options.signal); commitGuard?.(); }); const committed = new Map<string, string>();
    const measuredAudio = new Map<string, Partial<MediaAsset>>();
    const measuredVisual = new Map<string, Partial<VisualAsset>>();
    // Complete structural/checksum/native-decode validation before any database mutation.
    let extractedBytes = 0; let extractedFiles = 0; const payloads = entries.filter((entry) => entry.path !== 'manifest.json'); const totalBytes = payloads.reduce((sum, entry) => sum + entry.bytes, 0);
    progress(options, 'validating', 0, totalBytes, 0, payloads.length);
    for (const entry of payloads) {
      checkBackupCancelled(options.signal);
      const declaration = manifest.files.find((value) => value.path === entry.path)!;
      const staged = new File(staging, entry.path); const writer = fileWriter(staged);
      try { await extractStoredEntry(reader, entry, writer.sink, { ...(options.signal ? { signal: options.signal } : {}), onProgress: (bytes) => progress(options, 'validating', extractedBytes + bytes, totalBytes, extractedFiles, payloads.length) }); } finally { writer.close(); }
      checkBackupCancelled(options.signal);
      if (await ShowAudio.sha256File(staged.uri) !== declaration.sha256) throw new Error('Backup SHA-256 checksum mismatch.');
      if (entry.path.startsWith('media/')) measuredAudio.set(entry.path, await ShowAudio.probeMedia(staged.uri));
      else measuredVisual.set(entry.path, await ShowVisual.probeVisual(staged.uri));
      checkBackupCancelled(options.signal); extractedBytes += entry.bytes; extractedFiles += 1; progress(options, 'validating', extractedBytes, totalBytes, extractedFiles, payloads.length);
    }
    // Canonical files are immutable; failure here can only leave an unreferenced asset, never half a show.
    for (const declaration of manifest.files) {
      checkBackupCancelled(options.signal);
      const result = await files.commit(new File(staging, declaration.path).uri, declaration.path); committed.set(declaration.path, result.uri);
    }
    const ids = new Map(manifest.controllerProfiles.map((profile) => [profile.id, randomUUID()]));
    const profiles: ControllerProfile[] = unboundControllerProfiles(manifest.controllerProfiles).map((profile) => ({ ...profile, id: ids.get(profile.id)! }));
    const shows: Show[] = manifest.shows.map((value) => {
      const restored = materializeLibraryShow(value, (path) => committed.get(path)!);
      const inspected: Show = { ...restored,
        media: Object.fromEntries(Object.entries(restored.media).map(([key, asset]) => [key, { ...asset, ...measuredAudio.get(value.media[key]!.bundlePath) }])),
        visualAssets: Object.fromEntries(Object.entries(restored.visualAssets ?? {}).map(([key, asset]) => [key, { ...asset, ...measuredVisual.get(value.visualAssets[key]!.bundlePath) }])),
      };
      const duplicate = duplicateShowDocument(inspected, inspected.name, randomUUID, () => new Date().toISOString());
      return { ...duplicate, ...(restored.controllerProfileId ? { controllerProfileId: ids.get(restored.controllerProfileId)! } : {}) };
    });
    const checked = makeLibraryManifest(shows, profiles, manifest.settings, null, null, randomUUID());
    validateLibraryManifest(checked, [{ path: 'manifest.json', bytes: 1, crc32: 0, dataOffset: 0 }, ...checked.files.map((file) => ({ path: file.path, bytes: file.bytes, crc32: 0, dataOffset: 0 }))]);
    const selectedIndex = Math.max(0, manifest.shows.findIndex((show) => show.id === manifest.selectedShowId));
    const selectedShow = shows[selectedIndex]; const originalShow = manifest.shows[selectedIndex];
    const setIndex = Math.max(0, originalShow?.sets.findIndex((set) => set.id === manifest.selectedSetId) ?? 0);
    checkBackupCancelled(options.signal); progress(options, 'saving');
    await replaceLibrary(db, shows, profiles, { ...manifest.settings, externalDisplayEnabled: false }, () => { checkBackupCancelled(options.signal); commitGuard?.(); }, options.preservePreferences ? undefined : selectedShow ? { showId: selectedShow.id, setId: selectedShow.sets[setIndex]?.id ?? selectedShow.sets[0]?.id ?? null } : undefined, options.preservePreferences === true);
    observe(() => options.onResult?.(result('restore', shows, manifest.files.length))); progress(options, 'complete', totalBytes, totalBytes, payloads.length, payloads.length);
    return shows.length;
  } finally {
    try { if (staging.exists) staging.delete(); } catch { /* A cleanup failure cannot report an already committed restore as failed. */ }
    finally { finishJob(); }
  }
}
