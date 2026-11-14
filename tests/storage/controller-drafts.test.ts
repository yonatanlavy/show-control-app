import { normalizeInput } from '../../src/controllers'
import { compileRunSnapshot, sampleControllerProfiles, sampleShow, type ControllerProfile, type Show } from '../../src/domain'
import { validateLocalShow } from '../../src/domain/validate-show'
import { DEFAULT_LIBRARY_SETTINGS } from '../../src/library/types'
import { makeLibraryManifest, unboundControllerProfiles, validateLibraryManifest } from '../../src/storage/library-bundle'

const original = sampleControllerProfiles[0]!
const set = sampleShow.sets[0]!
const opening = sampleShow.cues.opening!
if (opening.type !== 'audio') throw new Error('Fixture audio required')
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
function portable(show: Show, profiles: readonly ControllerProfile[]) {
  const manifest = makeLibraryManifest([show], profiles, DEFAULT_LIBRARY_SETTINGS, show.id, show.sets[0]?.id ?? null, 'controller-drafts')
  const entries = [{ path: 'manifest.json', bytes: 10, crc32: 0, dataOffset: 0 }, ...manifest.files.map((file) => ({ path: file.path, bytes: file.bytes, crc32: 0, dataOffset: 0 }))]
  return { manifest, entries }
}
const drafts: readonly [string, ControllerProfile][] = [
  ['no buttons', { ...original, bindings: [] }],
  ['GO only', { ...original, bindings: original.bindings.filter((binding) => binding.command.type === 'GO') }],
  ['panic only', { ...original, bindings: original.bindings.filter((binding) => binding.command.type === 'PANIC_FADE') }],
  ...(['TRIGGER_HIT', 'PLAY', 'SELECT'] as const).map((type): [string, ControllerProfile] => [
    `unavailable ${type}`, { ...original, bindings: [...original.bindings, { inputKey: 'unavailable', command: { type, cueId: 'removed-cue' } }] },
  ]),
]

it.each(drafts)('preserves attached %s mappings while separating authoring and backup from strict preparation', (_name, profile) => {
  const before = copy({ show: sampleShow, profile })
  expect(() => validateLocalShow(sampleShow, [profile])).not.toThrow()
  const { manifest, entries } = portable(sampleShow, [profile])
  expect(validateLibraryManifest(manifest, entries)).toEqual(manifest)
  expect(manifest.shows[0]!.controllerProfileId).toBe(profile.id)
  expect(manifest.controllerProfiles[0]!.bindings).toEqual(profile.bindings)
  const compiled = compileRunSnapshot(sampleShow, set.id, [profile])
  expect(compiled.ok).toBe(false)
  if (!compiled.ok) expect(compiled.issues.every((issue) => issue.code === 'CONTROLLER_INVALID')).toBe(true)
  const unbound = unboundControllerProfiles(manifest.controllerProfiles)
  for (const binding of profile.bindings) expect(normalizeInput({ inputKey: binding.inputKey, adapterId: 'system-media', deviceId: 'system', phase: 'down', isRepeat: false, monotonicMs: 1 }, unbound[0]!)).toBeNull()
  expect({ show: sampleShow, profile }).toEqual(before)
})

it('keeps a shared profile portable across playlists with different Hit banks without changing its target', () => {
  const show = { ...sampleShow, sets: [...sampleShow.sets, { ...set, id: 'new-playlist', name: 'New playlist', cueOrder: [], hitCueIds: [] }] }
  const profile: ControllerProfile = { ...original, bindings: [...original.bindings, { inputKey: 'hit', command: { type: 'TRIGGER_HIT', cueId: 'reveal' } }] }
  expect(() => validateLocalShow(show, [profile])).not.toThrow()
  const { manifest, entries } = portable(show, [profile])
  expect(validateLibraryManifest(manifest, entries).controllerProfiles[0]!.bindings).toEqual(profile.bindings)
  expect(compileRunSnapshot(show, set.id, [profile]).ok).toBe(true)
  expect(compileRunSnapshot(show, 'new-playlist', [profile]).ok).toBe(false)
})

it('rejects a missing attached profile explicitly before restore can lose its identity', () => {
  const { manifest, entries } = portable(sampleShow, [])
  expect(() => validateLibraryManifest(manifest, entries)).toThrow(/missing controller profile/i)
})

