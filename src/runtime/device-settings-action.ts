import { isCriticalSessionActive } from './critical-session-gate';

let pendingActions = 0;
const listeners = new Set<() => void>();

export function isDeviceSettingsActionPending(): boolean {
  return pendingActions > 0;
}

export function subscribeDeviceSettingsActions(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function publish(): void {
  // One obsolete interface cannot prevent another interface from observing the
  // lease, or keep its release from running. No setting values are published.
  for (const listener of [...listeners]) {
    try { listener(); } catch { /* Listener ownership is independent of admission. */ }
  }
}

/** Block preparation for the entire OS interaction, without owning task feedback. */
export async function withDeviceSettingsAction<T>(work: () => Promise<T>): Promise<T> {
  if (isCriticalSessionActive()) throw new Error('LIVE_SESSION_LOCKED: Exit the show before changing system settings.');
  pendingActions += 1;
  publish();
  try { return await work(); }
  finally { pendingActions -= 1; publish(); }
}
