import { createContext, type PropsWithChildren, useContext } from 'react'
import type { StageTheme } from '../domain'
import { color } from './tokens.native'

type ColorRoles = { [K in keyof typeof color]: string }
export const themeColors: Record<StageTheme, ColorRoles> = {
  darkBlue: { ...color },
  purpleNight: { ...color, canvas: color.purpleCanvas, surface: color.purpleSurface, surfaceRaised: color.purpleRaised, accent: color.purpleAccent, accentSurface: color.purpleAccentSurface },
  cobra: { ...color, canvas: color.cobraCanvas, surface: color.cobraSurface, surfaceRaised: color.cobraRaised, accent: color.cobraAccent, accentSurface: color.cobraAccentSurface },
}
const ThemeContext = createContext(themeColors.darkBlue)
export function ThemeProvider({ theme, children }: PropsWithChildren<{ theme: StageTheme }>) {
  return <ThemeContext.Provider value={themeColors[theme] ?? themeColors.darkBlue}>{children}</ThemeContext.Provider>
}
export const useThemeColors = () => useContext(ThemeContext)
