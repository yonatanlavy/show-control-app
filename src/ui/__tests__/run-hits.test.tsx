import { fireEvent, render } from '@testing-library/react-native'
import { FlatList, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { compileRunSnapshot, sampleControllerProfiles, sampleShow } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import type { SessionPhase } from '../../runtime/show-session'
import { RunScreen } from '../screens'

const mockHitIds = Array.from({ length: 200 }, (_, index) => `qa-hit-${index}`)
const mockShow = {
  ...sampleShow,
  cues: { ...sampleShow.cues, ...Object.fromEntries(mockHitIds.map((id, index) => [id, { ...sampleShow.cues.reveal!, id, name: `QA Hit ${index}` }])) },
  sets: [{ ...sampleShow.sets[0]!, transportMode: 'oms' as const, hitCueIds: mockHitIds }],
}
const mockCompiled = compileRunSnapshot(mockShow, mockShow.sets[0]!.id, sampleControllerProfiles)
if (!mockCompiled.ok) throw new Error('The 200-Hit fixture must compile through the real immutable snapshot compiler')
const mockSnapshot = mockCompiled.snapshot
const mockRouter = { push: jest.fn() }
const mockApp = {
  show: mockShow, set: mockShow.sets[0], currentCueId: '', nextCueId: 'crossfade', cueIndex: 0,
  touchGuard: false, blackout: false, error: null as string | null,
  go: jest.fn(), panic: jest.fn(), stopAll: jest.fn(), pauseResume: jest.fn(), triggerHit: jest.fn(),
  setTouchGuard: jest.fn(), setBlackout: jest.fn(), disarmVoice: jest.fn(), runTask: jest.fn(),
  session: {
    phase: 'ready' as SessionPhase, snapshot: mockSnapshot, activeVoiceCount: 0, pendingCommandIds: [],
    selectedCueId: 'opening', currentCueId: '', nextCueId: 'crossfade', countdownRemainingMs: 0,
    currentCueIndex: 0, nextCueIndex: 1, nativeSessionPending: false, hasPendingActions: false,
    detail: '', progressCueId: '', progressPositionMs: null, progressDurationMs: null,
  },
}
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
const wrap = () => <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}><I18nProvider><RunScreen /></I18nProvider></SafeAreaInsetsContext.Provider>
const panicName = messages.en['run.fade'].replace('{seconds}', '2')
const goName = `${messages.en['run.go']} · House to stage`
const controlSize = (style: StyleProp<ViewStyle>) => {
  const value = StyleSheet.flatten(style)
  return { height: value.height, minHeight: value.minHeight, paddingVertical: value.paddingVertical }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockApp.touchGuard = false; mockApp.blackout = false; mockApp.error = null
  Object.assign(mockApp.session, { phase: 'ready', snapshot: mockSnapshot, activeVoiceCount: 0, selectedCueId: 'opening', currentCueId: '', nextCueId: 'crossfade', countdownRemainingMs: 0 })
})

it('does not eagerly mount a 200-Hit bank while opening the live overlay', () => {
  const screen = render(wrap())
  expect(screen.queryByRole('button', { name: 'QA Hit 0' })).toBeNull()
  fireEvent.press(screen.getByRole('button', { name: messages.en['run.hits'] }))
  const mounted = screen.getAllByRole('button', { name: /^QA Hit \d+$/ })
  expect(mounted.length).toBeGreaterThan(0)
  expect(mounted.length).toBeLessThan(20)
  expect(screen.queryByRole('button', { name: 'QA Hit 199' })).toBeNull()
  expect(mockApp.go).not.toHaveBeenCalled()
  expect(mockApp.triggerHit).not.toHaveBeenCalled()
  expect(mockApp.session.selectedCueId).toBe('opening')
  expect(Object.isFrozen(mockSnapshot.hitCueIds)).toBe(true)
})

it('keeps all Hits in the native list without fixed row heights that clip enlarged labels', () => {
  const screen = render(wrap())
  fireEvent.press(screen.getByRole('button', { name: messages.en['run.hits'] }))
  const list = screen.UNSAFE_getByType(FlatList)
  expect(list.props.data).toBe(mockSnapshot.hitCueIds)
  expect(list.props.data).toHaveLength(200)
  expect(list.props.data.at(-1)).toBe('qa-hit-199')
  expect(list.props.getItemLayout).toBeUndefined()
  expect(list.props.removeClippedSubviews).toBe(false)
  expect(StyleSheet.flatten(list.props.style)).toMatchObject({ flex: 1, minHeight: 0 })
})