const malformedProfiles: readonly [string, (profile: ControllerProfile) => unknown][] = [
  ['blank identity', (profile) => ({ ...profile, id: ' ' })],
  ['padded identity', (profile) => ({ ...profile, id: ' padded ' })],
  ['padded name', (profile) => ({ ...profile, name: ' Learning ' })],
  ['oversized name', (profile) => ({ ...profile, name: 'x'.repeat(257) })],
  ['blank key', (profile) => ({ ...profile, bindings: [{ ...profile.bindings[0]!, inputKey: ' ' }] })],
  ['oversized key', (profile) => ({ ...profile, bindings: [{ ...profile.bindings[0]!, inputKey: 'x'.repeat(257) }] })],
  ['duplicate physical input', (profile) => ({ ...profile, bindings: [profile.bindings[0]!, { ...profile.bindings[0]!, command: { type: 'STOP_ALL' } }] })],
  ['unknown action', (profile) => ({ ...profile, bindings: [{ inputKey: 'button', command: { type: 'EXECUTE', code: 'payload' } }] })],
  ['extra action property', (profile) => ({ ...profile, bindings: [{ inputKey: 'button', command: { type: 'GO', cueId: 'opening' } }] })],
  ['blank target', (profile) => ({ ...profile, bindings: [{ inputKey: 'button', command: { type: 'PLAY', cueId: ' ' } }] })],
]
it.each(malformedProfiles)('rejects an unattached %s profile rather than treating malformed data as a draft', (_name, change) => {
  const { controllerProfileId: _attached, ...show } = sampleShow
  const { manifest, entries } = portable(show, [original])
  expect(() => validateLibraryManifest({ ...manifest, controllerProfiles: [change(manifest.controllerProfiles[0]!)] }, entries)).toThrow()
})

it.each([
  ['blank adapter', { adapterId: ' ' }],
  ['padded adapter', { adapterId: ' hid ' }],
  ['oversized adapter', { adapterId: 'x'.repeat(257) }],
  ['blank device', { deviceId: ' ' }],
  ['padded device', { deviceId: ' pedal ' }],
  ['oversized device', { deviceId: 'x'.repeat(257) }],
  ['unknown binding property', { futureInstruction: 'discarded by projection' }],
] as const)('rejects malformed source definitions with %s before portable identity projection can hide them', (_name, change) => {
  const profile = { ...original, bindings: [{ ...original.bindings[0]!, ...change }, original.bindings[1]!] }
  expect(() => portable(sampleShow, [profile])).toThrow()
})

it('accepts well-formed unfamiliar source definitions while exporting only private logical roles', () => {
  const profile: ControllerProfile = { ...original, bindings: original.bindings.map((binding) => ({ ...binding, adapterId: 'owner-custom-adapter', deviceId: 'AA:BB:CC:DD:EE:FF' })) }
  const { manifest, entries } = portable(sampleShow, [profile])
  expect(() => validateLibraryManifest(manifest, entries)).not.toThrow()
  expect(manifest.controllerProfiles[0]!.bindings.map((binding) => binding.adapterId)).toEqual(['logical-adapter-1', 'logical-adapter-1'])
  expect(JSON.stringify(manifest)).not.toMatch(/owner-custom-adapter|AA:BB:CC:DD:EE:FF/)
})

it('rejects duplicate profile identities, but preserves distinct compound roles using the same key', () => {
  const profile: ControllerProfile = { ...original, bindings: [
    { inputKey: 'primary', adapterId: 'flic2', deviceId: 'left', command: { type: 'GO' } },
    { inputKey: 'primary', adapterId: 'flic2', deviceId: 'right', command: { type: 'PANIC_FADE' } },
  ] }
  const { manifest, entries } = portable(sampleShow, [profile])
  expect(() => validateLibraryManifest(manifest, entries)).not.toThrow()
  expect(() => validateLibraryManifest({ ...manifest, controllerProfiles: [manifest.controllerProfiles[0]!, manifest.controllerProfiles[0]!] }, entries)).toThrow()
  expect(unboundControllerProfiles(manifest.controllerProfiles)[0]!.bindings.map((binding) => binding.deviceId)).toEqual(['logical-device-1', 'logical-device-2'])
})

const invalidContent: readonly [string, (show: Show) => Show][] = [
  ['missing main cue', (show) => ({ ...show, sets: [{ ...set, cueOrder: ['missing'] }] })],
  ['missing audio', (show) => ({ ...show, media: {} })],
  ['invalid trim', (show) => ({ ...show, cues: { ...show.cues, opening: { ...opening, trimInMs: 80000 } } })],
  ['invalid media checksum', (show) => ({ ...show, media: { ...show.media, 'media-open': { ...show.media['media-open']!, checksumSha256: 'invalid' } } })],
  ['duplicate playlist identity', (show) => ({ ...show, sets: [set, set] })],
  ['missing group child', (show) => ({ ...show, cues: { ...show.cues, crossfade: { id: 'crossfade', name: 'Group', type: 'group', tags: [], children: [{ cueId: 'missing', offsetMs: 0 }] } } })],
  ['nested group cycle', (show) => ({ ...show, cues: { ...show.cues, crossfade: { id: 'crossfade', name: 'Group', type: 'group', tags: [], children: [{ cueId: 'crossfade', offsetMs: 0 }] } } })],
  ['missing fallback visual', (show) => ({ ...show, fallbackVisualAssetId: 'missing' })],
  ['invalid voice target', (show) => ({ ...show, voiceRules: [{ id: 'rule', phrases: ['go now'], locale: 'en', enabled: true, action: { type: 'PLAY', cueId: 'missing' }, delayMs: 0 }] })],
]
it.each(invalidContent)('still rejects %s when an attached profile is incomplete', (_name, change) => {
  const show = change(sampleShow); const profile = drafts[1]![1]
  expect(() => validateLocalShow(show, [profile])).toThrow()
  const { manifest, entries } = portable(show, [profile])
  expect(() => validateLibraryManifest(manifest, entries)).toThrow()
})
