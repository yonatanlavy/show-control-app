import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { AppState, BackHandler, Modal, type AppStateStatus } from 'react-native'
import type { ControllerHealth, ControllerScanEvent, NativeControllerInput } from '../../../modules/show-controller'
import { sampleShow } from '../../domain'
import { I18nProvider, messages, useI18n, type Locale } from '../../i18n'
import { ControllersScreen } from '../controller-screen'
import { Button } from '../primitives'

const baseHealth: ControllerHealth = { sdkAvailable: true, configured: true, restored: true, bluetoothState: 'powered_on', pairedCount: 0, readyCount: 0, connectingCount: 0, staleEventsSuppressed: 0, backgroundRequested: false, initialPairingMayRequireInternet: true, detail: '', diagnosticMode: 'off', diagnosticSessionId: '', genericKeyboardConnected: true }
const mockRefresh = jest.fn().mockResolvedValue(undefined); const mockEnd = jest.fn().mockResolvedValue(undefined); const mockAssign = jest.fn().mockResolvedValue(undefined); const mockRemove = jest.fn().mockResolvedValue(undefined); const mockCancel = jest.fn()
const mockPush = jest.fn()
const mockDismissTo = jest.fn()
const mockBegin = jest.fn<Promise<ControllerHealth>, ['learn' | 'test']>(async (mode) => { const health: ControllerHealth = { ...baseHealth, diagnosticMode: mode, diagnosticSessionId: 'fresh' }; mockApp.controllerHealth = health; return health })
let mockAvailable = true
const mockApp = {
  show: sampleShow, libraryState: { status: 'ready', saving: false, controllerProfiles: [{ id: sampleShow.controllerProfileId!, name: 'Show', bindings: [{ adapterId: 'generic-native', deviceId: 'pedal', inputKey: 'KEYCODE_PAGE_DOWN', command: { type: 'GO' as const } }, { adapterId: 'generic-native', deviceId: 'pedal', inputKey: 'KEYCODE_PAGE_UP', command: { type: 'PANIC_FADE' as const } }] }], error: null },
  controllerHealth: baseHealth, controllerInputs: [] as NativeControllerInput[], controllerScan: null as ControllerScanEvent | null, busy: false, liveSession: false, error: null, clearError: jest.fn(), retryLastTask: jest.fn(),
  pairController: jest.fn(), cancelControllerPairing: mockCancel, refreshControllers: mockRefresh, beginControllerDiagnostics: mockBegin, endControllerDiagnostics: mockEnd, assignControllerInput: mockAssign, removeControllerBinding: mockRemove,
  runTask: async (work: () => Promise<unknown>) => { try { await work(); return true } catch { return false } },
}
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('../../../modules/show-controller', () => ({ __esModule: true, default: { isAvailable: () => mockAvailable } }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, dismissTo: mockDismissTo }), useLocalSearchParams: () => ({}) }))
const wrap = () => <I18nProvider><ControllersScreen /></I18nProvider>
function LocalizedRemote({ locale }: { locale: Locale }) {
  const { setLocale } = useI18n()
  return <><Button label="Test language" onPress={() => setLocale(locale)} /><ControllersScreen /></>
}
const renderButtons = () => { const screen = render(wrap()); fireEvent.press(screen.getByRole('button', { name: messages.en['use.remote.buttons'] })); return screen }
const learnGo = () => messages.en['remote.learn'].replace('{action}', messages.en['command.GO'])
const press = (sequence: number, changes: Partial<NativeControllerInput> = {}): NativeControllerInput => ({ eventId: `process:${sequence}`, sourceSessionId: 'process', sequence, adapterId: 'generic-native', deviceId: 'pedal', inputKey: 'KEYCODE_PAGE_DOWN', phase: 'down', monotonicMs: sequence, isRepeat: false, wasQueued: false, ageMs: 0, deliveryEvidence: 'app_received_only', diagnosticMode: 'learn', diagnosticSessionId: 'fresh', handledNatively: true, ...changes })

