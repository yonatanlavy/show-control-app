import { z } from 'zod';
import type { AudioCue, Show, VoiceRule } from '../domain';

export const operationSchema = z.object({
  kind: z.enum(['setNumber', 'setBoolean', 'setColor', 'createPlaylist', 'copyToPlaylist', 'reverse', 'move', 'voiceRule']),
  cueIds: z.array(z.string().min(1).max(256)).max(1000),
  field: z.enum(['volumePercent', 'playbackRate', 'trimInMs', 'trimOutMs', 'fadeInMs', 'fadeOutMs', 'preWaitMs', 'crossfadeMs', 'autoPlay', 'crossfadeEnabled', 'loop']).nullable(),
  numberValue: z.number().finite().nullable(), boolValue: z.boolean().nullable(),
  textValue: z.string().max(256).nullable(), destinationIndex: z.number().int().min(0).nullable(),
  phrase: z.string().max(256).nullable(), action: z.enum(['GO', 'PLAY', 'PAUSE', 'RESUME', 'STOP_ALL', 'PANIC_FADE']).nullable(),
  scopeCueId: z.string().max(256).nullable(),
  targetCueId: z.string().max(256).nullable(), delayMs: z.number().int().min(0).max(3_600_000).nullable(),
}).strict();
export type EditOperation = z.infer<typeof operationSchema>;

export const musicRequestSchema = z.object({
  purpose: z.string().max(500), style: z.string().max(500),
  tempo: z.number().finite().min(20).max(300), lengthSeconds: z.number().finite().min(3).max(600),
  lyrics: z.string().max(8000).nullable(), description: z.string().max(2000).nullable(),
}).strict().refine((value) => (!!value.purpose.trim() && !!value.style.trim()) || !!value.description?.trim(), 'Describe the music or provide its purpose and style');
export type MusicRequest = z.infer<typeof musicRequestSchema>;
export const assistantPlanSchema = z.object({
  kind: z.enum(['answer', 'clarification', 'edit', 'generateArtwork', 'generateMusic']),
  text: z.string().max(8000), choices: z.array(z.string().max(500)).max(8),
  operations: z.array(operationSchema).max(100), cueIds: z.array(z.string().max(256)).max(1000),
  musicRequest: musicRequestSchema.nullable(),
}).strict();
export type AssistantPlan = z.infer<typeof assistantPlanSchema>;

/** Finite operations only. Never evaluates provider-supplied code or trusts a provider cue ID. */
export function applyEditOperations(show: Show, setId: string, operations: readonly EditOperation[], locale: VoiceRule['locale'], newId: () => string): Show {
  const selected = show.sets.find((set) => set.id === setId);
  if (!selected) throw new Error('Selected playlist is missing');
  const editable = new Set(selected.cueOrder);
  let updated: Show = JSON.parse(JSON.stringify(show)) as Show;
  for (const op of operations) {
    const targets = op.cueIds.map((id) => {
      if (!editable.has(id) || !updated.cues[id]) throw new Error('The assistant referenced a song outside the selected playlist');
      return updated.cues[id]!;
    });
    if (new Set(op.cueIds).size !== op.cueIds.length) throw new Error('The assistant repeated a song ID');
    if (op.kind === 'reverse' || op.kind === 'move') {
      const set = updated.sets.find((item) => item.id === setId)!;
      let order = [...set.cueOrder];
      if (op.kind === 'reverse') order.reverse();
      else {
        if (targets.length !== 1 || op.destinationIndex === null || op.destinationIndex >= order.length) throw new Error('Invalid song move');
        order = order.filter((id) => id !== targets[0]!.id);
        order.splice(op.destinationIndex, 0, targets[0]!.id);
      }
      updated = { ...updated, sets: updated.sets.map((item) => item.id === setId ? { ...item, cueOrder: order } : item) };
      continue;
    }
    if (op.kind === 'copyToPlaylist' || op.kind === 'createPlaylist') {
      const name = op.textValue?.trim();
      if (!name || (op.kind === 'copyToPlaylist' && targets.length === 0) || (op.kind === 'createPlaylist' && targets.length !== 0)) throw new Error('A new playlist needs a name and an explicit song selection');
      const cues = { ...updated.cues };
      const order = targets.map((cue) => { const id = newId(); cues[id] = { ...cue, id }; return id; });
      updated = { ...updated, cues, sets: [...updated.sets, { id: newId(), name, cueOrder: order, hitCueIds: [], transportMode: 'oms' }] };
      continue;
    }
    if (op.kind === 'voiceRule') {
      if (!op.phrase?.trim() || !op.action || (op.scopeCueId && !editable.has(op.scopeCueId)) || (op.action === 'PLAY' && (!op.targetCueId || !editable.has(op.targetCueId)))) throw new Error('Invalid voice rule');
      const rule: VoiceRule = { id: newId(), phrases: [op.phrase.trim()], locale, enabled: true,
        action: op.action === 'PLAY' ? { type: 'PLAY', cueId: op.targetCueId! } : { type: op.action }, delayMs: op.delayMs ?? 0, ...(op.scopeCueId ? { cueId: op.scopeCueId } : {}) };
      updated = { ...updated, voiceRules: [...(updated.voiceRules ?? []), rule] };
      continue;
    }
    if (targets.length === 0) throw new Error('An edit must identify songs');
    const cues = { ...updated.cues };
    for (const cue of targets) {
      if (cue.type !== 'audio') throw new Error('Song tuning requires an audio cue');
      let change: Partial<AudioCue>;
      if (op.kind === 'setColor') {
        if (!op.textValue || !['red', 'yellow', 'green', 'blue', 'purple', 'orange', 'none'].includes(op.textValue)) throw new Error('Invalid song color');
        change = { colorToken: op.textValue };
      } else if (op.kind === 'setBoolean') {
        if (op.boolValue === null) throw new Error('A switch edit needs a boolean');
        if (op.field === 'loop') change = { endBehavior: op.boolValue ? 'loop' : 'stopAndReadyNext' };
        else if (op.field === 'autoPlay' || op.field === 'crossfadeEnabled') change = { [op.field]: op.boolValue };
        else throw new Error('Invalid switch field');
      } else if (op.kind === 'setNumber') {
        const value = op.numberValue;
        if (value === null || !op.field) throw new Error('A numeric edit needs a value and field');
        if (op.field === 'volumePercent') {
          if (value < 0 || value > 100) throw new Error('Volume must be between zero and 100 percent');
          change = { gainDb: value === 0 ? -96 : 20 * Math.log10(value / 100) };
        } else if (op.field === 'playbackRate') {
          if (value < 0.7 || value > 2) throw new Error('Speed must be between 0.7 and 2');
          change = { playbackRate: value };
        } else if (['trimInMs', 'trimOutMs', 'fadeInMs', 'fadeOutMs', 'preWaitMs', 'crossfadeMs'].includes(op.field)) {
          if (!Number.isSafeInteger(value) || value < 0 || value > 3_600_000) throw new Error('Invalid millisecond timing');
          change = { [op.field]: value };
        } else throw new Error('Invalid numeric field');
      } else throw new Error('Unsupported edit');
      cues[cue.id] = { ...cue, ...change };
    }
    updated = { ...updated, cues };
  }
  return { ...updated, schemaVersion: 2, revisionId: newId(), updatedAt: new Date().toISOString() };
}
