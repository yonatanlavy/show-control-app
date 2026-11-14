import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { DatabaseSync } from 'node:sqlite'
import * as SQLite from 'expo-sqlite'
import type { ControllerDiagnosticMode, ControllerHealth, NativeControllerInput } from '../../../modules/show-controller'
import { compileRunSnapshot, sampleShow, type ControllerBinding, type ControllerProfile, type RunSnapshot } from '../../domain'
import type { EngineCommand, PreparedNativeSession } from '../../audio'
import { I18nProvider, messages } from '../../i18n'
import { createLibraryStore } from '../../library/store'
import { migrateLibrary, SqliteShowRepository } from '../../storage/sqlite'
import { AppProvider, useApp } from '../AppProvider'
import { ControllersScreen } from '../controller-screen'
import { controllerInputLabel } from '../controller-input-label'
import { setCriticalSessionActive } from '../../runtime/critical-session-gate'
import { withDeviceSettingsAction } from '../../runtime/device-settings-action'

let mockDiagnostic: ControllerDiagnosticMode = 'off'; let mockSessionId = ''
let mockFailShow = false; let mockCriticalAfterProfile = false; let mockFailProfile = false
let mockInput: (event: NativeControllerInput) => void = () => undefined
const mockConfigured: ControllerProfile[] = []; const mockPrepared: unknown[] = []
const mockDispatched: EngineCommand[] = []
let mockControllerAvailable = true; let mockExistingSession: PreparedNativeSession | null = null
const mockControllerStop = jest.fn<Promise<void>, []>()
const mockControllerStart = jest.fn<Promise<void>, []>()
const mockConfigureProfile = jest.fn<Promise<void>, [ControllerProfile]>()
let raw: DatabaseSync
const mockHealth = (): ControllerHealth => ({ sdkAvailable: true, configured: true, restored: true, bluetoothState: 'powered_on', pairedCount: 0, readyCount: 0, connectingCount: 0, staleEventsSuppressed: 0, backgroundRequested: false, initialPairingMayRequireInternet: true, detail: '', diagnosticMode: mockDiagnostic, diagnosticSessionId: mockSessionId })
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), dismissTo: jest.fn() }), useLocalSearchParams: () => ({}) }))
jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual<typeof import('node:crypto')>('node:crypto').randomUUID() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(), backupDatabaseAsync: jest.fn() }))
jest.mock('expo-file-system', () => ({
  Directory: class { uri: string; constructor(...parts: (string | { uri: string })[]) { this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri).join('/') } exists = true; create() {} list() { return [] } },
  File: class {}, Paths: { document: 'file:///owned-controller-fixture', availableDiskSpace: 10_000_000_000 },
}))
jest.mock('../../audio', () => ({ ...jest.requireActual('../../audio'), resolveNativeAudioEngine: () => ({ available: true, engine: {
  prepare: async (snapshot: unknown) => { mockPrepared.push(snapshot) }, dispatch: async (command: EngineCommand) => { mockDispatched.push(command) },
  shutdown: async () => undefined, getPreparedSession: async () => mockExistingSession, subscribe: () => ({ remove: () => undefined }),
} }) }))
jest.mock('../../../modules/show-audio', () => ({ __esModule: true, default: { availability: () => ({ available: true }), stopPreview: async () => undefined, addListener: () => ({ remove: () => undefined }) } }))
jest.mock('../../../modules/show-controller', () => ({ __esModule: true, default: {
  isAvailable: () => mockControllerAvailable, configure: async () => undefined, configureProfile: (profile: ControllerProfile) => mockConfigureProfile(profile),
  start: () => mockControllerStart(), stop: () => mockControllerStop(), cancelScan: () => undefined, health: async () => mockHealth(),
  setDiagnosticMode: async (mode: ControllerDiagnosticMode) => { mockDiagnostic = mode; mockSessionId = mode === 'off' ? '' : 'fixture-session'; return mockHealth() },
  addInputListener: (listener: (event: NativeControllerInput) => void) => { mockInput = listener; return { remove: () => undefined } },
  addHealthListener: () => ({ remove: () => undefined }), addScanListener: () => ({ remove: () => undefined }),
} }))
jest.mock('../../../modules/show-visual', () => ({ __esModule: true, default: { configure: async () => undefined } }))
jest.mock('../../../modules/show-voice', () => ({ VoiceNative: { getStatus: async () => ({ available: false }), disarm: async () => undefined, subscribe: () => ({ remove: () => undefined }) } }))
jest.mock('../../music/downloads', () => ({ MusicDownloads: { recover: async () => undefined } }))

