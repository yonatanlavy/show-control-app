import { act, cleanup, fireEvent, render } from '@testing-library/react-native'
import { Keyboard, KeyboardAvoidingView, SectionList } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { compileRunSnapshot, sampleControllerProfiles, sampleShow, type AudioCue, type RunSnapshot } from '../../domain'
import { I18nProvider, messages, useI18n, type Locale } from '../../i18n'
import { setCriticalSessionActive } from '../../runtime/critical-session-gate'
import type { ShowSessionState } from '../../runtime'
import { RecoveryScreen } from '../screens'
import { AppShell, Button } from '../primitives'
import { CollectionRow } from '../workflow-components'
import { CollectionSearch } from '../CollectionSearch'

const cueOrder = Array.from({ length: 1200 }, (_, index) => `recovery-${index}`)
const original = sampleShow.cues.opening as AudioCue
const cues = Object.fromEntries(cueOrder.map((id, index) => [id, { ...original, id, name: `Recovery cue ${String(index + 1).padStart(4, '0')}` }]))
const compiled = compileRunSnapshot({ ...sampleShow, cues: { ...sampleShow.cues, ...cues }, sets: [{ ...sampleShow.sets[0]!, cueOrder }] }, sampleShow.sets[0]!.id, sampleControllerProfiles)
if (!compiled.ok) throw new Error('The large Recovery fixture must compile')
const snapshot = compiled.snapshot
const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() }
const mockApp = {
  session: { snapshot: snapshot as RunSnapshot | null, selectedCueId: cueOrder[0]!, pendingCommandIds: [] as number[], phase: 'ready' as ShowSessionState['phase'], detail: '', sessionPurpose: 'performance', nativeGeneration: 1 },
  liveSession: true, busy: false, error: null as string | null, clearError: jest.fn(), retryLastTask: jest.fn(),
  libraryState: { status: 'ready', error: null, saving: false },
  replay: jest.fn(), previous: jest.fn(), skip: jest.fn(), selectCue: jest.fn(), startCue: jest.fn(),
  panic: jest.fn(), stopAll: jest.fn(), exitShow: jest.fn(), voiceStatus: null, disarmVoice: jest.fn(), runTask: jest.fn(),
}
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
function view() { return <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}><I18nProvider><RecoveryScreen /></I18nProvider></SafeAreaInsetsContext.Provider> }
function mount() { return render(view()) }
function action(screen: ReturnType<typeof mount>, label: string) { return screen.UNSAFE_getAllByType(Button).find((button) => button.props.label === label)!.props.onPress as () => void }
beforeEach(() => {
  jest.clearAllMocks(); setCriticalSessionActive(true)
  mockApp.session = { ...mockApp.session, snapshot, selectedCueId: cueOrder[0]!, pendingCommandIds: [], phase: 'ready', nativeGeneration: 1, detail: '' }
  mockApp.error = null
  mockApp.exitShow.mockResolvedValue(true)
  mockApp.runTask.mockImplementation(async (work: () => Promise<unknown>) => { try { await work(); return true } catch { return false } })
})
afterEach(() => { cleanup(); setCriticalSessionActive(false); jest.restoreAllMocks() })

it('offers one deliberate native recovery path without telling the operator to open the current page', () => {
  mockApp.session.phase = 'interrupted'; mockApp.session.detail = 'TEST_INTERRUPT'; mockApp.error = 'PLAYBACK_FAULT: TEST_INTERRUPT'
  const screen = mount()
  expect(screen.queryByText(messages.en['run.playbackWarning'])).toBeNull()
  expect(screen.getByText(messages.en['use.audio.recovery'])).toBeTruthy()
  expect(screen.getByRole('button', { name: messages.en['use.audio.recheck'] })).toBeEnabled()
  expect(screen.queryByRole('button', { name: messages.en['common.retry'] })).toBeNull()
  fireEvent.press(screen.getByRole('button', { name: messages.en['common.diagnostics'] }))
  expect(screen.getByText('TEST_INTERRUPT')).toBeTruthy()
  expect(mockApp.retryLastTask).not.toHaveBeenCalled(); expect(mockApp.startCue).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: messages.en['recovery.stop'] })).toBeEnabled()
  expect(screen.getByRole('button', { name: messages.en['recovery.fade'] })).toBeEnabled()
})

