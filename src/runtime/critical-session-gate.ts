import type { ShowSessionState } from './show-session';

let criticalSessionActive = false;
const listeners = new Set<() => void>();

const livePhases = new Set<ShowSessionState['phase']>([
  'preparing', 'ready', 'running', 'paused', 'fading', 'stopped', 'interrupted', 'fault',
]);

export function isCriticalShowSession(state: ShowSessionState): boolean {
  return state.nativeSessionPending === true || state.snapshot !== null && livePhases.has(state.phase);
}

export function setCriticalSessionActive(active: boolean): void {
  if (criticalSessionActive === active) return;
  criticalSessionActive = active;
  // Publish only the boolean transition. An obsolete display observer must not
  // prevent the safety write, another observer, or native command ownership.
  for (const listener of [...listeners]) {
    if (!listeners.has(listener)) continue;
    try { listener(); } catch { /* Display observation cannot own admission. */ }
  }
}

export function isCriticalSessionActive(): boolean {
  return criticalSessionActive;
}

export function subscribeCriticalSessionActive(listener: () => void): () => void {
  const subscription = () => { listener(); };
  listeners.add(subscription);
  return () => { listeners.delete(subscription); };
}
