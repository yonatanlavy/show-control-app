import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import type { Show } from '../domain'
import { useI18n } from '../i18n'
import type { RevisionHistoryCursor, RevisionHistoryPage, ShowRevisionSummary } from '../library/types'
import { isCriticalSessionActive } from '../runtime/critical-session-gate'
import { useApp } from './AppProvider'
import { useMounted } from './navigation'
import { AppText, Badge, Button, StatusBanner, Surface, uiStyles } from './primitives'
import { PanelFrame, WorkflowDialog } from './workflow-components'

export function HistoryPanel({ hosted = false }: { hosted?: boolean } = {}) {
  const { show } = useApp()
  return show ? <RevisionHistory key={`${show.id}:${show.revisionId}`} show={show} hosted={hosted} /> : null
}

function RevisionHistory({ show, hosted }: { show: Show; hosted: boolean }) {
  const { t, locale } = useI18n()
  const { library, runTask, busy } = useApp()
  const mounted = useMounted()
  const [cursors, setCursors] = useState<readonly (RevisionHistoryCursor | undefined)[]>([undefined])
  const cursor = cursors.at(-1)
  const [page, setPage] = useState<RevisionHistoryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [readFailed, setReadFailed] = useState(false)
  const [readVersion, setReadVersion] = useState(0)
  const [selected, setSelected] = useState<ShowRevisionSummary | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreFailed, setRestoreFailed] = useState(false)
  const restoringRef = useRef(false)
  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => active ? library.history(show.id, cursor) : null).then((next) => { if (active) setPage(next) }).catch(() => { if (active) setReadFailed(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [library, show.id, cursor, readVersion])
  const unavailable = busy || loading || restoring || isCriticalSessionActive()
  const date = (value: string) => Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString(locale) : t('common.notMeasured')
  const beginRead = () => { setLoading(true); setReadFailed(false); setPage(null) }
  const navigate = (next: readonly (RevisionHistoryCursor | undefined)[]) => {
    if (!mounted.current || unavailable) return
    beginRead(); setCursors(next)
  }
  const restore = async () => {
    if (!mounted.current || !selected || unavailable || restoringRef.current) return
    restoringRef.current = true; setRestoring(true); setRestoreFailed(false)
    try {
      const ok = await runTask(() => library.restoreRevision(show.id, selected.id), { message: 'common.saved' })
      if (mounted.current) { if (ok) setSelected(null); else setRestoreFailed(true) }
    } catch { if (mounted.current) setRestoreFailed(true) }
    finally { restoringRef.current = false; if (mounted.current) setRestoring(false) }
  }
  return <PanelFrame hosted={hosted} title={t('library.history')} icon="list">
    <AppText tone="caption" muted accessibilityLiveRegion="polite">{t('history.page', { page: cursors.length.toLocaleString(locale) })}</AppText>
    {loading ? <StatusBanner title={t('common.loading')} loading /> : null}
    {readFailed ? <StatusBanner title={t('common.error')} body={t('common.errorHelp')} tone="warning"><Button label={t('common.retry')} disabled={unavailable} onPress={() => { if (mounted.current && !unavailable) { beginRead(); setReadVersion((value) => value + 1) } }} /></StatusBanner> : null}
    {page && !page.revisions.length ? <AppText muted>{t('history.empty')}</AppText> : null}
    {page?.revisions.map((revision) => <Surface key={revision.id} raised={revision.id === show.revisionId}>
      <View style={uiStyles.row}><AppText tone="label" style={uiStyles.grow}>{t('history.version')}</AppText>{revision.id === show.revisionId ? <Badge label={t('history.current')} tone="success" /> : null}</View>
      <AppText tone="caption" muted>{date(revision.createdAt)}</AppText>
      {revision.prompt && !['restore', 'restore-deleted-show'].includes(revision.prompt) ? <AppText selectable numberOfLines={3}>{revision.prompt}</AppText> : null}
      <Button label={t('library.restoreRevision')} accessibilityLabel={t('history.restoreDated', { date: date(revision.createdAt) })} disabled={unavailable || revision.id === show.revisionId} onPress={() => { if (mounted.current && !unavailable) { setSelected(revision); setRestoreFailed(false) } }} />
    </Surface>)}
    <View style={uiStyles.gap}>
      {cursors.length > 1 ? <Button label={t('history.newer')} disabled={unavailable} onPress={() => navigate(cursors.slice(0, -1))} /> : null}
      {page?.nextCursor ? <Button label={t('history.older')} disabled={unavailable} onPress={() => { if (page.nextCursor) navigate([...cursors, page.nextCursor]) }} /> : null}
    </View>
    {selected ? <WorkflowDialog title={t('library.restoreRevision')} dismissDisabled={restoring || busy} onDismiss={() => { if (mounted.current && !restoringRef.current) setSelected(null) }}>
      <AppText>{date(selected.createdAt)}</AppText><AppText>{t('history.restoreHelp')}</AppText>
      {restoreFailed ? <StatusBanner title={t('common.error')} body={t('common.errorHelp')} tone="warning" /> : null}
      <Button label={t('library.restoreRevision')} variant="primary" disabled={unavailable} state={restoring ? 'loading' : 'idle'} onPress={() => { void restore() }} />
      <Button label={t('common.cancel')} variant="ghost" disabled={restoring || busy} onPress={() => { if (mounted.current && !restoringRef.current) setSelected(null) }} />
    </WorkflowDialog> : null}
  </PanelFrame>
}
