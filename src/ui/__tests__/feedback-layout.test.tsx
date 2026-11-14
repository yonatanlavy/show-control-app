import { act, fireEvent, render, within } from '@testing-library/react-native'
import { Keyboard, KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native'
import * as ReactNative from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { I18nProvider, messages } from '../../i18n'
import { setCriticalSessionActive } from '../../runtime'
import { FeedbackContext, type TaskFailure } from '../feedback'
import { AppShell, AppText, Button } from '../primitives'

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), dismissTo: jest.fn() }) }))
const dismiss = jest.fn(), undo = jest.fn(), retry = jest.fn(), clear = jest.fn()
let dimensions: jest.SpyInstance<ReturnType<typeof ReactNative.useWindowDimensions>, []>
const failure: TaskFailure = { detail: 'Invalid ZIP archive', busy: false, retry, dismiss: clear }
function view(error: TaskFailure | null = null, hidden = false) {
  return <SafeAreaInsetsContext.Provider value={{ top: 24, bottom: 24, left: 20, right: 20 }}><I18nProvider><FeedbackContext.Provider value={{ feedback: { id: 1, message: 'common.saved', undo: async () => undefined }, dismiss, undo, failure: error }}><AppShell current="/preflight" hideNavigation={hidden} footer={<AppText>Fixed footer</AppText>} actionBar={<Button label="Arm test show" onPress={jest.fn()} />}><AppText>Scrollable page</AppText></AppShell></FeedbackContext.Provider></I18nProvider></SafeAreaInsetsContext.Provider>
}
const measure = (screen: ReturnType<typeof render>, height: number) => fireEvent(screen.getByTestId('app-bottom-section'), 'layout', { nativeEvent: { layout: { height } } })
const style = (screen: ReturnType<typeof render>) => StyleSheet.flatten(screen.getByTestId('app-feedback-notice').props.style)
beforeEach(() => {
  jest.clearAllMocks(); setCriticalSessionActive(false)
  dimensions = jest.spyOn(jest.requireActual<typeof ReactNative>('react-native'), 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 1, fontScale: 1 })
})
afterEach(() => { dimensions.mockRestore(); setCriticalSessionActive(false); jest.useRealTimers() })

