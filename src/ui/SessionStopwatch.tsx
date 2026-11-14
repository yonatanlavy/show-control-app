import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { space } from '../design'

interface StopwatchState { readonly running: boolean; readonly elapsedMs: number; readonly visible: boolean; readonly position: { readonly x: number; readonly y: number } }
export function createSessionStopwatch(clock: () => number = () => performance.now()) {
  let state: StopwatchState = { running: false, elapsedMs: 0, visible: false, position: { x: space.md, y: space.lg } }
  let startedAt = 0; let retained = 0; const listeners = new Set<() => void>()
  const elapsed = () => retained + (state.running ? Math.max(0, clock() - startedAt) : 0)
  const publish = (next: StopwatchState) => { state = next; listeners.forEach((listener) => listener()) }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    tick: () => { const elapsedMs = elapsed(); if (elapsedMs !== state.elapsedMs) publish({ ...state, elapsedMs }) },
    start: () => { if (state.running) return; startedAt = clock(); publish({ ...state, running: true }) },
    pause: () => { if (!state.running) return; retained = elapsed(); publish({ ...state, running: false, elapsedMs: retained }) },
    reset: () => { retained = 0; startedAt = clock(); publish({ ...state, elapsedMs: 0 }) },
    setVisible: (visible: boolean) => { const elapsedMs = elapsed(); if (visible !== state.visible || elapsedMs !== state.elapsedMs) publish({ ...state, visible, elapsedMs }) },
    setPosition: (position: StopwatchState['position']) => { if (Number.isFinite(position.x) && Number.isFinite(position.y) && (position.x !== state.position.x || position.y !== state.position.y)) publish({ ...state, position: { x: Math.max(0, position.x), y: Math.max(0, position.y) } }) },
  }
}
type Stopwatch = ReturnType<typeof createSessionStopwatch>
const StopwatchContext = createContext<Stopwatch | null>(null)
/** Reset the clock for a new session without remounting routes or dropping exit callbacks. */
export function SessionStopwatchProvider({ children, sessionId = 'local' }: PropsWithChildren<{ sessionId?: string }>) {
  const owner = useMemo(() => ({ sessionId, store: createSessionStopwatch() }), [sessionId])
  const store = owner.store
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  useEffect(() => {
    if (!state.running || !state.visible) return undefined
    store.tick(); const interval = setInterval(store.tick, 250)
    return () => clearInterval(interval)
  }, [store, state.running, state.visible])
  return <StopwatchContext.Provider value={store}>{children}</StopwatchContext.Provider>
}
export function useSessionStopwatch() {
  const shared = useContext(StopwatchContext); const [local] = useState(createSessionStopwatch); const store = shared ?? local
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  useEffect(() => {
    if (shared || !state.running || !state.visible) return undefined
    store.tick(); const interval = setInterval(store.tick, 250)
    return () => clearInterval(interval)
  }, [store, shared, state.running, state.visible])
  return { ...state, start: store.start, pause: store.pause, reset: store.reset, setVisible: store.setVisible, setPosition: store.setPosition }
}