let app: ReturnType<typeof useApp>
function Probe() { const value = useApp(); useEffect(() => { app = value }, [value]); return null }
const profileId = `profile-${sampleShow.id}`
const go = { adapterId: 'generic-native', deviceId: 'pedal', inputKey: 'KEYCODE_PAGE_DOWN', command: { type: 'GO' as const } }
const panic = { ...go, inputKey: 'KEYCODE_PAGE_UP', command: { type: 'PANIC_FADE' as const } }
const completeProfile: ControllerProfile = { id: profileId, name: 'Controller fixture', bindings: [go, panic] }
const panicInput: NativeControllerInput = { eventId: 'source:1', sourceSessionId: 'source', sequence: 1, adapterId: 'generic-native', deviceId: 'pedal', inputKey: panic.inputKey, phase: 'down', monotonicMs: 123, isRepeat: false, wasQueued: false, ageMs: 0, deliveryEvidence: 'app_received_only', diagnosticMode: 'learn', diagnosticSessionId: 'fixture-session', handledNatively: true }
const sqlShow = () => JSON.parse((raw.prepare('SELECT document_json FROM shows WHERE id = ?').get(sampleShow.id) as { document_json: string }).document_json) as typeof sampleShow
const sqlProfile = () => { const row = raw.prepare('SELECT profile_json FROM controller_profiles WHERE id = ?').get(profileId) as { profile_json: string } | undefined; return row ? JSON.parse(row.profile_json) as ControllerProfile : undefined }
async function mount(showScreen = false) { const screen = render(<I18nProvider><AppProvider><Probe />{showScreen ? <ControllersScreen /> : null}</AppProvider></I18nProvider>); await waitFor(() => expect(app.libraryState.status).toBe('ready')); await act(async () => undefined); return screen }

beforeEach(async () => {
  jest.clearAllMocks(); setCriticalSessionActive(false); mockFailShow = false; mockCriticalAfterProfile = false; mockFailProfile = false; mockConfigured.length = 0; mockPrepared.length = 0; mockDiagnostic = 'off'; mockSessionId = ''
  mockDispatched.length = 0; mockControllerAvailable = true; mockExistingSession = null
  mockControllerStop.mockReset().mockResolvedValue(undefined); mockControllerStart.mockReset().mockResolvedValue(undefined)
  mockConfigureProfile.mockReset().mockImplementation(async (profile) => { mockConfigured.push(profile) })
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
  raw = new DatabaseSync(':memory:')
  const params = (args: unknown[]) => (Array.isArray(args[0]) ? args[0] : args) as (string | number | null)[]
  const db = {
    execAsync: async (sql: string) => raw.exec(sql),
    runAsync: async (sql: string, ...args: unknown[]) => {
      if (mockFailShow && /INSERT.*INTO shows/i.test(sql)) throw new Error('SQLITE_FULL: fixture show save')
      if (mockFailProfile && sql.includes('INTO controller_profiles')) throw new Error('SQLITE_FULL: fixture profile save')
      const result = raw.prepare(sql).run(...params(args))
      if (mockCriticalAfterProfile && sql.includes('INTO controller_profiles')) setCriticalSessionActive(true)
      return result
    },
    getFirstAsync: async (sql: string, ...args: unknown[]) => raw.prepare(sql).get(...params(args)) ?? null,
    getAllAsync: async (sql: string, ...args: unknown[]) => raw.prepare(sql).all(...params(args)), closeAsync: async () => undefined,
    withExclusiveTransactionAsync: async (work: (tx: unknown) => Promise<void>) => { raw.exec('BEGIN IMMEDIATE'); try { await work(db); raw.exec('COMMIT') } catch (error) { raw.exec('ROLLBACK'); throw error } },
  } as unknown as SQLite.SQLiteDatabase
  await migrateLibrary(db, async () => undefined)
  const { controllerProfileId: _oldProfile, ...show } = sampleShow
  await new SqliteShowRepository(db).save(show)
  jest.mocked(SQLite.openDatabaseAsync).mockResolvedValue(db)
})
afterEach(() => { setCriticalSessionActive(false); raw.close() })

const preparationIdentity = (): Pick<RunSnapshot, 'showId' | 'setId' | 'revisionId'> => ({ showId: app.show!.id, setId: app.set!.id, revisionId: app.show!.revisionId })
function resetNativeCalls() { mockPrepared.length = 0; mockConfigured.length = 0; mockDispatched.length = 0; mockControllerStop.mockClear(); mockControllerStart.mockClear(); mockConfigureProfile.mockClear() }
async function incompleteProfile() {
  await act(async () => { await app.library.saveControllerProfile(completeProfile, sampleShow.id); await app.removeControllerBinding(panic, sampleShow.id) })
  resetNativeCalls()
}
const durableRows = () => ['shows', 'show_revisions', 'media_assets', 'controller_profiles', 'library_settings'].map((table) => raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())
const importedHit: ControllerBinding = { adapterId: 'unbound', deviceId: 'logical-device-1', inputKey: 'KEYCODE_H', command: { type: 'TRIGGER_HIT', cueId: 'reveal' } }
async function mappedHitProfile(binding: ControllerBinding = importedHit) {
  await act(async () => { await app.library.saveControllerProfile({ ...completeProfile, bindings: [...completeProfile.bindings, binding] }, sampleShow.id) })
  resetNativeCalls()
}

