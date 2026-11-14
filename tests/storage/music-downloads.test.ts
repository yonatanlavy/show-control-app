import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import NativeDownloads, { type DownloadJob, type DownloadSource } from '../../modules/show-downloads';
import { sampleShow } from '../../src/domain';
import type { LibraryStore } from '../../src/library/types';
import { attachCompletedDownload, checkedHelperUrl, checkedSourceUrl, HelperSettings, MusicDownloads } from '../../src/music/downloads';
import { setCriticalSessionActive } from '../../src/runtime/critical-session-gate';

const jobId = '4a3a31aa-ea0c-4099-a812-54d6c760779f';
jest.mock('expo-crypto', () => ({ randomUUID: () => '4a3a31aa-ea0c-4099-a812-54d6c760779f' }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' }));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../../modules/show-downloads', () => ({ __esModule: true, default: { getJobs: jest.fn(), start: jest.fn(), complete: jest.fn(), remove: jest.fn(), cancel: jest.fn(), search: jest.fn(), registerExternal: jest.fn(), updateExternal: jest.fn(), receive: jest.fn() } }));
const native = jest.mocked(NativeDownloads);
const source = { url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cipher2.mp3', title: 'Cipher', uploader: 'Kevin MacLeod', durationSeconds: 231 };
const target = { showId: sampleShow.id, setId: sampleShow.sets[0]!.id, category: 'mindReading' as const };
const job = (): DownloadJob => ({ ...target, ...source, id: jobId, createdAt: 1, stage: 'ready', percent: 100, uri: 'file:///owned/downloads/audio.mp3', bytes: 1000 });
const imported = jest.fn();
let shows = [sampleShow];
const library = { getSnapshot: () => ({ shows }), importAudio: imported } as unknown as LibraryStore;
beforeEach(() => { jest.clearAllMocks(); Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true }); setCriticalSessionActive(false); shows = [sampleShow]; imported.mockResolvedValue(sampleShow); native.getJobs.mockResolvedValue([job()]); native.complete.mockResolvedValue(); native.start.mockResolvedValue(job()); });
afterEach(() => setCriticalSessionActive(false));

