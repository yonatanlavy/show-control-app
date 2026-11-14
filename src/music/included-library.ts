import { randomUUID } from 'expo-crypto';
import { z } from 'zod';
import NativeDownloads from '../../modules/show-downloads';
import type { LibraryStore, LibrarySnapshot } from '../library/types';
import { isCriticalSessionActive } from '../runtime/critical-session-gate';
import { checkBackupCancelled, type BackupOptions } from '../storage/backup-progress';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const description = z.object({ version: z.string().min(1).max(100), songs: z.number().int().min(1).max(1000), playlists: z.number().int().min(1).max(1000), bytes: z.number().int().min(22).max(4_000_000_000), sha256: hash, hashes: z.array(hash).min(1).max(1000) }).strict().refine((value) => value.hashes.length === value.songs && new Set(value.hashes).size === value.songs);
export type IncludedMusicInfo = z.infer<typeof description>;
export function includedMusicInstalled(snapshot: Pick<LibrarySnapshot, 'shows'>, info: IncludedMusicInfo): boolean {
  const hashes = new Set(snapshot.shows.flatMap((show) => Object.values(show.media).map((media) => media.checksumSha256)));
  return info.hashes.every((value) => hashes.has(value));
}
export const IncludedLibrary = {
  async info(): Promise<IncludedMusicInfo | null> {
    const value = await NativeDownloads.includedLibraryInfo?.();
    return value == null ? null : description.parse(value);
  },
  async install(library: LibraryStore, info: IncludedMusicInfo, options: BackupOptions = {}): Promise<number | null> {
    checkBackupCancelled(options.signal);
    if (isCriticalSessionActive()) throw new Error('library.armed');
    if (includedMusicInstalled(library.getSnapshot(), info)) return 0;
    const id = randomUUID();
    const cancel = () => NativeDownloads.cancelIncludedLibrary(id);
    const subscription = NativeDownloads.onIncludedLibraryProgress((value) => {
      if (value.id !== id || !Number.isSafeInteger(value.completedBytes) || value.completedBytes < 0 || value.completedBytes > info.bytes || value.totalBytes !== info.bytes || options.signal?.aborted) return;
      try { options.onProgress?.({ stage: 'reading', completedBytes: value.completedBytes, totalBytes: info.bytes, completedFiles: 0, totalFiles: null }); } catch { /* Observers cannot fail a file copy. */ }
    });
    options.signal?.addEventListener('abort', cancel);
    try {
      checkBackupCancelled(options.signal);
      let uri: string;
      try { uri = await NativeDownloads.prepareIncludedLibrary(id); }
      catch (error) { checkBackupCancelled(options.signal); throw error; }
      checkBackupCancelled(options.signal);
      if (isCriticalSessionActive()) throw new Error('library.armed');
      // Normal staged CRC/SHA/native-probe/transaction path, retaining the
      // user's preferences and selection. A late Cancel cannot undo a commit.
      return await library.importBackup({ sourceUri: uri, displayName: 'Included music.zip', declaredBytes: info.bytes }, { ...options, preservePreferences: true });
    } finally {
      options.signal?.removeEventListener('abort', cancel); subscription.remove();
      await NativeDownloads.releaseIncludedLibrary(id).catch(() => undefined);
    }
  },
};
