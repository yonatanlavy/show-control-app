import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as Sharing from 'expo-sharing'
import * as SQLite from 'expo-sqlite'
import * as DocumentPicker from 'expo-document-picker'
import { I18nProvider, messages } from '../../i18n'
import { createLibraryStore } from '../../library/store'
import { newAudioCue, newShow } from '../../library/operations'
import type { LibraryStore } from '../../library/types'
import { setCriticalSessionActive } from '../../runtime/critical-session-gate'
import { ensureLibraryDirectories, libraryDirectory } from '../../storage/media-files'
import { migrateLibrary, SqliteShowRepository } from '../../storage/sqlite'
import { BackupPanel } from '../BackupPanel'

let mockDocumentUri = ''
let mockLibrary: LibraryStore
let mockRetry: (() => Promise<unknown>) | null
let mockFailure: unknown
let mockActiveTasks: number
let mockDelayStart: Promise<void> | null
const mockCapturedWork: (() => Promise<unknown>)[] = []
const mockRunTask = async (work: () => Promise<unknown>) => {
  mockActiveTasks += 1; mockFailure = null; mockCapturedWork.push(work)
  if (mockDelayStart) await mockDelayStart
  try { await work(); if (mockRetry === work) mockRetry = null; return true }
  catch (error) {
    if (!(error instanceof Error && error.name === 'AbortError')) { mockFailure = error; mockRetry = work }
    else if (mockRetry === work) mockRetry = null
    return false
  } finally { mockActiveTasks -= 1 }
}
jest.mock('../AppProvider', () => ({ useApp: () => ({
  library: mockLibrary,
  libraryState: jest.requireActual<typeof import('react')>('react').useSyncExternalStore(mockLibrary.subscribe, mockLibrary.getSnapshot, mockLibrary.getSnapshot),
  busy: false, runTask: mockRunTask,
}) }))
jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual<typeof import('node:crypto')>('node:crypto').randomUUID() }))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }))
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(), backupDatabaseAsync: jest.fn() }))
jest.mock('../../../modules/show-audio', () => ({ __esModule: true, default: {
  probeMedia: async () => ({ durationMs: 30000, codec: 'pcm', channels: 1, sampleRate: 44100 }),
  sha256File: async (uri: string) => jest.requireActual<typeof import('node:crypto')>('node:crypto').createHash('sha256').update(jest.requireActual<typeof import('node:fs')>('node:fs').readFileSync(jest.requireActual<typeof import('node:url')>('node:url').fileURLToPath(uri))).digest('hex'),
} }))
jest.mock('../../../modules/show-visual', () => ({ __esModule: true, default: { probeVisual: jest.fn() } }))
jest.mock('expo-file-system', () => {
  const fs = jest.requireActual<typeof import('node:fs')>('node:fs'); const url = jest.requireActual<typeof import('node:url')>('node:url')
  const uri = (parts: (string | { uri: string })[]) => parts.map((part) => typeof part === 'string' ? part : part.uri).reduce((base, part) => `${base.replace(/\/$/, '')}/${part}`, '').slice(1)
  class File {
    uri: string; constructor(...parts: (string | { uri: string })[]) { this.uri = uri(parts) }
    get name() { return this.uri.split('/').at(-1)! } get exists() { return fs.existsSync(url.fileURLToPath(this.uri)) } get size() { return fs.statSync(url.fileURLToPath(this.uri)).size }
    create() { const path = url.fileURLToPath(this.uri); fs.mkdirSync(jest.requireActual<typeof import('node:path')>('node:path').dirname(path), { recursive: true }); fs.writeFileSync(path, new Uint8Array(), { flag: 'wx' }) }
    async copy(destination: File) { fs.copyFileSync(url.fileURLToPath(this.uri), url.fileURLToPath(destination.uri)) }
    async move(destination: File) { fs.renameSync(url.fileURLToPath(this.uri), url.fileURLToPath(destination.uri)); this.uri = destination.uri }
    delete() { fs.unlinkSync(url.fileURLToPath(this.uri)) } info() { return { modificationTime: fs.statSync(url.fileURLToPath(this.uri)).mtimeMs } }
    open() { const fd = fs.openSync(url.fileURLToPath(this.uri), 'r+'); return { offset: 0, readBytes(length: number) { const data = Buffer.alloc(length); const count = fs.readSync(fd, data, 0, length, this.offset); this.offset += count; return data.subarray(0, count) }, writeBytes(bytes: Uint8Array) { fs.writeSync(fd, bytes, 0, bytes.length, this.offset); this.offset += bytes.length }, close() { fs.closeSync(fd) } } }
  }
  class Directory {
    uri: string; constructor(...parts: (string | { uri: string })[]) { this.uri = uri(parts) }
    get name() { return this.uri.split('/').filter(Boolean).at(-1)! } get exists() { return fs.existsSync(url.fileURLToPath(this.uri)) }
    create() { fs.mkdirSync(url.fileURLToPath(this.uri), { recursive: true }) } info() { return { modificationTime: fs.statSync(url.fileURLToPath(this.uri)).mtimeMs } }
    list() { return fs.readdirSync(url.fileURLToPath(this.uri)).map((name) => fs.statSync(url.fileURLToPath(`${this.uri}/${name}`)).isDirectory() ? new Directory(this, name) : new File(this, name)) }
    delete() { fs.rmSync(url.fileURLToPath(this.uri), { recursive: true }) }
  }
  return { Directory, File, Paths: { get document() { return mockDocumentUri }, availableDiskSpace: 10_000_000_000 } }
})

