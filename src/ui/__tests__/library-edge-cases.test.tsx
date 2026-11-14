import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { sampleShow, type AudioCue, type Show, type ShowSet } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import { BuilderScreen, EmptySelection } from '../library-screens'
import { MetricGrid } from '../MetricGrid'
import { RehearsalWaveform } from '../RehearsalWaveform'
import type { LibraryStore } from '../../library'

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn(), canGoBack: () => false }
const mockLibrary = {
  select: jest.fn(), trash: jest.fn().mockResolvedValue([]), history: jest.fn().mockResolvedValue([]), historyPage: jest.fn().mockResolvedValue({ revisions: [], nextCursor: null }),
  reorderCues: jest.fn(), duplicateCue: jest.fn(), removeCue: jest.fn(), restoreRevision: jest.fn(), importAudio: jest.fn(),
}
const mockApp = {
  show: sampleShow as Show, set: sampleShow.sets[0] as ShowSet, library: mockLibrary, busy: false, error: null,
  clearError: jest.fn(), retryLastTask: jest.fn(), preview: jest.fn(),
  libraryState: { status: 'ready', saving: false, shows: [sampleShow] as readonly Show[], selectedShowId: sampleShow.id, selectedSetId: sampleShow.sets[0]!.id, settings: { locale: 'en', theme: 'darkBlue' } },
  runTask: async (work: () => Promise<unknown>) => { try { await work(); return true } catch { return false } },
}
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('../BackgroundReliabilityPanel', () => ({ BackgroundReliabilityPanel: () => null }))
jest.mock('../HistoryPanel', () => ({ HistoryPanel: () => null }))

const wrap = (screen: React.ReactNode) => <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}><I18nProvider>{screen}</I18nProvider></SafeAreaInsetsContext.Provider>
const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>
type Node = { type: unknown; props: Record<string, unknown>; parent: Node | null }
/** Nearest host View ancestor whose style matches. */
function ancestor(node: Node, match: (style: Record<string, unknown>) => boolean) {
  let current = node.parent
  while (current && !(current.type === 'View' && match(flat(current.props.style)))) current = current.parent
  return current
}

beforeEach(() => {
  jest.clearAllMocks()
  const original = structuredClone(sampleShow)
  const opening = original.cues.opening as AudioCue
  const set: ShowSet = { ...original.sets[0]!, cueOrder: ['opening'], hitCueIds: [] }
  const show: Show = { ...original, sets: [set], cues: { ...original.cues, opening: { ...opening, playbackRate: 1.1500000000000001 } } }
  mockApp.show = show; mockApp.set = set; mockApp.busy = false
  mockApp.libraryState = { ...mockApp.libraryState, shows: [show], selectedShowId: show.id, selectedSetId: set.id }
})

describe('Builder layout edge cases', () => {
  it('lets Builder actions wrap at content size instead of squeezing into fixed halves', () => {
    const screen = render(wrap(<BuilderScreen />))
    const isSlot = (style: Record<string, unknown>) => style.flexGrow === 1 && style.flexShrink === 1 && style.minWidth !== undefined
    for (const name of [messages.en['builder.import'], messages.en['finder.title'], messages.en['nav.rehearsal'], messages.en['nav.run']]) {
      // Navigation repeats Rehearse/Run; only the playlist-card copies sit in action slots.
      const slots = (screen.getAllByRole('button', { name }) as unknown as Node[]).map((button) => ancestor(button, isSlot)).filter(Boolean)
      expect(slots).toHaveLength(1)
      expect(flat(slots[0]!.props.style).flex).toBeUndefined()
      expect(ancestor(slots[0]!, (style) => style.flexWrap === 'wrap' && style.flexDirection === 'row')).toBeTruthy()
    }
  })
  it('shows a playback rate without binary float noise', () => {
    const screen = render(wrap(<BuilderScreen />))
    expect(screen.getByText(/1\.15×/)).toBeTruthy()
    expect(screen.queryByText(/1\.1500000000000001/)).toBeNull()
  })
})

describe('empty selection navigation', () => {
  it('highlights the route actually shown so the Builder tab still navigates from Rehearsal', () => {
    const screen = render(wrap(<EmptySelection current="/rehearsal" title={messages.en['rehearsal.title']} />))
    expect(screen.getByRole('header', { name: messages.en['rehearsal.title'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: messages.en['nav.rehearsal'] }).props.accessibilityState.selected).toBe(true)
    expect(screen.getByRole('button', { name: messages.en['nav.builder'] }).props.accessibilityState.selected).toBe(false)
    fireEvent.press(screen.getByRole('button', { name: messages.en['nav.builder'] }))
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/builder')
  })
})

describe('metric grid', () => {
  const items = [{ label: 'Length', value: '3:12.456' }, { label: 'Speed', value: '1.15×' }, { label: 'Volume', value: '-18 dB' }]
  const metric = (screen: ReturnType<typeof render>) => flat(screen.getByLabelText('Length: 3:12.456').props.style)
  let dimensions: jest.SpyInstance
  beforeEach(() => { dimensions = jest.spyOn(jest.requireActual<typeof import('react-native')>('react-native'), 'useWindowDimensions').mockReturnValue({ width: 412, height: 915, scale: 1, fontScale: 1 }) })
  afterEach(() => dimensions.mockRestore())
  it('stacks when its measured container is too narrow for three legible columns, even on a wide window', () => {
    const screen = render(wrap(<MetricGrid items={items} />))
    expect(metric(screen).width).toBeUndefined()
    const grid = ancestor(screen.getByLabelText('Length: 3:12.456') as unknown as Node, (style) => style.flexDirection === 'row')!
    fireEvent(grid as never, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 240, height: 80 } } })
    expect(metric(screen).width).toBe('100%')
  })
  it('keeps one row when the container has room', () => {
    const screen = render(wrap(<MetricGrid items={items} />))
    const grid = ancestor(screen.getByLabelText('Length: 3:12.456') as unknown as Node, (style) => style.flexDirection === 'row')!
    fireEvent(grid as never, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 80 } } })
    expect(metric(screen).width).toBeUndefined()
  })
})

describe('rehearsal waveform', () => {
  it('moves by one second per increment instead of one millisecond', async () => {
    const opening = sampleShow.cues.opening as AudioCue
    const audio = { ...opening, mediaAsset: sampleShow.media['media-open']! }
    const onSeek = jest.fn()
    const library = { waveform: jest.fn().mockResolvedValue([0.2, 0.5, 0.8]) } as unknown as LibraryStore
    const screen = render(wrap(<RehearsalWaveform audio={audio} library={library} sourcePositionMs={12_345} disabled={false} retryDisabled={false} onSeek={onSeek} />))
    await waitFor(() => expect(library.waveform).toHaveBeenCalled())
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.increase'] + ' · ' + messages.en['editor.waveform'] }))
    expect(onSeek).toHaveBeenLastCalledWith(13_345)
    fireEvent(screen.getByRole('adjustable', { name: messages.en['editor.waveform'] }), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } })
    expect(onSeek).toHaveBeenLastCalledWith(12_345)
  })
})
