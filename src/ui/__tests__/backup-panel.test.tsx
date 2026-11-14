import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { I18nProvider, messages } from '../../i18n'
import type { BackupExportOptions, BackupOptions } from '../../storage/backup-progress'
import { BackupPanel } from '../BackupPanel'

const mockLibrary = { exportBackup: jest.fn(), importBackup: jest.fn(), shareBackup: jest.fn(), clearError: jest.fn() }
let mockRetry: (() => Promise<unknown>) | null = null
const mockApp = { library: mockLibrary, libraryState: { status: 'ready' }, busy: false, runTask: async (work: () => Promise<unknown>) => { try { await work(); mockRetry = null; return true } catch { mockRetry = work; return false } } }
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
const wrap = () => <I18nProvider><BackupPanel /></I18nProvider>
const completed = { kind: 'export' as const, shows: 2, playlists: 3, songs: 6, files: 5, uri: 'file:///backup.zip' }
beforeEach(() => { jest.clearAllMocks(); mockApp.busy = false; mockRetry = null; mockLibrary.shareBackup.mockResolvedValue(undefined) })
describe('backup workflow feedback', () => {
  it.each(['Backup contains an invalid show: CUE_MISSING.', 'Backup manifest is invalid.', 'Backup checksum mismatch.'])('explains an export validation failure without asking for an import: %s', async (detail) => {
    mockLibrary.exportBackup.mockRejectedValue(new Error(detail))
    const screen = render(wrap()); fireEvent.press(screen.getByRole('button', { name: messages.en['library.backup'] }))
    await waitFor(() => expect(mockLibrary.clearError).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(messages.en['error.backupInvalid'])).toBeNull()
    expect(screen.getByText('The backup could not be created. Review the library details below, correct the problem and try again. Your library is unchanged.')).toBeTruthy()
    expect(mockLibrary.importBackup).not.toHaveBeenCalled(); expect(mockLibrary.shareBackup).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] }))
    await waitFor(() => expect(mockLibrary.exportBackup).toHaveBeenCalledTimes(2))
    expect(mockLibrary.importBackup).not.toHaveBeenCalled()
  })
  it('owns one share failure and retries the saved archive without another export', async () => {
    mockLibrary.exportBackup.mockImplementation(async (options: BackupExportOptions) => { options.onSaved?.(completed.uri); options.onResult?.(completed); return completed.uri })
    mockLibrary.shareBackup.mockRejectedValueOnce(new Error('Sharing unavailable'))
    const screen = render(wrap()); fireEvent.press(screen.getByRole('button', { name: messages.en['library.backup'] }))
    await waitFor(() => expect(screen.getByText(messages.en['backup.savedShareFailed'])).toBeTruthy())
    expect(mockLibrary.exportBackup).toHaveBeenCalledTimes(1); expect(mockRetry).toBeNull(); expect(mockLibrary.clearError).toHaveBeenCalledTimes(1)
    fireEvent.press(screen.getByRole('button', { name: messages.en['backup.shareAgain'] }))
    await waitFor(() => expect(mockLibrary.shareBackup).toHaveBeenCalledTimes(2))
    expect(mockLibrary.exportBackup).toHaveBeenCalledTimes(1); expect(mockLibrary.shareBackup).toHaveBeenCalledTimes(2); expect(mockLibrary.shareBackup).toHaveBeenLastCalledWith(completed.uri, expect.any(Object))
    expect(screen.queryByText(messages.en['backup.savedShareFailed'])).toBeNull()
  })
  it('keeps restoring as the retry action even when a previous saved backup exists', async () => {
    mockLibrary.exportBackup.mockImplementation(async (options: BackupExportOptions) => { options.onSaved?.(completed.uri); options.onResult?.(completed); return completed.uri })
    const screen = render(wrap()); fireEvent.press(screen.getByRole('button', { name: messages.en['library.backup'] })); await waitFor(() => expect(mockLibrary.shareBackup).toHaveBeenCalledTimes(1))
    mockLibrary.importBackup.mockRejectedValueOnce(new Error('Invalid ZIP archive')); fireEvent.press(screen.getByRole('button', { name: messages.en['library.restore'] }))
    await waitFor(() => expect(screen.getByText(messages.en['error.backupInvalid'])).toBeTruthy()); expect(screen.queryByText(messages.en['backup.savedShareFailed'])).toBeNull()
    mockLibrary.importBackup.mockResolvedValueOnce(null); fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] })); await waitFor(() => expect(mockLibrary.importBackup).toHaveBeenCalledTimes(2)); expect(mockLibrary.shareBackup).toHaveBeenCalledTimes(1)
  })
  it('offers a new backup instead of falsely claiming a deleted saved file is safe', async () => {
    mockLibrary.exportBackup.mockImplementation(async (options: BackupExportOptions) => { options.onSaved?.(completed.uri); options.onResult?.(completed); return completed.uri })
    mockLibrary.shareBackup.mockRejectedValueOnce(new Error('BACKUP_FILE_MISSING'))
    const screen = render(wrap()); fireEvent.press(screen.getByRole('button', { name: messages.en['library.backup'] })); await waitFor(() => expect(screen.getByText(messages.en['backup.missing'])).toBeTruthy())
    expect(screen.queryByText(messages.en['backup.saved'])).toBeNull(); expect(screen.queryByRole('button', { name: messages.en['backup.shareAgain'] })).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] })); await waitFor(() => expect(mockLibrary.exportBackup).toHaveBeenCalledTimes(2))
  })
  it('refuses duplicate start taps and cancels through the operation signal without a false completion', async () => {
    let finish!: () => void; let signal: AbortSignal | undefined
    mockLibrary.exportBackup.mockImplementation((options: BackupExportOptions) => { signal = options.signal; return new Promise<void>((_resolve, reject) => { finish = () => { const error = new Error('cancelled'); error.name = 'AbortError'; reject(error) } }) })
    const screen = render(wrap()); const start = screen.getByRole('button', { name: messages.en['library.backup'] }); fireEvent.press(start); fireEvent.press(start)
    expect(mockLibrary.exportBackup).toHaveBeenCalledTimes(1); fireEvent.press(screen.getByRole('button', { name: messages.en['common.cancel'] })); expect(signal?.aborted).toBe(true)
    await act(async () => finish()); expect(screen.getByText(messages.en['backup.cancelled'])).toBeTruthy(); expect(screen.queryByText(messages.en['backup.saved'])).toBeNull(); expect(mockLibrary.shareBackup).not.toHaveBeenCalled()
  })
  it('shows measured progress and disables cancellation during final atomic saving', async () => {
    let finish!: () => void; let saving!: () => void
    mockLibrary.importBackup.mockImplementation((_picked: unknown, options: BackupOptions) => { options.onProgress?.({ stage: 'validating', completedBytes: 40, totalBytes: 100, completedFiles: 1, totalFiles: 2 }); saving = () => options.onProgress?.({ stage: 'saving', completedBytes: 0, totalBytes: null, completedFiles: 0, totalFiles: null }); return new Promise<number>((resolve) => { finish = () => resolve(2) }) })
    const screen = render(wrap()); fireEvent.press(screen.getByRole('button', { name: messages.en['library.restore'] })); expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(40)
    act(() => saving()); expect(screen.getByRole('button', { name: messages.en['common.cancel'] })).toBeDisabled()
    await act(async () => finish()); expect(mockLibrary.importBackup).toHaveBeenCalledTimes(1)
  })
  it('aborts local preparation on navigation away', () => {
    let signal: AbortSignal | undefined; mockLibrary.exportBackup.mockImplementation((options: BackupExportOptions) => { signal = options.signal; return new Promise(() => undefined) })
    const screen = render(wrap()); fireEvent.press(screen.getByRole('button', { name: messages.en['library.backup'] })); screen.unmount(); expect(signal?.aborted).toBe(true)
  })
  it('keeps committed restore counts and delegates reopening instead of offering another import', async () => {
    mockLibrary.importBackup.mockImplementationOnce(async (_picked: unknown, options: BackupOptions) => {
      options.onResult?.({ ...completed, kind: 'restore' })
      throw new Error('RESTORE_COMMITTED_RELOAD_REQUIRED: Reopen the library')
    })
    const screen = render(wrap()); fireEvent.press(screen.getByRole('button', { name: messages.en['library.restore'] }))
    await waitFor(() => expect(mockRetry).not.toBeNull())
    expect(screen.getByText(messages.en['backup.restored'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: messages.en['common.retry'] })).toBeNull()
    expect(screen.queryByText(messages.en['backup.cancelled'])).toBeNull()
    expect(mockLibrary.clearError).not.toHaveBeenCalled(); expect(mockLibrary.importBackup).toHaveBeenCalledTimes(1)
    mockRetry = null
  })
})
