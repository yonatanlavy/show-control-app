/**
 * Generated from tokens.json. Do not add feature-level values here.
 * Hallmark · genre: atmospheric · macrostructure: Workbench · theme: Midnight
 * Hallmark pre-emit critique: P5 H5 E4 S5 R5 V5
 */

export const color = {
  canvas: "#0B0E14",
  surface: "#121722",
  surfaceRaised: "#1A2130",
  surfacePressed: "#242D3D",
  border: "#3C4658",
  borderSubtle: "#283142",
  borderStrong: "#657085",
  text: "#F4F5F7",
  textMuted: "#B7BFCC",
  textSubtle: "#8E98A9",
  accent: "#76A8FF",
  accentSurface: "#17335E",
  accentInk: "#08101E",
  go: "#EDF2F7",
  goPressed: "#CDD6E1",
  goInk: "#10151E",
  warning: "#F2B84B",
  warningSurface: "#3B2C0F",
  danger: "#FF766F",
  dangerSurface: "#491D22",
  success: "#62D7A3",
  successSurface: "#12382C",
  overlay: "#05070ACC",
  blackout: "#05070A",
  transparent: "#00000000",
  purpleCanvas: "#100D19",
  purpleSurface: "#1A1427",
  purpleRaised: "#261D39",
  purpleAccent: "#C0A0FF",
  purpleAccentSurface: "#392356",
  cobraCanvas: "#0A1210",
  cobraSurface: "#101F1B",
  cobraRaised: "#19312A",
  cobraAccent: "#81DDB2",
  cobraAccentSurface: "#204638",
  tagOrange: "#F79A56",
} as const

export const space = {
  none: 0,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const

export const size = {
  control: 48,
  controlLarge: 56,
  icon: 24,
  iconStroke: 2,
  coverHero: 144,
  coverPoster: 176,
  go: 104,
  contentMax: 720,
  nav: 72,
  runReadout: 244,
  runReadoutCompact: 176,
  goCompact: 96,
} as const

export const radius = { sm: 6, md: 10, lg: 16, xl: 24, round: 999 } as const

export const font = {
  family: { bodyLatin: "Geist", bodyLatinStrong: "GeistMedium", bodyLatinBold: "GeistBold", bodyHebrew: "Heebo", bodyHebrewStrong: "HeeboMedium", bodyHebrewBold: "HeeboBold", mono: "GeistMono", bodyFallback: "System", monoFallback: "monospace" },
  size: { caption: 13, body: 16, label: 17, title: 24, display: 34, time: 28 },
  lineHeight: { caption: 18, body: 24, label: 22, title: 30, display: 40, time: 32 },
  scale: { stageMax: 1.3, goMax: 1, goCueMax: 1.2 },
  weight: { regular: "400", medium: "500", semibold: "600", bold: "700" },
} as const

export const motion = { instant: 0, micro: 100, short: 150 } as const
export const opacity = { disabled: 0.5, muted: 0.72 } as const

export const tokens = { color, space, size, radius, font, motion, opacity } as const
export type Tokens = typeof tokens
