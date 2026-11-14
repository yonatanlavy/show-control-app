/* Ephemeral native cue-stack QA. Requires an unprepared engine and the original
 * synthetic managed WAV; does not persist or edit a user's show. */
(async () => {
  const audio = globalThis.expo.modules.ShowAudio;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const state = () => audio.getState();
  const command = (type, fields) => audio.dispatchSemantic(JSON.stringify({ type, ...fields }));
  const until = async (predicate, label) => { const end = Date.now() + 6000; while (Date.now() < end) { if (await predicate()) return; await wait(25); } throw new Error(`Timed out: ${label}`); };
  const initial = await state();
  assert(initial.phase === 'stopped' && initial.activeVoiceCount === 0 && !initial.showId, 'Exit the show before native QA');
  const uri = globalThis.__showControlQaMediaUri ?? 'file:///data/user/0/app.showcontrol.working/files/show-control-library/media/a79c60a668102d470f4dc35b0a8844750d61e1a9487e7611d2d530bb6589af1c.wav';
  const checksumSha256 = await audio.sha256File(uri);
  assert(checksumSha256 === 'a79c60a668102d470f4dc35b0a8844750d61e1a9487e7611d2d530bb6589af1c', 'QA audio changed');
  const mediaAsset = { id: 'qa-media', localUri: uri, checksumSha256, bytes: 2646044, ...await audio.probeMedia(uri) };
  const base = { type: 'audio', name: 'Legacy QA', tags: [], mediaAssetId: mediaAsset.id, mediaAsset, trimInMs: 1000, trimOutMs: 9000, gainDb: -96,
    fadeInMs: 0, fadeOutMs: 0, fadeCurve: 'smooth', preWaitMs: 0, endBehavior: 'stopAndReadyNext', playbackRate: 1, autoPlay: false, crossfadeEnabled: false, crossfadeMs: 2000 };
  const events = []; const listener = audio.addListener('onEngineEvent', (event) => events.push(event));
  const prepare = (order, first = {}) => { events.length = 0; return audio.prepare(JSON.stringify({ schemaVersion: 2, transportMode: 'legacyCueStack', sessionPurpose: 'rehearsal',
    showId: 'legacy-regression', setId: 'ephemeral', revisionId: `qa-${Date.now()}`, voiceLimit: 8, panicFadeMs: 100, cueOrder: order, hitCueIds: [], cues: {
      a: { ...base, id: 'a', ...first }, b: { ...base, id: 'b', trimOutMs: 1400 },
      wait: { id: 'wait', type: 'wait', name: 'Wait QA', tags: [], durationMs: 150, continue: 'auto' },
      group: { id: 'group', type: 'group', name: 'Group QA', tags: [], children: [{ cueId: 'a', offsetMs: 0 }, { cueId: 'b', offsetMs: 0 }] },
    } })); };
  const results = [];
  try {
    await prepare(['a', 'b']); let native = await state();
    assert(native.phase === 'ready' && native.nextCueId === 'a' && native.nextCueIndex === 0 && native.activeVoiceCount === 0, 'Initial legacy GO skipped the first cue');
    await command('SELECT', { cueId: 'b' }); native = await state();
    assert(native.nextCueId === 'b' && native.selectedCueId === 'b' && native.activeVoiceCount === 0, 'Silent selection did not move the native stack');
    await command('PREVIOUS'); native = await state(); assert(native.nextCueId === 'a' && native.activeVoiceCount === 0, 'Previous selection was audible or stale');
    await command('GO'); await until(async () => (await state()).activeVoiceCount === 1, 'first legacy start');
    await command('PAUSE'); await command('GO'); native = await state();
    assert(native.phase === 'playing' && native.currentCueId === 'a' && native.nextCueId === 'b' && native.activeVoiceCount === 1, 'Paused legacy GO advanced instead of resuming');
    await command('STOP_ALL'); assert((await state()).activeVoiceCount === 0, 'Immediate stop failed');
    assert(events.some((event) => event.type === 'RUN_STATE' && event.nextCueId === 'a' && event.currentCueId === ''), 'Legacy selection was not published to the UI');
    results.push('Silent initial/selected/previous pointers and paused GO resume');

    await prepare(['a', 'b'], { endBehavior: 'autoFollow', trimOutMs: 1400 }); await command('GO');
    await until(async () => (await state()).currentCueId === 'b', 'automatic follow updates main pointer');
    await until(async () => (await state()).activeVoiceCount === 0, 'final completion'); native = await state();
    assert(native.nextCueId === '' && native.nextCueIndex === 2 && native.selectedCueId === 'b', 'Natural completion left a stale next pointer');
    const starts = events.filter((event) => event.type === 'VOICE_START').length;
    await command('GO'); await wait(160); assert(events.filter((event) => event.type === 'VOICE_START').length === starts, 'Exhausted legacy stack wrapped');
    results.push('Automatic follow publishes actual selection and exhausted GO never wraps');

    await prepare(['wait', 'b']); await command('GO'); native = await state();
    assert(native.currentCueId === 'wait' && native.phase === 'playing' && native.activeVoiceCount === 0, 'Scheduled wait was falsely ready');
    await until(async () => (await state()).currentCueId === 'b', 'wait follow pointer');
    await until(async () => (await state()).activeVoiceCount === 0, 'wait sequence completion');
    assert((await state()).nextCueIndex === 2, 'Wait follow left its native pointer stale');
    results.push('Automatic wait follows natively and publishes the incoming cue');

    await prepare(['group', 'b']); await command('GO');
    await until(async () => (await state()).activeVoiceCount === 2, 'two group children'); native = await state();
    assert(native.currentCueId === 'group' && native.nextCueId === 'b' && native.phase === 'playing', 'Group voices overwrote the cue-stack pointer');
    await command('PANIC_FADE'); await until(async () => (await state()).activeVoiceCount === 0, 'group panic');
    results.push('Group children keep one main stack pointer and panic stops every voice');
    return { passed: results, stateOnly: true, physicalAudioVerified: false };
  } catch (error) {
    throw new Error(`${String(error)}; native=${JSON.stringify(await state())}; events=${JSON.stringify(events.slice(-8))}`);
  } finally { try { await command('STOP_ALL'); } catch { /* Preparation can fail before command admission. */ } finally { await audio.shutdown(); listener.remove(); } }
})()
