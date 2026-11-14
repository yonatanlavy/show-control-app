package app.showcontrol.audio

/** Compiled with the unmodified seekRehearsal method extracted from production. */
internal data class SeekCue(
  val id: String = "shared",
  val trimInMs: Long = 5_000,
  val trimOutMs: Long? = 9_000,
  val sourceDurationMs: Long = 12_000,
  val playbackRate: Double = 2.0,
)

internal class SeekPlayer(var paused: Boolean = true) {
  val positions = mutableListOf<Long>()
  fun seekTo(position: Long) { positions += position }
}

internal class SeekEnvelope {
  val positions = mutableListOf<Long>()
  fun seekCueTimeline(position: Long) { positions += position }
}

internal class SeekVoice(
  val id: String,
  val cue: SeekCue = SeekCue(),
  val mayAutoFollowMainStack: Boolean = true,
  val player: SeekPlayer = SeekPlayer(),
  val envelope: SeekEnvelope = SeekEnvelope(),
)

internal class NativeCommandException(val code: String, message: String) : Exception(message)

private fun requireUntouched(voice: SeekVoice) {
  check(voice.player.positions.isEmpty() && voice.envelope.positions.isEmpty()) {
    "Non-target voice ${voice.id} was sought: ${voice.player.positions}"
  }
}

private fun requireRefused(harness: RehearsalSeekHarness, cueId: String) {
  val error = runCatching { harness.seek(cueId, 7_000) }.exceptionOrNull()
  check(error is NativeCommandException && error.code == "CUE_NOT_ACTIVE") {
    "A seek with no eligible primary must retain CUE_NOT_ACTIVE refusal"
  }
}

fun main() {
  val primary = SeekVoice("primary")
  val hit = SeekVoice("hit", mayAutoFollowMainStack = false)
  val outgoing = SeekVoice("outgoing")
  val unrelated = SeekVoice("unrelated", cue = SeekCue(id = "other"))
  val harness = RehearsalSeekHarness(listOf(primary, hit, outgoing, unrelated), "primary")
  harness.seek("shared", 7_000)
  check(primary.player.positions == listOf(2_000L)) { "Primary must seek in trimmed source time" }
  check(primary.envelope.positions == listOf(2_000L)) { "Only primary envelope must follow its seek" }
  requireUntouched(hit)
  requireUntouched(outgoing)
  requireUntouched(unrelated)
  check(primary.player.paused && hit.player.paused && primary.cue.playbackRate == 2.0) {
    "Seeking must preserve pause and rate"
  }
  println("PASS primary-only seek isolates same-ID Hit, outgoing voice and unrelated cue; pause/rate unchanged")

  val hitOnly = SeekVoice("hit-only", mayAutoFollowMainStack = false)
  requireRefused(RehearsalSeekHarness(listOf(hitOnly), null), "shared")
  requireUntouched(hitOnly)
  println("PASS Hit-only cue refuses without moving audio")

  val stalePrimary = SeekVoice("stale-primary")
  requireRefused(RehearsalSeekHarness(listOf(stalePrimary, hitOnly), "missing"), "shared")
  requireUntouched(stalePrimary)
  requireUntouched(hitOnly)
  println("PASS stale primary identity refuses without fallback to cue ID")

  val falsePrimary = SeekVoice("false-primary", mayAutoFollowMainStack = false)
  requireRefused(RehearsalSeekHarness(listOf(falsePrimary), "false-primary"), "shared")
  requireUntouched(falsePrimary)
  println("PASS matching voice ID without main ownership refuses")

  val otherPrimary = SeekVoice("other-primary", cue = SeekCue(id = "other"))
  val differentCue = RehearsalSeekHarness(listOf(otherPrimary, hitOnly), "other-primary")
  requireRefused(differentCue, "shared")
  requireUntouched(otherPrimary)
  requireUntouched(hitOnly)
  println("PASS different current cue refuses and preserves its independent Hit")

  harness.seek("shared", 0)
  harness.seek("shared", 7_123)
  harness.seek("shared", Long.MAX_VALUE)
  check(primary.player.positions == listOf(2_000L, 0L, 2_123L, 3_999L)) {
    "Source-time seek must clamp to trim and preserve milliseconds: ${primary.player.positions}"
  }
  check(primary.envelope.positions == primary.player.positions)
  requireUntouched(hit)
  requireUntouched(outgoing)
  println("PASS source trim bounds and millisecond precision synchronize the primary envelope only")

  val fullLength = SeekVoice("full-length", cue = SeekCue(trimOutMs = null, playbackRate = 0.7))
  RehearsalSeekHarness(listOf(fullLength), "full-length").seek("shared", Long.MAX_VALUE)
  check(fullLength.player.positions == listOf(6_999L) && fullLength.cue.playbackRate == 0.7)
  println("PASS absent trim-out uses source duration at unchanged 0.7x rate")
}
