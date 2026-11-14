import { type PropsWithChildren, useEffect, useState } from 'react'
import { useApp } from './AppProvider'

export const STARTUP_FONT_WAIT_MS = 5_000

/** Bundled fonts may fail to settle; optional typography cannot indefinitely hide idle tools. */
export function useStartupFontReadiness(fontsSettled: boolean): boolean {
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    if (fontsSettled || expired) return undefined
    const timer = setTimeout(() => setExpired(true), STARTUP_FONT_WAIT_MS)
    return () => clearTimeout(timer)
  }, [fontsSettled, expired])
  return fontsSettled || expired
}

/** Briefly defer idle text measurement, then reveal with explicit system families if needed. */
export function TypographyGate({ fontsReady, navigationReady = true, children }: PropsWithChildren<{ fontsReady: boolean; navigationReady?: boolean }>) {
  const { liveSession } = useApp()
  // A reconciled live session must retain its manual safety controls immediately.
  if (liveSession || fontsReady && navigationReady) return children
  return null
}
