import { compileRunSnapshot, sampleControllerProfiles, sampleShow, transitionRunState } from '../../src/domain';
import type { Show } from '../../src/domain';

describe('run snapshot compiler', () => {
  it('compiles the sample into a bounded immutable run snapshot', () => {
    const result = compileRunSnapshot(sampleShow, 'set-main', sampleControllerProfiles);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.voiceLimit).toBe(8);
    expect(Object.isFrozen(result.snapshot)).toBe(true);
    expect(Object.isFrozen(result.snapshot.cueOrder)).toBe(true);
    expect(Object.isFrozen(result.snapshot.cues.opening)).toBe(true);
    expect(result.snapshot.media.map((x) => x.id).sort()).toEqual(['media-bed', 'media-hit', 'media-open']);
  });
  it('accepts groups through eight voices and rejects larger groups', () => {
    const crossfade = sampleShow.cues.crossfade;
    if (crossfade?.type !== 'group') throw new Error('Sample crossfade must be a group cue.');
    for (let size = 1; size <= 12; size += 1) {
      const show: Show = { ...sampleShow, cues: { ...sampleShow.cues, crossfade: { ...crossfade,
        children: Array.from({ length: size }, (_, index) => ({ cueId: index % 2 ? 'bed' : 'reveal', offsetMs: index })) } } };
      const result = compileRunSnapshot(show, 'set-main', sampleControllerProfiles);
      expect(result.ok).toBe(size <= 8);
    }
  });
  it('counts only audio children against group voice capacity', () => {
    const crossfade = sampleShow.cues.crossfade;
    const finale = sampleShow.cues.finale;
    if (crossfade?.type !== 'group' || finale?.type !== 'fade') throw new Error('Sample cues changed.');
    const show: Show = { ...sampleShow, cues: { ...sampleShow.cues,
      crossfade: { ...crossfade, children: [
        ...Array.from({ length: 8 }, (_, index) => ({ cueId: index % 2 ? 'bed' : 'reveal', offsetMs: index })),
        ...Array.from({ length: 4 }, (_, index) => ({ cueId: 'finale', offsetMs: index })),
      ] },
    } };
    expect(compileRunSnapshot(show, 'set-main', sampleControllerProfiles).ok).toBe(true);
  });
  it('allows whole-file auto-follow when decoded media supplies a finite end', () => {
    const opening = sampleShow.cues.opening;
    if (opening?.type !== 'audio') throw new Error('Sample opening must be audio.');
    const { trimOutMs: _trimOutMs, ...wholeFileOpening } = opening;
    const show: Show = { ...sampleShow, cues: { ...sampleShow.cues,
      opening: { ...wholeFileOpening, endBehavior: 'autoFollow' },
    } };
    expect(compileRunSnapshot(show, 'set-main', sampleControllerProfiles).ok).toBe(true);
  });
  it('rejects invalid timing, missing controller references, and duplicate stack entries', () => {
    const opening = sampleShow.cues.opening;
    if (opening?.type !== 'audio') throw new Error('Sample opening must be audio.');
    const show: Show = { ...sampleShow,
      cues: { ...sampleShow.cues, opening: { ...opening, trimInMs: Number.NaN } },
      sets: [{ ...sampleShow.sets[0]!, cueOrder: ['opening', 'opening'] }],
    };
    const result = compileRunSnapshot(show, 'set-main');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((item) => item.code === 'INVALID_TIMING')).toBe(true);
      expect(result.issues.some((item) => item.code === 'DUPLICATE_REFERENCE')).toBe(true);
      expect(result.issues.some((item) => item.code === 'CONTROLLER_MISSING')).toBe(true);
    }
  });
  it('rejects missing local media', () => {
    const show = { ...sampleShow, media: {} };
    const result = compileRunSnapshot(show, 'set-main');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((x) => x.code === 'MEDIA_MISSING')).toBe(true);
  });
});
describe('run state', () => {
  it('requires preflight before arming and explicit recovery after interruption', () => {
    let state = transitionRunState('editing', 'PREFLIGHT');
    state = transitionRunState(state, 'ARM'); state = transitionRunState(state, 'GO');
    state = transitionRunState(state, 'INTERRUPT'); expect(state).toBe('interrupted');
    expect(() => transitionRunState(state, 'RESUME')).toThrow();
    state = transitionRunState(state, 'RECOVER'); expect(transitionRunState(state, 'RESUME')).toBe('running');
  });
});
