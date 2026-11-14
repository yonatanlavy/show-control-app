import type { ControllerProfile } from '../domain';
import type { ControllerInput, NormalizedControllerEvent } from './contracts';

export function validateProfile(profile: ControllerProfile): readonly string[] {
  const inputs = new Set<string>();
  const errors: string[] = [];
  for (const binding of profile.bindings) {
    const identity = `${binding.adapterId ?? '*'}:${binding.deviceId ?? '*'}:${binding.inputKey}`;
    if (inputs.has(identity)) errors.push(`Input ${binding.inputKey} is assigned more than once.`);
    inputs.add(identity);
  }
  if (!profile.bindings.some((binding) => binding.command.type === 'GO')) errors.push('A GO input is required.');
  if (!profile.bindings.some((binding) => binding.command.type === 'PANIC_FADE')) errors.push('A Panic Fade input is required.');
  return errors;
}

export function normalizeInput(input: ControllerInput, profile: ControllerProfile): NormalizedControllerEvent | null {
  if (input.phase !== 'down' || input.isRepeat || input.wasQueued) return null;
  const binding = [...profile.bindings].sort((a, b) => Number(b.adapterId !== undefined) + Number(b.deviceId !== undefined) - Number(a.adapterId !== undefined) - Number(a.deviceId !== undefined)).find((candidate) => candidate.inputKey === input.inputKey &&
    (candidate.adapterId === undefined || candidate.adapterId === input.adapterId) &&
    (candidate.deviceId === undefined || candidate.deviceId === input.deviceId));
  return binding ? { command: binding.command, source: input } : null;
}
