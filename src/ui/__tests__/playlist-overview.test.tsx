import { render } from '@testing-library/react-native'
import { sampleShow, type AudioCue, type Show } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import { PlaylistSummary, SongMetadata, playlistOverview } from '../song-metadata'

function fixture(): Show {
  const original = structuredClone(sampleShow); const opening = original.cues.opening as AudioCue
  return { ...original, cues: { ...original.cues, opening: { ...opening, trimInMs: 5000, trimOutMs: 21000, playbackRate: 2, preWaitMs: 4000, endBehavior: 'loop' } }, sets: [{ ...original.sets[0]!, transportMode: 'oms', cueOrder: ['opening', 'bed'] }] }
}
describe('playlist overview without an invented show duration', () => {
  it('uses compact behaviour labels and keeps disabled legacy crossfade out of summaries', () => {
    const cue = { ...fixture().cues.opening as AudioCue, autoPlay: true, crossfadeEnabled: true, visualAssetId: 'video' }
    const asset = fixture().media[cue.mediaAssetId]
    const screen = render(<I18nProvider><SongMetadata cue={cue} asset={asset} transportMode="oms" /></I18nProvider>)
    for (const key of ['refine.autoplay', 'refine.trim', 'refine.delay', 'refine.crossfade', 'refine.visual'] as const) expect(screen.getByText(messages.en[key])).toBeTruthy()
    expect(screen.queryByText(messages.en['editor.visual'])).toBeNull()
    screen.rerender(<I18nProvider><SongMetadata cue={cue} asset={asset} transportMode="legacyCueStack" /></I18nProvider>)
    expect(screen.queryByText(messages.en['refine.crossfade'])).toBeNull(); expect(screen.queryByText(messages.en['refine.autoplay'])).toBeNull()
  })
  it('measures one audio pass from trim and rate while keeping independent Hits out of its duration', () => {
    const show = fixture(); const before = JSON.stringify(show)
    expect(playlistOverview(show, show.sets[0]!)).toEqual({ cues: 2, hits: 1, audioMs: 120000, loops: true })
    expect(JSON.stringify(show)).toBe(before)
    const screen = render(<I18nProvider><PlaylistSummary show={show} set={show.sets[0]!} /></I18nProvider>)
    expect(screen.getByLabelText(messages.en['refine.audioPass'] + ': 2:00.000')).toBeTruthy()
    expect(screen.getByText(messages.en['refine.loopTiming'])).toBeTruthy()
  })
  it('does not invent a duration for legacy groups, wait/fade cues, or missing audio', () => {
    expect(playlistOverview(sampleShow, sampleShow.sets[0]!).audioMs).toBeNull()
    const show = fixture(); const { 'media-open': removed, ...media } = show.media; void removed
    expect(playlistOverview({ ...show, media }, show.sets[0]!).audioMs).toBeNull()
  })
  it('shows an empty playlist honestly without reporting a loop or starting a preview', () => {
    const show = fixture(); const set = { ...show.sets[0]!, cueOrder: [], hitCueIds: [] }
    expect(playlistOverview(show, set)).toEqual({ cues: 0, hits: 0, audioMs: 0, loops: false })
  })
})
