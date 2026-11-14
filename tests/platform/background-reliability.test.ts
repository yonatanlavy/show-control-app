import { PermissionsAndroid, Platform } from 'react-native';
import ShowAudio from '../../modules/show-audio';
import { BackgroundReliability, normalizeBackgroundStatus } from '../../src/platform/background-reliability';
import { setCriticalSessionActive } from '../../src/runtime/critical-session-gate';
import { isDeviceSettingsActionPending } from '../../src/runtime/device-settings-action';

jest.mock('../../modules/show-audio', () => ({ __esModule: true, default: {
  getBackgroundReliability: jest.fn(), openBackgroundSettings: jest.fn(),
} }));

const read = ShowAudio.getBackgroundReliability as jest.Mock;
const open = ShowAudio.openBackgroundSettings as jest.Mock;
const originalOS = Platform.OS;
const originalVersion = Object.getOwnPropertyDescriptor(Platform, 'Version');

it.each([true, false, null, undefined, 'true', 'false', 0, 1, {}])('normalizes current Android low-memory observation without guessing: %s', (systemLowMemory) => {
  expect(normalizeBackgroundStatus({ platform: 'android', systemLowMemory }))
    .toMatchObject({ systemLowMemory: typeof systemLowMemory === 'boolean' ? systemLowMemory : null });
});

it.each(['ios', 'web', undefined])('does not attribute an Android memory reading to another platform: %s', (platform) => {
  expect(normalizeBackgroundStatus({ platform, systemLowMemory: true })).toMatchObject({ systemLowMemory: null });
});

it.each(['memory', 'resources', 'crash', 'unresponsive', 'user', 'normal', 'system', 'unknown'])('accepts a bounded previous Android exit reason: %s', (reason) => {
  const previousProcessExit = { reason, timestampMs: 1_700_000_000_000, description: 'must not leave the adapter', trace: 'private' };
  expect(normalizeBackgroundStatus({ platform: 'android', previousProcessExit }).previousProcessExit)
    .toEqual({ reason, timestampMs: 1_700_000_000_000 });
});

it.each([null, 'memory', {}, { reason: 'battery', timestampMs: 1 }, { reason: 'memory', timestampMs: 0 },
  { reason: 'memory', timestampMs: -1 }, { reason: 'memory', timestampMs: 1.5 }, { reason: 'memory', timestampMs: '123' },
  { reason: 'memory', timestampMs: Number.NaN }, { reason: 'memory', timestampMs: Number.POSITIVE_INFINITY },
  { reason: 'memory', timestampMs: Number.MAX_SAFE_INTEGER }])('rejects malformed or future closure records: %s', (previousProcessExit) => {
  expect(normalizeBackgroundStatus({ platform: 'android', previousProcessExit }).previousProcessExit).toBeNull();
});

it('keeps old native/iOS closure observations unavailable and validates prepared state', () => {
  expect(normalizeBackgroundStatus({ platform: 'android' })).toMatchObject({ preparedSessionActive: null, previousProcessExit: null });
  expect(normalizeBackgroundStatus({ platform: 'ios', previousProcessExit: { reason: 'crash', timestampMs: 42 } }).previousProcessExit).toBeNull();
  expect(normalizeBackgroundStatus({ preparedSessionActive: 'true' }).preparedSessionActive).toBeNull();
  expect(normalizeBackgroundStatus({ preparedSessionActive: false }).preparedSessionActive).toBe(false);
});

