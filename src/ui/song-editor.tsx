import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AppState, BackHandler, Keyboard, ScrollView, useWindowDimensions, View } from 'react-native'
import { font, radius, size, space, useThemeColors } from '../design'
import { canonicalColor, type AudioCue, type Show, type ShowSet } from '../domain'
import { useI18n, type MessageKey } from '../i18n'
import { categoryPreset, categoryTags, songCategories } from '../music/categories'
import { useApp } from './AppProvider'
import { CategoryPicker } from './music-components'
import { useMounted } from './navigation'
import { MetricGrid } from './MetricGrid'
import { parseSeconds, sourceClock } from './timing'
import { AppText, Badge, Button, ChoiceChip, CoverTile, Disclosure, Field, IconButton, SectionCard, Segments, StatusBanner, Surface, SwitchRow, TaskRow, uiStyles, ValueSlider } from './primitives'

export { sourceClock } from './timing'

export function auditionPosition(cue: AudioCue, duration: number, ending = false) {
  const end = cue.trimOutMs ?? duration
  // Fade clocks use real time; convert the audition lead-in to source time.
  return ending ? Math.max(cue.trimInMs, end - Math.max(1500, cue.fadeOutMs + 750) * (cue.playbackRate ?? 1)) : cue.trimInMs
}

type TimingKey = 'trimInMs' | 'trimOutMs' | 'fadeInMs' | 'fadeOutMs' | 'preWaitMs' | 'crossfadeMs'
type TimingDrafts = Partial<Record<TimingKey, string>>
type EditorSection = 'audio' | 'playback' | 'details'
function timingMs(cue: AudioCue, key: TimingKey, duration: number) { return cue[key] ?? (key === 'trimOutMs' ? duration : key === 'crossfadeMs' ? 2000 : 0) }
function timingChanges(cue: AudioCue, duration: number, drafts: TimingDrafts): Partial<AudioCue> | null {
  const changes: Partial<Record<TimingKey, number>> = {}
  for (const key of Object.keys(drafts) as TimingKey[]) {
    const value = parseSeconds(drafts[key]!)
    const max = key === 'trimInMs' || key === 'trimOutMs' ? duration : key === 'preWaitMs' ? 60000 : 30000
    if (value === null || value > max) return null
    if (value !== timingMs(cue, key, duration)) changes[key] = value
  }
  if ((changes.trimOutMs ?? cue.trimOutMs ?? duration) <= (changes.trimInMs ?? cue.trimInMs)) return null
  return changes
}
function ExactTiming({ label, milliseconds, seconds, onChange, min = 0, max, disabled, onSave }: { label: string; milliseconds: number; seconds: string; onChange: (value: string) => void; min?: number; max: number; disabled: boolean; onSave: (value: number) => void }) {
  const { t } = useI18n(); const value = parseSeconds(seconds)
  const valid = value !== null && value >= min && value <= max
  return <View style={uiStyles.gap}><Field label={label} value={seconds} numeric disabled={disabled} onChange={onChange} invalid={!valid} helper={valid ? t('common.range', { min: min / 1000, max: max / 1000 }) : t('common.invalidValue')} /><Button label={t('common.saveField', { name: label })} disabled={disabled || !valid || value === milliseconds} onPress={() => { if (valid) onSave(value) }} /></View>
}

