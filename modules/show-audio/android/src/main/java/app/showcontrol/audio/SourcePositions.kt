package app.showcontrol.audio

/** Picker/editor positions are absolute source time; clipped players use cue-relative time. */
internal fun sourceToCuePosition(sourceMs: Long, trimInMs: Long, trimOutMs: Long): Long {
  require(trimInMs >= 0 && trimOutMs > trimInMs)
  return sourceMs.coerceIn(trimInMs, trimOutMs - 1) - trimInMs
}
