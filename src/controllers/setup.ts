import type { ControllerBinding, ControllerCommand, ControllerProfile } from '../domain'
import type { ControllerInput } from './contracts'

export const remoteActions = ['GO', 'PAUSE_RESUME', 'PREVIOUS', 'STOP_ALL', 'PANIC_FADE'] as const
const reservedVolumeKeys = new Set(['KEYCODE_VOLUME_UP', 'KEYCODE_VOLUME_DOWN', 'KEYCODE_VOLUME_MUTE', 'KEYCODE_MUTE', 'MEDIA_VOLUME_UP', 'MEDIA_VOLUME_DOWN', 'MEDIA_VOLUME_MUTE', 'HID_KEY_127', 'HID_KEY_128', 'HID_KEY_129'])
export const mediaDefaults: Readonly<Record<string, ControllerCommand['type']>> = { MEDIA_NEXT: 'GO', MEDIA_PLAY_PAUSE: 'PAUSE_RESUME', MEDIA_PREVIOUS: 'PREVIOUS', MEDIA_STOP: 'STOP_ALL', MEDIA_PLAY: 'RESUME', MEDIA_PAUSE: 'PAUSE' }
export type RemoteKind = 'media' | 'pedal' | 'presenter' | 'flic' | 'custom'
export const remoteExamples: Record<RemoteKind, readonly string[]> = {
  media: ['Satechi Media Button', 'Satechi R2 · M', 'AVRCP'],
  pedal: ['AirTurn · Keyboard', 'PageFlip · Keyboard'],
  presenter: ['Logitech R500 / R500s', 'Logitech Spotlight · Bluetooth'],
  flic: ['Flic 2'],
  custom: ['Bluetooth HID', 'Bluetooth media / AVRCP', 'USB HID'],
}

/** Only a new diagnostic key-down is safe to save or count. */
export function eligibleDiagnosticInput(input: ControllerInput & { diagnosticSessionId?: string; ageMs?: number }, sessionId: string): boolean {
  return !!sessionId && input.diagnosticSessionId === sessionId && input.phase === 'down' && !input.isRepeat && !input.wasQueued && !reservedVolumeKeys.has(input.inputKey) && (input.ageMs === undefined || input.ageMs === 0) && Number.isFinite(input.monotonicMs) && [input.adapterId, input.deviceId, input.inputKey].every((value) => value.length > 0 && value.length <= 512)
}
export function samePhysicalInput(a: Pick<ControllerBinding, 'adapterId' | 'deviceId' | 'inputKey'>, b: Pick<ControllerBinding, 'adapterId' | 'deviceId' | 'inputKey'>): boolean {
  return a.adapterId === b.adapterId && a.deviceId === b.deviceId && a.inputKey === b.inputKey
}
export function bindInput(profile: ControllerProfile, input: ControllerInput, command: ControllerCommand): ControllerProfile {
  const binding = { adapterId: input.adapterId, deviceId: input.deviceId, inputKey: input.inputKey, command }
  const bindings = [...profile.bindings.filter((candidate) => !samePhysicalInput(candidate, binding)), binding]
  if (bindings.length > 256) throw new Error('REMOTE_PROFILE_FULL')
  return { ...profile, bindings }
}
export function diagnosticAction(input: ControllerInput & { resolvedCommandType?: string }, profile?: ControllerProfile): ControllerCommand['type'] | null {
  if (input.phase !== 'down' || input.isRepeat || input.wasQueued) return null
  const binding = profile?.bindings.filter((candidate) => candidate.inputKey === input.inputKey && (!candidate.adapterId || candidate.adapterId === input.adapterId) && (!candidate.deviceId || candidate.deviceId === input.deviceId)).sort((a, b) => Number(!!b.adapterId) + Number(!!b.deviceId) - Number(!!a.adapterId) - Number(!!a.deviceId))[0]
  return binding?.command.type ?? (input.adapterId === 'system-media' ? mediaDefaults[input.inputKey] ?? null : null)
}
