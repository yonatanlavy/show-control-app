import { useRouter } from 'expo-router'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { canonicalColor, type AudioCue, type Show, type ShowSet } from '../domain'
import { radius, size, space, useThemeColors } from '../design'
import { useI18n } from '../i18n'
import { useApp } from './AppProvider'
import { controllerReviewRoute, isControllerRepairError, operationErrorKey, taskRetryKey, useTaskFeedback } from './feedback'
import { useMounted } from './navigation'
import { SongEditor } from './song-editor'
import { PlaylistSummary, SongMetadata, playableDuration } from './song-metadata'
import { BackupPanel } from './BackupPanel'
import { IncludedMusicPanel } from './IncludedMusicPanel'
import { BackgroundReliabilityPanel } from './BackgroundReliabilityPanel'
import { HistoryPanel } from './HistoryPanel'
import { AppShell, AppText, Badge, Button, CoverTile, Disclosure, Field, IconButton, SectionCard, SectionHeader, StatusBanner, Surface, TaskRow, uiStyles } from './primitives'
import { CollectionRow, TextEntryForm, WorkflowDialog } from './workflow-components'
import { CollectionViewport, type CollectionSection } from './CollectionViewport'
import { CollectionSearch, collectionSearchMatches as searchMatches } from './CollectionSearch'
import { PrimaryAction, SectionLabel, ShowHero, StudioMasthead, StudioWelcome, showArtwork } from './studio-components'
import { AppIcon } from './icons'
import { isCriticalSessionActive } from '../runtime/critical-session-gate'
import { checkedName, copiedLibraryName, validLibraryName } from '../library/names'
import { ShowIdentityContext, useShowIdentities } from './ShowIdentityContext'
import { buildShowIdentities } from './show-identity'

