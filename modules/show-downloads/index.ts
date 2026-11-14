import { requireOptionalNativeModule } from 'expo';
export interface DownloadSource { readonly url: string; readonly title: string; readonly uploader: string; readonly durationSeconds: number | null }
export interface DownloadTarget { readonly showId: string; readonly setId: string; readonly category: string }
export interface DownloadJob extends DownloadTarget {
  readonly id: string; readonly url: string; readonly title: string; readonly createdAt: number;
  readonly stage: 'queued' | 'resolving' | 'downloading' | 'extracting' | 'ready' | 'attached' | 'cancelled' | 'error' | 'interrupted';
  readonly percent: number | null; readonly uri?: string; readonly bytes?: number; readonly errorCode?: string;
  readonly receiving?: boolean;
}
interface NativeDownloads {
  includedLibraryInfo?(): Promise<unknown>;
  prepareIncludedLibrary?(id: string): Promise<string>;
  cancelIncludedLibrary?(id: string): void;
  releaseIncludedLibrary?(id: string): Promise<void>;
  addListener?(event: string, listener: (value: { id: string; completedBytes: number; totalBytes: number }) => void): { remove(): void };
  search(query: string, id: string): Promise<DownloadSource[]>;
  start(json: string): Promise<DownloadJob>;
  getJobs(): Promise<DownloadJob[]>;
  cancel(id: string): void;
  complete(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  registerExternal(json: string): Promise<DownloadJob>;
  updateExternal(json: string): Promise<void>;
  receive(id: string, url: string, token: string): Promise<void>;
}
let native: NativeDownloads | null = null;
try { native = requireOptionalNativeModule<NativeDownloads>('ShowDownloads'); } catch { /* Requires a development build. */ }
function required() { if (!native) throw new Error('DOWNLOAD_RUNTIME_MISSING'); return native; }
export default {
  includedLibraryInfo: () => native?.includedLibraryInfo?.() ?? Promise.resolve(null),
  prepareIncludedLibrary: (id: string) => { const value = required(); if (!value.prepareIncludedLibrary) throw new Error('Included music archive is unavailable'); return value.prepareIncludedLibrary(id); },
  cancelIncludedLibrary: (id: string) => native?.cancelIncludedLibrary?.(id),
  releaseIncludedLibrary: (id: string) => native?.releaseIncludedLibrary?.(id) ?? Promise.resolve(),
  onIncludedLibraryProgress: (listener: (value: { id: string; completedBytes: number; totalBytes: number }) => void) => native?.addListener?.('onIncludedLibraryProgress', listener) ?? { remove: () => undefined },
  available: () => !!native,
  search: (query: string, id: string) => required().search(query, id),
  start: (job: Omit<DownloadJob, 'stage' | 'percent'>) => required().start(JSON.stringify(job)),
  getJobs: () => native?.getJobs() ?? Promise.resolve([]),
  cancel: (id: string) => native?.cancel(id),
  complete: (id: string) => required().complete(id),
  remove: (id: string) => required().remove(id),
  registerExternal: (job: Omit<DownloadJob, 'stage' | 'percent'>) => required().registerExternal(JSON.stringify(job)),
  updateExternal: (id: string, stage: DownloadJob['stage'], percent: number | null, errorCode?: string) => required().updateExternal(JSON.stringify({ id, stage, percent, ...(errorCode ? { errorCode } : {}) })),
  receive: (id: string, url: string, token: string) => required().receive(id, url, token),
};
