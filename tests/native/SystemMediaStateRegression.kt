package app.showcontrol.audio

fun main() {
  val clip = SystemMediaClip("main", 2400, 6000, 2f)
  val ready = SystemMediaObservation(prepared = true, readyClip = clip, goAvailable = true)
  val playing = ready.copy(voices = 1, audible = true, mainClip = clip)
  check(systemMediaView(ready).let { it.phase == SystemMediaPhase.READY && it.retainForeground && !it.playWhenReady && it.clip?.positionMs == 0L && !it.canPauseResume })
  check(systemMediaView(playing).let { it.phase == SystemMediaPhase.PLAYING && it.playWhenReady && it.clip == clip && it.canPauseResume })
  check(systemMediaView(playing.copy(audible = false)).phase == SystemMediaPhase.WAITING)
  check(systemMediaView(playing.copy(paused = true, audible = false)).let { it.phase == SystemMediaPhase.PAUSED && !it.playWhenReady && it.clip == clip && it.retainForeground })
  check(systemMediaView(ready.copy(workPending = true)).let { it.phase == SystemMediaPhase.WAITING && it.clip == null && it.playWhenReady && it.retainForeground })
  check(systemMediaView(playing.copy(workPending = true)).clip == clip) { "Outgoing progress survives incoming delay" }
  check(systemMediaView(ready.copy(workPending = true, paused = true)).let { it.phase == SystemMediaPhase.PAUSED && it.clip == null && it.canPauseResume })
  check(systemMediaView(playing.copy(mainClip = null)).clip == null) { "Hit must not invent main progress" }
  check(systemMediaView(playing.copy(mainClip = null, workPending = true)).clip == null) { "Ended main + Hit during incoming delay" }
  check(systemMediaView(ready.copy(readyClip = null)).clip == null) { "Retained legacy main does not become prepared cursor" }
  check(systemMediaView(playing.copy(voices = 8)).phase == SystemMediaPhase.PLAYING)
  check(systemMediaView(playing.copy(mainClip = clip.copy(loop = true))).clip?.loop == true)
  check(systemMediaView(ready.copy(recovery = true)).let { it.phase == SystemMediaPhase.RECOVERY && it.retainForeground && !it.canNavigate && !it.canPauseResume && it.canStop && it.clip == null })
  check(systemMediaView(playing.copy(recovery = true)).phase == SystemMediaPhase.RECOVERY)
  check(!systemMediaView(ready.copy(preview = true)).visible)
  check(!systemMediaView(ready.copy(closing = true)).retainForeground)
  check(!systemMediaView(SystemMediaObservation()).visible)
  check(systemMediaView(SystemMediaObservation(diagnostic = true)).let { it.visible && !it.retainForeground && it.canNavigate && it.canPauseResume && it.clip == null && !it.playWhenReady })
  check(!systemMediaView(SystemMediaObservation(diagnostic = true, closing = true)).visible)
  for (invalid in listOf(clip.copy(identity = ""), clip.copy(positionMs = -1), clip.copy(positionMs = 6001), clip.copy(durationMs = 0), clip.copy(durationMs = Long.MAX_VALUE), clip.copy(rate = Float.NaN), clip.copy(rate = 0.69f), clip.copy(rate = 2.01f))) {
    check(systemMediaView(playing.copy(mainClip = invalid)).clip == null)
  }
  for (rate in listOf(0.7f, 1f, 2f)) check(systemMediaView(playing.copy(mainClip = clip.copy(rate = rate))).clip?.rate == rate)
  check(admitsNotificationAction(true, true, false))
  check(!admitsNotificationAction(false, true, false))
  check(!admitsNotificationAction(true, false, false))
  check(!admitsNotificationAction(true, true, true))
  check(systemMediaUsesPlaybackCard(systemMediaView(playing)))
  check(!systemMediaUsesPlaybackCard(systemMediaView(ready))) { "Prepared status must not expire with an idle media card" }
  check(!systemMediaUsesPlaybackCard(systemMediaView(playing.copy(paused = true, audible = false))))
  check(!systemMediaUsesPlaybackCard(systemMediaView(ready.copy(workPending = true))))
  check(!systemMediaUsesPlaybackCard(systemMediaView(playing.copy(recovery = true))))
  check(systemMediaView(ready).canGo)
  check(!systemMediaView(ready.copy(goAvailable = false)).canGo) { "Finished order cannot advertise GO" }
  check(!systemMediaView(playing.copy(workPending = true, goAvailable = false)).canGo) { "Native transition admission disables repeated GO" }
  check(systemMediaView(ready.copy(workPending = true)).canGo) { "Independent Hit delay does not block a native-ready main GO" }
  check(!systemMediaView(ready.copy(recovery = true)).canGo)
  println("System media projection/admission: prepared, live, paused, delay, overlap, Hit, loop, recovery, preview, eight voices, invalid cursor/rate and stale notification checks passed")
}