it('windows the actual 1,200-cue Recovery chooser without shrinking its source order', () => {
  const screen = mount()
  expect(screen.getAllByRole('button', { name: /Recovery cue \d+/ }).length).toBeLessThan(50)
  const list = screen.UNSAFE_getByType(SectionList)
  expect(list.props.sections[0].data).toHaveLength(1200)
  expect(list.props.sections[0].data.at(-1).id).toBe(cueOrder.at(-1))
  expect(snapshot.cueOrder).toEqual(cueOrder)
  expect(mockApp.selectCue).not.toHaveBeenCalled()
  expect(mockApp.startCue).not.toHaveBeenCalled()
})

it('keeps the recovery footer within the keyboard-avoiding surface during a critical session', () => {
  const screen = mount()
  const surfaces = screen.UNSAFE_getAllByType(KeyboardAvoidingView)
  const shell = surfaces.find((surface) => surface.props.testID === 'app-keyboard-surface')!
  expect(shell.props.enabled).toBe(true)
  expect(shell.props.keyboardVerticalOffset).toBe(0)
  expect(shell.findAllByType(Button).filter((button) => ['recovery.stop', 'recovery.fade'].some((key) => button.props.label === messages.en[key as keyof typeof messages.en]))).toHaveLength(2)
  expect(surfaces.filter((surface) => surface !== shell).every((surface) => surface.props.enabled === false)).toBe(true)
})

it('keeps the editable search outside the windowed cue region so resizing cannot recycle its focused input', () => {
  const screen = mount(), list = screen.UNSAFE_getByType(SectionList)
  expect(list.findAllByProps({ accessibilityLabel: messages.en['finder.search'] })).toHaveLength(0)
  expect(screen.getByLabelText(messages.en['finder.search'])).toBeTruthy()
})

it('retains the same native text input and its assistive name when search becomes compact', () => {
  const search = (compact: boolean) => <I18nProvider><CollectionSearch compact={compact} value="1199" onChange={jest.fn()} label="Recovery search" resultCount={1} totalCount={1200} /></I18nProvider>
  const screen = render(search(false)), input = screen.getByLabelText('Recovery search')
  screen.rerender(search(true))
  expect(screen.getByLabelText('Recovery search')).toBe(input)
  expect(input.props.value).toBe('1199')
  expect(input.props.placeholder).toBe('Recovery search')
  expect(input.props.disableFullscreenUI).toBe(true)
})

it('retains the fixed keyboard policy for other critical shells', () => {
  const screen = render(<I18nProvider><AppShell current="/more"><Button label="Fixed safety" onPress={() => undefined} /></AppShell></I18nProvider>)
  expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.enabled).toBe(false)
})

it('prevents the Android landscape keyboard from extracting recovery search over the safety controls', () => {
  const screen = mount()
  expect(screen.getByLabelText(messages.en['finder.search']).props.disableFullscreenUI).toBe(true)
})

it('submits a search by dismissing the keyboard while preserving its results without transport', () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined)
  const screen = mount()
  fireEvent.changeText(screen.getByLabelText(messages.en['finder.search']), '1200')
  dismiss.mockClear()
  fireEvent(screen.getByLabelText(messages.en['finder.search']), 'submitEditing')
  expect(dismiss).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText(messages.en['finder.search']).props.value).toBe('1200')
  expect(screen.getByLabelText('1200 · Recovery cue 1200')).toBeTruthy()
  expect(mockApp.selectCue).not.toHaveBeenCalled()
  expect(mockApp.startCue).not.toHaveBeenCalled()
})