it.each(['newer GO', 'different Hit', 'unrelated input'] as const)('refuses a queued captured removal instead of overwriting a %s profile update', async (change) => {
  const screen = await mount(); await mappedHitProfile(); const previous = sqlProfile()!
  const newer = change === 'newer GO' ? { ...importedHit, command: { type: 'GO' as const } }
    : change === 'different Hit' ? { ...importedHit, command: { type: 'TRIGGER_HIT' as const, cueId: 'bed' } }
      : { ...go, inputKey: 'KEYCODE_N', command: { type: 'PAUSE_RESUME' as const } }
  const bindings = change === 'unrelated input' ? [...previous.bindings, newer] : [...previous.bindings.filter((binding) => binding.inputKey !== importedHit.inputKey), newer]
  await act(async () => {
    const queued = app.library.saveControllerProfile({ ...previous, bindings })
    const removing = app.removeControllerBinding(importedHit, sampleShow.id)
    await queued; await expect(removing).rejects.toThrow('STALE_REVISION')
  })
  expect(sqlProfile()!.bindings).toEqual(bindings); expect(mockConfigureProfile).not.toHaveBeenCalled(); screen.unmount()
})

it('rejects removal if a queued selection changes the captured show before its transaction', async () => {
  const screen = await mount(); await mappedHitProfile(); let otherId = ''
  await act(async () => { otherId = (await app.library.createShow('Another selected show')).id; await app.library.select(sampleShow.id) })
  const before = sqlProfile(); resetNativeCalls()
  await act(async () => { const selection = app.library.select(otherId); const removal = app.removeControllerBinding(importedHit, sampleShow.id); await selection; await expect(removal).rejects.toThrow('STALE_REVISION') })
  expect(sqlProfile()).toEqual(before); expect(app.libraryState.selectedShowId).toBe(otherId); expect(mockConfigureProfile).not.toHaveBeenCalled(); screen.unmount()
})

it('compares the full expected profile semantically inside SQL without depending on object key order', async () => {
  const screen = await mount(); await mappedHitProfile(); const expected = sqlProfile()!
  const reorderedKeys = { bindings: expected.bindings.map((binding) => ({ command: 'cueId' in binding.command ? { cueId: binding.command.cueId, type: binding.command.type } : { type: binding.command.type }, inputKey: binding.inputKey, ...(binding.deviceId ? { deviceId: binding.deviceId } : {}), ...(binding.adapterId ? { adapterId: binding.adapterId } : {}) })), name: expected.name, id: expected.id }
  raw.prepare('UPDATE controller_profiles SET profile_json = ? WHERE id = ?').run(JSON.stringify(reorderedKeys), expected.id)
  await act(async () => { await app.removeControllerBinding(importedHit, sampleShow.id) })
  expect(sqlProfile()!.bindings).toEqual(completeProfile.bindings); screen.unmount()
})

it.each(['GO', 'PANIC_FADE', 'TRIGGER_HIT', 'PLAY', 'SELECT'] as const)('refuses a stale semantic command after its physical input becomes %s', async (type) => {
  const screen = await mount(); await mappedHitProfile(); const changed: ControllerBinding = { ...importedHit, command: type === 'TRIGGER_HIT' || type === 'PLAY' || type === 'SELECT' ? { type, cueId: 'bed' } : { type } }
  await act(async () => { await app.library.saveControllerProfile({ ...sqlProfile()!, bindings: [...completeProfile.bindings, changed] }) })
  const before = durableRows(); resetNativeCalls()
  await act(async () => { await expect(app.removeControllerBinding(importedHit, sampleShow.id)).rejects.toThrow('STALE_REVISION') })
  expect(durableRows()).toEqual(before); expect(mockConfigureProfile).not.toHaveBeenCalled(); screen.unmount()
})

it('removes only duplicate rows of the exact imported command, preserving a different target and safety bindings', async () => {
  const screen = await mount(); await mappedHitProfile(); const different = { ...importedHit, command: { type: 'TRIGGER_HIT' as const, cueId: 'bed' } }
  await act(async () => { await app.library.saveControllerProfile({ ...sqlProfile()!, bindings: [...completeProfile.bindings, importedHit, importedHit, different] }); await app.removeControllerBinding(importedHit, sampleShow.id) })
  expect(sqlProfile()!.bindings).toEqual([...completeProfile.bindings, different]); screen.unmount()
})

it('keeps a durable exact removal successful when native refresh fails, without registering deletion as Retry', async () => {
  const screen = await mount(); await mappedHitProfile(); mockConfigureProfile.mockRejectedValueOnce(new Error('Native profile refresh failed'))
  await act(async () => { expect(await app.runTask(() => app.removeControllerBinding(importedHit, sampleShow.id))).toBe(true) })
  expect(sqlProfile()!.bindings).toEqual(completeProfile.bindings); expect(app.error).toContain('CONTROLLER_SETUP_FAILED')
  const before = durableRows(); await act(async () => { expect(await app.retryLastTask()).toBe(false) })
  expect(durableRows()).toEqual(before); expect(mockConfigureProfile).toHaveBeenCalledTimes(1); screen.unmount()
})

it('removes a captured mapping locally with the optional controller module absent', async () => {
  const screen = await mount(); await mappedHitProfile(); mockControllerAvailable = false
  await act(async () => { await app.removeControllerBinding(importedHit, sampleShow.id) })
  expect(sqlProfile()!.bindings).toEqual(completeProfile.bindings); expect(mockConfigureProfile).not.toHaveBeenCalled(); screen.unmount()
})

