import { act, fireEvent, render } from '@testing-library/react-native'
import * as ReactNative from 'react-native'
import { sampleShow, type Show } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import { DEFAULT_LIBRARY_SETTINGS } from '../../library/types'
import { SettingsScreen } from '../screens'

let stored: Show = { ...sampleShow, panicFadeMs: 2000 }
const saves: number[] = []
let release: (() => void) | null = null
const mockApp = {
  busy: false, liveSession: false, show: stored as Show | null,
  library: {
    updateSettings: jest.fn().mockResolvedValue(undefined),
    getSnapshot: () => ({ shows: [stored] }),
    // Each save stays pending until the test releases it, like a slow SQLite write.
    saveShow: (show: Show) => new Promise<void>((resolve) => { saves.push(show.panicFadeMs); release = () => { stored = show; resolve() } }),
  },
  libraryState: { status: 'ready', settings: { ...DEFAULT_LIBRARY_SETTINGS } },
  runTask: async (work: () => Promise<unknown>) => { await work(); return true },
}
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), canGoBack: () => false, replace: jest.fn() }) }))
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('../library-screens', () => ({ OperationStatus: () => null }))
jest.mock('../BackupPanel', () => ({ BackupPanel: () => null }))
jest.mock('../BackgroundReliabilityPanel', () => ({ BackgroundReliabilityPanel: () => null }))

const increase = `${messages.en['common.increase']} · ${messages.en['editor.fadeOut']}`
function open() {
  const screen = render(<I18nProvider><SettingsScreen /></I18nProvider>)
  fireEvent.press(screen.getByRole('button', { name: messages.en['use.settings.tools'] }))
  fireEvent.press(screen.getByRole('button', { name: messages.en['command.PANIC_FADE'] }))
  return screen
}
beforeEach(() => {
  stored = { ...sampleShow, panicFadeMs: 2000 }; mockApp.show = stored; mockApp.busy = false; saves.length = 0; release = null
  jest.spyOn(jest.requireActual<typeof ReactNative>('react-native'), 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 1, fontScale: 1 })
})
afterEach(() => jest.restoreAllMocks())

it('keeps rapid steps made during a save and writes only the newest value afterwards', async () => {
  const screen = open()
  fireEvent.press(screen.getByRole('button', { name: increase }))
  fireEvent.press(screen.getByRole('button', { name: increase }))
  fireEvent.press(screen.getByRole('button', { name: increase }))
  expect(saves).toEqual([2100])
  // The slider already shows the operator's latest value while the first write is pending.
  expect(screen.getByText('2.3 s')).toBeTruthy()
  await act(async () => { release?.() })
  expect(saves).toEqual([2100, 2300])
  await act(async () => { release?.() })
  expect(saves).toEqual([2100, 2300])
})

it('waits for other tasks such as an import or restore before saving', async () => {
  const screen = open()
  mockApp.busy = true
  screen.rerender(<I18nProvider><SettingsScreen /></I18nProvider>)
  fireEvent.press(screen.getByRole('button', { name: increase }))
  expect(saves).toEqual([])
  mockApp.busy = false
  screen.rerender(<I18nProvider><SettingsScreen /></I18nProvider>)
  await act(async () => undefined)
  expect(saves).toEqual([2100])
})
