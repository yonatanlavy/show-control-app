import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { I18nProvider, messages } from '../../i18n'
import { IncludedLibrary } from '../../music/included-library'
import type { BackupOptions } from '../../storage/backup-progress'
import { IncludedMusicPanel } from '../IncludedMusicPanel'

let mockInstalled = false
const mockInfo = { version: 'test', songs: 170, playlists: 20, bytes: 1328348328, sha256: 'f'.repeat(64), hashes: Array.from({ length: 170 }, (_, index) => index.toString(16).padStart(64, '0')) }
jest.mock('../../music/included-library', () => ({ IncludedLibrary: { info: jest.fn(), install: jest.fn() }, includedMusicInstalled: () => mockInstalled }))
const mockLibrary = { clearError: jest.fn() }
const mockApp = { library: mockLibrary, libraryState: { status: 'ready', shows: [] }, busy: false, runTask: async (work: () => Promise<unknown>) => { try { await work(); return true } catch { return false } } }
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
const wrap = () => <I18nProvider><IncludedMusicPanel /></I18nProvider>
beforeEach(() => { jest.clearAllMocks(); mockInstalled = false; mockApp.busy = false; jest.mocked(IncludedLibrary.info).mockResolvedValue(mockInfo) })

it('does not present an installer in APKs without bundled music', async () => { jest.mocked(IncludedLibrary.info).mockResolvedValue(null); const screen = render(wrap()); await act(async () => undefined); expect(screen.queryByText(messages.en['use.library.includedTitle'])).toBeNull() })
it('recognizes an existing complete collection without offering another installation', async () => { mockInstalled = true; const screen = render(wrap()); await waitFor(() => expect(screen.getByText(messages.en['use.library.musicReady'])).toBeTruthy()); expect(screen.queryByRole('button', { name: messages.en['use.library.installMusic'] })).toBeNull(); expect(IncludedLibrary.install).not.toHaveBeenCalled() })
it('admits one operation and cancels it through its actual signal', async () => {
  let options!: BackupOptions; let reject!: (error: unknown) => void
  jest.mocked(IncludedLibrary.install).mockImplementation(async (_library, _info, value = {}) => { options = value; return new Promise((_resolve, no) => { reject = no }) })
  const screen = render(wrap()); const button = await screen.findByRole('button', { name: messages.en['use.library.installMusic'] }); fireEvent.press(button); fireEvent.press(button)
  expect(IncludedLibrary.install).toHaveBeenCalledTimes(1)
  await act(async () => options.onProgress?.({ stage: 'reading', completedBytes: 500, totalBytes: 1000, completedFiles: 0, totalFiles: null }))
  expect(screen.getByText('50%')).toBeTruthy(); fireEvent.press(screen.getByRole('button', { name: messages.en['common.cancel'] })); expect(options.signal?.aborted).toBe(true)
  await act(async () => { const error = new Error('cancelled'); error.name = 'AbortError'; reject(error) })
  await waitFor(() => expect(screen.getByText(messages.en['backup.cancelled'])).toBeTruthy()); expect(screen.getByRole('button', { name: messages.en['use.library.installMusic'] })).toBeTruthy()
})
it('owns an actionable installation failure and retries from a fresh operation', async () => {
  jest.mocked(IncludedLibrary.install).mockRejectedValue(new Error('Not enough free storage'))
  const screen = render(wrap()); fireEvent.press(await screen.findByRole('button', { name: messages.en['use.library.installMusic'] }))
  await waitFor(() => expect(screen.getByText(messages.en['error.lowStorage'])).toBeTruthy()); fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] }))
  await waitFor(() => expect(IncludedLibrary.install).toHaveBeenCalledTimes(2)); expect(jest.mocked(IncludedLibrary.install).mock.calls[0]![2]!.signal).not.toBe(jest.mocked(IncludedLibrary.install).mock.calls[1]![2]!.signal)
})
it('aborts on navigation and ignores a late progress reply', async () => {
  let options!: BackupOptions; let finish!: (value: number) => void
  jest.mocked(IncludedLibrary.install).mockImplementation(async (_library, _info, value = {}) => { options = value; return new Promise((yes) => { finish = yes }) })
  const screen = render(wrap()); fireEvent.press(await screen.findByRole('button', { name: messages.en['use.library.installMusic'] })); screen.unmount(); expect(options.signal?.aborted).toBe(true)
  await act(async () => { options.onProgress?.({ stage: 'validating', completedBytes: 1, totalBytes: 2, completedFiles: 1, totalFiles: 2 }); finish(1) })
  expect(IncludedLibrary.install).toHaveBeenCalledTimes(1)
})
