import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { sampleShow } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import { DEFAULT_LIBRARY_SETTINGS } from '../../library/types'
import { setCriticalSessionActive } from '../../runtime/critical-session-gate'
import { VoiceScreen } from '../service-screens'

const mockDirector = {
  getStatus: jest.fn().mockResolvedValue({ available: true, armed: false, modelReady: false, calibrated: false, detail: '' }),
  subscribe: jest.fn().mockReturnValue({ remove: jest.fn() }), calibrate: jest.fn(),
}
const mockApp = {
  show: sampleShow, set: sampleShow.sets[0], library: {}, busy: false, liveSession: false,
  libraryState: { settings: DEFAULT_LIBRARY_SETTINGS, controllerProfiles: [] },
  runTask: async (work: () => Promise<unknown>) => { await work(); return true },
}
let mockRetry: (() => Promise<unknown>) | null = null
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('../../voice', () => ({ resolveVoiceDirector: () => mockDirector }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useLocalSearchParams: () => ({}) }))
const wrap = () => <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}><I18nProvider><VoiceScreen /></I18nProvider></SafeAreaInsetsContext.Provider>

afterEach(() => { setCriticalSessionActive(false); mockApp.liveSession = false; mockRetry = null; jest.clearAllMocks() })

it('cannot reconfigure the microphone session after arming, including before the disabled UI rerenders', async () => {
  const screen = render(wrap())
  await waitFor(() => expect(screen.getByRole('button', { name: messages.en['voice.calibrate'] })).toBeEnabled())
  setCriticalSessionActive(true)
  fireEvent.press(screen.getByRole('button', { name: messages.en['voice.calibrate'] }))
  expect(mockDirector.calibrate).not.toHaveBeenCalled()
  mockApp.liveSession = true; screen.rerender(wrap())
  expect(screen.getByRole('button', { name: messages.en['voice.calibrate'] })).toBeDisabled()
})

it('rechecks safety inside a saved calibration Retry after a show becomes critical', async () => {
  mockApp.runTask = async (work) => { mockRetry = work; try { await work(); return true } catch { return false } }
  mockDirector.calibrate.mockRejectedValueOnce(new Error('microphone unavailable'))
  const screen = render(wrap())
  const calibrate = () => screen.getByRole('button', { name: messages.en['voice.calibrate'] })
  await waitFor(() => expect(calibrate()).toBeEnabled())
  fireEvent.press(calibrate())
  await waitFor(() => expect(calibrate()).toBeEnabled())
  expect(mockDirector.calibrate).toHaveBeenCalledTimes(1)
  setCriticalSessionActive(true)
  await act(async () => { await expect(mockRetry!()).rejects.toThrow('editor.previewSafety') })
  expect(mockDirector.calibrate).toHaveBeenCalledTimes(1)
})
