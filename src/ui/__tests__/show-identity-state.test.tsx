import { act, fireEvent, render } from '@testing-library/react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { sampleShow, type Show } from '../../domain'
import { validateLocalShow } from '../../domain/validate-show'
import { I18nProvider, messages } from '../../i18n'
import { DEFAULT_LIBRARY_SETTINGS, type LibrarySnapshot } from '../../library/types'
import { ShowSession } from '../../runtime/show-session'
import { BuilderScreen, LibraryScreen } from '../library-screens'
import { RehearsalScreen } from '../rehearsal-screen'

const mockRouter = { push: jest.fn(), replace: jest.fn() }
const mockLibrary = {
  select: jest.fn().mockResolvedValue(undefined), trash: jest.fn().mockResolvedValue([]),
  waveform: jest.fn().mockResolvedValue([0.1, 0.9]), updateCue: jest.fn().mockResolvedValue(undefined),
  getSnapshot: (): LibrarySnapshot => mockApp.libraryState as LibrarySnapshot,
}
const mockApp = {
  library: mockLibrary, show: sampleShow as Show, set: sampleShow.sets[0]!, busy: false, liveSession: false, error: null,
  clearError: jest.fn(), retryLastTask: jest.fn(), session: new ShowSession({ engine: null }).getState(),
  previewState: null, preview: jest.fn(), pausePreview: jest.fn(), resumePreview: jest.fn(), scrub: jest.fn(), stopPreview: jest.fn().mockResolvedValue(undefined),
  beginRehearsal: jest.fn(), go: jest.fn(), panic: jest.fn(), stopAll: jest.fn(), pauseResume: jest.fn(), previous: jest.fn(), replay: jest.fn(), selectCue: jest.fn(), seek: jest.fn(), triggerHit: jest.fn(), exitShow: jest.fn(), prepareTouchSession: jest.fn(),
  libraryState: { status: 'ready', saving: false, shows: [] as readonly Show[], selectedShowId: '', selectedSetId: '', controllerProfiles: [], settings: DEFAULT_LIBRARY_SETTINGS },
  runTask: async (work: () => Promise<unknown>) => { try { await work(); return true } catch { return false } },
}
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('../BackgroundReliabilityPanel', () => ({ BackgroundReliabilityPanel: () => null }))
const wrap = (children: React.ReactNode) => <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}><I18nProvider>{children}</I18nProvider></SafeAreaInsetsContext.Provider>

function fixture(id: string, setId: string, name: string): Show {
  const { controllerProfileId: _profile, ...base } = structuredClone(sampleShow)
  const cue = base.cues.opening!
  if (cue.type !== 'audio') throw new Error('Fixture audio required')
  return { ...base, id, revisionId: `revision-${id}`, name: 'Same restored show',
    cues: { opening: { ...cue, name, notes: `Saved notes for ${name}` } },
    sets: [{ ...base.sets[0]!, id: setId, cueOrder: ['opening'], hitCueIds: [] }],
  }
}
let first: Show; let second: Show
function select(value: Show) { mockApp.show = value; mockApp.set = value.sets[0]!; mockApp.libraryState = { ...mockApp.libraryState, selectedShowId: value.id, selectedSetId: value.sets[0]!.id } }
beforeEach(() => {
  jest.clearAllMocks()
  first = fixture('show:a', 'set', 'First song'); second = fixture('show', 'a:set', 'Second song')
  validateLocalShow(first); validateLocalShow(second)
  mockApp.libraryState = { ...mockApp.libraryState, shows: [first, second] }
  select(first)
  // These are valid legacy identities; their old delimiter-joined keys collide.
  expect(`${first.id}:${first.sets[0]!.id}`).toBe(`${second.id}:${second.sets[0]!.id}`)
  mockLibrary.trash.mockResolvedValue([]); mockLibrary.waveform.mockResolvedValue([0.1, 0.9]); mockLibrary.updateCue.mockResolvedValue(undefined); mockApp.stopPreview.mockResolvedValue(undefined)
})

it('does not save an old song draft into another valid show with the same scoped cue ID', async () => {
  const screen = render(wrap(<BuilderScreen />)); await act(async () => undefined)
  fireEvent.press(screen.getByRole('button', { name: `${messages.en['editor.open']} · First song` }))
  fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.details'] }))
  fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), 'UNSAVED FIRST SHOW DRAFT')
  select(second); screen.rerender(wrap(<BuilderScreen />)); await act(async () => undefined)
  const retainedEditor = screen.queryByTestId('song-editor-scroll') !== null
  // Exercise the real editor's save if the wrong workspace survived selection.
  if (retainedEditor) { fireEvent.press(screen.getByRole('button', { name: messages.en['common.save'] })); await act(async () => undefined) }
  expect(mockLibrary.updateCue).not.toHaveBeenCalled()
  expect(retainedEditor).toBe(false)
  expect(screen.getByRole('button', { name: `${messages.en['editor.open']} · Second song` })).toBeTruthy()
  expect(mockApp.preview).not.toHaveBeenCalled(); expect(mockApp.go).not.toHaveBeenCalled()
})

it('resets Library search when a different selected show has the same former compound scope', async () => {
  const screen = render(wrap(<LibraryScreen />)); await act(async () => undefined)
  fireEvent.changeText(screen.getByLabelText(messages.en['use.library.findShow']), 'old-search-from-first-show')
  select(second); screen.rerender(wrap(<LibraryScreen />)); await act(async () => undefined)
  expect(screen.getByLabelText(messages.en['use.library.findShow']).props.value).toBe('')
  expect(mockLibrary.select).not.toHaveBeenCalled(); expect(mockLibrary.updateCue).not.toHaveBeenCalled()
})

it('resets unprepared Rehearsal search when a different selected show has the same former compound scope', async () => {
  const screen = render(wrap(<RehearsalScreen />)); await act(async () => undefined)
  fireEvent.changeText(screen.getByLabelText(messages.en['use.library.findCue']), 'First song')
  select(second); screen.rerender(wrap(<RehearsalScreen />)); await act(async () => undefined)
  expect(screen.getByLabelText(messages.en['use.library.findCue']).props.value).toBe('')
  expect(screen.getByText('Second song')).toBeTruthy()
  expect(mockApp.beginRehearsal).not.toHaveBeenCalled(); expect(mockApp.go).not.toHaveBeenCalled()
})
