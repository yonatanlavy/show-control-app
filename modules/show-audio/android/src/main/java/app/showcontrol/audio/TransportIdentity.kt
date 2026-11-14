package app.showcontrol.audio

/** Cue IDs describe content; only the admitted primary voice can move the GO stack. */
internal fun isPrimaryMainVoice(voiceId: String, mainVoiceId: String?, mainTransport: Boolean): Boolean =
  mainTransport && voiceId == mainVoiceId

/** Autoplay controls automatic progression; an explicit GO starts the following song. */
internal fun shouldStartIncomingAfterAdvance(manualAdvance: Boolean, incomingAutoPlay: Boolean): Boolean =
  manualAdvance || incomingAutoPlay

/** Main selection cancels main audio and scheduled transport commands, preserving independent audio. */
internal fun survivesMainSelection(mainTransport: Boolean): Boolean = !mainTransport

internal fun isSemanticContextCurrent(
  commandGeneration: Long?,
  runGeneration: Long,
  capturedCueId: String?,
  selectedCueId: String,
): Boolean = (commandGeneration == null || commandGeneration == runGeneration) &&
  (capturedCueId == null || capturedCueId == selectedCueId)

/** Registration reports existing outputs asynchronously; an unchanged added
 * report is not a route change. Removal/noisy signals still fail silent even
 * before AudioManager's output list catches up, including a prepared silent run.
 */
internal fun shouldInvalidateAudioRoute(
  reason: String,
  previous: String,
  current: String,
  activePlayback: Boolean,
  preparedSession: Boolean,
): Boolean = (activePlayback || preparedSession) && (reason != "output_added" || previous != current)
