import { Geist_400Regular, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist'
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono'
import { Heebo_400Regular, Heebo_600SemiBold, Heebo_700Bold } from '@expo-google-fonts/heebo'
import { useFonts } from 'expo-font'
import { Stack, usePathname, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { createContext, type PropsWithChildren, useContext, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { color } from '../src/design'
import { FontProvider } from '../src/design/FontProvider'
import { I18nProvider, useI18n } from '../src/i18n'
import { AppProvider, useApp } from '../src/ui'
import { useRootNavigationReady } from '../src/ui/navigation'
import { TypographyGate, useStartupFontReadiness } from '../src/ui/TypographyGate'

const FontsReadyContext = createContext(false)
function SessionFontPolicy({ loaded, children }: PropsWithChildren<{ loaded: boolean }>) {
  const { liveSession } = useApp()
  const [renderBundledFonts, setRenderBundledFonts] = useState(loaded)
  // Font registration may finish during a show. Keep the policy used on entry
  // until idle, without replacing routes, drafts, or the native session owner.
  if (!liveSession && renderBundledFonts !== loaded) setRenderBundledFonts(loaded)
  return <FontProvider loaded={renderBundledFonts}>{children}</FontProvider>
}
function ScreenTypographyLayout({ children }: PropsWithChildren) {
  const fontsReady = useContext(FontsReadyContext)
  const navigationReady = useRootNavigationReady()
  return <TypographyGate fontsReady={fontsReady} navigationReady={navigationReady}>{children}</TypographyGate>
}
// React Navigation invokes screenLayout once per descriptor as a plain callback.
// Hooks belong to the stable component it returns, not to that route loop.
function renderScreenTypographyLayout({ children }: PropsWithChildren) {
  return <ScreenTypographyLayout>{children}</ScreenTypographyLayout>
}

function LiveRouteGuard() {
  const pathname = usePathname()
  const router = useRouter()
  const { liveSession, session, libraryState } = useApp()
  const navigationReady = useRootNavigationReady()
  const inspectionDestination = useRef<string | null>(null)
  const inspectingNativeOwner = session.nativeSessionPending === true && session.phase === 'preparing' && !session.snapshot
  const hasNativeSnapshot = session.snapshot !== null && session.snapshot !== undefined

  useEffect(() => {
    if (!navigationReady) return
    const sessionRoute = session.sessionPurpose === 'rehearsal' ? '/rehearsal' : '/run'
    if (inspectingNativeOwner) {
      // Unknown surviving audio still needs immediate touch Stop/Panic. Keep the
      // intended idle destination so a null inspection cannot strand an empty Run.
      inspectionDestination.current ??= pathname === '/run' || pathname === '/recovery' ? '/preflight' : pathname
      if (pathname !== '/recovery') router.replace('/recovery')
      return
    }
    if (inspectionDestination.current !== null) {
      const destination = inspectionDestination.current
      inspectionDestination.current = null
      if (!liveSession && session.phase === 'idle') {
        if (pathname !== destination) router.replace(destination as never)
        return
      }
      if (liveSession && hasNativeSnapshot) {
        const adoptedRoute = ['interrupted', 'fault'].includes(session.phase) ? '/recovery' : sessionRoute
        if (pathname !== adoptedRoute) router.replace(adoptedRoute)
        return
      }
      // A failed read stays in Recovery. A later deliberate Exit owns its route.
    }
    if (liveSession && pathname !== sessionRoute && pathname !== '/recovery') router.replace(sessionRoute)
    else if (!liveSession && libraryState.status === 'ready' && !libraryState.settings.onboardingCompleted && pathname !== '/onboarding') router.replace('/onboarding')
  }, [libraryState.status, libraryState.settings.onboardingCompleted, liveSession, session.sessionPurpose, session.phase, inspectingNativeOwner, hasNativeSnapshot, navigationReady, pathname, router])

  return null
}

function StartupCover({ fontsReady }: { fontsReady: boolean }) {
  const { liveSession } = useApp(); const { t } = useI18n(); const navigationReady = useRootNavigationReady()
  if (liveSession || (fontsReady && navigationReady)) return null
  return <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common.loading')} style={[StyleSheet.absoluteFill, { backgroundColor: color.canvas, justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator color={color.accent} /></View>
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ Geist: Geist_400Regular, GeistMedium: Geist_600SemiBold, GeistBold: Geist_700Bold, GeistMono: GeistMono_500Medium, Heebo: Heebo_400Regular, HeeboMedium: Heebo_600SemiBold, HeeboBold: Heebo_700Bold })
  const fontsReady = useStartupFontReadiness(loaded || Boolean(error))
  return <SafeAreaProvider><I18nProvider><AppProvider><SessionFontPolicy loaded={loaded}><StatusBar style="light" /><FontsReadyContext.Provider value={fontsReady}><LiveRouteGuard /><Stack screenLayout={renderScreenTypographyLayout} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas }, animation: 'none' }}><Stack.Screen name="run" options={{ gestureEnabled: false }} /><Stack.Screen name="recovery" options={{ gestureEnabled: false }} /></Stack><StartupCover fontsReady={fontsReady} /></FontsReadyContext.Provider></SessionFontPolicy></AppProvider></I18nProvider></SafeAreaProvider>
}
