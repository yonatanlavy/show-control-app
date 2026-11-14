import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import { Button as NativeButton, Modal } from 'react-native'
import { sampleShow, type Show } from '../../domain'
import { I18nProvider, messages, useI18n } from '../../i18n'
import type { RevisionHistoryPage, ShowRevisionSummary } from '../../library/types'
import { setCriticalSessionActive } from '../../runtime/critical-session-gate'
import { HistoryPanel } from '../HistoryPanel'
import { Button } from '../primitives'

const mockLibrary = { history: jest.fn(), restoreRevision: jest.fn() }
const mockApp = { show: sampleShow as Show | null, library: mockLibrary, busy: false, runTask: async (work: () => Promise<unknown>) => { try { await work(); return true } catch { return false } } }
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
const wrap = () => <I18nProvider><HistoryPanel /></I18nProvider>
const revision = (id: string): ShowRevisionSummary => ({ id, createdAt: '2026-10-24T08:00:00Z', prompt: id })
const page = (ids: string[], more = false): RevisionHistoryPage => ({ revisions: ids.map(revision), nextCursor: more ? { id: ids.at(-1)!, createdAt: '2026-10-24T08:00:00Z' } : null })
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function dialog(screen: ReturnType<typeof render>) { return within(screen.UNSAFE_getByType(Modal)) }
beforeEach(() => { jest.clearAllMocks(); mockApp.show = sampleShow; mockApp.busy = false; setCriticalSessionActive(false); mockLibrary.history.mockReset().mockResolvedValue(page(['old'])); mockLibrary.restoreRevision.mockReset().mockResolvedValue(undefined) })
afterEach(() => { setCriticalSessionActive(false); jest.restoreAllMocks() })

