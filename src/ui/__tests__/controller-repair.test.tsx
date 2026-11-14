import { act, fireEvent, render, within } from '@testing-library/react-native'
import { useEffect } from 'react'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { sampleShow, type ControllerBinding, type ControllerProfile } from '../../domain'
import type { NativeControllerInput } from '../../../modules/show-controller'
import { I18nProvider, messages, useI18n, type Locale } from '../../i18n'
import { DEFAULT_LIBRARY_SETTINGS, type LibrarySnapshot } from '../../library/types'
import { ControllersScreen } from '../controller-screen'
import { BuilderScreen, LibraryScreen, OperationStatus } from '../library-screens'
import { PreflightScreen } from '../screens'
import { AppShell, WorkflowStep } from '../primitives'
import { FeedbackContext, operationErrorKey, taskRetryKey } from '../feedback'
import { WorkflowDialog } from '../workflow-components'

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn(), canGoBack: () => true }
let mockParams: { section?: string } = {}; let mockAvailable = true
const mockRemove = jest.fn(), mockRetry = jest.fn(), mockClear = jest.fn(), mockRefresh = jest.fn().mockResolvedValue(undefined), mockEnd = jest.fn().mockResolvedValue(undefined)
const baseBindings: ControllerBinding[] = [
  { adapterId: 'generic-native', deviceId: 'pedal', inputKey: 'KEYCODE_PAGE_DOWN', command: { type: 'GO' } },
  { adapterId: 'generic-native', deviceId: 'pedal', inputKey: 'KEYCODE_PAGE_UP', command: { type: 'PANIC_FADE' } },
]
const otherBindings: ControllerBinding[] = [
  { inputKey: 'KEYCODE_F1', command: { type: 'REPLAY' } }, { inputKey: 'KEYCODE_F2', command: { type: 'SKIP' } },
  { inputKey: 'KEYCODE_F3', command: { type: 'PLAY', cueId: 'opening' } }, { inputKey: 'KEYCODE_F4', command: { type: 'SELECT', cueId: 'opening' } },
  { inputKey: 'KEYCODE_F5', command: { type: 'PAUSE' } }, { inputKey: 'KEYCODE_F6', command: { type: 'RESUME' } },
  { adapterId: 'generic-native', deviceId: 'pedal', inputKey: 'KEYCODE_F8', command: { type: 'TRIGGER_HIT', cueId: 'reveal' } },
]
let mockSnapshot: LibrarySnapshot
const mockLibrary = { getSnapshot: () => mockSnapshot, removeCue: jest.fn(), createSet: jest.fn(), renameShow: jest.fn(), select: jest.fn(), history: jest.fn().mockResolvedValue([]), trash: jest.fn().mockResolvedValue([]) }
const mockApp = {
  show: sampleShow, set: sampleShow.sets[0]!, libraryState: {} as LibrarySnapshot, library: mockLibrary,
  busy: false, liveSession: false, error: null as string | null, clearError: mockClear, retryLastTask: mockRetry,
  controllerHealth: { sdkAvailable: true, bluetoothState: 'powered_on', pairedCount: 0, readyCount: 0, diagnosticMode: 'off', diagnosticSessionId: '' }, controllerInputs: [] as NativeControllerInput[], controllerScan: null,
  pairController: jest.fn(), cancelControllerPairing: jest.fn(), refreshControllers: mockRefresh, beginControllerDiagnostics: jest.fn(), endControllerDiagnostics: mockEnd,
  assignControllerInput: jest.fn(), removeControllerBinding: mockRemove, prepareTouchSession: jest.fn().mockResolvedValue(false),
  checks: { local: true, readable: true, order: true }, toggleCheck: jest.fn(), armShow: jest.fn(),
  session: { phase: 'idle', engineAvailable: true, snapshot: null, sessionPurpose: 'performance', nativeGeneration: 0, currentCueId: '', selectedCueId: '', pendingCommandIds: [], countdownRemainingMs: 0, activeVoiceCount: 0 },
  runTask: async (work: () => Promise<unknown>) => { try { await work(); return true } catch (error) { mockApp.error = String(error); return false } },
}
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }))
jest.mock('../../../modules/show-controller', () => ({ __esModule: true, default: { isAvailable: () => mockAvailable } }))
jest.mock('../BackgroundReliabilityPanel', () => ({ BackgroundReliabilityPanel: () => null }))
function LocaleSelection({ locale }: { locale: Locale }) { const { setLocale } = useI18n(); useEffect(() => setLocale(locale), [locale, setLocale]); return null }
function view(child: React.ReactNode, locale: Locale = 'en') { return <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}><I18nProvider><LocaleSelection locale={locale} />{child}</I18nProvider></SafeAreaInsetsContext.Provider> }
function actionName(binding: ControllerBinding, locale: Locale = 'en') { const action = messages[locale][`command.${binding.command.type}`]; return 'cueId' in binding.command ? messages[locale]['remote.actionTarget'].replace('{action}', action).replace('{name}', sampleShow.cues[binding.command.cueId]?.name ?? binding.command.cueId) : action }
function removeName(binding: ControllerBinding, locale: Locale = 'en') {
  const button = messages[locale]['remote.button'].replace('{key}', `\u2066${binding.inputKey}\u2069`)
  const source = messages[locale]['remote.bindingSource'].replace('{adapter}', binding.adapterId === undefined ? messages[locale]['remote.anyAdapter'] : `\u2066${binding.adapterId}\u2069`).replace('{device}', binding.deviceId === undefined ? messages[locale]['remote.anyDevice'] : `\u2066${binding.deviceId}\u2069`)
  const identity = messages[locale]['remote.bindingIdentity'].replace('{button}', button).replace('{source}', source)
  return messages[locale]['remote.removeBinding'].replace('{action}', actionName(binding, locale)).replace('{button}', identity)
}
function buttons() { const screen = render(view(<ControllersScreen />)); fireEvent.press(screen.getByRole('button', { name: messages.en['use.remote.buttons'] })); return screen }
beforeEach(() => {
  jest.clearAllMocks(); mockParams = {}; mockAvailable = true; mockApp.busy = false; mockApp.liveSession = false; mockApp.error = null; mockApp.show = sampleShow; mockApp.set = sampleShow.sets[0]!;
  const profile: ControllerProfile = { id: sampleShow.controllerProfileId!, name: 'Imported controls', bindings: [...baseBindings, ...otherBindings] }
  mockSnapshot = { status: 'ready', saving: false, shows: [sampleShow], selectedShowId: sampleShow.id, selectedSetId: mockApp.set.id, settings: DEFAULT_LIBRARY_SETTINGS, controllerProfiles: [profile] }; mockApp.libraryState = mockSnapshot
  mockLibrary.select.mockResolvedValue(undefined); mockRemove.mockResolvedValue(undefined); mockClear.mockImplementation(() => { mockApp.error = null })
  mockApp.controllerInputs = []; mockApp.controllerHealth = { ...mockApp.controllerHealth, diagnosticMode: 'off', diagnosticSessionId: '' }
  mockApp.beginControllerDiagnostics.mockImplementation(async (mode: string) => { const health = { ...mockApp.controllerHealth, diagnosticMode: mode, diagnosticSessionId: 'test-session' }; mockApp.controllerHealth = health; return health })
})