afterEach(() => {
  jest.useRealTimers();
  setCriticalSessionActive(false);
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  if (originalVersion) Object.defineProperty(Platform, 'Version', originalVersion);
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

it('reports unknown readings separately from optimized, restricted, or denied readings', () => {
  const status = normalizeBackgroundStatus({ platform: 'android', checkedAtMonotonicMs: Number.NaN,
    batteryOptimizationIgnored: false, backgroundRestricted: true, powerSaveMode: 'false',
    notificationsEnabled: false, foregroundServiceActive: undefined });
  expect(status).toMatchObject({ platform: 'android', checkedAtMonotonicMs: null, batteryOptimizationIgnored: false,
    backgroundRestricted: true, powerSaveMode: null, notificationsEnabled: false, foregroundServiceActive: null });
  expect(() => normalizeBackgroundStatus(null)).toThrow('unavailable');
  expect(normalizeBackgroundStatus({ platform: 'web', checkedAtMonotonicMs: -1 }).platform).toBe('unsupported');
});

it('passes through read failure so the panel can offer a truthful retry', async () => {
  read.mockRejectedValueOnce(new Error('native read failed'));
  await expect(BackgroundReliability.read()).rejects.toThrow('native read failed');
});

it('normalizes standby and notification records without converting legacy or malformed readings to success', () => {
  for (const flag of [true, false, null]) {
    expect(normalizeBackgroundStatus({ appStandbyRestricted: flag, playbackNotificationPresent: flag }))
      .toMatchObject({ appStandbyRestricted: flag, playbackNotificationPresent: flag });
  }
  for (const flag of [undefined, 'false', 0, 1, {}]) {
    expect(normalizeBackgroundStatus({ appStandbyRestricted: flag, playbackNotificationPresent: flag }))
      .toMatchObject({ appStandbyRestricted: null, playbackNotificationPresent: null });
  }
});

it('validates device pressure without converting missing values into a full or cool battery', () => {
  expect(normalizeBackgroundStatus({ platform: 'android', batteryLevelPercent: 0, batteryCharging: false, thermalState: 'critical' }))
    .toMatchObject({ batteryLevelPercent: 0, batteryCharging: false, thermalState: 'critical' });
  for (const level of [-1, 101, Infinity, NaN, '20', null, undefined]) {
    expect(normalizeBackgroundStatus({ batteryLevelPercent: level }).batteryLevelPercent).toBeNull();
  }
  expect(normalizeBackgroundStatus({ batteryLevelPercent: 99.8, batteryCharging: 'false', thermalState: 'nominal' }))
    .toMatchObject({ batteryLevelPercent: 100, batteryCharging: null, thermalState: null });
  for (const thermalState of ['normal', 'warm', 'hot', 'critical'] as const) {
    expect(normalizeBackgroundStatus({ thermalState }).thermalState).toBe(thermalState);
  }
});

it('times out a stalled advisory read, allows retry and tolerates its late native response', async () => {
  jest.useFakeTimers();
  let finishOld!: (value: unknown) => void;
  read.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
  const staleRead = BackgroundReliability.read();
  const timedOut = expect(staleRead).rejects.toThrow('BACKGROUND_STATUS_TIMEOUT');
  await jest.advanceTimersByTimeAsync(5_000);
  await timedOut;
  expect(jest.getTimerCount()).toBe(0);
  read.mockResolvedValueOnce({ platform: 'android', batteryOptimizationIgnored: false });
  const fresh = await BackgroundReliability.read();
  expect(fresh.batteryOptimizationIgnored).toBe(false);
  finishOld({ platform: 'android', batteryOptimizationIgnored: true });
  await Promise.resolve();
  expect(fresh.batteryOptimizationIgnored).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
  expect(open).not.toHaveBeenCalled();
});

it('cleans advisory deadlines on success and rejection without keeping a timer alive', async () => {
  jest.useFakeTimers();
  read.mockResolvedValueOnce({ platform: 'android' }).mockRejectedValueOnce(new Error('Unavailable'));
  await BackgroundReliability.read();
  expect(jest.getTimerCount()).toBe(0);
  await expect(BackgroundReliability.read()).rejects.toThrow('Unavailable');
  expect(jest.getTimerCount()).toBe(0);
});

it('reports the actual settings fallback and does not infer a changed battery policy', async () => {
  open.mockResolvedValueOnce({ opened: true, openedTarget: 'app', usedFallback: true });
  await expect(BackgroundReliability.openSettings('battery')).resolves.toEqual({
    opened: true, requestedTarget: 'battery', openedTarget: 'app', usedFallback: true,
  });
  expect(read).not.toHaveBeenCalled();
  open.mockResolvedValueOnce({ opened: true, openedTarget: 'unknown', usedFallback: false });
  expect((await BackgroundReliability.openSettings('notifications')).opened).toBe(false);
  open.mockClear();
  await expect(BackgroundReliability.openSettings('unexpected' as never)).rejects.toThrow('Unsupported');
  expect(open).not.toHaveBeenCalled();
});

it('keeps reads available during a show but blocks settings and permission prompts at execution time', async () => {
  read.mockResolvedValueOnce({ platform: 'android', serviceRunning: true });
  setCriticalSessionActive(true);
  expect((await BackgroundReliability.read()).serviceRunning).toBe(true);
  await expect(BackgroundReliability.openSettings('battery')).rejects.toThrow('LIVE_SESSION_LOCKED');
  await expect(BackgroundReliability.requestNotifications()).rejects.toThrow('LIVE_SESSION_LOCKED');
  expect(open).not.toHaveBeenCalled();
});

it('requests notification permission only for an explicit action on Android 13 or newer', async () => {
  const request = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 35 });
  await expect(BackgroundReliability.requestNotifications()).resolves.toBe('denied');
  expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 32 });
  await expect(BackgroundReliability.requestNotifications()).resolves.toBe('granted');
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  await expect(BackgroundReliability.requestNotifications()).resolves.toBe('unavailable');
  expect(request).toHaveBeenCalledTimes(1);
});

it('holds preparation admission until the native permission prompt settles, including failure', async () => {
  let finish!: (value: typeof PermissionsAndroid.RESULTS.DENIED) => void;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 35 });
  jest.spyOn(PermissionsAndroid, 'request').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockRejectedValueOnce(new Error('Permission unavailable'));
  const pending = BackgroundReliability.requestNotifications();
  expect(isDeviceSettingsActionPending()).toBe(true);
  finish(PermissionsAndroid.RESULTS.DENIED);
  await expect(pending).resolves.toBe('denied');
  expect(isDeviceSettingsActionPending()).toBe(false);
  await expect(BackgroundReliability.requestNotifications()).rejects.toThrow('Permission unavailable');
  expect(isDeviceSettingsActionPending()).toBe(false);
});
