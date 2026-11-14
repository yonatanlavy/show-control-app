import { bindInput, diagnosticAction, eligibleDiagnosticInput, normalizeInput, samePhysicalInput } from '../../src/controllers'
import type { ControllerProfile } from '../../src/domain'

const input = { adapterId: 'generic-native', deviceId: 'pedal-one', inputKey: 'KEYCODE_PAGE_DOWN', phase: 'down' as const, monotonicMs: 123, isRepeat: false, wasQueued: false, ageMs: 0, diagnosticSessionId: 'fresh' }
const profile: ControllerProfile = { id: 'remote', name: 'Show', bindings: [
  { ...input, command: { type: 'GO' } },
  { adapterId: 'generic-native', deviceId: 'pedal-two', inputKey: input.inputKey, command: { type: 'PANIC_FADE' } },
] }

describe('remote setup admission and mapping', () => {
  it.each([
    ['key release', { phase: 'up' }], ['hardware repeat', { isRepeat: true }], ['queued reconnect', { wasQueued: true }], ['aged input', { ageMs: 1 }],
    ['old session', { diagnosticSessionId: 'old' }], ['no session', { diagnosticSessionId: '' }], ['invalid time', { monotonicMs: NaN }],
    ['empty device', { deviceId: '' }], ['empty adapter', { adapterId: '' }], ['empty key', { inputKey: '' }], ['oversized device', { deviceId: 'x'.repeat(513) }],
  ])('rejects %s before learning or counting it', (_name, changes) => { expect(eligibleDiagnosticInput({ ...input, ...changes } as typeof input, 'fresh')).toBe(false) })
  it('accepts a current deliberate press but never an unstarted session', () => { expect(eligibleDiagnosticInput(input, 'fresh')).toBe(true); expect(eligibleDiagnosticInput(input, '')).toBe(false) })
  it.each(['KEYCODE_VOLUME_UP', 'KEYCODE_VOLUME_DOWN', 'KEYCODE_VOLUME_MUTE', 'HID_KEY_127', 'HID_KEY_128', 'HID_KEY_129'])('keeps reserved volume key %s out of show mappings', (inputKey) => { expect(eligibleDiagnosticInput({ ...input, inputKey }, 'fresh')).toBe(false) })
  it('replaces only the exact button, retaining a second identical remote and its panic binding', () => {
    const result = bindInput(profile, input, { type: 'PAUSE_RESUME' })
    expect(result.bindings).toHaveLength(2); expect(normalizeInput(input, result)?.command.type).toBe('PAUSE_RESUME')
    expect(normalizeInput({ ...input, deviceId: 'pedal-two' }, result)?.command.type).toBe('PANIC_FADE')
    expect(profile.bindings[0]?.command.type).toBe('GO')
  })
  it('keeps Flic and keyboard inputs separate even with identical device/key labels', () => {
    const result = bindInput(profile, { ...input, adapterId: 'flic2' }, { type: 'STOP_ALL' })
    expect(result.bindings).toHaveLength(3); expect(diagnosticAction(input, result)).toBe('GO'); expect(diagnosticAction({ ...input, adapterId: 'flic2' }, result)).toBe('STOP_ALL')
    expect(samePhysicalInput(input, { ...input, adapterId: 'flic2' })).toBe(false)
  })
  it.each([['MEDIA_NEXT', 'GO'], ['MEDIA_PLAY_PAUSE', 'PAUSE_RESUME'], ['MEDIA_PREVIOUS', 'PREVIOUS'], ['MEDIA_STOP', 'STOP_ALL'], ['MEDIA_PLAY', 'RESUME'], ['MEDIA_PAUSE', 'PAUSE']])('uses system media default %s → %s', (inputKey, command) => { expect(diagnosticAction({ ...input, adapterId: 'system-media', inputKey })).toBe(command) })
  it('does not mistake volume, mouse, HID media-like names or unmapped presses for GO', () => {
    for (const inputKey of ['KEYCODE_VOLUME_UP', 'mouse-left', 'unknown', 'MEDIA_NEXT']) expect(diagnosticAction({ ...input, inputKey })).toBeNull()
    expect(diagnosticAction({ ...input, adapterId: 'system-media', inputKey: 'MEDIA_VOLUME_UP' })).toBeNull()
  })
  it('honors an exact custom media binding over defaults and generic aliases', () => {
    const result: ControllerProfile = { ...profile, bindings: [{ inputKey: 'MEDIA_NEXT', command: { type: 'PREVIOUS' } }, { adapterId: 'system-media', deviceId: 'system-media', inputKey: 'MEDIA_NEXT', command: { type: 'PANIC_FADE' } }] }
    expect(diagnosticAction({ ...input, adapterId: 'system-media', deviceId: 'system-media', inputKey: 'MEDIA_NEXT' }, result)).toBe('PANIC_FADE')
  })
  it('refuses overflow before persistence but permits replacing a mapping at capacity', () => {
    const full: ControllerProfile = { ...profile, bindings: Array.from({ length: 256 }, (_, index) => ({ adapterId: input.adapterId, deviceId: input.deviceId, inputKey: `key-${index}`, command: { type: 'GO' } })) }
    expect(() => bindInput(full, input, { type: 'GO' })).toThrow('REMOTE_PROFILE_FULL')
    expect(bindInput(full, { ...input, inputKey: 'key-0' }, { type: 'PANIC_FADE' }).bindings).toHaveLength(256)
    expect(full.bindings[0]?.command.type).toBe('GO')
  })
})