it('finds the last cue with normalized search while keeping selection and transport silent', async () => {
  const screen = mount()
  fireEvent.changeText(screen.getByLabelText(messages.en['finder.search']), 'Ｒｅｃｏｖｅｒｙ １２００')
  await act(async () => { await Promise.resolve() })
  expect(screen.getByRole('button', { name: /Recovery cue 1200/ })).toBeTruthy()
  expect(mockApp.selectCue).not.toHaveBeenCalled()
  expect(mockApp.startCue).not.toHaveBeenCalled()
  expect(snapshot.cueOrder).toHaveLength(1200)
})

it('selects the last result silently, follows native acknowledgement, then starts only on the separate action', () => {
  const screen = mount()
  fireEvent.changeText(screen.getByLabelText(messages.en['finder.search']), '1200 Recovery')
  fireEvent.press(screen.getByLabelText('1200 · Recovery cue 1200'))
  expect(mockApp.selectCue).toHaveBeenCalledWith(cueOrder.at(-1))
  expect(mockApp.startCue).not.toHaveBeenCalled()
  mockApp.session.selectedCueId = cueOrder.at(-1)!
  mockApp.session.nativeGeneration = 2
  screen.rerender(view())
  expect(screen.getByLabelText(messages.en['finder.search']).props.value).toBe('1200 Recovery')
  expect(screen.getByLabelText('1200 · Recovery cue 1200').props.accessibilityState.selected).toBe(true)
  fireEvent.press(screen.getByRole('button', { name: `${messages.en['recovery.select']} · Recovery cue 1200` }))
  expect(mockApp.startCue).toHaveBeenCalledTimes(1)
  expect(mockApp.startCue).toHaveBeenCalledWith(cueOrder.at(-1))
})

it('distinguishes duplicate names by original ordinal while retaining exact cue IDs', () => {
  const first = cueOrder[0]!, last = cueOrder.at(-1)!
  mockApp.session.snapshot = { ...snapshot, cues: { ...snapshot.cues, [first]: { ...snapshot.cues[first]!, name: 'Duplicate reveal' }, [last]: { ...snapshot.cues[last]!, name: 'Duplicate reveal' } } }
  const screen = mount()
  fireEvent.changeText(screen.getByLabelText(messages.en['finder.search']), 'reveal duplicate')
  expect(screen.getByLabelText('01 · Duplicate reveal')).toBeTruthy()
  fireEvent.press(screen.getByLabelText('1200 · Duplicate reveal'))
  expect(mockApp.selectCue).toHaveBeenCalledWith(last)
  expect(mockApp.startCue).not.toHaveBeenCalled()
})

it('normalizes composed accents without changing cue identity or saved names', () => {
  const last = cueOrder.at(-1)!, name = 'Révélation finale — 世界'
  mockApp.session.snapshot = { ...snapshot, cues: { ...snapshot.cues, [last]: { ...snapshot.cues[last]!, name } } }
  const screen = mount()
  fireEvent.changeText(screen.getByLabelText(messages.en['finder.search']), 'Re\u0301ve\u0301lation 世界')
  fireEvent.press(screen.getByLabelText(`1200 · ${name}`))
  expect(mockApp.selectCue).toHaveBeenCalledWith(last)
  expect(mockApp.session.snapshot.cues[last]!.name).toBe(name)
  expect(mockApp.startCue).not.toHaveBeenCalled()
})

it('keeps a long mixed-script cue name complete for assistive selection and deliberate Start', () => {
  const id = cueOrder[0]!, name = '🎭 Révélation — מוזיקת סיום — موسيقى العرض — showcontrol-smoke-tone-with-a-long-original-filename.mp3'
  mockApp.session.snapshot = { ...snapshot, cues: { ...snapshot.cues, [id]: { ...snapshot.cues[id]!, name } } }
  const screen = mount()
  expect(screen.getByLabelText(name)).toBeTruthy()
  fireEvent.changeText(screen.getByLabelText(messages.en['finder.search']), 'מוזיקת mp3')
  fireEvent.press(screen.getByLabelText(`01 · ${name}`))
  expect(mockApp.selectCue).toHaveBeenCalledWith(id)
  expect(mockApp.startCue).not.toHaveBeenCalled()
  fireEvent.press(screen.getByRole('button', { name: `${messages.en['recovery.select']} · ${name}` }))
  expect(mockApp.startCue).toHaveBeenCalledWith(id)
  expect(mockApp.session.snapshot.cues[id]!.name).toBe(name)
})

