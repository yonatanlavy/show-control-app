import { fetch as expoFetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';
import { recommendMusic } from '../../src/ai/music-recommendations';
import { librarySongs } from '../../src/music/library';
import { sampleShow } from '../../src/domain';
import { setCriticalSessionActive } from '../../src/runtime/critical-session-gate';
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn() }));
const fetchMock = jest.mocked(expoFetch); const keys = jest.mocked(SecureStore);
const request = { routine: 'A participant thinks of a childhood memory.', category: 'memory' as const, songs: librarySongs([sampleShow]), locale: 'he' as const, provider: 'openai' as const };
const plan = { summary: 'Use a quiet bed.', clarification: null, choices: [], suggestions: [] };
type ResponseType = Awaited<ReturnType<typeof expoFetch>>;
const response = (body: unknown, status = 200) => ({ ok: status === 200, status, text: async () => JSON.stringify(body) }) as ResponseType;
beforeEach(() => { jest.clearAllMocks(); setCriticalSessionActive(false); keys.getItemAsync.mockResolvedValue('private-test-key'); });
afterEach(() => setCriticalSessionActive(false));
it('uses the selected model and does not send device paths, media, notes or transport', async () => {
  fetchMock.mockResolvedValue(response({ output: [{ type: 'function_call', name: 'recommend_music', arguments: JSON.stringify(plan) }] }));
  await recommendMusic({ ...request, model: 'gpt-5.6-terra' });
  const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as { input: string; model: string; store: boolean };
  expect(body.model).toBe('gpt-5.6-terra'); expect(body.store).toBe(false); expect(body.input).not.toContain('file://'); expect(body.input).not.toContain('notes'); expect(body.input).not.toContain('controller');
});
it('uses Claude strict tools as an alternative', async () => {
  fetchMock.mockResolvedValue(response({ content: [{ type: 'tool_use', name: 'recommend_music', input: plan }] }));
  await expect(recommendMusic({ ...request, provider: 'anthropic' })).resolves.toEqual(plan);
  expect(fetchMock.mock.calls[0]![0]).toBe('https://api.anthropic.com/v1/messages');
});
it.each([[401, 'MUSIC_AI_KEY'], [403, 'MUSIC_AI_KEY'], [429, 'MUSIC_AI_QUOTA'], [500, 'MUSIC_AI_FAILED']])('handles provider status %s without echoing its body', async (status, error) => {
  const result = response({ private: 'do-not-display' }, Number(status)); const text = jest.fn(result.text); result.text = text; fetchMock.mockResolvedValue(result);
  await expect(recommendMusic(request)).rejects.toThrow(String(error)); expect(text).not.toHaveBeenCalled();
});
it('handles missing keys/offline and rejects a late response after arming', async () => {
  keys.getItemAsync.mockResolvedValue(null); await expect(recommendMusic(request)).rejects.toThrow('MUSIC_AI_KEY'); expect(fetchMock).not.toHaveBeenCalled();
  keys.getItemAsync.mockResolvedValue('private-test-key'); fetchMock.mockRejectedValue(new Error('network details')); await expect(recommendMusic(request)).rejects.toThrow('MUSIC_AI_OFFLINE');
  fetchMock.mockImplementation(async () => { setCriticalSessionActive(true); return response({ output: [] }); }); await expect(recommendMusic(request)).rejects.toThrow('library.armed');
});
it('rejects an oversized routine and cancelled or oversized provider responses', async () => {
  await expect(recommendMusic({ ...request, routine: 'x'.repeat(8193) })).rejects.toThrow('MUSIC_ROUTINE_INVALID');
  const signal = new AbortController(); signal.abort(); await expect(recommendMusic({ ...request, signal: signal.signal })).rejects.toMatchObject({ name: 'AbortError' });
  fetchMock.mockResolvedValue(response({ output: [], padding: 'x'.repeat(128_000) })); await expect(recommendMusic(request)).rejects.toThrow('MUSIC_AI_INVALID');
});
