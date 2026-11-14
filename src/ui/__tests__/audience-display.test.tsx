import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import type { VisualStatus } from '../../../modules/show-visual'
import { sampleShow, type Show } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import { DEFAULT_LIBRARY_SETTINGS } from '../../library/types'
import { AudienceDisplayPanel } from '../audience-display'

let mockStatus: VisualStatus
let mockListener: (value: VisualStatus) => void
let mockShow: Show
const mockNative = { getStatus: jest.fn(), configure: jest.fn(), subscribe: jest.fn((listener) => { mockListener = listener; return { remove: jest.fn() } }), testPattern: jest.fn(), endTestPattern: jest.fn(), blackout: jest.fn() }
const mockLibrary = { getSnapshot: () => ({ shows: [mockShow] }), updateSettings: jest.fn(), importVisual: jest.fn(), saveShow: jest.fn() }
const mockApp = { show: sampleShow as Show | undefined, library: mockLibrary, libraryState: { status: 'ready', saving: false, settings: DEFAULT_LIBRARY_SETTINGS }, busy: false, liveSession: false, session: { snapshot: null as unknown }, error: null, clearError: jest.fn(), retryLastTask: jest.fn(), runTask: async (work: () => Promise<unknown>) => { try { await work(); return true } catch { return false } } }
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('../../../modules/show-visual', () => ({ __esModule: true, default: {
  getStatus: () => mockNative.getStatus(), configure: (settings: unknown) => mockNative.configure(settings),
  subscribe: (listener: unknown) => mockNative.subscribe(listener), testPattern: (labels: unknown) => mockNative.testPattern(labels),
  endTestPattern: () => mockNative.endTestPattern(), blackout: () => mockNative.blackout(),
} }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))
function mount() { return render(<I18nProvider><AudienceDisplayPanel /></I18nProvider>) }
const fallback = { id: 'fallback', kind: 'image' as const, localUri: 'file:///image.jpg', mimeType: 'image/jpeg', width: 1920, height: 1080, bytes: 256, checksumSha256: 'a'.repeat(64) }
beforeEach(() => {
  jest.clearAllMocks(); mockShow = structuredClone(sampleShow); mockApp.show = mockShow; mockApp.busy = false; mockApp.liveSession = false; mockApp.session.snapshot = null
  mockStatus = { available: true, enabled: false, displayDetected: true, connected: false, testing: false, detail: '' }
  mockNative.getStatus.mockImplementation(async () => mockStatus)
  mockNative.configure.mockImplementation(async (settings) => ({ ...mockStatus, ...settings, connected: settings.enabled }))
  mockNative.testPattern.mockImplementation(async () => ({ ...mockStatus, testing: true }))
  mockNative.endTestPattern.mockResolvedValue(undefined); mockNative.blackout.mockResolvedValue(undefined)
  mockLibrary.updateSettings.mockResolvedValue(undefined); mockLibrary.importVisual.mockResolvedValue(null); mockLibrary.saveShow.mockResolvedValue(undefined)
})

