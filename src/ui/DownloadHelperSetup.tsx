import { useEffect, useRef, useState } from 'react'
import { Alert, View } from 'react-native'
import { useI18n } from '../i18n'
import { checkedHelperUrl, HelperSettings, MusicDownloads } from '../music/downloads'
import { isCriticalSessionActive } from '../runtime/critical-session-gate'
import { useApp } from './AppProvider'
import { useMounted } from './navigation'
import { Button, Field, SectionCard, StatusBanner, uiStyles } from './primitives'

type SetupAction = 'save' | 'test' | 'forget'

/** Stored pairing secrets may be reused only for their canonical saved origin. */
export function DownloadHelperSetup() {
  const { t } = useI18n(); const { runTask, busy, liveSession } = useApp(); const mounted = useMounted()
  const [address, setAddress] = useState(''); const [code, setCode] = useState('')
  const [savedAddress, setSavedAddress] = useState<string | null>(null)
  const [failed, setFailed] = useState(false); const [loading, setLoading] = useState(true)
  const [readVersion, setReadVersion] = useState(0); const addressEdited = useRef(false)
  const operation = useRef<SetupAction | null>(null)
  const [action, setAction] = useState<SetupAction | null>(null)
  const request = useRef<AbortController | null>(null)
  const draftVersion = useRef(0)
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    let current = true
    void HelperSettings.read().then((value) => {
      if (!current) return
      if (value && !addressEdited.current) setAddress(value.url)
      setSavedAddress(value?.url ?? null); setFailed(false)
    }).catch(() => { if (current) { setSavedAddress(null); setFailed(true) } }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [readVersion])
  let origin: string | null = null
  try { if (address.trim()) origin = checkedHelperUrl(address) } catch { /* The field explains invalid addresses. */ }
  const sameSaved = origin !== null && origin === savedAddress
  const completeCode = /^[A-Za-z0-9_-]{32,512}$/.test(code.trim())
  const invalidAddress = Boolean(address.trim()) && origin === null
  const needsCode = Boolean(origin) && !completeCode && (!sameSaved || Boolean(code.trim()))
  const locked = busy || liveSession || isCriticalSessionActive() || action !== null
  const unavailable = locked || loading || !origin || (!completeCode && (!sameSaved || Boolean(code.trim())))
  const perform = (kind: SetupAction, work: (signal: AbortSignal, check: () => void) => Promise<void>) => {
    if (!mounted.current || locked || loading || operation.current || isCriticalSessionActive()) return
    const capturedVersion = draftVersion.current
    void runTask(async () => {
      const controller = new AbortController()
      const check = () => {
        if (!mounted.current || controller.signal.aborted || draftVersion.current !== capturedVersion) throw new DOMException('Cancelled', 'AbortError')
        if (isCriticalSessionActive()) throw new Error('library.armed')
      }
      check()
      if (operation.current) return null
      operation.current = kind; request.current = controller; setAction(kind)
      try { await work(controller.signal, check) }
      finally { operation.current = null; request.current = null; if (mounted.current) setAction(null) }
    }, { message: kind === 'save' ? 'common.saved' : kind === 'test' ? 'download.connected' : 'common.complete' })
  }
  const connectionAction = (save: boolean) => {
    if (unavailable) return
    perform(save ? 'save' : 'test', async (signal, check) => {
      const connection = await HelperSettings.resolve(address, code)
      check()
      if (save) await HelperSettings.save(connection.url, connection.token)
      else await MusicDownloads.testHelper(connection.url, connection.token, signal)
      if (mounted.current) {
        if (save) { setSavedAddress(connection.url); setCode(''); draftVersion.current += 1 }
        setFailed(false)
      }
    })
  }
  return <SectionCard icon="remote" title={t('download.helper')} caption={t('download.helperHelp')}>
    {loading ? <StatusBanner title={t('common.loading')} loading /> : failed ? <StatusBanner title={t('common.error')} body={t('error.downloadHelper')} tone="warning"><Button label={t('common.retry')} disabled={locked} onPress={() => { if (!mounted.current || locked || isCriticalSessionActive()) return; setLoading(true); setReadVersion((value) => value + 1) }} /></StatusBanner> : null}
    <Field label={t('download.address')} value={address} onChange={(value) => { if (!mounted.current || locked || operation.current || isCriticalSessionActive()) return; draftVersion.current += 1; addressEdited.current = true; setAddress(value) }} url maxLength={4096} disabled={locked} invalid={invalidAddress} placeholder="http://192.168.1.20:8765" {...(invalidAddress ? { helper: t('download.addressHelp') } : {})} />
    <Field label={t('download.code')} value={code} onChange={(value) => { if (!mounted.current || locked || operation.current || isCriticalSessionActive()) return; draftVersion.current += 1; setCode(value) }} secret maxLength={512} disabled={locked} placeholder={sameSaved ? '••••••••' : ''} {...(needsCode ? { helper: t('download.pairingRequired') } : {})} />
    <View style={uiStyles.wrap}>
      <Button label={t('common.save')} variant="primary" state={action === 'save' ? 'loading' : 'idle'} disabled={unavailable} onPress={() => connectionAction(true)} />
      <Button label={t('download.test')} state={action === 'test' ? 'loading' : 'idle'} disabled={unavailable} onPress={() => connectionAction(false)} />
      <Button label={t('download.forget')} variant="ghost" state={action === 'forget' ? 'loading' : 'idle'} disabled={locked || loading || !savedAddress && !failed} onPress={() => {
        if (!mounted.current || locked || loading || isCriticalSessionActive()) return
        const confirmedVersion = draftVersion.current
        Alert.alert(t('download.forget'), t('common.confirmDelete'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.delete'), style: 'destructive', onPress: () => {
          if (draftVersion.current !== confirmedVersion) return
          perform('forget', async () => {
            await HelperSettings.remove()
            if (mounted.current) { draftVersion.current += 1; setSavedAddress(null); setCode(''); setAddress(''); addressEdited.current = true; setFailed(false) }
          })
        } }])
      }} />
    </View>
  </SectionCard>
}
