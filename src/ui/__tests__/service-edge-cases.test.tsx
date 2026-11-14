import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import type { VisualStatus } from '../../../modules/show-visual'
import { sampleShow } from '../../domain'
import { I18nProvider, messages, useI18n, type Locale } from '../../i18n'
import { DEFAULT_LIBRARY_SETTINGS } from '../../library/types'
import { AudienceDisplayPanel } from '../audience-display'
import { ControllersScreen } from '../controller-screen'
import { percentLabel } from '../music-screens'
import { Button } from '../primitives'
import { MusicScreen, VoiceScreen } from '../service-screens'

const mockGenerate = jest.fn()
const mockVisualStatus = jest.fn<Promise<VisualStatus>, []>()
const mockDirector = { getStatus: jest.fn(), subscribe: jest.fn().mockReturnValue({ remove: jest.fn() }) }
const runTask = async (work: () => Promise<unknown>) => { try { await work(); return true } catch { return false } }
const baseApp = {
  show: sampleShow, set: sampleShow.sets[0], busy: false, liveSession: false, session: { snapshot: null }, error: null, clearError: jest.fn(), retryLastTask: jest.fn(), runTask,
  library: { recordPrompt: jest.fn().mockResolvedValue(undefined), importAudio: jest.fn(), getSnapshot: () => ({ shows: [sampleShow] }), updateSettings: jest.fn() },
  libraryState: { status: 'ready', saving: false, settings: DEFAULT_LIBRARY_SETTINGS, controllerProfiles: [{ id: sampleShow.controllerProfileId!, name: 'Show', bindings: [{ adapterId: 'generic-native', deviceId: 'pedal', inputKey: 'KEYCODE_PAGE_DOWN', command: { type: 'GO' as const } }] }] },
  controllerHealth: { sdkAvailable: true, configured: true, restored: true, bluetoothState: 'powered_on', pairedCount: 0, readyCount: 0, connectingCount: 0, staleEventsSuppressed: 0, backgroundRequested: false, initialPairingMayRequireInternet: true, detail: '', diagnosticMode: 'off', diagnosticSessionId: '', genericKeyboardConnected: true },
  controllerInputs: [], controllerScan: null, pairController: jest.fn(), cancelControllerPairing: jest.fn(), refreshControllers: jest.fn().mockResolvedValue(undefined), beginControllerDiagnostics: jest.fn(), endControllerDiagnostics: jest.fn().mockResolvedValue(undefined), assignControllerInput: jest.fn(), removeControllerBinding: jest.fn(),
}
const mockApp = baseApp
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), dismissTo: jest.fn() }), useLocalSearchParams: () => ({}) }))
jest.mock('../../ai', () => ({ ...jest.requireActual('../../ai'), generateMusic: (...args: unknown[]) => mockGenerate(...args) }))
jest.mock('../../voice', () => ({ resolveVoiceDirector: () => mockDirector }))
jest.mock('../../../modules/show-controller', () => ({ __esModule: true, default: { isAvailable: () => true } }))
jest.mock('../../../modules/show-visual', () => ({ __esModule: true, default: {
  getStatus: () => mockVisualStatus(), configure: jest.fn(), subscribe: () => ({ remove: jest.fn() }), testPattern: jest.fn(), endTestPattern: jest.fn().mockResolvedValue(undefined), blackout: jest.fn(),
} }))
const en = messages.en
const wrap = (content: React.ReactNode) => <I18nProvider>{content}</I18nProvider>

beforeEach(() => { jest.clearAllMocks(); mockDirector.subscribe.mockReturnValue({ remove: jest.fn() }) })

