import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import { AppState, type AppStateStatus, Platform } from 'react-native'
import { I18nProvider, messages, useI18n, type Locale } from '../../i18n'
import type { BackgroundReliabilityStatus } from '../../platform/background-reliability'
import { isDeviceSettingsActionPending, withDeviceSettingsAction } from '../../runtime/device-settings-action'
import { setCriticalSessionActive } from '../../runtime/critical-session-gate'
import { BackgroundReliabilityPanel } from '../BackgroundReliabilityPanel'
import { Button, StatusBanner } from '../primitives'

const mockBackground = { read: jest.fn(), openSettings: jest.fn(), requestNotifications: jest.fn() }
const mockApp = { liveSession: false }
let mockFocused = true
jest.mock('expo-router', () => ({
  useFocusEffect: function useFocusEffect(effect: () => void | (() => void)) {
    const React = jest.requireActual<typeof import('react')>('react')
    const focused = mockFocused
    React.useEffect(() => focused ? effect() : undefined, [effect, focused])
  },
}))
jest.mock('../../platform/background-reliability', () => ({ BackgroundReliability: { read: () => mockBackground.read(), openSettings: (target: string) => mockBackground.openSettings(target), requestNotifications: () => mockBackground.requestNotifications() } }))
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
let foreground: (state: AppStateStatus) => void
const removeListener = jest.fn()
const t = (key: keyof typeof messages.en) => messages.en[key]
function status(changes: Partial<BackgroundReliabilityStatus> = {}): BackgroundReliabilityStatus {
  return { platform: 'android', checkedAtMonotonicMs: 42, batteryOptimizationIgnored: true, backgroundRestricted: false, appStandbyRestricted: false, powerSaveMode: false, batteryLevelPercent: 80, batteryCharging: false, thermalState: 'normal', systemLowMemory: null, notificationPermissionGranted: true, notificationsEnabled: true, playbackChannelCreated: true, playbackChannelBlocked: false, serviceRunning: false, preparedSessionActive: false, foregroundServiceActive: false, previousProcessExit: null, playbackNotificationPresent: false, backgroundAudioConfigured: null, ...changes }
}
function mount() { return render(<I18nProvider><BackgroundReliabilityPanel /></I18nProvider>) }
function LocalizedPanel({ locale }: { locale: Locale }) {
  const { setLocale } = useI18n()
  return <><Button label="Test language" onPress={() => setLocale(locale)} /><BackgroundReliabilityPanel /></>
}
beforeEach(() => {
  jest.clearAllMocks(); mockApp.liveSession = false; setCriticalSessionActive(false); mockFocused = true
  jest.replaceProperty(Platform, 'OS', 'android')
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => { foreground = listener; return { remove: removeListener } })
  mockBackground.read.mockResolvedValue(status())
  mockBackground.openSettings.mockImplementation(async (target: string) => ({ opened: true, requestedTarget: target, openedTarget: target, usedFallback: false }))
  mockBackground.requestNotifications.mockResolvedValue('granted')
})
afterEach(async () => { cleanup(); await act(async () => { await Promise.resolve() }); setCriticalSessionActive(false); jest.restoreAllMocks() })