interface ReadGate { readonly entered: () => void; readonly pending: Promise<void>; readonly failure: Error }
let taskRoot = ''; let raw: DatabaseSync
let mockReadGate: ReadGate | null; let mockGateAfterCommit: ReadGate | null; let mockPreferenceFailure: Error | null
beforeEach(async () => {
  jest.clearAllMocks(); setCriticalSessionActive(false); mockRetry = null; mockFailure = null; mockActiveTasks = 0
  mockDelayStart = null; mockCapturedWork.length = 0
  mockReadGate = null; mockGateAfterCommit = null; mockPreferenceFailure = null
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true); jest.mocked(Sharing.shareAsync).mockResolvedValue(undefined)
  taskRoot = mkdtempSync(join(tmpdir(), 'show-backup-recovery-')); mockDocumentUri = pathToFileURL(join(taskRoot, 'documents')).href; ensureLibraryDirectories()
  raw = new DatabaseSync(':memory:')
  const parameters = (args: unknown[]) => (Array.isArray(args[0]) ? args[0] : args) as (string | number | null)[]
  const db = {
    execAsync: async (sql: string) => raw.exec(sql),
    runAsync: async (sql: string, ...args: unknown[]) => {
      const values = parameters(args)
      if (mockPreferenceFailure && sql.includes('library_settings') && values[0] === 'preferences') throw mockPreferenceFailure
      return raw.prepare(sql).run(...values)
    },
    getFirstAsync: async (sql: string, ...args: unknown[]) => raw.prepare(sql).get(...parameters(args)) ?? null,
    getAllAsync: async (sql: string, ...args: unknown[]) => {
      const gate = mockReadGate
      if (gate && sql.startsWith('SELECT document_json FROM shows')) { gate.entered(); await gate.pending; throw gate.failure }
      return raw.prepare(sql).all(...parameters(args))
    },
    closeAsync: async () => undefined,
    withExclusiveTransactionAsync: async (work: (tx: unknown) => Promise<void>) => {
      raw.exec('BEGIN IMMEDIATE')
      try { await work(db); raw.exec('COMMIT'); if (mockGateAfterCommit) { mockReadGate = mockGateAfterCommit; mockGateAfterCommit = null } }
      catch (error) { raw.exec('ROLLBACK'); throw error }
    },
  } as unknown as SQLite.SQLiteDatabase
  await migrateLibrary(db, async () => undefined)
  const bytes = Buffer.alloc(600_000, 17); const checksum = createHash('sha256').update(bytes).digest('hex')
  const mediaPath = join(fileURLToPath(libraryDirectory().uri), 'media', `${checksum}.wav`); writeFileSync(mediaPath, bytes)
  const show = newShow('Backup recovery fixture', randomUUID, () => '2026-11-04T00:00:00Z'); const cue = newAudioCue('media', 'Opening', randomUUID)
  await new SqliteShowRepository(db).save({ ...show, sets: [{ ...show.sets[0]!, cueOrder: [cue.id] }], cues: { [cue.id]: cue }, media: { media: { id: 'media', localUri: pathToFileURL(mediaPath).href, checksumSha256: checksum, bytes: bytes.length, durationMs: 30000, codec: 'pcm', channels: 1, sampleRate: 44100 } } })
  jest.mocked(SQLite.openDatabaseAsync).mockResolvedValue(db); mockLibrary = createLibraryStore(); await mockLibrary.initialize()
})
afterEach(() => {
  raw.close()
  if (dirname(resolve(taskRoot)) !== resolve(tmpdir()) || !basename(taskRoot).startsWith('show-backup-recovery-')) throw new Error('Preserve unexpected fixture path')
  rmSync(taskRoot, { recursive: true, force: true })
})
const wrap = () => <I18nProvider><BackupPanel /></I18nProvider>
const settle = () => waitFor(() => expect(mockActiveTasks).toBe(0))

