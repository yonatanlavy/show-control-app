import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { IncludedLibrary, includedMusicInstalled, type IncludedMusicInfo } from '../music/included-library'
import { isCommittedRestoreReloadRequired, type BackupProgress } from '../storage/backup-progress'
import { useApp } from './AppProvider'
import { AppText, Button, Disclosure, Progress, SectionCard, StatusBanner } from './primitives'
import { operationErrorKey } from './feedback'

/** Deliberate local installation; never runs on startup or an armed screen. */
export function IncludedMusicPanel() {
  const { t, locale } = useI18n(); const { library, libraryState, busy, runTask } = useApp()
  const [info, setInfo] = useState<IncludedMusicInfo | null>(null); const [failed, setFailed] = useState('')
  const [working, setWorking] = useState(false); const [cancelled, setCancelled] = useState(false); const [cancelling, setCancelling] = useState(false)
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const mounted = useRef(true); const operation = useRef<AbortController | null>(null)
  const load = () => { void IncludedLibrary.info().then((value) => { if (mounted.current && value) { setInfo(value); setFailed('') } }).catch((error: unknown) => { if (mounted.current) setFailed(error instanceof Error ? error.message : 'Included music archive is unavailable') }) }
  useEffect(() => { mounted.current = true; load(); return () => { mounted.current = false; operation.current?.abort() } }, [])
  if (!info && !failed) return null
  const installed = info ? includedMusicInstalled(libraryState, info) : false
  const start = () => {
    if (!info) { load(); return }
    if (busy || operation.current || libraryState.status !== 'ready' || installed) return
    const controller = new AbortController(); operation.current = controller; setWorking(true); setFailed(''); setCancelled(false); setCancelling(false); setProgress(null)
    void runTask(async () => {
      try {
        if (!mounted.current) { controller.abort(); return null }
        return await IncludedLibrary.install(library, info, { signal: controller.signal, onProgress: (value) => { if (mounted.current && operation.current === controller) setProgress(value) } })
      } catch (error) {
        if (isCommittedRestoreReloadRequired(error)) throw error
        if (mounted.current) {
          if (error instanceof Error && error.name === 'AbortError') setCancelled(true)
          else setFailed(error instanceof Error ? error.message : 'Included music archive could not be installed')
        }
        library.clearError(); return null
      } finally {
        if (operation.current === controller) operation.current = null
        if (mounted.current) { setWorking(false); setCancelling(false) }
      }
    }, { silent: true })
  }
  const measured = progress?.totalBytes && progress.totalBytes > 0 ? Math.min(1, progress.completedBytes / progress.totalBytes) : null
  const saving = progress?.stage === 'saving'
  return <SectionCard title={t('use.library.includedTitle')} icon="music">
    {info ? <AppText muted>{t('use.library.includedHelp', { songs: info.songs.toLocaleString(locale), playlists: info.playlists.toLocaleString(locale), size: (info.bytes / 1_000_000_000).toLocaleString(locale, { maximumFractionDigits: 2 }) })}</AppText> : null}
    {installed ? <StatusBanner title={t('use.library.musicReady')} body={t('use.library.includedCredits')} tone="success" /> : null}
    {working ? <StatusBanner title={t(cancelling ? 'backup.cancelling' : `backup.${progress?.stage ?? 'reading'}`)} loading={measured === null}><Progress value={measured} />{measured !== null ? <AppText accessibilityLiveRegion="polite">{new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(measured)}</AppText> : null}{progress?.totalFiles ? <AppText>{t('backup.fileProgress', { done: progress.completedFiles.toLocaleString(locale), total: progress.totalFiles.toLocaleString(locale) })}</AppText> : null}<Button label={t('common.cancel')} disabled={cancelling || saving} onPress={() => { operation.current?.abort(); setCancelling(true) }} />{saving ? <AppText muted>{t('backup.cancelHelp')}</AppText> : null}</StatusBanner> : null}
    {failed ? <StatusBanner title={t('common.error')} body={t(operationErrorKey(failed) === 'error.lowStorage' ? 'error.lowStorage' : 'use.library.includedFailed')} tone="warning"><Disclosure title={t('common.diagnostics')}><AppText selectable>{failed}</AppText></Disclosure></StatusBanner> : null}
    {cancelled && !working ? <AppText accessibilityLiveRegion="polite">{t('backup.cancelled')}</AppText> : null}
    {!installed && !working ? <Button label={t(failed ? 'common.retry' : 'use.library.installMusic')} variant="primary" disabled={busy || libraryState.status !== 'ready'} onPress={start} /> : null}
  </SectionCard>
}
