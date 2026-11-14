import { render } from '@testing-library/react-native'
import { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { compileRunSnapshot, sampleControllerProfiles, sampleShow } from '../../domain'
import { I18nProvider, messages, useI18n, type Locale } from '../../i18n'
import type { ShowSessionState } from '../../runtime/show-session'
import { AppShell, Progress, ValueSlider } from '../primitives'
import { RunScreen } from '../screens'

const compiled = compileRunSnapshot(sampleShow, sampleShow.sets[0]!.id, sampleControllerProfiles)
if (!compiled.ok) throw new Error('The native progress fixture must compile')
const mockApp = {
  show: sampleShow, set: sampleShow.sets[0], currentCueId: 'opening', nextCueId: 'bed', cueIndex: 0,
  session: {
    phase: 'running', snapshot: { ...compiled.snapshot, transportMode: 'oms' }, sessionPurpose: 'performance', engineAvailable: true,
    activeVoiceCount: 1, mainSequenceVoiceCount: 1, hasPendingActions: false, nativeGeneration: 1, playbackRate: 1,
    pendingCommandIds: [], selectedCueId: 'opening', currentCueId: 'opening', nextCueId: 'bed', countdownRemainingMs: 0,
    currentCueIndex: 0, nextCueIndex: 1, nativeSessionPending: false, detail: '', lastEvent: null,
    progressCueId: 'opening', progressPositionMs: 5000, progressDurationMs: 20000,
  } as ShowSessionState,
  error: null, touchGuard: false, blackout: false, voiceStatus: null,
  setTouchGuard: jest.fn(), setBlackout: jest.fn(), go: jest.fn(), panic: jest.fn(), stopAll: jest.fn(), pauseResume: jest.fn(),
  disarmVoice: jest.fn(), triggerHit: jest.fn(), runTask: jest.fn(),
}
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), dismissAll: jest.fn(), dismissTo: jest.fn() }) }))

function SelectLocale({ locale }: { locale: Locale }) {
  const { setLocale } = useI18n()
  useEffect(() => { setLocale(locale) }, [locale, setLocale])
  return null
}
function view(locale: Locale, child: React.ReactNode) {
  return <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}><I18nProvider><SelectLocale locale={locale} />{child}</I18nProvider></SafeAreaInsetsContext.Provider>
}
type RenderedNode = ReturnType<ReturnType<typeof render>['getByRole']>
function inheritedDirection(node: RenderedNode): string | undefined {
  let current: RenderedNode | null = node
  while (current) {
    const direction = StyleSheet.flatten(current.props.style)?.direction
    if (direction && direction !== 'inherit') return direction
    current = current.parent
  }
  return undefined
}
function geometry(node: RenderedNode) {
  const style = StyleSheet.flatten(node.props.style)
  return { height: style.height, minHeight: style.minHeight, paddingVertical: style.paddingVertical, paddingHorizontal: style.paddingHorizontal }
}

afterEach(() => { jest.restoreAllMocks() })

describe.each([
  { layout: 'portrait', width: 390, height: 844 },
  { layout: 'landscape', width: 844, height: 390 },
])('$layout source-time progress', ({ width, height }) => {
  it.each(['en', 'he', 'ar'] as const)('keeps Run progress physical-left-to-right in %s without moving safety controls', (locale) => {
    jest.spyOn(jest.requireActual<typeof import('react-native')>('react-native'), 'useWindowDimensions').mockReturnValue({ width, height, scale: 1, fontScale: 1.5 })
    const screen = render(view('en', <RunScreen />))
    const goGeometry = geometry(screen.getByRole('button', { name: `${messages.en['run.next']} · Tension bed` }))
    const panicGeometry = geometry(screen.getByRole('button', { name: messages.en['run.fade'].replace('{seconds}', '2') }))
    screen.rerender(view(locale, <RunScreen />))
    const bar = screen.getByRole('progressbar')
    expect(bar.props.accessibilityValue.now).toBe(25)
    expect(inheritedDirection(bar)).toBe('ltr')
    expect(geometry(screen.getByRole('button', { name: `${messages[locale]['run.next']} · Tension bed` }))).toEqual(goGeometry)
    expect(geometry(screen.getByRole('button', { name: messages[locale]['run.fade'].replace('{seconds}', '2') }))).toEqual(panicGeometry)
    expect(mockApp.go).not.toHaveBeenCalled(); expect(mockApp.panic).not.toHaveBeenCalled()
  })
})

it.each(['en', 'he', 'ar'] as const)('keeps ordinary task progress inherited from the actual %s shell', (locale) => {
  const screen = render(view(locale, <AppShell current="/"><Progress value={0.25} /></AppShell>))
  const bar = screen.getByRole('progressbar')
  expect(bar.props.accessibilityValue.now).toBe(25)
  expect(inheritedDirection(bar)).toBe(locale === 'en' ? 'ltr' : 'rtl')
})

it.each(['en', 'he', 'ar'] as const)('preserves the editor source-position slider direction and bounds in %s', (locale) => {
  const screen = render(view(locale, <AppShell current="/builder"><ValueSlider label="Source position" value={5} min={0} max={20} onChange={jest.fn()} /></AppShell>))
  expect(screen.getByRole('adjustable', { name: 'Source position' }).props.accessibilityValue).toEqual({ min: 0, max: 20, now: 5, text: '5' })
  expect(inheritedDirection(screen.getByRole('progressbar'))).toBe('ltr')
})
