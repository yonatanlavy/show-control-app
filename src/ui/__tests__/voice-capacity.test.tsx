import { render } from '@testing-library/react-native'
import { font } from '../../design'
import { I18nProvider, messages } from '../../i18n'
import { VoiceCapacity } from '../VoiceCapacity'

let mockLocale = 'en'
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: mockLocale }] }))
beforeEach(() => { mockLocale = 'en' })

it.each(['en', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ar'] as const)('keeps the %s native-capacity ratio directional with a plain spoken label', (locale) => {
  mockLocale = locale
  const screen = render(<I18nProvider><VoiceCapacity active={8} limit={8} stageSafe /></I18nProvider>)
  const prefix = messages[locale]['refine.voices'], eight = (8).toLocaleString(locale)
  const node = screen.getByLabelText(`${prefix}: ${eight} / ${eight}`)
  expect(node.props.children).toBe(`${prefix}: \u2066${eight} / ${eight}\u2069`)
  expect(node.props.accessibilityLabel).not.toMatch(/[\u2066-\u2069]/)
  expect(node.props.numberOfLines).toBe(1)
  expect(node.props.maxFontSizeMultiplier).toBe(font.scale.stageMax)
  screen.rerender(<I18nProvider><VoiceCapacity active={0} limit={8} stageSafe /></I18nProvider>)
  expect(screen.getByLabelText(`${prefix}: ${(0).toLocaleString(locale)} / ${eight}`)).toBeTruthy()
})

it('keeps reading-size scaling available outside the fixed Run readout', () => {
  const screen = render(<I18nProvider><VoiceCapacity active={3} limit={8} /></I18nProvider>)
  const node = screen.getByLabelText(`${messages.en['refine.voices']}: 3 / 8`)
  expect(node.props.maxFontSizeMultiplier).toBeUndefined()
  expect(node.props.numberOfLines).toBeUndefined()
})
