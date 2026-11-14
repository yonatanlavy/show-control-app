import { render, waitFor } from '@testing-library/react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { compileRunSnapshot, sampleShow, type Show } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import { edgeEnglish, edgeTranslations } from '../../i18n/edge-messages'
import { DEFAULT_LIBRARY_SETTINGS } from '../../library/types'
import { PreflightScreen } from '../screens'
import { VoiceScreen } from '../service-screens'

const mockDirector = {
  getStatus: jest.fn(),
  subscribe: jest.fn().mockReturnValue({ remove: jest.fn() }), calibrate: jest.fn(),
}
const mockApp = {
  show: sampleShow as Show, set: sampleShow.sets[0]!, library: {}, busy: false, liveSession: false,
  libraryState: { status: 'ready', settings: DEFAULT_LIBRARY_SETTINGS, controllerProfiles: [], shows: [sampleShow] },
  checks: {} as Record<string, boolean>, toggleCheck: jest.fn(), armShow: jest.fn(),
  session: { phase: 'idle', engineAvailable: true, detail: '', pendingCommandIds: [] },
  runTask: async (work: () => Promise<unknown>) => { await work(); return true },
}
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('../../voice', () => ({ resolveVoiceDirector: () => mockDirector }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), dismissAll: jest.fn(), canGoBack: () => false }), useLocalSearchParams: () => ({}) }))
jest.mock('../BackgroundReliabilityPanel', () => ({ BackgroundReliabilityPanel: () => null }))
let mockNeedsTouch = false
jest.mock('../ControllerPreparationFallback', () => ({ ControllerPreparationFallback: () => null, needsControllerPreparationFallback: () => mockNeedsTouch }))
jest.mock('../ShowIdentityContext', () => ({ ShowIdentityContext: () => null, useShowIdentities: () => new Map() }))
const wrap = (node: React.ReactNode) => <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}><I18nProvider>{node}</I18nProvider></SafeAreaInsetsContext.Provider>

beforeEach(() => { mockApp.show = sampleShow; mockApp.set = sampleShow.sets[0]!; mockNeedsTouch = false; jest.clearAllMocks() })

describe('edge catalogue', () => {
  it('keeps every placeholder in all ten languages', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    for (const [key, english] of Object.entries(edgeEnglish)) {
      for (const dictionary of Object.values(edgeTranslations)) {
        const translated = dictionary[key as keyof typeof edgeEnglish]
        expect(translated.trim().length).toBeGreaterThan(0)
        expect(placeholders(translated)).toEqual(placeholders(english))
      }
    }
  })
})

describe('preflight automatic check', () => {
  it('reports a passing compilation as an observation beside the manual confirmations', () => {
    // The sample references a controller profile this harness does not provide; drop it for a clean pass.
    const portable: Show = { ...sampleShow }; delete (portable as { controllerProfileId?: string }).controllerProfileId
    expect(compileRunSnapshot(portable, portable.sets[0]!.id, []).ok).toBe(true)
    mockApp.show = portable
    const screen = render(wrap(<PreflightScreen />))
    expect(screen.getByText(messages.en['edge.preflight.autoPass'])).toBeTruthy()
    // The order confirmation is honest about being manual.
    expect(screen.getByRole('checkbox', { name: messages.en['preflight.order'] })).toBeTruthy()
    expect(messages.en['preflight.order'].startsWith('Manual:')).toBe(true)
  })
  it('counts the problems Arm will refuse and keeps their details under Diagnostics', () => {
    const opening = sampleShow.cues.opening!
    if (opening.type !== 'audio') throw new Error('fixture')
    const broken: Show = { ...sampleShow, cues: { ...sampleShow.cues, opening: { ...opening, mediaAssetId: 'missing-media' } } }
    const compiled = compileRunSnapshot(broken, broken.sets[0]!.id, [])
    if (compiled.ok) throw new Error('fixture should fail')
    mockApp.show = broken; mockApp.set = broken.sets[0]!
    const screen = render(wrap(<PreflightScreen />))
    expect(screen.getByText(messages.en['edge.preflight.autoFail'].replace('{count}', String(compiled.issues.length)))).toBeTruthy()
    expect(screen.getByRole('button', { name: messages.en['common.diagnostics'] })).toBeTruthy()
  })
  it('checks what touch preparation will compile when the saved remote needs the touch fallback', () => {
    // The sample's saved controller profile is absent: a normal Arm compile reports CONTROLLER_MISSING,
    // but touch preparation drops the saved profile, so the observation must not claim a refusal.
    expect(compileRunSnapshot(sampleShow, sampleShow.sets[0]!.id, []).ok).toBe(false)
    mockNeedsTouch = true
    const screen = render(wrap(<PreflightScreen />))
    expect(screen.getByText(messages.en['edge.preflight.autoPass'])).toBeTruthy()
  })
  it('explains an empty playlist instead of prompting an import', () => {
    mockApp.set = { ...sampleShow.sets[0]!, cueOrder: [] }
    const screen = render(wrap(<PreflightScreen />))
    expect(screen.getByText(messages.en['edge.playlistEmpty'])).toBeTruthy()
    expect(screen.queryByText(messages.en['edge.preflight.autoPass'])).toBeNull()
  })
})

describe('voice arm reasons', () => {
  const status = (extra: object) => mockDirector.getStatus.mockResolvedValue({ available: true, armed: false, modelReady: true, calibrated: true, detail: '', ...extra })
  it.each([
    [{ modelReady: false }, 'edge.voice.needModel'],
    [{ calibrated: false }, 'edge.voice.needCalibration'],
  ] as const)('names the missing setup step %o', async (extra, key) => {
    status(extra)
    const screen = render(wrap(<VoiceScreen />))
    await waitFor(() => expect(screen.getByText(messages.en[key])).toBeTruthy())
    expect(screen.getByRole('button', { name: messages.en['voice.arm'] })).toBeDisabled()
  })
  it('explains that rules listen only in their own language and badges each rule', async () => {
    status({})
    mockApp.show = { ...sampleShow, voiceRules: [{ id: 'he-rule', phrases: ['מוזיקה'], locale: 'he', enabled: true, action: { type: 'GO' }, delayMs: 0 }] }
    const screen = render(wrap(<VoiceScreen />))
    await waitFor(() => expect(screen.getByText(messages.en['edge.voice.needRule'].replace('{language}', 'English'))).toBeTruthy())
    expect(screen.getByText('עברית')).toBeTruthy()
    expect(screen.getByRole('button', { name: messages.en['edge.editRule'] })).toBeTruthy()
  })
})
