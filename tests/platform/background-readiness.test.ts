import { backgroundReadinessIssues } from '../../src/platform/background-readiness'
import { normalizeBackgroundStatus } from '../../src/platform/background-reliability'

const android = { platform: 'android', batteryOptimizationIgnored: true, backgroundRestricted: false, appStandbyRestricted: false, powerSaveMode: false, notificationPermissionGranted: true, notificationsEnabled: true, playbackChannelCreated: true, playbackChannelBlocked: false }

it.each([true, false, null, undefined])('warns only for an observed current low-memory flag: %s', (systemLowMemory) => {
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, systemLowMemory })))
    .toEqual(systemLowMemory === true ? ['memory'] : []);
});

it('keeps memory pressure alongside all independent protection issues and recovery', () => {
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, systemLowMemory: true,
    thermalState: 'critical', batteryLevelPercent: 5, batteryCharging: false, preparedSessionActive: true,
    serviceRunning: false, foregroundServiceActive: false, backgroundRestricted: true,
    playbackChannelBlocked: true, notificationPermissionGranted: false, powerSaveMode: true })))
    .toEqual(['heat', 'lowBattery', 'foregroundMissing', 'memory', 'restricted', 'channel', 'notifications', 'powerSaver']);
});

it('does not turn a previous memory exit or another platform into current pressure', () => {
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, previousProcessExit: { reason: 'memory', timestampMs: 42 } }))).toEqual([]);
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ platform: 'ios', systemLowMemory: true, powerSaveMode: false, backgroundAudioConfigured: true }))).toEqual([]);
});

it.each([
  [true, true, false, ['foregroundMissing']],
  [true, false, true, ['foregroundMissing']],
  [true, false, false, ['foregroundMissing']],
  [true, true, null, ['unknown']],
  [true, null, true, ['unknown']],
  [false, true, false, []], // Silent remote testing owns a service without a prepared show.
  [false, false, false, []],
  [null, true, false, []], // Older native builds cannot establish a prepared show.
] as const)('checks prepared=%s, service=%s, foreground=%s independently', (preparedSessionActive, serviceRunning, foregroundServiceActive, expected) => {
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, preparedSessionActive, serviceRunning,
    foregroundServiceActive, playbackNotificationPresent: true }))).toEqual(expected)
})

it('retains protection loss alongside battery restrictions and notification denial', () => {
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, preparedSessionActive: true, serviceRunning: true,
    foregroundServiceActive: false, batteryOptimizationIgnored: false, notificationPermissionGranted: false })))
    .toEqual(['foregroundMissing', 'battery', 'notifications'])
})

it('honors Doze exemption for standby only and does not conceal explicit restrictions or unavailable readings', () => {
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, appStandbyRestricted: true, batteryOptimizationIgnored: false }))).toEqual(['restricted'])
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, appStandbyRestricted: true }))).toEqual([])
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, appStandbyRestricted: null }))).toEqual([])
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, backgroundRestricted: true, appStandbyRestricted: true, batteryOptimizationIgnored: false }))).toEqual(['restricted'])
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, appStandbyRestricted: null, batteryOptimizationIgnored: false }))).toEqual(['battery', 'unknown'])
})

it.each([
  [false, false, []], [false, null, []], [true, true, []],
  [true, false, ['notificationMissing']], [true, null, ['unknown']],
] as const)('separates foreground ownership %s from notification record %s', (foregroundServiceActive, playbackNotificationPresent, expected) => {
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, foregroundServiceActive, playbackNotificationPresent }))).toEqual(expected)
})

it.each([
  [{ notificationPermissionGranted: false }, ['notifications']],
  [{ notificationsEnabled: false }, ['notifications']],
  [{ playbackChannelBlocked: true }, ['channel']],
  [{ batteryOptimizationIgnored: false }, ['battery', 'notificationMissing']],
  [{ appStandbyRestricted: true, powerSaveMode: true, batteryOptimizationIgnored: false }, ['restricted', 'notificationMissing', 'powerSaver']],
] as const)('retains independent issues without duplicating an explained missing notice: %s', (changes, expected) => {
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, foregroundServiceActive: true, playbackNotificationPresent: false, ...changes }))).toEqual(expected)
})

it('reports combined problems and prioritizes restricted background execution over its duplicate battery advisory', () => {
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, backgroundRestricted: true, batteryOptimizationIgnored: false, powerSaveMode: true, notificationPermissionGranted: false, playbackChannelBlocked: true }))).toEqual(['restricted', 'channel', 'notifications', 'powerSaver'])
})
it('distinguishes Doze optimization from unknown battery settings and a not-yet-created notification channel', () => {
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, batteryOptimizationIgnored: false }))).toEqual(['battery'])
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, playbackChannelCreated: false, playbackChannelBlocked: null }))).toEqual([])
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, batteryOptimizationIgnored: 'true' }))).toEqual(['unknown'])
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, playbackChannelBlocked: null }))).toEqual(['unknown'])
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, backgroundRestricted: null }))).toEqual(['unknown'])
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, powerSaveMode: null }))).toEqual(['unknown'])
})
it('does not report notification access or battery-exemption success from an iOS/unsupported reading', () => {
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ platform: 'ios', backgroundAudioConfigured: true, powerSaveMode: false }))).toEqual([])
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ platform: 'ios', backgroundAudioConfigured: null, powerSaveMode: true }))).toEqual(['powerSaver', 'unknown'])
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ platform: 'unsupported' }))).toEqual(['unknown'])
})

it.each(['android', 'ios'])('warns on low battery and heat independently of background settings on %s', (platform) => {
  const status = { ...android, platform, backgroundAudioConfigured: true }
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...status, batteryLevelPercent: 20, batteryCharging: false, thermalState: 'hot' }))).toEqual(['heat', 'lowBattery'])
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...status, batteryLevelPercent: 20, batteryCharging: true, thermalState: 'critical' }))).toEqual(['heat'])
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...status, batteryLevelPercent: 21, batteryCharging: false, thermalState: 'warm' }))).toEqual([])
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...status, batteryLevelPercent: 0, batteryCharging: null }))).toEqual(['lowBattery'])
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...status, batteryLevelPercent: null, thermalState: null }))).toEqual([])
})

it('retains every actionable issue when pressure, restrictions and notification denial coincide', () => {
  expect(backgroundReadinessIssues(normalizeBackgroundStatus({ ...android, batteryLevelPercent: 5, batteryCharging: false,
    thermalState: 'critical', batteryOptimizationIgnored: false, backgroundRestricted: true, playbackChannelBlocked: true,
    notificationPermissionGranted: false, powerSaveMode: true }))).toEqual(['heat', 'lowBattery', 'restricted', 'channel', 'notifications', 'powerSaver'])
})
