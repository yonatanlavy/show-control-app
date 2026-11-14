import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { sampleShow } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import { DEFAULT_LIBRARY_SETTINGS } from '../../library/types'
import { ProviderKeysScreen, MusicScreen } from '../service-screens'
import { Field } from '../primitives'

const mockGetKey = jest.fn<Promise<string | null>, [string]>()
const mockSetKey = jest.fn().mockResolvedValue(undefined)
const mockGenerate = jest.fn()
const mockApp = { show: sampleShow, set: sampleShow.sets[0], library: {}, libraryState: { status: 'ready', saving: false, settings: DEFAULT_LIBRARY_SETTINGS }, busy: false, error: null, clearError: jest.fn(), retryLastTask: jest.fn(), runTask: async (work: () => Promise<unknown>) => { await work(); return true } }
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useLocalSearchParams: () => ({}) }))
jest.mock('../../ai', () => ({ ...jest.requireActual('../../ai'), ProviderKeys: { get: (provider: string) => mockGetKey(provider), set: (...args: unknown[]) => mockSetKey(...args) }, generateMusic: (...args: unknown[]) => mockGenerate(...args) }))
const wrap = (content: React.ReactNode) => <I18nProvider>{content}</I18nProvider>

describe('setup and error recovery without provider calls', () => {
  beforeEach(() => { jest.clearAllMocks(); mockGetKey.mockResolvedValue(null) })
  it('cannot edit, save or delete while secure storage is still hydrating', async () => {
    let finish!: (key: string) => void; const reading = new Promise<string>((resolve) => { finish = resolve }); mockGetKey.mockReturnValue(reading)
    const screen = render(wrap(<ProviderKeysScreen />)); expect(screen.getByLabelText('OpenAI').props.editable).toBe(false); screen.getAllByRole('button', { name: messages.en['common.save'] }).forEach((button) => expect(button).toBeDisabled()); screen.getAllByRole('button', { name: messages.en['common.delete'] }).forEach((button) => expect(button).toBeDisabled())
    await act(async () => { finish('existing-key') }); expect(screen.getByLabelText('OpenAI').props.value).toBe('existing-key'); expect(mockSetKey).not.toHaveBeenCalled()
  })
  it('keeps secrets protected after failed hydration and loads them after Retry', async () => {
    mockGetKey.mockRejectedValue(new Error('keychain unavailable')); const screen = render(wrap(<ProviderKeysScreen />)); await waitFor(() => expect(screen.getByText(messages.en['error.keys'])).toBeTruthy()); expect(screen.getByLabelText('OpenAI').props.editable).toBe(false)
    mockGetKey.mockResolvedValue('restored-key'); fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] })); await waitFor(() => expect(screen.getByLabelText('OpenAI').props.value).toBe('restored-key')); expect(mockSetKey).not.toHaveBeenCalled()
  })
  it('does not save an empty or pasted multiline key', async () => {
    const screen = render(wrap(<ProviderKeysScreen />)); await waitFor(() => expect(screen.getByLabelText('OpenAI').props.editable).toBe(true)); expect(screen.getAllByRole('button', { name: messages.en['common.save'] })[0]).toBeDisabled(); fireEvent.changeText(screen.getByLabelText('OpenAI'), 'first\nsecond'); expect(screen.getAllByRole('button', { name: messages.en['common.save'] })[0]).toBeDisabled(); expect(mockSetKey).not.toHaveBeenCalled()
  })
  it('normalizes comma and Arabic digits while keeping URL-like names plain text', () => {
    const change = jest.fn(); const screen = render(wrap(<Field label="Seconds" value="0" numeric onChange={change} />)); fireEvent.changeText(screen.getByLabelText('Seconds'), '١٫٠٥٣'); expect(change).toHaveBeenLastCalledWith('1.053'); fireEvent.changeText(screen.getByLabelText('Seconds'), '0,053'); expect(change).toHaveBeenLastCalledWith('0.053')
    screen.rerender(wrap(<Field label="Name" value="" onChange={change} />)); fireEvent.changeText(screen.getByLabelText('Name'), 'https://example.com/a?x=1'); expect(change).toHaveBeenLastCalledWith('https://example.com/a?x=1')
  })
  it('accepts a description-only music draft and rejects malformed numeric fields before any request', () => {
    const screen = render(wrap(<MusicScreen />)); fireEvent.changeText(screen.getByLabelText(messages.en['music.description']), 'Warm instrumental entrance'); const generate = () => screen.getByRole('button', { name: messages.en['music.generate'] }); expect(generate()).toBeEnabled()
    for (const invalid of ['', 'NaN', '1e2', '-1', '1000', 'https://example.com']) { fireEvent.changeText(screen.getByLabelText(messages.en['music.tempo']), invalid); expect(generate()).toBeDisabled() }
    fireEvent.changeText(screen.getByLabelText(messages.en['music.tempo']), '١٠٠'); expect(generate()).toBeEnabled(); fireEvent.changeText(screen.getByLabelText(messages.en['music.length']), '30.5'); expect(generate()).toBeDisabled(); expect(mockGenerate).not.toHaveBeenCalled()
  })
})
