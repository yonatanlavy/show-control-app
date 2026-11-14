import { act, fireEvent, render } from '@testing-library/react-native'
import { size } from '../../design'
import { I18nProvider, messages } from '../../i18n'
import { AppShell, AppText, Button, NavBar, Progress } from '../primitives'
import { FeedbackContext } from '../feedback'
import { StackRouter } from 'expo-router/build/react-navigation/routers/StackRouter'

const mockNavigationPush = jest.fn()
const mockPrimaryNavigation = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockNavigationPush, dismissTo: mockPrimaryNavigation }) }))

beforeEach(() => { mockNavigationPush.mockReset(); mockPrimaryNavigation.mockReset() })

describe('performer UI system', () => {
  it('returns from a music subpage through its highlighted primary navigation item', () => {
    const screen = render(<I18nProvider><NavBar current="/builder" navigationRoute="/find-music" /></I18nProvider>)
    fireEvent.press(screen.getByRole('button', { name: messages.en['nav.builder'] }))
    expect(mockPrimaryNavigation).toHaveBeenCalledWith('/builder')
    expect(mockNavigationPush).not.toHaveBeenCalled()
    mockPrimaryNavigation.mockClear()
    screen.rerender(<I18nProvider><NavBar current="/builder" /></I18nProvider>)
    fireEvent.press(screen.getByRole('button', { name: messages.en['nav.builder'] }))
    expect(mockPrimaryNavigation).not.toHaveBeenCalled()
  })
  it('keeps primary history bounded through 250 switches and 20 rapid presses using the installed stack router', () => {
    const stack = StackRouter({ initialRouteName: 'index' })
    const options = { routeNames: ['index', 'builder', 'rehearsal', 'preflight', 'more'], routeParamList: {}, routeGetIdList: {} }
    let state = stack.getInitialState(options)
    mockPrimaryNavigation.mockImplementation((href: string) => {
      const next = stack.getStateForAction(state, { type: 'POP_TO', payload: { name: href === '/' ? 'index' : href.slice(1) } }, options)
      if (!next) throw new Error('Primary route was not handled')
      state = stack.getRehydratedState(next, options)
    })
    let current = '/'
    const screen = render(<I18nProvider><NavBar current={current} /></I18nProvider>)
    const tabs = [['nav.builder', '/builder'], ['nav.rehearsal', '/rehearsal'], ['nav.run', '/preflight'], ['nav.more', '/more'], ['nav.library', '/']] as const
    for (let cycle = 0; cycle < 50; cycle++) for (const [key, route] of tabs) {
      screen.rerender(<I18nProvider><NavBar current={current} /></I18nProvider>)
      fireEvent.press(screen.getByRole('button', { name: messages.en[key] }))
      current = route
      expect(state.routes).toHaveLength(1)
    }
    screen.rerender(<I18nProvider><NavBar current="/" /></I18nProvider>)
    let moreKey: string | undefined
    for (let press = 0; press < 20; press++) {
      fireEvent.press(screen.getByRole('button', { name: messages.en['nav.more'] }))
      moreKey ??= state.routes[0]!.key
      expect(state.routes).toHaveLength(1)
      expect(state.routes[0]!.key).toBe(moreKey)
    }
    expect(mockPrimaryNavigation).toHaveBeenCalledTimes(270)
    expect(mockNavigationPush).not.toHaveBeenCalled()
    expect(stack.getStateForAction(state, { type: 'GO_BACK' }, options)).toBeNull()
  })
  it('returns to an existing Builder from a child page without replacing its identity or accumulating another route', () => {
    const stack = StackRouter({ initialRouteName: 'index' })
    const options = { routeNames: ['index', 'builder', 'find-music'], routeParamList: {}, routeGetIdList: {} }
    let state = stack.getInitialState(options)
    state = stack.getRehydratedState(stack.getStateForAction(state, { type: 'PUSH', payload: { name: 'builder' } }, options)!, options)
    const builderKey = state.routes[1]!.key
    state = stack.getRehydratedState(stack.getStateForAction(state, { type: 'PUSH', payload: { name: 'find-music' } }, options)!, options)
    mockPrimaryNavigation.mockImplementation((href: string) => { state = stack.getRehydratedState(stack.getStateForAction(state, { type: 'POP_TO', payload: { name: href.slice(1) } }, options)!, options) })
    const screen = render(<I18nProvider><NavBar current="/builder" navigationRoute="/find-music" /></I18nProvider>)
    fireEvent.press(screen.getByRole('button', { name: messages.en['nav.builder'] }))
    expect(state.routes.map((route) => route.name)).toEqual(['index', 'builder'])
    expect(state.routes[1]!.key).toBe(builderKey)
  })
  it('keeps English and Hebrew dictionaries in parity', () => expect(Object.keys(messages.he).sort()).toEqual(Object.keys(messages.en).sort()))
  it('reserves stage-safe targets', () => { expect(size.control).toBeGreaterThanOrEqual(48); expect(size.go).toBeGreaterThanOrEqual(96) })
  it('exposes loading state accessibly', () => { const screen = render(<I18nProvider><Button label="Save" state="loading" /></I18nProvider>); expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState.busy).toBe(true) })
  it('replaces an unknown spoken progress value and clears it again when measurement is lost', () => {
    const screen = render(<I18nProvider><Progress value={null} accessibilityText="Not measured" /></I18nProvider>)
    screen.rerender(<I18nProvider><Progress value={0.4} accessibilityText="Not measured" /></I18nProvider>)
    expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 40, text: '40%' })
    screen.rerender(<I18nProvider><Progress value={Number.NaN} accessibilityText="Not measured" /></I18nProvider>)
    expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({ text: 'Not measured' })
  })
  it('uses the explicit accessible action for a held control and refuses it while disabled', () => {
    const activate = jest.fn(); const hold = jest.fn()
    const screen = render(<I18nProvider><Button label="Guard" onLongPress={hold} onAccessibilityActivate={activate} /></I18nProvider>)
    fireEvent(screen.getByRole('button'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } })
    expect(activate).toHaveBeenCalledTimes(1); expect(hold).not.toHaveBeenCalled()
    screen.rerender(<I18nProvider><Button label="Guard" disabled onLongPress={hold} onAccessibilityActivate={activate} /></I18nProvider>)
    fireEvent(screen.getByRole('button'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } })
    expect(activate).toHaveBeenCalledTimes(1)
  })
  it('surfaces a task failure outside the scrolling page, keeps it until dismissal and prioritizes it over success', () => {
    jest.useFakeTimers()
    try {
      const retry = jest.fn(); const clear = jest.fn(); const dismissSuccess = jest.fn()
      const screen = render(<I18nProvider><FeedbackContext.Provider value={{ feedback: { id: 1, message: 'common.complete' }, dismiss: dismissSuccess, undo: jest.fn(), failure: { detail: 'Invalid ZIP archive', busy: false, retry, dismiss: clear } }}><AppShell current="/"><AppText>Long scrolled page</AppText></AppShell></FeedbackContext.Provider></I18nProvider>)
      expect(screen.queryByText(`✓ ${messages.en['common.complete']}`)).toBeNull()
      expect(screen.getByText(messages.en['error.backupInvalid'])).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] })); expect(retry).toHaveBeenCalledTimes(1)
      act(() => jest.advanceTimersByTime(11000)); expect(screen.getByText(messages.en['error.backupInvalid'])).toBeTruthy(); expect(dismissSuccess).not.toHaveBeenCalled()
      fireEvent.press(screen.getByRole('button', { name: messages.en['common.diagnostics'] })); expect(screen.getByText('Invalid ZIP archive')).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: messages.en['common.dismiss'] })); expect(clear).toHaveBeenCalledTimes(1)
    } finally { jest.useRealTimers() }
  })
})
