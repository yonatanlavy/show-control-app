import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useId, useRef, useState } from 'react';
import { AppState } from 'react-native';

/** Screen policy only; native audio owns background execution independently. */
export function useCriticalScreenAwake(enabled: boolean): void {
  const owner = useId();
  const serial = useRef(0);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!enabled || !active) return undefined;
    // Each activation owns a different tag: a late old activation cannot release
    // the new foreground owner's lock after a quick background/foreground cycle.
    const tag = `show-control-screen:${owner}:${++serial.current}`;
    let current = true;
    void activateKeepAwakeAsync(tag).then(() => { if (!current) void deactivateKeepAwake(tag).catch(() => undefined); }).catch(() => undefined);
    return () => { current = false; void deactivateKeepAwake(tag).catch(() => undefined); };
  }, [active, enabled, owner]);
}
