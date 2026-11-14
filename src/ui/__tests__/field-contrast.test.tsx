import { render } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { ThemeProvider, themeColors } from '../../design/ThemeProvider'
import { I18nProvider } from '../../i18n'
import { Field } from '../primitives'

function luminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Expected opaque sRGB color: ${hex}`)
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground); const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

describe.each(['darkBlue', 'purpleNight', 'cobra'] as const)('%s field boundaries', (theme) => {
  it.each([false, true])('identifies the rendered input against canvas and surface when invalid=%s', (invalid) => {
    const screen = render(<I18nProvider><ThemeProvider theme={theme}>
      <Field label="Name" value="Show" onChange={jest.fn()} invalid={invalid} />
    </ThemeProvider></I18nProvider>)
    // Resolve the component's complete style array: a later override previously
    // weakened the declared border despite the strong default style token.
    const input = screen.getByDisplayValue('Show')
    const boundary = String(StyleSheet.flatten(input.props.style).borderColor)
    for (const outside of [themeColors[theme].canvas, themeColors[theme].surface]) {
      expect(contrast(boundary, outside)).toBeGreaterThanOrEqual(3)
    }
  })
})
