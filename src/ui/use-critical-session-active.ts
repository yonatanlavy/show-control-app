import { useSyncExternalStore } from 'react'
import { isCriticalSessionActive, subscribeCriticalSessionActive } from '../runtime/critical-session-gate'

/** Observe the narrow safety boolean, without subscribing to audio progress. */
export function useCriticalSessionActive(): boolean {
  return useSyncExternalStore(subscribeCriticalSessionActive, isCriticalSessionActive, isCriticalSessionActive)
}
