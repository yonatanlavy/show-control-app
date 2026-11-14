import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import { AppState, Modal, type AppStateStatus } from 'react-native'
import type { ControllerHealth, ControllerScanEvent, NativeControllerInput } from '../../../modules/show-controller'
import { sampleShow } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import { ControllersScreen } from '../controller-screen'

const health: ControllerHealth = { sdkAvailable: true, configured: true, restored: true, bluetoothState: 'powered_on', pairedCount: 0, readyCount: 0, connectingCount: 0, staleEventsSuppressed: 0, backgroundRequested: false, initialPairingMayRequireInternet: true, detail: '', diagnosticMode: 'off', diagnosticSessionId: '', genericKeyboardConnected: true }
const mockBegin = jest.fn(async (mode: 'learn' | 'test') => { const result: ControllerHealth = { ...health, diagnosticMode: mode, diagnosticSessionId: 'usability-session' }; mockApp.controllerHealth = result; return result })
const mockEnd = jest.fn().mockResolvedValue(undefined)
const mockPair = jest.fn().mockResolvedValue(undefined)
const mockCancelPair = jest.fn()
const mockAssign = jest.fn().mockResolvedValue(undefined)
const mockRemove = jest.fn().mockResolvedValue(undefined)
const mockRefresh = jest.fn().mockResolvedValue(undefined)
const mockApp = {
  show: sampleShow,
  libraryState: { status: 'ready', saving: false, controllerProfiles: [], error: null },
  controllerHealth: { ...health }, controllerInputs: [] as NativeControllerInput[], controllerScan: null as ControllerScanEvent | null,
  busy: false, liveSession: false, error: null, clearError: jest.fn(), retryLastTask: jest.fn(),
  pairController: mockPair, cancelControllerPairing: mockCancelPair, refreshControllers: mockRefresh,
  beginControllerDiagnostics: mockBegin, endControllerDiagnostics: mockEnd,
  assignControllerInput: mockAssign, removeControllerBinding: mockRemove,
  runTask: async (work: () => Promise<unknown>) => { try { await work(); return true } catch { return false } },
}
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('../../../modules/show-controller', () => ({ __esModule: true, default: { isAvailable: () => true } }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useLocalSearchParams: () => ({}) }))
const wrap = () => <I18nProvider><ControllersScreen /></I18nProvider>
const learnGo = messages.en['remote.learn'].replace('{action}', messages.en['command.GO'])

