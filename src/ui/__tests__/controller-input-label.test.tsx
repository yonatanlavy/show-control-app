import { act, fireEvent, render, within } from '@testing-library/react-native'
import { useEffect } from 'react'
import { StyleSheet, Text } from 'react-native'
import type { NativeControllerInput } from '../../../modules/show-controller'
import { sampleShow, type ControllerBinding, type ControllerProfile } from '../../domain'
import { I18nProvider, messages, useI18n, type Locale, type MessageKey } from '../../i18n'
import { ControllersScreen } from '../controller-screen'
import { controllerInputLabel } from '../controller-input-label'
import { WorkflowDialog } from '../workflow-components'

const mockRemove = jest.fn().mockResolvedValue(undefined)
const mockApp = {
  show: sampleShow, libraryState: { status: 'ready', saving: false, shows: [sampleShow], selectedSetId: sampleShow.sets[0]!.id, controllerProfiles: [] as ControllerProfile[] },
  busy: false, liveSession: false, error: null, clearError: jest.fn(), retryLastTask: jest.fn(),
  controllerHealth: { sdkAvailable: true, bluetoothState: 'powered_on', pairedCount: 0, readyCount: 0, diagnosticMode: 'off', diagnosticSessionId: '' }, controllerInputs: [] as NativeControllerInput[], controllerScan: null,
  pairController: jest.fn(), cancelControllerPairing: jest.fn(), refreshControllers: jest.fn().mockResolvedValue(undefined), beginControllerDiagnostics: jest.fn(), endControllerDiagnostics: jest.fn().mockResolvedValue(undefined),
  assignControllerInput: jest.fn(), removeControllerBinding: mockRemove,
  runTask: async (work: () => Promise<unknown>) => { await work(); return true },
}
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), dismissTo: jest.fn() }), useLocalSearchParams: () => ({ section: 'buttons' }) }))
jest.mock('../../../modules/show-controller', () => ({ __esModule: true, default: { isAvailable: () => true } }))
const cases = [
  { name: 'restored and learned inputs', identities: [{ adapterId: 'unbound', deviceId: 'logical-device-1' }, { adapterId: 'generic-native', deviceId: 'learned-pedal' }] },
  { name: 'two identified remotes', identities: [{ adapterId: 'generic-native', deviceId: 'pedal-left' }, { adapterId: 'generic-native', deviceId: 'pedal-right' }] },
] as const

beforeEach(() => {
  jest.clearAllMocks(); mockApp.show = sampleShow; mockApp.controllerInputs = []; mockApp.controllerHealth = { ...mockApp.controllerHealth, diagnosticMode: 'off', diagnosticSessionId: '' }
  mockApp.beginControllerDiagnostics.mockImplementation(async (mode: string) => { mockApp.controllerHealth = { ...mockApp.controllerHealth, diagnosticMode: mode, diagnosticSessionId: 'identity-session' }; return mockApp.controllerHealth })
})

function translate(locale: Locale) { return (key: MessageKey, params: Readonly<Record<string, string | number>> = {}) => Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), messages[locale][key]) }
function SelectLocale({ locale }: { locale: Locale }) { const { setLocale } = useI18n(); useEffect(() => setLocale(locale), [locale, setLocale]); return null }
function view(locale: Locale = 'en') { return <I18nProvider><SelectLocale locale={locale} /><ControllersScreen /></I18nProvider> }
function profile(bindings: ControllerBinding[]) { mockApp.libraryState.controllerProfiles = [{ id: sampleShow.controllerProfileId!, name: 'Identity fixture', bindings }] }

it.each(cases)('identifies both same-key GO mappings before removing either: $name', async ({ identities }) => {
  const bindings: ControllerBinding[] = identities.map((identity) => ({ ...identity, inputKey: 'KEYCODE_PAGE_DOWN', command: { type: 'GO' } }))
  mockApp.libraryState.controllerProfiles = [{ id: sampleShow.controllerProfileId!, name: 'Identity fixture', bindings: [...bindings, { inputKey: 'KEYCODE_PAGE_UP', command: { type: 'PANIC_FADE' } }] }]
  const screen = render(<I18nProvider><ControllersScreen /></I18nProvider>)
  const removes = screen.getAllByRole('button', { name: /Remove.*GO/ })
  expect(removes).toHaveLength(2)
  expect(new Set(removes.map((node) => node.props.accessibilityLabel)).size).toBe(2)
  for (const [index, identity] of identities.entries()) {
    expect(screen.getAllByText(new RegExp(identity.deviceId)).length).toBeGreaterThan(0)
    expect(removes[index]!.props.accessibilityLabel).toContain(identity.adapterId)
    expect(removes[index]!.props.accessibilityLabel).toContain(identity.deviceId)
    expect(removes[index]!.props.accessibilityLabel).toContain('KEYCODE_PAGE_DOWN')
    fireEvent.press(removes[index]!)
    const dialog = screen.UNSAFE_getByType(WorkflowDialog)
    const confirmation = dialog.findAllByType(Text).map((node) => node.props.children).filter((value): value is string => typeof value === 'string').join(' ')
    expect(confirmation).toContain(identity.adapterId); expect(confirmation).toContain(identity.deviceId); expect(confirmation).toContain('KEYCODE_PAGE_DOWN')
    fireEvent.press(within(dialog).getByRole('button', { name: messages.en['common.cancel'] })); await act(async () => undefined)
  }
  expect(mockRemove).not.toHaveBeenCalled()
})

