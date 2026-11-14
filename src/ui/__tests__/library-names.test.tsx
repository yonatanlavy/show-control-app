import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import { Modal } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { sampleShow, type Show } from '../../domain'
import { I18nProvider, messages } from '../../i18n'
import { BuilderScreen, LibraryScreen } from '../library-screens'
import { TextEntryForm } from '../workflow-components'

const mockRouter = { push: jest.fn(), replace: jest.fn() }
const mockLibrary = {
  trash: jest.fn().mockResolvedValue([]), createShow: jest.fn(), renameShow: jest.fn(), duplicateShow: jest.fn(),
  createSet: jest.fn(), renameSet: jest.fn(), duplicateSet: jest.fn(), select: jest.fn(),
}
const mockApp = {
  library: mockLibrary, show: sampleShow as Show, set: sampleShow.sets[0]!, busy: false, error: null,
  libraryState: { status: 'ready', saving: false, shows: [sampleShow] as readonly Show[], selectedShowId: sampleShow.id, selectedSetId: sampleShow.sets[0]!.id },
  runTask: async (work: () => Promise<unknown>) => { await work(); return true },
}
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('../BackgroundReliabilityPanel', () => ({ BackgroundReliabilityPanel: () => null }))
const wrap = (children: React.ReactNode) => <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}><I18nProvider>{children}</I18nProvider></SafeAreaInsetsContext.Provider>

beforeEach(() => {
  jest.clearAllMocks()
  mockApp.show = structuredClone(sampleShow); mockApp.set = mockApp.show.sets[0]!
  mockApp.libraryState.shows = [mockApp.show]
  mockLibrary.createShow.mockResolvedValue(mockApp.show); mockLibrary.renameSet.mockResolvedValue(mockApp.show)
  mockLibrary.createSet.mockResolvedValue(mockApp.show); mockLibrary.duplicateShow.mockResolvedValue(mockApp.show)
})

it('keeps an invalid supplied name intact, explains the bound and permits a corrected boundary name', async () => {
  const save = jest.fn().mockResolvedValue(true)
  const invalid = 'x'.repeat(201)
  const screen = render(wrap(<TextEntryForm libraryName initialValue={invalid} label="Name" confirmLabel="Save" onConfirm={save} onCancel={jest.fn()} />))
  expect(screen.getByLabelText('Name').props.value).toBe(invalid)
  expect(screen.getByLabelText('Name').props.maxLength).toBe(1000)
  expect(screen.getByText(messages.en['use.library.nameLimit'])).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  fireEvent.press(screen.getByRole('button', { name: 'Save' })); expect(save).not.toHaveBeenCalled()
  fireEvent.changeText(screen.getByLabelText('Name'), 'x'.repeat(200))
  fireEvent.press(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith('x'.repeat(200)))
})

it('validates after NFC normalization and submits the complete normalized name without cutting a supplied draft', async () => {
  const save = jest.fn().mockResolvedValue(true)
  const draft = 'e\u0301'.repeat(200)
  const screen = render(wrap(<TextEntryForm libraryName initialValue={draft} label="Name" confirmLabel="Save" onConfirm={save} onCancel={jest.fn()} />))
  expect(screen.getByLabelText('Name').props.value).toBe(draft)
  expect(screen.getByLabelText('Name').props.maxLength).toBe(1000)
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  fireEvent.press(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith('é'.repeat(200)))
})

it('retains a longer legacy draft inside its initial native cap and requires a corrected authoring name', async () => {
  const save = jest.fn().mockResolvedValue(true)
  const legacy = 'x'.repeat(1200)
  const screen = render(wrap(<TextEntryForm libraryName initialValue={legacy} label="Name" confirmLabel="Save" onConfirm={save} onCancel={jest.fn()} />))
  expect(screen.getByLabelText('Name').props.value).toBe(legacy)
  expect(screen.getByLabelText('Name').props.maxLength).toBe(legacy.length)
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  fireEvent.changeText(screen.getByLabelText('Name'), 'Corrected legacy name')
  fireEvent.press(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith('Corrected legacy name'))
})

