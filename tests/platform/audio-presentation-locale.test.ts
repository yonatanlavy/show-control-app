import { compileRunSnapshot, sampleControllerProfiles, sampleShow, type AppLocale } from '../../src/domain'

const mockPrepare = jest.fn<Promise<void>, [string]>()
jest.mock('expo', () => ({ requireOptionalNativeModule: () => ({ prepare: (json: string) => mockPrepare(json) }) }))
let audio: typeof import('../../modules/show-audio').default
const compiled = compileRunSnapshot(sampleShow, sampleShow.sets[0]!.id, sampleControllerProfiles)
if (!compiled.ok) throw new Error('Invalid presentation fixture')
const snapshot = compiled.snapshot

beforeEach(() => {
  mockPrepare.mockReset().mockResolvedValue(undefined)
  jest.isolateModules(() => { audio = jest.requireActual<typeof import('../../modules/show-audio')>('../../modules/show-audio').default })
})

it('keeps legacy callers on system-language fallback without changing the immutable snapshot', async () => {
  await audio.prepare(snapshot)
  expect(JSON.parse(mockPrepare.mock.calls[0]![0])).toEqual({ ...snapshot, sessionPurpose: 'performance' })
  expect(snapshot).not.toHaveProperty('presentationLocale')
})

it.each<AppLocale>(['en', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ar'])('captures %s only when the user deliberately prepares', async (locale) => {
  audio.configurePresentationLocale(locale)
  expect(mockPrepare).not.toHaveBeenCalled()
  await audio.prepare(snapshot, 'rehearsal')
  expect(JSON.parse(mockPrepare.mock.calls[0]![0])).toEqual({ ...snapshot, sessionPurpose: 'rehearsal', presentationLocale: locale })
  expect(snapshot).not.toHaveProperty('presentationLocale')
})

it('does not rewrite the captured owner when the next presentation language changes', async () => {
  audio.configurePresentationLocale('he')
  await audio.prepare(snapshot)
  const firstOwner = mockPrepare.mock.calls[0]![0]
  audio.configurePresentationLocale('ar')
  expect(mockPrepare).toHaveBeenCalledTimes(1)
  expect(JSON.parse(firstOwner).presentationLocale).toBe('he')
  await audio.prepare(snapshot)
  expect(JSON.parse(mockPrepare.mock.calls[1]![0]).presentationLocale).toBe('ar')
})