it('does not publish or refresh native mappings when the exact profile save fails', async () => {
  const screen = await mount(); await mappedHitProfile(); const before = durableRows(); mockFailProfile = true
  await act(async () => { await expect(app.removeControllerBinding(importedHit, sampleShow.id)).rejects.toThrow('SQLITE_FULL') })
  expect(durableRows()).toEqual(before); expect(app.libraryState.controllerProfiles.find((profile) => profile.id === profileId)!.bindings).toEqual([...completeProfile.bindings, importedHit]); expect(mockConfigureProfile).not.toHaveBeenCalled(); screen.unmount()
})

it.each(['TRIGGER_HIT', 'PLAY', 'SELECT'] as const)('loads and explicitly repairs an older invalid %s profile without making the library unavailable', async (type) => {
  const screen = await mount(); const stale: ControllerBinding = { ...importedHit, command: { type, cueId: 'missing-target' } }
  await act(async () => { await app.library.saveControllerProfile(completeProfile, sampleShow.id); await app.library.saveControllerProfile({ ...completeProfile, bindings: [...completeProfile.bindings, stale] }) })
  screen.unmount(); const replacement = await mount(); expect(app.libraryState.status).toBe('ready')
  const before = durableRows(); resetNativeCalls()
  await act(async () => { expect(await app.prepareTouchSession('rehearsal', preparationIdentity())).toBe(true) })
  expect(app.session.snapshot?.controllerProfile).toBeUndefined(); expect(mockPrepared).toHaveLength(1); expect(durableRows()).toEqual(before)
  await act(async () => { await app.exitShow(); await app.removeControllerBinding(stale, sampleShow.id) })
  expect(sqlProfile()!.bindings).toEqual(completeProfile.bindings)
  expect(compileRunSnapshot(app.show!, app.set!.id, app.libraryState.controllerProfiles).ok).toBe(true); replacement.unmount()
})

it.each(['new playlist', 'duplicate playlist', 'delete Hit', 'move Hit to main'] as const)('saves %s without deleting its saved mappings, then refuses unsafe preparation', async (operation) => {
  const screen = await mount(); await mappedHitProfile(); const beforeProfile = sqlProfile()!
  const beforeMedia = raw.prepare('SELECT * FROM media_assets ORDER BY id').all()
  await act(async () => {
    if (operation === 'new playlist') await app.library.createSet(sampleShow.id, 'Unmapped next playlist')
    else if (operation === 'duplicate playlist') await app.library.duplicateSet(sampleShow.id, app.set!.id)
    else if (operation === 'delete Hit') await app.library.removeCue(sampleShow.id, 'reveal')
    else await app.library.saveShow({ ...app.show!, sets: app.show!.sets.map((set) => ({ ...set, hitCueIds: set.hitCueIds.filter((id) => id !== 'reveal'), cueOrder: [...set.cueOrder, 'reveal'] })) })
  })
  const saved = sqlShow()
  expect(saved).toEqual(app.show); expect(saved.controllerProfileId).toBe(beforeProfile.id)
  expect(sqlProfile()).toEqual(beforeProfile); expect(raw.prepare('SELECT * FROM media_assets ORDER BY id').all()).toEqual(beforeMedia)
  expect(compileRunSnapshot(saved, app.set!.id, [beforeProfile]).ok).toBe(false)
  if (operation === 'new playlist') expect(app.set!.cueOrder).toEqual([])
  if (operation === 'duplicate playlist') { expect(app.set!.hitCueIds).toHaveLength(1); expect(app.set!.hitCueIds).not.toContain('reveal') }
  if (operation === 'delete Hit') expect(saved.cues.reveal).toBeUndefined()
  if (operation === 'move Hit to main') { expect(app.set!.hitCueIds).not.toContain('reveal'); expect(app.set!.cueOrder).toContain('reveal') }
  expect(mockPrepared).toEqual([]); expect(mockDispatched).toEqual([]); expect(mockConfigureProfile).not.toHaveBeenCalled(); screen.unmount()
})

it('keeps history and unrelated edits usable after removing a required mapping without changing the incomplete profile', async () => {
  const screen = await mount(); await incompleteProfile(); const profile = sqlProfile()!; const revisionId = app.show!.revisionId
  await act(async () => { await app.library.renameShow(sampleShow.id, 'Edited while learning'); await app.library.restoreRevision(sampleShow.id, revisionId) })
  expect(sqlShow().name).toBe(sampleShow.name); expect(sqlProfile()).toEqual(profile)
  expect(compileRunSnapshot(app.show!, app.set!.id, [profile]).ok).toBe(false)
  const committed = durableRows()
  await act(async () => { expect(await app.beginRehearsal()).toBe(false) })
  expect(durableRows()).toEqual(committed); expect(mockPrepared).toEqual([]); expect(mockDispatched).toEqual([]); screen.unmount()
})