describe('helper pairing and health boundaries', () => {
  const token = 'synthetic_pairing_code_12345678901234567890';
  const connection = { url: 'http://show-control.local', token };
  const secure = jest.mocked(SecureStore);
  const fetch = jest.mocked(expoFetch);
  function response(parts: Uint8Array[], options: { ok?: boolean; status?: number; length?: string } = {}) {
    const remaining = [...parts]; const release = jest.fn(); const read = jest.fn(async () => remaining.length ? { done: false, value: remaining.shift()! } : { done: true, value: undefined });
    return { value: { ok: options.ok ?? true, status: options.status ?? 200, headers: { get: () => options.length ?? null }, body: { getReader: () => ({ read, releaseLock: release }) } } as never, read, release };
  }
  beforeEach(() => {
    secure.getItemAsync.mockReset().mockResolvedValue(JSON.stringify(connection));
    secure.setItemAsync.mockReset().mockResolvedValue(undefined);
    secure.deleteItemAsync.mockReset().mockResolvedValue(undefined);
    fetch.mockReset().mockResolvedValue(response([new TextEncoder().encode(JSON.stringify({ version: 1, ready: true }))]).value);
  });
  it('reuses the saved secret only for the same canonical origin', async () => {
    await expect(HelperSettings.resolve(' HTTP://SHOW-CONTROL.LOCAL:80/ ', '')).resolves.toEqual(connection);
    expect(secure.setItemAsync).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['http://another.local', 'https://show-control.local', 'http://show-control.local:8765'])('does not reuse a saved secret after changing the origin to %s', async (url) => {
    await expect(HelperSettings.resolve(url, '')).rejects.toThrow('DOWNLOAD_HELPER_AUTH');
    expect(fetch).not.toHaveBeenCalled();
    expect(secure.setItemAsync).not.toHaveBeenCalled();
  });
  it('requires the current stored origin rather than a form’s stale saved observation', async () => {
    await HelperSettings.read();
    secure.getItemAsync.mockResolvedValueOnce(JSON.stringify({ ...connection, url: 'http://replacement.local' }));
    await expect(HelperSettings.resolve(connection.url, '')).rejects.toThrow('DOWNLOAD_HELPER_AUTH');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('allows an explicitly entered code for a new helper without reading the previous secret', async () => {
    await expect(HelperSettings.resolve('http://new-helper.local:8765/', '  ' + token + '  ')).resolves.toEqual({ url: 'http://new-helper.local:8765', token });
    expect(secure.getItemAsync).not.toHaveBeenCalled();
    expect(secure.setItemAsync).not.toHaveBeenCalled();
  });
  it.each(['{bad', JSON.stringify({ url: connection.url, token: 'short' }), JSON.stringify({ ...connection, extra: true })])('reports unreadable pairing data without replacing or deleting it', async (raw) => {
    secure.getItemAsync.mockResolvedValueOnce(raw);
    await expect(HelperSettings.read()).rejects.toThrow('DOWNLOAD_HELPER_AUTH');
    expect(secure.deleteItemAsync).not.toHaveBeenCalled();
    expect(secure.setItemAsync).not.toHaveBeenCalled();
  });
  it('keeps secure-store failures recoverable and supports deliberate removal', async () => {
    const error = new Error('Keychain locked');
    secure.getItemAsync.mockRejectedValueOnce(error);
    await expect(HelperSettings.read()).rejects.toBe(error);
    await HelperSettings.remove();
    expect(secure.deleteItemAsync).toHaveBeenCalledWith('showcontrol.download-helper.connection');
  });
  it('refuses reuse if a show arms while the keychain read is pending', async () => {
    secure.getItemAsync.mockImplementationOnce(async () => { setCriticalSessionActive(true); return JSON.stringify(connection); });
    await expect(HelperSettings.resolve(connection.url, '')).rejects.toThrow('library.armed');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['', 'short', 'x'.repeat(513), 'x'.repeat(32) + '\nother', 'x'.repeat(32) + ':secret'])('rejects malformed pairing codes before any network request', async (code) => {
    await expect(MusicDownloads.testHelper(connection.url, code)).rejects.toThrow('DOWNLOAD_HELPER_AUTH');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['http://helper.local/\n', 'http://helper.local/\u007f', 'http://helper.local/' + 'x'.repeat(4096)])('rejects control characters and oversized helper addresses', (url) => {
    expect(() => checkedHelperUrl(url)).toThrow('DOWNLOAD_HELPER_URL');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('saves only the canonical address and validated trimmed code in device-only storage', async () => {
    await HelperSettings.save('HTTP://SHOW-CONTROL.LOCAL:80/', ' ' + token + ' ');
    expect(secure.setItemAsync).toHaveBeenCalledWith('showcontrol.download-helper.connection', JSON.stringify(connection), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  });
  it('tests the explicit connection without persisting it or following a redirect', async () => {
    await MusicDownloads.testHelper(connection.url, token);
    expect(fetch).toHaveBeenCalledWith(connection.url + '/health', expect.objectContaining({ redirect: 'error', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } }));
    expect(secure.setItemAsync).not.toHaveBeenCalled();
  });
  it('refuses a health test cancelled before it starts', async () => {
    const cancellation = new AbortController(); cancellation.abort();
    await expect(MusicDownloads.testHelper(connection.url, token, cancellation.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('propagates cancellation to an in-flight health request without reporting a connection failure', async () => {
    const cancellation = new AbortController();
    fetch.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
    }));
    const pending = MusicDownloads.testHelper(connection.url, token, cancellation.signal);
    cancellation.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(secure.setItemAsync).not.toHaveBeenCalled();
  });
  it('rejects an oversized declared response before consuming its body', async () => {
    const oversized = response([], { length: '32001' }); fetch.mockResolvedValueOnce(oversized.value);
    await expect(MusicDownloads.testHelper(connection.url, token)).rejects.toThrow('DOWNLOAD_HELPER_FAILED');
    expect(oversized.read).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  });
  it.each([true, false])('bounds actual streamed bytes on both success and error responses: ok=%s', async (ok) => {
    const oversized = response([new Uint8Array(16_000), new Uint8Array(16_001), new Uint8Array(100)], { ok, status: ok ? 200 : 500 });
    fetch.mockResolvedValueOnce(oversized.value);
    await expect(MusicDownloads.testHelper(connection.url, token)).rejects.toThrow('DOWNLOAD_HELPER_FAILED');
    expect(oversized.read).toHaveBeenCalledTimes(2);
    expect(oversized.release).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  });
  it('accepts a valid response at the byte limit across arbitrary chunk boundaries', async () => {
    const payload = '{"version":1,"ready":true}';
    const bytes = new TextEncoder().encode(' '.repeat(32_000 - payload.length) + payload);
    expect(bytes.byteLength).toBe(32_000);
    const bounded = response([bytes.slice(0, 5), bytes.slice(5, 31_983), bytes.slice(31_983)]);
    fetch.mockResolvedValueOnce(bounded.value);
    await MusicDownloads.testHelper(connection.url, token);
    expect(bounded.release).toHaveBeenCalledTimes(1);
  });
  it('reads bounded error codes and rejects malformed helper JSON without exposing its contents', async () => {
    fetch.mockResolvedValueOnce(response([new TextEncoder().encode('{"errorCode":"DOWNLOAD_STORAGE"}')], { ok: false, status: 500 }).value);
    await expect(MusicDownloads.testHelper(connection.url, token)).rejects.toThrow('DOWNLOAD_STORAGE');
    fetch.mockResolvedValueOnce(response([new TextEncoder().encode('<html>untrusted private details</html>')]).value);
    await expect(MusicDownloads.testHelper(connection.url, token)).rejects.toThrow('DOWNLOAD_HELPER_FAILED');
  });
});

describe('download and captured-section boundaries', () => {
  it.each(['x'.repeat(501), '--output=/sdcard/song.mp3', 'music\n--exec=anything'])('rejects out-of-bound or option-like lookup text before native work', async (query) => {
    await expect(MusicDownloads.search(query)).rejects.toThrow('DOWNLOAD_INVALID');
    expect(native.search).not.toHaveBeenCalled();
  });
  it('rejects an oversized source link without starting a download', () => {
    expect(() => checkedSourceUrl('https://example.com/song?query=' + 'x'.repeat(4096))).toThrow('DOWNLOAD_URL');
    expect(native.start).not.toHaveBeenCalled();
  });
  it.each(['javascript:alert(1)', 'data:audio/mp3;base64,AAA', 'file:/sdcard/song.mp3', 'content:song', 'http:example.com/music.mp3', 'https://user:pass@example.com/song', 'https://127.0.0.1/song'])('rejects pasted unsafe links before source lookup: %s', async (query) => {
    await expect(MusicDownloads.search(query)).rejects.toThrow('DOWNLOAD_URL');
    expect(native.search).not.toHaveBeenCalled();
  });
  it('canonicalises HTTPS links before lookup and keeps ordinary song names as searches', async () => {
    native.search.mockResolvedValue([source]);
    await MusicDownloads.search(' HTTPS://EXAMPLE.COM/music.mp3 ');
    expect(native.search).toHaveBeenLastCalledWith('https://example.com/music.mp3', jobId);
    await MusicDownloads.search('AC/DC: Live');
    expect(native.search).toHaveBeenLastCalledWith('AC/DC: Live', jobId);
  });
  it.each(['DOWNLOAD_URL', 'DOWNLOAD_SOURCE_FAILED', 'Unexpected native lookup rejection'])('prefers accepted cancellation over a delayed native search rejection: %s', async (message) => {
    const cancellation = new AbortController(); const remove = jest.spyOn(cancellation.signal, 'removeEventListener');
    let rejectNative!: (error: Error) => void;
    native.search.mockImplementationOnce(() => new Promise<DownloadSource[]>((_resolve, reject) => { rejectNative = reject; }));
    const pending = MusicDownloads.search('https://example.com/synthetic.wav', cancellation.signal);
    expect(native.search).toHaveBeenCalledWith('https://example.com/synthetic.wav', jobId);
    const result = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    cancellation.abort();
    expect(native.cancel).toHaveBeenCalledTimes(1); expect(native.cancel).toHaveBeenCalledWith(jobId);
    rejectNative(new Error(message)); await result;
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(native.start).not.toHaveBeenCalled(); expect(imported).not.toHaveBeenCalled();
  });
  it.each(['DOWNLOAD_URL', 'DOWNLOAD_SOURCE_FAILED', 'Unexpected native lookup rejection'])('preserves an uncancelled native search failure and releases its cancellation listener: %s', async (message) => {
    const cancellation = new AbortController(); const failure = new Error(message);
    let rejectNative!: (error: Error) => void;
    native.search.mockImplementationOnce(() => new Promise<DownloadSource[]>((_resolve, reject) => { rejectNative = reject; }));
    const pending = MusicDownloads.search('https://example.com/synthetic.wav', cancellation.signal);
    const result = expect(pending).rejects.toBe(failure);
    rejectNative(failure); await result;
    cancellation.abort();
    expect(native.cancel).not.toHaveBeenCalled();
    expect(native.start).not.toHaveBeenCalled(); expect(imported).not.toHaveBeenCalled();
  });
  it('cancels a recovered native job without waiting for its polling interval', async () => {
    native.getJobs.mockResolvedValue([{ ...job(), stage: 'downloading', percent: 10 }]);
    const recovery = MusicDownloads.recover(library);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    MusicDownloads.cancel(job());
    await expect(recovery).rejects.toMatchObject({ name: 'AbortError' });
    expect(imported).not.toHaveBeenCalled();
  });
  it.each(['file:///etc/audio', 'content://song', 'javascript:alert(1)', 'ftp://example.com/song', 'http://example.com/song', 'https://user:pass@example.com/song', 'https://localhost/song', 'https://127.0.0.1/song', 'https://2130706433/song', 'https://10.0.0.1/song', 'https://172.16.0.1/song', 'https://192.168.1.1/song', 'https://example.local/song', 'https://[::1]/song', 'https://example.com:444/song'])('rejects unsafe source URL %s', (url) => { expect(() => checkedSourceUrl(url)).toThrow('DOWNLOAD_URL'); });
  it('allows a public HTTPS source and a specifically paired private helper', () => {
    expect(checkedSourceUrl(source.url)).toBe(source.url);
    expect(checkedHelperUrl('http://192.168.1.2:8765/')).toBe('http://192.168.1.2:8765');
    expect(checkedHelperUrl('http://show-control.local:8765')).toBe('http://show-control.local:8765');
    expect(() => checkedHelperUrl('http://public.example.com')).toThrow();
    expect(() => checkedHelperUrl('http://user:pass@192.168.1.2')).toThrow();
    expect(() => checkedHelperUrl('http://192.168.1.2/path?key=secret')).toThrow();
  });
  it('attaches to captured IDs and passes local bytes/category/provenance through normal import', async () => {
    await expect(MusicDownloads.download(library, source, target)).resolves.toBe('attached');
    expect(imported).toHaveBeenCalledWith(target.showId, target.setId, expect.objectContaining({ sourceUri: job().uri, declaredBytes: 1000 }), expect.objectContaining({ aborted: false }), expect.objectContaining({ category: 'mindReading', downloadId: jobId, applyPreset: true }));
    expect(native.complete).toHaveBeenCalledWith(jobId);
  });
  it('retains a completed file when its original section disappears', async () => {
    shows = []; await expect(attachCompletedDownload(library, job())).resolves.toBe('retained');
    expect(imported).not.toHaveBeenCalled(); expect(native.complete).not.toHaveBeenCalled();
  });
  it('retains a completed file when deletion wins the storage queue race', async () => {
    imported.mockImplementation(async () => { shows = []; throw new Error('Show does not exist'); });
    await expect(attachCompletedDownload(library, job())).resolves.toBe('retained'); expect(native.complete).not.toHaveBeenCalled();
  });
  it('allows explicit attachment elsewhere and respects that section/category', async () => {
    await attachCompletedDownload(library, { ...job(), setId: 'deleted' }, undefined, target);
    expect(imported.mock.calls[0]!.slice(0, 2)).toEqual([target.showId, target.setId]);
  });
  it('does not redownload after library commit when housekeeping fails', async () => {
    native.complete.mockRejectedValue(new Error('interrupted record cleanup'));
    await expect(attachCompletedDownload(library, job())).resolves.toBe('attached');
    expect(imported).toHaveBeenCalledTimes(1); expect(native.start).not.toHaveBeenCalled();
  });
  it('pre-aborted and armed operations never start work or attach', async () => {
    const signal = new AbortController(); signal.abort();
    await expect(MusicDownloads.download(library, source, target, signal.signal)).rejects.toMatchObject({ name: 'AbortError' });
    setCriticalSessionActive(true); await expect(attachCompletedDownload(library, job())).rejects.toThrow('library.armed');
    expect(imported).not.toHaveBeenCalled(); expect(native.start).not.toHaveBeenCalled();
  });
  it('cancels a job if cancellation occurs while native startup is pending', async () => {
    const cancellation = new AbortController();
    native.start.mockImplementation(async () => { cancellation.abort(); return job(); });
    await expect(MusicDownloads.download(library, source, target, cancellation.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(native.cancel).toHaveBeenCalledWith(jobId); expect(imported).not.toHaveBeenCalled();
  });
  it('records committed attachment despite a Cancel received before native bookkeeping', async () => {
    const cancellation = new AbortController();
    imported.mockImplementationOnce(async () => { cancellation.abort(); return sampleShow; });
    await expect(MusicDownloads.download(library, source, target, cancellation.signal)).resolves.toBe('attached');
    expect(native.cancel).toHaveBeenCalledWith(jobId);
    expect(native.complete).toHaveBeenCalledWith(jobId);
    expect(imported).toHaveBeenCalledTimes(1);
  });
  it('never records attachment when cancellation prevents the SQL commit', async () => {
    const cancellation = new AbortController();
    imported.mockImplementationOnce(async () => { cancellation.abort(); throw new DOMException('Cancelled before commit', 'AbortError'); });
    await expect(MusicDownloads.download(library, source, target, cancellation.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(native.cancel).toHaveBeenCalledWith(jobId);
    expect(native.complete).not.toHaveBeenCalled();
  });
  it('does not attach cancelled, failed, interrupted or empty native results', async () => {
    for (const stage of ['cancelled', 'error', 'interrupted'] as const) {
      native.getJobs.mockResolvedValue([{ ...job(), stage }]);
      await expect(MusicDownloads.download(library, source, target)).rejects.toThrow();
    }
    await expect(attachCompletedDownload(library, { ...job(), bytes: 0 })).rejects.toThrow('DOWNLOAD_INVALID');
    await expect(attachCompletedDownload(library, { ...job(), bytes: 500_000_001 })).rejects.toThrow('DOWNLOAD_INVALID');
    expect(imported).not.toHaveBeenCalled();
  });
  it('propagates a failed save without clearing the completed native file', async () => {
    imported.mockRejectedValue(new Error('low storage'));
    await expect(attachCompletedDownload(library, job())).rejects.toThrow('low storage'); expect(native.complete).not.toHaveBeenCalled();
  });
  it('discards search results that arrive after cancellation', async () => {
    const cancellation = new AbortController();
    native.search.mockImplementation(async () => { cancellation.abort(); return [source]; });
    await expect(MusicDownloads.search('Cipher Kevin MacLeod', cancellation.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('does not change a library when native reports another active job', async () => {
    native.start.mockRejectedValue(new Error('DOWNLOAD_BUSY'));
    await expect(MusicDownloads.download(library, source, target)).rejects.toThrow('DOWNLOAD_BUSY');
    expect(imported).not.toHaveBeenCalled();
  });
  it('recovers only native bookkeeping after committed SQL, late Cancel and a cleanup failure', async () => {
    const cue = Object.values(sampleShow.cues).find((value) => value.type === 'audio')!;
    shows = [{ ...sampleShow, cues: { ...sampleShow.cues, [cue.id]: { ...cue, tags: [...cue.tags, `download:${jobId}`] } } }];
    native.getJobs.mockResolvedValue([{ ...job(), stage: 'cancelled' }]);
    native.complete.mockRejectedValueOnce(new Error('Bookkeeping interrupted')).mockResolvedValueOnce(undefined);
    await MusicDownloads.recover(library);
    await MusicDownloads.recover(library);
    expect(native.complete).toHaveBeenCalledTimes(2);
    expect(native.complete).toHaveBeenLastCalledWith(jobId);
    expect(imported).not.toHaveBeenCalled();
    expect(native.start).not.toHaveBeenCalled();
  });
  it('never reimports a cancelled finished file without a committed audio cue tag', async () => {
    native.getJobs.mockResolvedValue([{ ...job(), stage: 'cancelled' }]);
    await MusicDownloads.recover(library);
    expect(native.complete).not.toHaveBeenCalled();
    expect(imported).not.toHaveBeenCalled();
    expect(native.start).not.toHaveBeenCalled();
  });
  it.each([0, 128.5, 500_000_001])('does not reconcile cancelled invalid metadata with byte count %s', async (bytes) => {
    const cue = Object.values(sampleShow.cues).find((value) => value.type === 'audio')!;
    shows = [{ ...sampleShow, cues: { ...sampleShow.cues, [cue.id]: { ...cue, tags: [...cue.tags, `download:${jobId}`] } } }];
    native.getJobs.mockResolvedValue([{ ...job(), stage: 'cancelled', bytes }]);
    await MusicDownloads.recover(library);
    expect(native.complete).not.toHaveBeenCalled();
    expect(imported).not.toHaveBeenCalled();
  });
  it('does not reconcile cancelled missing-file metadata or a tag on a non-audio cue', async () => {
    const cue = Object.values(sampleShow.cues).find((value) => value.type !== 'audio')!;
    shows = [{ ...sampleShow, cues: { ...sampleShow.cues, [cue.id]: { ...cue, tags: [...cue.tags, `download:${jobId}`] } } }];
    native.getJobs.mockResolvedValue([{ ...job(), stage: 'cancelled', uri: 'https://example.com/unowned.mp3' }]);
    await MusicDownloads.recover(library);
    native.getJobs.mockResolvedValue([{ ...job(), stage: 'cancelled' }]);
    await MusicDownloads.recover(library);
    expect(native.complete).not.toHaveBeenCalled();
    expect(imported).not.toHaveBeenCalled();
  });
  it('preserves legacy cancelled jobs when native provenance rejects bookkeeping', async () => {
    const cue = Object.values(sampleShow.cues).find((value) => value.type === 'audio')!;
    shows = [{ ...sampleShow, cues: { ...sampleShow.cues, [cue.id]: { ...cue, tags: [...cue.tags, `download:${jobId}`] } } }];
    native.getJobs.mockResolvedValue([{ ...job(), stage: 'cancelled' }]);
    native.complete.mockRejectedValueOnce(new Error('DOWNLOAD_INVALID'));
    await expect(MusicDownloads.recover(library)).resolves.toBeUndefined();
    expect(native.complete).toHaveBeenCalledWith(jobId);
    expect(imported).not.toHaveBeenCalled();
  });
});

describe('iOS retained job failure guidance', () => {
  const fetch = jest.mocked(expoFetch);
  const connection = { url: 'http://show-control.local', token: 'synthetic_pairing_code_12345678901234567890' };
  function response(value: unknown, ok = true) {
    let sent = false;
    return { ok, status: ok ? 200 : 400, headers: { get: () => null }, body: { getReader: () => ({
      read: async () => sent ? { done: true, value: undefined } : (sent = true, { done: false, value: new TextEncoder().encode(JSON.stringify(value)) }),
      releaseLock: jest.fn(),
    }) } } as never;
  }
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    jest.mocked(SecureStore.getItemAsync).mockReset().mockResolvedValue(JSON.stringify(connection));
    native.registerExternal.mockReset().mockResolvedValue({ ...job(), stage: 'queued' });
    native.updateExternal.mockReset().mockResolvedValue(undefined);
    native.receive.mockReset(); fetch.mockReset().mockResolvedValue(response({}));
  });
  it.each(['DOWNLOAD_STORAGE', 'DOWNLOAD_URL', 'DOWNLOAD_BUSY', 'DOWNLOAD_SIZE', 'DOWNLOAD_TIMEOUT', 'DOWNLOAD_SOURCE_FAILED', 'DOWNLOAD_HELPER_AUTH'])('keeps %s from a reachable helper in the retained history', async (code) => {
    fetch.mockResolvedValueOnce(response({ errorCode: code }, false));
    await expect(MusicDownloads.download(library, source, target)).rejects.toThrow(code);
    expect(native.updateExternal).toHaveBeenCalledWith(jobId, 'error', null, code);
    expect(imported).not.toHaveBeenCalled();
  });
  it('retains device-storage guidance when a native transfer error wraps the known code', async () => {
    fetch.mockResolvedValueOnce(response({})).mockResolvedValueOnce(response({ stage: 'ready', percent: 100 }));
    native.getJobs.mockResolvedValue([{ ...job(), stage: 'queued' }]);
    native.receive.mockRejectedValueOnce(new Error('Call to receive failed: DOWNLOAD_STORAGE'));
    await expect(MusicDownloads.download(library, source, target)).rejects.toThrow('DOWNLOAD_STORAGE');
    expect(native.updateExternal).toHaveBeenCalledWith(jobId, 'error', null, 'DOWNLOAD_STORAGE');
    expect(imported).not.toHaveBeenCalled();
  });
  it('retains offline helper guidance after a connection failure', async () => {
    fetch.mockRejectedValueOnce(new Error('Network connection lost'));
    await expect(MusicDownloads.download(library, source, target)).rejects.toThrow('DOWNLOAD_HELPER_OFFLINE');
    expect(native.updateExternal).toHaveBeenCalledWith(jobId, 'error', null, 'DOWNLOAD_HELPER_OFFLINE');
  });
  it('does not persist an unknown helper response code as private failure data', async () => {
    fetch.mockResolvedValueOnce(response({ errorCode: 'DOWNLOAD_UNRECOGNIZED_PRIVATE_DETAIL' }, false));
    await expect(MusicDownloads.download(library, source, target)).rejects.toThrow('DOWNLOAD_UNRECOGNIZED_PRIVATE_DETAIL');
    expect(native.updateExternal).toHaveBeenCalledWith(jobId, 'error', null, 'DOWNLOAD_HELPER_FAILED');
  });
  it.each(['DOWNLOAD_UNRECOGNIZED_PRIVATE_DETAIL', 'x'.repeat(1024)])('replaces unknown failure data with a bounded fallback: %s', async (code) => {
    native.registerExternal.mockRejectedValueOnce(new Error(code));
    await expect(MusicDownloads.download(library, source, target)).rejects.toThrow(code);
    expect(native.updateExternal).toHaveBeenCalledWith(jobId, 'error', null, 'DOWNLOAD_HELPER_FAILED');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not replace a deliberate cancellation with an error record', async () => {
    const cancellation = new AbortController();
    native.registerExternal.mockImplementationOnce(async () => { cancellation.abort(); return { ...job(), stage: 'cancelled' }; });
    await expect(MusicDownloads.download(library, source, target, cancellation.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(native.updateExternal).not.toHaveBeenCalled();
    expect(fetch.mock.calls.every(([url, options]) => url === connection.url + '/jobs/' + jobId + '/cancel' && options?.method === 'DELETE')).toBe(true);
  });
});
