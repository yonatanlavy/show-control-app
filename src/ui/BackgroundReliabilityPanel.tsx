import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useFocusEffect } from 'expo-router'
import { AppState, Platform, StyleSheet, useWindowDimensions, View } from 'react-native'
import { font, size, space } from '../design'
import { useI18n, type MessageKey } from '../i18n'
import { BackgroundReliability, type BackgroundReliabilityStatus, type BackgroundSettingsTarget } from '../platform/background-reliability'
import { backgroundReadinessIssues, type BackgroundReadinessIssue } from '../platform/background-readiness'
import { isCriticalSessionActive } from '../runtime/critical-session-gate'
import { isDeviceSettingsActionPending, subscribeDeviceSettingsActions, withDeviceSettingsAction } from '../runtime/device-settings-action'
import { useApp } from './AppProvider'
import { AppText, Button, Disclosure, SectionCard, StatusBanner, Surface, uiStyles } from './primitives'
import { useCriticalSessionActive } from './use-critical-session-active'

type DeviceAction = BackgroundSettingsTarget | 'request'
const ADVISORY_REFRESH_MS = 30_000

/** Preparation-only guidance. Reads never certify survival or start playback. */
export function BackgroundReliabilityPanel({ compact = false }: { compact?: boolean } = {}) {
  const { t, locale } = useI18n()
  const viewport = useWindowDimensions()
  const stackAllRows = viewport.width < size.control * 7 || viewport.fontScale > font.scale.stageMax
  const { liveSession } = useApp()
  const criticalSession = useCriticalSessionActive()
  const critical = liveSession || criticalSession
  const settingsPending = useSyncExternalStore(subscribeDeviceSettingsActions, isDeviceSettingsActionPending, isDeviceSettingsActionPending)
  const [status, setStatus] = useState<BackgroundReliabilityStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [readFailed, setReadFailed] = useState(false)
  const [action, setAction] = useState<DeviceAction | null>(null)
  const [notice, setNotice] = useState<MessageKey | null>(null)
  const [actionFailed, setActionFailed] = useState(false)
  const [retryAction, setRetryAction] = useState<DeviceAction | null>(null)
  const [expanded, setExpanded] = useState(!compact)
  const mounted = useRef(true)
  const focused = useRef(false)
  const reading = useRef(0)
  const pendingRead = useRef<number | null>(null)
  const appActive = useRef(AppState.currentState === 'active')
  const activeAction = useRef<DeviceAction | null>(null)
  const settingsReturn = useRef<{ leftApp: boolean; finish: () => void } | null>(null)
  const refresh = useCallback(async (quiet = false) => {
    const eligible = () => mounted.current && focused.current && appActive.current &&
      !liveSession && !isCriticalSessionActive() && !isDeviceSettingsActionPending()
    if (!eligible()) return
    const request = ++reading.current
    pendingRead.current = request
    // Background observations are advisory. Keep controls and content stable
    // during periodic checks; a failed check must still remove stale reassurance.
    if (!quiet) { setLoading(true); setReadFailed(false); setStatus(null) }
    try {
      const next = await BackgroundReliability.read()
      if (eligible() && reading.current === request) { setStatus(next); setReadFailed(false) }
    } catch {
      if (eligible() && reading.current === request) { setStatus(null); setReadFailed(true) }
    } finally {
      if (pendingRead.current === request) pendingRead.current = null
      if (eligible() && reading.current === request) setLoading(false)
    }
  }, [liveSession])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; reading.current += 1; settingsReturn.current?.finish() }
  }, [])
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      appActive.current = state === 'active'
      if (!appActive.current) {
        reading.current += 1; pendingRead.current = null
        if (settingsReturn.current) settingsReturn.current.leftApp = true
        return
      }
      if (settingsReturn.current?.leftApp) settingsReturn.current.finish()
      // A settings lease releases after its actual async owner settles. Its
      // boolean observation below then performs one fresh eligible read.
      void refresh(true)
    })
    return () => subscription.remove()
  }, [refresh])
  useFocusEffect(useCallback(() => {
    focused.current = true
    let active = true
    const timer = !critical && !settingsPending ? setInterval(() => {
      if (pendingRead.current === null && activeAction.current === null) void refresh(true)
    }, ADVISORY_REFRESH_MS) : undefined
    if (!critical && !settingsPending) void Promise.resolve().then(() => { if (active) void refresh(true) })
    return () => {
      active = false; focused.current = false; reading.current += 1; pendingRead.current = null
      if (timer !== undefined) clearInterval(timer)
    }
  }, [critical, refresh, settingsPending]))

  const runAction = async (target: DeviceAction) => {
    if (!mounted.current || !focused.current || !appActive.current || activeAction.current || isDeviceSettingsActionPending()) return
    if (liveSession || isCriticalSessionActive()) { setNotice('background.critical'); setActionFailed(false); return }
    activeAction.current = target; setRetryAction(target)
    setAction(target); setNotice(null); setActionFailed(false)
    try {
      await withDeviceSettingsAction(async () => {
      if (!mounted.current) return
      if (target === 'request') {
        const result = await BackgroundReliability.requestNotifications()
        if (mounted.current) {
          setNotice(result === 'granted' ? null : result === 'denied' ? 'background.denied' : 'background.actionFailed')
          setActionFailed(result === 'unavailable')
        }
      } else {
        // Keep preparation blocked through the external Settings activity.
        // A deliberate recheck also handles windowed Settings without lifecycle events.
        let finishReturn!: () => void
        const returned = new Promise<void>((resolve) => { finishReturn = resolve })
        const waiting = { leftApp: false, finish: finishReturn }
        settingsReturn.current = waiting
        let result
        try {
          result = await BackgroundReliability.openSettings(target)
          if (result.opened && mounted.current) await returned
        } finally {
          if (settingsReturn.current === waiting) settingsReturn.current = null
          finishReturn()
        }
        if (mounted.current) {
          setNotice(!result.opened ? 'background.actionFailed' : result.usedFallback ? 'background.fallback' : 'background.opened')
          setActionFailed(!result.opened)
        }
        // Opening a page is not evidence that the user changed its setting.
        // Foreground return performs a new read, including fallback settings.
      }
      })
    } catch (error) {
      if (mounted.current) {
        const blocked = error instanceof Error && /LIVE_SESSION_LOCKED|BACKGROUND_SETTINGS_ARMED|REMOTE_SETUP_ARMED/.test(error.message)
        setNotice(blocked ? 'background.critical' : 'background.actionFailed'); setActionFailed(!blocked)
      }
    } finally { activeAction.current = null; if (mounted.current) setAction(null) }
  }
  const disabled = critical || settingsPending || action !== null
  const checking = loading && !critical && !settingsPending
  const ownSettingsWaiting = action !== null && action !== 'request'
  const android = status?.platform === 'android' || (!status && Platform.OS === 'android')
  const ios = status?.platform === 'ios' || (!status && Platform.OS === 'ios')
  const issues = status ? backgroundReadinessIssues(status) : []
  const standbyRestricted = status?.appStandbyRestricted === true && status.batteryOptimizationIgnored !== true
  const issueTitles: Record<BackgroundReadinessIssue, MessageKey> = {
    heat: status?.thermalState === 'critical' ? 'background.thermal.critical' : 'background.thermal.hot',
    lowBattery: 'background.lowBattery', restricted: standbyRestricted ? 'background.standbyRestricted' : 'background.restricted', battery: 'background.optimized',
    channel: 'background.channelBlocked', notifications: 'background.notificationHelp', powerSaver: 'background.power', unknown: 'background.notChecked',
    notificationMissing: 'background.notificationMissing',
    foregroundMissing: 'background.foregroundMissing',
    memory: 'background.lowMemory',
  }
  const value = (flag: boolean | null | undefined, positive: MessageKey = 'background.yes', negative: MessageKey = 'background.no') => t(flag === true ? positive : flag === false ? negative : 'background.unknown')
  const row = (label: MessageKey, body: string, longValue = false) => {
    const stacked = stackAllRows || longValue
    return <View key={label} style={stacked ? statusStyles.stacked : uiStyles.row} accessible accessibilityLabel={`${t(label)}: ${body}`}><AppText tone="caption" muted style={stacked ? undefined : uiStyles.grow}>{t(label)}</AppText><AppText tone="label" style={statusStyles.value}>{body}</AppText></View>
  }

  if (compact && !expanded) {
    const issue = issues[0]
    const summary: MessageKey = critical ? 'background.critical' : readFailed || !status ? 'background.notChecked' : issue ? issueTitles[issue] : 'background.checked'
    const repairs: Partial<Record<BackgroundReadinessIssue, { target: DeviceAction; label: MessageKey }>> = {
      restricted: { target: 'app', label: 'background.openApp' },
      battery: { target: 'battery', label: 'background.openBattery' },
      channel: { target: 'playbackChannel', label: 'background.openChannel' },
      notifications: status?.notificationPermissionGranted === false
        ? { target: 'request', label: 'background.requestNotifications' }
        : { target: 'notifications', label: 'background.openNotifications' },
      notificationMissing: { target: 'notifications', label: 'background.openNotifications' },
      ...(android ? { powerSaver: { target: 'powerSaver' as const, label: 'background.openPower' as const } } : {}),
    }
    const repair = issues.map((candidate) => repairs[candidate]).find((candidate) => candidate !== undefined)
    return <SectionCard title={t('background.title')} icon="shield">
      {checking ? <StatusBanner title={t('background.checking')} loading /> : <StatusBanner title={t(summary)} body={t(readFailed ? 'background.readFailed' : 'background.body')} tone={readFailed || issues.length ? 'warning' : 'neutral'} />}
      {!loading ? issues.slice(1).map((remaining) => <AppText key={remaining} tone="caption">{`• ${t(issueTitles[remaining])}`}</AppText>) : null}
      {!loading && !readFailed && repair ? <Button label={t(repair.label)} disabled={disabled} onPress={() => { if (!mounted.current) return; setExpanded(true); void runAction(repair.target) }} /> : null}
      <Button label={t('background.reviewProtection')} onPress={() => setExpanded(true)} />
    </SectionCard>
  }

  return <SectionCard title={t('background.title')} caption={t('background.body')} icon="shield">
    <AppText tone="caption" muted>{t('background.protectionSummary')}</AppText>
    {checking ? <StatusBanner title={t('background.checking')} loading /> : null}
    {readFailed ? <StatusBanner title={t('common.error')} body={t('background.readFailed')} tone="warning"><Button label={t('common.retry')} disabled={critical || settingsPending} onPress={() => { void refresh() }} /></StatusBanner> : null}
    {issues.includes('unknown') ? <StatusBanner title={t('background.notChecked')} body={t('background.incompleteHelp')} tone="warning" /> : null}
    {issues.includes('foregroundMissing') ? <StatusBanner title={t('background.foregroundMissing')} body={t('background.foregroundMissingHelp')} tone="warning" /> : null}
    {issues.includes('memory') ? <StatusBanner title={t('background.lowMemory')} body={t('background.lowMemoryHelp')} tone="warning" /> : null}
    {issues.includes('heat') ? <StatusBanner title={t(issueTitles.heat)} body={t('background.heatHelp')} tone="warning" /> : null}
    {issues.includes('lowBattery') ? <StatusBanner title={t('background.lowBattery')} body={t('background.lowBatteryHelp')} tone="warning" /> : null}
    {status?.platform === 'android' && (status.backgroundRestricted === true || standbyRestricted) ? <StatusBanner title={t(issueTitles.restricted)} body={t('background.restrictedHelp')} tone="warning"><DeviceSettingsButton target="app" label={t('background.openApp')} disabled={disabled} loading={action === 'app'} onSelect={runAction} /></StatusBanner> : null}
    {status?.platform === 'android' && status.batteryOptimizationIgnored === false ? <StatusBanner title={t('background.optimized')} body={t('background.batteryHelp')} tone="warning"><DeviceSettingsButton target="battery" label={t('background.openBattery')} disabled={disabled} loading={action === 'battery'} onSelect={runAction} /></StatusBanner> : null}
    {status?.powerSaveMode === true ? <StatusBanner title={t('background.power')} body={t('background.powerHelp')} tone="warning">{android ? <DeviceSettingsButton target="powerSaver" label={t('background.openPower')} disabled={disabled} loading={action === 'powerSaver'} onSelect={runAction} /> : null}</StatusBanner> : null}
    {status?.platform === 'android' && status.playbackChannelBlocked === true ? <StatusBanner title={t('background.channelBlocked')} body={t('background.channelHelp')} tone="warning"><DeviceSettingsButton target="playbackChannel" label={t('background.openChannel')} disabled={disabled} loading={action === 'playbackChannel'} onSelect={runAction} /></StatusBanner> : null}
    {status?.platform === 'android' && (status.notificationsEnabled === false || status.notificationPermissionGranted === false) ? <StatusBanner title={t('background.notificationHelp')} body={t('background.mediaExempt')}><DeviceSettingsButton target="notifications" label={t('background.openNotifications')} disabled={disabled} loading={action === 'notifications'} onSelect={runAction} />{status.notificationPermissionGranted === false ? <Button label={t('background.requestNotifications')} disabled={disabled} state={action === 'request' ? 'loading' : 'idle'} onPress={() => { void runAction('request') }} /> : null}</StatusBanner> : null}
    {issues.includes('notificationMissing') ? <StatusBanner title={t('background.notificationMissing')} body={t('background.notificationRecordHelp')} tone="warning">{/* The blocked-notifications banner above already offers this exact repair; show it once. */}{status?.platform === 'android' && (status.notificationsEnabled === false || status.notificationPermissionGranted === false) ? null : <DeviceSettingsButton target="notifications" label={t('background.openNotifications')} disabled={disabled} loading={action === 'notifications'} onSelect={runAction} />}</StatusBanner> : null}
    {status ? <Surface raised>
      {row('background.batteryLevel', status.batteryLevelPercent === null ? t('background.unknown') : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(status.batteryLevelPercent / 100))}
      {row('background.charging', value(status.batteryCharging))}
      {row('background.thermal', t(status.thermalState === null ? 'background.unknown' : `background.thermal.${status.thermalState}`))}
      {status.platform === 'android' ? <>
        {row('background.battery', value(status.batteryOptimizationIgnored, 'background.exempt', 'background.optimized'), true)}
        {row('background.restricted', value(status.backgroundRestricted))}
        {row('background.standbyRestricted', value(status.appStandbyRestricted))}
      </> : null}
      {row('background.power', value(status.powerSaveMode, 'background.on', 'background.off'))}
      {status.platform === 'android' ? <>
        {row('background.notification', value(status.notificationPermissionGranted))}
        {row('background.appNotifications', value(status.notificationsEnabled))}
        {row('background.channel', t(status.playbackChannelCreated === false ? 'background.channelAbsent' : status.playbackChannelBlocked === true ? 'background.channelBlocked' : status.playbackChannelCreated === true && status.playbackChannelBlocked === false ? 'background.channelReady' : 'background.unknown'), true)}
        {row('background.service', value(status.serviceRunning))}
        {row('background.foreground', value(status.foregroundServiceActive))}
        {row('background.notificationRecord', value(status.playbackNotificationPresent))}
        {!issues.includes('notificationMissing') ? <AppText tone="caption" muted>{t('background.notificationRecordHelp')}</AppText> : null}
        {status.serviceRunning === false ? <AppText tone="caption" muted>{t('background.serviceIdle')}</AppText> : null}
      </> : status.platform === 'ios' ? row('background.iosAudio', value(status.backgroundAudioConfigured)) : null}
    </Surface> : null}
    {android && status?.notificationsEnabled !== false && status?.notificationPermissionGranted !== false ? <AppText tone="caption" muted>{t('background.mediaExempt')}</AppText> : ios ? <AppText tone="caption" muted>{t('background.iosHelp')}</AppText> : null}
    {ownSettingsWaiting || settingsPending && action === null ? <AppText tone="caption" accessibilityLiveRegion="polite">{t('background.settingsWaiting')}</AppText> : null}
    {notice ? <StatusBanner title={t(actionFailed ? 'common.error' : 'background.title')} body={t(notice)} tone={actionFailed ? 'warning' : 'neutral'}>{actionFailed && retryAction ? <Button label={t('common.retry')} disabled={disabled} onPress={() => { void runAction(retryAction) }} /> : null}</StatusBanner> : null}
    {critical && notice !== 'background.critical' ? <AppText tone="caption" accessibilityLiveRegion="polite">{t('background.critical')}</AppText> : null}
    <View style={uiStyles.gap}>
      <Button label={t('background.refresh')} disabled={critical || (settingsPending ? !ownSettingsWaiting : loading)} onPress={() => {
        if (!mounted.current || !focused.current || !appActive.current || liveSession || isCriticalSessionActive()) return
        settingsReturn.current?.finish(); void refresh()
      }} />
      {android && status?.batteryOptimizationIgnored !== false ? <DeviceSettingsButton target="battery" label={t('background.openBattery')} disabled={disabled} loading={action === 'battery'} onSelect={runAction} /> : ios ? <DeviceSettingsButton target="app" label={t('background.openApp')} disabled={disabled} loading={action === 'app'} onSelect={runAction} /> : null}
    </View>
    <Disclosure title={t('background.help')}>
      <AppText tone="caption" muted>{t('background.helpBody')}</AppText>
      {android ? <>
        <AppText tone="label">{t('background.checklistTitle')}</AppText>
        <AppText tone="caption" muted>{t('background.checklistBody')}</AppText>
        <AppText tone="caption" muted>{t('background.batteryHelp')}</AppText>
        <AppText tone="caption" muted>{t('background.manufacturerHelp')}</AppText>
        <DeviceSettingsButton target="app" label={t('background.openApp')} disabled={disabled} loading={action === 'app'} onSelect={runAction} />
        {status?.powerSaveMode !== true ? <DeviceSettingsButton target="powerSaver" label={t('background.openPower')} disabled={disabled} loading={action === 'powerSaver'} onSelect={runAction} /> : null}
        <DeviceSettingsButton target="playbackChannel" label={t('background.openChannel')} disabled={disabled} loading={action === 'playbackChannel'} onSelect={runAction} />
        <DeviceSettingsButton target="notifications" label={t('background.openNotifications')} disabled={disabled} loading={action === 'notifications'} onSelect={runAction} />
        {status?.notificationPermissionGranted === null ? <Button label={t('background.requestNotifications')} disabled={disabled} state={action === 'request' ? 'loading' : 'idle'} onPress={() => { void runAction('request') }} /> : null}
      </> : null}
    </Disclosure>
    {status?.platform === 'android' && status.previousProcessExit ? <Disclosure title={t('background.previousExit')}>
      {row('background.exitReason', t(`background.exit.${status.previousProcessExit.reason}`), true)}
      {row('background.exitWhen', new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(status.previousProcessExit.timestampMs), true)}
      <AppText tone="caption" muted>{t('background.exitHelp')}</AppText>
    </Disclosure> : null}
    {compact ? <Button label={t('background.hideDetails')} variant="ghost" disabled={action !== null} onPress={() => setExpanded(false)} /> : null}
  </SectionCard>
}

function DeviceSettingsButton({ target, label, disabled, loading, onSelect }: { target: BackgroundSettingsTarget; label: string; disabled: boolean; loading: boolean; onSelect: (target: DeviceAction) => Promise<void> }) {
  return <Button label={label} disabled={disabled} state={loading ? 'loading' : 'idle'} onPress={() => { void onSelect(target) }} />
}

const statusStyles = StyleSheet.create({
  stacked: { flexDirection: 'column', alignItems: 'stretch', gap: space.xxs },
  value: { flexShrink: 1 },
})
