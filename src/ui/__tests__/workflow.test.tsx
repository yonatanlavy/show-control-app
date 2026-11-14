import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Modal } from 'react-native'
import type { NativePreviewState } from '../../audio/contracts'
import { sampleShow } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import { MusicFinderScreen } from '../music-screens'
import { TextEntryForm, WorkflowDialog } from '../workflow-components'

const mockLibrary = { copyLibrarySong: jest.fn(), getSnapshot: () => mockState, select: jest.fn() }
const mockState = { status: 'ready', shows: [sampleShow], selectedShowId: sampleShow.id, settings: { locale: 'en', assistantProvider: 'openai' }, saving: false }
const mockPreview = jest.fn(); const mockStop = jest.fn().mockResolvedValue(undefined)
const mockRouter = { replace: jest.fn(), push: jest.fn() }
const mockApp = { show: sampleShow, set: sampleShow.sets[0], library: mockLibrary, libraryState: mockState, busy: false, liveSession: false, error: null, clearError: jest.fn(), runTask: async (work: () => Promise<unknown>) => { try { await work(); return true } catch { return false } }, previewLibrarySong: mockPreview, previewState: null as NativePreviewState | null, stopPreview: mockStop }
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }))
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('../../music/downloads', () => ({ MusicDownloads: { jobs: jest.fn().mockResolvedValue([]) }, HelperSettings: {}, hasDownloadTarget: jest.fn() }))
jest.mock('../../ai/music-recommendations', () => ({ recommendMusic: jest.fn() }))
const wrap = (children: React.ReactNode) => <I18nProvider>{children}</I18nProvider>