describe('background readiness guidance', () => {
  it.each(['en', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ar'] as const)('explains current Android memory pressure in %s without changing settings', async (locale) => {
    mockBackground.read.mockResolvedValue({ ...status(), systemLowMemory: true });
    const screen = render(<I18nProvider><LocalizedPanel locale={locale} /></I18nProvider>);
    fireEvent.press(screen.getByRole('button', { name: 'Test language' }));
    await waitFor(() => expect(screen.getByText(messages[locale]['background.lowMemoryHelp'])).toBeTruthy());
    expect(screen.getByText(messages[locale]['background.lowMemory'])).toBeTruthy();
    expect(mockBackground.openSettings).not.toHaveBeenCalled();
    expect(mockBackground.requestNotifications).not.toHaveBeenCalled();
  });
  it('clears a current memory warning after a fresh observation without hiding battery restrictions', async () => {
    let completeFresh!: (value: BackgroundReliabilityStatus) => void;
    const fresh = new Promise<BackgroundReliabilityStatus>((resolve) => { completeFresh = resolve });
    mockBackground.read.mockReset().mockResolvedValueOnce({ ...status(), batteryOptimizationIgnored: false, systemLowMemory: true })
      .mockImplementationOnce(() => fresh);
    const screen = render(<I18nProvider><BackgroundReliabilityPanel compact /></I18nProvider>);
    await waitFor(() => expect(screen.getByText(t('background.lowMemory'))).toBeTruthy());
    expect(screen.getByText(`• ${t('background.optimized')}`)).toBeTruthy();
    await act(async () => { foreground('background'); foreground('active') });
    expect(mockBackground.read).toHaveBeenCalledTimes(2);
    expect(screen.getByText(t('background.lowMemory'))).toBeTruthy();
    await act(async () => completeFresh(status({ batteryOptimizationIgnored: false, systemLowMemory: false })));
    expect(screen.queryByText(t('background.lowMemory'))).toBeNull();
    expect(screen.getByText(t('background.optimized'))).toBeTruthy();
    expect(screen.queryByText(t('background.checked'))).toBeNull();
  });
  it('warns for lost foreground protection without misclassifying silent remote testing', async () => {
    mockBackground.read.mockResolvedValue(status({ serviceRunning: true, preparedSessionActive: true }));
    const screen = render(<I18nProvider><BackgroundReliabilityPanel compact /></I18nProvider>);
    await waitFor(() => expect(screen.getByText(t('background.foregroundMissing'))).toBeTruthy());
    expect(screen.queryByText(t('background.checked'))).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: t('background.reviewProtection') }));
    expect(screen.getByText(t('background.foregroundMissingHelp'))).toBeTruthy();
    expect(mockBackground.openSettings).not.toHaveBeenCalled();
    expect(mockBackground.requestNotifications).not.toHaveBeenCalled();
  });
  it.each(['en', 'he', 'ar'] as const)('shows historical closure details only after disclosure in %s', async (locale) => {
    mockBackground.read.mockResolvedValue(status({ previousProcessExit: { reason: 'memory', timestampMs: 1_700_000_000_000 } }));
    const screen = render(<I18nProvider><LocalizedPanel locale={locale} /></I18nProvider>);
    fireEvent.press(screen.getByRole('button', { name: 'Test language' }));
    await waitFor(() => expect(screen.getByRole('button', { name: messages[locale]['background.previousExit'] })).toBeTruthy());
    expect(screen.queryByText(messages[locale]['background.exitHelp'])).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: messages[locale]['background.previousExit'] }));
    expect(screen.getByText(messages[locale]['background.exit.memory'])).toBeTruthy();
    expect(screen.getByText(messages[locale]['background.exitHelp'])).toBeTruthy();
    expect(screen.getByLabelText(new RegExp(messages[locale]['background.exitWhen']))).toBeTruthy();
    expect(mockBackground.openSettings).not.toHaveBeenCalled();
  });
  it('does not label a historical crash as an active compact failure', async () => {
    mockBackground.read.mockResolvedValue(status({ previousProcessExit: { reason: 'crash', timestampMs: 42 } }));
    const screen = render(<I18nProvider><BackgroundReliabilityPanel compact /></I18nProvider>);
    await waitFor(() => expect(screen.getByText(t('background.checked'))).toBeTruthy());
    expect(screen.queryByText(t('background.exit.crash'))).toBeNull();
  });
  it('offers the closure-prevention checklist without opening system settings', async () => {
    const screen = mount();
    await waitFor(() => expect(screen.getByRole('button', { name: t('background.help') })).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: t('background.help') }));
    expect(screen.getByText(t('background.checklistBody'))).toBeTruthy();
    expect(mockBackground.openSettings).not.toHaveBeenCalled();
    expect(mockBackground.requestNotifications).not.toHaveBeenCalled();
  });
  it('offers the app-info repair for restricted standby when Doze is not exempted', async () => {
    mockBackground.read.mockResolvedValue(status({ appStandbyRestricted: true, batteryOptimizationIgnored: false }))
    const screen = render(<I18nProvider><BackgroundReliabilityPanel compact /></I18nProvider>)
    await waitFor(() => expect(screen.getByText(t('background.standbyRestricted'))).toBeTruthy())
    expect(screen.queryByText(t('background.checked'))).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: t('background.openApp') }))
    await waitFor(() => expect(mockBackground.openSettings).toHaveBeenCalledWith('app'))
    act(() => foreground('background'))
    act(() => foreground('active'))
    await waitFor(() => expect(isDeviceSettingsActionPending()).toBe(false))
  })
  it('shows a missing notification without treating foreground ownership as visibility', async () => {
    mockBackground.read.mockResolvedValue(status({ serviceRunning: true, foregroundServiceActive: true }))
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('background.notificationMissing'))).toBeTruthy())
    expect(screen.getByText(t('background.notificationRecordHelp'))).toBeTruthy()
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
    expect(mockBackground.requestNotifications).not.toHaveBeenCalled()
  })
  it('does not warn for an expected absent notification while idle', async () => {
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('background.notificationRecord'))).toBeTruthy())
    expect(screen.queryByText(t('background.notificationMissing'))).toBeNull()
    expect(screen.getByText(t('background.notificationRecordHelp'))).toBeTruthy()
  })
  it('keeps an unobservable standby category unknown rather than checked', async () => {
    mockBackground.read.mockResolvedValue(status({ appStandbyRestricted: null, batteryOptimizationIgnored: false }))
    const screen = render(<I18nProvider><BackgroundReliabilityPanel compact /></I18nProvider>)
    await waitFor(() => expect(screen.getByText(`• ${t('background.notChecked')}`)).toBeTruthy())
    expect(screen.queryByText(t('background.checked'))).toBeNull()
    expect(screen.queryByRole('button', { name: t('background.openApp') })).toBeNull()
  })
  it('does not warn about standby when a known Doze exemption supersedes it', async () => {
    mockBackground.read.mockResolvedValue(status({ appStandbyRestricted: true }))
    const screen = render(<I18nProvider><BackgroundReliabilityPanel compact /></I18nProvider>)
    await waitFor(() => expect(screen.getByText(t('background.checked'))).toBeTruthy())
    expect(screen.queryByText(t('background.standbyRestricted'))).toBeNull()
    expect(screen.queryByRole('button', { name: t('background.openApp') })).toBeNull()
  })
  it('never offers a missing-notification repair through a prepared session', async () => {
    mockApp.liveSession = true
    mockBackground.read.mockResolvedValue(status({ serviceRunning: true, foregroundServiceActive: true }))
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('background.critical'))).toBeTruthy())
    expect(mockBackground.read).not.toHaveBeenCalled()
    expect(screen.queryByText(t('background.notificationMissing'))).toBeNull()
    expect(screen.queryByText(t('background.checking'))).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: t('background.help') }))
    const repair = screen.getByRole('button', { name: t('background.openNotifications') })
    expect(repair).toBeDisabled()
    fireEvent.press(repair)
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
  })
  it('does not show Android standby or notification-record readings on iOS', async () => {
    mockBackground.read.mockResolvedValue(status({ platform: 'ios', backgroundAudioConfigured: true }))
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('background.iosHelp'))).toBeTruthy())
    expect(screen.queryByText(t('background.notificationRecord'))).toBeNull()
    expect(screen.queryByText(t('background.standbyRestricted'))).toBeNull()
  })
  it.each([
    [{ backgroundRestricted: true, batteryOptimizationIgnored: false }, 'background.openApp', 'app'],
    [{ batteryOptimizationIgnored: false, notificationPermissionGranted: false }, 'background.openBattery', 'battery'],
    [{ playbackChannelBlocked: true, notificationPermissionGranted: false }, 'background.openChannel', 'playbackChannel'],
    [{ notificationsEnabled: false }, 'background.openNotifications', 'notifications'],
    [{ powerSaveMode: true }, 'background.openPower', 'powerSaver'],
  ] as const)('offers one direct repair for the first actionable compact warning: %s', async (changes, label, target) => {
    mockBackground.read.mockResolvedValue(status(changes))
    const screen = render(<I18nProvider><BackgroundReliabilityPanel compact /></I18nProvider>)
    await waitFor(() => expect(screen.getByRole('button', { name: t(label) })).toBeTruthy())
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
    expect(mockBackground.requestNotifications).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: t(label) }))
    await waitFor(() => expect(mockBackground.openSettings).toHaveBeenCalledWith(target))
    expect(screen.getByText(t('background.protectionSummary'))).toBeTruthy()
    expect(screen.getByText(t('background.settingsWaiting'))).toBeTruthy()
    act(() => foreground('background'))
    act(() => foreground('active'))
    await waitFor(() => expect(isDeviceSettingsActionPending()).toBe(false))
    expect(mockBackground.read).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(t('background.checked'))).toBeNull()
  })
  it('requests notification access only after a compact repair press and retains denial guidance', async () => {
    mockBackground.read.mockResolvedValue(status({ notificationPermissionGranted: false, notificationsEnabled: false }))
    mockBackground.requestNotifications.mockResolvedValue('denied')
    const screen = render(<I18nProvider><BackgroundReliabilityPanel compact /></I18nProvider>)
    await waitFor(() => expect(screen.getByRole('button', { name: t('background.requestNotifications') })).toBeTruthy())
    expect(mockBackground.requestNotifications).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: t('background.requestNotifications') }))
    await waitFor(() => expect(screen.getByText(t('background.denied'))).toBeTruthy())
    expect(mockBackground.requestNotifications).toHaveBeenCalledTimes(1)
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: t('background.openNotifications') })).toBeTruthy()
    expect(isDeviceSettingsActionPending()).toBe(false)
  })
  it('retains a failed direct repair with contextual Retry instead of losing it in the collapsed card', async () => {
    mockBackground.read.mockResolvedValue(status({ batteryOptimizationIgnored: false }))
    mockBackground.openSettings.mockResolvedValue({ opened: false })
    const screen = render(<I18nProvider><BackgroundReliabilityPanel compact /></I18nProvider>)
    await waitFor(() => expect(screen.getByRole('button', { name: t('background.openBattery') })).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: t('background.openBattery') }))
    await waitFor(() => expect(screen.getByText(t('background.actionFailed'))).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: t('common.retry') }))
    await waitFor(() => expect(mockBackground.openSettings).toHaveBeenCalledTimes(2))
    expect(screen.getByText(t('background.batteryHelp'))).toBeTruthy()
  })
  it('keeps direct repairs guarded when an old callback is invoked after arming or teardown', async () => {
    mockBackground.read.mockResolvedValue(status({ batteryOptimizationIgnored: false }))
    const screen = render(<I18nProvider><BackgroundReliabilityPanel compact /></I18nProvider>)
    await waitFor(() => expect(screen.getByRole('button', { name: t('background.openBattery') })).toBeTruthy())
    const repair = screen.UNSAFE_getAllByType(Button).find((button) => button.props.label === t('background.openBattery'))!.props.onPress
    act(() => setCriticalSessionActive(true))
    await act(async () => { await repair() })
    expect(screen.getByText(t('background.critical'))).toBeTruthy()
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
    screen.unmount(); setCriticalSessionActive(false)
    await act(async () => { await repair() })
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
    expect(isDeviceSettingsActionPending()).toBe(false)
  })
  it.each(['unknown', 'failed', 'ios'] as const)('avoids an inappropriate compact repair for %s observations', async (state) => {
    if (state === 'failed') mockBackground.read.mockRejectedValue(new Error('Unavailable'))
    else mockBackground.read.mockResolvedValue(state === 'ios'
      ? status({ platform: 'ios', powerSaveMode: true, backgroundAudioConfigured: true })
      : status({ batteryOptimizationIgnored: null }))
    const screen = render(<I18nProvider><BackgroundReliabilityPanel compact /></I18nProvider>)
    await waitFor(() => expect(screen.queryByText(t('background.checking'))).toBeNull())
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
    expect(mockBackground.requestNotifications).not.toHaveBeenCalled()
  })
  it('puts repairs beside battery and power warnings without duplicate visible actions', async () => {
    mockBackground.read.mockResolvedValue(status({ batteryOptimizationIgnored: false, powerSaveMode: true }))
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('background.batteryHelp'))).toBeTruthy())
    const banners = screen.UNSAFE_getAllByType(StatusBanner)
    const battery = banners.find((banner) => banner.props.body === t('background.batteryHelp'))!
    const power = banners.find((banner) => banner.props.body === t('background.powerHelp'))!
    expect(within(battery).getByRole('button', { name: t('background.openBattery') })).toBeTruthy()
    expect(within(power).getByRole('button', { name: t('background.openPower') })).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: t('background.help') }))
    expect(screen.getAllByRole('button', { name: t('background.openBattery') })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: t('background.openPower') })).toHaveLength(1)
    fireEvent.press(within(power).getByRole('button', { name: t('background.openPower') }))
    await waitFor(() => expect(mockBackground.openSettings).toHaveBeenCalledWith('powerSaver'))
    act(() => foreground('background'))
    act(() => foreground('active'))
    await waitFor(() => expect(isDeviceSettingsActionPending()).toBe(false))
    expect(screen.getByText(t('background.powerHelp'))).toBeTruthy()
  })
  it('shows notification lifetime guidance without requiring the help disclosure', async () => {
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('background.protectionSummary'))).toBeTruthy())
    expect(screen.queryByText(t('background.helpBody'))).toBeNull()
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
    expect(mockBackground.requestNotifications).not.toHaveBeenCalled()
  })
  it('keeps a deliberate battery repair available when optimization cannot be measured', async () => {
    mockBackground.read.mockResolvedValue(status({ batteryOptimizationIgnored: null }))
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('background.notChecked'))).toBeTruthy())
    expect(screen.getAllByRole('button', { name: t('background.openBattery') })).toHaveLength(1)
    expect(screen.queryByText(t('background.batteryHelp'))).toBeNull()
    expect(screen.queryByText(t('background.exempt'))).toBeNull()
  })
  it.each(['battery', 'request'] as const)('ignores an obsolete %s callback after teardown', async (action) => {
    mockBackground.read.mockResolvedValue(status({ batteryOptimizationIgnored: false, notificationPermissionGranted: false }))
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('background.batteryHelp'))).toBeTruthy())
    const label = t(action === 'battery' ? 'background.openBattery' : 'background.requestNotifications')
    const press = screen.UNSAFE_getAllByType(Button).find((button) => button.props.label === label)!.props.onPress
    screen.unmount()
    await act(async () => { await press() })
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
    expect(mockBackground.requestNotifications).not.toHaveBeenCalled()
    expect(isDeviceSettingsActionPending()).toBe(false)
  })
  it('moves the battery repair out of a resolved warning without duplicating it or hiding manual access', async () => {
    mockBackground.read.mockResolvedValueOnce(status({ batteryOptimizationIgnored: false }))
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('background.batteryHelp'))).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: t('background.refresh') }))
    await waitFor(() => expect(screen.getByText(t('background.exempt'))).toBeTruthy())
    expect(screen.queryByText(t('background.batteryHelp'))).toBeNull()
    expect(screen.getAllByRole('button', { name: t('background.openBattery') })).toHaveLength(1)
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
  })
  it('shows every compact issue instead of hiding notification denial behind battery optimization', async () => {
    mockBackground.read.mockResolvedValue(status({ batteryLevelPercent: 5, thermalState: 'critical', batteryOptimizationIgnored: false,
      backgroundRestricted: true, playbackChannelBlocked: true, notificationsEnabled: false, powerSaveMode: true }))
    const screen = render(<I18nProvider><BackgroundReliabilityPanel compact /></I18nProvider>)
    await waitFor(() => expect(screen.getByText(t('background.thermal.critical'))).toBeTruthy())
    for (const key of ['background.lowBattery', 'background.restricted', 'background.channelBlocked', 'background.notificationHelp', 'background.power'] as const) {
      expect(screen.getByText(`• ${t(key)}`)).toBeTruthy()
    }
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
    expect(mockBackground.requestNotifications).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: t('background.reviewProtection') }))
    expect(screen.getByText(t('background.lowBatteryHelp'))).toBeTruthy()
    expect(screen.getByText(t('background.heatHelp'))).toBeTruthy()
    expect(screen.getByLabelText(`${t('background.batteryLevel')}: 5%`)).toBeTruthy()
    expect(screen.getByLabelText(`${t('background.charging')}: ${t('background.no')}`)).toBeTruthy()
  })
  it('keeps pressure readings unknown when unavailable and never calls a missing temperature normal', async () => {
    mockBackground.read.mockResolvedValue(status({ batteryLevelPercent: null, batteryCharging: null, thermalState: null }))
    const screen = mount()
    await waitFor(() => expect(screen.getByLabelText(`${t('background.thermal')}: ${t('background.unknown')}`)).toBeTruthy())
    expect(screen.getByLabelText(`${t('background.batteryLevel')}: ${t('background.unknown')}`)).toBeTruthy()
    expect(screen.queryByText(t('background.thermal.normal'))).toBeNull()
    expect(screen.queryByText(t('background.lowBattery'))).toBeNull()
  })
  it('refreshes a pressure warning on return without changing settings or claiming charging from opening a page', async () => {
    mockBackground.read.mockResolvedValueOnce(status({ batteryLevelPercent: 20, batteryCharging: null, thermalState: 'hot' }))
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('background.heatHelp'))).toBeTruthy())
    expect(screen.getByText(t('background.lowBatteryHelp'))).toBeTruthy()
    mockBackground.read.mockResolvedValueOnce(status({ batteryLevelPercent: 20, batteryCharging: true, thermalState: 'warm' }))
    act(() => foreground('active'))
    await waitFor(() => expect(screen.queryByText(t('background.lowBatteryHelp'))).toBeNull())
    expect(screen.queryByText(t('background.heatHelp'))).toBeNull()
    expect(screen.getByLabelText(`${t('background.charging')}: ${t('background.yes')}`)).toBeTruthy()
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
  })
  it('surfaces a compact battery advisory, expands the same repair workflow, and never prompts automatically', async () => {
    mockBackground.read.mockResolvedValue(status({ batteryOptimizationIgnored: false }))
    const screen = render(<I18nProvider><BackgroundReliabilityPanel compact /></I18nProvider>)
    await waitFor(() => expect(screen.getByText(t('background.optimized'))).toBeTruthy())
    expect(screen.getByRole('button', { name: t('background.openBattery') })).toBeTruthy()
    expect(mockBackground.requestNotifications).not.toHaveBeenCalled()
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: t('background.reviewProtection') }))
    expect(screen.getByRole('button', { name: t('background.openBattery') })).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: t('background.hideDetails') }))
    expect(screen.getByRole('button', { name: t('background.reviewProtection') })).toBeTruthy()
    expect(mockBackground.read).toHaveBeenCalledTimes(1)
  })
  it('retains an advisory when notifications are denied and updates it only after a real read', async () => {
    mockBackground.read.mockResolvedValue(status({ notificationsEnabled: false, notificationPermissionGranted: false }))
    const screen = render(<I18nProvider><BackgroundReliabilityPanel compact /></I18nProvider>)
    await waitFor(() => expect(screen.getByText(t('background.notificationHelp'))).toBeTruthy())
    mockBackground.read.mockResolvedValue(status())
    act(() => foreground('active'))
    await waitFor(() => expect(screen.getByText(t('background.checked'))).toBeTruthy())
    expect(mockBackground.requestNotifications).not.toHaveBeenCalled()
  })
  it('keeps failed compact reads visible and offers the existing retry when expanded', async () => {
    mockBackground.read.mockRejectedValueOnce(new Error('unavailable'))
    const screen = render(<I18nProvider><BackgroundReliabilityPanel compact /></I18nProvider>)
    await waitFor(() => expect(screen.getByText(t('background.notChecked'))).toBeTruthy())
    expect(screen.queryByText(t('background.checked'))).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: t('background.reviewProtection') }))
    fireEvent.press(screen.getByRole('button', { name: t('common.retry') }))
    await waitFor(() => expect(screen.getByText(t('background.exempt'))).toBeTruthy())
  })
  it('keeps unavailable measurements unknown instead of claiming a healthy configuration', async () => {
    mockBackground.read.mockResolvedValue(status({ batteryOptimizationIgnored: null, backgroundRestricted: null, powerSaveMode: null, notificationPermissionGranted: null, notificationsEnabled: null, playbackChannelCreated: null, playbackChannelBlocked: null, serviceRunning: null, foregroundServiceActive: null }))
    const screen = mount()
    await waitFor(() => expect(screen.getAllByText(t('background.unknown'))).toHaveLength(8))
    expect(screen.queryByText(t('background.exempt'))).toBeNull()
    expect(screen.queryByText(t('background.channelReady'))).toBeNull()
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
    expect(screen.getByText(t('background.notChecked'))).toBeTruthy()
    expect(screen.getByText(t('background.incompleteHelp'))).toBeTruthy()
  })
  it('does not mark partial background checks successful even when battery exemption is known', async () => {
    mockBackground.read.mockResolvedValue(status({ backgroundRestricted: null }))
    const screen = render(<I18nProvider><BackgroundReliabilityPanel compact /></I18nProvider>)
    await waitFor(() => expect(screen.getByText(t('background.notChecked'))).toBeTruthy())
    expect(screen.queryByText(t('background.checked'))).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: t('background.reviewProtection') }))
    expect(screen.getByText(t('background.incompleteHelp'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('background.refresh') })).not.toBeDisabled()
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
  })
  it('owns read failure and offers a deliberate retry without reassuring stale measurements', async () => {
    mockBackground.read.mockRejectedValueOnce(new Error('Unavailable'))
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('background.readFailed'))).toBeTruthy())
    expect(screen.queryByText(t('background.exempt'))).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: t('common.retry') }))
    await waitFor(() => expect(screen.getByText(t('background.exempt'))).toBeTruthy())
    expect(screen.queryByText(t('background.readFailed'))).toBeNull()
    expect(mockBackground.read).toHaveBeenCalledTimes(2)
  })
  it('reports settings fallback and rechecks on foreground return rather than assuming a setting changed', async () => {
    mockBackground.openSettings.mockResolvedValue({ opened: true, requestedTarget: 'battery', openedTarget: 'app', usedFallback: true })
    const screen = mount(); await waitFor(() => expect(screen.getByText(t('background.exempt'))).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: t('background.openBattery') }))
    await waitFor(() => expect(mockBackground.openSettings).toHaveBeenCalledTimes(1))
    expect(isDeviceSettingsActionPending()).toBe(true)
    expect(mockBackground.read).toHaveBeenCalledTimes(1)
    mockBackground.read.mockResolvedValueOnce(status({ batteryOptimizationIgnored: false }))
    act(() => foreground('background')); expect(mockBackground.read).toHaveBeenCalledTimes(1)
    act(() => foreground('active'))
    await waitFor(() => expect(screen.getByText(t('background.fallback'))).toBeTruthy())
    expect(isDeviceSettingsActionPending()).toBe(false)
    await waitFor(() => expect(screen.getAllByText(t('background.optimized'))).toHaveLength(2))
    expect(mockBackground.read).toHaveBeenCalledTimes(2)
  })
  it('retries the exact failed action and suppresses repeated taps while it is pending', async () => {
    let finish!: (value: unknown) => void
    mockBackground.openSettings.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const screen = mount(); await waitFor(() => expect(screen.getByText(t('background.exempt'))).toBeTruthy())
    const button = screen.getByRole('button', { name: t('background.openBattery') })
    fireEvent.press(button); fireEvent.press(button)
    expect(mockBackground.openSettings).toHaveBeenCalledTimes(1)
    await act(async () => finish({ opened: false, requestedTarget: 'battery', openedTarget: null, usedFallback: false }))
    expect(screen.getByText(t('background.actionFailed'))).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: t('common.retry') }))
    await waitFor(() => expect(mockBackground.openSettings).toHaveBeenCalledTimes(2))
    expect(mockBackground.openSettings).toHaveBeenLastCalledWith('battery')
  })
  it('blocks device actions if a session becomes critical after the card rendered', async () => {
    const screen = mount(); await waitFor(() => expect(screen.getByText(t('background.exempt'))).toBeTruthy())
    act(() => setCriticalSessionActive(true))
    fireEvent.press(screen.getByRole('button', { name: t('background.openBattery') }))
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
    expect(screen.getAllByText(t('background.critical')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: t('background.openBattery') })).toBeDisabled()
  })
  it('keeps media exemption explicit when notification permission is denied', async () => {
    mockBackground.read.mockResolvedValue(status({ notificationPermissionGranted: false, notificationsEnabled: false }))
    mockBackground.requestNotifications.mockResolvedValue('denied')
    const screen = mount(); await waitFor(() => expect(screen.getByText(t('background.channelReady'))).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: t('background.help') }))
    fireEvent.press(screen.getByRole('button', { name: t('background.requestNotifications') }))
    await waitFor(() => expect(screen.getByText(t('background.denied'))).toBeTruthy())
    expect(screen.getByText(t('background.mediaExempt'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('background.openBattery') })).not.toBeDisabled()
    expect(screen.queryByText(t('background.actionFailed'))).toBeNull()
  })
  it('makes blocked notification repair visible without opening help and explains normal idle services', async () => {
    mockBackground.read.mockResolvedValue(status({ playbackChannelBlocked: true, notificationsEnabled: false, notificationPermissionGranted: false }))
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('background.channelHelp'))).toBeTruthy())
    expect(screen.getByRole('button', { name: t('background.openChannel') })).toBeTruthy()
    expect(screen.getByRole('button', { name: t('background.openNotifications') })).toBeTruthy()
    expect(screen.getByRole('button', { name: t('background.requestNotifications') })).toBeTruthy()
    expect(screen.getByText(t('background.serviceIdle'))).toBeTruthy()
    expect(screen.getByText(t('background.mediaExempt'))).toBeTruthy()
    expect(mockBackground.requestNotifications).not.toHaveBeenCalled()
  })
  it('holds admission while notification permission is pending and releases after denial', async () => {
    let finish!: (value: string) => void
    mockBackground.read.mockResolvedValue(status({ notificationPermissionGranted: false }))
    mockBackground.requestNotifications.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('background.channelReady'))).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: t('background.requestNotifications') }))
    expect(isDeviceSettingsActionPending()).toBe(true)
    expect(screen.getByRole('button', { name: t('background.openBattery') })).toBeDisabled()
    await act(async () => finish('denied'))
    expect(isDeviceSettingsActionPending()).toBe(false)
    expect(screen.getByText(t('background.denied'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('background.openBattery') })).not.toBeDisabled()
  })
  it('holds admission through settings until a real foreground return', async () => {
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('background.exempt'))).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: t('background.openBattery') }))
    await waitFor(() => expect(mockBackground.openSettings).toHaveBeenCalledTimes(1))
    act(() => foreground('active'))
    expect(isDeviceSettingsActionPending()).toBe(true)
    act(() => foreground('inactive'))
    act(() => foreground('active'))
    await waitFor(() => expect(isDeviceSettingsActionPending()).toBe(false))
    expect(screen.queryByText(t('background.settingsWaiting'))).toBeNull()
    expect(screen.getByRole('button', { name: t('background.openBattery') })).not.toBeDisabled()
  })
  it('allows a deliberate recheck after windowed settings and cleans up a pending launch on unmount', async () => {
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('background.exempt'))).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: t('background.openBattery') }))
    await waitFor(() => expect(screen.getByText(t('background.settingsWaiting'))).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: t('background.refresh') }))
    await waitFor(() => expect(isDeviceSettingsActionPending()).toBe(false))
    let finish!: (value: unknown) => void
    mockBackground.openSettings.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    fireEvent.press(screen.getByRole('button', { name: t('background.openBattery') }))
    expect(isDeviceSettingsActionPending()).toBe(true)
    screen.unmount()
    expect(isDeviceSettingsActionPending()).toBe(true)
    await act(async () => finish({ opened: true, openedTarget: 'battery', usedFallback: false }))
    expect(isDeviceSettingsActionPending()).toBe(false)
  })
  it('shows only iOS guidance and public app settings without Android permission actions', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    mockBackground.read.mockResolvedValue(status({ platform: 'ios', powerSaveMode: true, backgroundAudioConfigured: true }))
    const screen = mount(); await waitFor(() => expect(screen.getByText(t('background.iosAudio'))).toBeTruthy())
    expect(screen.getByText(t('background.on'))).toBeTruthy()
    expect(screen.getByText(t('background.iosHelp'))).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: t('background.help') }))
    expect(screen.queryByRole('button', { name: t('background.openBattery') })).toBeNull()
    expect(screen.queryByRole('button', { name: t('background.requestNotifications') })).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: t('background.openApp') }))
    await waitFor(() => expect(mockBackground.openSettings).toHaveBeenCalledWith('app'))
  })
  it('prominently warns about explicit restrictions and keeps power saving advisory', async () => {
    mockBackground.read.mockResolvedValue(status({ backgroundRestricted: true, powerSaveMode: true, notificationPermissionGranted: false, notificationsEnabled: true }))
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('background.restrictedHelp'))).toBeTruthy())
    expect(screen.getByText(t('background.powerHelp'))).toBeTruthy()
    expect(screen.getByLabelText(`${t('background.notification')}: ${t('background.no')}`)).toBeTruthy()
    expect(screen.getByLabelText(`${t('background.appNotifications')}: ${t('background.yes')}`)).toBeTruthy()
    expect(screen.getByRole('button', { name: t('background.openBattery') })).not.toBeDisabled()
    fireEvent.press(screen.getByRole('button', { name: t('background.openApp') }))
    await waitFor(() => expect(mockBackground.openSettings).toHaveBeenCalledWith('app'))
  })
  it('gives long status values their own line and stacks short statuses at large text sizes', async () => {
    const dimensions = jest.spyOn(jest.requireActual<typeof import('react-native')>('react-native'), 'useWindowDimensions').mockReturnValue({ width: 400, height: 800, scale: 1, fontScale: 1 })
    const screen = mount()
    await waitFor(() => expect(screen.getByText(t('background.exempt'))).toBeTruthy())
    const battery = `${t('background.battery')}: ${t('background.exempt')}`
    const power = `${t('background.power')}: ${t('background.off')}`
    expect(screen.getByLabelText(battery)).toHaveStyle({ flexDirection: 'column' })
    expect(screen.getByLabelText(`${t('background.channel')}: ${t('background.channelReady')}`)).toHaveStyle({ flexDirection: 'column' })
    expect(screen.getByLabelText(power)).toHaveStyle({ flexDirection: 'row' })
    dimensions.mockReturnValue({ width: 320, height: 800, scale: 1, fontScale: 2 })
    screen.rerender(<I18nProvider><BackgroundReliabilityPanel /></I18nProvider>)
    expect(screen.getByLabelText(power)).toHaveStyle({ flexDirection: 'column' })
    expect(screen.getByLabelText(battery)).toHaveStyle({ flexDirection: 'column' })
  })
  it('ignores an older read after a foreground refresh completes and removes its listener on unmount', async () => {
    let oldRead!: (value: BackgroundReliabilityStatus) => void
    mockBackground.read.mockImplementationOnce(() => new Promise((resolve) => { oldRead = resolve }))
    mockBackground.read.mockResolvedValueOnce(status({ batteryOptimizationIgnored: false }))
    const screen = mount()
    await waitFor(() => expect(mockBackground.read).toHaveBeenCalledTimes(1))
    act(() => foreground('active'))
    await waitFor(() => expect(screen.getAllByText(t('background.optimized'))).toHaveLength(2))
    await act(async () => oldRead(status()))
    expect(screen.queryByText(t('background.exempt'))).toBeNull()
    expect(screen.getAllByText(t('background.optimized'))).toHaveLength(2)
    screen.unmount(); expect(removeListener).toHaveBeenCalledTimes(1)
  })
})

