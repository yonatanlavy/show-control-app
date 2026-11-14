import { fetch as expoFetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';
import { AiAssistant, generateMusic, ProviderKeys } from '../../src/ai';
import { sampleShow } from '../../src/domain';
import { setCriticalSessionActive } from '../../src/runtime/critical-session-gate';

const mockFileEvents: string[] = [];
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'generated-id' }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  Directory: class { create() { /* In-memory staging directory. */ } },
  File: class {
    uri = 'file:///cache/generated.mp3'; exists = true;
    create() { mockFileEvents.push('create'); }
    open() { return { writeBytes: () => mockFileEvents.push('write'), close: () => mockFileEvents.push('close') }; }
    delete() { mockFileEvents.push('delete'); this.exists = false; }
  },
}));
const mockFetch = jest.mocked(expoFetch);
const keyStore = jest.mocked(SecureStore);
const plan = { kind: 'answer', text: 'There are four cues.', choices: [], operations: [], cueIds: [], musicRequest: null };
type ExpoResponse = Awaited<ReturnType<typeof expoFetch>>;
function jsonResponse(value: unknown, status = 200): ExpoResponse { return { ok: status >= 200 && status < 300, status, json: async () => value } as unknown as ExpoResponse; }
const input = () => ({ show: sampleShow, setId: 'set-main', prompt: 'How many songs?', locale: 'en' as const });

beforeEach(() => { jest.clearAllMocks(); mockFileEvents.length = 0; setCriticalSessionActive(false); keyStore.getItemAsync.mockResolvedValue('private-test-key'); });
afterEach(() => setCriticalSessionActive(false));

describe('BYOK assistant wire and failure boundaries', () => {
  it('uses Responses strict finite tools without sending media paths, notes or device IDs', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ output: [{ type: 'function_call', name: 'prepare_playlist', arguments: JSON.stringify(plan) }] }));
    await expect(AiAssistant.execute(input())).resolves.toEqual({ kind: 'answer', text: plan.text });
    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(options!.body as string) as { store: boolean; input: string; tools: { strict: boolean }[] };
    expect(body.store).toBe(false); expect(body.tools[0]?.strict).toBe(true);
    expect(body.input).not.toContain('file://'); expect(body.input).not.toContain('localUri');
    expect(body.input).not.toContain('controllerProfileId'); expect(body.input).not.toContain('notes');
  });
  it('uses Claude Messages as the alternative with the same validated result', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ content: [{ type: 'tool_use', name: 'prepare_playlist', input: plan }] }));
    await expect(AiAssistant.execute({ ...input(), provider: 'anthropic' })).resolves.toMatchObject({ kind: 'answer' });
    expect(mockFetch.mock.calls[0]?.[0]).toBe('https://api.anthropic.com/v1/messages');
  });
  it.each([401, 403, 429, 500])('redacts provider errors (%i) and does not apply edits', async (status) => {
    const response = jsonResponse({ privateKey: 'do-not-echo' }, status); const read = jest.fn(response.json); response.json = read;
    mockFetch.mockResolvedValue(response);
    await expect(AiAssistant.execute(input())).rejects.toThrow(`failed (${status})`);
    expect(read).not.toHaveBeenCalled();
  });
  it('rejects empty keys, offline failure, invalid operations and contradictory read-only edits', async () => {
    keyStore.getItemAsync.mockResolvedValue(null);
    await expect(AiAssistant.execute(input())).rejects.toThrow('API key'); expect(mockFetch).not.toHaveBeenCalled();
    keyStore.getItemAsync.mockResolvedValue('private-test-key'); mockFetch.mockRejectedValue(new Error('Offline'));
    await expect(AiAssistant.execute(input())).rejects.toThrow('Offline');
    mockFetch.mockResolvedValue(jsonResponse({ output: [{ type: 'function_call', name: 'prepare_playlist', arguments: JSON.stringify({ ...plan, code: 'run()' }) }] }));
    await expect(AiAssistant.execute(input())).rejects.toThrow();
    mockFetch.mockResolvedValue(jsonResponse({ output: [{ type: 'function_call', name: 'prepare_playlist', arguments: JSON.stringify({ ...plan, operations: [{ kind: 'GO' }] }) }] }));
    await expect(AiAssistant.execute(input())).rejects.toThrow();
  });
  it('blocks new requests while armed and discards a response if the show arms in flight', async () => {
    setCriticalSessionActive(true); await expect(AiAssistant.execute(input())).rejects.toThrow('armed'); expect(mockFetch).not.toHaveBeenCalled();
    setCriticalSessionActive(false);
    mockFetch.mockImplementation(async () => { setCriticalSessionActive(true); return jsonResponse({ output: [] }); });
    await expect(AiAssistant.execute(input())).rejects.toThrow('armed');
  });
  it('cancellation after a response prevents further processing', async () => {
    const cancellation = new AbortController();
    mockFetch.mockImplementation(async () => { cancellation.abort(); return jsonResponse({ output: [] }); });
    await expect(AiAssistant.execute({ ...input(), signal: cancellation.signal })).rejects.toThrow('cancelled');
  });
  it('uses device-only secure storage and deletes blank keys', async () => {
    await ProviderKeys.set('openai', '  key  ');
    expect(keyStore.setItemAsync).toHaveBeenCalledWith('showcontrol.provider.openai', 'key', { keychainAccessible: 'device-only' });
    await ProviderKeys.set('openai', ' '); expect(keyStore.deleteItemAsync).toHaveBeenCalledWith('showcontrol.provider.openai');
    await expect(ProviderKeys.set('openai', 'key\nsecret')).rejects.toThrow('Invalid');
  });
});
describe('music cancellation', () => {
  it('closes the staged file before deleting cancelled output and cancels the stream', async () => {
    const cancellation = new AbortController(); const cancel = jest.fn(async () => undefined); const releaseLock = jest.fn();
    mockFetch.mockResolvedValue({ ok: true, status: 200, body: { getReader: () => ({
      read: async () => { cancellation.abort(); return { done: false, value: new Uint8Array(128) }; }, cancel, releaseLock,
    }) } } as unknown as ExpoResponse);
    await expect(generateMusic({ purpose: 'Walk on', style: 'Jazz', tempo: 120, lengthSeconds: 30, locale: 'en', signal: cancellation.signal })).rejects.toThrow('cancelled');
    expect(mockFileEvents.slice(-2)).toEqual(['close', 'delete']); expect(cancel).toHaveBeenCalled(); expect(releaseLock).toHaveBeenCalled();
  });
});