export function SongEditor({ cue, show, set, onClose }: { cue: AudioCue; show: Show; set: ShowSet; onClose: () => void }) {
  const { t, locale } = useI18n(); const router = useRouter(); const colors = useThemeColors(); const viewport = useWindowDimensions()
  const { library, libraryState, runTask, clearError, busy, preview, previewState, pausePreview, resumePreview, scrub: scrubPreview, stopPreview } = useApp()
  const mounted = useMounted()
  const [draft, setDraft] = useState(cue); const [peaks, setPeaks] = useState<readonly number[]>([])
  const [timingDrafts, setTimingDrafts] = useState<TimingDrafts>({})
  const [section, setSection] = useState<EditorSection>('audio')
  const scroll = useRef<ScrollView>(null)
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible() === true)
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true))
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false))
    return () => { shown.remove(); hidden.remove() }
  }, [])
  const [position, setPosition] = useState(cue.trimInMs); const [scrub, setScrub] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false); const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [waveformState, setWaveformState] = useState<'loading' | 'ready' | 'error'>('loading'); const [waveformVersion, setWaveformVersion] = useState(0)
  const pending = useRef(0); const lastChange = useRef<{ changes: Partial<AudioCue>; kind: 'setting' | 'draft'; afterSave?: () => void } | null>(null); const changeVersion = useRef(0); const fieldVersions = useRef<Record<string, number>>({})
  const trimVersion = useRef(0)
  const previousCue = useRef(cue)
  const asset = show.media[cue.mediaAssetId]; const duration = asset?.durationMs ?? 0; const mediaUri = asset?.localUri
  const trimEnd = draft.trimOutMs ?? duration; const playable = Boolean(mediaUri && duration > draft.trimInMs && trimEnd > draft.trimInMs)
  const legacy = set.transportMode !== 'oms'
  const orderedSong = set.cueOrder.includes(cue.id)
  const previewing = previewState?.cueId === cue.id && previewState.phase !== 'stopped'
  const playing = previewing && previewState?.phase === 'playing'
  const canonical = library.getSnapshot().shows.find((candidate) => candidate.id === show.id)?.cues[cue.id] ?? cue
  const identityDirty = draft.name !== canonical.name || (draft.notes ?? '') !== (canonical.notes ?? '')
  const timingDirty = Object.entries(timingDrafts).some(([key, text]) => parseSeconds(text!) !== timingMs(canonical.type === 'audio' ? canonical : cue, key as TimingKey, duration))
  const dirty = identityDirty || timingDirty
  const savedCue = canonical.type === 'audio' ? canonical : cue
  const pendingTiming = timingChanges(savedCue, duration, timingDrafts)
  const validDraft = Boolean(draft.name.trim()) && pendingTiming !== null
  const nextCue = orderedSong ? show.cues[set.cueOrder[set.cueOrder.indexOf(cue.id) + 1] ?? ''] : undefined
  const followsNext = legacy ? Boolean(nextCue && savedCue.endBehavior === 'autoFollow') : nextCue?.type === 'audio' && nextCue.autoPlay === true
  const unavailable = busy || saving || libraryState.saving
  const compact = viewport.width < size.contentMax || viewport.fontScale > font.scale.stageMax
  const stackedIdentity = viewport.fontScale > font.scale.stageMax
  const startBehavior = !legacy && orderedSong ? t(savedCue.autoPlay ? 'use.editor.autoStart' : 'use.editor.manualStart') : null
  const endBehavior = t(savedCue.endBehavior === 'loop' ? orderedSong ? 'use.editor.loopEnd' : 'use.editor.hitLoopEnd' : followsNext ? 'use.editor.legacyAutoEnd' : 'use.editor.manualEnd')
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value)
  const time = (value: number) => `${number(value)} s`
  const activePosition = previewing ? Math.max(draft.trimInMs, Math.min(trimEnd - 1, previewState!.positionMs)) : Math.max(draft.trimInMs, Math.min(Math.max(draft.trimInMs, trimEnd - 1), position))
  const artwork = draft.artworkAssetId ? show.visualAssets?.[draft.artworkAssetId] : undefined
  const visual = draft.visualAssetId ? show.visualAssets?.[draft.visualAssetId] : undefined
  const rules = (show.voiceRules ?? []).filter((rule) => rule.cueId === cue.id)

  useEffect(() => {
    let active = true
    setPeaks([]); setWaveformState('loading')
    if (mediaUri) void library.waveform(mediaUri).then((result) => { if (active) { setPeaks(result); setWaveformState('ready') } }).catch(() => { if (active) setWaveformState('error') })
    return () => { active = false }
  }, [mediaUri, library, waveformVersion])
  useEffect(() => {
    const lifecycle = AppState.addEventListener('change', (state) => { if (state !== 'active') void stopPreview().catch(() => undefined) })
    return () => { lifecycle.remove(); void stopPreview().catch(() => undefined) }
  }, [stopPreview, mediaUri])
  // Reconcile external cover/rule changes without losing an identity draft.
  useEffect(() => {
    const previous = previousCue.current; previousCue.current = cue
    if (!pending.current) setDraft((value) => {
      const notes = value.notes === previous.notes ? cue.notes : value.notes
      return { ...cue, name: value.name === previous.name ? cue.name : value.name, ...(notes !== undefined ? { notes } : {}) }
    })
  }, [cue])

  const save = useCallback((changes: Partial<AudioCue>, kind: 'setting' | 'draft' = 'setting', afterSave?: () => void) => {
    const version = ++changeVersion.current
    const trimKeys = (['trimInMs', 'trimOutMs'] as const).filter((key) => key in changes)
    const trimGeneration = trimKeys.length ? ++trimVersion.current : trimVersion.current
    Object.keys(changes).forEach((key) => { fieldVersions.current[key] = version })
    // An explicit trim supersedes that field's older exact draft. Other
    // drafts remain independent, and a failed write restores this intent.
    if (trimKeys.length) setTimingDrafts((current) => {
      const next = { ...current }
      trimKeys.forEach((key) => { delete next[key] })
      return next
    })
    lastChange.current = { changes, kind, ...(afterSave ? { afterSave } : {}) }; pending.current += 1; setSaving(true); setDraft((current) => ({ ...current, ...changes })); setSaveFailed(false); setSaveError('')
    let persisted = false
    void runTask(async () => {
      try {
        if (trimKeys.length) {
          await stopPreview()
          // A stopped audition must be confirmed before changing its bounds.
          // Leaving the editor or a newer trim invalidates this pending write.
          if (!mounted.current || trimGeneration !== trimVersion.current) return null
        }
        await library.updateCue(show.id, cue.id, changes); persisted = true
      } catch (error) {
        // This editor owns its retry and draft reconciliation. A global retry
        // of the raw write would bypass both and could leave stale feedback.
        if (!mounted.current) throw error
        if (version === changeVersion.current) setSaveError(error instanceof Error ? error.message : String(error))
        clearError()
        return null
      }
    }, { silent: true }).then((ok) => {
      pending.current -= 1; if (!mounted.current) return; setSaving(pending.current > 0)
      if (!ok || !persisted) {
        if (version === changeVersion.current) setSaveFailed(true)
        const saved = library.getSnapshot().shows.find((candidate) => candidate.id === show.id)?.cues[cue.id] ?? cue
        // Keep failed trim intent in the exact draft as well as Retry. This
        // protects it when leaving after the saved slider value is restored.
        if (trimKeys.length) setTimingDrafts((current) => ({ ...Object.fromEntries(trimKeys.filter((key) => fieldVersions.current[key] === version && typeof changes[key] === 'number').map((key) => [key, String(changes[key]! / 1000)])), ...current }))
        // Identity drafts remain available for retry after a failed save.
        if (saved.type === 'audio') setDraft((current) => ({ ...current, ...Object.fromEntries(Object.keys(changes).filter((key) => key !== 'name' && key !== 'notes' && fieldVersions.current[key] === version).map((key) => [key, saved[key as keyof AudioCue]])) }))
      } else if (version === changeVersion.current) { setSaveFailed(false); if (kind === 'draft') setTimingDrafts({}); afterSave?.() }
    })
  }, [clearError, cue, library, mounted, runTask, show.id, stopPreview])
  const savePendingDraft = (afterSave?: () => void) => {
    if (unavailable || pending.current > 0 || !validDraft || pendingTiming === null) return
    save({ ...pendingTiming, name: draft.name.trim(), notes: draft.notes ?? '' }, 'draft', afterSave)
  }
  const leave = useCallback((action: () => void) => {
    void runTask(stopPreview, { silent: true }).then((ok) => { if (ok && mounted.current) action() })
  }, [runTask, stopPreview, mounted])
  const requestLeave = useCallback((action: () => void) => {
    if (busy || pending.current) return
    const saved = library.getSnapshot().shows.find((candidate) => candidate.id === show.id)?.cues[cue.id] ?? cue
    const changes = timingChanges(saved.type === 'audio' ? saved : cue, duration, timingDrafts)
    const changedTiming = changes === null || Object.keys(changes).length > 0
    if (draft.name === saved.name && (draft.notes ?? '') === (saved.notes ?? '') && !changedTiming) { leave(action); return }
    Alert.alert(t('workflow.unsaved'), t(changedTiming ? 'refine.unsavedTiming' : 'workflow.unsavedHelp'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('workflow.discard'), style: 'destructive', onPress: () => { if (saved.type === 'audio') setDraft(saved); setTimingDrafts({}); leave(action) } },
      ...(draft.name.trim() && changes !== null ? [{ text: t('common.save'), onPress: () => {
        if (pending.current) return
        save({ ...changes, name: draft.name.trim(), notes: draft.notes ?? '' }, 'draft', () => leave(action))
      } }] : []),
    ])
  }, [busy, library, show.id, cue, draft.name, draft.notes, duration, timingDrafts, t, save, leave])
  useEffect(() => { const handler = BackHandler.addEventListener('hardwareBackPress', () => { requestLeave(onClose); return true }); return () => handler.remove() }, [requestLeave, onClose])

  const audition = (ending = false, positionMs?: number) => {
    const target = positionMs ?? auditionPosition(draft, duration, ending)
    setPosition(Math.max(draft.trimInMs, Math.min(trimEnd - 1, target)))
    void runTask(() => preview(draft, Math.round(Math.max(draft.trimInMs, Math.min(trimEnd - 1, target)))), { silent: true })
  }
  const seconds = (key: TimingKey, label: MessageKey, max: number) => {
    const ms = draft[key] ?? (key === 'trimOutMs' ? duration : key === 'crossfadeMs' ? 2000 : 0)
    const min = key === 'trimOutMs' ? draft.trimInMs + 1 : 0
    const limit = key === 'trimInMs' ? Math.max(0, trimEnd - 1) : max
    const change = (value: number) => { const next = Math.round(value * 1000); if (key === 'trimInMs' || key === 'trimOutMs') setPosition(key === 'trimInMs' ? next : draft.trimInMs); save({ [key]: next }) }
    const locked = unavailable || !playable || key === 'crossfadeMs' && (legacy || !orderedSong)
    const isolated = key !== 'preWaitMs' && key !== 'crossfadeMs'
return <View style={uiStyles.gap}><ValueSlider label={t(label)} value={ms / 1000} min={min / 1000} max={Math.max(min, limit) / 1000} disabled={locked} step={0.001} adjustmentStep={0.1} formatValue={time} onChange={(value) => { setTimingDrafts((current) => { const { [key]: removed, ...rest } = current; void removed; return rest }); change(value) }} {...(isolated ? { onPreview: () => audition(key === 'fadeOutMs' || key === 'trimOutMs') } : {})} /><Disclosure title={t('workflow.exactTiming', { name: t(label) })}><ExactTiming label={t(label)} milliseconds={ms} seconds={timingDrafts[key] ?? String(ms / 1000)} onChange={(value) => setTimingDrafts((current) => ({ ...current, [key]: value }))} min={min} max={Math.max(min, limit)} disabled={locked} onSave={(value) => change(value / 1000)} /></Disclosure></View>
  }
  const attach = (key: 'artworkAssetId' | 'visualAssetId') => {
    void runTask(async () => {
      await stopPreview()
      const imported = await library.importVisual(show.id, undefined, undefined, key === 'artworkAssetId')
      if (imported) { await library.updateCue(show.id, cue.id, { [key]: imported.id }); if (mounted.current) setDraft((current) => ({ ...current, [key]: imported.id })) }
    })
  }
  const remove = (key: 'artworkAssetId' | 'visualAssetId') => Alert.alert(t(key === 'artworkAssetId' ? 'editor.clearArtwork' : 'editor.clearVisual'), t('studio.detachHelp'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.delete'), style: 'destructive', onPress: () => { void runTask(async () => {
      const latest = library.getSnapshot().shows.find((candidate) => candidate.id === show.id); const current = latest?.cues[cue.id]
      if (!latest || current?.type !== 'audio') throw new Error('Song no longer exists')
      const { [key]: removed, ...without } = current; void removed
      await library.saveShow({ ...latest, cues: { ...latest.cues, [cue.id]: without } })
      if (mounted.current) setDraft((value) => { const { [key]: old, ...rest } = value; void old; return rest })
    }) } },
  ])
  const setHitMembership = (value: boolean) => {
    const change = () => { void runTask(async () => {
      const latest = library.getSnapshot().shows.find((candidate) => candidate.id === show.id)
      if (!latest) throw new Error('Show no longer exists')
      await library.saveShow({ ...latest, sets: latest.sets.map((candidate) => candidate.id === set.id ? { ...candidate, hitCueIds: value ? [...new Set([...candidate.hitCueIds, cue.id])] : candidate.hitCueIds.filter((id) => id !== cue.id) } : candidate) })
    }) }
    // Removing a Hit-only song closes this editor when its last set reference
    // disappears. Protect drafts and stop audition through the same exit gate.
    if (!value && !orderedSong) requestLeave(change)
    else change()
  }

  return <ScrollView ref={scroll} testID="song-editor-scroll" style={uiStyles.grow} contentContainerStyle={uiStyles.largeGap} stickyHeaderIndices={[0]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
    <View style={[uiStyles.gap, { backgroundColor: colors.canvas, paddingBottom: space.xs }]}>
    <View style={uiStyles.row}><IconButton label={t('workflow.backPlaylist')} icon="back" disabled={unavailable} onPress={() => requestLeave(onClose)} /><View style={uiStyles.grow}><AppText tone="caption" muted numberOfLines={1}>{set.name}</AppText><AppText tone="label">{t('editor.title')}</AppText></View><Badge label={t(saveFailed ? 'studio.notSaved' : saving || libraryState.saving ? 'studio.saving' : dirty ? 'studio.unsaved' : 'studio.saved')} tone={saveFailed || dirty ? 'warning' : saving ? 'neutral' : 'success'} /></View>
    {!keyboardVisible ? <Segments keepInline={viewport.width > viewport.height} options={(['audio', 'playback', 'details'] as const).map((value) => ({ value, label: t(`use.editor.${value}`) }))} selected={section} onChange={(value) => { setSection(value); scroll.current?.scrollTo({ y: 0, animated: false }) }} /> : null}
    </View>
    <Surface raised style={{ borderColor: colors.accentSurface, borderRadius: radius.xl, padding: space.lg }}>
      <View style={[uiStyles.row, stackedIdentity && { flexDirection: 'column', alignItems: 'center' }]}><CoverTile title={draft.name} uri={artwork?.localUri} hero={!compact} large={compact} /><View style={[uiStyles.grow, stackedIdentity && { alignItems: 'center', gap: space.xxs }]}><AppText tone="eyebrow" style={{ color: colors.accent }}>{t('studio.eyebrow')}</AppText><AppText accessibilityRole="header" accessibilityLabel={draft.name || cue.name} tone="title" numberOfLines={2} adjustsFontSizeToFit maxFontSizeMultiplier={font.scale.stageMax} style={stackedIdentity ? { textAlign: 'center' } : undefined}>{draft.name || cue.name}</AppText><AppText tone="caption" muted>{asset ? `${asset.codec.toUpperCase()} · ${number(asset.sampleRate / 1000)} kHz` : t('studio.missingAudio')}</AppText></View></View>
      <Disclosure title={t('use.editor.savedBehavior')} summary={[startBehavior, endBehavior].filter(Boolean).join(' · ')}><MetricGrid items={[{ label: t('studio.length'), value: sourceClock((trimEnd - draft.trimInMs) / (draft.playbackRate ?? 1)) }, { label: t('studio.speed'), value: `${number(draft.playbackRate ?? 1)}×` }, { label: t('studio.volume'), value: `${number(draft.gainDb)} dB` }]} /><View style={uiStyles.wrap}>{startBehavior ? <Badge label={startBehavior} tone="accent" /> : null}<Badge label={endBehavior} /></View><AppText tone="caption" muted>{t('studio.autosave')}</AppText></Disclosure>
      <View style={uiStyles.row}><View style={uiStyles.grow}><Button label={t(playing ? 'studio.pausePreview' : previewing ? 'studio.resumePreview' : 'studio.playPreview')} variant="primary" disabled={!playable || unavailable} onPress={() => { if (playing) void runTask(pausePreview, { silent: true }); else if (previewing) void runTask(resumePreview, { silent: true }); else audition(false, activePosition) }} /></View><IconButton label={t('editor.stopPreview')} icon="stop" onPress={() => { setPosition(draft.trimInMs); void runTask(stopPreview, { silent: true }) }} /></View>
    </Surface>
    {saveFailed ? <StatusBanner title={t('studio.notSaved')} body={t('editor.savedError')} tone="warning"><Button label={t('common.retry')} disabled={unavailable || lastChange.current?.kind === 'draft' && !validDraft} onPress={() => { if (pending.current > 0) return; if (lastChange.current?.kind === 'draft') savePendingDraft(lastChange.current.afterSave); else if (lastChange.current) save(lastChange.current.changes) }} />{saveError ? <Disclosure title={t('common.diagnostics')}><AppText selectable tone="caption">{saveError}</AppText></Disclosure> : null}</StatusBanner> : null}
    {dirty ? <StatusBanner title={t('studio.unsaved')} body={t(validDraft ? 'use.editor.draftHelp' : 'use.editor.invalidDraft')} tone="warning"><Button label={t('use.editor.saveDraft')} disabled={unavailable || !validDraft} onPress={() => savePendingDraft()} /></StatusBanner> : null}
    <AppText tone="caption" muted accessibilityLiveRegion="polite">{t(`use.editor.${section}Help`)}</AppText>
    {section === 'audio' ? <>
    <SectionCard icon="music" title={t('studio.workspace')} caption={t('studio.previewHelp')}>
      {!playable ? <StatusBanner title={t('studio.missingAudio')} body={t('error.localMedia')} tone="warning" /> : waveformState === 'error' ? <StatusBanner title={t('editor.waveform')} body={t('studio.waveformError')} tone="warning"><Button label={t('common.retry')} disabled={unavailable} onPress={() => setWaveformVersion((value) => value + 1)} /></StatusBanner> : waveformState === 'loading' ? <AppText tone="caption" muted accessibilityLiveRegion="polite">{t('editor.waveform')} · {t('common.loading')}</AppText> : null}
      <ValueSlider label={t('editor.waveform')} value={activePosition / 1000} min={0} max={duration / 1000} interactionRange={{ min: draft.trimInMs / 1000, max: (trimEnd - 1) / 1000 }} disabled={!playable || unavailable} formatValue={(value) => sourceClock(value * 1000)} step={0.001} adjustmentStep={1} continuous={scrub} peaks={peaks} waveformRange={{ start: draft.trimInMs / 1000, end: trimEnd / 1000 }} onChange={(value) => {
        const ms = Math.max(draft.trimInMs, Math.min(trimEnd - 1, Math.round(value * 1000))); setPosition(ms)
        if (scrub || previewing) void runTask(() => scrubPreview(draft, ms, scrub), { silent: true })
      }} />
      <SwitchRow title={t('editor.scrub')} body={t('studio.scrubHelp')} value={scrub} disabled={!playable || unavailable} onValueChange={setScrub} />
      <MetricGrid items={[{ label: t('editor.trimStart'), value: sourceClock(draft.trimInMs) }, { label: t('editor.trimEnd'), value: sourceClock(trimEnd) }]} />
      <Disclosure title={t('studio.trim')} summary={t('studio.trimHelp')}>
        {seconds('trimInMs', 'editor.trimStart', duration)}{seconds('trimOutMs', 'editor.trimEnd', duration)}
        <View style={uiStyles.wrap}><Button label={t('studio.markStart')} disabled={unavailable || !playable || Math.round(activePosition) >= trimEnd - 1} onPress={() => save({ trimInMs: Math.round(activePosition) })} /><Button label={t('studio.markEnd')} disabled={unavailable || !playable || Math.round(activePosition) <= draft.trimInMs} onPress={() => save({ trimOutMs: Math.round(activePosition) })} /></View>
      </Disclosure>
    </SectionCard>
    <SectionCard icon="sliders" title={t('editor.sound')} caption={t('studio.soundHelp')}>
      <ValueSlider label={t('editor.volume')} value={draft.gainDb} min={-96} max={Math.max(6, cue.gainDb)} step={0.5} formatValue={(value) => `${number(value)} dB`} disabled={unavailable || !playable} onChange={(gainDb) => save({ gainDb })} onPreview={() => audition()} />
      <ValueSlider label={t('editor.speed')} value={draft.playbackRate ?? 1} min={0.7} max={2} step={0.05} formatValue={(value) => `${number(value)}×`} disabled={unavailable || !playable} onChange={(playbackRate) => save({ playbackRate })} onPreview={() => audition()} />
    </SectionCard>
    </> : null}
    {section === 'playback' ? <SectionCard icon="rehearse" title={t('editor.timing')} caption={t('studio.timingHelp')}>
      {legacy ? <AppText tone="caption" muted>{t('studio.legacy')}</AppText> : null}
      {!orderedSong ? <AppText tone="caption" muted>{t('use.editor.hitPlaybackHelp')}</AppText> : null}
      <Disclosure title={t('studio.fades')} summary={`${time(draft.fadeInMs / 1000)} / ${time(draft.fadeOutMs / 1000)}`}>
        {seconds('fadeInMs', 'editor.fadeIn', 30000)}{seconds('fadeOutMs', 'editor.fadeOut', 30000)}
        <AppText tone="caption" muted>{t('editor.curve')}</AppText><View style={uiStyles.wrap}>{(['linear', 'smooth', 'equalPower'] as const).map((curve) => <ChoiceChip key={curve} disabled={unavailable} label={t(`editor.${curve}`)} selected={draft.fadeCurve === curve} onPress={() => save({ fadeCurve: curve })} />)}</View>
      </Disclosure>
      <SwitchRow title={t('builder.loop')} body={t(orderedSong ? 'studio.loopHelp' : 'use.editor.hitLoopEnd')} disabled={unavailable} value={draft.endBehavior === 'loop'} onValueChange={(value) => save({ endBehavior: value ? 'loop' : 'stopAndReadyNext' })} />
      <SwitchRow title={t('editor.autoplay')} {...(!legacy ? { body: t('studio.autoplayHelp') } : {})} disabled={unavailable || !orderedSong} value={legacy ? draft.endBehavior === 'autoFollow' : draft.autoPlay ?? false} onValueChange={(value) => save(legacy ? { endBehavior: value ? 'autoFollow' : 'stopAndReadyNext' } : { autoPlay: value })} />
      <Disclosure title={t('editor.delay')} summary={time(draft.preWaitMs / 1000)}>{seconds('preWaitMs', 'editor.delay', 60000)}</Disclosure>
      <SwitchRow title={t('editor.crossfade')} body={t('studio.crossfadeHelp')} disabled={unavailable || legacy || !orderedSong} value={draft.crossfadeEnabled ?? false} onValueChange={(value) => save({ crossfadeEnabled: value })} />
      {draft.crossfadeEnabled ? seconds('crossfadeMs', 'editor.crossfadeDuration', 30000) : null}
      {draft.crossfadeEnabled && !legacy && (!orderedSong || nextCue?.type !== 'audio' || !nextCue.autoPlay) ? <AppText tone="caption" style={{ color: colors.warning }}>{t('studio.crossfadeInactive')}</AppText> : draft.crossfadeEnabled && !legacy && draft.endBehavior === 'loop' ? <AppText tone="caption" muted>{t('refine.loopCrossfade')}</AppText> : null}
      <TaskRow label={t('nav.rehearsal')} body={t('studio.rehearseHelp')} disabled={unavailable} onPress={() => requestLeave(() => router.push('/rehearsal'))} />
    </SectionCard> : null}
    {section === 'details' ? <>
    <SectionCard icon="list" title={t('workflow.details')} caption={t('studio.identityHelp')}>
      <Field label={t('common.name')} value={draft.name} maxLength={256} disabled={unavailable} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
      <Field label={t('editor.notes')} value={draft.notes ?? ''} multiline maxLength={8192} disabled={unavailable} onChange={(value) => setDraft((current) => ({ ...current, notes: value }))} />
      <Button label={t('common.save')} disabled={unavailable || !validDraft || !dirty} onPress={() => savePendingDraft()} />
      <Button label={t('editor.reset')} variant="ghost" disabled={unavailable || !dirty} onPress={() => { if (canonical.type === 'audio') { setDraft(canonical); setTimingDrafts({}); setSaveFailed(false) } }} />
      <SwitchRow title={t('editor.hit')} body={t('studio.hitHelp')} disabled={unavailable} value={set.hitCueIds.includes(cue.id)} onValueChange={setHitMembership} />
    </SectionCard>
    <SectionCard icon="library" title={t('editor.color')}><View style={uiStyles.wrap}>{(['red', 'yellow', 'green', 'blue', 'purple', 'orange', 'none'] as const).map((token) => <ChoiceChip key={token} disabled={unavailable} label={t(`tag.${token}`)} selected={canonicalColor(draft.colorToken) === token} onPress={() => save({ colorToken: token })} />)}</View><Disclosure title={t('finder.categories')} summary={songCategories(draft).map((category) => t(('category.' + category) as MessageKey)).join(' · ') || t('finder.categoryHelp')}><CategoryPicker selected={songCategories(draft)} disabled={unavailable} onChange={(categories) => save({ tags: categoryTags(draft.tags, categories) })} />{songCategories(draft).length ? <><Button label={t('finder.preset')} disabled={unavailable} onPress={() => Alert.alert(t('finder.preset'), t('finder.presetHelp'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.save'), onPress: () => save(categoryPreset(songCategories(draft)[0]!)) }])} /><AppText tone="caption" muted>{t('finder.presetHelp')}</AppText></> : null}</Disclosure></SectionCard>
    <SectionCard icon="display" title={t('editor.media')} caption={t('studio.visualHelp')}>
      <View style={uiStyles.row}><CoverTile title={draft.name} uri={artwork?.localUri} /><View style={uiStyles.grow}><AppText tone="label">{t('editor.artwork')}</AppText><AppText tone="caption" muted>{t(artwork ? 'studio.attached' : 'studio.noCover')}</AppText></View></View>
      <View style={uiStyles.wrap}><Button label={t('editor.artwork')} disabled={unavailable} onPress={() => attach('artworkAssetId')} /><Button label={t('editor.clearArtwork')} variant="ghost" disabled={unavailable || !draft.artworkAssetId} onPress={() => remove('artworkAssetId')} /></View>
      <View style={uiStyles.row}><CoverTile title={t('editor.visual')} uri={visual?.kind === 'image' ? visual.localUri : undefined} /><View style={uiStyles.grow}><AppText tone="label">{t('editor.visual')}</AppText><AppText tone="caption" muted>{visual ? `${t(visual.kind === 'image' ? 'studio.image' : 'studio.video')} · ${visual.width} × ${visual.height}` : t('studio.noVisual')}</AppText></View></View>
      <View style={uiStyles.wrap}><Button label={t('editor.visual')} disabled={unavailable} onPress={() => attach('visualAssetId')} /><Button label={t('editor.clearVisual')} variant="ghost" disabled={unavailable || !draft.visualAssetId} onPress={() => remove('visualAssetId')} /></View>
      <TaskRow label={t('ai.generateCover')} body={t('studio.coverHelp')} disabled={unavailable} onPress={() => requestLeave(() => router.push({ pathname: '/assistant' as never, params: { cueId: cue.id } }))} />
    </SectionCard>
    <SectionCard icon="mic" title={t('editor.voice')} caption={t('studio.voiceHelp')}>
      {rules.length ? rules.map((rule) => <View key={rule.id} style={uiStyles.row}><View style={uiStyles.grow}><AppText>{rule.phrases.join(' / ')}</AppText><AppText tone="caption" muted>{t(`command.${rule.action.type}` as MessageKey)} · {time(rule.delayMs / 1000)}</AppText></View><Badge label={t(rule.enabled ? 'voice.enabled' : 'studio.disabled')} tone={rule.enabled ? 'accent' : 'neutral'} /></View>) : <AppText tone="caption" muted>{t('studio.noRules')}</AppText>}
      <TaskRow label={t('editor.voice')} disabled={unavailable} onPress={() => requestLeave(() => router.push({ pathname: '/voice' as never, params: { cueId: cue.id } }))} />
    </SectionCard>
    </> : null}
    <Button label={t('workflow.backPlaylist')} disabled={unavailable} onPress={() => requestLeave(onClose)} />
  </ScrollView>
}

