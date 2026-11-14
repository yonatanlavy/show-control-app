import { View } from 'react-native'
import type { AudioCue, MediaAsset, Show, ShowSet, TransportMode } from '../domain'
import { useI18n, type MessageKey } from '../i18n'
import { AppText, Badge, uiStyles } from './primitives'
import { MetricGrid } from './MetricGrid'
import { sourceClock } from './timing'

export function playableDuration(cue: AudioCue, asset?: MediaAsset) {
  return Math.max(0, (cue.trimOutMs ?? asset?.durationMs ?? 0) - cue.trimInMs) / (cue.playbackRate ?? 1)
}
export function playlistOverview(show: Show, set: ShowSet) {
  const cues = set.cueOrder.map((id) => show.cues[id])
  const measurable = cues.every((cue) => cue?.type === 'audio' && show.media[cue.mediaAssetId])
  return { cues: cues.length, hits: set.hitCueIds.length, audioMs: measurable ? cues.reduce((total, cue) => total + (cue?.type === 'audio' ? playableDuration(cue, show.media[cue.mediaAssetId]) : 0), 0) : null, loops: cues.some((cue) => cue?.type === 'audio' && cue.endBehavior === 'loop') }
}
export function PlaylistSummary({ show, set }: { show: Show; set: ShowSet }) {
  const { t, locale } = useI18n(); const overview = playlistOverview(show, set)
  return <View style={uiStyles.gap}><MetricGrid items={[
    { label: t('refine.cues'), value: overview.cues.toLocaleString(locale) },
    { label: t('refine.audioPass'), value: overview.audioMs === null ? t('common.notMeasured') : sourceClock(overview.audioMs), neutral: overview.audioMs !== null },
    { label: t('run.hits'), value: overview.hits.toLocaleString(locale) },
  ]} />{overview.loops ? <AppText tone="caption" muted>{t('refine.loopTiming')}</AppText> : null}</View>
}
export function SongMetadata({ cue, asset, transportMode }: { cue: AudioCue; asset?: MediaAsset | undefined; transportMode?: TransportMode | undefined }) {
  const { t } = useI18n()
  const flags: MessageKey[] = []
  if (cue.endBehavior === 'loop') flags.push('builder.loop')
  if (transportMode === 'oms' ? cue.autoPlay : cue.endBehavior === 'autoFollow') flags.push('refine.autoplay')
  if (cue.trimInMs > 0 || (cue.trimOutMs !== undefined && cue.trimOutMs < (asset?.durationMs ?? cue.trimOutMs))) flags.push('refine.trim')
  if (cue.preWaitMs > 0) flags.push('refine.delay')
  if (transportMode === 'oms' && cue.crossfadeEnabled) flags.push('refine.crossfade')
  if (cue.visualAssetId) flags.push('refine.visual')
  return flags.length ? <View style={uiStyles.wrap}>{flags.map((key) => <Badge key={key} label={t(key)} />)}</View> : null
}
