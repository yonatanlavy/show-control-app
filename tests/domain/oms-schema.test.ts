import { compileRunSnapshot, sampleShow, sampleControllerProfiles, type Show } from '../../src/domain';
describe('OMS schema compilation', () => {
  it('keeps legacy transport and rejects rates outside the advertised range', () => {
    const legacy = compileRunSnapshot(sampleShow, 'set-main', sampleControllerProfiles);
    expect(legacy.ok && legacy.snapshot.transportMode).toBe('legacyCueStack');
    const opening = sampleShow.cues.opening;
    if (opening?.type !== 'audio') throw new Error('Invalid audio fixture');
    for (const playbackRate of [0.69, 2.01, Number.NaN]) {
      const show: Show = { ...sampleShow, cues: { ...sampleShow.cues, opening: { ...opening, playbackRate } } };
      expect(compileRunSnapshot(show, 'set-main', sampleControllerProfiles).ok).toBe(false);
    }
  });
  it('compiles set-scoped voice rules without invalidating other playlists', () => {
    const show: Show = { ...sampleShow, schemaVersion: 2,
      sets: [{ id: 'first', name: 'First', cueOrder: ['opening'], hitCueIds: [], transportMode: 'oms' },
        { id: 'second', name: 'Second', cueOrder: ['bed'], hitCueIds: [], transportMode: 'oms' }],
      voiceRules: [{ id: 'voice-first', locale: 'he', enabled: true, cueId: 'opening', phrases: ['בננה'], action: { type: 'PLAY', cueId: 'opening' }, delayMs: 4000 }] };
    const first = compileRunSnapshot(show, 'first', sampleControllerProfiles); const second = compileRunSnapshot(show, 'second', sampleControllerProfiles);
    expect(first.ok && first.snapshot.voiceRules?.length).toBe(1);
    expect(second.ok && second.snapshot.voiceRules?.length).toBe(0);
    expect(first.ok && first.snapshot.schemaVersion).toBe(2);
  });
  it('permits two Flic devices with the same physical primary input', () => {
    const result = compileRunSnapshot(sampleShow, 'set-main', [{ id: 'profile-stage', name: 'Two buttons', bindings: [
      { adapterId: 'flic', deviceId: 'one', inputKey: 'primary', command: { type: 'GO' } },
      { adapterId: 'flic', deviceId: 'two', inputKey: 'primary', command: { type: 'PANIC_FADE' } },
    ] }]);
    expect(result.ok).toBe(true);
  });
});