it('shows every saved nonbasic action with cue names and exact-binding removal, without adding learn actions', async () => {
  const screen = buttons(); expect(screen.getByText(messages.en['remote.otherActions'])).toBeTruthy()
  for (const binding of otherBindings) { expect(screen.getByText(actionName(binding))).toBeTruthy(); expect(screen.getByRole('button', { name: removeName(binding) })).toBeEnabled() }
  expect(screen.getAllByRole('button', { name: /^Learn ·/ })).toHaveLength(5)
  const hit = otherBindings.at(-1)!; fireEvent.press(screen.getByRole('button', { name: removeName(hit) }))
  expect(mockRemove).not.toHaveBeenCalled(); fireEvent.press(within(screen.UNSAFE_getByType(WorkflowDialog)).getByRole('button', { name: messages.en['common.delete'] }))
  await act(async () => undefined); expect(mockRemove).toHaveBeenCalledWith(hit, sampleShow.id)
})

it('names missing and outside-playlist targets instead of hiding invalid saved actions', () => {
  const profile = mockSnapshot.controllerProfiles[0]!
  mockSnapshot = { ...mockSnapshot, controllerProfiles: [{ ...profile, bindings: [...baseBindings, { inputKey: 'KEYCODE_F7', command: { type: 'TRIGGER_HIT', cueId: 'gone-hit' } }, { inputKey: 'KEYCODE_F8', command: { type: 'TRIGGER_HIT', cueId: 'opening' } }] }] }; mockApp.libraryState = mockSnapshot
  const screen = buttons(); expect(screen.getByText(messages.en['remote.targetMissing'])).toBeTruthy()
  expect(screen.getByText(messages.en['remote.targetOutsideHit'].replace('{name}', mockApp.set.name))).toBeTruthy()
  expect(screen.getByText(messages.en['error.controllerRepair'])).toBeTruthy()
  expect(screen.UNSAFE_getAllByType(WorkflowStep).find((step) => step.props.number === 2)!.props.complete).toBe(false)
})