describe('preparation workflow protections', () => {
  beforeEach(() => { jest.clearAllMocks(); mockApp.previewState = null; mockPreview.mockResolvedValue(undefined); mockStop.mockResolvedValue(undefined) })
  it('cancels a name form without committing and rejects blank names', () => {
    const save = jest.fn(); const cancel = jest.fn()
    const screen = render(wrap(<TextEntryForm initialValue="Opening" label="Name" confirmLabel="Save" onConfirm={save} onCancel={cancel} />))
    fireEvent.changeText(screen.getByLabelText('Name'), '   ')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.cancel'] }))
    expect(cancel).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled()
  })
  it('commits a trimmed name once while an earlier save is pending', async () => {
    let finish!: (ok: boolean) => void
    const save = jest.fn(() => new Promise<boolean>((resolve) => { finish = resolve }))
    const screen = render(wrap(<TextEntryForm initialValue="  Opening  " label="Name" confirmLabel="Save" onConfirm={save} onCancel={jest.fn()} />))
    const button = screen.getByRole('button', { name: 'Save' })
    fireEvent.press(button); fireEvent.press(button)
    expect(save).toHaveBeenCalledTimes(1); expect(save).toHaveBeenCalledWith('Opening')
    expect(screen.getByRole('button', { name: messages.en['common.cancel'] })).toBeDisabled()
    await act(async () => finish(true))
  })
  it('keeps a failed name edit available for a deliberate retry', async () => {
    const save = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const screen = render(wrap(<TextEntryForm initialValue="New show" label="Name" confirmLabel="Save" onConfirm={save} onCancel={jest.fn()} />))
    fireEvent.changeText(screen.getByLabelText('Name'), 'Evening magic')
    fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText(messages.en['common.errorHelp'])).toBeTruthy())
    expect(screen.getByLabelText('Name').props.value).toBe('Evening magic')
    fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  })
  it('blocks platform Back from dismissing a dialog during a save', () => {
    const close = jest.fn()
    const screen = render(wrap(<WorkflowDialog title="Rename" onDismiss={close} dismissDisabled><TextEntryForm initialValue="Opening" label="Name" confirmLabel="Save" onConfirm={jest.fn()} onCancel={jest.fn()} /></WorkflowDialog>))
    fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose')
    expect(close).not.toHaveBeenCalled()
  })
  it('prevents rapid duplicate additions and marks the completed song', async () => {
    let finish!: () => void
    mockLibrary.copyLibrarySong.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    const screen = render(wrap(<MusicFinderScreen />))
    const name = messages.en['finder.add'] + ' · ' + sampleShow.cues.opening!.name
    const add = screen.getByRole('button', { name })
    fireEvent.press(add); fireEvent.press(add)
    expect(mockLibrary.copyLibrarySong).toHaveBeenCalledTimes(1)
    expect(mockPreview).not.toHaveBeenCalled()
    await act(async () => finish())
    await waitFor(() => expect(screen.getByRole('button', { name: messages.en['finder.added'] + ' · ' + sampleShow.cues.opening!.name })).toBeDisabled())
    expect(screen.getByText(messages.en['workflow.addedCount'].replace('{count}', '1'))).toBeTruthy()
  })
  it('opens song information without starting a preview or adding a cue', () => {
    const screen = render(wrap(<MusicFinderScreen />))
    fireEvent.press(screen.getByRole('button', { name: sampleShow.cues.opening!.name }))
    expect(screen.UNSAFE_getByType(Modal)).toBeTruthy()
    expect(mockPreview).not.toHaveBeenCalled(); expect(mockLibrary.copyLibrarySong).not.toHaveBeenCalled()
  })

  it.each(['ended', 'error'] as const)('restarts a library audition with one press after native %s state', async (outcome) => {
    const screen = render(wrap(<MusicFinderScreen />))
    const previewLabel = messages.en['common.preview'] + ' · ' + sampleShow.cues.opening!.name
    const stopLabel = messages.en['editor.stopPreview'] + ' · ' + sampleShow.cues.opening!.name
    fireEvent.press(screen.getByRole('button', { name: previewLabel }))
    await act(async () => undefined)
    mockApp.previewState = { type: 'PREVIEW_STATE', generation: 10, cueId: 'opening', phase: 'playing', positionMs: 2000, trimInMs: 0, trimOutMs: 8000 }
    screen.rerender(wrap(<MusicFinderScreen />))
    expect(screen.getByRole('button', { name: stopLabel })).toBeTruthy()
    mockApp.previewState = outcome === 'ended' ? { ...mockApp.previewState, phase: 'stopped' } : null
    screen.rerender(wrap(<MusicFinderScreen />))
    expect(screen.queryByRole('button', { name: messages.en['editor.stopPreview'] })).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: previewLabel }))
    await act(async () => undefined)
    expect(mockPreview).toHaveBeenCalledTimes(2)
    expect(mockPreview).toHaveBeenLastCalledWith(sampleShow.id, 'opening')
    expect(mockStop).not.toHaveBeenCalled(); expect(mockLibrary.copyLibrarySong).not.toHaveBeenCalled()
  })

  it.each(['resolve', 'reject'] as const)('keeps a newer audition active when a stopped preparation later %ss', async (completion) => {
    let finish!: () => void; let fail!: (error: Error) => void
    mockPreview.mockReturnValueOnce(new Promise<void>((resolve, reject) => { finish = resolve; fail = reject }))
    const screen = render(wrap(<MusicFinderScreen />))
    const previewLabel = messages.en['common.preview'] + ' · ' + sampleShow.cues.opening!.name
    const stopLabel = messages.en['editor.stopPreview'] + ' · ' + sampleShow.cues.opening!.name
    const preview = screen.getByRole('button', { name: previewLabel })
    act(() => { fireEvent.press(preview); fireEvent.press(preview) })
    expect(mockPreview).toHaveBeenCalledTimes(1)
    mockApp.previewState = { type: 'PREVIEW_STATE', generation: 10, cueId: 'opening', phase: 'playing', positionMs: 1000, trimInMs: 0, trimOutMs: 8000 }
    screen.rerender(wrap(<MusicFinderScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['editor.stopPreview'] }))
    await act(async () => undefined)
    expect(mockStop).toHaveBeenCalledTimes(1)
    mockApp.previewState = null
    screen.rerender(wrap(<MusicFinderScreen />))
    fireEvent.press(screen.getByRole('button', { name: previewLabel }))
    await act(async () => undefined)
    expect(mockPreview).toHaveBeenCalledTimes(2)
    mockApp.previewState = { type: 'PREVIEW_STATE', generation: 11, cueId: 'opening', phase: 'playing', positionMs: 3000, trimInMs: 0, trimOutMs: 8000 }
    screen.rerender(wrap(<MusicFinderScreen />))
    await act(async () => { if (completion === 'resolve') finish(); else fail(new Error('Superseded preparation')) })
    expect(screen.getByRole('button', { name: stopLabel })).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: stopLabel }))
    await act(async () => undefined)
    expect(mockStop).toHaveBeenCalledTimes(2)
    expect(mockPreview).toHaveBeenCalledTimes(2)
  })

  it('clears a failed preview request without replacing native stopped state with a Stop action', async () => {
    mockPreview.mockRejectedValueOnce(new Error('PREVIEW_FAILED: corrupt audio'))
    const screen = render(wrap(<MusicFinderScreen />))
    const previewLabel = messages.en['common.preview'] + ' · ' + sampleShow.cues.opening!.name
    fireEvent.press(screen.getByRole('button', { name: previewLabel }))
    await act(async () => undefined)
    expect(screen.queryByRole('button', { name: messages.en['editor.stopPreview'] })).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: previewLabel }))
    await act(async () => undefined)
    expect(mockPreview).toHaveBeenCalledTimes(2)
    expect(mockStop).not.toHaveBeenCalled()
  })
})
