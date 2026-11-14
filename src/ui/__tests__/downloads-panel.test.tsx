import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import * as Sharing from 'expo-sharing'
import type { DownloadJob } from '../../../modules/show-downloads'
import { sampleShow } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import { MusicDownloads } from '../../music/downloads'
import { DownloadsPanel } from '../music-screens'
import { Button } from '../primitives'
import { setCriticalSessionActive } from '../../runtime/critical-session-gate'
import { operationErrorKey } from '../feedback'

const mockCompleted: unknown[] = []
const mockErrors: unknown[] = []
let mockRetry: (() => Promise<unknown>) | null = null
let mockOriginalAvailable = true
const mockApp = {
  library: { getSnapshot: () => ({ shows: [sampleShow] }) }, show: sampleShow, set: sampleShow.sets[0], busy: false, liveSession: false,
  runTask: jest.fn(async (work: () => Promise<unknown>) => { try { const result = await work(); mockRetry = null; if (result !== null) mockCompleted.push(result); return true } catch (error) { mockErrors.push(error); mockRetry = error instanceof Error && error.name === 'AbortError' ? null : work; return false } }),
}
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('expo-router', () => ({ useRouter: () => ({}), useLocalSearchParams: () => ({}) }))
jest.mock('../../ai/music-recommendations', () => ({ recommendMusic: jest.fn() }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('../../music/downloads', () => ({ MusicDownloads: { jobs: jest.fn(), attach: jest.fn(), cancel: jest.fn(), download: jest.fn(), remove: jest.fn() }, HelperSettings: {}, hasDownloadTarget: () => mockOriginalAvailable }))
const ready: DownloadJob = { id: 'finished', stage: 'ready', percent: 100, showId: sampleShow.id, setId: sampleShow.sets[0]!.id, category: 'ambient', title: 'Retained music', url: 'https://example.com/song', uri: 'file:///local/song.mp3', bytes: 1000, createdAt: 1 }
const wrap = () => <I18nProvider><DownloadsPanel /></I18nProvider>
const actionName = (key: keyof typeof messages.en, title = ready.title) => messages.en['download.actionForSong'].replace('{action}', messages.en[key]).replace('{song}', title)

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done }); return { promise, resolve } }
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); mockCompleted.length = 0; mockErrors.length = 0; mockRetry = null; mockOriginalAvailable = true; mockApp.busy = false; mockApp.liveSession = false; setCriticalSessionActive(false); jest.mocked(MusicDownloads.jobs).mockReset().mockResolvedValue([ready]); jest.mocked(MusicDownloads.attach).mockReset(); jest.mocked(MusicDownloads.cancel).mockReset(); jest.mocked(MusicDownloads.download).mockReset(); jest.mocked(MusicDownloads.remove).mockReset().mockResolvedValue(undefined) })
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); setCriticalSessionActive(false); jest.restoreAllMocks() })
describe('completed download attachment feedback', () => {
  it('retains the completed file and explains an attachment whose target disappears', async () => {
    jest.mocked(MusicDownloads.attach).mockResolvedValue('retained')
    const screen = render(wrap()); await waitFor(() => expect(screen.getByText(ready.title)).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: actionName('download.attachHere') }))
    await waitFor(() => expect(screen.getByText(messages.en['finder.targetMissing'])).toBeTruthy())
    expect(screen.getByText(ready.title)).toBeTruthy(); expect(mockCompleted).toEqual([])
  })
  it('keeps attached history and emits success only after the library attachment commits', async () => {
    const commit = deferred<'attached' | 'retained'>()
    jest.mocked(MusicDownloads.attach).mockReturnValue(commit.promise)
    const screen = render(wrap()); await waitFor(() => expect(screen.getByText(ready.title)).toBeTruthy())
    const retainedAction = screen.UNSAFE_getAllByType(Button).find((button) => button.props.label === messages.en['download.attachHere'])!.props.onPress as () => void
    fireEvent.press(screen.getByRole('button', { name: actionName('download.attachHere') }))
    fireEvent.press(screen.getByRole('button', { name: actionName('download.attachHere') }))
    expect(MusicDownloads.attach).toHaveBeenCalledTimes(1)
    expect(MusicDownloads.attach).toHaveBeenCalledWith(mockApp.library, ready, undefined, { showId: sampleShow.id, setId: sampleShow.sets[0]!.id, category: ready.category })
    expect(screen.getByText(ready.title)).toBeTruthy(); expect(mockCompleted).toEqual([])
    expect(screen.queryByText(messages.en['download.stage.attached'])).toBeNull()
    await act(async () => { commit.resolve('attached'); await commit.promise })
    expect(screen.getByText(ready.title)).toBeTruthy()
    expect(screen.getByText(messages.en['download.stage.attached'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: actionName('download.attachHere') })).toBeNull()
    expect(mockCompleted).toEqual(['attached'])
    act(() => retainedAction())
    expect(MusicDownloads.attach).toHaveBeenCalledTimes(1); expect(mockApp.runTask).toHaveBeenCalledTimes(1)
  })
  it('rejects a stale ready poll after commit without suppressing another ready download', async () => {
    const stale = deferred<DownloadJob[]>()
    const another: DownloadJob = { ...ready, id: 'new-download', title: 'New music' }
    jest.mocked(MusicDownloads.jobs).mockResolvedValueOnce([ready]).mockReturnValueOnce(stale.promise).mockResolvedValueOnce([{ ...ready, stage: 'attached' }, another])
    jest.mocked(MusicDownloads.attach).mockResolvedValue('attached')
    const screen = render(wrap()); await waitFor(() => expect(screen.getByText(ready.title)).toBeTruthy())
    await act(async () => { jest.advanceTimersByTime(1000) })
    expect(MusicDownloads.jobs).toHaveBeenCalledTimes(2)
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: actionName('download.attachHere') })) })
    expect(screen.getByText(messages.en['download.stage.attached'])).toBeTruthy()
    await act(async () => { stale.resolve([ready]); await stale.promise })
    expect(screen.getByText(messages.en['download.stage.attached'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: actionName('download.attachHere') })).toBeNull()
    await act(async () => { jest.advanceTimersByTime(1000) })
    expect(screen.getByText(another.title)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: actionName('download.attachHere', another.title) })).toHaveLength(1)
    expect(mockCompleted).toEqual(['attached'])
  })
  it('preserves native cancellation and error states after a local attachment', async () => {
    jest.mocked(MusicDownloads.attach).mockResolvedValue('attached')
    const screen = render(wrap()); await waitFor(() => expect(screen.getByText(ready.title)).toBeTruthy())
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: actionName('download.attachHere') })) })
    jest.mocked(MusicDownloads.jobs).mockResolvedValue([{ ...ready, stage: 'error' }])
    await act(async () => { jest.advanceTimersByTime(1000) })
    expect(screen.getByText(messages.en['download.stage.error'])).toBeTruthy()
    jest.mocked(MusicDownloads.jobs).mockResolvedValue([{ ...ready, stage: 'cancelled' }])
    await act(async () => { jest.advanceTimersByTime(1000) })
    expect(screen.getByText(messages.en['download.stage.cancelled'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: actionName('download.attachHere') })).toBeNull()
  })
  it.each(['DOWNLOAD_STORAGE', 'DOWNLOAD_INTERRUPTED', 'DOWNLOAD_HELPER_AUTH', 'DOWNLOAD_RUNTIME_MISSING', 'DOWNLOAD_TIMEOUT', 'DOWNLOAD_SOURCE_FAILED'])('explains the failed row with recovery guidance: %s', async (errorCode) => {
    jest.mocked(MusicDownloads.jobs).mockResolvedValue([{ ...ready, stage: 'error', errorCode }])
    const screen = render(wrap())
    await waitFor(() => expect(screen.getByText(messages.en[operationErrorKey(errorCode)])).toBeTruthy())
    expect(screen.getByRole('button', { name: actionName('common.retry') })).toBeEnabled()
  })
  it('explains an interrupted row even when native history has no error code', async () => {
    jest.mocked(MusicDownloads.jobs).mockResolvedValue([{ ...ready, stage: 'interrupted' }])
    const screen = render(wrap())
    await waitFor(() => expect(screen.getByText(messages.en['error.downloadInterrupted'])).toBeTruthy())
  })
  it('gives each row action a song-specific assistive name', async () => {
    const another = { ...ready, id: 'another', title: 'Finale atmosphere' }
    jest.mocked(MusicDownloads.jobs).mockResolvedValue([ready, another])
    const screen = render(wrap())
    await waitFor(() => expect(screen.getByRole('button', { name: actionName('finder.share', another.title) })).toBeTruthy())
    expect(screen.getByRole('button', { name: actionName('finder.share') })).toBeTruthy()
    expect(screen.getByRole('button', { name: actionName('common.delete', another.title) })).toBeTruthy()
  })
  it('keeps Cancel available while recovery is busy and owns synchronous cancellation failures', async () => {
    mockApp.busy = true
    jest.mocked(MusicDownloads.jobs).mockResolvedValue([{ ...ready, stage: 'downloading', percent: 62 }])
    jest.mocked(MusicDownloads.cancel).mockImplementationOnce(() => { throw new Error('DOWNLOAD_RUNTIME_MISSING') })
    const screen = render(wrap())
    await waitFor(() => expect(screen.getByRole('button', { name: actionName('common.cancel') })).toBeEnabled())
    fireEvent.press(screen.getByRole('button', { name: actionName('common.cancel') }))
    await waitFor(() => expect(mockErrors).toHaveLength(1))
    expect(MusicDownloads.cancel).toHaveBeenCalledWith(expect.objectContaining({ id: ready.id }))
    expect(mockErrors[0]).toMatchObject({ message: 'DOWNLOAD_RUNTIME_MISSING' })
  })
  it('serializes repeated retry callbacks and explains a retained result without a success notice', async () => {
    const downloading = deferred<'attached' | 'retained'>()
    jest.mocked(MusicDownloads.jobs).mockResolvedValue([{ ...ready, stage: 'error' }])
    jest.mocked(MusicDownloads.download).mockReturnValueOnce(downloading.promise)
    const screen = render(wrap())
    await waitFor(() => expect(screen.getByRole('button', { name: actionName('common.retry') })).toBeEnabled())
    const press = screen.UNSAFE_getAllByType(Button).find((button) => button.props.label === messages.en['common.retry'])!.props.onPress
    fireEvent.press(screen.getByRole('button', { name: actionName('common.retry') }))
    act(() => press())
    expect(MusicDownloads.download).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: actionName('common.retry') }).props.accessibilityState.busy).toBe(true)
    expect(screen.getByRole('button', { name: actionName('common.delete') })).toBeDisabled()
    await act(async () => { downloading.resolve('retained'); await downloading.promise })
    expect(screen.getByText(messages.en['finder.targetMissing'])).toBeTruthy()
    expect(mockCompleted).toEqual([])
  })
  it('reacquires pending state when the global Retry repeats a failed download', async () => {
    jest.mocked(MusicDownloads.jobs).mockResolvedValue([{ ...ready, stage: 'error' }])
    jest.mocked(MusicDownloads.download).mockRejectedValueOnce(new Error('DOWNLOAD_STORAGE'))
    const screen = render(wrap())
    await waitFor(() => expect(screen.getByRole('button', { name: actionName('common.retry') })).toBeEnabled())
    fireEvent.press(screen.getByRole('button', { name: actionName('common.retry') }))
    await waitFor(() => expect(mockRetry).not.toBeNull())
    const downloading = deferred<'attached' | 'retained'>()
    jest.mocked(MusicDownloads.download).mockReturnValueOnce(downloading.promise)
    let retry!: Promise<boolean>
    act(() => { retry = mockApp.runTask(mockRetry!) })
    expect(screen.getByRole('button', { name: actionName('common.retry') }).props.accessibilityState.busy).toBe(true)
    await act(async () => { downloading.resolve('attached'); await retry })
    expect(mockCompleted).toEqual(['attached'])
  })
  it('prevents attachment from racing a share operation on the same row', async () => {
    const sharing = deferred<void>(); jest.mocked(Sharing.shareAsync).mockReturnValueOnce(sharing.promise)
    const screen = render(wrap())
    await waitFor(() => expect(screen.getByText(ready.title)).toBeTruthy())
    const attach = screen.UNSAFE_getAllByType(Button).find((button) => button.props.label === messages.en['download.attachHere'])!.props.onPress
    fireEvent.press(screen.getByRole('button', { name: actionName('finder.share') }))
    act(() => attach())
    expect(MusicDownloads.attach).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: actionName('download.attachHere') })).toBeDisabled()
    await act(async () => { sharing.resolve(); await sharing.promise })
    expect(screen.getByRole('button', { name: actionName('download.attachHere') })).toBeEnabled()
  })
  it('rejects a stored share Retry after unmount without reopening the share sheet', async () => {
    jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('Share unavailable'))
    const screen = render(wrap())
    await waitFor(() => expect(screen.getByText(ready.title)).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: actionName('finder.share') }))
    await waitFor(() => expect(mockRetry).not.toBeNull())
    const retry = mockRetry!; screen.unmount()
    await act(async () => { await mockApp.runTask(retry) })
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1)
    expect(mockErrors.at(-1)).toMatchObject({ name: 'AbortError' })
  })
  it.each(['armed', 'unmounted'] as const)('rejects an obsolete delete confirmation after %s', async (reason) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    const screen = render(wrap())
    await waitFor(() => expect(screen.getByText(ready.title)).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: actionName('common.delete') }))
    const confirm = alert.mock.calls[0]![2]!.find((button) => button.style === 'destructive')!.onPress!
    if (reason === 'armed') setCriticalSessionActive(true)
    else screen.unmount()
    await act(async () => confirm())
    expect(MusicDownloads.remove).not.toHaveBeenCalled()
  })
  it('blocks retained Cancel and Retry callbacks if the show arms after rendering', async () => {
    jest.mocked(MusicDownloads.jobs).mockResolvedValue([{ ...ready, stage: 'downloading' }, { ...ready, id: 'error', stage: 'error' }])
    const screen = render(wrap())
    await waitFor(() => expect(screen.getByRole('button', { name: actionName('common.retry') })).toBeTruthy())
    const cancel = screen.UNSAFE_getAllByType(Button).find((button) => button.props.label === messages.en['common.cancel'])!.props.onPress
    const retry = screen.UNSAFE_getAllByType(Button).find((button) => button.props.label === messages.en['common.retry'])!.props.onPress
    setCriticalSessionActive(true)
    act(() => { cancel(); retry() })
    expect(MusicDownloads.cancel).not.toHaveBeenCalled()
    expect(MusicDownloads.download).not.toHaveBeenCalled()
  })
  it('does not describe completed history as a pending attachment', async () => {
    jest.mocked(MusicDownloads.jobs).mockResolvedValue([{ ...ready, stage: 'attached' }])
    const screen = render(wrap())
    await waitFor(() => expect(screen.getByText(ready.title)).toBeTruthy())
    expect(screen.queryByText(/^Adding to:/)).toBeNull()
  })
})
