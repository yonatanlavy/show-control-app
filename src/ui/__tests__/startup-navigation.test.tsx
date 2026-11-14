import { act, cleanupAsync, fireEvent, render } from '@testing-library/react-native'
import { useEffect, useState } from 'react'
import RootLayout from '../../../app/_layout'
import { font } from '../../design'
import { messages } from '../../i18n'
import { AppText, Button, Field } from '../primitives'
import { STARTUP_FONT_WAIT_MS } from '../TypographyGate'

let mockFontsReady = false; let mockNavigationReady = false; let mockLive = false
let mockFontError: Error | null = null
let mockPurpose = 'performance'
let mockPathname = '/'; let mockNativePending = false; let mockPhase = 'idle'; let mockSnapshot: object | null = null
let mockRouteCount = 1
const mockReplace = jest.fn(); const mockListeners = new Set<() => void>()
const mockRouteAction = jest.fn(); const mockRouteMount = jest.fn()
function MockDraftRoute() {
  const [name, setName] = useState('')
  useEffect(() => { mockRouteMount() }, [])
  return <><AppText>Route typography</AppText><AppText tone="time">0:00</AppText><Field label="Draft show" value={name} onChange={setName} /><Button label="Use Library" onPress={mockRouteAction} /></>
}
const mockRouteComponent = MockDraftRoute
const mockNavigation = { isReady: () => mockNavigationReady, addListener: (_type: string, notify: () => void) => { mockListeners.add(notify); return () => { mockListeners.delete(notify) } } }
jest.mock('expo-font', () => ({ useFonts: () => [mockFontsReady, mockFontError] }))
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-router', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native')
  const Stack = Object.assign(({ children, screenLayout: layout }: { children: React.ReactNode; screenLayout?: (props: React.PropsWithChildren) => React.ReactNode }) => {
    const Route = mockRouteComponent
    return <View testID="root-navigator">{Array.from({ length: mockRouteCount }, (_, index) => {
      const content = <><Route />{children}</>
      // Expo Router's useDescriptors invokes screenLayout directly for each route.
      return <View key={index}>{layout ? layout({ children: content }) : content}</View>
    })}</View>
  }, { Screen: () => null })
  return { Stack, usePathname: () => mockPathname, useRouter: () => ({ replace: mockReplace }), useNavigationContainerRef: () => mockNavigation }
})
jest.mock('../../ui', () => ({ AppProvider: ({ children }: { children: React.ReactNode }) => children, useApp: () => ({ liveSession: mockLive, session: { sessionPurpose: mockPurpose, nativeSessionPending: mockNativePending, phase: mockPhase, snapshot: mockSnapshot }, libraryState: { status: 'ready', settings: { onboardingCompleted: true } } }) }))
jest.mock('../AppProvider', () => ({ useApp: () => ({ liveSession: mockLive }) }))