it('rolls back invalid content and a failed save while retaining incomplete controller mappings and history', async () => {
  const screen = await mount(); await incompleteProfile(); const before = durableRows()
  await act(async () => { await expect(app.library.updateCue(sampleShow.id, 'opening', { trimInMs: 90000 })).rejects.toThrow() })
  expect(durableRows()).toEqual(before); mockFailShow = true
  await act(async () => { await expect(app.library.renameShow(sampleShow.id, 'Failed save')).rejects.toThrow('SQLITE_FULL') })
  expect(durableRows()).toEqual(before); expect(mockPrepared).toEqual([]); expect(mockDispatched).toEqual([]); screen.unmount()
})

it('still allows explicitly repairing a mapped Hit before deletion and discloses shared profile scope', async () => {
  const screen = await mount(); await mappedHitProfile(); let duplicateId = ''
  await act(async () => { duplicateId = (await app.library.duplicateShow(sampleShow.id)).id })
  const original = app.libraryState.shows.find((show) => show.id === sampleShow.id)!
  expect(app.show!.controllerProfileId).toBe(original.controllerProfileId)
  await act(async () => { await app.removeControllerBinding(importedHit, duplicateId); await app.library.removeCue(duplicateId, 'reveal'); await app.library.createSet(duplicateId, 'Independent next playlist') })
  expect(app.libraryState.controllerProfiles.find((profile) => profile.id === profileId)!.bindings).toEqual(completeProfile.bindings)
  expect(app.libraryState.shows.find((show) => show.id === sampleShow.id)!.cues.reveal).toBeDefined()
  expect(app.libraryState.shows.find((show) => show.id === sampleShow.id)!.controllerProfileId).toBe(profileId)
  expect(app.show!.cues.reveal).toBeUndefined(); expect(app.show!.sets).toHaveLength(2); screen.unmount()
})