it('shares the already-created real ZIP through an explicit global Retry after navigation and late native failure', async () => {
  let fail!: (error: Error) => void; let finishRetry!: () => void
  jest.mocked(Sharing.shareAsync).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
    .mockImplementationOnce(() => new Promise<void>((resolve) => { finishRetry = resolve }))
  const exportSpy = jest.spyOn(mockLibrary, 'exportBackup')
  const shareSpy = jest.spyOn(mockLibrary, 'shareBackup')
  const screen = render(wrap()); fireEvent.press(screen.getByRole('button', { name: messages.en['library.backup'] }))
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1))
  const savedUri = jest.mocked(Sharing.shareAsync).mock.calls[0]![0]; const oldSignal = shareSpy.mock.calls[0]![1]!.signal!
  expect(existsSync(fileURLToPath(savedUri))).toBe(true)
  screen.unmount(); expect(oldSignal.aborted).toBe(true)
  await act(async () => { fail(new Error('Late native share failure')) }); await settle()
  expect(mockLibrary.getSnapshot().error).toBe('Late native share failure'); expect(mockRetry).not.toBeNull()
  const retry = mockRetry!; mockLibrary.clearError()
  // Both explicit presses join one attempt; neither repeats the file export.
  const firstRetry = mockRunTask(retry); const duplicateRetry = mockRunTask(retry)
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(2))
  await act(async () => { finishRetry(); await Promise.all([firstRetry, duplicateRetry]) })
  expect(Sharing.shareAsync).toHaveBeenCalledTimes(2)
  expect(Sharing.shareAsync).toHaveBeenLastCalledWith(savedUri, expect.any(Object))
  expect(exportSpy).toHaveBeenCalledTimes(1)
  expect(shareSpy.mock.calls[1]![1]!.signal).not.toBe(oldSignal)
  expect(shareSpy.mock.calls[1]![1]!.signal!.aborted).toBe(false)
  expect(oldSignal.aborted).toBe(true); expect(shareSpy).toHaveBeenCalledTimes(2)
  expect(mockLibrary.getSnapshot().error).toBeUndefined(); expect(mockRetry).toBeNull()
  expect(readdirSync(join(fileURLToPath(libraryDirectory().uri), 'backups'))).toHaveLength(1)
})

it('still retries a mounted ordinary share failure without exporting another archive', async () => {
  jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('Sharing unavailable'))
  const exportSpy = jest.spyOn(mockLibrary, 'exportBackup')
  const screen = render(wrap()); fireEvent.press(screen.getByRole('button', { name: messages.en['library.backup'] }))
  await waitFor(() => expect(screen.getByText(messages.en['backup.savedShareFailed'])).toBeTruthy())
  const savedUri = jest.mocked(Sharing.shareAsync).mock.calls[0]![0]
  fireEvent.press(screen.getByRole('button', { name: messages.en['backup.shareAgain'] })); await settle()
  expect(Sharing.shareAsync).toHaveBeenCalledTimes(2); expect(exportSpy).toHaveBeenCalledTimes(1)
  expect(Sharing.shareAsync).toHaveBeenLastCalledWith(savedUri, expect.any(Object)); expect(mockRetry).toBeNull()
})

