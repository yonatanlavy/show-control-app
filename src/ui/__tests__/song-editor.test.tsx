import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import type { NativePreviewState } from '../../audio/contracts'
import { sampleShow, type AudioCue, type Show } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import { SongEditor, auditionPosition, sourceClock } from '../song-editor'

const mockRouter = { push: jest.fn() }
const mockLibrary = { getSnapshot: () => ({ shows: [mockShow] }), updateCue: jest.fn(), saveShow: jest.fn(), importVisual: jest.fn(), waveform: jest.fn() }
let mockShow: Show
const mockApp = { library: mockLibrary, libraryState: { saving: false }, busy: false, previewState: null as NativePreviewState | null,
  preview: jest.fn(), pausePreview: jest.fn(), resumePreview: jest.fn(), scrub: jest.fn(), stopPreview: jest.fn(), clearError: jest.fn(),
  runTask: async (work: () => Promise<unknown>) => { try { await work(); return true } catch { return false } },
}
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))
function cue(): AudioCue { const value = mockShow.cues.opening; if (value?.type !== 'audio') throw Error('Fixture'); return value }
function mount(onClose = jest.fn()) { return render(<I18nProvider><SongEditor cue={cue()} show={mockShow} set={mockShow.sets[0]!} onClose={onClose} /></I18nProvider>) }
beforeEach(() => {
  jest.clearAllMocks(); mockShow = structuredClone(sampleShow); mockApp.previewState = null; mockApp.busy = false
  mockLibrary.waveform.mockResolvedValue([0.1, 0.9, 0.4]); mockLibrary.updateCue.mockResolvedValue(undefined)
  mockLibrary.importVisual.mockResolvedValue(null); mockApp.stopPreview.mockResolvedValue(undefined)
  mockApp.preview.mockResolvedValue(undefined); mockApp.pausePreview.mockResolvedValue(undefined); mockApp.resumePreview.mockResolvedValue(undefined); mockApp.scrub.mockResolvedValue(undefined)
})