it('distinguishes main-order actions from Hit actions and permits ordered non-audio targets', () => {
  const groupId = mockApp.set.cueOrder.find((id) => sampleShow.cues[id]?.type === 'group')!
  mockSnapshot = { ...mockSnapshot, controllerProfiles: [{ ...mockSnapshot.controllerProfiles[0]!, bindings: [...baseBindings, { inputKey: 'KEYCODE_F7', command: { type: 'SELECT', cueId: groupId } }] }] }; mockApp.libraryState = mockSnapshot
  const screen = buttons(); expect(screen.getByText(actionName(mockSnapshot.controllerProfiles[0]!.bindings.at(-1)!))).toBeTruthy(); expect(screen.UNSAFE_getAllByType(WorkflowStep).find((step) => step.props.number === 2)!.props.complete).toBe(true)
  mockSnapshot = { ...mockSnapshot, controllerProfiles: [{ ...mockSnapshot.controllerProfiles[0]!, bindings: [...baseBindings, { inputKey: 'KEYCODE_F7', command: { type: 'PLAY', cueId: 'reveal' } }] }] }; mockApp.libraryState = mockSnapshot; screen.rerender(view(<ControllersScreen />))
  expect(screen.getByText(messages.en['remote.targetOutside'].replace('{name}', mockApp.set.name))).toBeTruthy(); expect(screen.UNSAFE_getAllByType(WorkflowStep).find((step) => step.props.number === 2)!.props.complete).toBe(false)
})

it('shows received imported action targets during silent testing without claiming full action coverage', async () => {
  const screen = buttons(); fireEvent.press(screen.getByRole('button', { name: messages.en['remote.test'] })); await act(async () => undefined)
  mockApp.controllerInputs = [{ eventId: 'process:1', sourceSessionId: 'process', sequence: 1, adapterId: 'generic-native', deviceId: 'pedal', inputKey: 'KEYCODE_F8', phase: 'down', monotonicMs: 1, isRepeat: false, wasQueued: false, ageMs: 0, diagnosticMode: 'test', diagnosticSessionId: 'test-session', handledNatively: true, deliveryEvidence: 'app_received_only' }]
  screen.rerender(view(<ControllersScreen />)); expect(screen.getByLabelText(actionName(otherBindings.at(-1)!)).props.accessibilityValue.text).toBe('1'); expect(screen.queryByText(messages.en['remote.testComplete'])).toBeNull(); expect(mockRemove).not.toHaveBeenCalled()
})

it('warns explicitly that confirmed removal affects all shows sharing the profile', () => {
  mockSnapshot = { ...mockSnapshot, shows: [sampleShow, { ...sampleShow, id: 'shared-copy-1' }, { ...sampleShow, id: 'shared-copy-2' }] }; mockApp.libraryState = mockSnapshot
  const screen = buttons(); const warning = messages.en['remote.sharedRemoval'].replaceAll('{count}', '3')
  expect(screen.getByText(warning)).toBeTruthy(); fireEvent.press(screen.getByRole('button', { name: removeName(otherBindings.at(-1)!) }))
  expect(within(screen.UNSAFE_getByType(WorkflowDialog)).getByText(warning)).toBeTruthy(); expect(mockRemove).not.toHaveBeenCalled()
})

