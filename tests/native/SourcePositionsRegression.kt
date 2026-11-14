package app.showcontrol.audio

/** Standalone JVM regression: compile with the production SourcePositions.kt helper. */
fun main() {
  check(sourceToCuePosition(5000, 5000, 10000) == 0L) { "Trim start must not be added twice" }
  check(sourceToCuePosition(7500, 5000, 10000) == 2500L)
  check(sourceToCuePosition(0, 5000, 10000) == 0L)
  check(sourceToCuePosition(12000, 5000, 10000) == 4999L)
  check(runCatching { sourceToCuePosition(0, 5000, 5000) }.isFailure)
  check(isPrimaryMainVoice("main", "main", true))
  check(!isPrimaryMainVoice("hit", "main", false)) { "A Hit sharing the cue content must not advance GO" }
  check(!isPrimaryMainVoice("outgoing", "incoming", true)) { "Outgoing completion must not advance the incoming voice" }
  check(!isPrimaryMainVoice("main", null, true))
  check(shouldStartIncomingAfterAdvance(true, false)) { "Manual GO must start a default autoplay-off incoming song" }
  check(!shouldStartIncomingAfterAdvance(false, false)) { "Natural completion must leave an autoplay-off song selected silently" }
  check(shouldStartIncomingAfterAdvance(false, true))
  check(survivesMainSelection(false)) { "Previous must preserve independent Hits, including matching cue content and pre-waits" }
  check(!survivesMainSelection(true)) { "Previous must cancel the primary voice and scheduled transport commands" }
  check(isSemanticContextCurrent(2, 2, "opening", "opening"))
  check(!isSemanticContextCurrent(1, 2, "opening", "opening")) { "A replaced generation must reject speech commands" }
  check(!isSemanticContextCurrent(2, 2, "opening", "finale")) { "Speech recognized before GO advances must not affect the next song" }
  check(isSemanticContextCurrent(null, 2, null, "opening")) { "Foreground commands may omit captured context" }
  check(!shouldInvalidateAudioRoute("output_added", "type-1+type-2", "type-1+type-2", false, true)) { "Cold-service initial output enumeration must not interrupt a freshly prepared silent run" }
  check(!shouldInvalidateAudioRoute("output_added", "type-2", "type-2", true, true)) { "Duplicate added reports must not interrupt active playback" }
  check(shouldInvalidateAudioRoute("output_added", "type-2", "type-2+type-3", false, true)) { "A genuine output change must invalidate even a silent prepared run" }
  check(shouldInvalidateAudioRoute("output_removed", "type-2+type-3", "type-2", false, true)) { "Silent route loss requires deliberate recovery" }
  check(shouldInvalidateAudioRoute("output_removed", "type-2+type-3", "type-2+type-3", false, true)) { "Removal must mute before the platform output list updates" }
  check(shouldInvalidateAudioRoute("becoming_noisy", "type-2+type-3", "type-2+type-3", false, true)) { "Noisy warning must remain a safety signal when topology has not updated" }
  check(shouldInvalidateAudioRoute("output_added", "type-2", "type-2+type-3", true, false)) { "Unarmed private audition still stops after a genuine output change" }
  check(!shouldInvalidateAudioRoute("output_removed", "type-2+type-3", "type-2", false, false)) { "Idle setup updates its route baseline without claiming an interrupted run" }
  println("PASS native source-position regression")
}