describe('bounded, deliberate version history', () => {
  it('shows loading, replaces pages and returns to the previous cursor', async () => {
    const first = deferred<RevisionHistoryPage>(); mockLibrary.history.mockReturnValueOnce(first.promise).mockResolvedValueOnce(page(['older'])).mockResolvedValueOnce(page(['recent'], true))
    const screen = render(wrap()); expect(screen.getByText(messages.en['common.loading'])).toBeTruthy()
    await act(async () => first.resolve(page(['recent'], true)))
    fireEvent.press(screen.getByRole('button', { name: messages.en['history.older'] }))
    await waitFor(() => expect(screen.getByText('older')).toBeTruthy())
    expect(screen.queryByText('recent')).toBeNull(); expect(mockLibrary.history).toHaveBeenLastCalledWith(sampleShow.id, { createdAt: '2026-10-24T08:00:00Z', id: 'recent' })
    expect(screen.getByText('Page 2')).toBeTruthy(); expect(screen.queryByRole('button', { name: messages.en['history.older'] })).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: messages.en['history.newer'] }))
    await waitFor(() => expect(screen.getByText('recent')).toBeTruthy()); expect(mockLibrary.history).toHaveBeenLastCalledWith(sampleShow.id, undefined)
  })
  it('shows an empty history and handles synchronous read failure with a deliberate Retry', async () => {
    mockLibrary.history.mockImplementationOnce(() => { throw new Error('Library not ready') }).mockResolvedValueOnce(page([]))
    const screen = render(wrap()); await waitFor(() => expect(screen.getByRole('button', { name: messages.en['common.retry'] })).toBeTruthy())
    expect(screen.queryByText(messages.en['common.loading'])).toBeNull(); fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] }))
    await waitFor(() => expect(screen.getByText(messages.en['history.empty'])).toBeTruthy()); expect(mockLibrary.restoreRevision).not.toHaveBeenCalled()
  })
  it('retries the failed older page rather than starting again or showing stale rows', async () => {
    mockLibrary.history.mockResolvedValueOnce(page(['recent'], true)).mockRejectedValueOnce(new Error('database locked')).mockResolvedValueOnce(page(['older']))
    const screen = render(wrap()); await waitFor(() => expect(screen.getByText('recent')).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: messages.en['history.older'] })); await waitFor(() => expect(screen.getByRole('button', { name: messages.en['common.retry'] })).toBeTruthy())
    expect(screen.queryByText('recent')).toBeNull(); expect(screen.getByRole('button', { name: messages.en['history.newer'] })).toBeEnabled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] })); await waitFor(() => expect(screen.getByText('older')).toBeTruthy())
    expect(mockLibrary.history.mock.calls[2]![1]).toEqual(mockLibrary.history.mock.calls[1]![1])
  })
  it('asks before restoring and Cancel leaves the show unchanged', async () => {
    const screen = render(wrap()); await waitFor(() => expect(screen.getByText('old')).toBeTruthy())
    fireEvent.press(screen.getByRole('button')); expect(dialog(screen).getByText(messages.en['history.restoreHelp'])).toBeTruthy(); expect(mockLibrary.restoreRevision).not.toHaveBeenCalled()
    fireEvent.press(dialog(screen).getByRole('button', { name: messages.en['common.cancel'] })); expect(screen.UNSAFE_queryByType(Modal)).toBeNull(); expect(mockLibrary.restoreRevision).not.toHaveBeenCalled()
  })
  it('restores only the chosen version once and retains the dialog on failure for retry', async () => {
    const save = deferred<unknown>(); mockLibrary.restoreRevision.mockReturnValueOnce(save.promise).mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce(undefined)
    const screen = render(wrap()); await waitFor(() => expect(screen.getByText('old')).toBeTruthy()); fireEvent.press(screen.getByRole('button'))
    const press = screen.UNSAFE_getAllByType(Button).find((button) => button.props.variant === 'primary')!.props.onPress
    act(() => { press(); press() }); expect(mockLibrary.restoreRevision).toHaveBeenCalledTimes(1); expect(dialog(screen).getByRole('button', { name: messages.en['common.cancel'] })).toBeDisabled()
    await act(async () => save.resolve(undefined)); expect(screen.UNSAFE_queryByType(Modal)).toBeNull()
    fireEvent.press(screen.getByRole('button')); fireEvent.press(dialog(screen).getByRole('button', { name: messages.en['library.restoreRevision'] }))
    await waitFor(() => { expect(dialog(screen).getByText(messages.en['common.errorHelp'])).toBeTruthy(); expect(dialog(screen).getByRole('button', { name: messages.en['library.restoreRevision'] })).toBeEnabled() }); expect(mockLibrary.restoreRevision).toHaveBeenLastCalledWith(sampleShow.id, 'old')
    await act(async () => fireEvent.press(dialog(screen).getByRole('button', { name: messages.en['library.restoreRevision'] })))
    expect(mockLibrary.restoreRevision).toHaveBeenCalledTimes(3); expect(screen.UNSAFE_queryByType(Modal)).toBeNull()
  })
  it('rejects old reads after changing shows and does not reread for an unchanged revision', async () => {
    const old = deferred<RevisionHistoryPage>(); mockLibrary.history.mockReturnValueOnce(old.promise).mockResolvedValueOnce(page(['new-show-version']))
    const screen = render(wrap()); await act(async () => undefined)
    mockApp.show = { ...sampleShow, id: 'another-show' }; screen.rerender(wrap()); await waitFor(() => expect(screen.getByText('new-show-version')).toBeTruthy())
    await act(async () => old.resolve(page(['obsolete']))); expect(screen.queryByText('obsolete')).toBeNull()
    mockApp.show = { ...mockApp.show }; screen.rerender(wrap()); await act(async () => undefined); expect(mockLibrary.history).toHaveBeenCalledTimes(2)
  })
  it('resets to the newest page when the current revision changes', async () => {
    mockLibrary.history.mockResolvedValueOnce(page(['recent'], true)).mockResolvedValueOnce(page(['older'])).mockResolvedValueOnce(page(['new-current']))
    const screen = render(wrap()); await waitFor(() => expect(screen.getByText('recent')).toBeTruthy()); fireEvent.press(screen.getByRole('button', { name: messages.en['history.older'] })); await waitFor(() => expect(screen.getByText('older')).toBeTruthy())
    mockApp.show = { ...sampleShow, revisionId: 'new-current' }; screen.rerender(wrap()); await waitFor(() => expect(screen.getByText('new-current')).toBeTruthy())
    expect(screen.getByText('Page 1')).toBeTruthy(); expect(screen.getByRole('button')).toBeDisabled()
  })
  it('blocks restore while busy or critical, and rejects a callback after unmount', async () => {
    const screen = render(wrap()); await waitFor(() => expect(screen.getByText('old')).toBeTruthy())
    mockApp.busy = true; screen.rerender(wrap()); expect(screen.getByRole('button')).toBeDisabled()
    mockApp.busy = false; setCriticalSessionActive(true); screen.rerender(wrap()); expect(screen.getByRole('button')).toBeDisabled()
    setCriticalSessionActive(false); screen.rerender(wrap()); fireEvent.press(screen.getByRole('button'))
    const press = screen.UNSAFE_getAllByType(Button).find((button) => button.props.variant === 'primary')!.props.onPress
    screen.unmount(); await act(async () => press()); expect(mockLibrary.restoreRevision).not.toHaveBeenCalled()
  })
  it('renders nothing without a selected show', () => { mockApp.show = null; const screen = render(wrap()); expect(screen.toJSON()).toBeNull(); expect(mockLibrary.history).not.toHaveBeenCalled() })
  it('uses the chosen interface language for the date and complete assistive restore label', async () => {
    function LanguageButton() { const { setLocale } = useI18n(); return <NativeButton title="Hebrew" onPress={() => setLocale('he')} /> }
    const format = jest.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('local date')
    const screen = render(<I18nProvider><HistoryPanel /><LanguageButton /></I18nProvider>)
    await waitFor(() => expect(screen.getByLabelText('Restore version from local date')).toBeTruthy()); expect(format).toHaveBeenCalledWith('en')
    fireEvent.press(screen.getByRole('button', { name: 'Hebrew' }))
    await waitFor(() => expect(screen.getByLabelText(messages.he['history.restoreDated'].replace('{date}', 'local date'))).toBeTruthy()); expect(format).toHaveBeenCalledWith('he')
  })
})
