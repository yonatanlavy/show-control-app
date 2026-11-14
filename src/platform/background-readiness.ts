import type { BackgroundReliabilityStatus } from './background-reliability'

export type BackgroundReadinessIssue = 'restricted' | 'battery' | 'powerSaver' | 'channel' | 'notifications' | 'notificationMissing' | 'foregroundMissing' | 'unknown' | 'lowBattery' | 'heat' | 'memory'

/** Advisory observations, never a certificate that an OS will retain the app. */
export function backgroundReadinessIssues(status: BackgroundReliabilityStatus): readonly BackgroundReadinessIssue[] {
  const issues: BackgroundReadinessIssue[] = []
  if (status.thermalState === 'hot' || status.thermalState === 'critical') issues.push('heat')
  if (status.batteryLevelPercent !== null && status.batteryLevelPercent <= 20 && status.batteryCharging !== true) issues.push('lowBattery')
  if (status.platform === 'android') {
    if (status.preparedSessionActive === true && (status.foregroundServiceActive === false || status.serviceRunning === false)) issues.push('foregroundMissing')
    if (status.systemLowMemory === true) issues.push('memory')
    if (status.backgroundRestricted === true || status.appStandbyRestricted === true && status.batteryOptimizationIgnored !== true) issues.push('restricted')
    else if (status.batteryOptimizationIgnored === false) issues.push('battery')
    if (status.playbackChannelBlocked === true) issues.push('channel')
    if (status.notificationPermissionGranted === false || status.notificationsEnabled === false) issues.push('notifications')
    else if (status.foregroundServiceActive === true && status.playbackNotificationPresent === false && status.playbackChannelBlocked !== true) issues.push('notificationMissing')
  }
  if (status.powerSaveMode === true) issues.push('powerSaver')
  if (status.platform === 'unsupported' || status.powerSaveMode === null ||
    status.platform === 'android' && (status.batteryOptimizationIgnored === null || status.backgroundRestricted === null || status.appStandbyRestricted === null && status.batteryOptimizationIgnored !== true ||
      status.notificationPermissionGranted === null || status.notificationsEnabled === null ||
      status.foregroundServiceActive === true && status.playbackNotificationPresent === null ||
      status.preparedSessionActive === true && (status.foregroundServiceActive === null || status.serviceRunning === null) ||
      status.playbackChannelCreated !== false && status.playbackChannelBlocked === null) ||
    status.platform === 'ios' && status.backgroundAudioConfigured !== true) issues.push('unknown')
  return issues
}
