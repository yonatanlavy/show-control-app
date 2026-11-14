import type { AudioEngine } from '../../src/audio';
import { sampleShow, sampleControllerProfiles } from '../../src/domain';
import { isCriticalSessionActive, isCriticalShowSession, setCriticalSessionActive, ShowSession } from '../../src/runtime';

afterEach(() => setCriticalSessionActive(false));

it('locks mutation/network/audition gates while native preparation is still awaiting IO', async () => {
  let finish!: () => void;
  const engine: AudioEngine = {
    prepare: jest.fn(() => new Promise<void>((resolve) => { finish = resolve; })),
    dispatch: jest.fn(async () => undefined), shutdown: jest.fn(async () => undefined),
    subscribe: () => ({ remove() {} }),
  };
  const session = new ShowSession({ engine });
  const subscription = session.subscribe((state) => setCriticalSessionActive(isCriticalShowSession(state)));
  const pending = session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles);
  expect(session.getState().phase).toBe('preparing');
  expect(isCriticalSessionActive()).toBe(true);
  expect(session.go()).toBeNull();
  finish(); await pending;
  expect(session.getState().phase).toBe('ready');
  expect(isCriticalSessionActive()).toBe(true);
  await session.exitRun();
  expect(isCriticalSessionActive()).toBe(false);
  subscription.remove(); await session.shutdown();
});
