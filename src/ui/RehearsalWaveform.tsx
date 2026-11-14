import { useEffect, useState } from 'react'
import type { ResolvedCue } from '../domain'
import type { LibraryStore } from '../library'
import { useI18n } from '../i18n'
import { AppText, Button, StatusBanner, ValueSlider } from './primitives'
import { sourceClock } from './timing'

/** Mounted only while seeking tools are open; native transport remains the owner. */
export function RehearsalWaveform({ audio, library, sourcePositionMs, disabled, retryDisabled, onSeek }: {
  audio: Extract<ResolvedCue, { type: 'audio' }>; library: LibraryStore
  sourcePositionMs: number; disabled: boolean; retryDisabled: boolean; onSeek: (positionMs: number) => void
}) {
  const { t } = useI18n()
  const [version, setVersion] = useState(0)
  const [waveform, setWaveform] = useState<{ key: string; peaks: readonly number[]; failed: boolean } | null>(null)
  const asset = audio.mediaAsset; const uri = asset?.localUri
  const key = `${uri ?? ''}:${version}`
  const observed = waveform?.key === key ? waveform : null
  const trimEnd = audio.trimOutMs ?? asset?.durationMs ?? 0
  const peaks = observed?.peaks ?? []
  const trimmedPeaks = asset?.durationMs ? peaks.slice(Math.floor(peaks.length * audio.trimInMs / asset.durationMs), Math.ceil(peaks.length * trimEnd / asset.durationMs)) : peaks
  useEffect(() => {
    let active = true
    if (uri) void library.waveform(uri).then((peaks) => { if (active) setWaveform({ key, peaks, failed: false }) }).catch(() => { if (active) setWaveform({ key, peaks: [], failed: true }) })
    return () => { active = false }
  }, [library, uri, key])
  return <>
    {uri && !observed ? <AppText tone="caption" muted accessibilityLiveRegion="polite">{t('editor.waveform')} · {t('common.loading')}</AppText> : null}
    <ValueSlider label={t('editor.waveform')} value={Math.min(trimEnd - 1, Math.max(audio.trimInMs, sourcePositionMs)) / 1000} min={audio.trimInMs / 1000} max={Math.max(audio.trimInMs, trimEnd - 1) / 1000} step={0.001} adjustmentStep={1} peaks={trimmedPeaks} disabled={disabled} formatValue={(value) => sourceClock(value * 1000)} onChange={(value) => onSeek(Math.round(value * 1000))} />
    {observed?.failed ? <StatusBanner title={t('editor.waveform')} body={t('studio.waveformError')} tone="warning"><Button label={t('common.retry')} disabled={retryDisabled} onPress={() => setVersion((version) => version + 1)} /></StatusBanner> : null}
  </>
}
