import { act, fireEvent, render, within } from '@testing-library/react-native'
import { useEffect } from 'react'
import { Text } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { sampleShow, type Show } from '../../domain'
import { I18nProvider, messages, useI18n, type Locale, type MessageKey } from '../../i18n'
import { DEFAULT_LIBRARY_SETTINGS, type LibrarySnapshot } from '../../library/types'
import { ShowSession } from '../../runtime/show-session'
import { BuilderScreen, LibraryScreen } from '../library-screens'
import { RehearsalScreen } from '../rehearsal-screen'
import { PreflightScreen } from '../screens'
import type { FeedbackOptions } from '../feedback'
import { buildShowIdentities, fullShowReference } from '../show-identity'
import { WorkflowDialog } from '../workflow-components'

const mockRouter = { push: jest.fn(), replace: jest.fn() }
const mockLibrary = {
  select: jest.fn().mockResolvedValue(undefined), trash: jest.fn().mockResolvedValue([]),
  renameShow: jest.fn().mockResolvedValue(undefined), duplicateShow: jest.fn().mockResolvedValue(undefined),
  removeShow: jest.fn().mockResolvedValue(undefined), restoreDeletedShow: jest.fn().mockResolvedValue(undefined),
  history: jest.fn().mockResolvedValue({ revisions: [], nextCursor: null }),
  getSnapshot: (): LibrarySnapshot => mockApp.libraryState as LibrarySnapshot,
}
let mockUndo: FeedbackOptions['undo']
const mockApp = {
  library: mockLibrary, show: sampleShow as Show, set: sampleShow.sets[0]!, busy: false, liveSession: false, error: null,
  clearError: jest.fn(), retryLastTask: jest.fn(),
  session: new ShowSession({ engine: null }).getState(), checks: { local: false, readable: false, order: false }, toggleCheck: jest.fn(), armShow: jest.fn(),
  beginRehearsal: jest.fn(), go: jest.fn(), panic: jest.fn(), stopAll: jest.fn(), pauseResume: jest.fn(), previous: jest.fn(), replay: jest.fn(), selectCue: jest.fn(), seek: jest.fn(), triggerHit: jest.fn(), exitShow: jest.fn(), prepareTouchSession: jest.fn(),
  libraryState: { status: 'ready', saving: false, shows: [] as readonly Show[], selectedShowId: '', selectedSetId: '', controllerProfiles: [], settings: DEFAULT_LIBRARY_SETTINGS },
  runTask: async (work: () => Promise<unknown>, options?: FeedbackOptions) => { try { await work(); mockUndo = options?.undo; return true } catch { return false } },
}
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('../BackgroundReliabilityPanel', () => ({ BackgroundReliabilityPanel: () => null }))
function SelectLocale({ locale }: { locale: Locale }) { const { setLocale } = useI18n(); useEffect(() => setLocale(locale), [locale, setLocale]); return null }
const wrap = (children: React.ReactNode, locale: Locale = 'en') => <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}><I18nProvider><SelectLocale locale={locale} />{children}</I18nProvider></SafeAreaInsetsContext.Provider>
const duplicateName = 'Evening Show'
const clone = (id: string): Show => ({ ...structuredClone(sampleShow), id, name: duplicateName, revisionId: `revision-${id}`, updatedAt: '2026-11-04T12:30:00.000Z' })
const flattenText = (value: unknown): string => Array.isArray(value) ? value.map(flattenText).join(' ') : typeof value === 'string' || typeof value === 'number' ? String(value) : ''
const dialogText = (dialog: ReturnType<ReturnType<typeof render>['UNSAFE_getByType']>) => dialog.findAllByType(Text).map((node) => flattenText(node.props.children)).join(' ')
const translate = (locale: Locale) => (key: MessageKey, params: Readonly<Record<string, string | number>> = {}) => Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), messages[locale][key])
const identities = (locale: Locale = 'en') => buildShowIdentities(mockApp.libraryState.shows, locale, translate(locale))
const name = (show: Show) => identities().get(show.id)!.actionName
const openName = (show: Show) => `${messages.en['library.open']} · ${name(show)}`
const manageName = (show: Show) => `${messages.en['common.manage']} · ${name(show)}`

beforeEach(() => {
  jest.clearAllMocks()
  const first = clone('show-reference-alpha'); const second = clone('show-reference-beta')
  mockApp.show = first; mockApp.set = first.sets[0]!
  mockApp.libraryState = { ...mockApp.libraryState, shows: [first, second], selectedShowId: first.id, selectedSetId: first.sets[0]!.id }
  mockApp.busy = false; mockApp.error = null; mockApp.session = new ShowSession({ engine: null }).getState(); mockUndo = undefined
  mockLibrary.trash.mockResolvedValue([]); mockLibrary.select.mockResolvedValue(undefined); mockLibrary.renameShow.mockResolvedValue(undefined); mockLibrary.removeShow.mockResolvedValue(undefined); mockLibrary.restoreDeletedShow.mockResolvedValue(undefined)
})