describe('song studio editing and isolated audition', () => {
  it('retains an exact draft across collapsed panels and guards Back, saving timing and identity together', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined); const close = jest.fn(); const screen = mount(close)
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.playback'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['studio.fades'] }))
    const exact = messages.en['workflow.exactTiming'].replace('{name}', messages.en['editor.fadeIn'])
    fireEvent.press(screen.getByRole('button', { name: exact }))
    fireEvent.changeText(screen.getAllByLabelText(messages.en['editor.fadeIn']).find((node) => typeof node.props.value === 'string')!, '0,053')
    fireEvent.press(screen.getByRole('button', { name: exact })); fireEvent.press(screen.getByRole('button', { name: exact }))
    expect(screen.getAllByLabelText(messages.en['editor.fadeIn']).find((node) => typeof node.props.value === 'string')!.props.value).toBe('0.053')
    fireEvent.press(screen.getAllByRole('button', { name: messages.en['workflow.backPlaylist'] })[0]!)
    expect(close).not.toHaveBeenCalled(); expect(alert).toHaveBeenCalledWith(messages.en['workflow.unsaved'], messages.en['refine.unsavedTiming'], expect.any(Array))
    await act(async () => { alert.mock.calls.at(-1)![2]!.find((button) => button.text === messages.en['common.save'])!.onPress!() })
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
    expect(mockLibrary.updateCue).toHaveBeenCalledWith(mockShow.id, 'opening', expect.objectContaining({ fadeInMs: 53, name: cue().name }))
    alert.mockRestore()
  })
  it('retains failed exact saves and blocks invalid timing drafts from Save on exit', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined); const close = jest.fn(); const screen = mount(close)
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.playback'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['studio.fades'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['workflow.exactTiming'].replace('{name}', messages.en['editor.fadeIn']) }))
    fireEvent.changeText(screen.getAllByLabelText(messages.en['editor.fadeIn']).find((node) => typeof node.props.value === 'string')!, '0.053')
    mockLibrary.updateCue.mockRejectedValueOnce(new Error('ENOSPC'))
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.saveField'].replace('{name}', messages.en['editor.fadeIn']) }))
    await waitFor(() => expect(screen.getByText(messages.en['editor.savedError'])).toBeTruthy())
    expect(screen.getAllByLabelText(messages.en['editor.fadeIn']).find((node) => typeof node.props.value === 'string')!.props.value).toBe('0.053')
    fireEvent.changeText(screen.getAllByLabelText(messages.en['editor.fadeIn']).find((node) => typeof node.props.value === 'string')!, '-1')
    fireEvent.press(screen.getAllByRole('button', { name: messages.en['workflow.backPlaylist'] })[0]!)
    expect(alert.mock.calls.at(-1)![2]!.some((button) => button.text === messages.en['common.save'])).toBe(false)
    expect(close).not.toHaveBeenCalled(); expect(mockLibrary.updateCue).toHaveBeenCalledTimes(1)
    alert.mockRestore()
  })
  it('opens silently with units and durable saving guidance', () => {
    const screen = mount()
    expect(mockApp.preview).not.toHaveBeenCalled()
    expect(screen.getByRole('adjustable', { name: messages.en['editor.volume'] }).props.accessibilityValue.text).toContain('dB')
    expect(screen.getByRole('adjustable', { name: messages.en['editor.speed'] }).props.accessibilityValue.text).toContain('×')
    expect(screen.getByRole('button', { name: messages.en['use.editor.savedBehavior'] }).props.accessibilityState.expanded).toBe(false)
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.savedBehavior'] }))
    expect(screen.getByText(messages.en['studio.autosave'])).toBeTruthy()
  })
  it.each([
    ['studio.trim', 'editor.trimStart', '78'],
    ['studio.trim', 'editor.trimEnd', '0'],
    ['editor.delay', 'editor.delay', '60.001'],
  ] as const)('blocks invalid %s / %s timing on exit', (panel, label, value) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    try {
      const close = jest.fn(); const screen = mount(close)
      if (panel === 'editor.delay') fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.playback'] }))
      fireEvent.press(screen.getByRole('button', { name: messages.en[panel] }))
      fireEvent.press(screen.getByRole('button', { name: messages.en['workflow.exactTiming'].replace('{name}', messages.en[label]) }))
      fireEvent.changeText(screen.getAllByLabelText(messages.en[label]).find((node) => typeof node.props.value === 'string')!, value)
      fireEvent.press(screen.getAllByRole('button', { name: messages.en['workflow.backPlaylist'] })[0]!)
      expect(alert.mock.calls.at(-1)![2]!.some((button) => button.text === messages.en['common.save'])).toBe(false)
      expect(close).not.toHaveBeenCalled(); expect(mockLibrary.updateCue).not.toHaveBeenCalled()
    } finally { alert.mockRestore() }
  })
  it.each([0.7, 1, 2])('auditions a real-time fade-out at a source position for %s×', async (rate) => {
    const source = cue(); mockShow = { ...mockShow, cues: { ...mockShow.cues, opening: { ...source, playbackRate: rate, trimOutMs: 12000, fadeOutMs: 2000 } } }
    const screen = mount(); fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.playback'] })); fireEvent.press(screen.getByRole('button', { name: messages.en['studio.fades'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.preview'] + ' · ' + messages.en['editor.fadeOut'] }))
    await waitFor(() => expect(mockApp.preview).toHaveBeenCalledWith(expect.objectContaining({ fadeOutMs: 2000, playbackRate: rate }), Math.round(12000 - 2750 * rate)))
  })
  it('clamps the audition of a fade longer than the trimmed clip', () => {
    expect(auditionPosition({ ...cue(), trimInMs: 9000, trimOutMs: 9100, fadeOutMs: 30000, playbackRate: 2 }, 10000, true)).toBe(9000)
    expect(sourceClock(90061)).toBe('1:30.061')
  })
  it('rejects exact trims that leave an empty or reversed interval', async () => {
    const screen = mount(); fireEvent.press(screen.getByRole('button', { name: messages.en['studio.trim'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['workflow.exactTiming'].replace('{name}', messages.en['editor.trimEnd']) }))
    fireEvent.changeText(screen.getByDisplayValue(String((cue().trimOutMs ?? mockShow.media[cue().mediaAssetId]!.durationMs) / 1000)), '0')
    expect(screen.getByRole('button', { name: messages.en['common.saveField'].replace('{name}', messages.en['editor.trimEnd']) })).toBeDisabled()
    expect(mockLibrary.updateCue).not.toHaveBeenCalled()
  })
  it('shows a native paused position and seeks silently until audible scrubbing is enabled', async () => {
    mockApp.previewState = { type: 'PREVIEW_STATE', generation: 5, cueId: 'opening', phase: 'paused', positionMs: 5000, trimInMs: 0, trimOutMs: 12000 }
    const screen = mount()
    expect(screen.getByRole('button', { name: messages.en['studio.resumePreview'] })).toBeTruthy()
    fireEvent(screen.getByRole('adjustable', { name: messages.en['editor.waveform'] }), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    await waitFor(() => expect(mockApp.scrub).toHaveBeenCalledWith(expect.any(Object), 6000, false))
    expect(mockApp.resumePreview).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['studio.resumePreview'] }))
    expect(mockApp.resumePreview).toHaveBeenCalledTimes(1)
  })
  it('keeps paused waveform adjustments inside the trim without losing the next one-second seek', async () => {
    mockShow = { ...mockShow, cues: { ...mockShow.cues, opening: { ...cue(), trimInMs: 10000, trimOutMs: 12000 } } }
    mockApp.previewState = { type: 'PREVIEW_STATE', generation: 5, cueId: 'opening', phase: 'paused', positionMs: 10000, trimInMs: 10000, trimOutMs: 12000 }
    const screen = mount(); const label = messages.en['editor.waveform']
    expect(screen.getByRole('button', { name: messages.en['common.decrease'] + ' · ' + label })).toBeDisabled()
    const position = screen.getByRole('adjustable', { name: label })
    expect(position.props.accessibilityValue).toMatchObject({ min: 10, max: 11.999, now: 10 })
    fireEvent(position, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } })
    expect(mockApp.scrub).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.increase'] + ' · ' + label }))
    await waitFor(() => expect(mockApp.scrub).toHaveBeenCalledWith(expect.any(Object), 11000, false))
    expect(mockApp.preview).not.toHaveBeenCalled(); expect(mockApp.resumePreview).not.toHaveBeenCalled()
  })
  it('clamps a paused waveform increase to the final playable millisecond and disables further increases', async () => {
    mockShow = { ...mockShow, cues: { ...mockShow.cues, opening: { ...cue(), trimInMs: 10000, trimOutMs: 12000 } } }
    mockApp.previewState = { type: 'PREVIEW_STATE', generation: 5, cueId: 'opening', phase: 'paused', positionMs: 11900, trimInMs: 10000, trimOutMs: 12000 }
    const screen = mount(); const label = messages.en['editor.waveform']
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.increase'] + ' · ' + label }))
    await waitFor(() => expect(mockApp.scrub).toHaveBeenCalledWith(expect.any(Object), 11999, false))
    mockApp.previewState = { ...mockApp.previewState, positionMs: 11999 }
    screen.rerender(<I18nProvider><SongEditor cue={cue()} show={mockShow} set={mockShow.sets[0]!} onClose={jest.fn()} /></I18nProvider>)
    expect(screen.getByRole('button', { name: messages.en['common.increase'] + ' · ' + label })).toBeDisabled()
    fireEvent(screen.getByRole('adjustable', { name: label }), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    expect(mockApp.scrub).toHaveBeenCalledTimes(1)
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.decrease'] + ' · ' + label }))
    await waitFor(() => expect(mockApp.scrub).toHaveBeenLastCalledWith(expect.any(Object), 10999, false))
    expect(mockApp.preview).not.toHaveBeenCalled(); expect(mockApp.resumePreview).not.toHaveBeenCalled()
  })
  it('can stop an audition even while other preparation is busy', async () => {
    mockApp.busy = true
    const screen = mount(); const stop = screen.getByRole('button', { name: messages.en['editor.stopPreview'] })
    expect(stop).toBeEnabled(); fireEvent.press(stop)
    await waitFor(() => expect(mockApp.stopPreview).toHaveBeenCalled())
  })
  it('blocks Back while a song setting is being saved', async () => {
    let finish!: () => void; mockLibrary.updateCue.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    const close = jest.fn(); const screen = mount(close)
    fireEvent(screen.getByRole('adjustable', { name: messages.en['editor.speed'] }), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    expect(screen.getByText(messages.en['studio.saving'])).toBeTruthy()
    expect(screen.getAllByRole('button', { name: messages.en['workflow.backPlaylist'] })[0]).toBeDisabled()
    expect(close).not.toHaveBeenCalled(); await act(async () => finish())
  })
  it('does not attach anything when the image-only cover picker is cancelled', async () => {
    const screen = mount(); fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.details'] })); fireEvent.press(screen.getByRole('button', { name: messages.en['editor.artwork'] }))
    await waitFor(() => expect(mockLibrary.importVisual).toHaveBeenCalledWith(mockShow.id, undefined, undefined, true))
    expect(mockLibrary.updateCue).not.toHaveBeenCalled()
  })
  it('protects a cover removal with a confirmation', async () => {
    const source = cue(); mockShow = { ...mockShow, cues: { ...mockShow.cues, opening: { ...source, artworkAssetId: 'cover' } } }
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    try {
      const screen = mount(); fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.details'] })); fireEvent.press(screen.getByRole('button', { name: messages.en['editor.clearArtwork'] }))
      expect(mockLibrary.saveShow).not.toHaveBeenCalled()
      await act(async () => alert.mock.calls[0]![2]!.find((button) => button.style === 'destructive')!.onPress?.())
      expect(mockLibrary.saveShow.mock.calls[0]![0].cues.opening.artworkAssetId).toBeUndefined()
    } finally { alert.mockRestore() }
  })
  it('stops preview before navigating to the captured song’s voice rules', async () => {
    const screen = mount(); fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.details'] })); fireEvent.press(screen.getByRole('button', { name: messages.en['editor.voice'] }))
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/voice', params: { cueId: 'opening' } }))
    expect(mockApp.stopPreview.mock.invocationCallOrder[0]).toBeLessThan(mockRouter.push.mock.invocationCallOrder[0]!)
  })
  it('makes waveform failure recoverable without starting audio', async () => {
    mockLibrary.waveform.mockRejectedValueOnce(new Error('unreadable'))
    const screen = mount(); await waitFor(() => expect(screen.getByText(messages.en['studio.waveformError'])).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] }))
    await waitFor(() => expect(screen.queryByText(messages.en['studio.waveformError'])).toBeNull())
    expect(mockLibrary.waveform).toHaveBeenCalledTimes(2); expect(mockApp.preview).not.toHaveBeenCalled()
  })
  it('disables audition and trim controls for a missing audio asset', () => {
    mockShow = { ...mockShow, media: {} }; const screen = mount()
    expect(screen.getByRole('button', { name: messages.en['studio.playPreview'] })).toBeDisabled()
    expect(screen.getByRole('adjustable', { name: messages.en['editor.waveform'] })).toBeDisabled()
    expect(screen.getByRole('adjustable', { name: messages.en['editor.speed'] })).toBeDisabled()
  })
  it('warns when crossfade has no eligible incoming song', () => {
    mockShow = { ...mockShow, sets: mockShow.sets.map((set) => ({ ...set, transportMode: 'oms' as const, cueOrder: ['opening', 'bed'] })) }
    const source = cue(); mockShow = { ...mockShow, cues: { ...mockShow.cues, opening: { ...source, crossfadeEnabled: true, endBehavior: 'loop' } } }
    const screen = mount(); fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.playback'] })); expect(screen.getByText(messages.en['studio.crossfadeInactive'])).toBeTruthy()
  })
  it('shows only this song’s local voice rules', () => {
    mockShow = { ...mockShow, voiceRules: [
      { id: 'local', cueId: 'opening', phrases: ['music please'], locale: 'en', enabled: true, action: { type: 'GO' }, delayMs: 0 },
      { id: 'other', cueId: 'bed', phrases: ['other song'], locale: 'en', enabled: true, action: { type: 'GO' }, delayMs: 0 },
    ] }
    const screen = mount(); fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.details'] })); expect(screen.getByText('music please')).toBeTruthy(); expect(screen.queryByText('other song')).toBeNull()
  })
  it('preserves legacy auto-follow through the autoplay control', async () => {
    mockShow = { ...mockShow, sets: mockShow.sets.map((set) => ({ ...set, transportMode: 'legacyCueStack' })) }
    const screen = mount(); fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.playback'] })); fireEvent(screen.getByRole('switch', { name: messages.en['editor.autoplay'] }), 'valueChange', true)
    await waitFor(() => expect(mockLibrary.updateCue).toHaveBeenCalledWith(mockShow.id, 'opening', { endBehavior: 'autoFollow' }))
    expect(screen.getByRole('switch', { name: messages.en['editor.crossfade'] })).toBeDisabled()
  })
  it('keeps saved independent volume settings outside the normal positive range readable', () => {
    mockShow = { ...mockShow, cues: { ...mockShow.cues, opening: { ...cue(), gainDb: 9 } } }
    const screen = mount(); const value = screen.getByRole('adjustable', { name: messages.en['editor.volume'] }).props.accessibilityValue
    expect(value.now).toBe(9); expect(value.max).toBe(9)
    expect(mockLibrary.updateCue).not.toHaveBeenCalled()
  })
  it('explains deliberate loop crossfades and keeps delay/overlap out of isolated preview', () => {
    mockShow = { ...mockShow, sets: mockShow.sets.map((set) => ({ ...set, transportMode: 'oms' as const, cueOrder: ['opening', 'bed'] })), cues: { ...mockShow.cues, opening: { ...cue(), endBehavior: 'loop', crossfadeEnabled: true }, bed: { ...mockShow.cues.bed as AudioCue, autoPlay: true } } }
    const screen = mount()
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.playback'] }))
    expect(screen.getByText(messages.en['refine.loopCrossfade'])).toBeTruthy()
    expect(screen.queryByText(messages.en['studio.crossfadeInactive'])).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: messages.en['editor.delay'] }))
    expect(screen.queryByRole('button', { name: messages.en['common.preview'] + ' · ' + messages.en['editor.delay'] })).toBeNull()
    expect(screen.queryByRole('button', { name: messages.en['common.preview'] + ' · ' + messages.en['editor.crossfadeDuration'] })).toBeNull()
    expect(mockApp.preview).not.toHaveBeenCalled()
  })
  it('keeps a legacy overlap duration disabled and cannot mark a fractional zero-length trim', () => {
    mockShow = { ...mockShow, cues: { ...mockShow.cues, opening: { ...cue(), crossfadeEnabled: true } } }
    mockApp.previewState = { type: 'PREVIEW_STATE', generation: 2, cueId: 'opening', phase: 'paused', positionMs: 0.4, trimInMs: 0, trimOutMs: 78000 }
    const screen = mount()
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.playback'] }))
    expect(screen.getByRole('adjustable', { name: messages.en['editor.crossfadeDuration'] })).toBeDisabled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.audio'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['studio.trim'] }))
    expect(screen.getByRole('button', { name: messages.en['studio.markEnd'] })).toBeDisabled()
    expect(mockLibrary.updateCue).not.toHaveBeenCalled()
  })
})
