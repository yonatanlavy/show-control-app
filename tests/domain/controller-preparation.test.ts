import { compileRunSnapshot, controllerPreparationIssues, sampleControllerProfiles, sampleShow, type ControllerProfile, type Show } from '../../src/domain'
import { validateLocalShow } from '../../src/domain/validate-show'
import { DEFAULT_LIBRARY_SETTINGS } from '../../src/library/types'
import { makeLibraryManifest, validateLibraryManifest } from '../../src/storage/library-bundle'

const profile = sampleControllerProfiles[0]!
const hit = { inputKey: 'hit', command: { type: 'TRIGGER_HIT' as const, cueId: 'reveal' } }
const set = sampleShow.sets[0]!
const controllerCodes = (show: Show, selected: typeof set, profiles: readonly ControllerProfile[]) => {
  const compiled = compileRunSnapshot(show, selected.id, profiles)
  return compiled.ok ? [] : compiled.issues.filter((issue) => issue.code === 'CONTROLLER_INVALID' || issue.code === 'CONTROLLER_MISSING')
}

it.each([
  ['valid basic', sampleShow, set, [profile]],
  ['valid named Hit', sampleShow, set, [{ ...profile, bindings: [...profile.bindings, hit] }]],
  ['missing profile', sampleShow, set, []],
  ['missing panic', sampleShow, set, [{ ...profile, bindings: profile.bindings.slice(0, 1) }]],
  ['missing target', sampleShow, set, [{ ...profile, bindings: [...profile.bindings, { ...hit, command: { type: 'TRIGGER_HIT', cueId: 'missing' } }] }]],
  ['duplicate inputs', sampleShow, set, [{ ...profile, bindings: [...profile.bindings, profile.bindings[0]!] }]],
  ['duplicate profile identities', sampleShow, set, [profile, profile]],
] as const)('uses identical controller admission for %s without weakening the compiler', (_name, show, selected, profiles) => {
  expect(controllerPreparationIssues(show, selected, profiles)).toEqual(controllerCodes(show, selected, profiles))
})

it('validates the chosen Hit bank rather than basic button completeness alone', () => {
  const other = { ...set, id: 'other', name: 'Another playlist', hitCueIds: [] }
  const show = { ...sampleShow, sets: [set, other] }; const profiles = [{ ...profile, bindings: [...profile.bindings, hit] }]
  expect(controllerPreparationIssues(show, set, profiles)).toEqual([])
  expect(controllerPreparationIssues(show, other, profiles)).toEqual([expect.objectContaining({ code: 'CONTROLLER_INVALID', message: 'The selected controller profile targets a missing Hit cue.' })])
  expect(controllerCodes(show, other, profiles)).toEqual(controllerPreparationIssues(show, other, profiles))
})

it('keeps audio validation separate and fully blocking when controller recovery is offered', () => {
  const show = { ...sampleShow, media: {} }; const profiles = [{ ...profile, bindings: [...profile.bindings, hit] }]
  expect(controllerPreparationIssues(show, set, profiles)).toEqual([])
  const compiled = compileRunSnapshot(show, set.id, profiles)
  expect(compiled.ok).toBe(false)
  if (!compiled.ok) expect(compiled.issues.some((issue) => issue.code === 'MEDIA_MISSING')).toBe(true)
})

it('retains the existing global duplicate-profile check even for a show without an attached profile', () => {
  const { controllerProfileId: _profileId, ...show } = sampleShow
  expect(controllerPreparationIssues(show, set, [profile, profile])).toEqual([expect.objectContaining({ code: 'CONTROLLER_INVALID', message: 'Controller profile IDs must be unique.' })])
  expect(controllerCodes(show, set, [profile, profile])).toEqual(controllerPreparationIssues(show, set, [profile, profile]))
})

const targetCases = (['PLAY', 'SELECT'] as const).flatMap((type) => (['missing', 'Hit-only', 'another playlist'] as const).map((kind) => ({ type, kind })))
it.each(targetCases)('preserves $type targeting $kind during authoring and backup but refuses controller preparation', ({ type, kind }) => {
  const opening = sampleShow.cues.opening
  if (opening?.type !== 'audio') throw new Error('Fixture audio required')
  const show = kind === 'another playlist' ? { ...sampleShow, cues: { ...sampleShow.cues, other: { ...opening, id: 'other' } }, sets: [...sampleShow.sets, { ...set, id: 'other-set', name: 'Other playlist', cueOrder: ['other'] }] } : sampleShow
  const cueId = kind === 'missing' ? 'missing' : kind === 'Hit-only' ? 'reveal' : 'other'
  const profiles = [{ ...profile, bindings: [...profile.bindings, { inputKey: 'target', command: { type, cueId } }] }]
  expect(controllerPreparationIssues(show, set, profiles)).toEqual([expect.objectContaining({ code: 'CONTROLLER_INVALID' })])
  expect(controllerCodes(show, set, profiles)).toEqual(controllerPreparationIssues(show, set, profiles))
  expect(() => validateLocalShow(show, profiles)).not.toThrow()
  const manifest = makeLibraryManifest([show], profiles, DEFAULT_LIBRARY_SETTINGS, show.id, set.id, 'target-validation')
  const entries = [{ path: 'manifest.json', bytes: 10, crc32: 0, dataOffset: 0 }, ...manifest.files.map((file) => ({ path: file.path, bytes: file.bytes, crc32: 0, dataOffset: 0 }))]
  expect(() => validateLibraryManifest(manifest, entries)).not.toThrow()
})

it.each(['PLAY', 'SELECT'] as const)('accepts %s for an active ordered main cue at every admission boundary', (type) => {
  const profiles = [{ ...profile, bindings: [...profile.bindings, { inputKey: 'target', command: { type, cueId: 'opening' } }] }]
  expect(controllerPreparationIssues(sampleShow, set, profiles)).toEqual([])
  expect(compileRunSnapshot(sampleShow, set.id, profiles).ok).toBe(true)
  expect(() => validateLocalShow(sampleShow, profiles)).not.toThrow()
  const manifest = makeLibraryManifest([sampleShow], profiles, DEFAULT_LIBRARY_SETTINGS, sampleShow.id, set.id, 'main-target')
  const entries = [{ path: 'manifest.json', bytes: 10, crc32: 0, dataOffset: 0 }, ...manifest.files.map((file) => ({ path: file.path, bytes: file.bytes, crc32: 0, dataOffset: 0 }))]
  expect(() => validateLibraryManifest(manifest, entries)).not.toThrow()
})

it.each(['PLAY', 'SELECT'] as const)('keeps %s valid for ordered group, wait, fade, stop and shared main/Hit roots', (type) => {
  const show: Show = { ...sampleShow, cues: { ...sampleShow.cues, stop: { id: 'stop', name: 'Stop root', type: 'stop', tags: [], selector: { kind: 'all' } } }, sets: [{ ...set, cueOrder: [...set.cueOrder, 'stop', 'reveal'] }] }
  for (const cueId of ['crossfade', 'hold', 'finale', 'stop', 'reveal']) {
    const profiles = [{ ...profile, bindings: [...profile.bindings, { inputKey: 'target', command: { type, cueId } }] }]
    expect(controllerPreparationIssues(show, show.sets[0]!, profiles)).toEqual([])
    expect(compileRunSnapshot(show, show.sets[0]!.id, profiles).ok).toBe(true)
  }
})