it('preserves complete mixed-language Hit labels and distinct commands for cues beyond the first window', () => {
  const id = 'qa-hit-199'
  const name = 'Reveal for the entire audience · חשיפה לקהל כולו · إشارة النهاية'
  mockApp.session.snapshot = {
    ...mockSnapshot,
    hitCueIds: [id, ...mockSnapshot.hitCueIds.filter((cueId) => cueId !== id)],
    cues: { ...mockSnapshot.cues, [id]: { ...mockSnapshot.cues[id]!, name } },
  }
  const screen = render(wrap())
  fireEvent.press(screen.getByRole('button', { name: messages.en['run.hits'] }))
  const hit = screen.getByRole('button', { name })
  expect(screen.getByText(name).props.numberOfLines).toBeUndefined()
  expect(StyleSheet.flatten(hit.props.style).minHeight).toBeGreaterThanOrEqual(48)
  fireEvent.press(hit)
  expect(mockApp.triggerHit).toHaveBeenCalledWith(id)
  expect(mockApp.go).not.toHaveBeenCalled()
  expect(mockApp.session.selectedCueId).toBe('opening')
  expect(screen.UNSAFE_getByType(FlatList).props.data).toHaveLength(200)
})

it('forwards independent Hit intent at capacity and preserves the main pointer and safety controls', () => {
  mockApp.session.activeVoiceCount = 8
  const screen = render(wrap())
  const goBefore = controlSize(screen.getByRole('button', { name: goName }).props.style)
  const panicBefore = controlSize(screen.getByRole('button', { name: panicName }).props.style)
  fireEvent.press(screen.getByRole('button', { name: messages.en['run.hits'] }))
  const hit = screen.getByRole('button', { name: 'QA Hit 0' })
  expect(hit).toBeEnabled()
  fireEvent.press(hit)
  expect(mockApp.triggerHit).toHaveBeenCalledTimes(1)
  expect(mockApp.triggerHit).toHaveBeenCalledWith('qa-hit-0')
  expect(mockApp.session.selectedCueId).toBe('opening')
  expect(mockApp.session.currentCueId).toBe('')
  expect(mockApp.session.nextCueIndex).toBe(1)
  expect(mockApp.go).not.toHaveBeenCalled()
  expect(mockApp.stopAll).not.toHaveBeenCalled()
  expect(controlSize(screen.getByRole('button', { name: goName }).props.style)).toEqual(goBefore)
  expect(controlSize(screen.getByRole('button', { name: panicName }).props.style)).toEqual(panicBefore)
  expect(screen.getByRole('button', { name: panicName })).toBeEnabled()
  fireEvent.press(screen.getByRole('button', { name: messages.en['common.cancel'] }))
  expect(screen.queryByRole('button', { name: 'QA Hit 0' })).toBeNull()
  expect(controlSize(screen.getByRole('button', { name: goName }).props.style)).toEqual(goBefore)
})

it.each(['paused', 'interrupted', 'fault', 'unavailable'] as const)('updates mounted Hit admission when native state becomes %s', (phase) => {
  const screen = render(wrap())
  fireEvent.press(screen.getByRole('button', { name: messages.en['run.hits'] }))
  expect(screen.getByRole('button', { name: 'QA Hit 0' })).toBeEnabled()
  mockApp.session.phase = phase; screen.rerender(wrap())
  const hit = screen.getByRole('button', { name: 'QA Hit 0' })
  expect(hit).toBeDisabled()
  if (phase === 'paused') expect(hit.props.accessibilityHint).toBe(messages.en['use.run.resume'])
  fireEvent.press(hit)
  expect(mockApp.triggerHit).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: panicName })).toBeEnabled()
  expect(screen.getByRole('button', { name: messages.en['common.cancel'] })).toBeEnabled()
})

it('respects Touch Guard in an already open bank and restores input only after deliberate unlock', () => {
  const screen = render(wrap())
  fireEvent.press(screen.getByRole('button', { name: messages.en['run.hits'] }))
  mockApp.touchGuard = true; screen.rerender(wrap())
  const guarded = screen.getByRole('button', { name: 'QA Hit 0' })
  expect(guarded).toBeDisabled(); fireEvent.press(guarded)
  expect(mockApp.triggerHit).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: panicName })).toBeEnabled()
  mockApp.touchGuard = false; screen.rerender(wrap())
  fireEvent.press(screen.getByRole('button', { name: 'QA Hit 0' }))
  expect(mockApp.triggerHit).toHaveBeenCalledWith('qa-hit-0')
})
