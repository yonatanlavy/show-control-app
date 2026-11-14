import { normalizeInput, validateProfile } from '../../src/controllers'
import type { ControllerProfile } from '../../src/domain'

const profile: ControllerProfile = { id: 'two-flics', name: 'Two Flics', bindings: [
  { adapterId: 'flic2', deviceId: 'go-device', inputKey: 'primary', command: { type: 'GO' } },
  { adapterId: 'flic2', deviceId: 'panic-device', inputKey: 'primary', command: { type: 'PANIC_FADE' } },
] }
const input = { adapterId: 'flic2', deviceId: 'go-device', inputKey: 'primary', phase: 'down' as const, monotonicMs: 1, isRepeat: false }

it('distinguishes identical physical buttons by adapter and device', () => {
  expect(validateProfile(profile)).toEqual([])
  expect(normalizeInput(input, profile)?.command.type).toBe('GO')
  expect(normalizeInput({ ...input, deviceId: 'panic-device' }, profile)?.command.type).toBe('PANIC_FADE')
  expect(normalizeInput({ ...input, deviceId: 'unbound-device' }, profile)).toBeNull()
})

it('suppresses queued reconnect presses and prefers exact bindings to portable generic aliases', () => {
  expect(normalizeInput({ ...input, wasQueued: true }, profile)).toBeNull()
  const fallback: ControllerProfile = { ...profile, bindings: [{ inputKey: 'primary', command: { type: 'REPLAY' } }, ...profile.bindings] }
  expect(normalizeInput(input, fallback)?.command.type).toBe('GO')
  expect(normalizeInput({ ...input, isRepeat: true }, fallback)).toBeNull()
})