it('distinguishes identical-title/count/date shows in Open and Manage accessible names', async () => {
  const screen = render(wrap(<LibraryScreen />)); await act(async () => undefined)
  for (const action of [messages.en['library.open'], messages.en['common.manage']]) {
    const buttons = screen.getAllByRole('button', { name: new RegExp(`^${action}`) })
    expect(buttons).toHaveLength(2)
    expect(new Set(buttons.map((button) => button.props.accessibilityLabel)).size).toBe(2)
    for (const button of buttons) expect(button.props.accessibilityLabel).toContain(duplicateName)
  }
  expect(mockLibrary.select).not.toHaveBeenCalled()
})

it('keeps same-name show identity visible when opening either management dialog', async () => {
  const screen = render(wrap(<LibraryScreen />)); await act(async () => undefined)
  const confirmations: string[] = []
  for (const index of [0, 1]) {
    const manage = screen.getAllByRole('button', { name: new RegExp(`^${messages.en['common.manage']}`) })
    fireEvent.press(manage[index]!)
    const dialog = screen.UNSAFE_getByType(WorkflowDialog)
    confirmations.push(dialogText(dialog))
    expect(confirmations[index]).toContain(duplicateName)
    fireEvent.press(within(dialog).getByRole('button', { name: messages.en['common.close'] }))
  }
  expect(confirmations[0]).not.toEqual(confirmations[1])
  expect(mockLibrary.removeShow).not.toHaveBeenCalled(); expect(mockLibrary.renameShow).not.toHaveBeenCalled()
})

it('opens the exact same-name show selected by its reference and waits before navigating', async () => {
  const target = mockApp.libraryState.shows[1]!
  let finish!: () => void
  mockLibrary.select.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
  const screen = render(wrap(<LibraryScreen />)); await act(async () => undefined)
  fireEvent.press(screen.getByRole('button', { name: openName(target) }))
  expect(mockLibrary.select).toHaveBeenCalledWith(target.id, undefined); expect(mockRouter.push).not.toHaveBeenCalled()
  await act(async () => finish())
  expect(mockRouter.push).toHaveBeenCalledWith('/builder'); expect(mockLibrary.select).toHaveBeenCalledTimes(1)
})

it('renames the identified target while retaining its saved name as the editable draft', async () => {
  const target = mockApp.libraryState.shows[1]!
  const screen = render(wrap(<LibraryScreen />)); await act(async () => undefined)
  fireEvent.press(screen.getByRole('button', { name: manageName(target) }))
  fireEvent.press(within(screen.UNSAFE_getByType(WorkflowDialog)).getByRole('button', { name: messages.en['common.rename'] }))
  const dialog = screen.UNSAFE_getByType(WorkflowDialog)
  expect(within(dialog).getByLabelText(messages.en['common.name']).props.value).toBe(target.name)
  expect(dialogText(dialog)).toContain(identities().get(target.id)!.reference)
  fireEvent.changeText(within(dialog).getByLabelText(messages.en['common.name']), 'Finale {button}')
  fireEvent.press(within(dialog).getByRole('button', { name: messages.en['common.save'] }))
  await act(async () => undefined)
  expect(mockLibrary.renameShow).toHaveBeenCalledWith(target.id, 'Finale {button}')
  expect(mockLibrary.select).not.toHaveBeenCalled()
})

it('identifies delete confirmation, cancels safely and binds undo to that exact show', async () => {
  const target = mockApp.libraryState.shows[1]!
  const screen = render(wrap(<LibraryScreen />)); await act(async () => undefined)
  fireEvent.press(screen.getByRole('button', { name: manageName(target) }))
  fireEvent.press(within(screen.UNSAFE_getByType(WorkflowDialog)).getByRole('button', { name: messages.en['common.delete'] }))
  let dialog = screen.UNSAFE_getByType(WorkflowDialog)
  expect(dialogText(dialog)).toContain(identities().get(target.id)!.reference)
  fireEvent.press(within(dialog).getByRole('button', { name: messages.en['common.cancel'] }))
  expect(mockLibrary.removeShow).not.toHaveBeenCalled()
  fireEvent.press(within(screen.UNSAFE_getByType(WorkflowDialog)).getByRole('button', { name: messages.en['common.delete'] }))
  dialog = screen.UNSAFE_getByType(WorkflowDialog)
  fireEvent.press(within(dialog).getByRole('button', { name: messages.en['common.delete'] }))
  await act(async () => undefined)
  expect(mockLibrary.removeShow).toHaveBeenCalledTimes(1); expect(mockLibrary.removeShow).toHaveBeenCalledWith(target.id)
  expect(mockUndo).toBeDefined(); await act(async () => { await mockUndo!() })
  expect(mockLibrary.restoreDeletedShow).toHaveBeenCalledTimes(1); expect(mockLibrary.restoreDeletedShow).toHaveBeenCalledWith(target.id)
})

