package app.showcontrol.audio

/** Sequence ownership is independent from permission to auto-advance. */
internal enum class TriggerOrigin(val belongsToMainSequence: Boolean, val mayAutoFollowMainStack: Boolean) {
  MAIN_STACK(true, true), HIT(false, false), GROUP_CHILD(false, false), MAIN_GROUP_CHILD(true, false);

  fun groupChild(): TriggerOrigin = if (belongsToMainSequence) MAIN_GROUP_CHILD else GROUP_CHILD
}
