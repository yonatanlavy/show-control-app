import { useEffect, useRef, useState } from 'react'
import { Alert, AppState, StyleSheet, View } from 'react-native'
import ShowVisual, { type VisualStatus } from '../../modules/show-visual'
import { radius, size, space, useThemeColors } from '../design'
import { useI18n } from '../i18n'
import { isCriticalSessionActive } from '../runtime'
import { useApp } from './AppProvider'
import { OperationStatus } from './library-screens'
import { useMounted } from './navigation'
import { AppShell, AppText, Badge, Button, CoverTile, Disclosure, SectionCard, SectionHeader, StatusBanner, Surface, SwitchRow, uiStyles } from './primitives'

/** Original static, direction-neutral physical layout; it contains no private show data. */
function AudienceDiagram() {
  const colors = useThemeColors(); const { t } = useI18n()
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.diagram}>
    <View style={[styles.screen, { backgroundColor: colors.canvas, borderColor: colors.borderStrong }]}><View style={[styles.screenInside, { borderColor: colors.accentSurface }]}><AppText tone="display" style={{ color: colors.accent }}>♪</AppText><AppText tone="caption">{t('audience.screen')}</AppText></View></View>
    <View style={[styles.stand, { backgroundColor: colors.borderStrong }]} />
    <View style={styles.physicalRow}><View style={[styles.phone, { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong }]}><View style={[styles.phoneSlot, { backgroundColor: colors.borderStrong }]} /><View style={[styles.privateControl, { backgroundColor: colors.accentSurface }]}><AppText tone="caption" style={{ color: colors.accent }}>GO</AppText></View></View><View style={[styles.cable, { backgroundColor: colors.borderStrong }]} /><AppText tone="caption" muted>{t('audience.phone')}</AppText></View>
  </View>
}