it('allows local removal without the optional native module while learning/testing stay unavailable', async () => {
  mockAvailable = false; const screen = buttons(); expect(screen.getByText(messages.en['remote.localOnly'])).toBeTruthy()
  expect(screen.getByRole('button', { name: messages.en['remote.learn'].replace('{action}', messages.en['command.GO']) })).toBeDisabled()
  expect(screen.getByRole('button', { name: messages.en['remote.test'] })).toBeDisabled()
  fireEvent.press(screen.getByRole('button', { name: removeName(otherBindings.at(-1)!) })); fireEvent.press(within(screen.UNSAFE_getByType(WorkflowDialog)).getByRole('button', { name: messages.en['common.delete'] })); await act(async () => undefined)
  expect(mockRemove).toHaveBeenCalledTimes(1); expect(mockApp.beginControllerDiagnostics).not.toHaveBeenCalled()
})

it('opens Review links directly on Buttons and retains ordinary child Back', () => {
  mockParams = { section: 'buttons' }; const screen = render(view(<ControllersScreen />)); expect(screen.getByText(messages.en['remote.otherActions'])).toBeTruthy()
  fireEvent.press(screen.getByRole('button', { name: messages.en['use.remote.connection'] })); screen.rerender(view(<ControllersScreen />)); expect(screen.getByRole('button', { name: messages.en['use.remote.connection'] }).props.accessibilityState.selected).toBe(true)
  mockParams = {}; screen.rerender(view(<ControllersScreen />)); mockParams = { section: 'buttons' }; screen.rerender(view(<ControllersScreen />)); expect(screen.getByRole('button', { name: messages.en['use.remote.buttons'] }).props.accessibilityState.selected).toBe(true)
  fireEvent.press(screen.getByRole('button', { name: messages.en['use.back'] })); expect(mockRouter.back).toHaveBeenCalledTimes(1)
})

it('keeps a stale Remove failure inside its dialog, latches repeated Delete and reviews current mappings cleanly', async () => {
  mockRemove.mockRejectedValueOnce(new Error('STALE_REVISION')); const screen = buttons(); fireEvent.press(screen.getByRole('button', { name: removeName(otherBindings.at(-1)!) }))
  const dialog = screen.UNSAFE_getByType(WorkflowDialog); fireEvent.press(within(dialog).getByRole('button', { name: messages.en['common.delete'] })); fireEvent.press(within(dialog).getByRole('button', { name: messages.en['common.delete'] })); await act(async () => undefined)
  expect(mockRemove).toHaveBeenCalledTimes(1); expect(within(dialog).getByText(messages.en['remote.mappingChanged'])).toBeTruthy(); expect(within(dialog).getByRole('button', { name: messages.en['common.delete'] })).toBeDisabled()
  fireEvent.press(within(dialog).getByRole('button', { name: messages.en['remote.reviewButtons'] })); expect(screen.UNSAFE_queryByType(WorkflowDialog)).toBeNull(); expect(mockClear).toHaveBeenCalled(); expect(mockApp.error).toBeNull(); expect(mockRouter.push).not.toHaveBeenCalled()
})

it.each(['local', 'shared'] as const)('routes %s controller failure feedback to review rather than replaying a failed edit', (host) => {
  const detail = 'Local show is invalid: CONTROLLER_INVALID.'; mockApp.error = detail
  const screen = render(view(host === 'local' ? <OperationStatus /> : <FeedbackContext.Provider value={{ feedback: null, dismiss: jest.fn(), undo: jest.fn(), failure: { detail, busy: false, retry: mockRetry, dismiss: mockClear } }}><AppShell current="/builder"><></></AppShell></FeedbackContext.Provider>))
  expect(screen.getByText(messages.en['error.controllerRepair'])).toBeTruthy(); expect(screen.queryByRole('button', { name: messages.en['common.retry'] })).toBeNull()
  fireEvent.press(screen.getByRole('button', { name: messages.en['remote.reviewButtons'] })); expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/controllers', params: { section: 'buttons' } }); expect(mockRetry).not.toHaveBeenCalled()
})

