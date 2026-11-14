import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import { ScrollView, SectionList } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { sampleShow, type AudioCue, type Show, type ShowSet } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import { usabilityLibraryEnglish } from '../../i18n/usability-library-messages'
import { BuilderScreen, LibraryScreen } from '../library-screens'
import { CollectionRow, WorkflowDialog } from '../workflow-components'

const mockRouter = { push: jest.fn(), replace: jest.fn() }
const mockLibrary = {
  select: jest.fn(), trash: jest.fn().mockResolvedValue([]), history: jest.fn().mockResolvedValue([]),
  reorderCues: jest.fn(), duplicateCue: jest.fn(), removeCue: jest.fn(), restoreRevision: jest.fn(), importAudio: jest.fn(),
}
const mockPreview = jest.fn()
let mockShow: Show
let mockSet: ShowSet
const mockApp = {
  show: sampleShow as Show, set: sampleShow.sets[0] as ShowSet, library: mockLibrary, busy: false, error: null,
  clearError: jest.fn(), retryLastTask: jest.fn(), preview: mockPreview,
  libraryState: { status: 'ready', saving: false, shows: [sampleShow] as readonly Show[], selectedShowId: sampleShow.id, selectedSetId: sampleShow.sets[0]!.id, settings: { locale: 'en', theme: 'darkBlue' } },
  runTask: async (work: () => Promise<unknown>) => { try { await work(); return true } catch { return false } },
}
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('../BackgroundReliabilityPanel', () => ({ BackgroundReliabilityPanel: () => null }))
jest.mock('../song-editor', () => { const { Text } = jest.requireActual('react-native'); return { SongEditor: ({ cue }: { cue: AudioCue }) => <Text>{'Silent editor: ' + cue.name}</Text> } })

const wrap = (screen: React.ReactNode) => <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}><I18nProvider>{screen}</I18nProvider></SafeAreaInsetsContext.Provider>
const text = usabilityLibraryEnglish
function editLabel(id: string) { return messages.en['editor.open'] + ' · ' + mockShow.cues[id]!.name }
function page(screen: ReturnType<typeof render>) { return within(screen.UNSAFE_getByType(ScrollView)) }

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  const original = structuredClone(sampleShow)
  const opening = original.cues.opening as AudioCue
  mockSet = { ...original.sets[0]!, cueOrder: ['opening', 'bed', 'last'], hitCueIds: ['hit-only', 'second-hit'], transportMode: 'oms' }
  mockShow = { ...original, sets: [mockSet, { ...mockSet, id: 'second-set', name: 'Second set', cueOrder: ['last'], hitCueIds: [] }], cues: { ...original.cues, opening: { ...opening, name: 'Opening Theme' }, last: { ...opening, id: 'last', name: 'Finale' }, 'hit-only': { ...opening, id: 'hit-only', name: 'Comic Sting', notes: 'Late volunteer' }, 'second-hit': { ...opening, id: 'second-hit', name: 'Soft Bell' } } }
  mockApp.show = mockShow; mockApp.set = mockSet; mockApp.busy = false
  mockApp.libraryState = { ...mockApp.libraryState, status: 'ready', shows: [mockShow, { ...mockShow, id: 'other-show', name: 'Afternoon Cabaret' }], selectedShowId: mockShow.id, selectedSetId: mockSet.id }
  mockLibrary.select.mockResolvedValue(undefined); mockLibrary.reorderCues.mockResolvedValue(undefined)
})

afterEach(() => { jest.useRealTimers() })

