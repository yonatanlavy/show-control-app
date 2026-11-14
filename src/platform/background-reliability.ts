import { PermissionsAndroid, Platform } from 'react-native';
import ShowAudio from '../../modules/show-audio';
import { isCriticalSessionActive } from '../runtime/critical-session-gate';
import { withDeviceSettingsAction } from '../runtime/device-settings-action';

export type BackgroundSettingsTarget = 'battery' | 'app' | 'notifications' | 'playbackChannel' | 'powerSaver';
export type DeviceThermalState = 'normal' | 'warm' | 'hot' | 'critical';
export type PreviousProcessExitReason = 'memory' | 'resources' | 'crash' | 'unresponsive' | 'user' | 'normal' | 'system' | 'unknown';
export interface PreviousProcessExit {
  readonly reason: PreviousProcessExitReason;
  readonly timestampMs: number;
}

export interface BackgroundReliabilityStatus {
  readonly platform: 'android' | 'ios' | 'unsupported';
  readonly checkedAtMonotonicMs: number | null;
  readonly batteryOptimizationIgnored: boolean | null;
  readonly backgroundRestricted: boolean | null;
  readonly appStandbyRestricted: boolean | null;
  readonly powerSaveMode: boolean | null;
  readonly batteryLevelPercent: number | null;
  readonly batteryCharging: boolean | null;
  readonly thermalState: DeviceThermalState | null;
  /** Android's current system flag; unavailable is not a prediction or success. */
  readonly systemLowMemory: boolean | null;
  readonly notificationPermissionGranted: boolean | null;
  readonly notificationsEnabled: boolean | null;
  readonly playbackChannelCreated: boolean | null;
  readonly playbackChannelBlocked: boolean | null;
  readonly serviceRunning: boolean | null;
  readonly preparedSessionActive: boolean | null;
  readonly foregroundServiceActive: boolean | null;
  readonly previousProcessExit: PreviousProcessExit | null;
  /** An active OS record, not proof that the shade/lock screen displays it. */
  readonly playbackNotificationPresent: boolean | null;
  readonly backgroundAudioConfigured: boolean | null;
}

export interface SettingsOpenResult {
  readonly opened: boolean;
  readonly requestedTarget: BackgroundSettingsTarget;
  readonly openedTarget: BackgroundSettingsTarget | null;
  readonly usedFallback: boolean;
}

const targets = new Set<BackgroundSettingsTarget>(['battery', 'app', 'notifications', 'playbackChannel', 'powerSaver']);
const booleanOrUnknown = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;
const STATUS_READ_TIMEOUT_MS = 5_000;
const exitReasons = new Set<PreviousProcessExitReason>(['memory', 'resources', 'crash', 'unresponsive', 'user', 'normal', 'system', 'unknown']);
function normalizePreviousExit(value: unknown): PreviousProcessExit | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!exitReasons.has(raw.reason as PreviousProcessExitReason) || typeof raw.timestampMs !== 'number' || !Number.isSafeInteger(raw.timestampMs) || raw.timestampMs <= 0 || raw.timestampMs > Date.now()) return null;
  return { reason: raw.reason as PreviousProcessExitReason, timestampMs: raw.timestampMs };
}
function idleOnly(): void {
  if (isCriticalSessionActive()) throw new Error('LIVE_SESSION_LOCKED: Exit the show before changing system settings.');
}

/** Never turn an unavailable platform reading into a reassuring success. */
export function normalizeBackgroundStatus(value: unknown): BackgroundReliabilityStatus {
  if (!value || typeof value !== 'object') throw new Error('Background status is unavailable.');
  const raw = value as Record<string, unknown>;
  return {
    platform: raw.platform === 'android' || raw.platform === 'ios' ? raw.platform : 'unsupported',
    checkedAtMonotonicMs: typeof raw.checkedAtMonotonicMs === 'number' && Number.isFinite(raw.checkedAtMonotonicMs) && raw.checkedAtMonotonicMs >= 0 ? raw.checkedAtMonotonicMs : null,
    batteryOptimizationIgnored: booleanOrUnknown(raw.batteryOptimizationIgnored),
    backgroundRestricted: booleanOrUnknown(raw.backgroundRestricted),
    appStandbyRestricted: booleanOrUnknown(raw.appStandbyRestricted),
    powerSaveMode: booleanOrUnknown(raw.powerSaveMode),
    batteryLevelPercent: typeof raw.batteryLevelPercent === 'number' && Number.isFinite(raw.batteryLevelPercent) && raw.batteryLevelPercent >= 0 && raw.batteryLevelPercent <= 100 ? Math.round(raw.batteryLevelPercent) : null,
    batteryCharging: booleanOrUnknown(raw.batteryCharging),
    thermalState: raw.thermalState === 'normal' || raw.thermalState === 'warm' || raw.thermalState === 'hot' || raw.thermalState === 'critical' ? raw.thermalState : null,
    systemLowMemory: raw.platform === 'android' ? booleanOrUnknown(raw.systemLowMemory) : null,
    notificationPermissionGranted: booleanOrUnknown(raw.notificationPermissionGranted),
    notificationsEnabled: booleanOrUnknown(raw.notificationsEnabled),
    playbackChannelCreated: booleanOrUnknown(raw.playbackChannelCreated),
    playbackChannelBlocked: booleanOrUnknown(raw.playbackChannelBlocked),
    serviceRunning: booleanOrUnknown(raw.serviceRunning),
    preparedSessionActive: booleanOrUnknown(raw.preparedSessionActive),
    foregroundServiceActive: booleanOrUnknown(raw.foregroundServiceActive),
    previousProcessExit: raw.platform === 'android' ? normalizePreviousExit(raw.previousProcessExit) : null,
    playbackNotificationPresent: booleanOrUnknown(raw.playbackNotificationPresent),
    backgroundAudioConfigured: booleanOrUnknown(raw.backgroundAudioConfigured),
  };
}

export const BackgroundReliability = {
  async read(): Promise<BackgroundReliabilityStatus> {
    // Advisory reads must remain retryable if the native queue is unavailable.
    // This deadline never cancels native work or applies to playback commands.
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const raw = await Promise.race([
        ShowAudio.getBackgroundReliability(),
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(() => reject(new Error('BACKGROUND_STATUS_TIMEOUT: Device settings could not be checked.')), STATUS_READ_TIMEOUT_MS);
        }),
      ]);
      return normalizeBackgroundStatus(raw);
    } finally {
      if (deadline !== undefined) clearTimeout(deadline);
    }
  },
  async openSettings(target: BackgroundSettingsTarget): Promise<SettingsOpenResult> {
    return withDeviceSettingsAction(async () => {
    idleOnly();
    if (!targets.has(target)) throw new Error('Unsupported system settings target.');
    const raw = await ShowAudio.openBackgroundSettings(target);
    const openedTarget = targets.has(raw.openedTarget as BackgroundSettingsTarget) ? raw.openedTarget as BackgroundSettingsTarget : null;
    return {
      opened: raw.opened === true && openedTarget !== null,
      requestedTarget: target,
      openedTarget,
      usedFallback: raw.usedFallback === true,
    };
    });
  },
  async requestNotifications(): Promise<'granted' | 'denied' | 'unavailable'> {
    return withDeviceSettingsAction(async () => {
    idleOnly();
    if (Platform.OS !== 'android') return 'unavailable';
    const version = Number(Platform.Version);
    if (!Number.isFinite(version) || version < 24) return 'unavailable';
    if (version < 33) return 'granted';
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    return result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
    });
  },
};
