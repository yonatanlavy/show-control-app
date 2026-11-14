import { setCriticalSessionActive } from '../../src/runtime/critical-session-gate';
import { isDeviceSettingsActionPending, subscribeDeviceSettingsActions, withDeviceSettingsAction } from '../../src/runtime/device-settings-action';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

afterEach(() => {
  setCriticalSessionActive(false);
  expect(isDeviceSettingsActionPending()).toBe(false);
});

it('acquires admission synchronously and preserves the OS interaction result', async () => {
  const action = deferred<string>();
  const pending = withDeviceSettingsAction(() => action.promise);
  expect(isDeviceSettingsActionPending()).toBe(true);
  action.resolve('granted');
  await expect(pending).resolves.toBe('granted');
});

it('releases admission after synchronous and asynchronous failures', async () => {
  await expect(withDeviceSettingsAction(() => { throw new Error('Settings unavailable'); })).rejects.toThrow('Settings unavailable');
  expect(isDeviceSettingsActionPending()).toBe(false);
  const action = deferred<void>();
  const pending = withDeviceSettingsAction(() => action.promise);
  action.reject(new Error('Permission request failed'));
  await expect(pending).rejects.toThrow('Permission request failed');
});

it('keeps overlapping interactions blocked until the final owner settles', async () => {
  const first = deferred<void>(); const second = deferred<void>();
  const one = withDeviceSettingsAction(() => first.promise);
  const two = withDeviceSettingsAction(() => second.promise);
  first.resolve(); await one;
  expect(isDeviceSettingsActionPending()).toBe(true);
  second.resolve(); await two;
});

it('supports a panel lease around an adapter lease and a foreground-return wait', async () => {
  const launch = deferred<boolean>(); const returned = deferred<void>();
  const pending = withDeviceSettingsAction(async () => {
    await withDeviceSettingsAction(() => launch.promise);
    await returned.promise;
    return 'returned';
  });
  launch.resolve(true); await Promise.resolve(); await Promise.resolve();
  expect(isDeviceSettingsActionPending()).toBe(true);
  returned.resolve(); await expect(pending).resolves.toBe('returned');
});

it('rejects an action after preparation wins admission without calling the OS', async () => {
  setCriticalSessionActive(true);
  const work = jest.fn().mockResolvedValue(undefined);
  await expect(withDeviceSettingsAction(work)).rejects.toThrow('LIVE_SESSION_LOCKED');
  expect(work).not.toHaveBeenCalled();
});

it('isolates obsolete subscriber failures and retains a lease across interface teardown', async () => {
  const action = deferred<void>(); const observed: boolean[] = [];
  const removeBroken = subscribeDeviceSettingsActions(() => { throw new Error('Old interface'); });
  const remove = subscribeDeviceSettingsActions(() => observed.push(isDeviceSettingsActionPending()));
  const pending = withDeviceSettingsAction(() => action.promise);
  expect(observed).toEqual([true]);
  remove(); removeBroken();
  expect(isDeviceSettingsActionPending()).toBe(true);
  const fresh: boolean[] = [];
  const removeFresh = subscribeDeviceSettingsActions(() => fresh.push(isDeviceSettingsActionPending()));
  action.resolve(); await pending;
  expect(observed).toEqual([true]); expect(fresh).toEqual([false]);
  removeFresh();
});