describe('library and playlist task usability', () => {
  it.each([
    { name: 'Library', Page: LibraryScreen, label: text['use.library.findShow'] },
    { name: 'Builder', Page: BuilderScreen, label: text['use.library.findCue'] },
  ])('uses the measured search anchor while editing and clearing $name queries', async ({ Page, label }) => {
    const scrollTo = jest.fn()
    const responder = jest.spyOn(SectionList.prototype, 'getScrollResponder').mockReturnValue({ scrollTo } as unknown as ReturnType<SectionList<unknown>['getScrollResponder']>)
    try {
      const screen = render(wrap(<Page />))
      const input = screen.getByLabelText(label)
      fireEvent(screen.getByTestId('collection-search'), 'layout', { nativeEvent: { layout: { x: 0, y: 612, width: 300, height: 80 } } })
      fireEvent.changeText(input, 'finale')
      expect(scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 612, animated: false })
      fireEvent.changeText(input, '')
      expect(screen.getByLabelText(label)).toBe(input)
      expect(scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 612, animated: false })
      await act(async () => undefined)
    } finally { responder.mockRestore() }
  })
  it('windows a large show collection and finds its final item without selecting or playing it', async () => {
    mockApp.libraryState.shows = [mockShow, ...Array.from({ length: 1200 }, (_, index) => ({ ...mockShow, id: `collection-show-${index}`, name: `Collection show ${String(index).padStart(4, '0')}` }))]
    const screen = render(wrap(<LibraryScreen />))
    expect(screen.UNSAFE_getByType(SectionList).props.sections[0].data).toHaveLength(1200)
    expect(screen.UNSAFE_getAllByType(CollectionRow).length).toBeLessThan(20)
    const search = screen.getByLabelText(text['use.library.findShow'])
    fireEvent.changeText(search, 'show 1199')
    expect(screen.getByLabelText(text['use.library.findShow'])).toBe(search)
    expect(screen.getByRole('button', { name: messages.en['library.open'] + ' · Collection show 1199' })).toBeTruthy()
    expect(mockLibrary.select).not.toHaveBeenCalled(); expect(mockPreview).not.toHaveBeenCalled()
    await act(async () => undefined)
  })

  it.each(['loading', 'error'])('hides stale Library shows and search while the store is %s', async (status) => {
    mockApp.libraryState.status = status
    const screen = render(wrap(<LibraryScreen />))
    expect(screen.UNSAFE_getByType(SectionList).props.sections).toEqual([])
    expect(screen.queryByText(mockShow.name)).toBeNull()
    expect(screen.queryByLabelText(text['use.library.findShow'])).toBeNull()
    expect(screen.getByRole('button', { name: messages.en['library.create'] })).toBeDisabled()
    await act(async () => undefined)
  })

  it('keeps all 1200 songs searchable, retains the search input and reorders a far match against the full order', async () => {
    const prototype = mockShow.cues.opening as AudioCue
    const cues = Array.from({ length: 1200 }, (_, index) => ({ ...prototype, id: `collection-cue-${index}`, name: `Collection cue ${String(index).padStart(4, '0')}` }))
    mockApp.set = { ...mockSet, cueOrder: cues.map((cue) => cue.id), hitCueIds: [] }
    mockApp.show = { ...mockShow, cues: Object.fromEntries(cues.map((cue) => [cue.id, cue])), sets: [mockApp.set] }
    const screen = render(wrap(<BuilderScreen />))
    expect(screen.UNSAFE_getByType(SectionList).props.sections[0].data).toHaveLength(1200)
    expect(screen.UNSAFE_getAllByType(CollectionRow).length).toBeLessThan(20)
    const search = screen.getByLabelText(text['use.library.findCue'])
    fireEvent.changeText(search, 'cue 1199')
    expect(screen.getByLabelText(text['use.library.findCue'])).toBe(search)
    expect(screen.getByText('1200')).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.manage'] + ' · Collection cue 1199' }))
    const dialog = screen.UNSAFE_getByType(WorkflowDialog)
    expect(within(screen.UNSAFE_getByType(SectionList)).queryByRole('button', { name: messages.en['common.moveUp'] })).toBeNull()
    fireEvent.press(within(dialog).getByRole('button', { name: messages.en['common.moveUp'] }))
    await waitFor(() => expect(mockLibrary.reorderCues).toHaveBeenCalledTimes(1))
    expect(mockLibrary.reorderCues.mock.calls[0]).toEqual([mockShow.id, mockSet.id, [...cues.slice(0, -2).map((cue) => cue.id), 'collection-cue-1199', 'collection-cue-1198'], false])
    mockApp.set = { ...mockApp.set, cueOrder: mockLibrary.reorderCues.mock.calls[0]![2] }
    mockApp.show = { ...mockApp.show, revisionId: 'updated-order', sets: [mockApp.set] }
    screen.rerender(wrap(<BuilderScreen />))
    fireEvent.changeText(search, 'no matching row')
    expect(screen.UNSAFE_getByType(WorkflowDialog)).toBe(dialog)
    expect(screen.UNSAFE_getByType(SectionList).props.sections).toEqual([])
    expect(within(dialog).getByRole('button', { name: messages.en['common.moveUp'] })).toBeEnabled()
    expect(mockPreview).not.toHaveBeenCalled()
  })
  it('finds a show case-insensitively, keeps the current selection and offers a reversible no-match state', async () => {
    const before = JSON.stringify(mockApp.libraryState)
    const screen = render(wrap(<LibraryScreen />))
    fireEvent.changeText(screen.getByLabelText(text['use.library.findShow']), '  AFTERNOON  ')
    expect(screen.getByRole('button', { name: messages.en['library.open'] + ' · Afternoon Cabaret' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: messages.en['library.open'] + ' · ' + mockShow.name })).toBeNull()
    fireEvent.changeText(screen.getByLabelText(text['use.library.findShow']), 'missing show')
    expect(screen.getByText(text['use.library.noShows'])).toBeTruthy()
    fireEvent.press(screen.getAllByRole('button', { name: text['use.library.clearSearch'] }).at(-1)!)
    expect(screen.getByRole('button', { name: messages.en['library.open'] + ' · ' + mockShow.name })).toBeTruthy()
    expect(mockLibrary.select).not.toHaveBeenCalled(); expect(JSON.stringify(mockApp.libraryState)).toBe(before)
    await act(async () => undefined)
  })

  it('waits for show selection before entering rehearsal and never starts playback', async () => {
    let finish!: () => void
    mockLibrary.select.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    const screen = render(wrap(<LibraryScreen />))
    fireEvent.press(page(screen).getByRole('button', { name: messages.en['nav.rehearsal'] }))
    fireEvent.press(page(screen).getByRole('button', { name: messages.en['nav.rehearsal'] }))
    expect(mockLibrary.select).toHaveBeenCalledTimes(1)
    expect(mockLibrary.select).toHaveBeenCalledWith(mockShow.id, mockSet.id)
    expect(mockRouter.push).not.toHaveBeenCalled()
    await act(async () => finish())
    expect(mockRouter.push).toHaveBeenCalledWith('/rehearsal'); expect(mockPreview).not.toHaveBeenCalled()
  })

  it('does not open a route when selection finishes after leaving the library', async () => {
    let finish!: () => void
    mockLibrary.select.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    const screen = render(wrap(<LibraryScreen />))
    fireEvent.press(page(screen).getByRole('button', { name: messages.en['nav.rehearsal'] }))
    screen.unmount()
    await act(async () => finish())
    expect(mockRouter.push).not.toHaveBeenCalled()
  })

  it('does not navigate when selecting the current show fails', async () => {
    mockLibrary.select.mockRejectedValueOnce(new Error('database is locked'))
    const screen = render(wrap(<LibraryScreen />))
    fireEvent.press(page(screen).getByRole('button', { name: messages.en['nav.run'] }))
    await act(async () => undefined)
    expect(mockRouter.push).not.toHaveBeenCalled(); expect(mockPreview).not.toHaveBeenCalled()
  })

  it('opens the displayed current playlist rather than silently reverting to the first playlist', async () => {
    mockApp.libraryState.selectedSetId = mockShow.sets[1]!.id
    const screen = render(wrap(<LibraryScreen />))
    expect(screen.getByText(text['use.library.activePlaylist'].replace('{name}', 'Second set'))).toBeTruthy()
    fireEvent.press(page(screen).getByRole('button', { name: messages.en['nav.run'] }))
    await waitFor(() => expect(mockLibrary.select).toHaveBeenCalledWith(mockShow.id, 'second-set'))
    expect(mockRouter.push).toHaveBeenCalledWith('/preflight')
  })

  it('keeps rehearsal and Run available above a long playlist and does not mistake a filter for an empty set', () => {
    const screen = render(wrap(<BuilderScreen />))
    fireEvent.changeText(screen.getByLabelText(text['use.library.findCue']), 'does not exist')
    expect(screen.getByText(text['use.library.noCues'])).toBeTruthy()
    expect(screen.queryByText(messages.en['finder.empty'])).toBeNull()
    expect(page(screen).getByRole('button', { name: messages.en['nav.rehearsal'] })).toBeEnabled()
    fireEvent.press(page(screen).getByRole('button', { name: messages.en['nav.run'] }))
    expect(mockRouter.push).toHaveBeenCalledWith('/preflight')
    expect(mockLibrary.select).not.toHaveBeenCalled(); expect(mockPreview).not.toHaveBeenCalled()
  })

  it('finds notes on a Hit-only song and opens its editor silently', () => {
    const before = JSON.stringify(mockShow)
    const screen = render(wrap(<BuilderScreen />))
    fireEvent.changeText(screen.getByLabelText(text['use.library.findCue']), 'volunteer LATE')
    expect(screen.queryByRole('button', { name: editLabel('opening') })).toBeNull()
    expect(screen.getByText(messages.en['run.hits'])).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: text['use.library.editHit'] + ' · Comic Sting' }))
    expect(screen.getByText('Silent editor: Comic Sting')).toBeTruthy()
    expect(mockPreview).not.toHaveBeenCalled(); expect(JSON.stringify(mockShow)).toBe(before)
  })

  it('reorders against the full main list while filtered rather than changing the visible subset', async () => {
    const screen = render(wrap(<BuilderScreen />))
    fireEvent.changeText(screen.getByLabelText(text['use.library.findCue']), 'Finale')
    expect(screen.getByText('03')).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.manage'] + ' · Finale' }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.moveUp'] }))
    await waitFor(() => expect(mockLibrary.reorderCues).toHaveBeenCalledWith(mockShow.id, mockSet.id, ['opening', 'last', 'bed'], false))
    expect(mockSet.cueOrder).toEqual(['opening', 'bed', 'last'])
  })

  it('reorders an independent Hit without advancing or modifying the main song list', async () => {
    const screen = render(wrap(<BuilderScreen />))
    fireEvent.press(screen.getByRole('button', { name: text['use.library.manageHit'] + ' · Soft Bell' }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.moveUp'] }))
    await waitFor(() => expect(mockLibrary.reorderCues).toHaveBeenCalledWith(mockShow.id, mockSet.id, ['second-hit', 'hit-only'], true))
    expect(mockSet.cueOrder).toEqual(['opening', 'bed', 'last']); expect(mockPreview).not.toHaveBeenCalled()
  })

  it('names the real duplicate destination when a Hit also belongs to the song order', async () => {
    mockApp.set = { ...mockSet, hitCueIds: ['opening', ...mockSet.hitCueIds] }
    const screen = render(wrap(<BuilderScreen />))
    fireEvent.press(screen.getByRole('button', { name: text['use.library.manageHit'] + ' · Opening Theme' }))
    expect(screen.queryByRole('button', { name: messages.en['common.duplicate'] })).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: text['use.library.duplicateInOrder'] }))
    await waitFor(() => expect(mockLibrary.duplicateCue).toHaveBeenCalledWith(mockShow.id, mockSet.id, 'opening'))
    expect(mockPreview).not.toHaveBeenCalled()
  })

  it('clears a playlist search on a different set without hiding songs in that set', () => {
    const screen = render(wrap(<BuilderScreen />))
    fireEvent.changeText(screen.getByLabelText(text['use.library.findCue']), 'opening')
    mockApp.set = mockShow.sets[1]!
    screen.rerender(wrap(<BuilderScreen />))
    expect(screen.getByLabelText(text['use.library.findCue']).props.value).toBe('')
    expect(screen.getByRole('button', { name: editLabel('last') })).toBeTruthy()
  })

  it('clears a Library filter when its selected playlist or show changes', async () => {
    const screen = render(wrap(<LibraryScreen />))
    fireEvent.changeText(screen.getByLabelText(text['use.library.findShow']), 'Afternoon')
    mockApp.libraryState = { ...mockApp.libraryState, selectedSetId: 'second-set' }
    screen.rerender(wrap(<LibraryScreen />))
    expect(screen.getByLabelText(text['use.library.findShow']).props.value).toBe('')
    expect(screen.getByRole('button', { name: messages.en['library.open'] + ' · ' + mockShow.name })).toBeTruthy()
    fireEvent.changeText(screen.getByLabelText(text['use.library.findShow']), 'missing')
    mockApp.libraryState = { ...mockApp.libraryState, selectedShowId: 'other-show' }
    screen.rerender(wrap(<LibraryScreen />))
    expect(screen.getByLabelText(text['use.library.findShow']).props.value).toBe('')
    expect(screen.getByRole('button', { name: messages.en['library.open'] + ' · Afternoon Cabaret' })).toBeTruthy()
    expect(mockLibrary.select).not.toHaveBeenCalled()
    await act(async () => undefined)
  })

  it('keeps deletion confirmation and Cancel intact for a Hit', () => {
    const screen = render(wrap(<BuilderScreen />))
    fireEvent.press(screen.getByRole('button', { name: text['use.library.manageHit'] + ' · Comic Sting' }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.delete'] }))
    expect(screen.getByText(messages.en['common.confirmDelete'])).toBeTruthy()
    expect(screen.getByText(text['use.library.deleteCueHelp'])).toBeTruthy()
    expect(screen.getAllByRole('button', { name: messages.en['common.delete'] })).toHaveLength(1)
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.cancel'] }))
    expect(screen.getByRole('button', { name: messages.en['common.duplicate'] })).toBeTruthy()
    expect(mockLibrary.removeCue).not.toHaveBeenCalled()
  })

  it('keeps an empty playlist importable with disabled rehearsal and Run', () => {
    mockApp.set = { ...mockSet, cueOrder: [], hitCueIds: [] }
    const screen = render(wrap(<BuilderScreen />))
    expect(page(screen).getByRole('button', { name: messages.en['nav.rehearsal'] })).toBeDisabled()
    expect(page(screen).getByRole('button', { name: messages.en['nav.run'] })).toBeDisabled()
    expect(screen.getByRole('button', { name: messages.en['builder.import'] })).toBeEnabled()
    expect(screen.queryByLabelText(text['use.library.findCue'])).toBeNull()
  })

  it('disables editing and management while a library operation is busy', () => {
    mockApp.busy = true
    const screen = render(wrap(<BuilderScreen />))
    expect(screen.getByRole('button', { name: editLabel('opening') })).toBeDisabled()
    expect(screen.getByRole('button', { name: text['use.library.editHit'] + ' · Comic Sting' })).toBeDisabled()
    expect(screen.getByRole('button', { name: messages.en['library.playlists'] })).toBeDisabled()
  })
})