describe('quiet protection rechecks', () => {
  beforeEach(() => { jest.useFakeTimers() })
  afterEach(() => { cleanup(); jest.useRealTimers() })
  async function start() {
    const screen = mount()
    await act(async () => { await Promise.resolve() })
    return screen
  }
  async function tick(ms = 30_000) { await act(async () => { await jest.advanceTimersByTimeAsync(ms) }) }

  it('does not read from an initially blurred protection panel', async () => {
    mockFocused = false
    await start()
    await tick(90_000)
    expect(mockBackground.read).not.toHaveBeenCalled()
  })

  it('does not poll a retained protection panel after its route blurs', async () => {
    const screen = await start()
    mockFocused = false
    screen.rerender(<I18nProvider><BackgroundReliabilityPanel /></I18nProvider>)
    await tick(90_000)
    expect(mockBackground.read).toHaveBeenCalledTimes(1)
  })

  it('does not reread a blurred protection panel on app foreground return', async () => {
    const screen = await start()
    mockFocused = false
    screen.rerender(<I18nProvider><BackgroundReliabilityPanel /></I18nProvider>)
    await act(async () => { foreground('background'); foreground('active') })
    expect(mockBackground.read).toHaveBeenCalledTimes(1)
  })

  it('does not mount a new advisory read during a critical session', async () => {
    act(() => setCriticalSessionActive(true))
    await start()
    expect(mockBackground.read).not.toHaveBeenCalled()
  })

  it('does not reread on foreground return if preparation became critical before render', async () => {
    await start()
    act(() => setCriticalSessionActive(true))
    await act(async () => { foreground('background'); foreground('active') })
    expect(mockBackground.read).toHaveBeenCalledTimes(1)
  })

  it('rejects a late advisory observation after its route blurs', async () => {
    const screen = await start()
    let finish!: (value: BackgroundReliabilityStatus) => void
    mockBackground.read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    await tick()
    mockFocused = false
    screen.rerender(<I18nProvider><BackgroundReliabilityPanel /></I18nProvider>)
    await act(async () => finish(status({ thermalState: 'critical' })))
    expect(screen.queryByText(t('background.heatHelp'))).toBeNull()
  })

  it('freshly checks once on refocus and keeps one periodic timer', async () => {
    const screen = await start()
    for (let index = 0; index < 10; index += 1) {
      mockFocused = false
      screen.rerender(<I18nProvider><BackgroundReliabilityPanel /></I18nProvider>)
      await tick(0)
      expect(jest.getTimerCount()).toBe(0)
      mockFocused = true
      await act(async () => { screen.rerender(<I18nProvider><BackgroundReliabilityPanel /></I18nProvider>) })
      await tick(0)
      expect(mockBackground.read).toHaveBeenCalledTimes(index + 2)
      expect(jest.getTimerCount()).toBe(1)
    }
    screen.unmount()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('finishes the initiating settings lease after foreground return while its route is blurred', async () => {
    const screen = await start()
    fireEvent.press(screen.getByRole('button', { name: t('background.openBattery') }))
    await act(async () => { await Promise.resolve() })
    expect(isDeviceSettingsActionPending()).toBe(true)
    mockFocused = false
    screen.rerender(<I18nProvider><BackgroundReliabilityPanel /></I18nProvider>)
    expect(isDeviceSettingsActionPending()).toBe(true)
    await act(async () => { foreground('background'); foreground('active') })
    expect(isDeviceSettingsActionPending()).toBe(false)
    expect(mockBackground.read).toHaveBeenCalledTimes(1)
    mockFocused = true
    await act(async () => { screen.rerender(<I18nProvider><BackgroundReliabilityPanel /></I18nProvider>) })
    expect(mockBackground.read).toHaveBeenCalledTimes(2)
  })

  it('keeps windowed Recheck usable when settings interrupted the initial slow read', async () => {
    let finish!: (value: BackgroundReliabilityStatus) => void
    mockBackground.read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const screen = await start()
    fireEvent.press(screen.getByRole('button', { name: t('background.openBattery') }))
    await act(async () => { await Promise.resolve() })
    expect(isDeviceSettingsActionPending()).toBe(true)
    expect(screen.queryByText(t('background.checking'))).toBeNull()
    const recheck = screen.getByRole('button', { name: t('background.refresh') })
    expect(recheck).toBeEnabled()
    fireEvent.press(recheck)
    await act(async () => { await Promise.resolve() })
    expect(isDeviceSettingsActionPending()).toBe(false)
    expect(mockBackground.read).toHaveBeenCalledTimes(2)
    expect(screen.getByText(t('background.exempt'))).toBeTruthy()
    await act(async () => finish(status({ thermalState: 'critical' })))
    expect(screen.queryByText(t('background.heatHelp'))).toBeNull()
  })

  it('does not let an obsolete hidden Recheck callback release an open settings lease', async () => {
    const screen = await start()
    fireEvent.press(screen.getByRole('button', { name: t('background.openBattery') }))
    await act(async () => { await Promise.resolve() })
    const recheck = screen.UNSAFE_getAllByType(Button).find((button) => button.props.label === t('background.refresh'))!.props.onPress
    mockFocused = false
    screen.rerender(<I18nProvider><BackgroundReliabilityPanel /></I18nProvider>)
    await act(async () => { recheck() })
    expect(isDeviceSettingsActionPending()).toBe(true)
    expect(mockBackground.read).toHaveBeenCalledTimes(1)
    await act(async () => { foreground('background'); foreground('active') })
    expect(isDeviceSettingsActionPending()).toBe(false)
    expect(mockBackground.read).toHaveBeenCalledTimes(1)
  })

  it('waits for another settings owner before its first read and checks once after release', async () => {
    let finish!: () => void, pending!: Promise<void>
    act(() => { pending = withDeviceSettingsAction(() => new Promise<void>((resolve) => { finish = resolve })) })
    const screen = await start()
    expect(mockBackground.read).not.toHaveBeenCalled()
    expect(screen.queryByText(t('background.checking'))).toBeNull()
    expect(screen.getByRole('button', { name: t('background.refresh') })).toBeDisabled()
    await act(async () => { finish(); await pending })
    expect(mockBackground.read).toHaveBeenCalledTimes(1)
    expect(screen.getByText(t('background.exempt'))).toBeTruthy()
  })

  it('rejects an old repair callback while a different settings owner is pending', async () => {
    const screen = await start()
    const repair = screen.UNSAFE_getAllByType(Button).find((button) => button.props.label === t('background.openBattery'))!.props.onPress
    let finish!: () => void, pending!: Promise<void>
    act(() => { pending = withDeviceSettingsAction(() => new Promise<void>((resolve) => { finish = resolve })) })
    await act(async () => { await repair() })
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
    expect(isDeviceSettingsActionPending()).toBe(true)
    await act(async () => { finish(); await pending })
    expect(mockBackground.read).toHaveBeenCalledTimes(2)
  })

  it('waits for a known active app state before its first advisory read', async () => {
    jest.replaceProperty(AppState, 'currentState', 'unknown')
    await start()
    expect(mockBackground.read).not.toHaveBeenCalled()
    await act(async () => foreground('active'))
    expect(mockBackground.read).toHaveBeenCalledTimes(1)
  })

  it('rejects a pending quiet result when preparation starts and refreshes after exit', async () => {
    const screen = await start()
    let finish!: (value: BackgroundReliabilityStatus) => void
    mockBackground.read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    await tick()
    await act(async () => { setCriticalSessionActive(true); finish(status({ thermalState: 'critical' })) })
    expect(screen.queryByText(t('background.heatHelp'))).toBeNull()
    expect(screen.getByRole('button', { name: t('background.refresh') })).toBeDisabled()
    await tick(90_000)
    expect(mockBackground.read).toHaveBeenCalledTimes(2)
    await act(async () => setCriticalSessionActive(false))
    expect(mockBackground.read).toHaveBeenCalledTimes(3)
    expect(screen.getByText(t('background.exempt'))).toBeTruthy()
  })

  it('discovers changed battery, heat and notification conditions without a settings prompt', async () => {
    const screen = await start()
    mockBackground.read.mockResolvedValueOnce(status({ batteryOptimizationIgnored: false, batteryLevelPercent: 10,
      thermalState: 'hot', notificationPermissionGranted: false, notificationsEnabled: false }))
    await tick(29_999)
    expect(mockBackground.read).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(screen.getByText(t('background.batteryHelp'))).toBeTruthy()
    expect(screen.getByText(t('background.heatHelp'))).toBeTruthy()
    expect(screen.getByText(t('background.lowBatteryHelp'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('background.requestNotifications') })).toBeTruthy()
    expect(mockBackground.openSettings).not.toHaveBeenCalled()
    expect(mockBackground.requestNotifications).not.toHaveBeenCalled()
  })
  it('keeps controls and observations stable during a slow read and never stacks automatic reads', async () => {
    const screen = await start()
    let finish!: (value: BackgroundReliabilityStatus) => void
    mockBackground.read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    await tick()
    expect(screen.getByText(t('background.exempt'))).toBeTruthy()
    expect(screen.queryByText(t('background.checking'))).toBeNull()
    expect(screen.getByRole('button', { name: t('background.refresh') })).not.toBeDisabled()
    await tick(90_000)
    expect(mockBackground.read).toHaveBeenCalledTimes(2)
    await act(async () => finish(status({ powerSaveMode: true })))
    expect(screen.getByText(t('background.powerHelp'))).toBeTruthy()
    await tick()
    expect(mockBackground.read).toHaveBeenCalledTimes(3)
  })
  it('removes stale reassurance on periodic failure and recovers on explicit Retry', async () => {
    const screen = await start()
    mockBackground.read.mockRejectedValueOnce(new Error('Unavailable'))
    await tick()
    expect(screen.queryByText(t('background.exempt'))).toBeNull()
    expect(screen.getByText(t('background.readFailed'))).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: t('common.retry') }))
    await act(async () => { await Promise.resolve() })
    expect(screen.getByText(t('background.exempt'))).toBeTruthy()
    expect(screen.queryByText(t('background.readFailed'))).toBeNull()
  })
  it('stops polling in the background, rejects late results and freshly reads on return', async () => {
    const screen = await start()
    let finish!: (value: BackgroundReliabilityStatus) => void
    mockBackground.read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    await tick()
    act(() => foreground('background'))
    await act(async () => finish(status({ thermalState: 'critical' })))
    expect(screen.queryByText(t('background.heatHelp'))).toBeNull()
    await tick(90_000)
    expect(mockBackground.read).toHaveBeenCalledTimes(2)
    mockBackground.read.mockResolvedValueOnce(status({ powerSaveMode: true }))
    await act(async () => foreground('active'))
    expect(screen.getByText(t('background.powerHelp'))).toBeTruthy()
    expect(mockBackground.read).toHaveBeenCalledTimes(3)
  })
  it('lets deliberate Recheck supersede a quiet read and rejects its late failure', async () => {
    const screen = await start()
    let fail!: (error: Error) => void
    mockBackground.read.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
    await tick()
    fireEvent.press(screen.getByRole('button', { name: t('background.refresh') }))
    await act(async () => { await Promise.resolve() })
    await act(async () => fail(new Error('Stale read')))
    expect(screen.getByText(t('background.exempt'))).toBeTruthy()
    expect(screen.queryByText(t('background.readFailed'))).toBeNull()
    expect(mockBackground.read).toHaveBeenCalledTimes(3)
  })
  it('pauses automatic reads during a critical session, even before the panel rerenders', async () => {
    const screen = await start()
    act(() => setCriticalSessionActive(true))
    await tick(60_000)
    expect(mockBackground.read).toHaveBeenCalledTimes(1)
    mockApp.liveSession = true
    screen.rerender(<I18nProvider><BackgroundReliabilityPanel /></I18nProvider>)
    act(() => setCriticalSessionActive(false))
    await tick(60_000)
    expect(mockBackground.read).toHaveBeenCalledTimes(1)
    mockApp.liveSession = false
    await act(async () => { screen.rerender(<I18nProvider><BackgroundReliabilityPanel /></I18nProvider>) })
    expect(mockBackground.read).toHaveBeenCalledTimes(2)
    await tick()
    expect(mockBackground.read).toHaveBeenCalledTimes(3)
  })
  it('does not poll across another settings action and resumes once it settles', async () => {
    await start()
    let finish!: () => void
    let pending!: Promise<void>
    act(() => { pending = withDeviceSettingsAction(() => new Promise<void>((resolve) => { finish = resolve })) })
    await tick(60_000)
    expect(mockBackground.read).toHaveBeenCalledTimes(1)
    await act(async () => { finish(); await pending })
    expect(mockBackground.read).toHaveBeenCalledTimes(2)
    await tick(29_999)
    expect(mockBackground.read).toHaveBeenCalledTimes(2)
    await tick(1)
    expect(mockBackground.read).toHaveBeenCalledTimes(3)
  })
  it('rechecks an iOS low-power warning without Android actions', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    mockBackground.read.mockResolvedValue(status({ platform: 'ios', backgroundAudioConfigured: true }))
    const screen = await start()
    mockBackground.read.mockResolvedValueOnce(status({ platform: 'ios', backgroundAudioConfigured: true, powerSaveMode: true }))
    await tick()
    expect(screen.getByText(t('background.powerHelp'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: t('background.openBattery') })).toBeNull()
  })
  it('releases its timer and rejects pending observations after unmount', async () => {
    const screen = await start()
    let finish!: (value: BackgroundReliabilityStatus) => void
    mockBackground.read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    await tick()
    screen.unmount()
    await act(async () => finish(status({ thermalState: 'critical' })))
    await tick(90_000)
    expect(mockBackground.read).toHaveBeenCalledTimes(2)
    expect(jest.getTimerCount()).toBe(0)
  })
})