describe('AI progress status', () => {
  it('shows a locale-formatted floor percent and clears the live status when generation fails', async () => {
    let fail!: (error: Error) => void
    mockGenerate.mockImplementation(({ onProgress }: { onProgress: (value: unknown) => void }) => { onProgress({ stage: 'generating', completed: 1, total: 3 }); return new Promise((_resolve, reject) => { fail = reject }) })
    const screen = render(wrap(<MusicScreen />))
    fireEvent.changeText(screen.getByLabelText(en['music.description']), 'Warm instrumental entrance')
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: en['music.generate'] })) })
    await waitFor(() => expect(screen.getByText(en['progress.generating'])).toBeTruthy())
    expect(screen.getByText('33%')).toBeTruthy()
    await act(async () => { fail(new Error('ElevenLabs key missing')) })
    await waitFor(() => expect(screen.queryByText(en['progress.generating'])).toBeNull())
    expect(screen.queryByText('33%')).toBeNull()
  })
})

describe('download percent labels', () => {
  it('clamps and localizes native percentages, never rendering NaN or values over 100%', () => {
    expect(percentLabel('en', 62)).toBe('62%')
    expect(percentLabel('en', 140)).toBe('100%')
    expect(percentLabel('en', -5)).toBe('0%')
    expect(percentLabel('en', Number.NaN)).toBe('0%')
    expect(percentLabel('ar', 45)).toBe(new Intl.NumberFormat('ar', { style: 'percent', maximumFractionDigits: 0 }).format(0.45))
  })
})

describe('audience output status', () => {
  it('reports unavailable instead of loading forever when the first native status read fails', async () => {
    mockVisualStatus.mockRejectedValue(new Error('native visual module missing'))
    const screen = render(wrap(<AudienceDisplayPanel />))
    await waitFor(() => expect(screen.getByText(en['audience.errorHelp'])).toBeTruthy())
    expect(screen.getByText(en['state.unavailable'])).toBeTruthy()
    expect(screen.queryByText(en['common.loading'])).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: en['common.diagnostics'] }))
    expect(screen.queryByText(en['common.loading'])).toBeNull()
  })
})

describe('voice empty states', () => {
  it('explains an empty transcript and terminal instead of rendering blank cards or empty word buttons', async () => {
    mockDirector.getStatus.mockResolvedValue({ available: true, armed: false, modelReady: false, calibrated: false, detail: '', transcript: '' })
    const screen = render(wrap(<VoiceScreen />))
    await waitFor(() => expect(mockDirector.getStatus).toHaveBeenCalled())
    fireEvent.press(screen.getByRole('button', { name: en['voice.transcript'] }))
    await waitFor(() => expect(screen.getByText(en['voice.noTranscript'])).toBeTruthy())
    expect(screen.queryAllByRole('button', { name: '' })).toHaveLength(0)
    fireEvent.press(screen.getByRole('button', { name: en['voice.terminal'] }))
    expect(screen.getByText(en['voice.noTranscript'])).toBeTruthy()
  })
})

describe('controller diagnostics direction', () => {
  function Localized({ locale }: { locale: Locale }) {
    const { setLocale } = useI18n()
    return <><Button label="Test language" onPress={() => setLocale(locale)} /><ControllersScreen /></>
  }
  it.each([['en', '→'], ['he', '←'], ['ar', '←']] as const)('points from the physical input to its command in %s', (locale, arrow) => {
    const screen = render(wrap(<Localized locale={locale} />))
    fireEvent.press(screen.getByRole('button', { name: 'Test language' }))
    fireEvent.press(screen.getByRole('button', { name: messages[locale]['use.remote.buttons'] }))
    fireEvent.press(screen.getByRole('button', { name: messages[locale]['common.diagnostics'] }))
    // Mapping rows also show the key; the diagnostics line is the one joining input and command with an arrow.
    const lines = screen.getAllByText(/KEYCODE_PAGE_DOWN/).map((element) => String(element.props.children)).filter((value) => /[←→]/.test(value))
    expect(lines).toHaveLength(1)
    const text = lines[0]!
    expect(text).toContain(messages[locale]['command.GO'])
    expect(text).toContain(` ${arrow} `)
    expect(text).not.toContain(arrow === '→' ? '←' : '→')
  })
})