it('keeps Stop and Fade outside the virtualized reading region and active during pending work', () => {
  mockApp.session.pendingCommandIds = [42]
  const screen = mount(), list = screen.UNSAFE_getByType(SectionList)
  for (const key of ['recovery.stop', 'recovery.fade'] as const) {
    expect(list.findAllByProps({ accessibilityLabel: messages.en[key] })).toHaveLength(0)
    expect(screen.getByRole('button', { name: messages.en[key] })).toBeEnabled()
    fireEvent.press(screen.getByRole('button', { name: messages.en[key] }))
  }
  expect(mockApp.stopAll).toHaveBeenCalledTimes(1)
  expect(mockApp.panic).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: messages.en['recovery.select'] })).toBeDisabled()
  expect(mockApp.startCue).not.toHaveBeenCalled()
})

it.each(['interrupted', 'fault', 'preparing', 'unavailable'] as const)('withholds ordinary actions in %s without disabling safety', (phase) => {
  mockApp.session.phase = phase
  const screen = mount()
  const start = screen.getByRole('button', { name: messages.en['recovery.select'] })
  expect(start).toBeDisabled(); fireEvent.press(start)
  expect(screen.getByLabelText('01 · Recovery cue 0001')).toBeDisabled()
  expect(screen.getByRole('button', { name: messages.en['recovery.fade'] })).toBeEnabled()
  expect(mockApp.startCue).not.toHaveBeenCalled()
})

it('does not offer playback for an empty or missing native selection', () => {
  mockApp.session.selectedCueId = 'missing-cue'
  const screen = mount()
  expect(screen.getByRole('button', { name: messages.en['recovery.select'] })).toBeDisabled()
  mockApp.session.snapshot = null; screen.rerender(view())
  expect(screen.UNSAFE_getByType(SectionList).props.sections[0].data).toHaveLength(0)
  expect(screen.getByRole('button', { name: messages.en['recovery.select'] })).toBeDisabled()
  expect(screen.getByRole('button', { name: messages.en['recovery.stop'] })).toBeEnabled()
})

it('rejects stale Start, replay and exit callbacks after native generation changes while retaining the show search', async () => {
  const screen = mount()
  const oldStart = action(screen, messages.en['recovery.select'])
  const oldReplay = action(screen, messages.en['recovery.replay'])
  const oldExit = action(screen, messages.en['recovery.exit'])
  fireEvent.changeText(screen.getByLabelText(messages.en['finder.search']), '1200')
  mockApp.session.nativeGeneration = 2; screen.rerender(view())
  expect(screen.getByLabelText(messages.en['finder.search']).props.value).toBe('1200')
  await act(async () => { oldStart(); oldReplay(); oldExit() })
  expect(mockApp.startCue).not.toHaveBeenCalled()
  expect(mockApp.replay).not.toHaveBeenCalled()
  expect(mockApp.exitShow).not.toHaveBeenCalled()
})

it('clears the search when the prepared revision changes without issuing transport', () => {
  const screen = mount()
  fireEvent.changeText(screen.getByLabelText(messages.en['finder.search']), '1200')
  mockApp.session.snapshot = { ...snapshot, revisionId: 'other-revision' }; screen.rerender(view())
  expect(screen.getByLabelText(messages.en['finder.search']).props.value).toBe('')
  expect(mockApp.selectCue).not.toHaveBeenCalled()
  expect(mockApp.startCue).not.toHaveBeenCalled()
})