describe('private audience output setup', () => {
  it('distinguishes a detected screen from an enabled renderer and never starts a test automatically', async () => {
    const screen = mount(); await waitFor(() => expect(screen.getByText(messages.en['audience.detected'])).toBeTruthy())
    expect(screen.getByRole('button', { name: messages.en['audience.test'] })).toBeDisabled()
    expect(mockNative.configure).not.toHaveBeenCalled(); expect(mockNative.testPattern).not.toHaveBeenCalled()
    fireEvent(screen.getByRole('switch', { name: messages.en['visual.enable'] }), 'valueChange', true)
    await waitFor(() => expect(mockLibrary.updateSettings).toHaveBeenCalledWith({ externalDisplayEnabled: true }))
    expect(screen.getByText(messages.en['audience.connected'])).toBeTruthy()
  })
  it('rolls back native enable when saving the preference fails', async () => {
    mockLibrary.updateSettings.mockRejectedValueOnce(new Error('disk full')); const screen = mount()
    await waitFor(() => expect(screen.getByRole('switch', { name: messages.en['visual.enable'] })).toBeEnabled())
    fireEvent(screen.getByRole('switch', { name: messages.en['visual.enable'] }), 'valueChange', true)
    await waitFor(() => expect(mockNative.configure).toHaveBeenLastCalledWith({ enabled: false }))
    expect(screen.getByText(messages.en['audience.errorHelp'])).toBeTruthy()
  })
  it('uses an image-only importer and leaves the show untouched after picker cancellation', async () => {
    const screen = mount(); await waitFor(() => expect(screen.getByText(messages.en['audience.detected'])).toBeTruthy())
    fireEvent.press(screen.getByRole('button', { name: messages.en['visual.fallback'] }))
    await waitFor(() => expect(mockLibrary.importVisual).toHaveBeenCalledWith(mockShow.id, undefined, undefined, true))
    expect(mockLibrary.saveShow).not.toHaveBeenCalled()
  })
  it('attaches an imported image to the captured show through a saved revision', async () => {
    mockLibrary.importVisual.mockResolvedValueOnce(fallback); const screen = mount()
    fireEvent.press(screen.getByRole('button', { name: messages.en['visual.fallback'] }))
    await waitFor(() => expect(mockLibrary.saveShow).toHaveBeenCalledWith(expect.objectContaining({ id: mockShow.id, fallbackVisualAssetId: fallback.id })))
  })
  it('requires confirmation to detach a default image and preserves all media', async () => {
    mockShow = { ...mockShow, fallbackVisualAssetId: fallback.id, visualAssets: { [fallback.id]: fallback } }; mockApp.show = mockShow
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    try {
      const screen = mount(); fireEvent.press(screen.getByRole('button', { name: messages.en['audience.remove'] }))
      expect(mockLibrary.saveShow).not.toHaveBeenCalled()
      await act(async () => alert.mock.calls[0]![2]!.find((button) => button.style === 'destructive')!.onPress?.())
      expect(mockLibrary.saveShow.mock.calls[0]![0].fallbackVisualAssetId).toBeUndefined()
      expect(mockLibrary.saveShow.mock.calls[0]![0].visualAssets).toEqual(mockShow.visualAssets)
    } finally { alert.mockRestore() }
  })
  it('prevents a stale remove confirmation from detaching a newly chosen image', async () => {
    mockShow = { ...mockShow, fallbackVisualAssetId: fallback.id, visualAssets: { [fallback.id]: fallback } }; mockApp.show = mockShow
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    try {
      const screen = mount(); fireEvent.press(screen.getByRole('button', { name: messages.en['audience.remove'] }))
      mockShow = { ...mockShow, fallbackVisualAssetId: 'new-choice' }
      await act(async () => alert.mock.calls[0]![2]!.find((button) => button.style === 'destructive')!.onPress?.())
      expect(mockLibrary.saveShow).not.toHaveBeenCalled(); expect(screen.getByText(messages.en['audience.errorHelp'])).toBeTruthy()
    } finally { alert.mockRestore() }
  })
  it('blocks display setup and silent tests while a native show or rehearsal remains prepared', async () => {
    mockStatus = { ...mockStatus, enabled: true, connected: true }; mockApp.session.snapshot = { revisionId: 'prepared' }
    const screen = mount(); await waitFor(() => expect(screen.getByText(messages.en['audience.connected'])).toBeTruthy())
    expect(screen.getByRole('button', { name: messages.en['audience.test'] })).toBeDisabled()
    expect(screen.getByRole('switch', { name: messages.en['visual.enable'] })).toBeDisabled()
    expect(screen.getByRole('button', { name: messages.en['visual.blackout'] })).toBeEnabled()
    expect(mockNative.testPattern).not.toHaveBeenCalled()
  })
  it('ends only its test pattern when leaving, without issuing a blanket blackout', async () => {
    mockStatus = { ...mockStatus, enabled: true, connected: true }; const screen = mount()
    await waitFor(() => expect(screen.getByRole('button', { name: messages.en['audience.test'] })).toBeEnabled())
    fireEvent.press(screen.getByRole('button', { name: messages.en['audience.test'] }))
    await waitFor(() => expect(screen.getByText(messages.en['audience.testRunning'])).toBeTruthy()); screen.unmount()
    expect(mockNative.endTestPattern).toHaveBeenCalledTimes(1); expect(mockNative.blackout).not.toHaveBeenCalled()
  })
  it('ignores a delayed hydration reply after newer native connection state arrives', async () => {
    let resolve!: (value: VisualStatus) => void; mockNative.getStatus.mockReturnValueOnce(new Promise<VisualStatus>((done) => { resolve = done }))
    const screen = mount(); await act(async () => mockListener({ ...mockStatus, enabled: true, connected: true }))
    await act(async () => resolve(mockStatus))
    expect(screen.getByText(messages.en['audience.connected'])).toBeTruthy(); expect(screen.queryByText(messages.en['audience.waiting'])).toBeNull()
  })
  it('blackouts immediately while a silent pattern request is still pending', async () => {
    let complete!: (value: VisualStatus) => void; mockStatus = { ...mockStatus, enabled: true, connected: true }
    mockNative.testPattern.mockReturnValueOnce(new Promise<VisualStatus>((done) => { complete = done }))
    const screen = mount(); await waitFor(() => expect(screen.getByRole('button', { name: messages.en['audience.test'] })).toBeEnabled())
    fireEvent.press(screen.getByRole('button', { name: messages.en['audience.test'] }))
    fireEvent.press(screen.getByRole('button', { name: messages.en['visual.blackout'] }))
    expect(mockNative.blackout).toHaveBeenCalledTimes(1)
    await act(async () => complete({ ...mockStatus, testing: true }))
    expect(mockNative.endTestPattern).toHaveBeenCalledTimes(1)
  })
})
