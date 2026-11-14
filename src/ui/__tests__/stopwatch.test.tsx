import { act, fireEvent, render } from '@testing-library/react-native'
import { useEffect } from 'react'
import { I18nProvider, messages } from '../../i18n'
import { FloatingStopwatch } from '../FloatingStopwatch'
import { createSessionStopwatch, SessionStopwatchProvider } from '../SessionStopwatch'

describe('floating stopwatch visibility', () => {
  afterEach(() => jest.useRealTimers())
  it('resets a new session clock without remounting routes and rebinds timer controls', () => {
    jest.useFakeTimers(); const mounted = jest.fn(); const unmounted = jest.fn()
    function Route() { useEffect(() => { mounted(); return unmounted }, []); return <FloatingStopwatch onHide={() => undefined} /> }
    const content = (sessionId: string) => <I18nProvider><SessionStopwatchProvider sessionId={sessionId}><Route /></SessionStopwatchProvider></I18nProvider>
    const screen = render(content('first'))
    fireEvent.press(screen.getByRole('button', { name: messages.en['timer.start'] })); act(() => jest.advanceTimersByTime(2200))
    expect(screen.getByRole('adjustable').props.accessibilityValue.text).toBe('00:02')
    screen.rerender(content('second'))
    expect(screen.getByRole('adjustable').props.accessibilityValue.text).toBe('00:00')
    expect(mounted).toHaveBeenCalledTimes(1); expect(unmounted).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['timer.start'] })); act(() => jest.advanceTimersByTime(1100))
    expect(screen.getByRole('adjustable').props.accessibilityValue.text).toBe('00:01')
    screen.unmount(); expect(unmounted).toHaveBeenCalledTimes(1)
  })
  it('keeps elapsed time while hidden and only resets through the explicit reset action', () => {
    jest.useFakeTimers()
    const hide = jest.fn()
    const content = (visible: boolean) => <I18nProvider><FloatingStopwatch visible={visible} onHide={hide} /></I18nProvider>
    const screen = render(content(true))
    fireEvent.press(screen.getByRole('button', { name: messages.en['timer.start'] }))
    act(() => jest.advanceTimersByTime(1500))
    fireEvent.press(screen.getByRole('button', { name: messages.en['timer.hide'] }))
    expect(hide).toHaveBeenCalledTimes(1)
    screen.rerender(content(false)); act(() => jest.advanceTimersByTime(2500)); screen.rerender(content(true))
    expect(screen.getByRole('adjustable').props.accessibilityValue.text).toBe('00:04')
    fireEvent.press(screen.getByRole('button', { name: messages.en['timer.pause'] }))
    act(() => jest.advanceTimersByTime(2000))
    expect(screen.getByRole('adjustable').props.accessibilityValue.text).toBe('00:04')
    fireEvent.press(screen.getByRole('button', { name: messages.en['timer.reset'] }))
    expect(screen.getByRole('adjustable').props.accessibilityValue.text).toBe('00:00')
    screen.unmount()
  })
  it('continues through Recovery while the visible Run component unmounts, retaining position and manual pause', () => {
    jest.useFakeTimers(); const hide = jest.fn()
    const content = (run: boolean) => <I18nProvider><SessionStopwatchProvider>{run ? <FloatingStopwatch onHide={hide} /> : null}</SessionStopwatchProvider></I18nProvider>
    const screen = render(content(true)); fireEvent.press(screen.getByRole('button', { name: messages.en['timer.start'] }))
    act(() => jest.advanceTimersByTime(1500)); screen.rerender(content(false)); act(() => jest.advanceTimersByTime(3500)); screen.rerender(content(true))
    expect(screen.getByRole('adjustable').props.accessibilityValue.text).toBe('00:05')
    fireEvent.press(screen.getByRole('button', { name: messages.en['timer.pause'] })); screen.rerender(content(false)); act(() => jest.advanceTimersByTime(4000)); screen.rerender(content(true))
    expect(screen.getByRole('adjustable').props.accessibilityValue.text).toBe('00:05'); screen.unmount()
  })
  it('starts once on rapid presses, preserves hide state and resets only for a new session owner', () => {
    let now = 0; const clock = createSessionStopwatch(() => now)
    clock.start(); now = 1000; clock.start(); now = 2000; clock.pause(); expect(clock.getSnapshot().elapsedMs).toBe(2000)
    clock.setVisible(true); clock.setPosition({ x: 40, y: 80 }); clock.setVisible(false)
    expect(clock.getSnapshot()).toMatchObject({ visible: false, position: { x: 40, y: 80 } })
    const next = createSessionStopwatch(() => now); expect(next.getSnapshot()).toMatchObject({ visible: false, running: false, elapsedMs: 0 })
  })
})