it('offers contextual touch preparation and Review for a missing Hit target despite complete GO/panic mappings', () => {
  mockSnapshot = { ...mockSnapshot, controllerProfiles: [{ ...mockSnapshot.controllerProfiles[0]!, bindings: [...baseBindings, { inputKey: 'KEYCODE_F8', command: { type: 'TRIGGER_HIT', cueId: 'gone-hit' } }] }] }; mockApp.libraryState = mockSnapshot
  const screen = render(view(<PreflightScreen />)); expect(screen.getByRole('button', { name: messages.en['remote.touchArm'] })).toBeEnabled(); expect(screen.getByRole('button', { name: messages.en['remote.reviewButtons'] })).toBeEnabled()
  expect(screen.getByRole('button', { name: messages.en['preflight.arm'] })).toBeDisabled()
})

it('keeps controller repair reachable inside the failed Hit-delete dialog and preserves the saved show', async () => {
  mockLibrary.removeCue.mockRejectedValueOnce(new Error('Local show is invalid: CONTROLLER_INVALID.')); const original = JSON.stringify(mockSnapshot)
  const screen = render(view(<BuilderScreen />)); fireEvent.press(screen.getByRole('button', { name: messages.en['use.library.manageHit'] + ' · ' + sampleShow.cues.reveal!.name })); fireEvent.press(within(screen.UNSAFE_getByType(WorkflowDialog)).getByRole('button', { name: messages.en['common.delete'] })); fireEvent.press(within(screen.UNSAFE_getByType(WorkflowDialog)).getByRole('button', { name: messages.en['common.delete'] })); await act(async () => undefined); screen.rerender(view(<BuilderScreen />))
  const dialog = screen.UNSAFE_getByType(WorkflowDialog); expect(within(dialog).getByText(messages.en['error.controllerRepair'])).toBeTruthy()
  fireEvent.press(within(dialog).getByRole('button', { name: messages.en['remote.reviewButtons'] })); await act(async () => undefined)
  expect(screen.UNSAFE_queryByType(WorkflowDialog)).toBeNull(); expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/controllers', params: { section: 'buttons' } }); expect(JSON.stringify(mockSnapshot)).toBe(original)
})

it('rejects stale modal repair navigation when the selected show changes before Review', () => {
  mockApp.error = 'CONTROLLER_INVALID'; const screen = render(view(<BuilderScreen />)); fireEvent.press(screen.getByRole('button', { name: messages.en['use.library.manageHit'] + ' · ' + sampleShow.cues.reveal!.name })); const dialog = screen.UNSAFE_getByType(WorkflowDialog)
  mockSnapshot = { ...mockSnapshot, selectedShowId: 'another-show', shows: [...mockSnapshot.shows, { ...sampleShow, id: 'another-show' }] }
  fireEvent.press(within(dialog).getByRole('button', { name: messages.en['remote.reviewButtons'] })); expect(mockRouter.push).not.toHaveBeenCalled(); expect(mockLibrary.select).not.toHaveBeenCalled(); expect(screen.UNSAFE_getByType(WorkflowDialog)).toBe(dialog)
})

it('retains a typed new-playlist draft through failed Create, Review Buttons and return', async () => {
  mockLibrary.createSet.mockRejectedValueOnce(new Error('CONTROLLER_INVALID')); const screen = render(view(<BuilderScreen />)); fireEvent.press(screen.getByRole('button', { name: messages.en['library.playlists'] })); let dialog = screen.UNSAFE_getByType(WorkflowDialog)
  fireEvent.changeText(within(dialog).getByLabelText(messages.en['common.name']), 'Draft encore'); fireEvent.press(within(dialog).getByRole('button', { name: messages.en['library.newPlaylist'] })); await act(async () => undefined); screen.rerender(view(<BuilderScreen />)); dialog = screen.UNSAFE_getByType(WorkflowDialog)
  fireEvent.press(within(dialog).getByRole('button', { name: messages.en['remote.reviewButtons'] })); await act(async () => undefined); expect(screen.UNSAFE_queryByType(WorkflowDialog)).toBeNull()
  fireEvent.press(screen.getByRole('button', { name: messages.en['library.playlists'] })); expect(within(screen.UNSAFE_getByType(WorkflowDialog)).getByLabelText(messages.en['common.name']).props.value).toBe('Draft encore'); expect(mockLibrary.createSet).toHaveBeenCalledTimes(1)
})