export { operationErrorKey } from './feedback'
export { HistoryPanel } from './HistoryPanel'
export function OperationStatus({ suppressLoading = false, nativeRecoveryHandled = false }: { suppressLoading?: boolean; nativeRecoveryHandled?: boolean } = {}) {
  const { t } = useI18n(); const router = useRouter(); const { libraryState, busy, error, clearError, retryLastTask } = useApp()
  const { failure: hostedFailure } = useTaskFeedback()
  const [diagnostics, setDiagnostics] = useState(false); const candidate = !isCriticalSessionActive() && hostedFailure ? null : libraryState.status === 'error' ? libraryState.error ?? error : error ?? libraryState.error
  const failure = nativeRecoveryHandled && candidate && operationErrorKey(candidate) === 'run.playbackWarning' ? null : candidate
return <>{!suppressLoading && (libraryState.status === 'loading' || busy || libraryState.saving) ? <StatusBanner title={t('common.loading')} loading /> : null}{failure ? <StatusBanner title={t('common.error')} body={t(operationErrorKey(failure))} tone="warning"><View style={uiStyles.wrap}><Button label={t(taskRetryKey(failure))} disabled={busy} onPress={() => { if (isControllerRepairError(failure)) { clearError(); router.push(controllerReviewRoute); return }; if (/STALE_REVISION/.test(failure)) { clearError(); router.push('/builder'); return }; void retryLastTask() }} /><Button label={t('common.diagnostics')} variant="ghost" onPress={() => setDiagnostics(!diagnostics)} />{libraryState.status !== 'error' ? <Button label={t('common.dismiss')} variant="ghost" onPress={clearError} /> : null}</View>{diagnostics ? <AppText selectable tone="caption">{failure}</AppText> : null}</StatusBanner> : null}</>
}
function ControllerRepairNotice({ expectedShow, onReview }: { expectedShow: Show | null | undefined; onReview: () => void }) {
  const { t } = useI18n(); const router = useRouter(); const mounted = useMounted()
  const { library, libraryState, error, busy, liveSession, clearError, runTask } = useApp()
  const pending = useRef(false); const [reviewing, setReviewing] = useState(false); const [reviewFailed, setReviewFailed] = useState(false)
  const failure = error ?? libraryState.error ?? ''
  if (!expectedShow || !isControllerRepairError(failure) && !reviewing && !reviewFailed) return null
  const selectedAtRender = libraryState.selectedShowId
  const review = async () => {
    if (pending.current || busy || liveSession || isCriticalSessionActive()) return
    const fresh = library.getSnapshot()
    if (fresh.status !== 'ready' || fresh.selectedShowId !== selectedAtRender || !fresh.shows.some((show) => show.id === expectedShow.id && show.revisionId === expectedShow.revisionId)) return
    pending.current = true; setReviewing(true); setReviewFailed(false)
    try {
      const selected = fresh.selectedShowId === expectedShow.id || await runTask(() => library.select(expectedShow.id), { silent: true })
      if (!selected || !mounted.current) { if (mounted.current) setReviewFailed(true); return }
      const latest = library.getSnapshot()
      if (latest.status !== 'ready' || latest.selectedShowId !== expectedShow.id || !latest.shows.some((show) => show.id === expectedShow.id && show.revisionId === expectedShow.revisionId) || isCriticalSessionActive()) return
      clearError(); onReview(); router.push(controllerReviewRoute)
    } finally { pending.current = false; if (mounted.current) setReviewing(false) }
  }
  return <StatusBanner title={t('common.error')} body={t(reviewFailed ? operationErrorKey(failure) : 'error.controllerRepair')} tone="warning"><Button label={t('remote.reviewButtons')} disabled={busy || liveSession || reviewing} state={reviewing ? 'loading' : 'idle'} onPress={() => { void review() }} /></StatusBanner>
}
/** `current` must be the route actually showing it, or NavBar treats the highlighted tab as a no-op. */
export function EmptySelection({ current = '/builder', title }: { current?: string; title?: string } = {}) {
  const { t } = useI18n(); const router = useRouter(); const { libraryState } = useApp()
  return <AppShell current={current}><SectionHeader title={title ?? t('library.title')} /><OperationStatus />{libraryState.status === 'ready' ? <SectionCard title={t('library.emptyTitle')} caption={t('library.emptyBody')}><Button label={t('nav.library')} variant="primary" onPress={() => router.replace('/')} /></SectionCard> : null}</AppShell>
}
function moved(order: readonly string[], id: string, direction: number) { const next = [...order]; const from = next.indexOf(id); const to = from + direction; if (from < 0 || to < 0 || to >= next.length) return next; [next[from], next[to]] = [next[to]!, next[from]!]; return next }
function SongColor({ token }: { token?: string | undefined }) {
  const { t } = useI18n(); const colors = useThemeColors(); const value = canonicalColor(token)
  const role = { red: 'danger', yellow: 'warning', green: 'success', blue: 'accent', purple: 'purpleAccent', orange: 'tagOrange', none: 'border' } as const
  return value === 'none' ? null : <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs, alignSelf: 'flex-start' }}><View style={{ width: space.xs, height: space.xs, borderRadius: radius.round, backgroundColor: colors[role[value]] }} /><AppText tone="caption" muted>{t(`tag.${value}`)}</AppText></View>
}
export function LibraryScreen({ promotion }: { promotion?: ReactNode } = {}) {
  const router = useRouter(); const mounted = useMounted(); const { t, locale } = useI18n(); const { library, libraryState, runTask, busy } = useApp()
  const identities = useShowIdentities()
  const opening = useRef(false)
  const searchOffset = useRef(0)
  const [dialog, setDialog] = useState<{ kind: 'create' | 'rename' | 'manage' | 'delete'; showId?: string } | null>(null); const [deletedShows, setDeletedShows] = useState<readonly Show[]>([]); const [search, setSearch] = useState('')
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({})
  const deletedIdentities = useMemo(() => {
    const all = buildShowIdentities([...(libraryState.shows ?? []), ...deletedShows], locale, t, { fullReferences: true })
    return new Map(deletedShows.map((show) => [show.id, all.get(show.id)]))
  }, [deletedShows, libraryState.shows, locale, t])
  useEffect(() => { let active = true; if (libraryState.status === 'ready') void library.trash().then((shows) => { if (active) setDeletedShows(shows) }).catch(() => undefined); return () => { active = false } }, [library, libraryState.shows, libraryState.status])
  const selectionScope = JSON.stringify([libraryState.selectedShowId ?? null, libraryState.selectedSetId ?? null])
  const [searchScope, setSearchScope] = useState(selectionScope)
  if (searchScope !== selectionScope) { setSearchScope(selectionScope); setSearch('') }
  const ready = libraryState.status === 'ready'; const unavailable = busy || !ready
  const target = dialog?.showId ? libraryState.shows.find((show) => show.id === dialog.showId) : undefined
  const formKey = `${dialog?.kind ?? ''}:${target?.id ?? 'new'}`
  const forgetNameDraft = () => setNameDrafts((current) => { const { [formKey]: discarded, ...rest } = current; void discarded; return rest })
  const current = ready ? libraryState.shows.find((show) => show.id === libraryState.selectedShowId) ?? libraryState.shows[0] : undefined
  const filtering = Boolean(search.trim())
  const others = ready ? libraryState.shows.filter((show) => filtering ? searchMatches(search, show.name, identities.get(show.id)?.reference) : show.id !== current?.id) : []
  const currentSet = current?.sets.find((candidate) => candidate.id === libraryState.selectedSetId) ?? current?.sets[0]
  const searchLimit = useMemo(() => {
    let limit = 256
    for (const identity of identities.values()) limit = Math.max(limit, identity.reference.length)
    return limit
  }, [identities])
  const openShow = (id: string, route: '/builder' | '/rehearsal' | '/preflight' = '/builder') => {
    if (unavailable || opening.current) return
    opening.current = true
    void runTask(async () => { await library.select(id, id === current?.id ? currentSet?.id : undefined); if (mounted.current) router.push(route) }, { silent: true }).finally(() => { opening.current = false })
  }
  const header = <View style={uiStyles.largeGap}>
    <StudioMasthead />
    <SectionHeader title={t('library.title')} action={ready && !libraryState.shows.length ? undefined : <IconButton label={t('library.create')} icon="plus" emphasis disabled={unavailable} onPress={() => setDialog({ kind: 'create' })} />} />
    <OperationStatus suppressLoading={ready} />
    {ready && !libraryState.shows.length ? <StudioWelcome title={t('library.emptyTitle')} body={t('library.emptyBody')} action={<PrimaryAction label={t('library.create')} icon="plus" disabled={unavailable} onPress={() => setDialog({ kind: 'create' })} />} /> : null}
    {ready && libraryState.shows.length ? <CollectionSearch value={search} onChange={setSearch} label={t('use.library.findShow')} maxLength={searchLimit} resultCount={others.length} totalCount={libraryState.shows.length} onLayout={(event) => { searchOffset.current = event.nativeEvent.layout.y }} /> : null}
    {current && !filtering ? <ShowHero title={current.name} eyebrow={t('refine.currentShow')} subtitle={t(Object.keys(current.cues).length === 1 ? 'common.cueCountOne' : 'common.cueCount', { count: Object.keys(current.cues).length })} artworkUri={showArtwork(current)} action={<View style={uiStyles.gap}><View style={uiStyles.row}><View style={uiStyles.grow}><PrimaryAction label={t('library.open')} accessibilityLabel={t('library.open') + ' · ' + (identities.get(current.id)?.actionName ?? current.name)} icon="list" disabled={unavailable} onPress={() => openShow(current.id)} /></View><IconButton label={t('common.manage') + ' · ' + (identities.get(current.id)?.actionName ?? current.name)} icon="more" disabled={unavailable} onPress={() => setDialog({ kind: 'manage', showId: current.id })} /></View><View style={uiStyles.wrap}><Button label={t('nav.rehearsal')} disabled={unavailable || !currentSet?.cueOrder.length} onPress={() => openShow(current.id, '/rehearsal')} /><Button label={t('nav.run')} disabled={unavailable || !currentSet?.cueOrder.length} onPress={() => openShow(current.id, '/preflight')} /></View>{currentSet ? <AppText tone="caption" muted>{t('use.library.activePlaylist', { name: currentSet.name })}</AppText> : null}{!currentSet?.cueOrder.length ? <AppText tone="caption" muted>{t(currentSet ? 'edge.playlistEmpty' : 'edge.noPlaylists')}</AppText> : null}</View>}><ShowIdentityContext identity={identities.get(current.id)} /></ShowHero> : null}
    {filtering && !others.length ? <StatusBanner title={t('use.library.noShows')} body={t('use.library.searchHelp')}><Button label={t('use.library.clearSearch')} onPress={() => setSearch('')} /></StatusBanner> : null}
  </View>
  const footer = <View style={[uiStyles.largeGap, { paddingTop: space.lg }]}>
    {ready ? <BackgroundReliabilityPanel compact /> : null}
    <IncludedMusicPanel />
    <Disclosure title={t('settings.backup')} leading={<AppIcon name="download" />}><BackupPanel hosted /></Disclosure>
    {deletedShows.length ? <Disclosure title={t('library.deletedShows')}><Surface>{deletedShows.map((deleted, index) => <CollectionRow key={deleted.id} title={deleted.name} subtitle={t('library.restoreShow')} label={t('library.restoreShow') + ' · ' + (deletedIdentities.get(deleted.id)?.actionName ?? deleted.name)} disabled={unavailable} last={index === deletedShows.length - 1} onPress={() => { void runTask(() => library.restoreDeletedShow(deleted.id)) }}><ShowIdentityContext identity={deletedIdentities.get(deleted.id)} /></CollectionRow>)}</Surface></Disclosure> : null}
  </View>
  return <AppShell current="/" scroll={false} footer={promotion}>
    <CollectionViewport<Show> sections={others.length ? [{ key: 'shows', data: others, heading: <SectionLabel title={t('refine.collection')} trailing={<Badge label={String(others.length)} />} /> }] : []}
      header={header} footer={footer} resetKey={search} scopeKey={selectionScope} getResetOffset={() => searchOffset.current} keyExtractor={(item) => item.id}
      renderItem={(show, index) => <CollectionRow key={show.id} title={show.name} subtitle={t(Object.keys(show.cues).length === 1 ? 'common.cueCountOne' : 'common.cueCount', { count: Object.keys(show.cues).length })} leading={<CoverTile title={show.name} uri={showArtwork(show)} />} selected={filtering && show.id === current?.id} last={index === others.length - 1} label={t('library.open') + ' · ' + (identities.get(show.id)?.actionName ?? show.name)} disabled={unavailable} onPress={() => openShow(show.id)} action={<IconButton label={t('common.manage') + ' · ' + (identities.get(show.id)?.actionName ?? show.name)} icon="more" disabled={unavailable} onPress={() => setDialog({ kind: 'manage', showId: show.id })} />}><ShowIdentityContext identity={identities.get(show.id)} /></CollectionRow>} />
    {dialog && (dialog.kind === 'create' || target) ? <WorkflowDialog title={dialog.kind === 'create' ? t('library.create') : dialog.kind === 'rename' ? t('common.rename') : target!.name} dismissDisabled={busy} onDismiss={() => { forgetNameDraft(); setDialog(null) }}><ShowIdentityContext identity={target ? identities.get(target.id) : undefined} /><ControllerRepairNotice expectedShow={target ?? current} onReview={() => setDialog(null)} />{dialog.kind === 'manage' && target ? <><TaskRow label={t('common.rename')} disabled={unavailable} onPress={() => setDialog({ kind: 'rename', showId: target.id })} /><TaskRow label={t('common.duplicate')} disabled={unavailable} onPress={() => { void runTask(() => library.duplicateShow(target.id, copiedLibraryName(target.name, ` · ${t('common.duplicate')}`))).then((ok) => { if (ok && mounted.current) setDialog(null) }) }} /><Button label={t('common.delete')} variant="danger" disabled={unavailable} onPress={() => setDialog({ kind: 'delete', showId: target.id })} /></> : dialog.kind === 'delete' && target ? <><AppText>{t('common.confirmDelete')}</AppText><Button label={t('common.delete')} variant="danger" disabled={unavailable} onPress={() => { void runTask(() => library.removeShow(target.id), { undo: () => library.restoreDeletedShow(target.id) }).then((ok) => { if (ok && mounted.current) setDialog(null) }) }} /><Button label={t('common.cancel')} disabled={busy} onPress={() => setDialog({ kind: 'manage', showId: target.id })} /></> : <TextEntryForm libraryName key={dialog.kind + (target?.id ?? '')} initialValue={nameDrafts[formKey] ?? target?.name ?? t('library.newShowName')} onValueChange={(value) => setNameDrafts((current) => ({ ...current, [formKey]: value }))} label={t('common.name')} confirmLabel={dialog.kind === 'create' ? t('library.create') : t('common.save')} onCancel={() => { forgetNameDraft(); setDialog(null) }} onConfirm={async (value) => { const ok = await runTask(() => dialog.kind === 'create' ? library.createShow(value) : library.renameShow(target!.id, value), { message: 'common.saved' }); if (ok && mounted.current) { forgetNameDraft(); setDialog(null); if (dialog.kind === 'create') router.push('/builder') }; return ok }} />}</WorkflowDialog> : null}
  </AppShell>
}
function PlaylistCard({ show, set, selected, onSelected, draftName, onDraftName }: { show: Show; set: ShowSet; selected: boolean; onSelected: () => void; draftName?: string | undefined; onDraftName?: (value: string | undefined) => void }) {
  const { t } = useI18n(); const { library, runTask, busy } = useApp(); const [actionsOpen, setActionsOpen] = useState(false); const [deleting, setDeleting] = useState(false); const [renaming, setRenaming] = useState(false); const [name, setName] = useState(draftName ?? set.name)
  const index = show.sets.findIndex((candidate) => candidate.id === set.id)
  const validName = validLibraryName(name)
  return <Surface raised={selected}><CollectionRow title={set.name} subtitle={t(set.cueOrder.length === 1 ? 'common.cueCountOne' : 'common.cueCount', { count: set.cueOrder.length })} selected={selected} last disabled={busy} onPress={() => { if (selected) onSelected(); else void runTask(() => library.select(show.id, set.id), { silent: true }).then((ok) => { if (ok) onSelected() }) }} action={<IconButton label={t('common.manage') + ' · ' + set.name} icon="more" disabled={busy} selected={actionsOpen} onPress={() => setActionsOpen(!actionsOpen)} />} />
    {renaming ? <><Field label={t('common.name')} value={name} onChange={(value) => { setName(value); onDraftName?.(value) }} invalid={!validName} helper={t('use.library.nameLimit')} maxLength={Math.max(1000, set.name.length)} /><Button label={t('common.save')} disabled={busy || !validName} onPress={() => { void runTask(async () => { await library.renameSet(show.id, set.id, checkedName(name)); setRenaming(false); onDraftName?.(undefined) }) }} /></> : null}
    {actionsOpen && !deleting ? <View style={uiStyles.wrap}><Button label={t('common.rename')} disabled={busy} onPress={() => setRenaming(!renaming)} /><Button label={t('common.duplicate')} disabled={busy} onPress={() => { void runTask(() => library.duplicateSet(show.id, set.id)) }} /><Button label={t('common.moveUp')} disabled={busy || index === 0} onPress={() => { void runTask(() => library.reorderSets(show.id, moved(show.sets.map((candidate) => candidate.id), set.id, -1))) }} /><Button label={t('common.moveDown')} disabled={busy || index === show.sets.length - 1} onPress={() => { void runTask(() => library.reorderSets(show.id, moved(show.sets.map((candidate) => candidate.id), set.id, 1))) }} /><Button label={t('common.delete')} disabled={busy} variant="danger" onPress={() => setDeleting(true)} /></View> : null}{deleting ? <StatusBanner title={t('common.delete')} body={t('common.confirmDelete')} tone="warning"><Button label={t('common.delete')} disabled={busy} variant="danger" onPress={() => { void runTask(() => library.removeSet(show.id, set.id), { undo: () => library.restoreRevision(show.id, show.revisionId) }) }} /><Button label={t('common.cancel')} disabled={busy} onPress={() => setDeleting(false)} /></StatusBanner> : null}
  </Surface>
}
function cueDuration(show: Show, cue: AudioCue) { const seconds = Math.floor(playableDuration(cue, show.media[cue.mediaAssetId]) / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` }
function CueCount({ count }: { count: number }) { const { t } = useI18n(); return <AppText tone="caption" muted>{count === 1 ? t('common.cueCountOne') : t('common.cueCount', { count })}</AppText> }
export function BuilderScreen({ promotion }: { promotion?: ReactNode } = {}) {
  const { show, set } = useApp()
  return show ? <BuilderContent key={JSON.stringify([show.id, set?.id ?? null])} {...(promotion ? { promotion } : {})} /> : <EmptySelection />
}
function BuilderContent({ promotion }: { promotion?: ReactNode }) {
  const identities = useShowIdentities()
  const { t, locale } = useI18n(); const router = useRouter(); const { show, set, library, busy, runTask } = useApp()
  // Slider steps can store binary float noise (1.1500000000000001); rows show at most two decimals.
  const rate = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }), [locale])
  const [playlistName, setPlaylistName] = useState(''); const [editingCueId, setEditingCueId] = useState<string | null>(null); const [playlistsOpen, setPlaylistsOpen] = useState(false); const [manageTarget, setManageTarget] = useState<{ id: string; asHit: boolean } | null>(null); const [deletingId, setDeletingId] = useState<string | null>(null); const [search, setSearch] = useState('')
  const [playlistDrafts, setPlaylistDrafts] = useState<Record<string, string>>({})
  const searchOffset = useRef(0)
  if (!show) return <EmptySelection />
  const editing = editingCueId ? show.cues[editingCueId] : undefined
  if (set && editing?.type === 'audio' && [...set.cueOrder, ...set.hitCueIds].includes(editing.id)) return <AppShell key={'editor-' + editing.id} current="/builder" scroll={false} hideNavigation><OperationStatus suppressLoading /><SongEditor key={editing.id} cue={editing} show={show} set={set} onClose={() => setEditingCueId(null)} /></AppShell>
  const managed = manageTarget ? show.cues[manageTarget.id] : undefined; const managedOrder = (manageTarget?.asHit ? set?.hitCueIds : set?.cueOrder) ?? []; const managedIndex = managed ? managedOrder.indexOf(managed.id) : -1
  const duplicateLabel = t(manageTarget?.asHit && managed && set?.cueOrder.includes(managed.id) ? 'use.library.duplicateInOrder' : 'common.duplicate')
  const filtering = Boolean(search.trim())
  const validPlaylistName = !playlistName.trim() || validLibraryName(playlistName)
  const visibleCues = (set?.cueOrder ?? []).map((id, index) => ({ id, index })).filter(({ id }) => { const cue = show.cues[id]; return cue && searchMatches(search, cue.name, cue.notes) })
  const visibleHits = (set?.hitCueIds ?? []).map((id, index) => ({ id, index })).filter(({ id }) => { const cue = show.cues[id]; return cue && searchMatches(search, cue.name, cue.notes) })
  const cueRow = ({ id, index }: { id: string; index: number }, visibleIndex: number, count: number, asHit: boolean) => {
    const cue = show.cues[id]; if (!cue || !set) return null
    const artwork = cue.type === 'audio' && cue.artworkAssetId ? show.visualAssets?.[cue.artworkAssetId] : null
    const manage = () => { setDeletingId(null); setManageTarget({ id, asHit }) }
    return <CollectionRow key={id} title={cue.name} subtitle={cue.type === 'audio' ? cueDuration(show, cue) + ' · ' + rate.format(cue.playbackRate ?? 1) + '×' : undefined} leading={<View style={uiStyles.row}><AppText tone="caption" muted style={{ fontVariant: ['tabular-nums'] }}>{String(index + 1).padStart(2, '0')}</AppText><CoverTile title={cue.name} uri={artwork?.localUri} /></View>} label={t(asHit ? 'use.library.editHit' : cue.type === 'audio' ? 'editor.open' : 'common.manage') + ' · ' + cue.name} last={visibleIndex === count - 1} disabled={busy} onPress={() => cue.type === 'audio' ? setEditingCueId(id) : manage()} action={<IconButton label={t(asHit ? 'use.library.manageHit' : 'common.manage') + ' · ' + cue.name} icon="more" disabled={busy} onPress={manage} />}><SongColor token={cue.colorToken} />{cue.type === 'audio' ? <SongMetadata cue={cue} asset={show.media[cue.mediaAssetId]} transportMode={set.transportMode} /> : null}</CollectionRow>
  }
  const sections: CollectionSection<{ id: string; index: number }>[] = []
  if (set && (!filtering || visibleCues.length)) sections.push({ key: 'songs', data: visibleCues, heading: <View style={uiStyles.gap}><SectionLabel title={t('refine.songs')} trailing={<CueCount count={filtering ? visibleCues.length : set.cueOrder.length} />} />{!set.cueOrder.length && !filtering ? <StatusBanner title={t('common.empty')} body={t('finder.empty')} /> : null}</View> })
  if (set && visibleHits.length) sections.push({ key: 'hits', data: visibleHits, heading: <View style={uiStyles.gap}><SectionLabel title={t('run.hits')} trailing={<Badge label={String(visibleHits.length)} />} /><AppText tone="caption" muted>{t('use.library.hitsHelp')}</AppText></View> })
  const header = <View style={uiStyles.largeGap}>
    <View style={[uiStyles.row, styles.wrapRow]}><View style={styles.headerName}><AppText tone="eyebrow" muted numberOfLines={2} accessibilityLabel={show.name}>{show.name}</AppText><ShowIdentityContext identity={identities.get(show.id)} /></View><Button label={t('library.playlists')} onPress={() => setPlaylistsOpen(true)} disabled={busy} /></View>
    {set ? <Surface raised><View style={uiStyles.row}><CoverTile title={set.name} uri={showArtwork(show)} /><View style={uiStyles.grow}><AppText tone="title" accessibilityRole="header" accessibilityLabel={set.name} numberOfLines={2}>{set.name}</AppText><CueCount count={set.cueOrder.length} /></View></View><View style={styles.actions}><View style={styles.action}><Button label={t('nav.rehearsal')} disabled={!set.cueOrder.length || busy} onPress={() => router.push('/rehearsal')} /></View><View style={styles.action}><Button label={t('nav.run')} variant="primary" disabled={!set.cueOrder.length || busy} onPress={() => router.push('/preflight')} /></View></View></Surface> : <Surface raised><AppText tone="label" accessibilityRole="header">{t('library.playlists')}</AppText><AppText tone="caption" muted>{t('edge.noPlaylists')}</AppText><Button label={t('library.newPlaylist')} variant="primary" disabled={busy} onPress={() => setPlaylistsOpen(true)} /></Surface>}
    <OperationStatus />
    {set ? <>
      {set.cueOrder.length || set.hitCueIds.length ? <CollectionSearch value={search} onChange={setSearch} label={t('use.library.findCue')} resultCount={visibleCues.length + visibleHits.length} totalCount={set.cueOrder.length + set.hitCueIds.length} onLayout={(event) => { searchOffset.current = event.nativeEvent.layout.y }} /> : null}
      {filtering && !visibleCues.length && !visibleHits.length ? <StatusBanner title={t('use.library.noCues')} body={t('use.library.searchHelp')}><Button label={t('use.library.clearSearch')} onPress={() => setSearch('')} /></StatusBanner> : null}
    </> : null}
  </View>
  const footer = <View style={[uiStyles.largeGap, { paddingTop: space.lg }]}>
    {set ? <Disclosure title={t('refine.overview')} leading={<AppIcon name="list" />}><PlaylistSummary show={show} set={set} /></Disclosure> : null}
    <Disclosure title={t('library.history')}><HistoryPanel hosted /></Disclosure>
  </View>
  return <AppShell key={'playlist-' + set?.id} current="/builder" scroll={false} footer={promotion} hideActionBarWithKeyboard actionBar={set ? <View style={styles.actions}><View style={styles.action}><PrimaryAction label={t('builder.import')} icon="plus" disabled={busy} onPress={() => { void runTask(() => library.importAudio(show.id, set.id)) }} /></View><View style={styles.action}><Button label={t('finder.title')} disabled={busy} onPress={() => router.push({ pathname: '/find-music' as never, params: { showId: show.id, setId: set.id } })} /></View></View> : undefined}>
    <CollectionViewport sections={sections} header={header} footer={footer} resetKey={search} scopeKey={show.id + ':' + (set?.id ?? '')} getResetOffset={() => searchOffset.current} keyExtractor={(item) => item.id}
      renderItem={(item, index, sectionKey) => cueRow(item, index, sectionKey === 'hits' ? visibleHits.length : visibleCues.length, sectionKey === 'hits')} />
    {playlistsOpen ? <WorkflowDialog title={t('library.playlists')} dismissDisabled={busy} onDismiss={() => { setPlaylistsOpen(false); setPlaylistDrafts({}) }}><ControllerRepairNotice expectedShow={show} onReview={() => setPlaylistsOpen(false)} />{show.sets.map((candidate) => <PlaylistCard key={candidate.id} show={show} set={candidate} selected={candidate.id === set?.id} draftName={playlistDrafts[candidate.id]} onDraftName={(value) => setPlaylistDrafts((current) => { const { [candidate.id]: discarded, ...rest } = current; void discarded; return value === undefined ? rest : { ...rest, [candidate.id]: value } })} onSelected={() => setPlaylistsOpen(false)} />)}<SectionCard title={t('library.newPlaylist')}><Field label={t('common.name')} placeholder={t('library.newPlaylistName')} value={playlistName} onChange={setPlaylistName} invalid={!validPlaylistName} helper={t('use.library.nameLimit')} maxLength={1000} /><Button label={t('library.newPlaylist')} variant="primary" disabled={busy || !validPlaylistName} onPress={() => { void runTask(() => library.createSet(show.id, checkedName(playlistName.trim() || t('library.newPlaylistName')))).then((ok) => { if (ok) { setPlaylistName(''); setPlaylistsOpen(false) } }) }} /></SectionCard></WorkflowDialog> : null}
    {managed && set ? <WorkflowDialog title={managed.name} dismissDisabled={busy} onDismiss={() => setManageTarget(null)}><ControllerRepairNotice expectedShow={show} onReview={() => setManageTarget(null)} />{deletingId === managed.id ? <><AppText>{t('common.confirmDelete')}</AppText><AppText muted>{t('use.library.deleteCueHelp')}</AppText><Button label={t('common.delete')} variant="danger" disabled={busy} onPress={() => { void runTask(() => library.removeCue(show.id, managed.id), { undo: () => library.restoreRevision(show.id, show.revisionId) }).then((ok) => { if (ok) setManageTarget(null) }) }} /><Button label={t('common.cancel')} disabled={busy} onPress={() => setDeletingId(null)} /></> : <><TaskRow label={duplicateLabel} disabled={busy} onPress={() => { void runTask(() => library.duplicateCue(show.id, set.id, managed.id)).then((ok) => { if (ok) setManageTarget(null) }) }} /><TaskRow label={t('common.moveUp')} disabled={busy || managedIndex <= 0} onPress={() => { void runTask(() => library.reorderCues(show.id, set.id, moved(managedOrder, managed.id, -1), Boolean(manageTarget?.asHit))) }} /><TaskRow label={t('common.moveDown')} disabled={busy || managedIndex < 0 || managedIndex === managedOrder.length - 1} onPress={() => { void runTask(() => library.reorderCues(show.id, set.id, moved(managedOrder, managed.id, 1), Boolean(manageTarget?.asHit))) }} /><Button label={t('common.delete')} variant="danger" disabled={busy} onPress={() => setDeletingId(managed.id)} /></>}</WorkflowDialog> : null}
  </AppShell>
}

const styles = StyleSheet.create({
  // Content-sized basis: actions share a line when their labels fit and wrap (then
  // stretch) instead of squeezing into fixed halves that split words mid-letter.
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  action: { flexGrow: 1, flexShrink: 1, minWidth: size.control },
  wrapRow: { flexWrap: 'wrap' },
  // Keeps a readable name column; the Playlists button drops below it at large text.
  headerName: { flexGrow: 1, flexShrink: 1, flexBasis: size.coverHero, minWidth: 0 },
})