it('keeps reference labels stable when filtering and library order change', async () => {
  const screen = render(wrap(<LibraryScreen />)); await act(async () => undefined)
  const labels = mockApp.libraryState.shows.map(openName).sort()
  fireEvent.changeText(screen.getByLabelText(messages.en['use.library.findShow']), duplicateName)
  const filtered = screen.getAllByRole('button', { name: new RegExp(`^${messages.en['library.open']}`) }).map((node) => node.props.accessibilityLabel).sort()
  expect(filtered).toEqual(labels)
  mockApp.libraryState = { ...mockApp.libraryState, shows: [...mockApp.libraryState.shows].reverse() }
  screen.rerender(wrap(<LibraryScreen />))
  expect(screen.getAllByRole('button', { name: new RegExp(`^${messages.en['library.open']}`) }).map((node) => node.props.accessibilityLabel).sort()).toEqual(labels)
  expect(mockLibrary.select).not.toHaveBeenCalled()
})

it('finds the exact same-name show by its displayed reference without selecting until Open', async () => {
  const target = mockApp.libraryState.shows[1]!
  const reference = identities().get(target.id)!.reference
  const labels = mockApp.libraryState.shows.map(openName).sort()
  const screen = render(wrap(<LibraryScreen />)); await act(async () => undefined)
  fireEvent.changeText(screen.getByLabelText(messages.en['use.library.findShow']), reference)
  expect(screen.getAllByRole('button', { name: new RegExp(`^${messages.en['library.open']}`) })).toHaveLength(1)
  expect(screen.getByRole('button', { name: openName(target) })).toBeTruthy()
  expect(mockLibrary.select).not.toHaveBeenCalled(); expect(mockRouter.push).not.toHaveBeenCalled()
  fireEvent.press(screen.getByRole('button', { name: messages.en['use.library.clearSearch'] }))
  expect(screen.getAllByRole('button', { name: new RegExp(`^${messages.en['library.open']}`) }).map((node) => node.props.accessibilityLabel).sort()).toEqual(labels)
  expect(mockLibrary.select).not.toHaveBeenCalled()
  fireEvent.changeText(screen.getByLabelText(messages.en['use.library.findShow']), reference)
  fireEvent.press(screen.getByRole('button', { name: openName(target) }))
  await act(async () => undefined)
  expect(mockLibrary.select).toHaveBeenCalledTimes(1); expect(mockLibrary.select).toHaveBeenCalledWith(target.id, undefined)
  expect(mockRouter.push).toHaveBeenCalledWith('/builder'); expect(mockApp.go).not.toHaveBeenCalled()
})

it('accepts the full long legacy reference and opens only that exact same-name show', async () => {
  const shared = 's'.repeat(100)
  const first = clone(`${shared}Case`); const target = clone(`${shared}case`)
  mockApp.show = first; mockApp.set = first.sets[0]!
  mockApp.libraryState = { ...mockApp.libraryState, shows: [first, target], selectedShowId: first.id, selectedSetId: first.sets[0]!.id }
  const reference = identities().get(target.id)!.reference
  expect(reference.length).toBeGreaterThan(256)
  const screen = render(wrap(<LibraryScreen />)); await act(async () => undefined)
  const search = screen.getByLabelText(messages.en['use.library.findShow'])
  expect(search.props.maxLength).toBeGreaterThanOrEqual(reference.length)
  fireEvent.changeText(search, reference)
  expect(screen.getAllByRole('button', { name: new RegExp(`^${messages.en['library.open']}`) })).toHaveLength(1)
  expect(screen.getByRole('button', { name: openName(target) })).toBeTruthy()
  expect(mockLibrary.select).not.toHaveBeenCalled(); expect(mockRouter.push).not.toHaveBeenCalled()
  expect(mockLibrary.renameShow).not.toHaveBeenCalled(); expect(mockLibrary.removeShow).not.toHaveBeenCalled(); expect(mockLibrary.restoreDeletedShow).not.toHaveBeenCalled()
  fireEvent.press(screen.getByRole('button', { name: openName(target) }))
  await act(async () => undefined)
  expect(mockLibrary.select).toHaveBeenCalledTimes(1); expect(mockLibrary.select).toHaveBeenCalledWith(target.id, undefined)
  expect(mockRouter.push).toHaveBeenCalledWith('/builder'); expect(mockApp.go).not.toHaveBeenCalled()
})

