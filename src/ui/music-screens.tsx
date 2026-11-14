import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Keyboard, Platform, View } from 'react-native'
import * as Sharing from 'expo-sharing'
import type { DownloadJob, DownloadSource, DownloadTarget } from '../../modules/show-downloads'
import { recommendMusic, type MusicRecommendation } from '../ai/music-recommendations'
import { useI18n, type MessageKey } from '../i18n'
import { isMusicCategory, type MusicCategory } from '../music/categories'
import { hasDownloadTarget, MusicDownloads } from '../music/downloads'
import { isCriticalSessionActive } from '../runtime/critical-session-gate'
import { filterLibrarySongs, librarySongs, type LibrarySong } from '../music/library'
import { useApp } from './AppProvider'
import { EmptySelection, OperationStatus } from './library-screens'
import { CategoryPicker } from './music-components'
import { useMounted } from './navigation'
import { AppShell, AppText, Badge, Button, CoverTile, Disclosure, Field, IconButton, Progress, SectionCard, SectionHeader, Segments, StatusBanner, Surface, SwitchRow, TaskRow, uiStyles } from './primitives'
import { ActionCard, SectionLabel } from './studio-components'
import { CollectionRow, WorkflowDialog } from './workflow-components'
import { DownloadHelperSetup } from './DownloadHelperSetup'
import { operationErrorKey, type FeedbackOptions } from './feedback'