it('recovers the actual deleted-mapping workflow through explicit touch preparation without changing saved data', async () => {
  const screen = await mount(true)
  await act(async () => { await app.library.saveControllerProfile(completeProfile, sampleShow.id) })
  fireEvent.press(screen.getByRole('button', { name: messages.en['use.remote.buttons'] }))
  for (const action of ['GO', 'PANIC_FADE'] as const) {
    const binding = action === 'GO' ? go : panic
    const name = messages.en['remote.removeBinding'].replace('{action}', messages.en[`command.${action}`]).replace('{button}', controllerInputLabel(binding, (key) => messages.en[key]).full)
    fireEvent.press(screen.getByRole('button', { name }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.delete'] }))
    await waitFor(() => expect(app.busy).toBe(false)); expect(app.error).toBeNull()
    await waitFor(() => expect(screen.queryByRole('button', { name: messages.en['common.delete'] })).toBeNull())
  }
  expect(sqlProfile()?.bindings).toEqual([]); expect(app.show!.controllerProfileId).toBe(profileId)
  await act(async () => { expect(await app.beginRehearsal()).toBe(false) })
  expect(app.error).toContain('requires separate GO and Panic Fade bindings')
  const before = durableRows(); resetNativeCalls()
  await act(async () => { expect(await app.prepareTouchSession('rehearsal', preparationIdentity())).toBe(true) })
  expect(app.session.phase).toBe('ready'); expect(app.session.snapshot?.controllerProfile).toBeUndefined()
  expect((mockPrepared[0] as RunSnapshot).controllerProfile).toBeUndefined(); expect(mockDispatched).toEqual([])
  expect(mockControllerStop).toHaveBeenCalledTimes(1); expect(mockConfigured).toEqual([expect.objectContaining({ bindings: [] })]); expect(mockControllerStart).not.toHaveBeenCalled()
  expect(durableRows()).toEqual(before)
  await act(async () => { expect(app.go()).not.toBeNull() }); expect(mockDispatched.map((command) => command.type)).toEqual(['GO'])
  await act(async () => { await app.exitShow() }); screen.unmount()
})

it('retains performance confirmations and defaults back to assigned mode after a touch session', async () => {
  const screen = await mount(); await incompleteProfile(); const expected = preparationIdentity(); const before = durableRows()
  await act(async () => { expect(await app.prepareTouchSession('performance', expected)).toBe(false); app.toggleCheck('local'); app.toggleCheck('readable') })
  await act(async () => { expect(await app.prepareTouchSession('performance', expected)).toBe(false); app.toggleCheck('order') })
  expect(mockPrepared).toEqual([])
  await act(async () => { expect(await app.prepareTouchSession('performance', expected)).toBe(true) })
  expect(app.session.sessionPurpose).toBe('performance'); expect(app.session.snapshot?.controllerProfile).toBeUndefined(); expect(mockDispatched).toEqual([])
  await act(async () => { await app.exitShow(); expect(await app.armShow()).toBe(false) })
  expect(app.error).toContain('requires separate GO and Panic Fade bindings'); expect(mockPrepared).toHaveLength(1); expect(durableRows()).toEqual(before); screen.unmount()
})

it.each(['stop', 'clear'] as const)('fails closed on native controller %s failure and rechecks admission for explicit Retry', async (failure) => {
  const screen = await mount(); await incompleteProfile(); const expected = preparationIdentity(); const before = durableRows()
  if (failure === 'stop') mockControllerStop.mockRejectedValueOnce(new Error('Native stop failed'))
  else mockConfigureProfile.mockRejectedValueOnce(new Error('Native clear failed'))
  await act(async () => { expect(await app.prepareTouchSession('rehearsal', expected)).toBe(false) })
  expect(mockPrepared).toEqual([]); expect(mockDispatched).toEqual([]); expect(durableRows()).toEqual(before)
  await act(async () => { expect(await app.retryLastTask()).toBe(true) })
  expect(mockPrepared).toHaveLength(1); expect((mockPrepared[0] as RunSnapshot).controllerProfile).toBeUndefined(); expect(mockControllerStart).not.toHaveBeenCalled()
  await act(async () => { await app.exitShow() }); screen.unmount()
})

it('prepares touch recovery with native audio when the optional controller module is unavailable', async () => {
  const screen = await mount(); await incompleteProfile(); mockControllerAvailable = false
  await act(async () => { expect(await app.prepareTouchSession('rehearsal', preparationIdentity())).toBe(true) })
  expect(mockPrepared).toHaveLength(1); expect(mockControllerStop).not.toHaveBeenCalled(); expect(mockConfigureProfile).not.toHaveBeenCalled(); expect(mockControllerStart).not.toHaveBeenCalled()
  expect(app.session.snapshot?.controllerProfile).toBeUndefined(); expect(mockDispatched).toEqual([])
  await act(async () => { await app.exitShow() }); screen.unmount()
})

it.each(['showId', 'setId', 'revisionId'] as const)('rejects stale touch consent for %s before touching native ownership', async (field) => {
  const screen = await mount(); await incompleteProfile()
  await act(async () => { expect(await app.prepareTouchSession('rehearsal', { ...preparationIdentity(), [field]: 'stale' })).toBe(false) })
  expect(app.error).toBe('STALE_REVISION'); expect(mockPrepared).toEqual([]); expect(mockControllerStop).not.toHaveBeenCalled(); screen.unmount()
})

it.each(['trim', 'media', 'cue'] as const)('retains canonical %s validation in touch preparation', async (failure) => {
  const screen = await mount(); await incompleteProfile(); screen.unmount()
  const invalid = sqlShow(); const opening = invalid.cues.opening
  if (opening?.type !== 'audio') throw new Error('Audio fixture required')
  const changed = failure === 'trim' ? { ...invalid, cues: { ...invalid.cues, opening: { ...opening, trimInMs: 60000, trimOutMs: 1 } } }
    : failure === 'media' ? { ...invalid, media: Object.fromEntries(Object.entries(invalid.media).filter(([id]) => id !== opening.mediaAssetId)) }
      : { ...invalid, cues: Object.fromEntries(Object.entries(invalid.cues).filter(([id]) => id !== opening.id)) }
  raw.prepare('UPDATE shows SET document_json = ? WHERE id = ?').run(JSON.stringify(changed), invalid.id)
  const replacement = await mount(); resetNativeCalls(); const before = durableRows()
  await act(async () => { expect(await app.prepareTouchSession('rehearsal', preparationIdentity())).toBe(false) })
  expect(app.error).not.toBeNull(); expect(mockPrepared).toEqual([]); expect(mockControllerStop).not.toHaveBeenCalled(); expect(durableRows()).toEqual(before); replacement.unmount()
})

it('keeps normal safety gates and admits only one pending touch preparation', async () => {
  const screen = await mount(); await incompleteProfile(); const expected = preparationIdentity()
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
  await act(async () => { expect(await app.prepareTouchSession('rehearsal', expected)).toBe(false) })
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' }); setCriticalSessionActive(true)
  await act(async () => { expect(await app.prepareTouchSession('rehearsal', expected)).toBe(false) }); setCriticalSessionActive(false)
  let finishSettings!: () => void; let settings!: Promise<void>
  act(() => { settings = withDeviceSettingsAction(() => new Promise<void>((resolve) => { finishSettings = resolve })) })
  await act(async () => { expect(await app.prepareTouchSession('rehearsal', expected)).toBe(false); finishSettings(); await settings })
  expect(mockPrepared).toEqual([]); expect(mockControllerStop).not.toHaveBeenCalled()
  let release!: () => void; mockControllerStop.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
  let first!: Promise<boolean>; act(() => { first = app.prepareTouchSession('rehearsal', expected) })
  await waitFor(() => expect(mockControllerStop).toHaveBeenCalledTimes(1))
  await act(async () => { expect(await app.prepareTouchSession('rehearsal', expected)).toBe(false); release(); expect(await first).toBe(true) })
  expect(mockPrepared).toHaveLength(1); await act(async () => { await app.exitShow() }); screen.unmount()
})

it.each(['selection', 'busy', 'background'] as const)('revalidates %s before a failed touch preparation is explicitly retried', async (change) => {
  const screen = await mount(); await incompleteProfile(); const expected = preparationIdentity()
  mockControllerStop.mockRejectedValueOnce(new Error('Initial controller stop failed'))
  await act(async () => { expect(await app.prepareTouchSession('rehearsal', expected)).toBe(false) })
  expect(mockControllerStop).toHaveBeenCalledTimes(1)
  let release!: () => void; let pending: Promise<boolean> | undefined
  if (change === 'selection') {
    await act(async () => {
      const other = await app.library.createShow('A different touch target')
      await app.library.saveShow({ ...other, cues: sampleShow.cues, media: sampleShow.media, sets: [{ ...other.sets[0]!, cueOrder: sampleShow.sets[0]!.cueOrder, hitCueIds: sampleShow.sets[0]!.hitCueIds }] })
    })
  } else if (change === 'busy') act(() => { pending = app.runTask(() => new Promise<void>((resolve) => { release = resolve })) })
  else Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
  await act(async () => { expect(await app.retryLastTask()).toBe(false) })
  expect(mockPrepared).toEqual([]); expect(mockControllerStop).toHaveBeenCalledTimes(1); expect(mockConfigureProfile).not.toHaveBeenCalled()
  if (change === 'selection') expect(app.error).toBe('STALE_REVISION')
  if (pending) await act(async () => { release(); await pending })
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' }); screen.unmount()
})

it.each(['missing', 'duplicate'] as const)('permits explicit touch preparation for a %s attached profile without repairing stored mappings', async (failure) => {
  if (failure === 'missing') {
    const source = sqlShow(); raw.prepare('UPDATE shows SET document_json = ? WHERE id = ?').run(JSON.stringify({ ...source, controllerProfileId: 'missing-profile' }), source.id)
  }
  const screen = await mount()
  if (failure === 'duplicate') await act(async () => { await app.library.saveControllerProfile(completeProfile, sampleShow.id); await app.library.saveControllerProfile({ ...completeProfile, bindings: [go, go, panic] }) })
  resetNativeCalls(); const before = durableRows()
  await act(async () => { expect(await app.prepareTouchSession('rehearsal', preparationIdentity())).toBe(true) })
  expect(app.session.snapshot?.controllerProfile).toBeUndefined(); expect(durableRows()).toEqual(before); expect(mockPrepared).toHaveLength(1)
  await act(async () => { await app.exitShow() }); screen.unmount()
})

it('does not resurrect saved mappings when a profile-free native snapshot is reconciled after remount', async () => {
  const first = await mount(); await incompleteProfile(); const before = durableRows()
  await act(async () => { expect(await app.prepareTouchSession('rehearsal', preparationIdentity())).toBe(true) })
  const snapshot = app.session.snapshot!
  mockExistingSession = { snapshotJson: JSON.stringify({ ...snapshot, sessionPurpose: 'rehearsal' }), commandIdWatermark: 10,
    state: { type: 'RUN_STATE', showId: snapshot.showId, setId: snapshot.setId, revisionId: snapshot.revisionId, generation: 3, sessionPurpose: 'rehearsal', phase: 'ready', transportMode: snapshot.transportMode ?? 'legacyCueStack', selectedCueId: snapshot.cueOrder[0]!, currentCueId: '', nextCueId: snapshot.cueOrder[0]!, currentCueIndex: -1, nextCueIndex: 0, activeVoiceCount: 0, countdownRemainingMs: 0 } }
  first.unmount(); const replacement = await mount()
  expect(app.session.snapshot?.controllerProfile).toBeUndefined(); expect(app.liveSession).toBe(true); expect(mockPrepared).toHaveLength(1)
  // Native empty-profile input remains unhandled. JS must not use the saved
  // GO binding as a substitute for the deliberately absent snapshot profile.
  await act(async () => { mockInput({ ...panicInput, eventId: 'fresh:go', inputKey: go.inputKey, diagnosticMode: 'off', diagnosticSessionId: '', handledNatively: false }); mockInput({ ...panicInput, eventId: 'media:next', adapterId: 'system-media', deviceId: 'system-media', inputKey: 'MEDIA_NEXT', diagnosticMode: 'off', diagnosticSessionId: '', handledNatively: true }) })
  expect(mockDispatched).toEqual([]); expect(durableRows()).toEqual(before)
  await act(async () => { expect(app.go()).not.toBeNull() }); expect(mockDispatched.map((command) => command.type)).toEqual(['GO'])
  await act(async () => { await app.exitShow() }); replacement.unmount()
})

it('rolls back a failed first attachment, then saves and prepares the same mappings through an explicit retry', async () => {
  const screen = await mount(true)
  await act(async () => { await app.library.saveControllerProfile({ ...completeProfile, bindings: [go] }) })
  fireEvent.press(screen.getByRole('button', { name: messages.en['use.remote.buttons'] }))
  fireEvent.press(screen.getByRole('button', { name: messages.en['remote.learn'].replace('{action}', messages.en['command.PANIC_FADE']) }))
  await waitFor(() => expect(screen.getByRole('button', { name: messages.en['remote.save'] })).toBeDisabled())
  await act(async () => { mockInput(panicInput) })
  expect(screen.getByRole('button', { name: messages.en['remote.save'] })).toBeEnabled()
  const originalRevision = app.show!.revisionId
  mockFailShow = true
  fireEvent.press(screen.getByRole('button', { name: messages.en['remote.save'] }))
  await waitFor(() => expect(app.error).toContain('SQLITE_FULL'))
  expect(sqlProfile()?.bindings).toEqual([go])
  expect(app.libraryState.controllerProfiles.find((value) => value.id === profileId)?.bindings).toEqual([go])
  expect(sqlShow().revisionId).toBe(originalRevision); expect(app.show!.controllerProfileId).toBeUndefined()
  await waitFor(() => expect(screen.getByRole('button', { name: messages.en['remote.save'] })).toBeEnabled())
  mockFailShow = false
  fireEvent.press(screen.getByRole('button', { name: messages.en['remote.save'] }))
  await waitFor(() => expect(app.busy).toBe(false))
  expect(app.error).toBeNull()
  await waitFor(() => expect(screen.queryByRole('button', { name: messages.en['remote.save'] })).toBeNull())
  expect(sqlProfile()?.bindings).toEqual([go, panic]); expect(sqlShow().controllerProfileId).toBe(profileId)
  expect(app.show!.controllerProfileId).toBe(profileId); expect(app.show!.revisionId).not.toBe(originalRevision)
  expect(screen.queryByText(messages.en['controllers.incomplete'])).toBeNull()
  // Reopening the real store retains the association rather than resolving a UI-only fallback.
  const reopened = createLibraryStore(); await reopened.initialize()
  expect(reopened.getSnapshot().controllerProfiles.find((value) => value.id === profileId)?.bindings).toEqual([go, panic])
  expect(reopened.getSnapshot().shows.find((value) => value.id === sampleShow.id)?.controllerProfileId).toBe(profileId)
  mockConfigured.length = 0
  await act(async () => { expect(await app.beginRehearsal()).toBe(true) })
  expect(mockConfigured).toEqual([expect.objectContaining({ id: profileId, bindings: [go, panic] })])
  expect(mockPrepared).toEqual([expect.objectContaining({ controllerProfile: expect.objectContaining({ id: profileId, bindings: [go, panic] }) })])
  await act(async () => { await app.exitShow() }); screen.unmount()
})

it('keeps incomplete mappings saveable without attaching them or changing the show revision', async () => {
  const screen = await mount(); const originalRevision = app.show!.revisionId
  await act(async () => { await app.library.saveControllerProfile({ ...completeProfile, bindings: [go] }, sampleShow.id) })
  expect(sqlProfile()?.bindings).toEqual([go]); expect(sqlShow().controllerProfileId).toBeUndefined()
  expect(app.show!.revisionId).toBe(originalRevision); screen.unmount()
})

it('preserves linked-profile edits and removals without replacing the show revision', async () => {
  const screen = await mount()
  await act(async () => { await app.library.saveControllerProfile(completeProfile, sampleShow.id) })
  const originalRevision = app.show!.revisionId
  const extra = { ...go, inputKey: 'KEYCODE_ENTER', command: { type: 'PAUSE_RESUME' as const } }
  await act(async () => { await app.library.saveControllerProfile({ ...completeProfile, bindings: [go, panic, extra] }, sampleShow.id); await app.removeControllerBinding(extra, sampleShow.id) })
  expect(sqlProfile()?.bindings).toEqual([go, panic]); expect(app.show!.controllerProfileId).toBe(profileId)
  expect(app.show!.revisionId).toBe(originalRevision); expect(sqlShow().revisionId).toBe(originalRevision)
  const compiled = compileRunSnapshot(app.show!, app.set!.id, app.libraryState.controllerProfiles)
  expect(compiled.ok && compiled.snapshot.controllerProfile?.bindings).toEqual([go, panic]); screen.unmount()
})

it('rejects a queued assignment after the selected show changes without saving or linking either show', async () => {
  const screen = await mount(); let otherId = ''
  await act(async () => { const other = await app.library.createShow('Another controller target'); otherId = other.id; await app.library.select(sampleShow.id) })
  await act(async () => { const selection = app.library.select(otherId); const assigning = app.library.saveControllerProfile(completeProfile, sampleShow.id); await selection; await expect(assigning).rejects.toThrow('STALE_REVISION') })
  expect(sqlProfile()).toBeUndefined(); expect(sqlShow().controllerProfileId).toBeUndefined()
  expect(app.libraryState.selectedShowId).toBe(otherId); expect(app.show!.controllerProfileId).toBeUndefined(); screen.unmount()
})

it('rejects a mismatched profile identity for the captured show before persistence', async () => {
  const screen = await mount()
  await act(async () => { await expect(app.library.saveControllerProfile({ ...completeProfile, id: 'another-profile' }, sampleShow.id)).rejects.toThrow('STALE_REVISION') })
  expect(raw.prepare('SELECT id FROM controller_profiles').all()).toEqual([])
  expect(sqlShow().controllerProfileId).toBeUndefined(); screen.unmount()
})

it('rolls back both records when preparation wins before the controller transaction commits', async () => {
  const screen = await mount(); const originalRevision = app.show!.revisionId; mockCriticalAfterProfile = true
  await act(async () => { await expect(app.library.saveControllerProfile(completeProfile, sampleShow.id)).rejects.toThrow('library.armed') })
  expect(sqlProfile()).toBeUndefined(); expect(sqlShow().controllerProfileId).toBeUndefined()
  expect(app.libraryState.controllerProfiles).toEqual([]); expect(app.show!.revisionId).toBe(originalRevision)
  mockCriticalAfterProfile = false; setCriticalSessionActive(false); screen.unmount()
})
