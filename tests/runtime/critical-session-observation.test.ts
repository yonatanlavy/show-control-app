import {
  isCriticalSessionActive,
  setCriticalSessionActive,
  subscribeCriticalSessionActive,
} from '../../src/runtime/critical-session-gate';

afterEach(() => setCriticalSessionActive(false));

it('publishes current state only for boolean transitions', () => {
  const values: boolean[] = [];
  const remove = subscribeCriticalSessionActive(() => values.push(isCriticalSessionActive()));
  try {
    setCriticalSessionActive(false);
    expect(values).toEqual([]);
    setCriticalSessionActive(true); setCriticalSessionActive(true);
    setCriticalSessionActive(false); setCriticalSessionActive(false);
    expect(values).toEqual([true, false]);
  } finally { remove(); }
});

it('preserves the safety write and other observers after an observer throws', () => {
  const removeBroken = subscribeCriticalSessionActive(() => { throw new Error('obsolete interface'); });
  const values: boolean[] = [];
  const removeHealthy = subscribeCriticalSessionActive(() => values.push(isCriticalSessionActive()));
  try {
    expect(() => setCriticalSessionActive(true)).not.toThrow();
    expect(isCriticalSessionActive()).toBe(true);
    expect(() => setCriticalSessionActive(false)).not.toThrow();
    expect(values).toEqual([true, false]);
  } finally { removeBroken(); removeHealthy(); }
});

it('owns repeated registrations independently and makes removal idempotent', () => {
  const listener = jest.fn();
  const removeFirst = subscribeCriticalSessionActive(listener);
  const removeSecond = subscribeCriticalSessionActive(listener);
  try {
    setCriticalSessionActive(true);
    expect(listener).toHaveBeenCalledTimes(2);
    removeFirst(); removeFirst();
    setCriticalSessionActive(false);
    expect(listener).toHaveBeenCalledTimes(3);
    removeSecond(); setCriticalSessionActive(true);
    expect(listener).toHaveBeenCalledTimes(3);
  } finally { removeFirst(); removeSecond(); }
});

it('does not invoke an observer removed by an earlier observer in the same publication', () => {
  let removeSecond = () => {};
  const removeFirst = subscribeCriticalSessionActive(() => removeSecond());
  const second = jest.fn();
  removeSecond = subscribeCriticalSessionActive(second);
  try {
    setCriticalSessionActive(true);
    expect(isCriticalSessionActive()).toBe(true);
    expect(second).not.toHaveBeenCalled();
  } finally { removeFirst(); removeSecond(); }
});

it('lets an observer subscribe during a transition without extending that publication', () => {
  let removeLate = () => {};
  const late = jest.fn();
  const removeFirst = subscribeCriticalSessionActive(() => {
    removeLate(); removeLate = subscribeCriticalSessionActive(late);
  });
  try {
    setCriticalSessionActive(true);
    expect(late).not.toHaveBeenCalled();
    removeFirst(); setCriticalSessionActive(false);
    expect(late).toHaveBeenCalledTimes(1);
  } finally { removeFirst(); removeLate(); }
});

it('retains the newest state if an observer causes a deliberate nested transition', () => {
  const remove = subscribeCriticalSessionActive(() => {
    if (isCriticalSessionActive()) setCriticalSessionActive(false);
  });
  try {
    setCriticalSessionActive(true);
    expect(isCriticalSessionActive()).toBe(false);
  } finally { remove(); }
});