const categoryKey = (category: MusicCategory) => ('category.' + category) as MessageKey
const stageKey = (job: DownloadJob) => ('download.stage.' + job.stage) as MessageKey
const duration = (ms: number) => Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0')
/** Locale-formatted, clamped download percent; a native value outside 0–100 or NaN never renders as such. */
export const percentLabel = (locale: string, percent: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(Number.isFinite(percent) ? Math.max(0, Math.min(1, Math.round(percent) / 100)) : 0)

type DownloadAction = 'attach' | 'cancel' | 'retry' | 'share' | 'delete'
export function DownloadsPanel({ standalone = false }: { standalone?: boolean } = {}) {
  const { t, locale } = useI18n(); const { library, show, set, busy, runTask, liveSession } = useApp(); const mounted = useMounted()
  const [jobs, setJobs] = useState<readonly DownloadJob[]>([]); const [readFailed, setReadFailed] = useState(false); const [limit, setLimit] = useState(10)
  const [missingTarget, setMissingTarget] = useState(false)
  const [loading, setLoading] = useState(true); const [readVersion, setReadVersion] = useState(0)
  const committedAttachments = useRef(new Map<string, DownloadTarget>())
  const pendingActions = useRef(new Map<string, DownloadAction>())
  const [actions, setActions] = useState<ReadonlyMap<string, DownloadAction>>(() => new Map())
  useEffect(() => {
    let current = true; let reading = false
    const refresh = async () => { if (reading || liveSession) return; reading = true; try { const next = await MusicDownloads.jobs(); if (current) { setJobs([...next].reverse().map((job) => { const committed = committedAttachments.current.get(job.id); return committed && (job.stage === 'ready' || job.stage === 'attached') ? { ...job, ...committed, stage: 'attached' as const } : job })); setReadFailed(false) } } catch { if (current) setReadFailed(true) } finally { reading = false; if (current) setLoading(false) } }
    void refresh(); const timer = setInterval(() => { void refresh() }, 1000)
    return () => { current = false; clearInterval(timer) }
  }, [liveSession, readVersion])
  const jobTask = (job: DownloadJob, action: DownloadAction, work: () => Promise<unknown>, feedback: FeedbackOptions = { silent: true }) => {
    if (!mounted.current || liveSession || isCriticalSessionActive() || pendingActions.current.has(job.id) || busy && action !== 'cancel') return
    // The stored Retry also owns this lifecycle. Rapid row presses and an old
    // confirmation cannot launch a second operation or act on an armed show.
    void runTask(async () => {
      if (!mounted.current) throw new DOMException('Cancelled', 'AbortError')
      if (isCriticalSessionActive()) throw new Error('library.armed')
      if (pendingActions.current.has(job.id)) return null
      pendingActions.current.set(job.id, action); setActions(new Map(pendingActions.current))
      try { return await work() }
      finally { pendingActions.current.delete(job.id); if (mounted.current) setActions(new Map(pendingActions.current)) }
    }, feedback)
  }
  const attachHere = (job: DownloadJob) => {
    if (!show || !set || busy || liveSession || committedAttachments.current.has(job.id)) return
    const target = { showId: show.id, setId: set.id, category: job.category }
    jobTask(job, 'attach', async () => {
      if (committedAttachments.current.has(job.id)) return null
      const result = await MusicDownloads.attach(library, job, undefined, target)
      // SQL is committed before attach resolves. Retain the history row and
      // prevent an older ready poll from offering the deleted staging file.
      if (result === 'attached') committedAttachments.current.set(job.id, target)
      if (mounted.current) {
        setMissingTarget(result === 'retained')
        if (result === 'attached') setJobs((values) => values.map((value) => value.id === job.id ? { ...value, ...target, stage: 'attached' } : value))
      }
      return result === 'attached' ? result : null
    }, { message: 'download.attached' })
  }
  const contents = <>{missingTarget ? <StatusBanner title={t('common.error')} body={t('finder.targetMissing')} tone="warning" /> : null}{readFailed ? <StatusBanner title={t('common.error')} body={t('error.downloadFailed')} tone="warning"><Button label={t('common.retry')} disabled={busy || liveSession} onPress={() => { setLoading(true); setReadVersion((value) => value + 1) }} /></StatusBanner> : null}{loading && !jobs.length ? <StatusBanner title={t('common.loading')} loading /> : !readFailed && !jobs.length ? <AppText tone="caption" muted>{t('download.empty')}</AppText> : null}{jobs.slice(0, limit).map((job) => {
    const active = ['queued', 'resolving', 'downloading', 'extracting'].includes(job.stage)
    const ready = job.stage === 'ready'
    const originalAvailable = hasDownloadTarget(library, job)
    const retryTarget = originalAvailable ? { showId: job.showId, setId: job.setId, category: isMusicCategory(job.category) ? job.category : 'ambient' as const } : show && set ? { showId: show.id, setId: set.id, category: isMusicCategory(job.category) ? job.category : 'ambient' as const } : null
    const retryShow = retryTarget ? library.getSnapshot().shows.find((value) => value.id === retryTarget.showId) : undefined
    const retrySet = retryShow?.sets.find((value) => value.id === retryTarget?.setId)
    const action = actions.get(job.id)
    const locked = liveSession || isCriticalSessionActive()
    const unavailable = busy || locked || Boolean(action)
    const actionLabel = (key: MessageKey) => t('download.actionForSong', { action: t(key), song: job.title })
    const destination = ready && show && set ? show.name + ' · ' + set.name : retryShow && retrySet ? retryShow.name + ' · ' + retrySet.name : null
    return <Surface key={job.id}>
      <View style={uiStyles.row}><CoverTile title={job.title} small /><AppText tone="label" style={uiStyles.grow}>{job.title}</AppText></View>
      <View style={uiStyles.wrap}><Badge label={t(stageKey(job))} tone={job.stage === 'attached' ? 'success' : job.stage === 'error' || job.stage === 'interrupted' ? 'warning' : 'neutral'} />{job.percent !== null && active ? <Badge label={percentLabel(locale, job.percent)} /> : null}</View>
      {job.stage === 'error' || job.stage === 'interrupted' ? <AppText tone="caption">{t(operationErrorKey(job.errorCode ?? (job.stage === 'interrupted' ? 'DOWNLOAD_INTERRUPTED' : 'DOWNLOAD_SOURCE_FAILED')))}</AppText> : null}
      {active ? <Progress value={job.percent === null ? null : job.percent / 100} /> : null}
      {destination && job.stage !== 'attached' ? <AppText tone="caption" muted>{t('finder.target', { section: destination })}</AppText> : null}
      {ready && !originalAvailable ? <AppText tone="caption">{t('download.retained')}</AppText> : null}
      <View style={uiStyles.wrap}>
        {active ? <Button label={t('common.cancel')} accessibilityLabel={actionLabel('common.cancel')} disabled={locked || Boolean(action)} state={action === 'cancel' ? 'loading' : 'idle'} onPress={() => jobTask(job, 'cancel', async () => { MusicDownloads.cancel(job); return null })} /> : null}
        {ready && show && set ? <Button label={t('download.attachHere')} accessibilityLabel={actionLabel('download.attachHere')} variant="primary" disabled={unavailable} state={action === 'attach' ? 'loading' : 'idle'} onPress={() => attachHere(job)} /> : null}
        {ready && job.uri ? <Button label={t('finder.share')} accessibilityLabel={actionLabel('finder.share')} disabled={unavailable} state={action === 'share' ? 'loading' : 'idle'} onPress={() => jobTask(job, 'share', () => Sharing.shareAsync(job.uri!, { mimeType: 'audio/mpeg', UTI: 'public.mp3' }))} /> : null}
        {['error', 'interrupted', 'cancelled'].includes(job.stage) && retryTarget ? <Button label={t('common.retry')} accessibilityLabel={actionLabel('common.retry')} disabled={unavailable} state={action === 'retry' ? 'loading' : 'idle'} onPress={() => jobTask(job, 'retry', async () => { const result = await MusicDownloads.download(library, { url: job.url, title: job.title, uploader: '', durationSeconds: null }, retryTarget); if (mounted.current) setMissingTarget(result === 'retained'); return result === 'attached' ? result : null }, { message: 'download.attached' })} /> : null}
        {!active ? <Button label={t('common.delete')} accessibilityLabel={actionLabel('common.delete')} variant="ghost" disabled={unavailable} onPress={() => {
          if (unavailable || isCriticalSessionActive()) return
          Alert.alert(t('common.delete'), t('download.deleteConfirm'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.delete'), style: 'destructive', onPress: () => jobTask(job, 'delete', () => MusicDownloads.remove(job)) }])
        }} /> : null}
      </View>
    </Surface>
  })}{jobs.length > limit ? <Button label={t('finder.more')} onPress={() => setLimit((value) => value + 10)} /> : null}</>
  return standalone ? <View style={uiStyles.gap}>{contents}</View> : <SectionCard title={t('download.history')} icon="download">{contents}</SectionCard>
}
export function DownloadsScreen() {
  const { t } = useI18n()
  return <AppShell current="/more" navigationRoute="/downloads"><SectionHeader title={t('download.history')} /><OperationStatus /><DownloadsPanel standalone />{Platform.OS === 'ios' ? <Disclosure title={t('download.helper')}><DownloadHelperSetup /></Disclosure> : <AppText tone="caption" muted>{t('download.native')}</AppText>}</AppShell>
}
export function MusicFinderScreen() {
  const { libraryState } = useApp()
  return libraryState.status === 'ready' ? <MusicFinderContent /> : <EmptySelection />
}
function MusicFinderContent() {
  const params = useLocalSearchParams<{ showId?: string; setId?: string }>(); const router = useRouter(); const mounted = useMounted()
  const { t, locale } = useI18n(); const { library, libraryState, show, set, runTask, busy, previewLibrarySong, previewState, stopPreview } = useApp()
  const [target] = useState(() => ({ showId: params.showId ?? show?.id ?? '', setId: params.setId ?? set?.id ?? '' }))
  const targetShow = libraryState.shows.find((value) => value.id === target.showId)
  const targetSet = targetShow?.sets.find((value) => value.id === target.setId)
  const [tab, setTab] = useState<'local' | 'library' | 'ai' | 'download'>('library'); const [category, setCategory] = useState<MusicCategory>('ambient')
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState(false); const [limit, setLimit] = useState(20)
  const [routine, setRoutine] = useState(targetSet?.routineText ?? ''); const [downloadQuery, setDownloadQuery] = useState('')
  const [suggestions, setSuggestions] = useState<MusicRecommendation | null>(null); const [sources, setSources] = useState<readonly DownloadSource[] | null>(null)
  const [working, setWorking] = useState(false); const [progress, setProgress] = useState<DownloadJob | null>(null); const [notice, setNotice] = useState<MessageKey | null>(null)
  const [roleOpen, setRoleOpen] = useState(false); const [detailId, setDetailId] = useState<string | null>(null); const [auditioned, setAuditioned] = useState<string | null>(null); const [added, setAdded] = useState<ReadonlySet<string>>(new Set())
  const task = useRef<AbortController | null>(null); const taskKind = useRef<'ai' | 'search' | 'download' | 'import' | null>(null)
  const pendingAdds = useRef(new Set<string>()); const previewPending = useRef<number | null>(null); const previewIntent = useRef(0)
  const songs = useMemo(() => librarySongs(libraryState.shows), [libraryState.shows])
  const filtered = useMemo(() => filterLibrarySongs(songs, query, filter ? category : undefined), [songs, query, filter, category])
  useEffect(() => () => { previewIntent.current += 1; if (taskKind.current !== 'download') task.current?.abort(); void stopPreview().catch(() => undefined) }, [stopPreview])
  const auditionedSong = songs.find((song) => song.id === auditioned)
  // A completed request is not evidence that its audio is still playing.
  // Native end/error/stop state owns the icon and the next press's meaning.
  const activeAudition = auditionedSong && previewState?.cueId === auditionedSong.cueId && previewState.phase !== 'stopped' ? auditioned : null
  const stopAudition = () => {
    const intent = ++previewIntent.current; previewPending.current = intent
    void runTask(stopPreview, { silent: true }).then((ok) => { if (ok && mounted.current && previewIntent.current === intent) setAuditioned(null) }).finally(() => { if (previewPending.current === intent) previewPending.current = null })
  }
  async function work(kind: 'ai' | 'search' | 'download' | 'import', action: (signal: AbortSignal) => Promise<unknown>, message?: MessageKey) {
    if (task.current || busy) return
    // The stored retry must own a new cancellable operation too. Keeping this
    // lifecycle outside runTask left retries without progress or an abort owner.
    await runTask(async () => {
      if (!mounted.current) throw new DOMException('Cancelled', 'AbortError')
      if (task.current) return null
      const controller = new AbortController(); task.current = controller; taskKind.current = kind; setWorking(true); setNotice(null); setProgress(null)
      try { return await action(controller.signal) }
      finally { if (task.current === controller) { task.current = null; taskKind.current = null; if (mounted.current) setWorking(false) } }
    }, message ? { message } : { silent: true })
  }
  async function searchSources(value: string) {
    setDownloadQuery(value); setSources(null); setTab('download')
    await work('search', async (signal) => { const result = await MusicDownloads.search(value, signal); if (signal.aborted) throw new DOMException('Cancelled', 'AbortError'); if (mounted.current) setSources(result) })
  }
  const add = (song: LibrarySong, role = category) => { if (!targetSet || !targetShow || pendingAdds.current.has(song.id) || busy || working) return; pendingAdds.current.add(song.id); void runTask(() => library.copyLibrarySong(song.showId, song.cueId, targetShow.id, targetSet.id, role), { message: 'finder.added' }).then((ok) => { if (ok && mounted.current) setAdded((values) => new Set([...values, song.id])) }).finally(() => pendingAdds.current.delete(song.id)) }
  const audition = (song: LibrarySong) => {
    if (previewPending.current !== null || busy || working) return
    const stopping = activeAudition === song.id; const intent = ++previewIntent.current; previewPending.current = intent
    if (!stopping) setAuditioned(song.id)
    void runTask(() => stopping ? stopPreview() : previewLibrarySong(song.showId, song.cueId), { silent: true }).then((ok) => {
      if (mounted.current && previewIntent.current === intent && (stopping ? ok : !ok)) setAuditioned(null)
    }).finally(() => { if (previewPending.current === intent) previewPending.current = null })
  }
  const download = (source: DownloadSource) => {
    if (!targetSet || !targetShow) return
    const captured = { showId: targetShow.id, setId: targetSet.id, category }
    void work('download', async (signal) => {
      const result = await MusicDownloads.download(library, source, captured, signal, (job) => { if (mounted.current) setProgress(job) })
      if (mounted.current) setNotice(result === 'attached' ? 'download.attached' : 'download.retained')
      return result === 'attached' ? result : null
    }, 'download.attached')
  }
  if (!targetSet || !targetShow) return <AppShell current="/builder" navigationRoute="/find-music"><SectionHeader title={t('finder.title')} /><OperationStatus /><StatusBanner title={t('common.error')} body={t('finder.targetMissing')} tone="warning" /><DownloadsPanel /><Button label={t('nav.library')} onPress={() => router.replace('/')} /></AppShell>
  const unavailable = busy || working
  const recommend = (extra?: string) => { const text = extra ? routine + '\n' + extra : routine; void work('ai', async (signal) => {
    await library.setRoutine(targetShow.id, targetSet.id, routine)
    const result = await recommendMusic({ routine: text, category, songs, locale, provider: libraryState.settings.assistantProvider, model: libraryState.settings.assistantModel, signal })
    if (mounted.current) setSuggestions(result)
    if (library.getSnapshot().shows.some((value) => value.id === targetShow.id)) await library.recordPrompt(targetShow.id, { kind: result.clarification ? 'clarification' : 'answer', prompt: text, response: JSON.stringify(result) })
  }) }
  const songCard = (song: LibrarySong) => {
    const sourceShow = libraryState.shows.find((value) => value.id === song.showId)
    const visual = song.cue.artworkAssetId ? sourceShow?.visualAssets?.[song.cue.artworkAssetId] : undefined
    return <CollectionRow key={song.id} title={song.name} subtitle={duration(song.durationMs) + (song.categories.length ? ' · ' + song.categories.map((value) => t(categoryKey(value))).join(' · ') : '')} leading={<CoverTile title={song.name} uri={visual?.localUri} small />} onPress={() => setDetailId(song.id)} action={<View style={uiStyles.row}><IconButton label={t(activeAudition === song.id ? 'editor.stopPreview' : 'common.preview') + ' · ' + song.name} icon={activeAudition === song.id ? 'stop' : 'play'} selected={activeAudition === song.id} disabled={unavailable} onPress={() => audition(song)} /><IconButton label={t(added.has(song.id) ? 'finder.added' : 'finder.add') + ' · ' + song.name} icon={added.has(song.id) ? 'check' : 'plus'} selected disabled={unavailable || added.has(song.id)} onPress={() => add(song)} /></View>} />
  }
  const detail = songs.find((song) => song.id === detailId)
  const backToPlaylist = () => { void runTask(() => library.select(targetShow.id, targetSet.id), { silent: true }).then((ok) => { if (ok && mounted.current) router.replace('/builder') }) }
  const importLocal = () => { void work('import', async (signal) => {
    const imported = await library.importAudio(targetShow.id, targetSet.id, undefined, signal, { category, applyPreset: true })
    if (imported && mounted.current && !signal.aborted) setNotice('finder.added')
    return imported
  }, 'finder.added') }
  const findSources = () => { if (unavailable || downloadQuery.trim().length < 2) return; Keyboard.dismiss(); void searchSources(downloadQuery) }
  return <AppShell current="/builder" navigationRoute="/find-music"><SectionHeader title={t('finder.title')} action={<IconButton label={t('workflow.backPlaylist')} icon="back" disabled={unavailable} onPress={backToPlaylist} />} /><OperationStatus />
    <Surface><AppText tone="caption" muted>{t('finder.target', { section: targetShow.name })}</AppText><AppText tone="label">{targetSet.name}</AppText><Disclosure title={t('workflow.role')} summary={t(categoryKey(category))}><TaskRow label={t(categoryKey(category))} disabled={unavailable} onPress={() => setRoleOpen(true)} /><AppText tone="caption" muted>{t('finder.presetHelp')}</AppText></Disclosure></Surface>
    <Segments options={[{ value: 'local', label: t('use.import.files') }, { value: 'library', label: t('finder.libraryTab') }, { value: 'download', label: t('finder.downloadTab') }, { value: 'ai', label: t('finder.aiTab') }]} selected={tab} onChange={setTab} disabled={working} />
    {working ? <StatusBanner title={progress ? t(stageKey(progress)) : t('common.loading')} {...(progress ? { body: progress.title } : {})} loading><Progress value={progress?.percent === null || progress?.percent === undefined ? null : progress.percent / 100} />{progress?.percent !== null && progress?.percent !== undefined ? <Badge label={percentLabel(locale, progress.percent)} /> : null}<Button label={t('common.cancel')} onPress={() => task.current?.abort()} /></StatusBanner> : null}
    {activeAudition ? <Button label={t('editor.stopPreview')} variant="ghost" onPress={stopAudition} /> : null}
    {notice ? <StatusBanner title={notice === 'finder.added' ? t('use.import.added', { playlist: targetSet.name }) : t(notice)} tone="success"><Button label={t('workflow.backPlaylist')} onPress={backToPlaylist} disabled={unavailable} /></StatusBanner> : null}
    {tab === 'local' ? <SectionCard title={t('use.import.files')} caption={t('use.import.localHelp')} icon="music"><ActionCard title={t('builder.import')} icon="plus" disabled={unavailable} onPress={importLocal} /></SectionCard> : null}
    {tab === 'library' ? <><Surface><Field label={t('finder.search')} placeholder={t('finder.search')} hideLabel value={query} onChange={(value) => { setQuery(value); setLimit(20) }} maxLength={500} returnKeyType="search" onSubmit={Keyboard.dismiss} />{query || filter ? <Button label={t('use.clearSearch')} variant="ghost" onPress={() => { setQuery(''); setFilter(false); setLimit(20) }} /> : null}<SwitchRow title={t('finder.filter')} value={filter} onValueChange={(value) => { setFilter(value); setLimit(20) }} /><AppText tone="caption" muted>{t('use.import.matches', { count: filtered.length })}</AppText>{added.size ? <Badge label={t('workflow.addedCount', { count: added.size })} tone="success" /> : null}</Surface>{!songs.length ? <StatusBanner title={t('common.empty')} body={t('finder.empty')} /> : !filtered.length ? <StatusBanner title={t('common.empty')} body={t('finder.noMatches')} /> : <Surface>{filtered.slice(0, limit).map(songCard)}</Surface>}{filtered.length > limit ? <Button label={t('finder.more')} onPress={() => setLimit((value) => value + 20)} /> : null}</> : null}
    {tab === 'ai' ? <><SectionCard title={t('finder.routine')} caption={t('finder.privacy')}><Field label={t('finder.routine')} value={routine} onChange={setRoutine} multiline maxLength={8192} disabled={unavailable} placeholder={t('finder.routinePlaceholder')} helper={t('finder.routineLimit', { count: routine.length })} /><View style={uiStyles.wrap}><Button label={t('finder.suggest')} variant="primary" disabled={unavailable || !routine.trim()} onPress={() => recommend()} /><Button label={t('common.save')} disabled={unavailable} onPress={() => { void runTask(() => library.setRoutine(targetShow.id, targetSet.id, routine), { message: 'common.saved' }) }} /></View><TaskRow label={t('ai.keys')} onPress={() => router.push('/provider-keys' as never)} /></SectionCard>{suggestions ? <SectionCard title={t('finder.suggest')} caption={suggestions.summary}>{suggestions.clarification ? <><AppText>{suggestions.clarification}</AppText>{suggestions.choices.map((choice) => <Button key={choice} label={choice} disabled={unavailable} onPress={() => recommend(choice)} />)}</> : suggestions.suggestions.map((suggestion, index) => {
      const song = suggestion.libraryId ? songs.find((value) => value.id === suggestion.libraryId) : undefined
      return <Surface key={index} raised><Badge label={t(suggestion.source === 'library' ? 'finder.inside' : 'finder.outside')} tone={song ? 'success' : 'accent'} /><AppText tone="title">{suggestion.title}</AppText>{suggestion.artist ? <AppText tone="caption" muted>{suggestion.artist}</AppText> : null}<AppText>{suggestion.reason}</AppText><AppText tone="label">{t('finder.start')}</AppText><AppText>{suggestion.start}</AppText><AppText tone="label">{t('finder.stop')}</AppText><AppText>{suggestion.stop}</AppText>{song ? <View style={uiStyles.wrap}><Button label={t('finder.add')} variant="primary" disabled={unavailable} onPress={() => add(song, suggestion.category)} /><Button label={t(activeAudition === song.id ? 'editor.stopPreview' : 'common.preview')} disabled={unavailable} onPress={() => audition(song)} /></View> : suggestion.searchQuery ? <Button label={t('finder.findSource')} disabled={unavailable} onPress={() => { setCategory(suggestion.category); void searchSources(suggestion.searchQuery!) }} /> : null}</Surface>
    })}</SectionCard> : null}</> : null}
    {tab === 'download' ? <>
      <SectionLabel title={t('finder.downloadTab')} />
      <SectionCard title={t('download.query')} caption={t('download.sourceHelp')} icon="download"><Field label={t('download.query')} value={downloadQuery} onChange={(value) => { setDownloadQuery(value); setSources(null) }} maxLength={500} disabled={unavailable} url returnKeyType="search" onSubmit={findSources} /><Button label={t('download.find')} variant="primary" disabled={unavailable || downloadQuery.trim().length < 2} onPress={findSources} /></SectionCard>
      {Platform.OS === 'ios' ? <Disclosure title={t('download.helper')}><DownloadHelperSetup /></Disclosure> : <AppText tone="caption" muted>{t('download.native')}</AppText>}
      {sources?.length === 0 ? <StatusBanner title={t('common.empty')} body={t('download.none')} /> : null}
      {sources?.map((source) => <Surface key={source.url}><View style={uiStyles.row}><CoverTile title={source.title} small /><View style={uiStyles.grow}><AppText tone="label">{source.title}</AppText><AppText tone="caption" muted>{source.uploader}{source.durationSeconds ? ' · ' + duration(source.durationSeconds * 1000) : ''}</AppText></View></View><Disclosure title={t('workflow.sourceDetails')} summary={new URL(source.url).hostname}><AppText tone="caption" selectable>{source.url}</AppText></Disclosure><Button label={t('download.button')} disabled={unavailable} variant="primary" onPress={() => download(source)} /></Surface>)}
      <Disclosure title={t('download.history')}><DownloadsPanel /></Disclosure>
    </> : null}
    <Button label={t('workflow.backPlaylist')} variant="ghost" disabled={unavailable} onPress={backToPlaylist} />
    {roleOpen ? <WorkflowDialog title={t('workflow.role')} onDismiss={() => setRoleOpen(false)}><CategoryPicker selected={[category]} single onChange={(values) => { setCategory(values[0]!); setLimit(20); setRoleOpen(false) }} /></WorkflowDialog> : null}
    {detail ? <WorkflowDialog title={detail.name} onDismiss={() => setDetailId(null)}><AppText tone="caption" muted>{duration(detail.durationMs)} · {detail.categories.map((value) => t(categoryKey(value))).join(' · ')}</AppText><Button label={t(activeAudition === detail.id ? 'editor.stopPreview' : 'common.preview')} disabled={unavailable} onPress={() => audition(detail)} /><Button label={t(added.has(detail.id) ? 'workflow.addAnother' : 'finder.add')} variant="primary" disabled={unavailable} onPress={() => add(detail)} /><Button label={t('finder.share')} variant="ghost" disabled={unavailable} onPress={() => { const uri = libraryState.shows.find((value) => value.id === detail.showId)?.media[detail.cue.mediaAssetId]?.localUri; if (uri) void runTask(() => Sharing.shareAsync(uri, { mimeType: 'audio/mpeg' }), { silent: true }) }} /></WorkflowDialog> : null}
  </AppShell>
}
