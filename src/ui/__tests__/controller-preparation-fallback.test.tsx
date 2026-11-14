import { act, fireEvent, render } from '@testing-library/react-native'
import { useEffect } from 'react'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { sampleControllerProfiles, sampleShow, type ControllerProfile, type Show } from '../../domain'
import { I18nProvider, messages, useI18n, type Locale } from '../../i18n'
import { DEFAULT_LIBRARY_SETTINGS, type LibrarySnapshot } from '../../library/types'
import { PreflightScreen } from '../screens'
import { RehearsalScreen } from '../rehearsal-screen'

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissAll: jest.fn(), dismissTo: jest.fn() }
const mockTouchPrepare = jest.fn()
let mockSnapshot: LibrarySnapshot
const mockApp = {
  show: sampleShow as Show, set: sampleShow.sets[0]!, libraryState: {} as LibrarySnapshot,
  library: { getSnapshot: () => mockSnapshot }, checks: { local: true, readable: true, order: true },
  session: { phase: 'idle', engineAvailable: true, snapshot: null, sessionPurpose: 'performance', nativeGeneration: 0, currentCueId: '', selectedCueId: '', pendingCommandIds: [], countdownRemainingMs: 0, activeVoiceCount: 0 },
  busy: false, liveSession: false, error: null, toggleCheck: jest.fn(), armShow: jest.fn(), beginRehearsal: jest.fn(),
  prepareTouchSession: mockTouchPrepare, clearError: jest.fn(), retryLastTask: jest.fn(),
}
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))
jest.mock('../BackgroundReliabilityPanel', () => ({ BackgroundReliabilityPanel: () => null }))
function LocaleSelection({ locale }: { locale: Locale }) { const { setLocale } = useI18n(); useEffect(() => setLocale(locale), [locale, setLocale]); return null }
function view(Page: typeof PreflightScreen | typeof RehearsalScreen, locale: Locale = 'en') { return <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}><I18nProvider><LocaleSelection locale={locale} /><Page /></I18nProvider></SafeAreaInsetsContext.Provider> }
const identity = () => ({ showId: mockApp.show.id, setId: mockApp.set.id, revisionId: mockApp.show.revisionId })
function profiles(values: readonly ControllerProfile[]) { mockSnapshot = { ...mockSnapshot, controllerProfiles: values }; mockApp.libraryState = mockSnapshot }
function deferred() { let resolve!: (value: boolean) => void; const promise = new Promise<boolean>((done) => { resolve = done }); return { promise, resolve } }
beforeEach(() => {
  jest.clearAllMocks(); mockApp.show = sampleShow; mockApp.set = sampleShow.sets[0]!; mockApp.busy = false; mockApp.liveSession = false;
  mockApp.checks = { local: true, readable: true, order: true };
  mockSnapshot = { status: 'ready', saving: false, shows: [sampleShow], selectedShowId: sampleShow.id, selectedSetId: mockApp.set.id, settings: DEFAULT_LIBRARY_SETTINGS, controllerProfiles: [{ ...sampleControllerProfiles[0]!, bindings: sampleControllerProfiles[0]!.bindings.filter((binding) => binding.command.type === 'GO') }] };
  mockApp.libraryState = mockSnapshot; mockTouchPrepare.mockResolvedValue(false)
})

it('requires the usual preflight checks, then deliberately prepares once with the captured identity before entering Run', async () => {
  mockApp.checks.order = false; const screen = render(view(PreflightScreen));
  expect(screen.getByRole('button', { name: messages.en['remote.touchArm'] })).toBeDisabled()
  expect(screen.getByRole('button', { name: messages.en['preflight.arm'] })).toBeDisabled()
  mockApp.checks.order = true; screen.rerender(view(PreflightScreen))
  const before = JSON.stringify(mockSnapshot); const pending = deferred(); mockTouchPrepare.mockReturnValueOnce(pending.promise)
  fireEvent.press(screen.getByRole('button', { name: messages.en['remote.touchArm'] })); fireEvent.press(screen.getByRole('button', { name: messages.en['remote.touchArm'] }))
  expect(mockTouchPrepare).toHaveBeenCalledTimes(1); expect(mockTouchPrepare).toHaveBeenCalledWith('performance', identity()); expect(mockRouter.replace).not.toHaveBeenCalled()
  await act(async () => pending.resolve(true))
  expect(mockRouter.dismissAll).toHaveBeenCalledTimes(1); expect(mockRouter.replace).toHaveBeenCalledWith('/run')
  expect(mockApp.armShow).not.toHaveBeenCalled(); expect(JSON.stringify(mockSnapshot)).toBe(before)
})