it.each(['KEYCODE_PAGE_DOWN', 'HID_KEY_PAGE_DOWN', 'MEDIA_PAGE_DOWN'])('retains the complete raw key %s rather than collapsing its prefix', (inputKey) => {
  const label = controllerInputLabel({ inputKey, adapterId: 'generic-native', deviceId: 'pedal' }, translate('en'))
  expect(label.button).toContain(`\u2066${inputKey}\u2069`); expect(label.full).toContain(inputKey)
  const alternatives = ['KEYCODE_PAGE_DOWN', 'HID_KEY_PAGE_DOWN', 'MEDIA_PAGE_DOWN'].map((key) => controllerInputLabel({ inputKey: key, adapterId: 'generic-native', deviceId: 'pedal' }, translate('en')).full)
  expect(new Set(alternatives).size).toBe(3)
})

it.each(Object.keys(messages) as Locale[])('explains unbound, wildcard and shared identities in %s without claiming hardware health', (locale) => {
  const t = translate(locale)
  const unbound = controllerInputLabel({ inputKey: 'KEYCODE_X', adapterId: 'unbound', deviceId: 'logical-device-7' }, t)
  expect(unbound.source).toContain(messages[locale]['remote.needsRebinding']); expect(unbound.full).toContain('logical-device-7'); expect(unbound.full).toContain('unbound')
  const wildcard = controllerInputLabel({ inputKey: 'KEYCODE_X' }, t)
  expect(wildcard.source).toContain(messages[locale]['remote.anyAdapter']); expect(wildcard.source).toContain(messages[locale]['remote.anyDevice']); expect(wildcard.source).not.toContain(messages[locale]['remote.needsRebinding'])
  const media = controllerInputLabel({ inputKey: 'MEDIA_NEXT', adapterId: 'system-media', deviceId: 'system-media' }, t)
  expect(media.source).toContain(messages[locale]['remote.sharedMediaIdentity']); expect(media.full).toContain('MEDIA_NEXT')
  const keyboard = controllerInputLabel({ inputKey: 'HID_KEY_80', adapterId: 'generic-native', deviceId: 'keyboard-coalesced' }, t)
  expect(keyboard.source).toContain(messages[locale]['remote.sharedKeyboardIdentity']); expect(keyboard.full).toContain('keyboard-coalesced')
  for (const value of [unbound, wildcard, media, keyboard]) { expect(value.full).not.toMatch(/\{(?:button|source|scope|adapter|device|key)\}/); expect(value.source).not.toContain(messages[locale]['remote.connected']) }
})

it.each([
  { inputKey: 'Custom', adapterId: 'future-adapter' },
  { inputKey: 'Custom', deviceId: 'device-only' },
  { inputKey: 'Custom', adapterId: 'flic2', deviceId: 'AA:BB:CC:DD:EE:FF' },
])('preserves partial, unknown and Flic identifiers without inventing a device name: %j', (input) => {
  const label = controllerInputLabel(input, translate('en'))
  for (const value of Object.values(input)) expect(label.full).toContain(value)
  expect(label.source).toContain(input.adapterId === undefined ? messages.en['remote.anyAdapter'] : input.adapterId)
  expect(label.source).toContain(input.deviceId === undefined ? messages.en['remote.anyDevice'] : input.deviceId)
})

it('does not reinterpret braces inside saved identifiers as translation parameters', () => {
  const input = { inputKey: 'KEYCODE_{source}', adapterId: 'adapter-{device}', deviceId: 'device-{adapter}' }
  const label = controllerInputLabel(input, translate('he'))
  for (const value of Object.values(input)) expect(label.full).toContain(`\u2066${value}\u2069`)
})

it.each(['en', 'he', 'ar'] as const)('preserves literal template-like target names and identifiers in the Remove label in %s', async (locale) => {
  const target = sampleShow.cues.reveal!
  const targetName = 'Encore {button} {action}'
  mockApp.show = { ...sampleShow, cues: { ...sampleShow.cues, reveal: { ...target, name: targetName } } }
  const binding: ControllerBinding = { adapterId: 'generic-native', deviceId: 'pedal-{action}-{button}', inputKey: 'KEYCODE_{action}_{button}', command: { type: 'TRIGGER_HIT', cueId: 'reveal' } }
  profile([binding])
  const screen = render(view(locale)); const remove = screen.getByRole('button', { name: /pedal-/ })
  expect(remove.props.accessibilityLabel).toContain(targetName)
  expect(remove.props.accessibilityLabel).toContain(binding.inputKey); expect(remove.props.accessibilityLabel).toContain(binding.deviceId)
  fireEvent.press(remove); const dialog = screen.UNSAFE_getByType(WorkflowDialog)
  expect(dialog.props.title).toContain(targetName)
  fireEvent.press(within(dialog).getByRole('button', { name: messages[locale]['common.delete'] })); await act(async () => undefined)
  expect(mockRemove).toHaveBeenCalledWith(binding, sampleShow.id)
})

