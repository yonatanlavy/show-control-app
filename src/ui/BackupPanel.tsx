import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { useI18n } from '../i18n'
import { checkBackupCancelled, isCommittedRestoreReloadRequired, type BackupOptions, type BackupProgress, type BackupResult } from '../storage/backup-progress'
import { useApp } from './AppProvider'
import { MetricGrid } from './MetricGrid'
import { ActionCard } from './studio-components'
import { operationErrorKey } from './feedback'
import { AppText, Badge, Button, Disclosure, Progress, StatusBanner, Surface, uiStyles } from './primitives'
import { PanelFrame } from './workflow-components'

/** Shared preparation-only backup workflow. No transport or provider access. */
export function BackupPanel({ hosted = false }: { hosted?: boolean } = {}) {
  const { t, locale } = useI18n(); const { library, libraryState, runTask, busy } = useApp()
  const [working, setWorking] = useState<'export' | 'restore' | 'share' | null>(null)
  const [progress, setProgress] = useState<BackupProgress | null>(null); const [result, setResult] = useState<BackupResult | null>(null)
  const [savedUri, setSavedUri] = useState(''); const saved = useRef(''); const [failed, setFailed] = useState(''); const [cancelled, setCancelled] = useState(false)
  const [retryKind, setRetryKind] = useState<'export' | 'restore' | 'share'>('export')
  const operation = useRef<AbortController | null>(null); const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; operation.current?.abort() } }, [])
  const number = (value: number) => value.toLocaleString(locale)
  const run = (kind: 'export' | 'restore' | 'share') => {
    if (operation.current || busy || libraryState.status !== 'ready') return
    const initialController = new AbortController(); operation.current = initialController; setWorking(kind); setFailed(''); setCancelled(false); setProgress(null)
    let completedExportUri = ''
    let attempted = false; let pending: Promise<unknown> | null = null
    if (kind !== 'share') setResult(null)
    const work = (): Promise<unknown> => {
      if (pending) return pending
      // The global failure notice can retry after this panel has left. Only a
      // subsequent deliberate invocation gets a new signal; navigation still
      // cancels the original attempt, including one not yet admitted by storage.
      const controller = attempted ? new AbortController() : initialController; attempted = true
      const options: BackupOptions = { signal: controller.signal, onProgress: (next) => { if (mounted.current && operation.current === controller) setProgress(next) }, onResult: (next) => { if (mounted.current && operation.current === controller) setResult(next) } }
      // A deferred finalizer runs after assignment even if admission rejects synchronously.
      pending = (async () => {
        try {
          checkBackupCancelled(controller.signal); operation.current = controller
          if (mounted.current) { setWorking(kind); setFailed(''); setCancelled(false); setProgress(null) }
          if (kind === 'restore') {
            const restored = await library.importBackup(undefined, options)
            if (restored === null && mounted.current) setProgress(null)
            return restored
          }
          if (kind === 'share' && saved.current) { await library.shareBackup(saved.current, options); return undefined }
          const uri = completedExportUri || await library.exportBackup({ ...options, share: false, onSaved: (value) => { if (operation.current !== controller) return; completedExportUri = value; saved.current = value; if (mounted.current) setSavedUri(value) } })
          completedExportUri = uri
          // Export is complete before sharing. Retry of a share failure reuses this exact ZIP.
          await library.shareBackup(uri, options)
          return uri
        } catch (error) {
          // Committed counts remain true. Shared recovery reopens the library;
          // local import Retry would risk importing the same backup twice.
          if (isCommittedRestoreReloadRequired(error)) {
            if (mounted.current) { setFailed(''); setCancelled(false) }
            throw error
          }
          const missing = error instanceof Error && /BACKUP_FILE_MISSING/.test(error.message)
          if (missing) { completedExportUri = ''; saved.current = '' }
          if (mounted.current) {
            if (error instanceof Error && error.name === 'AbortError') setCancelled(true)
            else { setFailed(error instanceof Error ? error.message : 'Backup failed'); setRetryKind(missing ? 'export' : kind === 'export' && completedExportUri ? 'share' : kind) }
            if (missing) { setSavedUri(''); setResult(null) }
          }
          // This panel owns its failure and retry state. Avoid a second global
          // notice covering the same controls; retain the global fallback if gone.
          if (!mounted.current) throw error
          library.clearError()
          return null
        } finally { if (operation.current === controller) { operation.current = null; if (mounted.current) setWorking(null) } }
      })().finally(() => { pending = null })
      return pending
    }
    void runTask(work, { silent: true })
  }
  const unavailable = busy || working !== null || libraryState.status !== 'ready'
  const failureKey = operationErrorKey(failed)
  const failureBody = retryKind === 'export' && failureKey === 'error.backupInvalid' ? 'backup.exportInvalid' : failureKey
  const measured = progress?.totalBytes && progress.totalBytes > 0 && progress.stage !== 'saving' && progress.stage !== 'sharing' ? progress.completedBytes / progress.totalBytes : null
  let archiveName = savedUri.split('/').pop() ?? ''
  try { archiveName = decodeURIComponent(archiveName) } catch { /* Preserve a readable name even for an opaque URI. */ }
  // The idle Back up card already describes the contents; show it here only while that card is hidden.
  return <PanelFrame hosted={hosted} title={t('settings.backup')} icon="download">
    <Badge label={t('library.offline')} tone="success" />{working ? <AppText tone="caption" muted>{t('backup.contents')}</AppText> : null}
    {working ? <StatusBanner title={t(cancelled ? 'backup.cancelling' : `backup.${progress?.stage ?? 'checking'}`)} loading={measured === null}>
      {measured !== null ? <AppText tone="label" accessibilityLiveRegion="polite">{new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(Math.min(1, Math.max(0, measured)))}</AppText> : null}<Progress value={measured} />{progress?.totalFiles !== null && progress?.totalFiles !== undefined ? <AppText tone="caption">{t('backup.fileProgress', { done: number(progress.completedFiles), total: number(progress.totalFiles) })}</AppText> : null}
      {progress?.totalBytes ? <AppText tone="caption" muted>{t('backup.byteProgress', { done: number(progress.completedBytes), total: number(progress.totalBytes) })}</AppText> : null}
      <Button label={t('common.cancel')} disabled={cancelled || controllerNotCancellable(progress)} onPress={() => { operation.current?.abort(); setCancelled(true) }} />
      {controllerNotCancellable(progress) ? <AppText tone="caption" muted>{t('backup.cancelHelp')}</AppText> : null}<AppText tone="caption" muted>{t('use.backup.working')}</AppText>
    </StatusBanner> : null}
    {failed ? <StatusBanner title={t(/BACKUP_FILE_MISSING/.test(failed) ? 'backup.missing' : retryKind === 'share' ? 'backup.savedShareFailed' : 'common.error')} body={t(failureBody)} tone="warning"><View style={uiStyles.wrap}><Button label={t(retryKind === 'share' ? 'backup.shareAgain' : 'common.retry')} disabled={unavailable} onPress={() => run(retryKind)} /><Button label={t('common.dismiss')} variant="ghost" disabled={unavailable} onPress={() => setFailed('')} /></View><Disclosure title={t('common.diagnostics')}><AppText selectable tone="caption">{failed}</AppText></Disclosure></StatusBanner> : null}
    {cancelled && !working ? <AppText accessibilityLiveRegion="polite" muted>{t('backup.cancelled')}</AppText> : null}
    {!working ? <><ActionCard title={t('library.backup')} detail={t('backup.contents')} icon="download" disabled={unavailable} onPress={() => run('export')} /><ActionCard title={t('library.restore')} detail={t('backup.restoreHelp')} icon="library" tone="neutral" disabled={unavailable} onPress={() => run('restore')} /></> : null}
    {savedUri && !working ? <Surface raised><AppText tone="label">{t('use.backup.archive')}</AppText><AppText tone="caption" selectable>{archiveName}</AppText><AppText tone="caption" muted>{t('use.backup.keepCopy')}</AppText>{!(failed && retryKind === 'share') ? <Button label={t('backup.shareAgain')} variant="primary" disabled={unavailable} onPress={() => run('share')} /> : null}</Surface> : null}
    {result && !working ? <StatusBanner title={t(result.kind === 'export' ? 'backup.saved' : 'backup.restored')} tone="success"><View accessibilityLiveRegion="polite"><MetricGrid items={[{ label: t('refine.shows'), value: number(result.shows) }, { label: t('library.playlists'), value: number(result.playlists) }, { label: t('refine.songs'), value: number(result.songs) }, { label: t('refine.files'), value: number(result.files) }]} /></View>{result.kind === 'restore' ? <AppText muted>{t('library.rebind')}</AppText> : null}</StatusBanner> : null}
    <Disclosure title={t('help.title')}><AppText tone="caption" muted>{t('backup.private')}</AppText><AppText tone="caption" muted>{t('backup.cancelHelp')}</AppText><AppText tone="caption" muted>{t('library.rebind')}</AppText></Disclosure>
  </PanelFrame>
}
function controllerNotCancellable(progress: BackupProgress | null) { return progress?.stage === 'saving' || progress?.stage === 'sharing' }