it('closes a removed dialog target instead of substituting its same-name peer', async () => {
  const target = mockApp.libraryState.shows[1]!
  const screen = render(wrap(<LibraryScreen />)); await act(async () => undefined)
  fireEvent.press(screen.getByRole('button', { name: manageName(target) }))
  mockApp.libraryState = { ...mockApp.libraryState, shows: [mockApp.libraryState.shows[0]!] }
  screen.rerender(wrap(<LibraryScreen />))
  expect(screen.UNSAFE_queryAllByType(WorkflowDialog)).toHaveLength(0)
  expect(mockLibrary.removeShow).not.toHaveBeenCalled(); expect(mockLibrary.renameShow).not.toHaveBeenCalled()
})

it('distinguishes same-name deleted shows and restores the explicitly identified target', async () => {
  const deleted = [clone('deleted-show-alpha'), clone('deleted-show-beta')]
  mockLibrary.trash.mockResolvedValue(deleted)
  const screen = render(wrap(<LibraryScreen />)); await act(async () => undefined)
  fireEvent.press(screen.getByRole('button', { name: messages.en['library.deletedShows'] }))
  const secondRef = fullShowReference(deleted[1]!.id)
  const target = screen.getByRole('button', { name: new RegExp(secondRef) })
  expect(target.props.accessibilityLabel).toContain(deleted[1]!.name)
  expect(screen.getAllByText(new RegExp(secondRef)).length).toBeGreaterThan(0)
  fireEvent.press(target); await act(async () => undefined)
  expect(mockLibrary.restoreDeletedShow).toHaveBeenCalledWith(deleted[1]!.id)
  expect(mockLibrary.removeShow).not.toHaveBeenCalled()
})

it('retains the original concise labels when show names are unique', async () => {
  const [first, second] = mockApp.libraryState.shows
  mockApp.libraryState = { ...mockApp.libraryState, shows: [first!, { ...second!, name: 'Matinee Show' }] }
  const screen = render(wrap(<LibraryScreen />)); await act(async () => undefined)
  expect(screen.getByRole('button', { name: `${messages.en['library.open']} · ${duplicateName}` })).toBeTruthy()
  expect(screen.getByRole('button', { name: `${messages.en['library.open']} · Matinee Show` })).toBeTruthy()
  expect(screen.getByRole('button', { name: `${messages.en['common.manage']} · ${duplicateName}` })).toBeTruthy()
  for (const identity of identities().values()) expect(screen.queryByText(new RegExp(identity.reference))).toBeNull()
})

it.each(['en', 'he', 'ar'] as const)('shows full mixed-script context for either Library target in %s', async (locale) => {
  mockApp.libraryState = { ...mockApp.libraryState, shows: mockApp.libraryState.shows.map((show) => ({ ...show, name: 'ערב {reference} · عرض' })) }
  const expected = identities(locale)
  const screen = render(wrap(<LibraryScreen />, locale)); await act(async () => undefined)
  for (const show of mockApp.libraryState.shows) {
    const identity = expected.get(show.id)!
    expect(screen.getAllByText(identity.context!).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: `${messages[locale]['common.manage']} · ${identity.actionName}` })).toBeTruthy()
    expect(identity.actionName).toContain(show.name)
  }
  expect(mockLibrary.select).not.toHaveBeenCalled()
})

it.each([
  { title: 'Builder', Page: BuilderScreen },
  { title: 'Preflight', Page: PreflightScreen },
  { title: 'unprepared Rehearsal', Page: RehearsalScreen },
])('identifies the selected same-name copy in $title without preparing or playing', async ({ Page }) => {
  const selected = mockApp.libraryState.shows[1]!
  mockApp.show = selected; mockApp.set = selected.sets[0]!
  mockApp.libraryState = { ...mockApp.libraryState, selectedShowId: selected.id, selectedSetId: selected.sets[0]!.id }
  const screen = render(wrap(<Page />)); await act(async () => undefined)
  expect(screen.getAllByText(identities().get(selected.id)!.context!).length).toBeGreaterThan(0)
  expect(screen.queryByText(identities().get(mockApp.libraryState.shows[0]!.id)!.context!)).toBeNull()
  expect(mockApp.armShow).not.toHaveBeenCalled(); expect(mockApp.beginRehearsal).not.toHaveBeenCalled(); expect(mockApp.go).not.toHaveBeenCalled()
})
