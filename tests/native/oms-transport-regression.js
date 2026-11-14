/* Run in the signed development build through the native-audio probe. The
 * managed WAV is the original synthetic QA fixture, never a user's show edit.
 * Every snapshot is ephemeral and cleanup always leaves the native owner silent.
 */
(async () => {
  const audio = globalThis.expo.modules.ShowAudio;
  const events = [];
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const state = () => audio.getState();
  const command = (type, fields) => audio.dispatchSemantic(JSON.stringify({ type, ...fields }));
  const until = async (predicate, description) => {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) { if (await predicate()) return; await wait(25); }
    throw new Error(`Timed out: ${description}`);
  };
  const initial = await state();
  assert(initial.activeVoiceCount === 0 && initial.phase === 'stopped' && !initial.showId, 'Disarm the show before running this native regression');
  // The iOS/device harness may inject the same synthetic WAV's managed URI.
  const uri = globalThis.__showControlQaMediaUri ?? 'file:///data/user/0/app.showcontrol.working/files/show-control-library/media/a79c60a668102d470f4dc35b0a8844750d61e1a9487e7611d2d530bb6589af1c.wav';
  const probe = await audio.probeMedia(uri);
  const checksumSha256 = await audio.sha256File(uri);
  assert(checksumSha256 === 'a79c60a668102d470f4dc35b0a8844750d61e1a9487e7611d2d530bb6589af1c', 'Synthetic QA media checksum changed');
  const subscription = audio.addListener('onEngineEvent', (event) => events.push({ ...event, observedAt: Date.now() }));
  const mediaAsset = { id: 'regression-media', localUri: uri, checksumSha256, bytes: 2646044, ...probe };
  const base = { type: 'audio', name: 'Transport regression', tags: [], mediaAssetId: mediaAsset.id, mediaAsset,
    trimInMs: 1000, trimOutMs: 9000, gainDb: -96, fadeInMs: 0, fadeOutMs: 1800, fadeCurve: 'smooth', preWaitMs: 0,
    endBehavior: 'stopAndReadyNext', playbackRate: 1, autoPlay: false, crossfadeEnabled: false, crossfadeMs: 1200 };
  const starts = (id) => events.filter((event) => event.type === 'VOICE_START' && event.cueId === id && event.mainTransport);
  const prepare = (first, second, purpose, hitCueIds = ['hit']) => {
    events.length = 0;
    return audio.prepare(JSON.stringify({ schemaVersion: 2, transportMode: 'oms', sessionPurpose: purpose,
      showId: 'oms-regression', setId: 'ephemeral-set', revisionId: `regression-${Date.now()}`, voiceLimit: 8, panicFadeMs: 1200,
      cueOrder: ['a', 'b', 'c'], hitCueIds, cues: {
        a: { ...base, id: 'a', ...first }, b: { ...base, id: 'b', autoPlay: true, fadeOutMs: 0, ...second },
        c: { ...base, id: 'c' }, hit: { ...base, id: 'hit', endBehavior: 'loop', trimOutMs: 1300 },
      } }));
  };
  const results = [];
  try {
    await prepare({ fadeOutMs: 0 }, {}, 'performance');
    await command('GO'); await until(() => starts('a').length === 1, 'performance actual start for seek refusal');
    const performance = await state();
    try { await audio.dispatch(JSON.stringify({ id: 41, type: 'SEEK_REHEARSAL', cueId: 'a', positionMs: 8000 })); } catch { /* Android rejects the bridge promise; iOS rejects admission asynchronously. */ }
    await until(() => Promise.resolve(events.some((event) => event.type === 'FAULT' && event.code === 'SEEK_REHEARSAL_ONLY')), 'native performance seek refusal');
    await wait(180);
    const unchanged = await state();
    assert(unchanged.sessionPurpose === 'performance' && unchanged.selectedCueId === 'a' && unchanged.currentCueId === 'a' && unchanged.activeVoiceCount === 1 && unchanged.generation === performance.generation,
      'Performance seek refusal altered playback');
    assert(!events.some((event) => event.type === 'ACK' && event.commandId === 41), 'A refused performance seek was acknowledged');
    const performanceProgress = events.filter((event) => event.type === 'PROGRESS' && event.cueId === 'a' && event.mainTransport);
    assert(performanceProgress.length > 0 && performanceProgress.every((event) => event.positionMs < 2000), 'Performance seek changed the source position');
    results.push('Native performance seek refused without ACK, source jump, or playback changes');

    await prepare({ trimInMs: 5000, trimOutMs: 9000, playbackRate: 2, fadeOutMs: 0 }, {}, 'rehearsal');
    await command('GO'); await until(() => starts('a').length === 1, 'rehearsal actual start for source seek');
    await command('PAUSE');
    await audio.dispatch(JSON.stringify({ id: 41, type: 'SEEK_REHEARSAL', cueId: 'a', positionMs: 7000 }));
    await until(() => Promise.resolve(events.some((event) => event.type === 'ACK' && event.commandId === 41)), 'native rehearsal seek acceptance');
    assert((await state()).phase === 'paused', 'Rehearsal source seek resumed playback');
    await command('RESUME');
    await until(() => Promise.resolve(events.some((event) => event.type === 'PROGRESS' && event.cueId === 'a' && event.mainTransport && event.positionMs >= 2000 && event.positionMs < 2800)), 'trim-relative source progress after deliberate resume');
    assert((await state()).sessionPurpose === 'rehearsal', 'Source seek changed the rehearsal purpose');
    results.push('Native rehearsal seeks absolute source time at 2x, stays paused, and resumes deliberately');

    const sharedCueRate = 0.7;
    await prepare({ trimInMs: 5000, trimOutMs: 15000, playbackRate: sharedCueRate, fadeOutMs: 0 }, {}, 'rehearsal', ['a']);
    await command('GO'); await until(() => starts('a').length === 1, 'shared main cue actual start');
    await command('TRIGGER_HIT', { cueId: 'a' });
    await until(() => Promise.resolve(events.some((event) => event.type === 'VOICE_START' && event.cueId === 'a' && !event.mainTransport)), 'same-cue independent Hit actual start');
    const primaryVoiceId = starts('a')[0].voiceId;
    const hitVoiceId = events.find((event) => event.type === 'VOICE_START' && event.cueId === 'a' && !event.mainTransport).voiceId;
    const progressFor = (voiceId) => events.filter((event) => event.type === 'PROGRESS' && event.voiceId === voiceId);
    const acknowledgement = (id) => events.find((event) => event.type === 'ACK' && event.commandId === id);
    await until(() => Promise.resolve(progressFor(hitVoiceId).length > 0), 'independent Hit source position before pause');
    await audio.dispatch(JSON.stringify({ id: 40, type: 'PAUSE' }));
    await until(() => Promise.resolve(acknowledgement(40)), 'native pause timestamp');
    const pauseAck = acknowledgement(40);
    const hitBefore = progressFor(hitVoiceId).filter((event) => event.monotonicMs <= pauseAck.monotonicMs).slice(-1)[0];
    assert(hitBefore && Number.isFinite(hitBefore.positionMs) && Number.isFinite(hitBefore.monotonicMs) && Number.isFinite(pauseAck.monotonicMs), 'Hit pause baseline lacks native timing');
    // Pick a distant source point even if debugger delivery was slow before pause.
    const hitAtPause = hitBefore.positionMs + Math.max(0, pauseAck.monotonicMs - hitBefore.monotonicMs) * sharedCueRate;
    const targetRelativeMs = hitAtPause < 4000 ? 7000 : 1000;
    await audio.dispatch(JSON.stringify({ id: 41, type: 'SEEK_REHEARSAL', cueId: 'a', positionMs: 5000 + targetRelativeMs }));
    await until(() => Promise.resolve(events.some((event) => event.type === 'ACK' && event.commandId === 41)), 'shared-cue primary seek acceptance');
    assert((await state()).phase === 'paused' && (await state()).activeVoiceCount === 2, 'Shared-cue seek changed pause state or voice ownership');
    const seekAck = acknowledgement(41);
    await audio.dispatch(JSON.stringify({ id: 42, type: 'RESUME' }));
    await until(() => Promise.resolve(acknowledgement(42)), 'native deliberate resume timestamp');
    const resumeAck = acknowledgement(42);
    assert(Number.isFinite(seekAck.monotonicMs) && Number.isFinite(resumeAck.monotonicMs), 'Seek/resume acknowledgements lack native timing');
    const resumedProgress = (voiceId) => progressFor(voiceId).filter((event) => event.monotonicMs > Math.max(seekAck.monotonicMs, resumeAck.monotonicMs));
    await until(() => Promise.resolve(resumedProgress(primaryVoiceId).length > 0 && resumedProgress(hitVoiceId).length > 0), 'post-seek and post-resume native progress from both voice identities');
    const primaryAfter = resumedProgress(primaryVoiceId)[0];
    const hitAfter = resumedProgress(hitVoiceId)[0];
    const toleranceMs = 250;
    const primaryExpected = targetRelativeMs + Math.max(0, primaryAfter.monotonicMs - resumeAck.monotonicMs) * sharedCueRate;
    assert(Math.abs(primaryAfter.positionMs - primaryExpected) <= toleranceMs, 'Primary did not seek in trimmed source time at its saved rate');
    // Native timestamps exclude the entire paused interval. Queued JS delivery
    // cannot make old progress qualify or enlarge the permitted Hit source jump.
    const runningElapsedMs = Math.max(0, pauseAck.monotonicMs - hitBefore.monotonicMs) + Math.max(0, hitAfter.monotonicMs - resumeAck.monotonicMs);
    const hitExpected = hitBefore.positionMs + runningElapsedMs * sharedCueRate;
    assert(Math.abs(hitAfter.positionMs - hitExpected) <= toleranceMs, 'Rehearsal main seek moved the independent same-cue Hit');
    results.push('Paused 0.7x main seek isolates a same-cue independent Hit and both resume deliberately');

    for (const rate of [0.7, 1, 2]) {
      await prepare({ endBehavior: 'loop', trimOutMs: 1300, playbackRate: rate }, {}, 'rehearsal');
      assert((await state()).sessionPurpose === 'rehearsal', 'Native rehearsal purpose was lost');
      await command('GO'); await until(() => starts('a').length === 1, 'short looping actual start');
      await wait(350); await command('PANIC_FADE');
      await until(() => state().then((value) => value.activeVoiceCount === 0), `panic across loops at ${rate}x`);
      results.push(`Loop-boundary panic reaches silence at ${rate}x`);
    }

    // Debugger delivery can lag the native clock. Leave an observable window,
    // verify countdown from native events, and submit rapid presses as one burst.
    await prepare({ endBehavior: 'loop', trimOutMs: 1300, playbackRate: 2, crossfadeEnabled: true, crossfadeMs: 4000 }, { preWaitMs: 1200, playbackRate: 0.7 }, 'performance');
    assert((await state()).sessionPurpose === 'performance', 'Native performance purpose was lost');
    await command('GO'); await until(() => starts('a').length === 1, 'outgoing start');
    await wait(450); await Promise.all([command('GO'), command('GO')]);
    await until(() => starts('b').length === 1, 'incoming actual start');
    assert(events.some((event) => event.type === 'RUN_STATE' && event.selectedCueId === 'a' && event.countdownRemainingMs > 0), 'Incoming countdown disappeared');
    const countdown = events.find((event) => event.type === 'RUN_STATE' && event.selectedCueId === 'a' && event.countdownRemainingMs > 0);
    assert(starts('b')[0].monotonicMs - countdown.monotonicMs >= 1180, 'Playback rate shortened the real-time delay');
    assert((await state()).phase === 'fading' && (await state()).activeVoiceCount === 2, 'Crossfade ownership ended at incoming start');
    await Promise.all([...Array.from({ length: 5 }, () => command('GO')), command('PAUSE')]);
    assert((await state()).selectedCueId === 'b' && starts('c').length === 0, 'Repeated GO escaped active overlap');
    await wait(350);
    assert((await state()).phase === 'paused' && (await state()).activeVoiceCount === 2, 'Paused overlap consumed its fade');
    await command('GO'); await command('GO');
    await until(() => state().then((value) => value.phase === 'playing' && value.activeVoiceCount === 1), 'outgoing fade finishes after resume');
    assert((await state()).selectedCueId === 'b' && starts('c').length === 0, 'Resume queued an extra advance');
    results.push('2x outgoing / 0.7x incoming preserves real-time delay; rapid GO ignored through overlap; pause resumes once; outgoing loop fades out');

    await prepare({ endBehavior: 'loop', trimOutMs: 1300, crossfadeEnabled: true }, { trimOutMs: 1350 }, 'rehearsal');
    await command('GO'); await until(() => starts('a').length === 1, 'short incoming outgoing start');
    await command('GO'); await until(() => starts('b').length === 1, 'short incoming actual start');
    await until(() => state().then((value) => value.selectedCueId === 'c' && value.activeVoiceCount === 0), 'short incoming completion deferred until outgoing end');
    assert(starts('c').length === 0, 'Autoplay-off next song started from a short crossfade');
    results.push('Incoming shorter than overlap advances silently exactly once after outgoing ends');

    await prepare({ trimOutMs: 2500, playbackRate: 2, fadeOutMs: 0, crossfadeEnabled: true }, { preWaitMs: 2000 }, 'rehearsal');
    await command('GO'); await until(() => starts('a').length === 1, 'short remainder start');
    await until(() => starts('b').length === 1, 'incoming after long real-time delay');
    const delayed = events.find((event) => event.type === 'RUN_STATE' && event.countdownRemainingMs > 0);
    const outgoingEnd = events.find((event) => event.type === 'VOICE_END' && event.cueId === 'a' && event.mainTransport);
    assert(delayed && outgoingEnd && starts('b')[0].monotonicMs - delayed.monotonicMs >= 1980, 'Short remainder shortened incoming delay');
    assert(outgoingEnd.monotonicMs < starts('b')[0].monotonicMs, 'Insufficient outgoing audio did not permit its required gap');
    assert((await state()).selectedCueId === 'b' && starts('c').length === 0, 'Long-delay completion queued an extra advance');
    results.push('Short 2x outgoing remainder honors a longer real-time delay and permits a gap without extra advances');

    await prepare({ endBehavior: 'loop', trimOutMs: 1300, crossfadeEnabled: true }, {}, 'performance');
    await command('GO'); await until(() => starts('a').length === 1, 'capacity main start');
    for (let voice = 0; voice < 7; voice += 1) await command('TRIGGER_HIT', { cueId: 'hit' });
    await until(() => state().then((value) => value.activeVoiceCount === 8), 'eight voices');
    await command('GO'); await wait(100);
    const refused = await state();
    assert(refused.selectedCueId === 'a' && refused.phase === 'playing' && refused.activeVoiceCount === 8 && starts('b').length === 0,
      'Capacity refusal corrupted pointer or left transition stuck');
    await audio.dispatch(JSON.stringify({ id: 1, type: 'STOP', selector: { kind: 'cueIds', cueIds: ['hit'] } }));
    await command('GO'); await until(() => starts('b').length === 1, 'deliberate retry after capacity frees');
    await command('PANIC_FADE'); await until(() => state().then((value) => value.activeVoiceCount === 0), 'capacity panic cleanup');
    results.push('Crossfade refusal preserves outgoing selection; deliberate retry succeeds after capacity frees');
    assert(events.filter((event) => ['VOICE_START', 'VOICE_END', 'RUN_STATE'].includes(event.type)).every((event) => Number.isFinite(event.monotonicMs)), 'Native visual events lack monotonic timestamps');
    return { results, lastState: await state(), fixture: 'synthetic managed WAV; ephemeral snapshots; no library changes' };
  } catch (error) {
    throw new Error(JSON.stringify({ failure: String(error), results, state: await state(), events: events.slice(-10) }));
  } finally {
    await command('STOP_ALL').catch(() => undefined);
    await audio.shutdown().catch(() => undefined);
    subscription.remove();
  }
})()