it('opens a fresh restore picker when a late pre-commit failure is explicitly retried after navigation', async () => {
  let failPicker!: (failure: Error) => void
  jest.mocked(DocumentPicker.getDocumentAsync).mockImplementationOnce(() => new Promise((_resolve, reject) => { failPicker = reject }))
    .mockResolvedValueOnce({ canceled: true, assets: null })
  const imports = jest.spyOn(mockLibrary, 'importBackup')
  const before = mockLibrary.getSnapshot()
  const screen = render(wrap()); fireEvent.press(screen.getByRole('button', { name: messages.en['library.restore'] }))
  await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1))
  screen.unmount()
  await act(async () => failPicker(new Error('File provider closed after navigation'))); await settle()
  expect(mockLibrary.getSnapshot().error).toContain('File provider closed'); const retry = mockRetry!
  mockLibrary.clearError(); await act(async () => { await mockRunTask(retry) })
  expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(2)
  expect(imports.mock.calls[1]![1]!.signal).not.toBe(imports.mock.calls[0]![1]!.signal)
  expect(imports.mock.calls[1]![1]!.signal!.aborted).toBe(false)
  expect(mockLibrary.getSnapshot()).toEqual(before); expect(mockRetry).toBeNull()
})

it('retains the actual committed restore and its reload failure when navigation aborts during publication', async () => {
  const uri = await mockLibrary.exportBackup({ share: false })
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri, name: 'backup.zip', mimeType: 'application/zip', lastModified: 0 }] })
  let readStarted!: () => void; let releaseRead!: () => void
  const started = new Promise<void>((resolve) => { readStarted = resolve })
  mockGateAfterCommit = { entered: readStarted, pending: new Promise<void>((resolve) => { releaseRead = resolve }), failure: new Error('Post-commit library read failed') }
  const imports = jest.spyOn(mockLibrary, 'importBackup')
  const screen = render(wrap()); fireEvent.press(screen.getByRole('button', { name: messages.en['library.restore'] }))
  await act(async () => started); screen.unmount()
  await act(async () => releaseRead()); await settle()
  expect(mockLibrary.getSnapshot()).toMatchObject({ status: 'error', error: expect.stringContaining('RESTORE_COMMITTED_RELOAD_REQUIRED') })
  expect(mockFailure).toBeInstanceOf(Error); expect((mockFailure as Error).message).toContain('RESTORE_COMMITTED_RELOAD_REQUIRED')
  expect(raw.prepare('SELECT id FROM shows').all()).toHaveLength(2)
  // This is AppProvider's committed-restore recovery branch: reopen, not import.
  mockReadGate = null; await mockLibrary.initialize()
  expect(mockLibrary.getSnapshot().shows).toHaveLength(2); expect(imports).toHaveBeenCalledTimes(1)
})

it('does not clear a later queued library error when the old detached share attempt fails', async () => {
  let failShare!: (failure: Error) => void
  jest.mocked(Sharing.shareAsync).mockImplementationOnce(() => new Promise((_resolve, reject) => { failShare = reject }))
  const screen = render(wrap()); fireEvent.press(screen.getByRole('button', { name: messages.en['library.backup'] }))
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1)); screen.unmount()
  mockPreferenceFailure = new Error('Later independent settings failure')
  const later = mockLibrary.updateSettings({ theme: 'cobra' }).catch((error: unknown) => error)
  await act(async () => failShare(new Error('Earlier late share failure')))
  expect(await later).toBe(mockPreferenceFailure); await settle()
  expect(mockLibrary.getSnapshot().error).toBe('Later independent settings failure')
  expect(mockLibrary.getSnapshot().settings.theme).toBe('darkBlue')
})

it('releases a synchronous cancelled admission before a later deliberate invocation of the same work', async () => {
  let admit!: () => void
  mockDelayStart = new Promise<void>((resolve) => { admit = resolve })
  const exports = jest.spyOn(mockLibrary, 'exportBackup')
  const screen = render(wrap()); fireEvent.press(screen.getByRole('button', { name: messages.en['library.backup'] }))
  const work = mockCapturedWork[0]!
  screen.unmount()
  await act(async () => admit()); await settle()
  expect(exports).not.toHaveBeenCalled(); expect(Sharing.shareAsync).not.toHaveBeenCalled()
  expect(mockLibrary.getSnapshot().error).toBeUndefined()
  mockDelayStart = null
  await act(async () => { await mockRunTask(work) })
  expect(exports).toHaveBeenCalledTimes(1); expect(Sharing.shareAsync).toHaveBeenCalledTimes(1)
  expect(exports.mock.calls[0]![0]!.signal!.aborted).toBe(false)
})
