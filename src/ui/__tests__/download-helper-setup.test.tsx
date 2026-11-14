import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { I18nProvider, messages } from '../../i18n'
import { checkedHelperUrl, HelperSettings, MusicDownloads, type HelperConnection } from '../../music/downloads'
import { setCriticalSessionActive } from '../../runtime/critical-session-gate'
import { DownloadHelperSetup } from '../DownloadHelperSetup'
import { Button } from '../primitives'

const mockErrors: unknown[] = []
let mockRetry: (() => Promise<unknown>) | null = null
const mockApp = { busy: false, liveSession: false, runTask: jest.fn(async (work: () => Promise<unknown>) => {
  try { await work(); mockRetry = null; return true }
  catch (error) { mockErrors.push(error); mockRetry = error instanceof Error && error.name === 'AbortError' ? null : work; return false }
}) }
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('../../music/downloads', () => ({ checkedHelperUrl: jest.requireActual('../../music/downloads').checkedHelperUrl, HelperSettings: { read: jest.fn(), resolve: jest.fn(), save: jest.fn(), remove: jest.fn() }, MusicDownloads: { testHelper: jest.fn() } }))
const saved: HelperConnection = { url: 'http://show-control.local', token: 'synthetic_saved_pairing_12345678901234567890' }
const newCode = 'synthetic_new_pairing_12345678901234567890'
const t = (key: keyof typeof messages.en) => messages.en[key]
const mount = () => render(<I18nProvider><DownloadHelperSetup /></I18nProvider>)
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
beforeEach(() => {
  jest.clearAllMocks(); mockErrors.length = 0; mockRetry = null; mockApp.busy = false; mockApp.liveSession = false; setCriticalSessionActive(false)
  jest.mocked(HelperSettings.read).mockReset().mockResolvedValue(saved)
  jest.mocked(HelperSettings.resolve).mockReset().mockImplementation(async (url, token) => ({ url: checkedHelperUrl(url), token: token.trim() || saved.token }))
  jest.mocked(HelperSettings.save).mockReset().mockResolvedValue(undefined)
  jest.mocked(HelperSettings.remove).mockReset().mockResolvedValue(undefined)
  jest.mocked(MusicDownloads.testHelper).mockReset().mockResolvedValue(undefined)
})
afterEach(() => { setCriticalSessionActive(false); jest.restoreAllMocks() })

