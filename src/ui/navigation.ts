import { useNavigationContainerRef } from 'expo-router'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

export function useRootNavigationReady() {
  const navigation = useNavigationContainerRef()
  const subscribe = useCallback((notify: () => void) => {
    const ready = navigation.addListener('ready', notify)
    const state = navigation.addListener('state', notify)
    return () => { ready(); state() }
  }, [navigation])
  const snapshot = useCallback(() => navigation.isReady(), [navigation])
  return useSyncExternalStore(subscribe, snapshot, () => false)
}

/** Async work may finish after its screen is replaced or the activity reloads. */
export function useMounted() {
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  return mounted
}