it('retains a failed show-name draft when leaving its modal to review mappings', async () => {
  mockLibrary.renameShow.mockRejectedValueOnce(new Error('CONTROLLER_INVALID')); const screen = render(view(<LibraryScreen />)); const manageName = messages.en['common.manage'] + ' · ' + sampleShow.name
  fireEvent.press(screen.getByRole('button', { name: manageName })); fireEvent.press(within(screen.UNSAFE_getByType(WorkflowDialog)).getByRole('button', { name: messages.en['common.rename'] })); fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), 'Pending show name'); fireEvent.press(screen.getByRole('button', { name: messages.en['common.save'] })); await act(async () => undefined); screen.rerender(view(<LibraryScreen />))
  fireEvent.press(within(screen.UNSAFE_getByType(WorkflowDialog)).getByRole('button', { name: messages.en['remote.reviewButtons'] })); await act(async () => undefined)
  fireEvent.press(screen.getByRole('button', { name: manageName })); fireEvent.press(within(screen.UNSAFE_getByType(WorkflowDialog)).getByRole('button', { name: messages.en['common.rename'] })); expect(screen.getByLabelText(messages.en['common.name']).props.value).toBe('Pending show name'); expect(mockApp.show.name).toBe(sampleShow.name)
})

it.each(['native refresh failed', 'backup cache unavailable'])('does not replay an older failed edit for a postcommit controller refresh warning: %s', (nativeDetail) => {
  const detail = 'CONTROLLER_SETUP_FAILED: ' + nativeDetail; const screen = render(view(<FeedbackContext.Provider value={{ feedback: null, dismiss: jest.fn(), undo: jest.fn(), failure: { detail, busy: false, retry: mockRetry, dismiss: mockClear } }}><AppShell current="/builder">{null}</AppShell></FeedbackContext.Provider>))
  expect(screen.getByText(messages.en['controllers.touchFallback'])).toBeTruthy(); fireEvent.press(screen.getByRole('button', { name: messages.en['remote.reviewButtons'] })); expect(mockRetry).not.toHaveBeenCalled(); expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/controllers', params: { section: 'buttons' } })
})

it.each(['en', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ar'] as const)('labels saved targets and shared-profile consequences in %s', (locale) => {
  mockParams = { section: 'buttons' }; mockSnapshot = { ...mockSnapshot, shows: [sampleShow, { ...sampleShow, id: 'copy' }] }; mockApp.libraryState = mockSnapshot
  const screen = render(view(<ControllersScreen />, locale)); expect(screen.getByText(messages[locale]['remote.otherActions'])).toBeTruthy(); expect(screen.getByText(messages[locale]['remote.sharedRemoval'].replaceAll('{count}', '2'))).toBeTruthy(); expect(screen.getByRole('button', { name: removeName(otherBindings.at(-1)!, locale) })).toBeEnabled()
})

it('classifies only controller preparation faults as repair actions', () => {
  for (const detail of ['CONTROLLER_INVALID', 'CONTROLLER_MISSING', 'The selected controller profile targets a missing Hit cue.']) { expect(operationErrorKey(detail)).toBe('error.controllerRepair'); expect(taskRetryKey(detail)).toBe('remote.reviewButtons') }
  expect(operationErrorKey('The controller is busy')).toBe('common.errorHelp'); expect(operationErrorKey('CONTROLLER_SETUP_FAILED: unavailable')).toBe('controllers.touchFallback'); expect(taskRetryKey('Invalid ZIP')).toBe('common.retry')
  expect(operationErrorKey('Backup contains an invalid show: CONTROLLER_INVALID.')).toBe('error.backupInvalid'); expect(taskRetryKey('Backup contains an invalid show: CONTROLLER_INVALID.')).toBe('common.retry')
})