it('rejects a stale Start after native selection changes and permits the new deliberate choice', () => {
  const screen = mount(), oldStart = action(screen, messages.en['recovery.select'])
  mockApp.session.selectedCueId = cueOrder.at(-1)!; screen.rerender(view())
  oldStart()
  expect(mockApp.startCue).not.toHaveBeenCalled()
  fireEvent.press(screen.getByRole('button', { name: messages.en['recovery.select'] }))
  expect(mockApp.startCue).toHaveBeenCalledWith(cueOrder.at(-1))
})

it('rejects callbacks after leaving and dismisses the keyboard only on deliberate selection/start', () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined)
  const screen = mount(), start = action(screen, messages.en['recovery.select'])
  dismiss.mockClear()
  fireEvent.changeText(screen.getByLabelText(messages.en['finder.search']), '1200')
  expect(dismiss).not.toHaveBeenCalled()
  fireEvent.press(screen.getByLabelText('1200 · Recovery cue 1200'))
  expect(dismiss).toHaveBeenCalledTimes(1)
  screen.unmount(); start()
  expect(mockApp.startCue).not.toHaveBeenCalled()
})

it('does not let a late old Exit completion replace a newly observed native owner', async () => {
  let finish!: (exited: boolean) => void
  mockApp.exitShow.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
  const screen = mount()
  fireEvent.press(screen.getByRole('button', { name: messages.en['recovery.exit'] }))
  mockApp.session = { ...mockApp.session, snapshot: { ...snapshot, revisionId: 'other-revision' }, nativeGeneration: 2 }
  screen.rerender(view())
  await act(async () => finish(true))
  expect(mockRouter.replace).not.toHaveBeenCalled()
  expect(mockApp.startCue).not.toHaveBeenCalled()
})

it('reserves one exit and withholds stale playback while shutdown is pending', async () => {
  let finish!: (exited: boolean) => void
  mockApp.exitShow.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
  const screen = mount(), start = action(screen, messages.en['recovery.select']), exit = action(screen, messages.en['recovery.exit'])
  act(() => { exit(); exit(); start() })
  expect(mockApp.exitShow).toHaveBeenCalledTimes(1)
  expect(mockApp.startCue).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: messages.en['recovery.stop'] })).toBeEnabled()
  await act(async () => finish(false))
  expect(mockRouter.replace).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: messages.en['recovery.exit'] })).toBeEnabled()
})

it('rejects an old row selection after the native owner changes', () => {
  const screen = mount()
  const oldRow = screen.UNSAFE_getAllByType(CollectionRow).find((row) => row.props.label === '01 · Recovery cue 0001')!.props.onPress as () => void
  mockApp.session.nativeGeneration = 2; screen.rerender(view())
  oldRow()
  expect(mockApp.selectCue).not.toHaveBeenCalled()
  expect(mockApp.startCue).not.toHaveBeenCalled()
})

function LocalizedRecovery({ locale }: { locale: Locale }) {
  const { setLocale } = useI18n()
  return <><Button label="Test locale" onPress={() => setLocale(locale)} /><RecoveryScreen /></>
}
it.each(Object.keys(messages) as Locale[])('retains full cue identity, search and safety labels in %s', (locale) => {
  const screen = render(<I18nProvider><LocalizedRecovery locale={locale} /></I18nProvider>)
  fireEvent.press(screen.getByRole('button', { name: 'Test locale' }))
  fireEvent.changeText(screen.getByLabelText(messages[locale]['finder.search']), '１２００')
  expect(screen.getByLabelText('1200 · Recovery cue 1200')).toBeTruthy()
  expect(screen.getByRole('button', { name: messages[locale]['recovery.stop'] })).toBeEnabled()
  expect(screen.getByRole('button', { name: messages[locale]['recovery.fade'] })).toBeEnabled()
  expect(mockApp.startCue).not.toHaveBeenCalled()
})