describe('remote hub and silent workflows', () => {
  beforeEach(() => { jest.clearAllMocks(); mockAvailable = true; mockApp.busy = false; mockApp.liveSession = false; mockApp.show = sampleShow; mockApp.controllerHealth = { ...baseHealth }; mockApp.controllerInputs = []; mockApp.controllerScan = null; mockBegin.mockImplementation(async (mode) => { const health = { ...baseHealth, diagnosticMode: mode, diagnosticSessionId: 'fresh' }; mockApp.controllerHealth = health; return health }) })
  it.each(['en', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ar'] as const)('explains keyboard editing safety in %s without starting diagnostics', async (locale) => {
    const screen = render(<I18nProvider><LocalizedRemote locale={locale} /></I18nProvider>)
    fireEvent.press(screen.getByRole('button', { name: 'Test language' }))
    fireEvent.press(screen.getByRole('button', { name: messages[locale]['remote.custom'] }))
    expect(screen.getByText(messages[locale]['remote.typingHelp'])).toBeTruthy()
    expect(mockBegin).not.toHaveBeenCalled()
    expect(mockAssign).not.toHaveBeenCalled()
    await act(async () => undefined)
  })
  it('includes all four media actions, separates panic, and exposes custom remote guidance', () => {
    const screen = render(wrap()); expect(screen.getByText(messages.en['remote.headline'])).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.remote.check'] }))
    const guide = screen.getByRole('button', { name: messages.en['remote.controls'] })
    expect(guide.props.accessibilityState.expanded).toBe(false)
    fireEvent.press(guide)
    expect(guide.props.accessibilityState.expanded).toBe(true)
    for (const key of ['remote.goHelp', 'remote.pauseHelp', 'remote.previousHelp', 'remote.stopHelp', 'remote.panicHelp'] as const) expect(screen.getAllByText(messages.en[key]).length).toBeGreaterThan(0)
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.remote.connection'] })); fireEvent.press(screen.getByRole('button', { name: messages.en['remote.custom'] })); expect(screen.getByText(messages.en['use.remote.customGuide'])).toBeTruthy()
  })
  it('returns to More through the highlighted navigation item', () => {
    const screen = render(wrap()); fireEvent.press(screen.getByRole('button', { name: messages.en['nav.more'] })); expect(mockDismissTo).toHaveBeenCalledWith('/more'); expect(mockPush).not.toHaveBeenCalled()
  })
  it('does not abort pairing for a temporary system confirmation pause, but cancels on leaving', () => {
    let change!: (state: AppStateStatus) => void
    const previous = AppState.addEventListener
    AppState.addEventListener = (_type, callback) => { change = callback; return { remove: jest.fn() } }
    try { const screen = render(wrap()); const before = mockCancel.mock.calls.length; act(() => change('background')); expect(mockCancel.mock.calls.length).toBe(before); screen.unmount(); expect(mockCancel.mock.calls.length).toBeGreaterThan(before) } finally { AppState.addEventListener = previous }
  })
  it.each(['failed', 'cancelled', 'paired'])('clears pairing activity after native %s and keeps setup available', async (state) => {
    mockApp.controllerScan = { state: 'scanning', detail: '', initialPairingMayRequireInternet: true }
    const screen = render(wrap())
    expect(screen.getByText(messages.en['remote.pairing'])).toBeTruthy()
    mockApp.controllerScan = { ...mockApp.controllerScan, state }
    screen.rerender(wrap())
    expect(screen.queryByText(messages.en['remote.pairing'])).toBeNull()
    expect(screen.getByRole('button', { name: messages.en['remote.test'] })).toBeEnabled()
    await act(async () => undefined)
  })
  it.each(['learn', 'test'] as const)('keeps %s in the native key capture window and closes back to the hub', async (mode) => {
    const screen = render(wrap())
    if (mode === 'learn') fireEvent.press(screen.getByRole('button', { name: messages.en['use.remote.buttons'] }))
    fireEvent.press(screen.getByRole('button', { name: mode === 'learn' ? learnGo() : messages.en['remote.test'] }))
    await waitFor(() => expect(mockBegin).toHaveBeenCalledWith(mode))
    expect(screen.UNSAFE_queryByType(Modal)).toBeNull()
    expect(screen.queryByText(messages.en['remote.headline'])).toBeNull()
    const calls = mockEnd.mock.calls.length
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.close'] }))
    await waitFor(() => expect(screen.getByText(messages.en['remote.headline'])).toBeTruthy())
    expect(mockEnd.mock.calls.length).toBeGreaterThan(calls)
  })
  it('consumes Android Back to end a silent diagnostic session before returning to the hub', async () => {
    const add = jest.spyOn(BackHandler, 'addEventListener')
    try {
      const screen = renderButtons()
      fireEvent.press(screen.getByRole('button', { name: learnGo() }))
      await waitFor(() => expect(mockBegin).toHaveBeenCalledWith('learn'))
      const handler = add.mock.calls.find(([event]) => event === 'hardwareBackPress')?.[1]
      expect(handler).toBeTruthy()
      const calls = mockEnd.mock.calls.length
      act(() => { expect(handler?.({ type: 'hardwareBackPress', timeStamp: 1 })).toBe(true) })
      await waitFor(() => expect(screen.getByText(messages.en['remote.headline'])).toBeTruthy())
      expect(mockEnd.mock.calls.length).toBeGreaterThan(calls)
    } finally { add.mockRestore() }
  })
  it('learns a captured diagnostic button for the original show and requires explicit save', async () => {
    const screen = renderButtons(); fireEvent.press(screen.getByRole('button', { name: learnGo() })); await waitFor(() => expect(mockBegin).toHaveBeenCalledWith('learn'))
    expect(screen.getByRole('button', { name: messages.en['remote.save'] })).toBeDisabled()
    mockApp.controllerInputs = [press(1)]; screen.rerender(wrap()); expect(screen.getByRole('button', { name: messages.en['remote.save'] })).toBeEnabled(); expect(mockAssign).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['remote.save'] })); await waitFor(() => expect(mockAssign).toHaveBeenCalledWith({ type: 'GO' }, press(1), sampleShow.id))
  })
  it.each([{ isRepeat: true }, { wasQueued: true }, { phase: 'up' as const }, { diagnosticSessionId: 'old' }, { ageMs: 7 }])('keeps save disabled for ineligible presses %j', async (changes) => {
    const screen = renderButtons(); fireEvent.press(screen.getByRole('button', { name: learnGo() })); await waitFor(() => expect(mockBegin).toHaveBeenCalled()); mockApp.controllerInputs = [press(1, changes)]; screen.rerender(wrap()); expect(screen.getByRole('button', { name: messages.en['remote.save'] })).toBeDisabled(); expect(mockAssign).not.toHaveBeenCalled()
  })
  it('shows a replacement warning before a button is assigned to another action', async () => {
    const screen = renderButtons(); fireEvent.press(screen.getByRole('button', { name: messages.en['remote.learn'].replace('{action}', messages.en['command.STOP_ALL']) })); await waitFor(() => expect(mockBegin).toHaveBeenCalled()); mockApp.controllerInputs = [press(1)]; screen.rerender(wrap()); expect(screen.getByText(messages.en['remote.replace'].replace('{action}', 'GO'))).toBeTruthy(); expect(mockAssign).not.toHaveBeenCalled()
  })
  it('counts ten mapped presses, excluding unknown, repeat, queued and previous-session inputs', async () => {
    const screen = render(wrap()); fireEvent.press(screen.getByRole('button', { name: messages.en['remote.test'] })); await waitFor(() => expect(mockBegin).toHaveBeenCalledWith('test'))
    mockApp.controllerInputs = [...Array.from({ length: 10 }, (_, index) => press(index + 1, { diagnosticMode: 'test' })), press(11, { inputKey: 'UNKNOWN' }), press(12, { isRepeat: true }), press(13, { wasQueued: true }), press(14, { diagnosticSessionId: 'old' })]; screen.rerender(wrap())
    expect(screen.getByText(messages.en['remote.testComplete'])).toBeTruthy(); expect(screen.getByText(messages.en['remote.unknownCount'].replace('{count}', '1'))).toBeTruthy(); expect(mockAssign).not.toHaveBeenCalled()
  })
  it('invalidates learning after native background expiry and after changing the show', async () => {
    const screen = renderButtons(); fireEvent.press(screen.getByRole('button', { name: learnGo() })); await waitFor(() => expect(mockBegin).toHaveBeenCalled()); mockApp.controllerInputs = [press(1)]; mockApp.controllerHealth = { ...baseHealth }; screen.rerender(wrap()); expect(screen.getByText(messages.en['remote.expired'])).toBeTruthy(); expect(screen.queryByRole('button', { name: messages.en['remote.save'] })).toBeNull()
    mockApp.show = { ...sampleShow, id: 'different-show' }; screen.rerender(wrap()); await waitFor(() => expect(screen.queryByText(messages.en['remote.expired'])).toBeNull()); expect(mockAssign).not.toHaveBeenCalled()
  })
  it('ends a native setup request that finishes after navigation away', async () => {
    let finish!: (health: ControllerHealth) => void; mockBegin.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const screen = renderButtons(); fireEvent.press(screen.getByRole('button', { name: learnGo() })); screen.unmount(); const calls = mockEnd.mock.calls.length
    await act(async () => { finish({ ...baseHealth, diagnosticMode: 'learn', diagnosticSessionId: 'late' }) }); expect(mockEnd.mock.calls.length).toBeGreaterThan(calls)
  })
  it('admits only one setup request when a button receives rapid duplicate taps', async () => {
    let finish!: (health: ControllerHealth) => void
    mockBegin.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const screen = renderButtons(); const learn = screen.getByRole('button', { name: learnGo() })
    act(() => { fireEvent.press(learn); fireEvent.press(learn) })
    expect(mockBegin).toHaveBeenCalledTimes(1)
    await act(async () => { const health: ControllerHealth = { ...baseHealth, diagnosticMode: 'learn', diagnosticSessionId: 'fresh' }; mockApp.controllerHealth = health; finish(health) })
    expect(screen.getByRole('button', { name: messages.en['remote.save'] })).toBeDisabled()
  })
  it('offers retry inside the dialog when native setup fails', async () => {
    mockBegin.mockRejectedValueOnce(new Error('native setup refused'))
    const screen = renderButtons(); fireEvent.press(screen.getByRole('button', { name: learnGo() }))
    await waitFor(() => expect(screen.getByRole('button', { name: messages.en['common.retry'] })).toBeTruthy()); expect(screen.queryByRole('button', { name: messages.en['remote.save'] })).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] })); await waitFor(() => expect(screen.getByRole('button', { name: messages.en['remote.save'] })).toBeDisabled())
  })
  it('does not count duplicate delivery of the same native event as ten presses', async () => {
    const screen = render(wrap()); fireEvent.press(screen.getByRole('button', { name: messages.en['remote.test'] })); await waitFor(() => expect(mockBegin).toHaveBeenCalledWith('test'))
    mockApp.controllerInputs = Array.from({ length: 10 }, () => press(1, { diagnosticMode: 'test' })); screen.rerender(wrap())
    expect(screen.queryByText(messages.en['remote.testComplete'])).toBeNull(); expect(screen.getByText(messages.en['remote.testCount'].replace('{count}', '1'))).toBeTruthy()
  })
  it('disables learning and testing while armed or without the native module', () => {
    mockApp.liveSession = true; const screen = renderButtons(); expect(screen.getByRole('button', { name: learnGo() })).toBeDisabled(); expect(screen.getByRole('button', { name: messages.en['remote.test'] })).toBeDisabled(); expect(mockRefresh).not.toHaveBeenCalled()
    mockApp.liveSession = false; mockAvailable = false; screen.rerender(wrap()); expect(screen.getByText(messages.en['controllers.touchFallback'])).toBeTruthy(); expect(screen.getByRole('button', { name: learnGo() })).toBeDisabled()
  })
  it('asks before removing a binding and does not remove on cancel', async () => {
    const screen = renderButtons(); const remove = screen.getByRole('button', { name: /^Remove GO · Button ·/ }); expect(remove.props.accessibilityLabel).toContain('KEYCODE_PAGE_DOWN'); expect(remove.props.accessibilityLabel).toContain('generic-native'); expect(remove.props.accessibilityLabel).toContain('pedal'); fireEvent.press(remove); expect(screen.UNSAFE_getByType(Modal)).toBeTruthy(); expect(screen.getByText(messages.en['remote.removeHelp'])).toBeTruthy(); expect(mockRemove).not.toHaveBeenCalled(); fireEvent.press(screen.getByRole('button', { name: messages.en['common.cancel'] })); expect(mockRemove).not.toHaveBeenCalled()
  })
})
