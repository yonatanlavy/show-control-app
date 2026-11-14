import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import type { NativePreviewState } from '../../audio/contracts'
import { sampleShow, type AudioCue, type Show } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import { SongEditor } from '../song-editor'

let mockShow: Show
const mockLibrary = { getSnapshot: () => ({ shows: [mockShow] }), updateCue: jest.fn(), saveShow: jest.fn(), importVisual: jest.fn(), waveform: jest.fn() }
const mockApp = {
  library: mockLibrary, libraryState: { saving: false }, busy: false, previewState: null as NativePreviewState | null,
  preview: jest.fn(), pausePreview: jest.fn(), resumePreview: jest.fn(), scrub: jest.fn(), stopPreview: jest.fn(), clearError: jest.fn(),
  runTask: async (work: () => Promise<unknown>) => { try { await work(); return true } catch { return false } },
}
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))

function opening(): AudioCue { const cue = mockShow.cues.opening; if (cue?.type !== 'audio') throw Error('Fixture'); return cue }
function mount(onClose = jest.fn()) { return render(<I18nProvider><SongEditor cue={opening()} show={mockShow} set={mockShow.sets[0]!} onClose={onClose} /></I18nProvider>) }
type Screen = ReturnType<typeof mount>
function select(screen: Screen, section: 'audio' | 'playback' | 'details') { fireEvent.press(screen.getByRole('button', { name: messages.en[`use.editor.${section}`] })) }
function editFade(screen: Screen, value: string) {
  select(screen, 'playback')
  fireEvent.press(screen.getByRole('button', { name: messages.en['studio.fades'] }))
  fireEvent.press(screen.getByRole('button', { name: messages.en['workflow.exactTiming'].replace('{name}', messages.en['editor.fadeIn']) }))
  fireEvent.changeText(screen.getAllByLabelText(messages.en['editor.fadeIn']).find((node) => typeof node.props.value === 'string')!, value)
}
beforeEach(() => {
  jest.clearAllMocks(); mockShow = structuredClone(sampleShow); mockApp.busy = false; mockApp.previewState = null
  mockLibrary.waveform.mockResolvedValue([0.1, 0.9]); mockLibrary.importVisual.mockResolvedValue(null)
  mockLibrary.updateCue.mockImplementation(async (_showId: string, cueId: string, changes: Partial<AudioCue>) => { mockShow = { ...mockShow, cues: { ...mockShow.cues, [cueId]: { ...mockShow.cues[cueId], ...changes } as AudioCue } } })
  mockApp.preview.mockResolvedValue(undefined); mockApp.stopPreview.mockResolvedValue(undefined); mockApp.pausePreview.mockResolvedValue(undefined); mockApp.resumePreview.mockResolvedValue(undefined)
  mockApp.runTask = async (work: () => Promise<unknown>) => { try { await work(); return true } catch { return false } }
})

