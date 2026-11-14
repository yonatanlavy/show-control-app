import { fetch as expoFetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';
import type { z } from 'zod';
import { isCriticalSessionActive } from '../runtime/critical-session-gate';

export function requirePreparation(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Operation cancelled', 'AbortError');
  if (isCriticalSessionActive()) throw new Error('library.armed');
}
export async function structuredRecommendation(input: { provider: 'openai' | 'anthropic'; model?: string; instructions: string; context: string; schema: z.core.JSONSchema.JSONSchema; signal?: AbortSignal }): Promise<unknown> {
  requirePreparation(input.signal);
  const key = await SecureStore.getItemAsync(`showcontrol.provider.${input.provider}`);
  if (!key) throw new Error('MUSIC_AI_KEY');
  requirePreparation(input.signal);
  const model = input.model && /^[\w.:-]{1,100}$/.test(input.model) && input.model.startsWith(input.provider === 'openai' ? 'gpt-' : 'claude-') ? input.model : input.provider === 'openai' ? 'gpt-5.6-terra' : 'claude-haiku-5-5';
  const name = 'recommend_music';
  const body = input.provider === 'openai' ? {
    model, store: false, instructions: input.instructions, input: input.context, reasoning: { effort: 'low' },
    tools: [{ type: 'function', name, description: 'Read-only music recommendations for a routine', strict: true, parameters: input.schema }],
    tool_choice: { type: 'function', name }, parallel_tool_calls: false,
  } : { model, max_tokens: 4096, system: input.instructions, messages: [{ role: 'user', content: input.context }],
    tools: [{ name, description: 'Read-only music recommendations for a routine', input_schema: input.schema, strict: true }],
    tool_choice: { type: 'tool', name, disable_parallel_tool_use: true } };
  let response: Response;
  try { response = await expoFetch(input.provider === 'openai' ? 'https://api.openai.com/v1/responses' : 'https://api.anthropic.com/v1/messages', {
    method: 'POST', ...(input.signal ? { signal: input.signal } : {}), body: JSON.stringify(body), headers: { 'Content-Type': 'application/json',
      ...(input.provider === 'openai' ? { Authorization: `Bearer ${key}` } : { 'x-api-key': key, 'anthropic-version': '2023-06-01' }) },
  }); } catch (error) { requirePreparation(input.signal); void error; throw new Error('MUSIC_AI_OFFLINE'); }
  requirePreparation(input.signal);
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'MUSIC_AI_KEY' : response.status === 429 ? 'MUSIC_AI_QUOTA' : 'MUSIC_AI_FAILED');
  const raw = await response.text(); requirePreparation(input.signal);
  if (raw.length > 128_000) throw new Error('MUSIC_AI_INVALID');
  let payload: { output?: { type: string; name: string; arguments: string }[]; content?: { type: string; name: string; input: unknown }[] };
  try { payload = JSON.parse(raw) as typeof payload; } catch { throw new Error('MUSIC_AI_INVALID'); }
  if (!payload || typeof payload !== 'object' || !Array.isArray(input.provider === 'openai' ? payload.output : payload.content)) throw new Error('MUSIC_AI_INVALID');
  if (input.provider === 'openai') {
    const calls = payload.output?.filter((item) => item.type === 'function_call' && item.name === name) ?? [];
    if (calls.length !== 1 || typeof calls[0]?.arguments !== 'string') throw new Error('MUSIC_AI_INVALID');
    try { return JSON.parse(calls[0].arguments) as unknown; } catch { throw new Error('MUSIC_AI_INVALID'); }
  }
  const calls = payload.content?.filter((item) => item.type === 'tool_use' && item.name === name) ?? [];
  if (calls.length !== 1) throw new Error('MUSIC_AI_INVALID'); return calls[0]?.input;
}