it.each(['missing', 'incomplete'] as const)('offers the explicit fallback for an attached %s profile', (kind) => {
  if (kind === 'missing') profiles([])
  const screen = render(view(PreflightScreen))
  expect(screen.getByText(messages.en['remote.touchHelp'])).toBeTruthy()
  expect(screen.getByRole('button', { name: messages.en['remote.touchArm'] })).toBeEnabled()
})

it.each(['unattached', 'complete', 'unbound'] as const)('keeps ordinary preparation for a %s profile', (kind) => {
  if (kind === 'unattached') { const { controllerProfileId: _profile, ...show } = sampleShow; mockApp.show = show }
  else profiles(sampleControllerProfiles.map((profile) => kind === 'unbound' ? { ...profile, bindings: profile.bindings.map((binding) => ({ ...binding, adapterId: 'unbound' })) } : profile))
  const screen = render(view(PreflightScreen))
  expect(screen.queryByRole('button', { name: messages.en['remote.touchArm'] })).toBeNull()
  expect(screen.getByRole('button', { name: messages.en['preflight.arm'] })).toBeEnabled()
})

it('does not route after a failed preparation and retains a deliberate retry', async () => {
  const screen = render(view(PreflightScreen)); fireEvent.press(screen.getByRole('button', { name: messages.en['remote.touchArm'] })); await act(async () => undefined)
  expect(mockRouter.replace).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: messages.en['remote.touchArm'] })).toBeEnabled()
  mockTouchPrepare.mockResolvedValueOnce(true); fireEvent.press(screen.getByRole('button', { name: messages.en['remote.touchArm'] })); await act(async () => undefined)
  expect(mockTouchPrepare).toHaveBeenCalledTimes(2); expect(mockRouter.replace).toHaveBeenCalledTimes(1)
})

it.each(['revision', 'playlist', 'show', 'unavailable'] as const)('rejects stale navigation when the canonical %s changes during preparation', async (change) => {
  const pending = deferred(); mockTouchPrepare.mockReturnValueOnce(pending.promise); const screen = render(view(PreflightScreen))
  fireEvent.press(screen.getByRole('button', { name: messages.en['remote.touchArm'] }))
  if (change === 'revision') mockSnapshot = { ...mockSnapshot, shows: [{ ...sampleShow, revisionId: 'new-revision' }] }
  else if (change === 'playlist') mockSnapshot = { ...mockSnapshot, selectedSetId: 'different-set', shows: [{ ...sampleShow, sets: [...sampleShow.sets, { ...sampleShow.sets[0]!, id: 'different-set' }] }] }
  else if (change === 'show') mockSnapshot = { ...mockSnapshot, selectedShowId: 'another-show', shows: [{ ...sampleShow, id: 'another-show' }] }
  else mockSnapshot = { ...mockSnapshot, status: 'error' }
  await act(async () => pending.resolve(true)); expect(mockRouter.replace).not.toHaveBeenCalled(); expect(mockRouter.dismissAll).not.toHaveBeenCalled()
})

it('does not route after the preparation panel unmounts', async () => {
  const pending = deferred(); mockTouchPrepare.mockReturnValueOnce(pending.promise); const screen = render(view(PreflightScreen))
  fireEvent.press(screen.getByRole('button', { name: messages.en['remote.touchArm'] })); screen.unmount(); await act(async () => pending.resolve(true)); expect(mockRouter.replace).not.toHaveBeenCalled()
})

it.each(['busy', 'live', 'empty'] as const)('keeps rehearsal fallback unavailable while %s', (state) => {
  if (state === 'busy') mockApp.busy = true; else if (state === 'live') mockApp.liveSession = true; else mockApp.set = { ...mockApp.set, cueOrder: [] }
  const screen = render(view(RehearsalScreen)); expect(screen.getByRole('button', { name: messages.en['remote.touchPrepare'] })).toBeDisabled()
})

it.each(['en', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ar'] as const)('exposes both deliberate touch actions and their explanation in %s', async (locale) => {
  const preflight = render(view(PreflightScreen, locale)); expect(preflight.getByText(messages[locale]['remote.touchHelp'])).toBeTruthy(); expect(preflight.getByRole('button', { name: messages[locale]['remote.touchArm'] })).toBeEnabled(); preflight.unmount()
  const rehearsal = render(view(RehearsalScreen, locale)); expect(rehearsal.getByText(messages[locale]['remote.touchHelp'])).toBeTruthy()
  fireEvent.press(rehearsal.getByRole('button', { name: messages[locale]['remote.touchPrepare'] })); await act(async () => undefined)
  expect(mockTouchPrepare).toHaveBeenCalledWith('rehearsal', identity()); expect(mockApp.beginRehearsal).not.toHaveBeenCalled(); expect(mockRouter.replace).not.toHaveBeenCalled()
})