describe('focused song settings workflow', () => {
  it('opens on Audio and exposes the selected section while keeping every setting reachable', () => {
    const screen = mount()
    expect(screen.getByRole('button', { name: messages.en['use.editor.audio'] }).props.accessibilityState.selected).toBe(true)
    expect(screen.getByRole('adjustable', { name: messages.en['editor.volume'] })).toBeTruthy()
    expect(screen.queryByRole('switch', { name: messages.en['editor.crossfade'] })).toBeNull()
    select(screen, 'playback')
    expect(screen.getByRole('button', { name: messages.en['use.editor.playback'] }).props.accessibilityState.selected).toBe(true)
    expect(screen.getByRole('switch', { name: messages.en['editor.crossfade'] })).toBeTruthy()
    select(screen, 'details')
    expect(screen.getByLabelText(messages.en['common.name'])).toBeTruthy()
    expect(screen.getByRole('switch', { name: messages.en['editor.hit'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: messages.en['editor.visual'] })).toBeTruthy()
    expect(mockLibrary.updateCue).not.toHaveBeenCalled(); expect(mockApp.preview).not.toHaveBeenCalled(); expect(mockApp.resumePreview).not.toHaveBeenCalled()
  })

  it('retains name, notes, and millisecond drafts across section changes without saving or playing', () => {
    const screen = mount(); select(screen, 'details')
    fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), 'My reveal')
    fireEvent.changeText(screen.getByLabelText(messages.en['editor.notes']), 'Wait for applause')
    editFade(screen, '0.053'); select(screen, 'audio'); select(screen, 'details')
    expect(screen.getByLabelText(messages.en['common.name']).props.value).toBe('My reveal')
    expect(screen.getByLabelText(messages.en['editor.notes']).props.value).toBe('Wait for applause')
    select(screen, 'playback')
    fireEvent.press(screen.getByRole('button', { name: messages.en['studio.fades'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['workflow.exactTiming'].replace('{name}', messages.en['editor.fadeIn']) }))
    expect(screen.getAllByLabelText(messages.en['editor.fadeIn']).find((node) => typeof node.props.value === 'string')!.props.value).toBe('0.053')
    expect(screen.getByRole('button', { name: messages.en['use.editor.saveDraft'] })).toBeEnabled()
    expect(mockLibrary.updateCue).not.toHaveBeenCalled(); expect(mockApp.preview).not.toHaveBeenCalled(); expect(mockApp.scrub).not.toHaveBeenCalled()
  })

  it('keeps invalid timing visible as a pending problem after switching away and blocks saving or leaving', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    try {
      const close = jest.fn(); const screen = mount(close); editFade(screen, '-1'); select(screen, 'details')
      expect(screen.getByText(messages.en['use.editor.invalidDraft'])).toBeTruthy()
      expect(screen.getByRole('button', { name: messages.en['use.editor.saveDraft'] })).toBeDisabled()
      fireEvent.press(screen.getAllByRole('button', { name: messages.en['workflow.backPlaylist'] })[0]!)
      expect(alert.mock.calls.at(-1)![2]!.some((button) => button.text === messages.en['common.save'])).toBe(false)
      expect(close).not.toHaveBeenCalled(); expect(mockLibrary.updateCue).not.toHaveBeenCalled()
    } finally { alert.mockRestore() }
  })

  it('preserves pending edits after a failed combined save and retries them together from any section', async () => {
    const screen = mount(); select(screen, 'details')
    fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), 'My reveal')
    fireEvent.changeText(screen.getByLabelText(messages.en['editor.notes']), 'Wait for applause')
    editFade(screen, '0.053'); select(screen, 'audio')
    mockLibrary.updateCue.mockRejectedValueOnce(new Error('ENOSPC'))
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.saveDraft'] }))
    await waitFor(() => expect(screen.getByText(messages.en['editor.savedError'])).toBeTruthy())
    expect(opening().name).not.toBe('My reveal')
    select(screen, 'details')
    expect(screen.getByLabelText(messages.en['common.name']).props.value).toBe('My reveal')
    fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), 'My revised reveal')
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] }))
    await waitFor(() => expect(screen.queryByText(messages.en['editor.savedError'])).toBeNull())
    expect(opening()).toMatchObject({ name: 'My revised reveal', notes: 'Wait for applause', fadeInMs: 53 })
    expect(screen.queryByRole('button', { name: messages.en['use.editor.saveDraft'] })).toBeNull()
    expect(mockLibrary.updateCue).toHaveBeenCalledTimes(2)
    expect(mockApp.preview).not.toHaveBeenCalled()
  })

  it('owns a failed save locally instead of exposing a raw global retry that bypasses reconciliation', async () => {
    const globalFailures: (() => Promise<unknown>)[] = []
    mockApp.runTask = async (work: () => Promise<unknown>) => { try { await work(); return true } catch { globalFailures.push(work); return false } }
    const screen = mount(); select(screen, 'details')
    fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), 'My reveal')
    mockLibrary.updateCue.mockRejectedValueOnce(new Error('SQLITE_FULL'))
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.saveDraft'] }))
    await waitFor(() => expect(screen.getByText(messages.en['editor.savedError'])).toBeTruthy())
    expect(globalFailures).toEqual([]); expect(mockApp.clearError).toHaveBeenCalledTimes(1)
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.diagnostics'] }))
    expect(screen.getByText('SQLITE_FULL')).toBeTruthy()
    fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), 'Revised reveal')
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] }))
    await waitFor(() => expect(screen.queryByText(messages.en['editor.savedError'])).toBeNull())
    expect(opening().name).toBe('Revised reveal')
    expect(screen.queryByRole('button', { name: messages.en['use.editor.saveDraft'] })).toBeNull()
  })

  it('retains the global failure fallback if a write fails after the editor unmounts', async () => {
    const globalFailures: (() => Promise<unknown>)[] = []; let reject!: (error: Error) => void
    mockApp.runTask = async (work: () => Promise<unknown>) => { try { await work(); return true } catch { globalFailures.push(work); return false } }
    mockLibrary.updateCue.mockReturnValueOnce(new Promise<void>((_resolve, fail) => { reject = fail }))
    const screen = mount()
    fireEvent(screen.getByRole('adjustable', { name: messages.en['editor.speed'] }), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    screen.unmount()
    await act(async () => reject(new Error('SQLITE_FULL')))
    expect(globalFailures).toHaveLength(1); expect(mockApp.clearError).not.toHaveBeenCalled()
  })

  it('does not submit the same pending draft twice during a rapid double press', async () => {
    let finish!: () => void
    mockLibrary.updateCue.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    const screen = mount(); select(screen, 'details')
    fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), 'My reveal')
    const save = screen.getByRole('button', { name: messages.en['use.editor.saveDraft'] })
    act(() => { fireEvent.press(save); fireEvent.press(save) })
    expect(mockLibrary.updateCue).toHaveBeenCalledTimes(1)
    await act(async () => finish())
  })

  it.each([false, true])('stops the old preview before committing a trim draft (stop failure: %s)', async (stopFails) => {
    mockApp.previewState = { type: 'PREVIEW_STATE', generation: 4, cueId: 'opening', phase: 'playing', positionMs: 1000, trimInMs: 0, trimOutMs: 78000 }
    const screen = mount()
    fireEvent.press(screen.getByRole('button', { name: messages.en['studio.trim'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['workflow.exactTiming'].replace('{name}', messages.en['editor.trimEnd']) }))
    fireEvent.changeText(screen.getAllByLabelText(messages.en['editor.trimEnd']).find((node) => typeof node.props.value === 'string')!, '5.053')
    if (stopFails) mockApp.stopPreview.mockRejectedValueOnce(new Error('STOP_FAILED'))
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.saveDraft'] }))
    await waitFor(() => expect(mockApp.stopPreview).toHaveBeenCalledTimes(1))
    if (stopFails) {
      await waitFor(() => expect(screen.getByText(messages.en['editor.savedError'])).toBeTruthy())
      expect(mockLibrary.updateCue).not.toHaveBeenCalled()
      expect(screen.getAllByLabelText(messages.en['editor.trimEnd']).find((node) => typeof node.props.value === 'string')!.props.value).toBe('5.053')
      expect(screen.getByRole('button', { name: messages.en['common.retry'] })).toBeEnabled()
    } else {
      await waitFor(() => expect(mockLibrary.updateCue).toHaveBeenCalledWith(mockShow.id, 'opening', expect.objectContaining({ trimOutMs: 5053 })))
      expect(mockApp.stopPreview.mock.invocationCallOrder[0]).toBeLessThan(mockLibrary.updateCue.mock.invocationCallOrder[0]!)
    }
    expect(mockApp.preview).not.toHaveBeenCalled(); expect(mockApp.resumePreview).not.toHaveBeenCalled()
  })

  const trimActions = [
    ['slider', 'trimInMs', 100], ['field', 'trimOutMs', 5053], ['mark start', 'trimInMs', 5000], ['mark end', 'trimOutMs', 5000],
  ] as const
  function changeTrim(screen: Screen, action: typeof trimActions[number][0]) {
    fireEvent.press(screen.getByRole('button', { name: messages.en['studio.trim'] }))
    if (action === 'slider') {
      fireEvent(screen.getByRole('adjustable', { name: messages.en['editor.trimStart'] }), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    } else if (action === 'field') {
      fireEvent.press(screen.getByRole('button', { name: messages.en['workflow.exactTiming'].replace('{name}', messages.en['editor.trimEnd']) }))
      fireEvent.changeText(screen.getAllByLabelText(messages.en['editor.trimEnd']).find((node) => typeof node.props.value === 'string')!, '5.053')
      fireEvent.press(screen.getByRole('button', { name: messages.en['common.saveField'].replace('{name}', messages.en['editor.trimEnd']) }))
    } else fireEvent.press(screen.getByRole('button', { name: messages.en[action === 'mark start' ? 'studio.markStart' : 'studio.markEnd'] }))
  }
  it.each(trimActions)('waits for confirmed preview stop before a %s trim write', async (action, key, value) => {
    mockApp.previewState = { type: 'PREVIEW_STATE', generation: 4, cueId: 'opening', phase: 'playing', positionMs: 5000, trimInMs: 0, trimOutMs: 78000 }
    let finish!: () => void
    mockApp.stopPreview.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    const screen = mount(); changeTrim(screen, action)
    expect(mockApp.stopPreview).toHaveBeenCalledTimes(1)
    expect(mockLibrary.updateCue).not.toHaveBeenCalled()
    expect(screen.getByText(messages.en['studio.saving'])).toBeTruthy()
    await act(async () => finish())
    expect(mockLibrary.updateCue).toHaveBeenCalledWith(mockShow.id, 'opening', { [key]: value })
    expect(mockApp.preview).not.toHaveBeenCalled(); expect(mockApp.resumePreview).not.toHaveBeenCalled()
  })
  it.each(trimActions)('retains the desired %s trim after stop failure and retries without saving another draft', async (action, key, value) => {
    mockApp.previewState = { type: 'PREVIEW_STATE', generation: 4, cueId: 'opening', phase: 'playing', positionMs: 5000, trimInMs: 0, trimOutMs: 78000 }
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    try {
      const screen = mount(); select(screen, 'details')
      fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), 'Pending name')
      select(screen, 'audio'); mockApp.stopPreview.mockRejectedValueOnce(new Error('STOP_FAILED'))
      changeTrim(screen, action)
      await waitFor(() => expect(screen.getByText(messages.en['editor.savedError'])).toBeTruthy())
      expect(mockLibrary.updateCue).not.toHaveBeenCalled()
      const label = messages.en[key === 'trimInMs' ? 'editor.trimStart' : 'editor.trimEnd']
      const exact = messages.en['workflow.exactTiming'].replace('{name}', label)
      if (action !== 'field') fireEvent.press(screen.getByRole('button', { name: exact }))
      expect(screen.getAllByLabelText(label).find((node) => typeof node.props.value === 'string')!.props.value).toBe(String(value / 1000))
      fireEvent.press(screen.getAllByRole('button', { name: messages.en['workflow.backPlaylist'] })[0]!)
      expect(alert).toHaveBeenCalledWith(messages.en['workflow.unsaved'], messages.en['refine.unsavedTiming'], expect.any(Array))
      fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] }))
      await waitFor(() => expect(mockLibrary.updateCue).toHaveBeenCalledWith(mockShow.id, 'opening', { [key]: value }))
      expect(opening().name).not.toBe('Pending name')
      select(screen, 'details'); expect(screen.getByLabelText(messages.en['common.name']).props.value).toBe('Pending name')
      expect(mockApp.preview).not.toHaveBeenCalled(); expect(mockApp.resumePreview).not.toHaveBeenCalled()
    } finally { alert.mockRestore() }
  })
  it('does not commit a pending trim after its editor unmounts', async () => {
    let finish!: () => void
    mockApp.stopPreview.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    const screen = mount(); changeTrim(screen, 'slider'); screen.unmount()
    await act(async () => finish())
    expect(mockLibrary.updateCue).not.toHaveBeenCalled()
  })
  it('ignores an older trim callback after a newer trim is confirmed', async () => {
    const finishes: (() => void)[] = []
    mockApp.stopPreview.mockImplementation(() => new Promise<void>((resolve) => { finishes.push(resolve) }))
    const screen = mount(); fireEvent.press(screen.getByRole('button', { name: messages.en['studio.trim'] }))
    const adjust = screen.getByRole('adjustable', { name: messages.en['editor.trimStart'] }).props.onAccessibilityAction
    act(() => { adjust({ nativeEvent: { actionName: 'increment' } }); adjust({ nativeEvent: { actionName: 'increment' } }) })
    await act(async () => finishes[1]!())
    await act(async () => finishes[0]!())
    expect(mockLibrary.updateCue.mock.calls).toEqual([[mockShow.id, 'opening', { trimInMs: 200 }]])
    mockApp.stopPreview.mockResolvedValue(undefined)
  })
  it('invalidates an older trim start when a newer trim end is confirmed and retains the skipped start as a draft', async () => {
    const finishes: (() => void)[] = []
    mockApp.stopPreview.mockImplementation(() => new Promise<void>((resolve) => { finishes.push(resolve) }))
    const screen = mount(); fireEvent.press(screen.getByRole('button', { name: messages.en['studio.trim'] }))
    const start = screen.getByRole('adjustable', { name: messages.en['editor.trimStart'] }).props.onAccessibilityAction
    const end = screen.getByRole('adjustable', { name: messages.en['editor.trimEnd'] }).props.onAccessibilityAction
    act(() => { start({ nativeEvent: { actionName: 'increment' } }); end({ nativeEvent: { actionName: 'decrement' } }) })
    await act(async () => finishes[1]!())
    await act(async () => finishes[0]!())
    expect(mockLibrary.updateCue.mock.calls).toEqual([[mockShow.id, 'opening', { trimOutMs: 77900 }]])
    expect(opening().trimInMs).toBe(0)
    fireEvent.press(screen.getByRole('button', { name: messages.en['workflow.exactTiming'].replace('{name}', messages.en['editor.trimStart']) }))
    expect(screen.getAllByLabelText(messages.en['editor.trimStart']).find((node) => typeof node.props.value === 'string')!.props.value).toBe('0.1')
    expect(screen.getByRole('button', { name: messages.en['use.editor.saveDraft'] })).toBeEnabled()
    mockApp.stopPreview.mockResolvedValue(undefined)
  })
  it('does not invalidate a pending trim when a newer volume setting is saved', async () => {
    let finish!: () => void
    mockApp.stopPreview.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    const screen = mount(); fireEvent.press(screen.getByRole('button', { name: messages.en['studio.trim'] }))
    const start = screen.getByRole('adjustable', { name: messages.en['editor.trimStart'] }).props.onAccessibilityAction
    const volume = screen.getByRole('adjustable', { name: messages.en['editor.volume'] }).props.onAccessibilityAction
    const gainDb = opening().gainDb + 0.5
    act(() => { start({ nativeEvent: { actionName: 'increment' } }); volume({ nativeEvent: { actionName: 'increment' } }) })
    expect(mockLibrary.updateCue).toHaveBeenCalledWith(mockShow.id, 'opening', { gainDb })
    await act(async () => finish())
    expect(mockLibrary.updateCue.mock.calls).toEqual([[mockShow.id, 'opening', { gainDb }], [mockShow.id, 'opening', { trimInMs: 100 }]])
  })
  it.each([false, true])('supersedes an earlier exact trim draft with Mark without losing another field (stop failure: %s)', async (stopFails) => {
    mockApp.previewState = { type: 'PREVIEW_STATE', generation: 4, cueId: 'opening', phase: 'playing', positionMs: 2000, trimInMs: 0, trimOutMs: 78000 }
    const screen = mount(); fireEvent.press(screen.getByRole('button', { name: messages.en['studio.trim'] }))
    const start = messages.en['editor.trimStart']; const end = messages.en['editor.trimEnd']
    fireEvent.press(screen.getByRole('button', { name: messages.en['workflow.exactTiming'].replace('{name}', start) }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['workflow.exactTiming'].replace('{name}', end) }))
    fireEvent.changeText(screen.getAllByLabelText(start).find((node) => typeof node.props.value === 'string')!, '1')
    fireEvent.changeText(screen.getAllByLabelText(end).find((node) => typeof node.props.value === 'string')!, '75.053')
    if (stopFails) mockApp.stopPreview.mockRejectedValueOnce(new Error('STOP_FAILED'))
    fireEvent.press(screen.getByRole('button', { name: messages.en['studio.markStart'] }))
    if (stopFails) {
      await waitFor(() => expect(screen.getByText(messages.en['editor.savedError'])).toBeTruthy())
      expect(mockLibrary.updateCue).not.toHaveBeenCalled()
    } else await waitFor(() => expect(mockLibrary.updateCue).toHaveBeenCalledWith(mockShow.id, 'opening', { trimInMs: 2000 }))
    expect(screen.getAllByLabelText(start).find((node) => typeof node.props.value === 'string')!.props.value).toBe('2')
    expect(screen.getAllByLabelText(end).find((node) => typeof node.props.value === 'string')!.props.value).toBe('75.053')
    if (stopFails) {
      fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] }))
      await waitFor(() => expect(mockLibrary.updateCue).toHaveBeenCalledWith(mockShow.id, 'opening', { trimInMs: 2000 }))
    }
    fireEvent.press(screen.getByRole('button', { name: messages.en['use.editor.saveDraft'] }))
    await waitFor(() => expect(mockLibrary.updateCue).toHaveBeenLastCalledWith(mockShow.id, 'opening', expect.objectContaining({ trimOutMs: 75053 })))
    expect(mockLibrary.updateCue.mock.calls.at(-1)![2]).not.toHaveProperty('trimInMs')
    expect(opening().trimInMs).toBe(2000)
  })

  it.each(['name', 'empty name', 'invalid timing'] as const)('retries a failed speed setting without committing or losing an unrelated %s draft', async (draftKind) => {
    const screen = mount()
    if (draftKind !== 'invalid timing') {
      select(screen, 'details'); fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), draftKind === 'name' ? 'My reveal' : '')
    } else editFade(screen, '-1')
    select(screen, 'audio'); mockLibrary.updateCue.mockRejectedValueOnce(new Error('ENOSPC'))
    fireEvent(screen.getByRole('adjustable', { name: messages.en['editor.speed'] }), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    await waitFor(() => expect(screen.getByText(messages.en['editor.savedError'])).toBeTruthy())
    expect(screen.getByRole('button', { name: messages.en['common.retry'] })).toBeEnabled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] }))
    await waitFor(() => expect(screen.queryByText(messages.en['editor.savedError'])).toBeNull())
    expect(mockLibrary.updateCue.mock.calls).toEqual([
      [mockShow.id, 'opening', { playbackRate: 1.05 }],
      [mockShow.id, 'opening', { playbackRate: 1.05 }],
    ])
    expect(opening().playbackRate).toBe(1.05)
    if (draftKind !== 'invalid timing') {
      select(screen, 'details'); expect(screen.getByLabelText(messages.en['common.name']).props.value).toBe(draftKind === 'name' ? 'My reveal' : '')
      expect(opening().name).not.toBe('My reveal')
      if (draftKind === 'name') expect(screen.getByRole('button', { name: messages.en['use.editor.saveDraft'] })).toBeEnabled()
      else expect(screen.getByRole('button', { name: messages.en['use.editor.saveDraft'] })).toBeDisabled()
    } else {
      expect(screen.getByText(messages.en['use.editor.invalidDraft'])).toBeTruthy()
      expect(screen.getByRole('button', { name: messages.en['use.editor.saveDraft'] })).toBeDisabled()
    }
    expect(mockApp.preview).not.toHaveBeenCalled()
  })

  it.each(['audio', 'playback', 'details'] as const)('keeps paused preview controls available in %s without resuming on section selection', async (section) => {
    mockApp.previewState = { type: 'PREVIEW_STATE', generation: 4, cueId: 'opening', phase: 'paused', positionMs: 1000, trimInMs: 0, trimOutMs: 78000 }
    const screen = mount(); select(screen, section)
    expect(screen.getByRole('button', { name: messages.en['studio.resumePreview'] })).toBeTruthy()
    expect(mockApp.resumePreview).not.toHaveBeenCalled(); expect(mockApp.preview).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['editor.stopPreview'] }))
    await waitFor(() => expect(mockApp.stopPreview).toHaveBeenCalledTimes(1))
  })

  it('describes committed playback behavior while a new loop setting is still saving', async () => {
    mockShow = { ...mockShow, cues: { ...mockShow.cues, opening: { ...opening(), endBehavior: 'stopAndReadyNext' } } }
    let finish!: () => void
    mockLibrary.updateCue.mockImplementationOnce((_showId: string, cueId: string, changes: Partial<AudioCue>) => new Promise<void>((resolve) => { finish = () => { mockShow = { ...mockShow, cues: { ...mockShow.cues, [cueId]: { ...mockShow.cues[cueId], ...changes } as AudioCue } }; resolve() } }))
    const screen = mount(); select(screen, 'playback')
    fireEvent(screen.getByRole('switch', { name: messages.en['builder.loop'] }), 'valueChange', true)
    expect(screen.getByText(messages.en['use.editor.manualEnd'])).toBeTruthy()
    expect(screen.queryByText(messages.en['use.editor.loopEnd'])).toBeNull()
    await act(async () => finish())
    expect(screen.getByText(messages.en['use.editor.loopEnd'])).toBeTruthy()
  })

  it('does not promise automatic continuation after the final legacy cue', () => {
    mockShow = { ...mockShow, cues: { ...mockShow.cues, opening: { ...opening(), endBehavior: 'autoFollow' } }, sets: [{ ...mockShow.sets[0]!, transportMode: 'legacyCueStack', cueOrder: ['opening'] }] }
    const screen = mount()
    expect(screen.getByText(messages.en['use.editor.manualEnd'])).toBeTruthy()
    expect(screen.queryByText(messages.en['use.editor.legacyAutoEnd'])).toBeNull()
  })

  it('explains independent Hit behavior without applying the first main song as its crossfade destination', () => {
    mockShow = { ...mockShow, cues: { ...mockShow.cues, opening: { ...opening(), endBehavior: 'loop', autoPlay: true, crossfadeEnabled: true } }, sets: [{ ...mockShow.sets[0]!, transportMode: 'oms', cueOrder: ['bed'], hitCueIds: ['opening'] }] }
    const screen = mount()
    expect(screen.getByText(messages.en['use.editor.hitLoopEnd'])).toBeTruthy()
    select(screen, 'playback')
    expect(screen.getByText(messages.en['use.editor.hitPlaybackHelp'])).toBeTruthy()
    expect(screen.getByRole('switch', { name: messages.en['editor.autoplay'] })).toBeDisabled()
    expect(screen.getByRole('switch', { name: messages.en['editor.crossfade'] })).toBeDisabled()
    expect(screen.getByRole('adjustable', { name: messages.en['editor.crossfadeDuration'] })).toBeDisabled()
    expect(screen.getByText(messages.en['studio.crossfadeInactive'])).toBeTruthy()
    expect(mockLibrary.updateCue).not.toHaveBeenCalled()
  })

  it('protects a Hit-only name draft on removal and supports an explicit discard', async () => {
    mockShow = { ...mockShow, sets: [{ ...mockShow.sets[0]!, cueOrder: ['bed'], hitCueIds: ['opening'] }] }
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    try {
      const screen = mount(); select(screen, 'details')
      fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), 'Unfinished reveal')
      fireEvent(screen.getByRole('switch', { name: messages.en['editor.hit'] }), 'valueChange', false)
      expect(alert).toHaveBeenCalledWith(messages.en['workflow.unsaved'], messages.en['workflow.unsavedHelp'], expect.any(Array))
      expect(mockLibrary.saveShow).not.toHaveBeenCalled()
      const cancel = alert.mock.calls.at(-1)![2]!.find((button) => button.style === 'cancel')!
      await act(async () => cancel.onPress?.())
      expect(screen.getByLabelText(messages.en['common.name']).props.value).toBe('Unfinished reveal')
      expect(mockLibrary.saveShow).not.toHaveBeenCalled()
      fireEvent(screen.getByRole('switch', { name: messages.en['editor.hit'] }), 'valueChange', false)
      await act(async () => alert.mock.calls.at(-1)![2]!.find((button) => button.style === 'destructive')!.onPress?.())
      await waitFor(() => expect(mockLibrary.saveShow).toHaveBeenCalledTimes(1))
      expect(mockLibrary.saveShow.mock.calls[0]![0].sets[0].hitCueIds).toEqual([])
      expect(mockLibrary.updateCue).not.toHaveBeenCalled()
      expect(mockApp.stopPreview.mock.invocationCallOrder[0]).toBeLessThan(mockLibrary.saveShow.mock.invocationCallOrder[0]!)
    } finally { alert.mockRestore() }
  })

  it('retains Hit-only drafts and membership when Save before removal fails', async () => {
    mockShow = { ...mockShow, sets: [{ ...mockShow.sets[0]!, cueOrder: ['bed'], hitCueIds: ['opening'] }] }
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    try {
      const screen = mount(); select(screen, 'details')
      fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), 'Unfinished reveal')
      mockLibrary.updateCue.mockRejectedValueOnce(new Error('ENOSPC'))
      fireEvent(screen.getByRole('switch', { name: messages.en['editor.hit'] }), 'valueChange', false)
      await act(async () => alert.mock.calls.at(-1)![2]!.find((button) => button.text === messages.en['common.save'])!.onPress?.())
      await waitFor(() => expect(mockLibrary.updateCue).toHaveBeenCalledTimes(1))
      expect(mockLibrary.saveShow).not.toHaveBeenCalled()
      expect(screen.getByLabelText(messages.en['common.name']).props.value).toBe('Unfinished reveal')
      expect(mockShow.sets[0]!.hitCueIds).toContain('opening')
      expect(mockApp.stopPreview).not.toHaveBeenCalled()
      fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] }))
      await waitFor(() => expect(mockLibrary.saveShow).toHaveBeenCalledTimes(1))
      expect(opening().name).toBe('Unfinished reveal')
      expect(mockLibrary.saveShow.mock.calls[0]![0].sets[0].hitCueIds).toEqual([])
    } finally { alert.mockRestore() }
  })
})