it.each(['en', 'he', 'ar'] as const)('keeps mixed-script source identity and exact removal visible in %s', async (locale) => {
  const binding: ControllerBinding = { adapterId: 'unbound', deviceId: 'logical-שלט_يمين-7', inputKey: 'KEYCODE_SPACE', command: { type: 'TRIGGER_HIT', cueId: 'reveal' } }
  profile([binding])
  const screen = render(view(locale)); const remove = screen.getByRole('button', { name: new RegExp(binding.deviceId!) })
  expect(remove.props.accessibilityLabel).toContain(binding.inputKey); expect(remove.props.accessibilityLabel).toContain('unbound'); expect(remove.props.accessibilityLabel).toContain(messages[locale]['remote.needsRebinding'])
  const source = screen.getByText(new RegExp(binding.deviceId!)); expect(source.props.numberOfLines).toBeUndefined()
  expect(String(source.props.children)).toContain(`\u2066${binding.deviceId}\u2069`)
  if (locale !== 'en') expect(StyleSheet.flatten(source.props.style).writingDirection).toBe('rtl')
  fireEvent.press(remove)
  const dialog = screen.UNSAFE_getByType(WorkflowDialog)
  expect(within(dialog).getByText(new RegExp(binding.deviceId!))).toBeTruthy(); expect(within(dialog).getByRole('button', { name: messages[locale]['common.delete'] })).toBeEnabled()
  fireEvent.press(within(dialog).getByRole('button', { name: messages[locale]['common.delete'] })); await act(async () => undefined)
  expect(mockRemove).toHaveBeenCalledTimes(1); expect(mockRemove).toHaveBeenCalledWith(binding, sampleShow.id)
})

it('retains long exact identifiers in wrapping captions and the confirmation without disabling its actions', async () => {
  const binding: ControllerBinding = { adapterId: 'custom-' + 'a'.repeat(505), deviceId: 'device-' + 'd'.repeat(505), inputKey: 'KEYCODE_' + 'k'.repeat(504), command: { type: 'GO' } }
  profile([binding])
  const screen = render(view()); const remove = screen.getByRole('button', { name: new RegExp(binding.deviceId!) })
  for (const value of [binding.adapterId!, binding.deviceId!, binding.inputKey]) expect(remove.props.accessibilityLabel).toContain(value)
  const source = screen.getByText(new RegExp(binding.deviceId!)); expect(source.props.numberOfLines).toBeUndefined()
  fireEvent.press(remove); const dialog = screen.UNSAFE_getByType(WorkflowDialog)
  expect(within(dialog).getByRole('button', { name: messages.en['common.delete'] })).toBeEnabled(); expect(within(dialog).getByRole('button', { name: messages.en['common.cancel'] })).toBeEnabled()
  expect(within(dialog).getByText(new RegExp(binding.deviceId!)).props.numberOfLines).toBeUndefined()
  fireEvent.press(within(dialog).getByRole('button', { name: messages.en['common.cancel'] })); await act(async () => undefined)
  expect(mockRemove).not.toHaveBeenCalled()
})

it.each(['en', 'he', 'ar'] as const)('shows the captured source before explicit learning Save in %s', async (locale) => {
  profile([])
  const screen = render(view(locale)); fireEvent.press(screen.getByRole('button', { name: messages[locale]['remote.learn'].replace('{action}', messages[locale]['command.GO']) })); await act(async () => undefined)
  const input: NativeControllerInput = { eventId: 'media:1', sourceSessionId: 'media', sequence: 1, adapterId: 'system-media', deviceId: 'system-media', inputKey: 'MEDIA_PLAY_PAUSE', phase: 'down', monotonicMs: 1, isRepeat: false, wasQueued: false, ageMs: 0, diagnosticMode: 'learn', diagnosticSessionId: 'identity-session', handledNatively: true, deliveryEvidence: 'app_received_only' }
  mockApp.controllerInputs = [input]; screen.rerender(view(locale))
  expect(screen.getByText(messages[locale]['remote.button'].replace('{key}', '\u2066MEDIA_PLAY_PAUSE\u2069'))).toBeTruthy()
  expect(screen.getByText(new RegExp(messages[locale]['remote.sharedMediaIdentity']))).toBeTruthy(); expect(screen.getByText(messages[locale]['remote.sharedMedia'])).toBeTruthy()
  expect(mockApp.assignControllerInput).not.toHaveBeenCalled(); fireEvent.press(screen.getByRole('button', { name: messages[locale]['remote.save'] })); await act(async () => undefined)
  expect(mockApp.assignControllerInput).toHaveBeenCalledWith({ type: 'GO' }, input, sampleShow.id)
})