export function AudienceDisplayPanel() {
  const { t } = useI18n(); const mounted = useMounted()
  const { show, library, libraryState, runTask, busy, liveSession, session } = useApp()
  const [status, setStatus] = useState<VisualStatus | null>(null); const [failed, setFailed] = useState(false); const [working, setWorking] = useState(false)
  const pending = useRef(false); const statusVersion = useRef(0); const patternOwned = useRef(false)
  const critical = liveSession || Boolean(session?.snapshot) || isCriticalSessionActive()
  const disabled = busy || working || critical
  const fallback = show?.fallbackVisualAssetId ? show.visualAssets?.[show.fallbackVisualAssetId] : undefined
  const accept = (value: VisualStatus) => { statusVersion.current += 1; if (mounted.current) setStatus(value) }
  const refresh = async () => { const captured = statusVersion.current; const value = await ShowVisual.getStatus(); if (mounted.current && captured === statusVersion.current) setStatus(value) }

  useEffect(() => {
    let active = true; const captured = statusVersion.current
    void ShowVisual.getStatus().then((value) => { if (active && captured === statusVersion.current) setStatus(value) }).catch(() => { if (active) setFailed(true) })
    const subscription = ShowVisual.subscribe((value) => { if (active) { statusVersion.current += 1; setStatus(value) } })
    return () => { active = false; subscription.remove() }
  }, [])
  useEffect(() => {
    const end = () => { if (patternOwned.current) { patternOwned.current = false; void ShowVisual.endTestPattern().catch(() => undefined) } }
    const lifecycle = AppState.addEventListener('change', (state) => { if (state !== 'active') end() })
    return () => { lifecycle.remove(); end() }
  }, [show?.id])
  const task = (work: () => Promise<unknown>, safety = false) => {
    if (safety) { void runTask(work, { silent: true }).then((ok) => { if (mounted.current && !ok) setFailed(true) }); return }
    if (pending.current || disabled || isCriticalSessionActive()) return
    pending.current = true; setWorking(true); setFailed(false)
    void runTask(work, { silent: true }).then((ok) => { if (mounted.current && !ok) setFailed(true) }).finally(() => { pending.current = false; if (mounted.current) setWorking(false) })
  }
  const configure = async (enabled: boolean) => {
    const before = await ShowVisual.getStatus()
    const next = await ShowVisual.configure({ enabled, ...(fallback?.localUri ? { fallbackUri: fallback.localUri } : {}) })
    if (!next.available) throw new Error('VISUAL_UNAVAILABLE')
    try { await library.updateSettings({ externalDisplayEnabled: enabled }) }
    catch (error) { accept(await ShowVisual.configure({ enabled: before.enabled, ...(fallback?.localUri ? { fallbackUri: fallback.localUri } : {}) })); throw error }
    accept(next)
  }
  const replace = () => task(async () => {
    if (!show) return
    const image = await library.importVisual(show.id, undefined, undefined, true)
    if (!image) return
    const latest = library.getSnapshot().shows.find((candidate) => candidate.id === show.id)
    if (!latest || image.kind !== 'image') throw new Error('STALE_REVISION')
    await library.saveShow({ ...latest, fallbackVisualAssetId: image.id })
  })
  const remove = () => {
    if (!show || disabled || isCriticalSessionActive()) return
    const capturedId = show.fallbackVisualAssetId
    Alert.alert(t('audience.remove'), t('audience.removeHelp'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => task(async () => {
        const latest = library.getSnapshot().shows.find((candidate) => candidate.id === show.id)
        if (!latest || latest.fallbackVisualAssetId !== capturedId) throw new Error('STALE_REVISION')
        const { fallbackVisualAssetId: removed, ...rest } = latest; void removed
        await library.saveShow(rest)
      }) },
    ])
  }
  // A rejected first status read is not "still loading"; say it is unavailable beside the error banner.
  const stateLabel = !status ? failed ? 'state.unavailable' : 'common.loading' : !status.available ? 'state.unavailable' : status.testing ? 'audience.testRunning' : status.connected ? 'audience.connected' : status.displayDetected ? status.enabled ? 'audience.waiting' : 'audience.detected' : 'audience.notDetected'

  return <AppShell current="/more" navigationRoute="/audience-display">
    <SectionHeader title={t('visual.title')} subtitle={t('visual.private')} /><OperationStatus />
    <Surface><Badge label={t(stateLabel)} tone={status?.connected ? 'success' : 'neutral'} /><AppText tone="caption" muted>{t('audience.hero')}</AppText></Surface>
    {critical ? <StatusBanner title={t('visual.title')} body={t('audience.armed')} tone="warning" /> : null}
    {failed || status?.errorCode ? <StatusBanner title={t('common.error')} body={t('audience.errorHelp')} tone="warning"><Button label={t('common.retry')} disabled={disabled} onPress={() => task(async () => { if (status?.enabled) await configure(true); await refresh() })} /></StatusBanner> : null}
    <Surface>
      <SwitchRow title={t('visual.enable')} body={t('audience.enableHelp')} value={status?.enabled ?? libraryState.settings.externalDisplayEnabled} disabled={disabled || !status?.available} onValueChange={(enabled) => task(() => configure(enabled))} />
      <Button label={t('audience.refresh')} disabled={disabled} onPress={() => task(refresh)} />
      <AppText tone="caption" muted>{t('audience.testHelp')}</AppText>
      {status?.available && !status.connected ? <AppText tone="caption" muted>{t(!status.displayDetected ? 'use.display.connectFirst' : !status.enabled ? 'use.display.enableFirst' : 'audience.waiting')}</AppText> : null}
      {status?.testing ? <Button label={t('audience.endTest')} onPress={() => task(async () => { patternOwned.current = false; await ShowVisual.endTestPattern(); await refresh() }, true)} /> : <Button label={t('audience.test')} variant="primary" disabled={disabled || !status?.connected || !status.enabled} onPress={() => task(async () => { patternOwned.current = true; const value = await ShowVisual.testPattern({ title: t('audience.testTitle'), caption: t('audience.testCaption') }); if (!mounted.current || !patternOwned.current) await ShowVisual.endTestPattern(); else accept(value) })} />}
      <Button label={t('visual.blackout')} variant="danger" disabled={!status?.available} onPress={() => task(async () => { patternOwned.current = false; await ShowVisual.blackout(); await refresh() }, true)} />
    </Surface>
    <SectionCard icon="music" title={t('visual.fallback')} caption={t('audience.fallbackHelp')}>
      <View style={uiStyles.row}><CoverTile title={show?.name ?? t('visual.fallback')} uri={fallback?.kind === 'image' ? fallback.localUri : undefined} large /><View style={uiStyles.grow}><AppText tone="label">{fallback ? t('visual.fallback') : t('audience.noFallback')}</AppText>{fallback ? <AppText tone="caption" muted>{fallback.width} × {fallback.height}</AppText> : null}</View></View>
      <View style={uiStyles.wrap}><Button label={t(fallback ? 'audience.replace' : 'visual.fallback')} disabled={disabled || !show} onPress={replace} /><Button label={t('audience.remove')} variant="ghost" disabled={disabled || !fallback} onPress={remove} /></View>
      <AppText tone="caption" muted>{t('audience.precedence')}</AppText>
    </SectionCard>
    <Surface><Disclosure title={t('refine.connectionGuide')}><AppText>{t('audience.cable')}</AppText><AppText tone="caption" muted>{t('audience.hardware')}</AppText><AudienceDiagram /><AppText>{t('audience.privacy')}</AppText><AppText tone="caption" muted>{t('audience.videoHelp')}</AppText></Disclosure></Surface>
    <Disclosure title={t('common.diagnostics')}><AppText selectable tone="caption">{status ? status.detail : t(failed ? 'state.unavailable' : 'common.loading')}</AppText><Badge label={t(status?.displayDetected ? 'audience.detected' : 'audience.notDetected')} /></Disclosure>
  </AppShell>
}

const styles = StyleSheet.create({
  diagram: { alignItems: 'center', gap: space.xs, direction: 'ltr' },
  screen: { width: size.go * 2, maxWidth: '100%', minHeight: size.go * 2 * 9 / 16, borderRadius: radius.lg, borderWidth: size.iconStroke, padding: space.sm },
  screenInside: { flex: 1, borderWidth: size.iconStroke, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: space.xs },
  stand: { width: size.controlLarge, height: space.xs, borderRadius: radius.sm },
  physicalRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', justifyContent: 'center' },
  phone: { width: size.controlLarge, height: size.goCompact, borderRadius: radius.md, borderWidth: size.iconStroke, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  phoneSlot: { height: size.iconStroke, width: size.icon, borderRadius: radius.sm },
  privateControl: { minHeight: space.xl, paddingHorizontal: space.xs, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  cable: { width: size.control, height: size.iconStroke },
})
