export type BackupStage = 'checking' | 'writing' | 'reading' | 'validating' | 'saving' | 'sharing' | 'complete';
export interface BackupProgress {
  readonly stage: BackupStage;
  readonly completedBytes: number;
  readonly totalBytes: number | null;
  readonly completedFiles: number;
  readonly totalFiles: number | null;
}
export interface BackupResult {
  readonly kind: 'export' | 'restore';
  readonly shows: number;
  readonly playlists: number;
  readonly songs: number;
  readonly files: number;
  readonly uri?: string;
}
export interface BackupOptions {
  /** Included collections merge content without replacing user preferences or selection. */
  readonly preservePreferences?: boolean;
  readonly signal?: AbortSignal;
  /** Observers are notification-only; use signal to request cancellation. */
  readonly onProgress?: (progress: BackupProgress) => void;
  readonly onResult?: (result: BackupResult) => void;
}
export interface BackupExportOptions extends BackupOptions {
  readonly share?: boolean;
  /** Called after the archive is complete, before opening a share sheet. */
  readonly onSaved?: (uri: string) => void;
}
export const RESTORE_COMMITTED_RELOAD_REQUIRED = 'RESTORE_COMMITTED_RELOAD_REQUIRED';
export function committedRestoreReloadError(cause: unknown): Error {
  return new Error(RESTORE_COMMITTED_RELOAD_REQUIRED + ': The backup was restored. Reopen the library to load its committed data.', { cause });
}
export function isCommittedRestoreReloadRequired(value: unknown): boolean {
  const message = typeof value === 'string' ? value : value instanceof Error ? value.message : '';
  return message === RESTORE_COMMITTED_RELOAD_REQUIRED || message.startsWith(RESTORE_COMMITTED_RELOAD_REQUIRED + ':');
}
export function checkBackupCancelled(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Backup cancelled.'); error.name = 'AbortError'; throw error;
}
