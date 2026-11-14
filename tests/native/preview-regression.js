/* Run with native-audio-probe against a signed development build. The known
 * synthetic WAV and ephemeral native snapshots never edit the user's library.
 * iOS/device harnesses may inject __showControlQaMediaUri for the same WAV.
 */
(async () => {
  const audio = globalThis.expo.modules.ShowAudio;
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const check = (condition, detail) => { if (!condition) throw new Error(detail); };
  const until = async (predicate, detail) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) { if (await predicate()) return; await wait(25); }
    throw new Error(`Timed out: ${detail}`);
  };
  const initial = await audio.getState();
  check(initial.activeVoiceCount === 0 && initial.phase === 'stopped' && !initial.showId, 'Disarm the show before running preview regression');
  const uri = globalThis.__showControlQaMediaUri ?? 'file:///data/user/0/app.showcontrol.working/files/show-control-library/media/a79c60a668102d470f4dc35b0a8844750d61e1a9487e7611d2d530bb6589af1c.wav';
  const checksumSha256 = await audio.sha256File(uri);
  check(checksumSha256 === 'a79c60a668102d470f4dc35b0a8844750d61e1a9487e7611d2d530bb6589af1c', 'Synthetic QA media checksum changed');
  const mediaAsset = { id: 'preview-qa-media', localUri: uri, checksumSha256, bytes: 2646044, ...await audio.probeMedia(uri) };
  const cue = { id: 'preview-qa-only', type: 'audio', name: 'Preview QA', tags: [], mediaAssetId: mediaAsset.id, mediaAsset,
    trimInMs: 5000, trimOutMs: 9000, gainDb: -96, fadeInMs: 100, fadeOutMs: 1200, fadeCurve: 'smooth', preWaitMs: 5000,
    endBehavior: 'loop', playbackRate: 2, autoPlay: true, crossfadeEnabled: true, crossfadeMs: 2000 };
  const events = []; const subscription = audio.addListener('onEngineEvent', (event) => events.push(event));
  const previewEvents = (generation) => events.filter((event) => event.type === 'PREVIEW_STATE' && (generation === undefined || event.generation === generation));
  const latest = (generation) => previewEvents(generation).at(-1);
  const assertions = [];
  try {
    await audio.stopPreview(); await audio.previewCue(JSON.stringify(cue), 6000, false); await wait(350);
    check((await audio.getState()).activeVoiceCount === 1, 'Preview did not skip delay');
    const progress = previewEvents().filter((event) => event.phase === 'playing').at(-1);
    check(progress && progress.positionMs >= 6000 && progress.positionMs < 9000, 'Preview position was not absolute source time');
    check(!events.some((event) => event.type === 'RUN_STATE' || event.type === 'VOICE_START'), 'Preview leaked live transport events');
    assertions.push('Immediate isolated preview; absolute trimmed source progress; no Run events');

    await audio.pausePreview(); await wait(120);
    const paused = latest(); check(paused?.phase === 'paused', 'Native preview did not pause');
    await audio.seekPreview(8100); await wait(130);
    const sought = latest();
    check(sought?.phase === 'paused' && Math.abs(sought.positionMs - 8100) < 15, 'Paused seek resumed or lost source position');
    await audio.resumePreview(); await wait(750);
    check((await audio.getState()).activeVoiceCount === 0, 'Preview unexpectedly looped or followed');
    check(latest()?.phase === 'stopped', 'Natural end left a playing preview state');
    assertions.push('Pause; silent seek; resume; single-pass natural end despite loop/autoplay settings');

    const changed = { ...cue, playbackRate: 0.7, fadeInMs: 400, fadeOutMs: 700, trimOutMs: 11000 };
    const priorGeneration = (await audio.getState()).generation;
    await audio.previewCue(JSON.stringify(changed), 6800, true);
    const pausedGeneration = (await audio.getState()).generation;
    check(pausedGeneration > priorGeneration, 'Changed tuning did not create a separate preview generation');
    await wait(350);
    const held = latest(pausedGeneration);
    check(held?.phase === 'paused' && Math.abs(held.positionMs - 6800) < 15, 'Changed-tuning preview failed to hold its requested source position');
    await audio.seekPreview(8250); await wait(170);
    const changedSeek = latest(pausedGeneration);
    check(changedSeek?.phase === 'paused' && Math.abs(changedSeek.positionMs - 8250) < 15, 'Initial-paused preview seek changed playback or lost source position');
    check(!previewEvents(pausedGeneration).some((event) => event.phase === 'playing'), 'Changed tuning briefly played before explicit Resume');
    check(!events.some((event) => event.type === 'RUN_STATE' || event.type === 'VOICE_START'), 'Initial-paused preparation leaked a Run event');
    await audio.resumePreview();
    await until(() => Promise.resolve(previewEvents(pausedGeneration).some((event) => event.phase === 'playing' && event.positionMs >= 8250)), 'explicit paused-preview resume');
    await audio.seekPreview(10950);
    await until(() => audio.getState().then((value) => value.activeVoiceCount === 0), 'changed-tuning single-pass end');
    assertions.push('Changed tuning starts paused; holds exact source position; silent seek; explicit Resume only');

    await audio.stopPreview(); await audio.previewCue(JSON.stringify(cue), 999999, false); await wait(180); await audio.stopPreview();
    check((await audio.getState()).activeVoiceCount === 0, 'Stop after clamped seek left audio');
    assertions.push('Out-of-range audition clamp and immediate stop');

    const live = { ...cue, preWaitMs: 0, endBehavior: 'loop', autoPlay: false, crossfadeEnabled: false, trimInMs: 0, trimOutMs: 10000 };
    const snapshot = { schemaVersion: 2, transportMode: 'oms', sessionPurpose: 'performance', voiceLimit: 8, showId: 'preview-qa-only', setId: 'qa', revisionId: 'qa', panicFadeMs: 100,
      cues: { [live.id]: live }, cueOrder: [live.id], hitCueIds: [] };
    await audio.prepare(JSON.stringify(snapshot)); await audio.dispatch(JSON.stringify({ id: 1, type: 'GO' }));
    await until(() => Promise.resolve(events.some((event) => event.type === 'VOICE_START' && event.cueId === live.id && event.mainTransport)), 'armed actual start');
    const armed = await audio.getState();
    for (const operation of [
      () => audio.previewCue(JSON.stringify(changed), 6800, true), () => audio.pausePreview(), () => audio.resumePreview(), () => audio.seekPreview(8250),
    ]) {
      let rejected = false; try { await operation(); } catch { rejected = true; }
      check(rejected, 'Audition operation was admitted into an armed run');
    }
    await audio.stopPreview(); const untouched = await audio.getState();
    check(untouched.activeVoiceCount === 1 && untouched.generation === armed.generation && untouched.selectedCueId === live.id,
      'Audition controls altered the armed run');
    assertions.push('Armed audition operations rejected; preview Stop leaves live audio untouched');
    return { assertions, previewEvents: previewEvents().length, initiallyPausedEvents: previewEvents(pausedGeneration).length,
      fixture: 'synthetic managed WAV; -96 dB; ephemeral snapshots; no library changes' };
  } catch (error) {
    throw new Error(JSON.stringify({ failure: String(error), assertions, state: await audio.getState(), events: events.slice(-10) }));
  } finally {
    await audio.dispatchUrgent(JSON.stringify({ id: 999999, type: 'STOP_ALL' })).catch(() => undefined);
    await audio.stopPreview().catch(() => undefined);
    try { await audio.shutdown(); } finally { await audio.stopPreview().catch(() => undefined); subscription.remove(); }
  }
})()