describe('focused remote setup', () => {
  beforeEach(() => { jest.clearAllMocks(); mockApp.controllerHealth = { ...health }; mockApp.controllerInputs = []; mockApp.controllerScan = null; mockApp.busy = false; mockApp.liveSession = false })

  it('groups separate media play and pause receipts without double-counting or changing bindings', async () => {
    const screen = render(wrap())
    fireEvent.press(screen.getByRole('button', { name: messages.en['remote.test'] }))
    await waitFor(() => expect(mockBegin).toHaveBeenCalledWith('test'))
    const mediaPress = (sequence: number, inputKey: string, changes: Partial<NativeControllerInput> = {}): NativeControllerInput => ({ eventId: `media:${sequence}`, sourceSessionId: 'media', sequence, adapterId: 'system-media', deviceId: 'system-media', inputKey, phase: 'down', monotonicMs: sequence, isRepeat: false, wasQueued: false, ageMs: 0, deliveryEvidence: 'app_received_only', diagnosticMode: 'test', diagnosticSessionId: 'usability-session', handledNatively: true, ...changes })
    const play = mediaPress(1, 'MEDIA_PLAY'); const pause = mediaPress(2, 'MEDIA_PAUSE')
    mockApp.controllerInputs = [play, pause, play, mediaPress(3, 'MEDIA_PAUSE', { isRepeat: true }), mediaPress(4, 'MEDIA_PLAY', { diagnosticSessionId: 'expired' })]
    screen.rerender(wrap())
    expect(screen.getByLabelText(messages.en['command.PAUSE_RESUME']).props.accessibilityValue.text).toBe('2')
    expect(screen.getByText(messages.en['remote.testCount'].replace('{count}', '2'))).toBeTruthy()
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(20)
    expect(screen.queryByText(messages.en['remote.testComplete'])).toBeNull()
    mockApp.controllerInputs = Array.from({ length: 10 }, (_, index) => mediaPress(index + 1, index % 2 ? 'MEDIA_PAUSE' : 'MEDIA_PLAY'))
    screen.rerender(wrap())
    expect(screen.getByLabelText(messages.en['command.PAUSE_RESUME']).props.accessibilityValue.text).toBe('10')
    expect(screen.getByText(messages.en['remote.testCount'].replace('{count}', '10'))).toBeTruthy()
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(100)
    expect(screen.getByText(messages.en['remote.testComplete'])).toBeTruthy()
    expect(mockAssign).not.toHaveBeenCalled(); expect(mockRemove).not.toHaveBeenCalled()
  })

  it('keeps silent testing outside the scrolling setup and secondary guidance collapsed', async () => {
    const screen = render(wrap())
    expect(within(screen.getByTestId('app-bottom-section')).getByRole('button', { name: messages.en['remote.test'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: messages.en['use.remote.details'] }).props.accessibilityState.expanded).toBe(false)
    expect(screen.queryByText(messages.en['remote.scope'])).toBeNull()
    expect(screen.queryByRole('button', { name: learnGo })).toBeNull()
    expect(mockBegin).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['remote.test'] }))
    await waitFor(() => expect(mockBegin).toHaveBeenCalledWith('test'))
    expect(screen.UNSAFE_queryByType(Modal)).toBeNull()
    expect(mockAssign).not.toHaveBeenCalled()
  })

  it('switches sections without starting diagnostics, pairing or saving, and retains the remote kind', () => {
    const screen = render(wrap())
    fireEvent.press(screen.getByRole('button', { name: messages.en['remote.custom'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.remote.buttons'] }))
    expect(screen.getByRole('button', { name: messages.en['use.remote.buttons'] }).props.accessibilityState.selected).toBe(true)
    expect(screen.getByRole('button', { name: learnGo })).toBeTruthy()
    expect(screen.queryByText(messages.en['use.remote.customGuide'])).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.remote.check'] }))
    expect(screen.getByText(messages.en['remote.testHelp'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: learnGo })).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.remote.connection'] }))
    expect(screen.getByRole('button', { name: messages.en['remote.custom'] }).props.accessibilityState.selected).toBe(true)
    expect(screen.getByText(messages.en['use.remote.customGuide'])).toBeTruthy()
    expect(mockBegin).not.toHaveBeenCalled(); expect(mockPair).not.toHaveBeenCalled(); expect(mockAssign).not.toHaveBeenCalled(); expect(mockRemove).not.toHaveBeenCalled()
  })

  it('provides a direct next step from connection to button assignment', () => {
    const screen = render(wrap())
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.remote.assignNext'] }))
    expect(screen.getByRole('button', { name: learnGo })).toBeTruthy()
    expect(screen.getByRole('button', { name: messages.en['use.remote.buttons'] }).props.accessibilityState.selected).toBe(true)
    expect(mockBegin).not.toHaveBeenCalled()
  })

  it('ends diagnostics on Close and returns to the same focused section', async () => {
    const screen = render(wrap())
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.remote.buttons'] }))
    fireEvent.press(screen.getByRole('button', { name: learnGo }))
    await waitFor(() => expect(screen.getByRole('button', { name: messages.en['remote.save'] })).toBeDisabled())
    const previousEnds = mockEnd.mock.calls.length
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.close'] }))
    await waitFor(() => expect(screen.getByRole('button', { name: learnGo })).toBeTruthy())
    expect(mockEnd.mock.calls.length).toBeGreaterThan(previousEnds)
    expect(screen.getByRole('button', { name: messages.en['use.remote.buttons'] }).props.accessibilityState.selected).toBe(true)
    expect(mockAssign).not.toHaveBeenCalled()
  })

  it('expires the shortcut test when backgrounded and ends capture on unmount', async () => {
    let change!: (state: AppStateStatus) => void
    const previous = AppState.addEventListener
    AppState.addEventListener = (_event, callback) => { change = callback; return { remove: jest.fn() } }
    try {
      const screen = render(wrap())
      fireEvent.press(screen.getByRole('button', { name: messages.en['remote.test'] }))
      await waitFor(() => expect(mockBegin).toHaveBeenCalledWith('test'))
      const previousEnds = mockEnd.mock.calls.length
      act(() => change('background'))
      expect(screen.getByText(messages.en['remote.expired'])).toBeTruthy()
      expect(mockEnd.mock.calls.length).toBeGreaterThan(previousEnds)
      const beforeUnmount = mockEnd.mock.calls.length
      screen.unmount()
      expect(mockEnd.mock.calls.length).toBeGreaterThan(beforeUnmount)
      expect(mockAssign).not.toHaveBeenCalled()
    } finally { AppState.addEventListener = previous }
  })

  it('keeps pairing cancellation visible across sections and prevents competing setup', () => {
    mockApp.controllerScan = { state: 'scanning', detail: '', initialPairingMayRequireInternet: true }
    const screen = render(wrap())
    expect(screen.getByRole('button', { name: messages.en['remote.test'] })).toBeDisabled()
    expect(screen.getByRole('button', { name: messages.en['remote.custom'] })).toBeDisabled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.remote.buttons'] }))
    expect(screen.getByRole('button', { name: learnGo })).toBeDisabled()
    expect(screen.getByText(messages.en['remote.pairing'])).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.cancel'] }))
    expect(mockCancelPair).toHaveBeenCalled()
    expect(mockBegin).not.toHaveBeenCalled()
  })
})