describe('feedback reserves fixed actions', () => {
  it('moves preparation content and the entire action section together above the keyboard', () => {
    const screen = render(view());
    const surface = screen.UNSAFE_getByType(KeyboardAvoidingView);
    expect(surface.props).toMatchObject({ enabled: true, keyboardVerticalOffset: 24 });
    expect(within(surface).getByText('Scrollable page')).toBeTruthy();
    expect(within(surface).getByText('Fixed footer')).toBeTruthy();
    expect(within(surface).getByRole('button', { name: 'Arm test show' })).toBeEnabled();
  })
  it('bounds feedback by the actual keyboard-adjusted work area and preserves its action bar', async () => {
    const screen = render(view(failure)); measure(screen, 180);
    await act(async () => fireEvent(screen.getByTestId('app-keyboard-surface'), 'layout', { persist: jest.fn(), nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 400 } } }));
    expect(style(screen).maxHeight).toBe(400 / 3);
    await act(async () => fireEvent(screen.getByTestId('app-keyboard-surface'), 'layout', { persist: jest.fn(), nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 190 } } }));
    expect(screen.queryByTestId('app-feedback-notice')).toBeNull();
    expect(screen.getByRole('button', { name: 'Arm test show' })).toBeEnabled();
  })
  it('hides ordinary navigation while typing, restores it afterward, and keeps preparation actions', async () => {
    const listeners = jest.spyOn(Keyboard, 'addListener');
    try {
      const screen = render(view());
      const event = { duration: 0, easing: 'keyboard', endCoordinates: { screenX: 0, screenY: 544, width: 390, height: 300 } } as ReactNative.KeyboardEvent;
      await act(async () => listeners.mock.calls.filter(([name]) => name === 'keyboardDidShow').forEach(([, handler]) => handler(event)));
      expect(screen.queryByRole('button', { name: messages.en['nav.library'] })).toBeNull();
      expect(screen.getByRole('button', { name: 'Arm test show' })).toBeEnabled();
      await act(async () => listeners.mock.calls.filter(([name]) => name === 'keyboardDidHide').forEach(([, handler]) => handler(event)));
      expect(screen.getByRole('button', { name: messages.en['nav.library'] })).toBeTruthy();
    } finally { listeners.mockRestore() }
  })
  it('never shifts a critical-session footer for keyboard avoidance', () => {
    setCriticalSessionActive(true);
    const screen = render(view());
    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.enabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Arm test show' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: messages.en['nav.library'] })).toBeNull();
    expect(screen.queryByTestId('app-feedback-notice')).toBeNull();
  })
  it('offers one explicit library-reopen action for committed restore recovery without Dismiss', () => {
    const screen = render(view({ detail: 'RESTORE_COMMITTED_RELOAD_REQUIRED: Saved changes are durable', busy: false, retry })); measure(screen, 220)
    const notice = within(screen.getByTestId('app-feedback-notice'))
    expect(notice.getByText(messages.en['backup.reopenHelp'])).toBeTruthy()
    fireEvent.press(notice.getByRole('button', { name: messages.en['backup.reopenLibrary'] }))
    expect(retry).toHaveBeenCalledTimes(1); expect(notice.queryByRole('button', { name: messages.en['common.dismiss'] })).toBeNull()
    expect(within(screen.getByTestId('app-bottom-section')).getByRole('button', { name: 'Arm test show' })).toBeEnabled()
  })
  it('keeps feedback in layout above the entire footer/action/navigation section without absolute offsets', () => {
    const screen = render(view()); measure(screen, 220)
    const notice = screen.getByTestId('app-feedback-notice')
    expect(style(screen).position).not.toBe('absolute')
    expect(style(screen).flexShrink).toBe(0)
    expect(style(screen).bottom).toBeUndefined()
    expect(style(screen).start).toBeUndefined()
    expect(within(notice).queryByRole('button', { name: 'Arm test show' })).toBeNull()
    expect(within(screen.getByTestId('app-bottom-section')).getByRole('button', { name: 'Arm test show' })).toBeEnabled()
    expect(within(screen.getByTestId('app-bottom-section')).getByText('Fixed footer')).toBeTruthy()
    expect(style(screen).maxHeight).toBe((844 - 48) / 3)
  })
  it('bounds feedback to remaining space in a short large-text viewport', () => {
    dimensions.mockReturnValue({ width: 844, height: 360, scale: 1, fontScale: 2 })
    const screen = render(view(failure)); measure(screen, 220)
    expect(style(screen).maxHeight).toBe(76)
    const scroll = screen.getByTestId('app-feedback-notice').findByType(ScrollView)
    for (const key of ['common.retry', 'common.diagnostics', 'common.dismiss'] as const) expect(within(scroll).getByRole('button', { name: messages.en[key] })).toBeTruthy()
  })
  it('recomputes available space for a taller footer and after rotation', () => {
    const screen = render(view()); measure(screen, 700)
    expect(style(screen).maxHeight).toBe(80)
    dimensions.mockReturnValue({ width: 844, height: 390, scale: 1, fontScale: 1 })
    screen.rerender(view()); measure(screen, 180)
    expect(style(screen).maxHeight).toBe(114)
  })
  it('reserves an explicit footer even when primary navigation is hidden', () => {
    const screen = render(view(null, true)); measure(screen, 680)
    expect(screen.queryByRole('button', { name: messages.en['nav.library'] })).toBeNull()
    expect(style(screen).maxHeight).toBe(100)
    expect(within(screen.getByTestId('app-bottom-section')).getByRole('button', { name: 'Arm test show' })).toBeEnabled()
  })
  it('ignores invalid layout readings and never produces a negative feedback height', () => {
    const screen = render(view()); measure(screen, 700)
    for (const height of [NaN, Infinity, -1]) { measure(screen, height); expect(style(screen).maxHeight).toBe(80) }
    measure(screen, 900)
    expect(screen.queryByTestId('app-feedback-notice')).toBeNull()
    expect(screen.getByRole('button', { name: 'Arm test show' })).toBeEnabled()
  })
  it('keeps Restore inside the same bounded success scroll region', () => {
    const screen = render(view()); measure(screen, 220)
    const notice = screen.getByTestId('app-feedback-notice'), scroll = notice.findByType(ScrollView)
    expect(within(scroll).getByRole('button', { name: messages.en['library.restoreRevision'] })).toBeTruthy()
    fireEvent.press(within(notice).getByRole('button', { name: messages.en['library.restoreRevision'] }))
    expect(undo).toHaveBeenCalledTimes(1)
  })
  it('keeps long diagnostics and all recovery actions in one scroll region without expiring the failure', () => {
    jest.useFakeTimers()
    const detail = 'Invalid ZIP archive ' + 'synthetic diagnostic '.repeat(100)
    const screen = render(view({ ...failure, detail })); measure(screen, 220)
    expect(screen.queryByText(`✓ ${messages.en['common.saved']}`)).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.diagnostics'] }))
    const scroll = screen.getByTestId('app-feedback-notice').findByType(ScrollView)
    expect(scroll.findAllByProps({ children: detail }).length).toBeGreaterThan(0)
    act(() => jest.advanceTimersByTime(60000))
    expect(dismiss).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] })); expect(retry).toHaveBeenCalledTimes(1)
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.dismiss'] })); expect(clear).toHaveBeenCalledTimes(1)
  })
  it('pauses success expiry when no feedback space is available, and suppresses notices during critical sessions', () => {
    jest.useFakeTimers()
    const screen = render(view()); measure(screen, 900)
    act(() => jest.advanceTimersByTime(20000)); expect(dismiss).not.toHaveBeenCalled()
    measure(screen, 220)
    act(() => jest.advanceTimersByTime(9999)); expect(dismiss).not.toHaveBeenCalled()
    act(() => jest.advanceTimersByTime(1)); expect(dismiss).toHaveBeenCalledTimes(1)
    setCriticalSessionActive(true); screen.rerender(view(failure))
    expect(screen.queryByTestId('app-feedback-notice')).toBeNull()
    expect(screen.queryByRole('button', { name: messages.en['nav.library'] })).toBeNull()
    expect(screen.getByRole('button', { name: 'Arm test show' })).toBeEnabled()
  })
})