it('applies the authoring bound before creating a show', async () => {
  const screen = render(wrap(<LibraryScreen />))
  fireEvent.press(screen.getByRole('button', { name: messages.en['library.create'] }))
  const dialog = within(screen.UNSAFE_getByType(Modal))
  fireEvent.changeText(dialog.getByLabelText(messages.en['common.name']), 'x'.repeat(201))
  expect(dialog.getByRole('button', { name: messages.en['library.create'] })).toBeDisabled()
  expect(mockLibrary.createShow).not.toHaveBeenCalled()
  fireEvent.changeText(dialog.getByLabelText(messages.en['common.name']), 'x'.repeat(200))
  fireEvent.press(dialog.getByRole('button', { name: messages.en['library.create'] }))
  await waitFor(() => expect(mockLibrary.createShow).toHaveBeenCalledWith('x'.repeat(200)))
})

it('keeps an existing imported playlist name editable and blocks invalid rename/create submissions', async () => {
  const imported = 'x'.repeat(256)
  mockApp.set = { ...mockApp.set, name: imported }
  mockApp.show = { ...mockApp.show, sets: [mockApp.set] }; mockApp.libraryState.shows = [mockApp.show]
  const screen = render(wrap(<BuilderScreen />))
  fireEvent.press(screen.getByRole('button', { name: messages.en['library.playlists'] }))
  fireEvent.press(screen.getByRole('button', { name: messages.en['common.manage'] + ' · ' + imported }))
  fireEvent.press(screen.getByRole('button', { name: messages.en['common.rename'] }))
  const fields = screen.getAllByLabelText(messages.en['common.name'])
  expect(fields[0]!.props.value).toBe(imported)
  expect(fields.map((field) => field.props.maxLength)).toEqual([1000, 1000])
  expect(screen.getByRole('button', { name: messages.en['common.save'] })).toBeDisabled()
  fireEvent.changeText(fields[0]!, 'Renamed playlist')
  fireEvent.press(screen.getByRole('button', { name: messages.en['common.save'] }))
  await waitFor(() => expect(mockLibrary.renameSet).toHaveBeenCalledWith(mockApp.show.id, mockApp.set.id, 'Renamed playlist'))
  fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), 'p'.repeat(201))
  expect(screen.getByRole('button', { name: messages.en['library.newPlaylist'] })).toBeDisabled()
  expect(mockLibrary.createSet).not.toHaveBeenCalled()
  fireEvent.changeText(screen.getByLabelText(messages.en['common.name']), 'p'.repeat(200))
  fireEvent.press(screen.getByRole('button', { name: messages.en['library.newPlaylist'] }))
  await waitFor(() => expect(mockLibrary.createSet).toHaveBeenCalledWith(mockApp.show.id, 'p'.repeat(200)))
})

it('generates a valid localized duplicate name for a maximum-length show without changing its source', async () => {
  const original = 'x'.repeat(200)
  mockApp.show = { ...mockApp.show, name: original }; mockApp.libraryState.shows = [mockApp.show]
  const screen = render(wrap(<LibraryScreen />))
  fireEvent.press(screen.getByRole('button', { name: messages.en['common.manage'] + ' · ' + original }))
  fireEvent.press(screen.getByRole('button', { name: messages.en['common.duplicate'] }))
  await waitFor(() => expect(mockLibrary.duplicateShow).toHaveBeenCalledTimes(1))
  const name = mockLibrary.duplicateShow.mock.calls[0]![1] as string
  expect(name.length).toBeLessThanOrEqual(200); expect(name.endsWith(' · ' + messages.en['common.duplicate'])).toBe(true)
  expect(mockApp.show.name).toBe(original)
  await act(async () => undefined)
})
