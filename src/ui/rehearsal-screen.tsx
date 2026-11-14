import { useRouter } from 'expo-router'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { BackHandler, Keyboard, StyleSheet, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { font, size, space, useThemeColors } from '../design'
import { useI18n } from '../i18n'
import { useApp } from './AppProvider'
import { EmptySelection, OperationStatus } from './library-screens'
import { ShowIdentityContext, useShowIdentities } from './ShowIdentityContext'
import { useMounted } from './navigation'
import { AppShell, AppText, Badge, Button, CoverTile, Disclosure, SectionHeader, Segments, StatusBanner, Surface, uiStyles } from './primitives'
import { PlaylistSummary, SongMetadata, playableDuration } from './song-metadata'
import { sourceClock } from './timing'
import { MetricGrid } from './MetricGrid'
import { CollectionRow } from './workflow-components'
import { CollectionSearch, collectionSearchMatches } from './CollectionSearch'
import { CollectionViewport, type CollectionSection } from './CollectionViewport'
import { SectionLabel, showArtwork } from './studio-components'
import { playbackReadout } from '../runtime/playback-readout'
import { canPauseResumeSession, hasOnlyIndependentVoices } from '../runtime/show-session'
import { VoiceCapacity } from './VoiceCapacity'
import { CueTitle } from './CueTitle'
import { operationErrorKey } from './feedback'
import { RehearsalWaveform } from './RehearsalWaveform'
import { ControllerPreparationFallback, needsControllerPreparationFallback } from './ControllerPreparationFallback'

type RehearsalPane = 'playback' | 'songs' | 'hits'
interface RehearsalRow { readonly id: string; readonly index: number; readonly kind: 'songs' | 'hits' }
const cueRows = (ids: readonly string[], kind: RehearsalRow['kind']): RehearsalRow[] => ids.map((id, index) => ({ id, index, kind }))

export function RehearsalScreen({ promotion }: { promotion?: ReactNode } = {}) {
  const identities = useShowIdentities()
  const router = useRouter(); const mounted = useMounted(); const { t, isRTL, locale } = useI18n(); const colors = useThemeColors()
  const viewport = useWindowDimensions()
  const { show, set, library, libraryState, session, busy, liveSession, error, beginRehearsal, go, panic, stopAll, pauseResume, previous, replay, selectCue, seek, triggerHit, exitShow } = useApp()
  const [exiting, setExiting] = useState(false); const exitingRef = useRef(false)
  const prepared = Boolean(session.snapshot && session.sessionPurpose === 'rehearsal')
  const snapshot = prepared ? session.snapshot : null
  const scope = JSON.stringify(snapshot
    ? ['prepared', snapshot.showId, snapshot.setId, snapshot.revisionId, session.nativeGeneration]
    : ['preparation', show?.id ?? null, set?.id ?? null])
  const [workspace, setWorkspace] = useState({ scope, query: '', pane: 'playback' as RehearsalPane })
  if (workspace.scope !== scope) setWorkspace({ scope, query: '', pane: 'playback' })
  const query = workspace.scope === scope ? workspace.query : ''
  const pane = workspace.scope === scope ? workspace.pane : 'playback'
  const searchOffset = useRef(0)
  const preparationRows = useMemo(() => {
    if (prepared || !show || !set) return []
    return [...cueRows(set.cueOrder, 'songs'), ...cueRows(set.hitCueIds, 'hits')].filter(({ id }) => {
      const cue = show.cues[id]
      return cue && collectionSearchMatches(query, cue.name, cue.notes)
    })
  }, [prepared, query, set, show])
  const preparedRows = useMemo(() => ({ songs: cueRows(snapshot?.cueOrder ?? [], 'songs'), hits: cueRows(snapshot?.hitCueIds ?? [], 'hits') }), [snapshot])
  const current = snapshot?.cues[session.currentCueId || session.selectedCueId || '']
  const audio = current?.type === 'audio' ? current : null
  const loop = audio?.endBehavior === 'loop'
  const asset = audio?.mediaAsset
  const timing = playbackReadout(session)
  const sourcePosition = audio ? audio.trimInMs + (timing.positionMs ?? 0) : 0
  const trimEnd = audio?.trimOutMs ?? asset?.durationMs ?? 0
  const canSeek = Boolean(!exiting && audio && timing.kind === 'measured' && session.currentCueId === audio.id && session.countdownRemainingMs === 0 && ['running', 'paused', 'fading'].includes(session.phase))
  useEffect(() => {
    if (!prepared) return undefined
    Keyboard.dismiss()
    const listener = BackHandler.addEventListener('hardwareBackPress', () => true)
    return () => listener.remove()
  }, [prepared])
  const leave = async () => {
    if (exitingRef.current) return
    exitingRef.current = true; setExiting(true)
    try { if (await exitShow() && mounted.current) router.replace('/builder') }
    finally { exitingRef.current = false; if (mounted.current) setExiting(false) }
  }
  const recoveryRequired = ['fault', 'interrupted'].includes(session.phase)
  const ordinaryUnavailable = exiting || busy || recoveryRequired || session.phase === 'unavailable'
  const perform = (work: () => unknown) => { if (!exitingRef.current && !ordinaryUnavailable) work() }
  if (!prepared && (!show || !set)) return <EmptySelection current="/rehearsal" title={t('rehearsal.title')} />
  if (!prepared && show && set) {
    const searching = Boolean(query.trim())
    const updateQuery = (value: string) => setWorkspace({ scope, query: value, pane: 'playback' })
    const sections: CollectionSection<RehearsalRow>[] = (['songs', 'hits'] as const).flatMap((kind) => {
      const data = preparationRows.filter((row) => row.kind === kind)
      return data.length ? [{ key: kind, data, heading: <SectionLabel title={t(kind === 'hits' ? 'run.hits' : 'practice.songs')} trailing={<Badge label={data.length.toLocaleString(locale)} />} /> }] : []
    })
    return <AppShell current="/rehearsal" scroll={false} footer={promotion} actionBar={<><AppText tone="caption" muted>{t('practice.silentPrepare')}</AppText><Button label={t('practice.prepare')} variant="primary" disabled={busy || liveSession || !set.cueOrder.length || needsControllerPreparationFallback(show, set, libraryState.controllerProfiles)} state={session.phase === 'preparing' ? 'loading' : 'idle'} onPress={() => { Keyboard.dismiss(); void beginRehearsal() }} /></>}>
      <CollectionViewport<RehearsalRow> sections={sections} resetKey={query} scopeKey={scope} getResetOffset={() => searchOffset.current} keyExtractor={(row) => `${row.kind}:${row.id}`}
        header={<View style={uiStyles.largeGap}>
          <SectionHeader title={t('rehearsal.title')} subtitle={t('practice.intro')} /><OperationStatus />
          <Surface><View style={uiStyles.row}><CoverTile title={set.name} uri={showArtwork(show)} /><View style={uiStyles.grow}><AppText tone="caption" muted>{show.name}</AppText><ShowIdentityContext identity={identities.get(show.id)} /><AppText tone="title">{set.name}</AppText></View></View></Surface>
          <ControllerPreparationFallback purpose="rehearsal" disabled={busy || liveSession || !set.cueOrder.length} />
          <Disclosure title={t('refine.overview')}><PlaylistSummary show={show} set={set} /></Disclosure>
          <CollectionSearch value={query} onChange={updateQuery} label={t('use.library.findCue')} resultCount={preparationRows.length} totalCount={set.cueOrder.length + set.hitCueIds.length} onLayout={(event) => { searchOffset.current = event.nativeEvent.layout.y }} />
          {searching && !preparationRows.length ? <StatusBanner title={t('use.library.noCues')} body={t('use.library.searchHelp')}><Button label={t('use.library.clearSearch')} onPress={() => updateQuery('')} /></StatusBanner> : null}
          {!searching && !set.cueOrder.length ? <StatusBanner title={t('edge.playlistEmpty')} /> : null}
        </View>}
        footer={<View style={styles.listFooter}><Button label={t('rehearsal.preflight')} disabled={busy || liveSession} onPress={() => router.push('/preflight')} /></View>}
        renderItem={(row, index, sectionKey) => {
          const cue = show.cues[row.id]; if (!cue) return null
          const media = cue.type === 'audio' ? show.media[cue.mediaAssetId] : undefined
          return <View style={[styles.previewRow, { borderColor: colors.borderSubtle }, index === sections.find((section) => section.key === sectionKey)!.data.length - 1 && styles.lastPreview]}>
            <View style={uiStyles.row}><AppText tone="caption" muted>{String(row.index + 1).padStart(2, '0')}</AppText><AppText style={uiStyles.grow}>{cue.name}</AppText>{cue.type === 'audio' ? <AppText tone="caption">{sourceClock(playableDuration(cue, media))}</AppText> : null}</View>
            {cue.type === 'audio' ? <SongMetadata cue={cue} asset={media} transportMode={set.transportMode} /> : null}
          </View>
        }} />
    </AppShell>
  }
  const names = snapshot!.cues
  const selected = session.selectedCueId
  const oms = snapshot!.transportMode === 'oms'
  const finished = oms ? session.phase === 'stopped' && !selected && !session.currentCueId : !session.nextCueId && session.activeVoiceCount === 0 && session.countdownRemainingMs === 0 && ['ready', 'stopped'].includes(session.phase)
  const target = session.phase === 'paused' ? session.currentCueId || selected : oms && ['ready', 'stopped'].includes(session.phase) ? selected : session.nextCueId
  const action = session.phase === 'paused' ? t('run.resume') : session.phase === 'running' ? t('run.next') : t('run.go')
  const canGo = !finished && !exiting && !busy && (session.phase === 'paused' || oms && session.phase === 'running' || Boolean(target)) && (['ready', 'running', 'paused', 'stopped'].includes(session.phase) || !oms && session.phase === 'fading') && session.pendingCommandIds.length === 0 && (!oms || session.phase === 'paused' || session.countdownRemainingMs === 0)
  const pausedCountdown = session.phase === 'paused' && session.countdownRemainingMs > 0
  const pausedWork = session.phase === 'paused' && session.activeVoiceCount === 0 && session.hasPendingActions === true
  const pausedHits = session.phase === 'paused' && hasOnlyIndependentVoices(session)
  const resumeDetail = pausedCountdown ? t('use.run.pausedDelay', { seconds: Math.ceil(session.countdownRemainingMs / 1000) }) : pausedWork ? t('run.scheduledActions') : pausedHits ? t('run.hits') : target ? names[target]?.name ?? target : ''
  const goLabel = session.phase === 'paused' ? `${action}${resumeDetail ? ` · ${resumeDetail}` : ''}` : oms && session.countdownRemainingMs ? t('run.countdown', { seconds: Math.ceil(session.countdownRemainingMs / 1000) }) : `${action}${target ? ` · ${names[target]?.name ?? target}` : ''}`
  const tabs = <Segments<RehearsalPane> selected={pane} onChange={(next) => setWorkspace({ scope, query: '', pane: next })} options={[
    { value: 'playback', label: t('use.editor.playback') }, { value: 'songs', label: t('practice.select') },
    ...(snapshot!.hitCueIds.length ? [{ value: 'hits' as const, label: t('run.hits') }] : []),
  ]} />
  const paneRows = pane === 'playback' ? [] : preparedRows[pane]
  const paneHeading = <View style={uiStyles.gap}>{tabs}
    <View style={uiStyles.wrap}><Badge label={t(`state.${session.phase}` as Parameters<typeof t>[0])} /><VoiceCapacity active={session.activeVoiceCount} limit={snapshot!.voiceLimit} /></View>
    {error || recoveryRequired ? <StatusBanner title={t('common.error')} body={t(recoveryRequired ? 'practice.recover' : operationErrorKey(error!))} tone="warning" /> : null}
    {pane === 'songs' ? <AppText tone="caption" muted>{t('practice.selectionHelp')}</AppText> : pane === 'hits' ? <AppText tone="caption" muted>{t('practice.hitsHelp')}</AppText> : null}
  </View>
  return <SafeAreaView style={[styles.shell, { backgroundColor: colors.canvas, direction: isRTL ? 'rtl' : 'ltr' }]}>
    <View style={styles.workspace}>
      <CollectionViewport<RehearsalRow> sections={[{ key: pane, data: paneRows, heading: paneHeading }]} resetKey={pane} scopeKey={scope} keyExtractor={(row) => `${row.kind}:${row.id}`} compactHeadings stickyHeaders={viewport.height > size.control * 12 && viewport.fontScale <= font.scale.stageMax}
        header={<View style={styles.header}>
          <View style={styles.headerActions}><Badge label={t('rehearsal.label')} tone="warning" /><View style={styles.exitAction}><Button stageSafe compact label={t('practice.exit')} disabled={exiting} state={exiting ? 'loading' : 'idle'} onPress={() => { void leave() }} /></View></View>
          <View style={uiStyles.row}><AppText tone="label" accessibilityRole="header" accessibilityLabel={snapshot!.setName} numberOfLines={1} style={uiStyles.grow}>{snapshot!.setName}</AppText><AppText tone="caption" muted accessibilityLabel={t('practice.locked')}>{t('practice.lockedShort')}</AppText></View>
        </View>}
        renderItem={(row, index) => {
          const cue = names[row.id]; const media = cue?.type === 'audio' ? cue.mediaAsset : undefined
          const duration = cue?.type === 'audio' ? sourceClock(playableDuration(cue, media)) : undefined
          const ordinal = String(row.index + 1).padStart(2, '0')
          return <CollectionRow title={cue?.name ?? row.id} label={`${ordinal} · ${cue?.name ?? row.id}${duration ? ` · ${duration}` : ''}`} subtitle={duration} hint={t(row.kind === 'hits' ? session.phase === 'paused' ? 'use.run.resume' : 'practice.hitsHelp' : 'practice.selectionHelp')} indicator={row.kind === 'hits' ? 'play' : 'chevron'} leading={<AppText tone="caption" muted>{ordinal}</AppText>} selected={row.kind === 'songs' && selected === row.id} last={index === paneRows.length - 1} disabled={ordinaryUnavailable || row.kind === 'hits' && session.phase === 'paused'} onPress={() => perform(() => row.kind === 'hits' ? triggerHit(row.id) : selectCue(row.id))} />
        }}
        footer={pane === 'playback' ? <View style={styles.playback}>
          <Surface raised>
            <View style={uiStyles.row}><CoverTile title={current?.name ?? t(finished ? 'refine.finished' : 'common.ready')} uri={audio?.artworkAssetId ? snapshot!.visualAssets?.[audio.artworkAssetId]?.localUri : undefined} /><View style={uiStyles.grow}><AppText tone="caption" muted>{t('run.now')}</AppText><CueTitle name={current?.name ?? t(finished ? 'refine.finished' : 'common.ready')} /></View></View>
            {audio ?
              <MetricGrid items={[{ label: t(loop ? 'run.loopPosition' : 'run.elapsed'), value: timing.elapsedMs !== null ? sourceClock(timing.elapsedMs) : t('common.notMeasured'), neutral: timing.kind !== 'unknown' }, { label: t(loop ? 'run.loopRemaining' : 'run.remaining'), value: timing.remainingMs !== null ? sourceClock(timing.remainingMs) : t('common.notMeasured'), neutral: timing.kind !== 'unknown' }]} />
              : <Button stageSafe compact label={t('recovery.replay')} disabled={ordinaryUnavailable || finished} onPress={() => perform(replay)} />}
          </Surface>
          <Surface><View accessible accessibilityRole="text" accessibilityLabel={`${t('run.next')}: ${names[session.nextCueId]?.name ?? t('common.complete')}`} style={styles.next}><AppText tone="caption" muted>{t('run.next')}</AppText><CueTitle name={names[session.nextCueId]?.name ?? t('common.complete')} tone="label" /></View></Surface>
          {finished ? <StatusBanner title={t('refine.finished')} body={t('refine.restart')} tone="success" /> : null}
          {audio ? <Disclosure key={scope} title={t('practice.seekTools')}><Surface>
              <RehearsalWaveform audio={audio} library={library} sourcePositionMs={sourcePosition} disabled={!canSeek || busy} retryDisabled={exiting || busy} onSeek={(positionMs) => perform(() => seek(audio.id, positionMs))} />
              {canSeek ? null : <AppText tone="caption" muted>{t('edge.seekUnavailable')}</AppText>}
              <View style={styles.controlRow}>
                <View style={styles.controlSlot}><Button stageSafe compact label={t('edge.seekBack')} accessibilityLabel={t('rehearsal.back')} disabled={!canSeek || busy} onPress={() => perform(() => seek(audio.id, Math.max(audio.trimInMs, sourcePosition - 10000)))} /></View>
                <View style={styles.controlSlot}><Button stageSafe compact label={t('edge.seekForward')} accessibilityLabel={t('rehearsal.forward')} disabled={!canSeek || busy} onPress={() => perform(() => seek(audio.id, Math.min(trimEnd - 1, sourcePosition + 10000)))} /></View>
                <View style={styles.controlSlot}><Button stageSafe compact label={t('recovery.replay')} disabled={ordinaryUnavailable} onPress={() => perform(replay)} /></View>
              </View>
          </Surface></Disclosure> : null}
          {audio ? <Disclosure title={t('use.editor.savedBehavior')}><Surface><SongMetadata cue={audio} asset={asset} transportMode={snapshot!.transportMode} /></Surface></Disclosure> : null}
        </View> : <View style={styles.listFooter} />} />
    </View>
    <View style={[styles.footer, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
      <View style={styles.controlRow}>
        <View style={styles.controlSlot}><Button stageSafe compact label={t('command.PREVIOUS')} disabled={ordinaryUnavailable} onPress={() => perform(previous)} /></View>
        <View style={styles.controlSlot}><Button stageSafe compact label={session.phase === 'paused' ? t('run.resume') : t('run.pause')} disabled={exiting || busy || !canPauseResumeSession(session)} onPress={() => perform(pauseResume)} /></View>
      </View>
      <View style={styles.controlRow}>
        <View style={styles.controlSlot}><Button stageSafe compact label={t('recovery.stop')} onPress={stopAll} /></View>
        <View style={styles.controlSlot}><Button stageSafe compact label={t('recovery.fade')} variant="danger" onPress={panic} /></View>
      </View>
      <Button label={finished ? t('common.complete') : goLabel} variant="go" disabled={!canGo} onPress={() => perform(go)} />
    </View>
  </SafeAreaView>
}
const styles = StyleSheet.create({
  header: { gap: space.xs },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  exitAction: { flexShrink: 1, maxWidth: '100%' },
  controlRow: { flexDirection: 'row', gap: space.xs, direction: 'ltr' }, controlSlot: { flex: 1, minWidth: 0 },
  shell: { flex: 1 }, workspace: { flex: 1, minHeight: 0, padding: space.md, width: '100%', maxWidth: size.contentMax, alignSelf: 'center' },
  playback: { gap: space.md, paddingTop: space.xs }, next: { gap: space.xxs }, listFooter: { paddingTop: space.md, paddingBottom: space.sm },
  previewRow: { paddingVertical: space.sm, gap: space.xs, borderBottomWidth: StyleSheet.hairlineWidth }, lastPreview: { borderBottomWidth: 0 },
  footer: { padding: space.sm, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth, width: '100%', maxWidth: size.contentMax, alignSelf: 'center', direction: 'ltr' },
})