describe('startup navigation and font readiness', () => {
  beforeEach(() => { jest.useFakeTimers(); mockFontsReady = false; mockFontError = null; mockNavigationReady = false; mockLive = false; mockPurpose = 'performance'; mockPathname = '/'; mockNativePending = false; mockPhase = 'idle'; mockSnapshot = null; mockRouteCount = 1; mockReplace.mockClear(); mockRouteAction.mockClear(); mockRouteMount.mockClear(); mockListeners.clear() })
  afterEach(async () => { await cleanupAsync(); jest.useRealTimers() })
  it('mounts the navigator while fonts load and reveals the interface only after both are ready', () => {
    const screen = render(<RootLayout />)
    expect(screen.getByTestId('root-navigator')).toBeTruthy(); expect(screen.getByRole('progressbar', { name: messages.en['common.loading'] })).toBeTruthy()
    expect(screen.queryByText('Route typography')).toBeNull()
    mockFontsReady = true; screen.rerender(<RootLayout />)
    expect(screen.queryByText('Route typography')).toBeNull()
    expect(screen.getByRole('progressbar')).toBeTruthy()
    act(() => { mockNavigationReady = true; mockListeners.forEach((notify) => notify()) })
    expect(screen.getByText('Route typography')).toBeTruthy(); expect(screen.queryByRole('progressbar')).toBeNull()
  })
  it('uses fallback fonts after a loading error without blocking navigation', () => {
    mockFontError = new Error('Font unavailable'); mockNavigationReady = true
    const screen = render(<RootLayout />)
    expect(screen.getByText('Route typography')).toBeTruthy(); expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByLabelText('Draft show')).toHaveStyle({ fontFamily: font.family.bodyFallback })
  })
  it('reveals usable idle tools with explicit system fonts when bundled loading never settles', () => {
    mockNavigationReady = true
    const screen = render(<RootLayout />)
    act(() => jest.advanceTimersByTime(STARTUP_FONT_WAIT_MS - 1))
    expect(screen.queryByRole('button', { name: 'Use Library' })).toBeNull()
    act(() => jest.advanceTimersByTime(1))
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByText('Route typography')).toHaveStyle({ fontFamily: font.family.bodyFallback })
    expect(screen.getByText('0:00')).toHaveStyle({ fontFamily: font.family.monoFallback })
    fireEvent.changeText(screen.getByLabelText('Draft show'), 'My retained draft')
    fireEvent.press(screen.getByRole('button', { name: 'Use Library' }))
    expect(mockRouteAction).toHaveBeenCalledTimes(1); expect(screen.getByLabelText('Draft show').props.value).toBe('My retained draft')
  })
  it('retains the navigation readiness gate when the font wait expires', () => {
    const screen = render(<RootLayout />)
    act(() => jest.advanceTimersByTime(STARTUP_FONT_WAIT_MS))
    expect(screen.getByTestId('root-navigator')).toBeTruthy()
    expect(screen.queryByText('Route typography')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Use Library' })).toBeNull()
    expect(screen.queryByLabelText('Draft show')).toBeNull(); expect(screen.getByRole('progressbar')).toBeTruthy()
    act(() => { mockNavigationReady = true; mockListeners.forEach((notify) => notify()) })
    expect(screen.queryByRole('progressbar')).toBeNull(); expect(screen.getByText('Route typography')).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Use Library' })); expect(mockRouteAction).toHaveBeenCalledTimes(1)
  })
  it('updates actual font styles after late idle completion without replacing the draft route', () => {
    mockNavigationReady = true; const screen = render(<RootLayout />)
    act(() => jest.advanceTimersByTime(STARTUP_FONT_WAIT_MS))
    fireEvent.changeText(screen.getByLabelText('Draft show'), 'Keep this edit')
    mockFontsReady = true; screen.rerender(<RootLayout />)
    expect(screen.getByText('Route typography')).toHaveStyle({ fontFamily: font.family.bodyLatin })
    expect(screen.getByText('0:00')).toHaveStyle({ fontFamily: font.family.mono })
    expect(screen.getByLabelText('Draft show')).toHaveStyle({ fontFamily: font.family.bodyLatin })
    expect(screen.getByLabelText('Draft show').props.value).toBe('Keep this edit'); expect(mockRouteMount).toHaveBeenCalledTimes(1)
  })
  it('preserves route hook order and the existing draft when routes are pushed and popped', () => {
    mockFontsReady = true; mockNavigationReady = true
    const screen = render(<RootLayout />)
    fireEvent.changeText(screen.getByLabelText('Draft show'), 'Existing playlist draft')
    mockRouteCount = 2; screen.rerender(<RootLayout />)
    expect(screen.getAllByLabelText('Draft show')).toHaveLength(2)
    expect(screen.getAllByLabelText('Draft show')[0]!.props.value).toBe('Existing playlist draft')
    expect(mockRouteMount).toHaveBeenCalledTimes(2)
    mockRouteCount = 1; screen.rerender(<RootLayout />)
    expect(screen.getByLabelText('Draft show').props.value).toBe('Existing playlist draft')
    fireEvent.press(screen.getByRole('button', { name: 'Use Library' }))
    expect(mockRouteAction).toHaveBeenCalledTimes(1); expect(mockRouteMount).toHaveBeenCalledTimes(2)
  })
  it('keeps immediate critical controls on their entry font policy until returning idle', () => {
    mockLive = true; mockNativePending = true; mockPhase = 'preparing'; mockNavigationReady = true; mockPathname = '/recovery'
    const screen = render(<RootLayout />)
    expect(screen.queryByRole('progressbar')).toBeNull(); expect(screen.getByText('Route typography')).toHaveStyle({ fontFamily: font.family.bodyFallback })
    fireEvent.changeText(screen.getByLabelText('Draft show'), 'Preserve owner UI')
    mockFontsReady = true; mockNativePending = false; mockSnapshot = {}; mockPhase = 'running'; mockPathname = '/run'; screen.rerender(<RootLayout />)
    act(() => jest.advanceTimersByTime(STARTUP_FONT_WAIT_MS))
    expect(screen.getByText('Route typography')).toHaveStyle({ fontFamily: font.family.bodyFallback })
    expect(screen.getByLabelText('Draft show')).toHaveStyle({ fontFamily: font.family.bodyFallback })
    mockLive = false; mockSnapshot = null; mockPhase = 'idle'; mockPathname = '/'; screen.rerender(<RootLayout />)
    expect(screen.getByText('Route typography')).toHaveStyle({ fontFamily: font.family.bodyLatin })
    expect(screen.getByLabelText('Draft show').props.value).toBe('Preserve owner UI'); expect(mockRouteMount).toHaveBeenCalledTimes(1)
  })
  it('cancels pending fallback work on early registration and unmount', async () => {
    const timers = jest.spyOn(globalThis, 'setTimeout'); const clear = jest.spyOn(globalThis, 'clearTimeout')
    const pendingFontTimer = () => {
      let index = -1; timers.mock.calls.forEach((call, current) => { if (call[1] === STARTUP_FONT_WAIT_MS) index = current })
      expect(index).toBeGreaterThanOrEqual(0)
      return timers.mock.results[index]!.value as ReturnType<typeof setTimeout>
    }
    try {
      const screen = render(<RootLayout />); const first = pendingFontTimer()
      mockFontsReady = true; screen.rerender(<RootLayout />)
      expect(clear).toHaveBeenCalledWith(first)
      await screen.unmountAsync(); mockFontsReady = false
      const replacement = render(<RootLayout />); const second = pendingFontTimer()
      await replacement.unmountAsync(); expect(clear).toHaveBeenCalledWith(second)
      act(() => { jest.advanceTimersByTime(STARTUP_FONT_WAIT_MS) })
      expect(mockRouteAction).not.toHaveBeenCalled()
    } finally { timers.mockRestore(); clear.mockRestore() }
  })
  it('waits for navigation readiness before a live redirect and never covers live safety controls', () => {
    mockLive = true; const screen = render(<RootLayout />)
    expect(mockReplace).not.toHaveBeenCalled(); expect(screen.queryByRole('progressbar')).toBeNull()
    act(() => { mockNavigationReady = true; mockListeners.forEach((notify) => notify()) })
    expect(mockReplace).toHaveBeenCalledWith('/run')
  })
  it('returns a prepared rehearsal to its own controls without covering safety actions', () => {
    mockLive = true; mockPurpose = 'rehearsal'; mockNavigationReady = true
    const screen = render(<RootLayout />)
    expect(mockReplace).toHaveBeenCalledWith('/rehearsal'); expect(screen.queryByRole('progressbar')).toBeNull()
  })
  it.each(['/preflight', '/settings', '/'])('returns confirmed empty native inspection to requested %s while exposing safety during the read', (destination) => {
    mockLive = true; mockNativePending = true; mockPhase = 'preparing'; mockPathname = destination; mockNavigationReady = true
    const screen = render(<RootLayout />)
    expect(mockReplace).toHaveBeenLastCalledWith('/recovery'); expect(screen.queryByRole('progressbar')).toBeNull()
    mockPathname = '/recovery'; screen.rerender(<RootLayout />); mockReplace.mockClear()
    mockLive = false; mockNativePending = false; mockPhase = 'idle'; screen.rerender(<RootLayout />)
    expect(mockReplace).toHaveBeenCalledTimes(1); expect(mockReplace).toHaveBeenCalledWith(destination)
  })
  it.each([['performance', '/run'], ['rehearsal', '/rehearsal']])('routes successful %s adoption to its actual controls', (purpose, route) => {
    mockLive = true; mockNativePending = true; mockPhase = 'preparing'; mockPathname = '/preflight'; mockNavigationReady = true
    const screen = render(<RootLayout />); mockReplace.mockClear(); mockPathname = '/recovery'
    mockNativePending = false; mockSnapshot = {}; mockPhase = 'running'; mockPurpose = purpose!; screen.rerender(<RootLayout />)
    expect(mockReplace).toHaveBeenCalledTimes(1); expect(mockReplace).toHaveBeenCalledWith(route)
  })
  it('keeps unknown native recovery accessible and does not later override an explicit exit route', () => {
    mockLive = true; mockNativePending = true; mockPhase = 'preparing'; mockPathname = '/settings'; mockNavigationReady = true
    const screen = render(<RootLayout />); mockPathname = '/recovery'; mockPhase = 'fault'; mockReplace.mockClear(); screen.rerender(<RootLayout />)
    expect(mockReplace).not.toHaveBeenCalled(); expect(screen.queryByRole('progressbar')).toBeNull()
    mockLive = false; mockNativePending = false; mockPhase = 'idle'; mockPathname = '/'; screen.rerender(<RootLayout />)
    expect(mockReplace).not.toHaveBeenCalled()
  })
  it('keeps an adopted interrupted run in Recovery instead of opening playable controls', () => {
    mockLive = true; mockNativePending = true; mockPhase = 'preparing'; mockPathname = '/preflight'; mockNavigationReady = true
    const screen = render(<RootLayout />); mockReplace.mockClear(); mockPathname = '/recovery'; mockSnapshot = {}; mockNativePending = false; mockPhase = 'interrupted'; screen.rerender(<RootLayout />)
    expect(mockReplace).not.toHaveBeenCalled(); expect(screen.queryByRole('progressbar')).toBeNull()
  })
})
