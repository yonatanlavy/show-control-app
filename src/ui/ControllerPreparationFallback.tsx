import { useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import type { SessionPurpose } from '../audio/contracts'
import { controllerPreparationIssues, type ControllerProfile, type RunSnapshot, type Show, type ShowSet } from '../domain'
import { useI18n } from '../i18n'
import { useApp } from './AppProvider'
import { useMounted } from './navigation'
import { AppText, Button, StatusBanner } from './primitives'
import { controllerReviewRoute } from './feedback'

export function needsControllerPreparationFallback(show: Show | null, set: ShowSet | null, profiles: readonly ControllerProfile[] = []): boolean {
  return Boolean(show?.controllerProfileId && set && controllerPreparationIssues(show, set, profiles).length)
}

/** A deliberate session-only alternative; saved mappings are never edited here. */
export function ControllerPreparationFallback({ purpose, disabled = false, hint, onPrepared }: {
  purpose: SessionPurpose; disabled?: boolean; hint?: string; onPrepared?: () => void
}) {
  const { t } = useI18n(); const mounted = useMounted(); const router = useRouter()
  const { show, set, library, libraryState, session, busy, liveSession, prepareTouchSession } = useApp()
  const pending = useRef(false); const [working, setWorking] = useState(false); const [failed, setFailed] = useState(false)
  if (!show || !set || !needsControllerPreparationFallback(show, set, libraryState.controllerProfiles)) return null
  const unavailable = disabled || busy || liveSession || working || session.phase === 'preparing'
  const prepare = async () => {
    if (unavailable || pending.current) return
    const expected: Pick<RunSnapshot, 'showId' | 'setId' | 'revisionId'> = { showId: show.id, setId: set.id, revisionId: show.revisionId }
    pending.current = true; setWorking(true); setFailed(false)
    try {
      if (!await prepareTouchSession(purpose, expected) || !mounted.current) return
      const latest = library.getSnapshot()
      const selected = latest.shows.find((candidate) => candidate.id === latest.selectedShowId)
      const selectedSet = selected?.sets.find((candidate) => candidate.id === latest.selectedSetId) ?? selected?.sets[0]
      if (latest.status === 'ready' && selected?.id === expected.showId && selected.revisionId === expected.revisionId && selectedSet?.id === expected.setId) onPrepared?.()
    } catch { if (mounted.current) setFailed(true) }
    finally { pending.current = false; if (mounted.current) setWorking(false) }
  }
  return <StatusBanner title={t('remote.touchTitle')} body={t('remote.touchHelp')} tone="warning">
    {failed ? <AppText accessibilityLiveRegion="polite">{t('common.errorHelp')}</AppText> : null}
    <Button label={t(purpose === 'performance' ? 'remote.touchArm' : 'remote.touchPrepare')} variant="primary" disabled={unavailable} state={working ? 'loading' : 'idle'} {...(hint ? { accessibilityHint: hint } : {})} onPress={() => { void prepare() }} />
    <Button label={t('remote.reviewButtons')} disabled={busy || liveSession || working} onPress={() => { const fresh = library.getSnapshot(); if (fresh.status === 'ready' && fresh.selectedShowId === show.id && fresh.shows.some((candidate) => candidate.id === show.id && candidate.revisionId === show.revisionId)) router.push(controllerReviewRoute) }} />
  </StatusBanner>
}