describe('computer-helper setup ownership', () => {
  it('tests the saved origin without exposing or resaving its code', async () => {
    const screen = mount()
    await waitFor(() => expect(screen.getByRole('button', { name: t('download.test') })).toBeEnabled())
    expect(screen.getByLabelText(t('download.code')).props).toMatchObject({ value: '', placeholder: '••••••••', secureTextEntry: true })
    fireEvent.press(screen.getByRole('button', { name: t('download.test') }))
    await waitFor(() => expect(MusicDownloads.testHelper).toHaveBeenCalledWith(saved.url, saved.token, expect.objectContaining({ aborted: false })))
    expect(HelperSettings.resolve).toHaveBeenCalledWith(saved.url, '')
    expect(HelperSettings.save).not.toHaveBeenCalled()
  })
  it('requires an explicit complete code after changing helper address and permits canonical spelling', async () => {
    const screen = mount()
    await waitFor(() => expect(screen.getByRole('button', { name: t('download.test') })).toBeEnabled())
    fireEvent.changeText(screen.getByLabelText(t('download.address')), 'HTTP://SHOW-CONTROL.LOCAL:80/')
    expect(screen.getByRole('button', { name: t('download.test') })).toBeEnabled()
    fireEvent.changeText(screen.getByLabelText(t('download.address')), 'http://other-helper.local:8765')
    expect(screen.getByRole('button', { name: t('download.test') })).toBeDisabled()
    expect(screen.getByRole('button', { name: t('common.save') })).toBeDisabled()
    expect(screen.getByLabelText(t('download.code')).props.placeholder).toBe('')
    expect(screen.getByText(t('download.pairingRequired'))).toBeTruthy()
    fireEvent.changeText(screen.getByLabelText(t('download.code')), newCode)
    fireEvent.press(screen.getByRole('button', { name: t('download.test') }))
    await waitFor(() => expect(MusicDownloads.testHelper).toHaveBeenCalledWith('http://other-helper.local:8765', newCode, expect.any(Object)))
    expect(HelperSettings.save).not.toHaveBeenCalled()
  })
  it('does not silently replace a partially typed code with a saved code', async () => {
    const screen = mount()
    await waitFor(() => expect(screen.getByRole('button', { name: t('download.test') })).toBeEnabled())
    fireEvent.changeText(screen.getByLabelText(t('download.code')), 'incomplete')
    expect(screen.getByRole('button', { name: t('download.test') })).toBeDisabled()
    expect(screen.getByText(t('download.pairingRequired'))).toBeTruthy()
    expect(HelperSettings.resolve).not.toHaveBeenCalled()
  })
  it('explains an invalid address locally without contacting a helper', async () => {
    const screen = mount()
    await waitFor(() => expect(screen.getByRole('button', { name: t('download.test') })).toBeEnabled())
    fireEvent.changeText(screen.getByLabelText(t('download.address')), 'https://helper.example/path?token=secret')
    fireEvent.changeText(screen.getByLabelText(t('download.code')), newCode)
    expect(screen.getByText(t('download.addressHelp'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('download.test') })).toBeDisabled()
    expect(MusicDownloads.testHelper).not.toHaveBeenCalled()
  })
  it('serializes rapid setup actions and shows which action is pending', async () => {
    const resolving = deferred<HelperConnection>(); jest.mocked(HelperSettings.resolve).mockReturnValueOnce(resolving.promise)
    const screen = mount()
    await waitFor(() => expect(screen.getByRole('button', { name: t('download.test') })).toBeEnabled())
    const stale = screen.UNSAFE_getAllByType(Button).find((button) => button.props.label === t('download.test'))!.props.onPress
    fireEvent.press(screen.getByRole('button', { name: t('download.test') }))
    act(() => stale())
    expect(HelperSettings.resolve).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: t('download.test') }).props.accessibilityState.busy).toBe(true)
    expect(screen.getByRole('button', { name: t('common.save') })).toBeDisabled()
    expect(screen.getByRole('button', { name: t('download.forget') })).toBeDisabled()
    await act(async () => { resolving.resolve(saved); await resolving.promise })
    await waitFor(() => expect(screen.getByRole('button', { name: t('download.test') })).toBeEnabled())
  })
  it('preserves an entered code after save failure and clears it only after successful retry', async () => {
    jest.mocked(HelperSettings.save).mockRejectedValueOnce(new Error('Keychain locked'))
    const screen = mount()
    await waitFor(() => expect(screen.getByRole('button', { name: t('download.test') })).toBeEnabled())
    fireEvent.changeText(screen.getByLabelText(t('download.code')), newCode)
    fireEvent.press(screen.getByRole('button', { name: t('common.save') }))
    await waitFor(() => expect(mockRetry).not.toBeNull())
    expect(screen.getByLabelText(t('download.code')).props.value).toBe(newCode)
    await act(async () => { await mockApp.runTask(mockRetry!) })
    expect(HelperSettings.save).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText(t('download.code')).props.value).toBe('')
  })
  it('rejects a failed operation’s old Retry after the user changes the draft', async () => {
    jest.mocked(HelperSettings.save).mockRejectedValueOnce(new Error('Keychain locked'))
    const screen = mount()
    await waitFor(() => expect(screen.getByRole('button', { name: t('download.test') })).toBeEnabled())
    fireEvent.press(screen.getByRole('button', { name: t('common.save') }))
    await waitFor(() => expect(mockRetry).not.toBeNull())
    const retry = mockRetry!
    fireEvent.changeText(screen.getByLabelText(t('download.address')), 'http://new-helper.local:8765')
    await act(async () => { await mockApp.runTask(retry) })
    expect(HelperSettings.save).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText(t('download.address')).props.value).toBe('http://new-helper.local:8765')
    expect(mockErrors.at(-1)).toMatchObject({ name: 'AbortError' })
  })
  it.each(['save', 'test'] as const)('does not %s if the page leaves during pairing resolution', async (action) => {
    const resolving = deferred<HelperConnection>(); jest.mocked(HelperSettings.resolve).mockReturnValueOnce(resolving.promise)
    const screen = mount()
    await waitFor(() => expect(screen.getByRole('button', { name: t('download.test') })).toBeEnabled())
    fireEvent.press(screen.getByRole('button', { name: t(action === 'save' ? 'common.save' : 'download.test') }))
    screen.unmount()
    await act(async () => { resolving.resolve(saved); await resolving.promise })
    expect(HelperSettings.save).not.toHaveBeenCalled()
    expect(MusicDownloads.testHelper).not.toHaveBeenCalled()
    expect(mockErrors.at(-1)).toMatchObject({ name: 'AbortError' })
  })
  it('cancels an in-flight connection test when the page leaves', async () => {
    let signal!: AbortSignal
    jest.mocked(MusicDownloads.testHelper).mockImplementationOnce(async (_url, _token, provided) => {
      signal = provided!
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError'))))
    })
    const screen = mount()
    await waitFor(() => expect(screen.getByRole('button', { name: t('download.test') })).toBeEnabled())
    fireEvent.press(screen.getByRole('button', { name: t('download.test') }))
    await waitFor(() => expect(MusicDownloads.testHelper).toHaveBeenCalledTimes(1))
    await act(async () => screen.unmount())
    expect(signal.aborted).toBe(true)
    expect(mockErrors.at(-1)).toMatchObject({ name: 'AbortError' })
  })
  it('rejects connection work if a show arms during resolution', async () => {
    const resolving = deferred<HelperConnection>(); jest.mocked(HelperSettings.resolve).mockReturnValueOnce(resolving.promise)
    const screen = mount()
    await waitFor(() => expect(screen.getByRole('button', { name: t('download.test') })).toBeEnabled())
    fireEvent.press(screen.getByRole('button', { name: t('download.test') }))
    setCriticalSessionActive(true)
    await act(async () => { resolving.resolve(saved); await resolving.promise })
    expect(MusicDownloads.testHelper).not.toHaveBeenCalled()
    expect(mockErrors.at(-1)).toMatchObject({ message: 'library.armed' })
  })
  it('permits confirmed removal of unreadable pairing data and serializes repeat confirmations', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    jest.mocked(HelperSettings.read).mockRejectedValueOnce(new Error('Unreadable pairing'))
    const removing = deferred<void>(); jest.mocked(HelperSettings.remove).mockReturnValueOnce(removing.promise)
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('error.downloadHelper'))).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: t('download.forget') }))
    const confirm = alert.mock.calls[0]![2]!.find((button) => button.style === 'destructive')!.onPress!
    act(() => { confirm(); confirm() })
    expect(HelperSettings.remove).toHaveBeenCalledTimes(1)
    await act(async () => { removing.resolve(); await removing.promise })
    expect(screen.queryByText(t('error.downloadHelper'))).toBeNull()
    expect(screen.getByLabelText(t('download.address')).props.value).toBe('')
    expect(screen.getByRole('button', { name: t('download.forget') })).toBeDisabled()
  })
  it.each(['armed', 'unmounted', 'draftChanged'] as const)('rejects an obsolete forget confirmation: %s', async (reason) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    const screen = mount()
    await waitFor(() => expect(screen.getByRole('button', { name: t('download.forget') })).toBeEnabled())
    fireEvent.press(screen.getByRole('button', { name: t('download.forget') }))
    const confirm = alert.mock.calls[0]![2]!.find((button) => button.style === 'destructive')!.onPress!
    if (reason === 'armed') setCriticalSessionActive(true)
    else if (reason === 'unmounted') screen.unmount()
    else fireEvent.changeText(screen.getByLabelText(t('download.address')), 'http://different.local')
    await act(async () => confirm())
    expect(HelperSettings.remove).not.toHaveBeenCalled()
  })
})
