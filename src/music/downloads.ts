import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import NativeDownloads, { type DownloadJob, type DownloadSource, type DownloadTarget } from '../../modules/show-downloads';
import type { LibraryStore } from '../library';
import { isCriticalSessionActive } from '../runtime/critical-session-gate';
import { isMusicCategory, type MusicCategory } from './categories';

const CONNECTION_KEY = 'showcontrol.download-helper.connection';
const activeStages = new Set(['queued', 'resolving', 'downloading', 'extracting']);
const sourceSchema = z.object({ url: z.string().max(4096), title: z.string().min(1).max(200), uploader: z.string().max(200), durationSeconds: z.number().finite().min(0).max(7200).nullable() }).strict();
const sourceListSchema = z.object({ sources: z.array(sourceSchema).max(5) }).strict();
const retainedFailureCodes = new Set([
  'DOWNLOAD_URL', 'DOWNLOAD_INVALID', 'DOWNLOAD_BUSY', 'DOWNLOAD_HISTORY_FULL', 'DOWNLOAD_NOT_FOUND', 'DOWNLOAD_NOT_READY',
  'DOWNLOAD_CANCELLED', 'DOWNLOAD_INTERRUPTED', 'DOWNLOAD_RUNTIME_MISSING', 'DOWNLOAD_SIZE', 'DOWNLOAD_TIMEOUT', 'DOWNLOAD_STORAGE',
  'DOWNLOAD_SOURCE_FAILED', 'DOWNLOAD_TRANSFER_FAILED', 'DOWNLOAD_TARGET_MISSING',
  'DOWNLOAD_HELPER_URL', 'DOWNLOAD_HELPER_AUTH', 'DOWNLOAD_HELPER_MISSING', 'DOWNLOAD_HELPER_OFFLINE', 'DOWNLOAD_HELPER_FAILED',
]);
function retainedFailureCode(error: unknown): string {
  // Native wrappers may add context. Persist only a known code, never raw
  // helper response text, native exception details or connection credentials.
  const code = error instanceof Error ? error.message.match(/\bDOWNLOAD_[A-Z_]+\b/)?.[0] : undefined;
  return code && retainedFailureCodes.has(code) ? code : 'DOWNLOAD_HELPER_FAILED';
}
export interface HelperConnection { readonly url: string; readonly token: string }
function active(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Download cancelled', 'AbortError');
  if (isCriticalSessionActive()) throw new Error('library.armed');
}
export function checkedSourceUrl(value: string): string {
  let url: URL; try { url = new URL(value.trim()); } catch { throw new Error('DOWNLOAD_URL'); }
  const host = url.hostname.toLowerCase();
  if (value.length > 4096 || /[\u0000-\u001f]/.test(value) || url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' ||
      host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.includes(':') ||
      /^(?:127\.|10\.|192\.168\.|0\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)) throw new Error('DOWNLOAD_URL');
  return url.toString();
}
export function checkedHelperUrl(value: string): string {
  if (value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('DOWNLOAD_HELPER_URL');
  let url: URL; try { url = new URL(value.trim()); } catch { throw new Error('DOWNLOAD_HELPER_URL'); }
  const host = url.hostname.toLowerCase(); const numbers = host.split('.').map(Number);
  const privateIp = numbers.length === 4 && numbers.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (numbers[0] === 10 || numbers[0] === 127 || numbers[0] === 192 && numbers[1] === 168 || numbers[0] === 172 && numbers[1]! >= 16 && numbers[1]! <= 31);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      url.protocol === 'http:' && !privateIp && host !== 'localhost' && !host.endsWith('.local')) throw new Error('DOWNLOAD_HELPER_URL');
  return url.origin;
}
function checkedPairingToken(value: string): string {
  const clean = value.trim();
  if (!/^[A-Za-z0-9_-]{32,512}$/.test(clean)) throw new Error('DOWNLOAD_HELPER_AUTH');
  return clean;
}
export const HelperSettings = {
  async read(): Promise<HelperConnection | null> {
    const raw = await SecureStore.getItemAsync(CONNECTION_KEY); if (!raw) return null;
    let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new Error('DOWNLOAD_HELPER_AUTH'); }
    const value = z.object({ url: z.string(), token: z.string().min(32).max(512).regex(/^[A-Za-z0-9_-]+$/) }).strict().safeParse(parsed);
    if (!value.success) throw new Error('DOWNLOAD_HELPER_AUTH');
    return { url: checkedHelperUrl(value.data.url), token: value.data.token };
  },
  async save(url: string, token: string): Promise<void> {
    active(); const clean = checkedPairingToken(token);
    await SecureStore.setItemAsync(CONNECTION_KEY, JSON.stringify({ url: checkedHelperUrl(url), token: clean }), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
  async resolve(url: string, enteredToken: string): Promise<HelperConnection> {
    active(); const origin = checkedHelperUrl(url);
    if (enteredToken.trim()) return { url: origin, token: checkedPairingToken(enteredToken) };
    // Read at the action boundary. A form's earlier saved-state observation
    // cannot authorize sending another computer's stored pairing secret.
    const stored = await HelperSettings.read(); active();
    if (!stored || stored.url !== origin) throw new Error('DOWNLOAD_HELPER_AUTH');
    return stored;
  },
  async remove(): Promise<void> { active(); await SecureStore.deleteItemAsync(CONNECTION_KEY); },
};
async function readHelperJson(response: Awaited<ReturnType<typeof expoFetch>>, signal?: AbortSignal): Promise<unknown> {
  const limit = 32_000;
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new Error('DOWNLOAD_HELPER_FAILED');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('DOWNLOAD_HELPER_FAILED');
  const decoder = new TextDecoder(); let bytes = 0; let text = '';
  try {
    for (;;) {
      active(signal); const part = await reader.read(); active(signal);
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limit) throw new Error('DOWNLOAD_HELPER_FAILED');
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    try { return JSON.parse(text) as unknown; } catch { throw new Error('DOWNLOAD_HELPER_FAILED'); }
  } finally { reader.releaseLock(); }
}
async function helper(path: string, options: { method?: string; data?: unknown; signal?: AbortSignal; connection?: HelperConnection } = {}): Promise<unknown> {
  active(options.signal);
  const connection = options.connection ?? await HelperSettings.read(); if (!connection) throw new Error('DOWNLOAD_HELPER_MISSING');
  if (!/^\/(?:health|search|jobs(?:\/[a-f0-9-]{36}(?:\/cancel)?)?)$/.test(path)) throw new Error('DOWNLOAD_INVALID');
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), path === '/search' ? 100_000 : 20_000);
  const abort = () => controller.abort(); options.signal?.addEventListener('abort', abort);
  try {
    active(options.signal);
    const response = await expoFetch(connection.url + path, { method: options.method ?? 'GET', signal: controller.signal,
      headers: { Authorization: 'Bearer ' + connection.token, 'Content-Type': 'application/json' }, redirect: 'error',
      ...(options.data === undefined ? {} : { body: JSON.stringify(options.data) }) });
    active(options.signal);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('DOWNLOAD_HELPER_AUTH');
      const error = z.object({ errorCode: z.string().regex(/^DOWNLOAD_[A-Z_]+$/) }).safeParse(await readHelperJson(response, options.signal));
      throw new Error(error.success ? error.data.errorCode : 'DOWNLOAD_HELPER_FAILED');
    }
    return await readHelperJson(response, options.signal);
  } catch (error) {
    active(options.signal);
    if (error instanceof Error && error.message.startsWith('DOWNLOAD_')) throw error;
    throw new Error('DOWNLOAD_HELPER_OFFLINE');
  } finally { controller.abort(); clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
}
const pending = new Map<string, { promise: Promise<'attached' | 'retained'>; cancellation: AbortController }>();
function pause(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('Download cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 750);
    signal?.addEventListener('abort', abort); if (signal?.aborted) abort();
  });
}
export function hasDownloadTarget(library: LibraryStore, target: DownloadTarget): boolean {
  return !!library.getSnapshot().shows.find((show) => show.id === target.showId)?.sets.some((set) => set.id === target.setId);
}
function hasCommittedDownload(library: LibraryStore, job: DownloadJob): boolean {
  const tag = `download:${job.id}`;
  return library.getSnapshot().shows.some((show) => Object.values(show.cues).some((cue) => cue.type === 'audio' && cue.tags.includes(tag)));
}
export async function attachCompletedDownload(library: LibraryStore, job: DownloadJob, signal?: AbortSignal, override?: DownloadTarget): Promise<'attached' | 'retained'> {
  active(signal); const target = override ?? job;
  if (job.stage !== 'ready' || !job.uri || !/^file:\/\/\//.test(job.uri) || !Number.isSafeInteger(job.bytes) || job.bytes! <= 0 || job.bytes! > 500_000_000) throw new Error('DOWNLOAD_INVALID');
  if (!hasDownloadTarget(library, target)) return 'retained';
  const category = isMusicCategory(target.category) ? target.category : undefined;
  try {
    await library.importAudio(target.showId, target.setId, { sourceUri: job.uri, displayName: job.title + '.mp3', declaredBytes: job.bytes!, mimeType: 'audio/mpeg' }, signal,
      { downloadId: job.id, notes: 'Source: ' + checkedSourceUrl(job.url), ...(category ? { category, applyPreset: true } : {}) });
  } catch (error) { active(signal); if (!hasDownloadTarget(library, target)) return 'retained'; throw error; }
  // SQL has committed. A late cancel cannot turn a committed attachment into a reported failure.
  // Reconciliation retries housekeeping without downloading or adding the song again.
  await NativeDownloads.complete(job.id).catch(() => undefined);
  if (Platform.OS === 'ios') void helper('/jobs/' + job.id, { method: 'DELETE' }).catch(() => undefined);
  return 'attached';
}
async function waitForDownload(library: LibraryStore, id: string, signal?: AbortSignal, onProgress?: (job: DownloadJob) => void): Promise<'attached' | 'retained'> {
  for (;;) {
    active(signal);
    let job = (await NativeDownloads.getJobs()).find((item) => item.id === id);
    if (!job) throw new Error('DOWNLOAD_NOT_FOUND');
    if (Platform.OS === 'ios' && activeStages.has(job.stage) && !job.receiving) {
      const raw = await helper('/jobs/' + id, { ...(signal ? { signal } : {}) });
      const status = z.object({ stage: z.enum(['queued', 'resolving', 'downloading', 'extracting', 'ready', 'cancelled', 'error', 'interrupted']), percent: z.number().finite().min(0).max(100).nullable(), errorCode: z.string().optional() }).passthrough().parse(raw);
      active(signal);
      if (status.stage === 'ready') {
        const connection = await HelperSettings.read(); active(signal); if (!connection) throw new Error('DOWNLOAD_HELPER_MISSING');
        await NativeDownloads.receive(id, connection.url + '/jobs/' + id + '/audio', connection.token);
      } else await NativeDownloads.updateExternal(id, status.stage, status.percent, status.errorCode);
      job = (await NativeDownloads.getJobs()).find((item) => item.id === id)!;
    }
    onProgress?.(job);
    if (job.stage === 'attached') return 'attached';
    if (job.stage === 'ready') return attachCompletedDownload(library, job, signal);
    if (job.stage === 'cancelled') throw new DOMException('Download cancelled', 'AbortError');
    if (job.stage === 'error' || job.stage === 'interrupted') throw new Error(job.errorCode ?? 'DOWNLOAD_SOURCE_FAILED');
    await pause(signal);
  }
}
function follow(library: LibraryStore, id: string, signal?: AbortSignal, onProgress?: (job: DownloadJob) => void) {
  const existing = pending.get(id); if (existing) return existing.promise;
  const cancellation = new AbortController(); const abort = () => cancellation.abort();
  signal?.addEventListener('abort', abort); if (signal?.aborted) abort();
  const result = waitForDownload(library, id, cancellation.signal, onProgress).finally(() => { signal?.removeEventListener('abort', abort); pending.delete(id); });
  pending.set(id, { promise: result, cancellation }); return result;
}
export const MusicDownloads = {
  jobs: () => NativeDownloads.getJobs(),
  async testHelper(url: string, token: string, signal?: AbortSignal): Promise<void> {
    const response = z.object({ version: z.literal(1), ready: z.literal(true) }).strict().safeParse(await helper('/health', { connection: { url: checkedHelperUrl(url), token: checkedPairingToken(token) }, ...(signal ? { signal } : {}) }));
    if (!response.success) throw new Error('DOWNLOAD_HELPER_FAILED');
  },
  async search(query: string, signal?: AbortSignal): Promise<DownloadSource[]> {
    active(signal);
    const clean = query.trim(); if (clean.length < 2 || clean.length > 500 || /[\u0000-\u001f]/.test(clean) || clean.startsWith('-')) throw new Error('DOWNLOAD_INVALID');
    // Recognise pasted links even without //; unsupported schemes must not become searches.
    const input = clean.includes('://') || /^(?:https?|file|content|ftp|javascript|data|blob|ws|wss):/i.test(clean) ? checkedSourceUrl(clean) : clean;
    const id = randomUUID();
    const cancel = () => { NativeDownloads.cancel(id); if (Platform.OS === 'ios') void helper('/jobs/' + id + '/cancel', { method: 'DELETE' }).catch(() => undefined); };
    signal?.addEventListener('abort', cancel);
    try {
      active(signal);
      const sources = Platform.OS === 'android' ? await NativeDownloads.search(input, id) : sourceListSchema.parse(await helper('/search', { method: 'POST', data: { id, query: input }, ...(signal ? { signal } : {}) })).sources;
      active(signal);
      return z.array(sourceSchema).max(5).parse(sources).map((item) => ({ ...item, url: checkedSourceUrl(item.url) }));
    } catch (error) {
      // Native rejection can arrive after the operator's Cancel was accepted.
      active(signal); throw error;
    } finally { signal?.removeEventListener('abort', cancel); }
  },
  async download(library: LibraryStore, source: DownloadSource, target: { showId: string; setId: string; category: MusicCategory }, signal?: AbortSignal, onProgress?: (job: DownloadJob) => void): Promise<'attached' | 'retained'> {
    active(signal); if (!hasDownloadTarget(library, target)) throw new Error('DOWNLOAD_TARGET_MISSING');
    const checked = sourceSchema.parse(source);
    const job = { ...target, id: randomUUID(), url: checkedSourceUrl(checked.url), title: checked.title, createdAt: Date.now() };
    const cancel = () => { NativeDownloads.cancel(job.id); if (Platform.OS === 'ios') void helper('/jobs/' + job.id + '/cancel', { method: 'DELETE' }).catch(() => undefined); };
    signal?.addEventListener('abort', cancel);
    try {
      if (Platform.OS === 'android') await NativeDownloads.start(job);
      else {
        await NativeDownloads.registerExternal(job); active(signal);
        await helper('/jobs', { method: 'POST', data: { id: job.id, url: job.url, title: job.title }, ...(signal ? { signal } : {}) });
      }
      if (signal?.aborted) { cancel(); active(signal); }
      return await follow(library, job.id, signal, onProgress);
    } catch (error) {
      if (Platform.OS === 'ios' && !signal?.aborted) await NativeDownloads.updateExternal(job.id, 'error', null, retainedFailureCode(error)).catch(() => undefined);
      throw error;
    } finally { signal?.removeEventListener('abort', cancel); }
  },
  async recover(library: LibraryStore): Promise<void> {
    if (isCriticalSessionActive()) return;
    for (const job of await NativeDownloads.getJobs()) {
      if (job.stage === 'cancelled') {
        // Recovery may finish bookkeeping only when SQL already contains the
        // attachment. It must never import a deliberately cancelled download.
        if (/^file:\/\/\//.test(job.uri ?? '') && Number.isSafeInteger(job.bytes) && job.bytes! >= 128 && job.bytes! <= 500_000_000 && hasCommittedDownload(library, job)) {
          active(); await NativeDownloads.complete(job.id).catch(() => undefined);
        }
        continue;
      }
      if (activeStages.has(job.stage) || job.stage === 'ready' && hasDownloadTarget(library, job)) await follow(library, job.id);
    }
  },
  cancel: (job: DownloadJob) => { active(); pending.get(job.id)?.cancellation.abort(); NativeDownloads.cancel(job.id); if (Platform.OS === 'ios') void helper('/jobs/' + job.id + '/cancel', { method: 'DELETE' }).catch(() => undefined); },
  async remove(job: DownloadJob): Promise<void> { active(); await NativeDownloads.remove(job.id); if (Platform.OS === 'ios') void helper('/jobs/' + job.id, { method: 'DELETE' }).catch(() => undefined); },
  attach: attachCompletedDownload,
};
