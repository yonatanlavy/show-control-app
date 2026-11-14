// Acceptance evidence must prove OS routing, not merely an active app session.
import { verifyReadyMediaRouting } from '../../tools/qa/ready-media-routing.cjs';

const identity = 'app.showcontrol.working/androidx.media3.session.id./7';
function session({ name = `androidx.media3.session.id. ${identity}`, pid = 123, app = 'app.showcontrol.working', active = true, state = 'PAUSED', position = 0, speed = 0, actions = 177, user = 0 } = {}) {
  return `    ${name} (userId=${user})\n      ownerPid=${pid}, ownerUid=10209, userId=${user}\n      package=${app}\n      active=${active}\n      state=PlaybackState {state=${state}(2), position=${position}, buffered position=0, speed=${speed}, updated=42, actions=${actions}, custom actions=[], active item id=0, error=null}\n`;
}
const dump = (owner = `${identity} (userId=0)`, records = session()) => `MEDIA SESSION SERVICE\n  Media button session is ${owner}\n  Sessions Stack - have 1 sessions:\n${records}  Audio playback (lastly played comes first)\n`;
const verify = (text: string) => verifyReadyMediaRouting(text, 'app.showcontrol.working', 123);

it('proves the current process owns Android media buttons while publicly silent and ready for GO', () => {
  expect(verify(dump())).toMatchObject({ pid: 123, phase: 'PAUSED', positionMs: 0, speed: 0, goAvailable: true });
  expect(verify(dump().replace(/\n/g, '\r\n'))).toMatchObject({ selectedSession: identity });
  expect(verify(dump(undefined, session({ name: identity })))).toMatchObject({ selectedSession: identity });
});
it('rejects the original failure: active Show Control session but no OS media-button owner', () => {
  expect(() => verify(dump('null'))).toThrow('NO_MEDIA_BUTTON_OWNER');
});
it('rejects another selected app, a stale session and a different Android user', () => {
  expect(() => verify(dump('another.player/session/1 (userId=0)'))).toThrow('WRONG_MEDIA_BUTTON_OWNER');
  expect(() => verify(dump(`${identity}-old (userId=0)`))).toThrow('WRONG_MEDIA_BUTTON_OWNER');
  expect(() => verify(dump(`${identity} (userId=10)`))).toThrow('WRONG_MEDIA_BUTTON_OWNER');
});
it('does not accept old-process, inactive or wrong-package records as current ownership', () => {
  for (const record of [session({ pid: 122 }), session({ active: false }), session({ app: 'app.showcontrol.working.fake' }), session({ user: 10 })]) {
    expect(() => verify(dump(undefined, record))).toThrow('NO_CURRENT_ACTIVE_SESSION');
  }
});
it('rejects ambiguous current sessions and does not match a stale active process ahead of the real one', () => {
  expect(() => verify(dump(undefined, session() + session({ name: identity + '-second' })))).toThrow('AMBIGUOUS_ACTIVE_SESSION');
  expect(verify(dump(undefined, session({ name: identity + '-old', pid: 122 }) + session()))).toMatchObject({ pid: 123 });
});
it.each([
  { label: 'playing', changes: { state: 'PLAYING', speed: 1 } },
  { label: 'nonzero paused position', changes: { position: 200 } },
  { label: 'nonzero speed', changes: { speed: 1 } },
  { label: 'error', changes: { state: 'ERROR' } },
])('rejects $label as silent Ready', ({ changes }) => {
  expect(() => verify(dump(undefined, session(changes)))).toThrow('NOT_SILENT_READY');
});
it('requires actual GO availability instead of treating the completed final cue as ready', () => {
  expect(() => verify(dump(undefined, session({ actions: 145 })))).toThrow('GO_UNAVAILABLE');
});
it('rejects malformed/oversized evidence and invalid expected identities', () => {
  expect(() => verify('not a media dump')).toThrow('NO_MEDIA_BUTTON_OWNER');
  expect(() => verify('x'.repeat(4 * 1024 * 1024 + 1))).toThrow('INVALID_OBSERVATION');
  expect(() => verifyReadyMediaRouting(dump(), 'app.*', 123)).toThrow('INVALID_OBSERVATION');
  expect(() => verifyReadyMediaRouting(dump(), 'app.showcontrol.working', Number.NaN)).toThrow('INVALID_OBSERVATION');
});
