import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { font } from '../../design'
import { FontProvider } from '../../design/FontProvider'
import { I18nProvider } from '../../i18n'
import { AppText, Field } from '../primitives'
import { TypographyGate } from '../TypographyGate'

const mockApp = { liveSession: false }
let mockLocale = 'en'
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: mockLocale }] }))
beforeEach(() => { mockApp.liveSession = false; mockLocale = 'en' })

it('defers initial text measurement until fonts are ready, then mounts the route', () => {
  const screen = render(<I18nProvider><TypographyGate fontsReady={false}><Text>Playlist route</Text></TypographyGate></I18nProvider>)
  expect(screen.queryByText('Playlist route')).toBeNull()
  screen.rerender(<I18nProvider><TypographyGate fontsReady><Text>Playlist route</Text></TypographyGate></I18nProvider>)
  expect(screen.getByText('Playlist route')).toBeTruthy()
})

it('never holds back a reconciled live session while fonts are loading', () => {
  mockApp.liveSession = true
  const screen = render(<I18nProvider><TypographyGate fontsReady={false} navigationReady={false}><Text>Safety controls</Text></TypographyGate></I18nProvider>)
  expect(screen.getByText('Safety controls')).toBeTruthy()
  expect(screen.queryByRole('progressbar')).toBeNull()
})

it.each(['en', 'he', 'ar'])('switches real %s text and fields from system fallback to registered families in place', (locale) => {
  mockLocale = locale
  const content = <><AppText tone="label">Song settings</AppText><AppText tone="label" style={{ fontFamily: font.family.mono }}>01:25</AppText><Field label="Song name" value="Saved draft" onChange={() => undefined} /><Field label="Seconds" value="12.345" numeric onChange={() => undefined} /></>
  const screen = render(<I18nProvider><FontProvider loaded={false}>{content}</FontProvider></I18nProvider>)
  const nameField = screen.getByLabelText('Song name')
  expect(screen.getByText('Song settings')).toHaveStyle({ fontFamily: font.family.bodyFallback, fontWeight: font.weight.semibold })
  expect(screen.getByText('01:25')).toHaveStyle({ fontFamily: font.family.monoFallback })
  expect(nameField).toHaveStyle({ fontFamily: font.family.bodyFallback, writingDirection: locale === 'en' ? 'ltr' : 'rtl' })
  expect(screen.getByLabelText('Seconds')).toHaveStyle({ fontFamily: font.family.monoFallback, writingDirection: 'ltr' })
  screen.rerender(<I18nProvider><FontProvider loaded>{content}</FontProvider></I18nProvider>)
  expect(screen.getByText('Song settings')).toHaveStyle({ fontFamily: locale === 'ar' ? font.family.bodyFallback : locale === 'he' ? font.family.bodyHebrewStrong : font.family.bodyLatinStrong })
  expect(screen.getByText('01:25')).toHaveStyle({ fontFamily: font.family.mono })
  expect(screen.getByLabelText('Song name')).toBe(nameField)
  expect(screen.getByLabelText('Song name').props.value).toBe('Saved draft')
  expect(screen.getByLabelText('Seconds')).toHaveStyle({ fontFamily: font.family.mono })
})
