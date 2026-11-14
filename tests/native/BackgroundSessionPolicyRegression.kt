package app.showcontrol.audio

fun main() {
  // Every independent risk survives memory-pressure arrival and clearance.
  // Reading null must neither invent pressure nor hide other advisories.
  for (mask in 0 until 128) for (memory in listOf(true, false, null)) {
    fun flag(bit: Int) = mask and (1 shl bit) != 0
    val expected = buildList {
      if (flag(0)) add(BackgroundNotificationBody.RECOVERY)
      if (flag(1)) add(BackgroundNotificationBody.HEAT)
      if (flag(2)) add(BackgroundNotificationBody.LOW_BATTERY)
      if (memory == true) add(BackgroundNotificationBody.MEMORY)
      if (flag(3) || flag(4) || flag(5)) add(BackgroundNotificationBody.BATTERY_WARNING)
      if (isEmpty()) add(if (flag(6)) BackgroundNotificationBody.ACTIVE else BackgroundNotificationBody.PREPARED)
    }
    val actual = backgroundNotificationBodies(!flag(3), flag(4), flag(5), flag(0), flag(6),
      if (flag(2)) 5 else 80, false, if (flag(1)) "critical" else "normal", systemLowMemory = memory)
    check(actual == expected) { "Memory/notification combination lost an independent warning: $mask/$memory -> $actual" }
    check(actual.first() == backgroundNotificationBody(!flag(3), flag(4), flag(5), flag(0), flag(6),
      if (flag(2)) 5 else 80, false, if (flag(1)) "critical" else "normal", systemLowMemory = memory))
    val copy = backgroundNotificationCopy(actual) { "localized:${it.name}" }
    check(copy.details.contains("localized:MEMORY") == (memory == true))
    check(actual.size == actual.distinct().size)
  }
  check(latestPreviousProcessExit(emptyList(), 100) == null)
  for (reason in 0..20) check(previousProcessExitReason(reason) in setOf("memory", "resources", "crash", "unresponsive", "user", "normal", "system", "unknown"))
  check(previousProcessExitReason(3) == "memory")
  check(previousProcessExitReason(9) == "resources")
  check(listOf(4, 5, 7).all { previousProcessExitReason(it) == "crash" })
  check(previousProcessExitReason(6) == "unresponsive")
  check(listOf(10, 11).all { previousProcessExitReason(it) == "user" })
  check(previousProcessExitReason(1) == "normal")
  for (reason in listOf(-1, 0, Int.MAX_VALUE)) check(previousProcessExitReason(reason) == "unknown")
  val oldCrash = PreviousProcessExit(4, 10, true, false)
  val normal = PreviousProcessExit(1, 20, true, false)
  check(latestPreviousProcessExit(listOf(normal, oldCrash), 100) == mapOf("reason" to "normal", "timestampMs" to 20L))
  check(latestPreviousProcessExit(listOf(oldCrash, normal), 100) == mapOf("reason" to "normal", "timestampMs" to 20L))
  for (excluded in listOf(PreviousProcessExit(6, 50, false, false), PreviousProcessExit(6, 50, true, true),
    PreviousProcessExit(6, 101, true, false), PreviousProcessExit(6, 0, true, false), PreviousProcessExit(6, -1, true, false))) {
    check(latestPreviousProcessExit(listOf(excluded, normal), 100)?.get("reason") == "normal")
    check(latestPreviousProcessExit(listOf(excluded), 100) == null)
  }
  for (language in listOf("en", "he", "es", "fr", "de", "it", "pt", "ru", "ja", "ar")) {
    check(backgroundPresentationLocale(language) == language) { "Supported app language must reach the notification" }
  }
  for (language in listOf(null, "", "ar-EG", "HE", "xx", "null", "../he", "he\n", " ", "a".repeat(8192))) {
    check(backgroundPresentationLocale(language) == null) { "Unknown presentation language must retain the system fallback" }
  }
  data class Combination(
    val exempt: Boolean? = true, val restricted: Boolean? = false, val saver: Boolean? = false,
    val recovery: Boolean = false, val playing: Boolean = false, val level: Int? = 80,
    val charging: Boolean? = false, val heat: String? = "normal", val standby: Boolean? = false,
    val expected: List<BackgroundNotificationBody>,
  )
  val combinations = listOf(
    Combination(expected = listOf(BackgroundNotificationBody.PREPARED)),
    Combination(playing = true, expected = listOf(BackgroundNotificationBody.ACTIVE)),
    Combination(exempt = false, level = 20, expected = listOf(BackgroundNotificationBody.LOW_BATTERY, BackgroundNotificationBody.BATTERY_WARNING)),
    Combination(exempt = false, heat = "hot", expected = listOf(BackgroundNotificationBody.HEAT, BackgroundNotificationBody.BATTERY_WARNING)),
    Combination(exempt = false, saver = true, level = 5, heat = "critical", expected = listOf(BackgroundNotificationBody.HEAT, BackgroundNotificationBody.LOW_BATTERY, BackgroundNotificationBody.BATTERY_WARNING)),
    Combination(exempt = false, recovery = true, level = 0, heat = "hot", expected = listOf(BackgroundNotificationBody.RECOVERY, BackgroundNotificationBody.HEAT, BackgroundNotificationBody.LOW_BATTERY, BackgroundNotificationBody.BATTERY_WARNING)),
    Combination(exempt = null, level = 20, expected = listOf(BackgroundNotificationBody.LOW_BATTERY, BackgroundNotificationBody.SETTINGS_UNKNOWN)),
    Combination(restricted = true, saver = null, expected = listOf(BackgroundNotificationBody.BATTERY_WARNING, BackgroundNotificationBody.SETTINGS_UNKNOWN)),
    Combination(exempt = false, restricted = null, expected = listOf(BackgroundNotificationBody.BATTERY_WARNING, BackgroundNotificationBody.SETTINGS_UNKNOWN)),
    Combination(saver = true, level = 5, charging = true, expected = listOf(BackgroundNotificationBody.BATTERY_WARNING)),
    Combination(standby = true, expected = listOf(BackgroundNotificationBody.PREPARED)),
    Combination(exempt = false, standby = true, level = 19, expected = listOf(BackgroundNotificationBody.LOW_BATTERY, BackgroundNotificationBody.BATTERY_WARNING)),
    Combination(standby = null, expected = listOf(BackgroundNotificationBody.PREPARED)),
    Combination(exempt = null, restricted = null, saver = null, standby = null, recovery = true, expected = listOf(BackgroundNotificationBody.RECOVERY, BackgroundNotificationBody.SETTINGS_UNKNOWN)),
  )
  for (case in combinations) {
    val bodies = backgroundNotificationBodies(case.exempt, case.restricted, case.saver, case.recovery, case.playing,
      case.level, case.charging, case.heat, case.standby)
    check(bodies == case.expected) { "Combined protection warnings lost a risk: $case -> $bodies" }
    check(bodies.size == bodies.distinct().size) { "One quiet notice must not repeat warnings" }
    check(bodies.first() == backgroundNotificationBody(case.exempt, case.restricted, case.saver, case.recovery, case.playing,
      case.level, case.charging, case.heat, case.standby)) { "The urgent headline must remain consistent" }
  }
  // Clearing a secondary risk must update the notice even if its urgent headline stays unchanged.
  fun copyOf(exempt: Boolean?) = backgroundNotificationCopy(
    backgroundNotificationBodies(exempt, false, false, false, false, 5, false, "hot"),
  ) { "localized:${it.name}" }
  val optimized = copyOf(false)
  val unrestricted = copyOf(true)
  val unavailable = copyOf(null)
  check(optimized.headline == unrestricted.headline && optimized.headline == unavailable.headline)
  check(optimized != unrestricted && optimized != unavailable && unrestricted != unavailable)
  check(optimized.details == "localized:HEAT\nlocalized:LOW_BATTERY\nlocalized:BATTERY_WARNING")
  check(unrestricted.details == "localized:HEAT\nlocalized:LOW_BATTERY")
  check(unavailable.details == "localized:HEAT\nlocalized:LOW_BATTERY\nlocalized:SETTINGS_UNKNOWN")
  check(copyOf(false) == optimized) { "Unchanged observations must remain deduplicatable" }
  for (api in listOf(24, 28, 30)) {
    check(appStandbyRestricted(api, null) == false)
    check(appStandbyRestricted(api, 45) == false) { "Restricted standby does not exist before Android 12" }
  }
  for (api in listOf(31, 35, 36)) {
    check(appStandbyRestricted(api, 45) == true)
    for (bucket in listOf(5, 10, 20, 30, 40)) check(appStandbyRestricted(api, bucket) == false)
    for (bucket in listOf(null, -1, 0, 41, 46, 50, Int.MAX_VALUE)) check(appStandbyRestricted(api, bucket) == null)
  }
  check(backgroundNotificationBody(false, false, false, false, true, appStandbyRestricted = true) == BackgroundNotificationBody.BATTERY_WARNING)
  check(backgroundNotificationBody(true, false, false, false, true, appStandbyRestricted = true) == BackgroundNotificationBody.ACTIVE)
  check(backgroundNotificationBody(true, false, false, false, false, appStandbyRestricted = null) == BackgroundNotificationBody.PREPARED)
  check(backgroundNotificationBody(null, false, false, false, true, appStandbyRestricted = null) == BackgroundNotificationBody.SETTINGS_UNKNOWN)
  check(backgroundNotificationBody(true, true, false, false, true, appStandbyRestricted = true) == BackgroundNotificationBody.BATTERY_WARNING)
  check(backgroundNotificationBody(true, false, false, true, true, appStandbyRestricted = true) == BackgroundNotificationBody.RECOVERY)
  // Ready, playing, paused, stopped and interrupted prepared shows remain owned natively.
  for (phase in listOf("ready", "playing", "paused", "stopped", "interrupted")) {
    check(retainPreparedSessionAfterTaskRemoval(true, false, false, false)) { "$phase must survive UI removal" }
  }
  check(!retainPreparedSessionAfterTaskRemoval(false, false, false, false))
  check(!retainPreparedSessionAfterTaskRemoval(true, true, false, false)) { "Audition must not outlive its editor" }
  check(!retainPreparedSessionAfterTaskRemoval(true, false, true, false))
  check(!retainPreparedSessionAfterTaskRemoval(true, false, false, true))
  check(preparedSessionRead(false, false, false) == PreparedSessionRead.EMPTY)
  check(preparedSessionRead(false, true, false) == PreparedSessionRead.INITIALIZING)
  check(preparedSessionRead(false, false, true) == PreparedSessionRead.INITIALIZING) { "Pending preparation must never be reported empty" }
  check(preparedSessionRead(true, true, true) == PreparedSessionRead.ATTACHED) { "Attached reads serialize behind preparation" }
  check(backgroundNotificationBody(false, false, false, false, true) == BackgroundNotificationBody.BATTERY_WARNING)
  check(backgroundNotificationBody(true, true, false, false, false) == BackgroundNotificationBody.BATTERY_WARNING)
  check(backgroundNotificationBody(true, false, true, false, false) == BackgroundNotificationBody.BATTERY_WARNING) { "Power saver must warn even when battery optimization is excluded" }
  check(backgroundNotificationBody(null, null, true, false, true) == BackgroundNotificationBody.BATTERY_WARNING)
  check(backgroundNotificationBody(null, null, null, true, false) == BackgroundNotificationBody.RECOVERY)
  check(backgroundNotificationBody(false, true, true, true, false) == BackgroundNotificationBody.RECOVERY) { "Recovery must stay visible on optimized devices" }
  check(backgroundNotificationBody(null, null, null, false, true) == BackgroundNotificationBody.SETTINGS_UNKNOWN)
  check(backgroundNotificationBody(null, false, false, false, false) == BackgroundNotificationBody.SETTINGS_UNKNOWN) { "A missing battery reading must remain visible in Ready" }
  check(backgroundNotificationBody(true, null, false, false, true) == BackgroundNotificationBody.SETTINGS_UNKNOWN) { "Unknown background restrictions must not claim an active check succeeded" }
  check(backgroundNotificationBody(true, false, null, false, false) == BackgroundNotificationBody.SETTINGS_UNKNOWN) { "Unknown power-saving state must remain visible in Ready" }
  check(backgroundNotificationBody(true, false, false, false, true) == BackgroundNotificationBody.ACTIVE)
  check(backgroundNotificationBody(true, false, false, false, false) == BackgroundNotificationBody.PREPARED)
  check(readBackgroundObservation<Boolean> { throw SecurityException("unavailable") } == null)
  check(batteryLevelPercent(0, 100) == 0)
  check(batteryLevelPercent(1, 5) == 20)
  check(batteryLevelPercent(Int.MAX_VALUE, Int.MAX_VALUE) == 100)
  for ((level, scale) in listOf(null to 100, -1 to 100, 101 to 100, 1 to 0, 1 to null)) {
    check(batteryLevelPercent(level, scale) == null) { "Invalid battery readings cannot become a full battery" }
  }
  check(backgroundThermalState(null) == null)
  check(backgroundThermalState(-1) == null)
  check(backgroundThermalState(7) == null)
  check((0..6).map(::backgroundThermalState) == listOf("normal", "warm", "warm", "hot", "critical", "critical", "critical"))
  for (playing in listOf(false, true)) {
    for (level in listOf(0, 1, 19, 20)) {
      check(backgroundNotificationBody(true, false, false, false, playing, level, false, "normal") == BackgroundNotificationBody.LOW_BATTERY)
      check(backgroundNotificationBody(true, false, false, false, playing, level, null, "normal") == BackgroundNotificationBody.LOW_BATTERY)
      check(backgroundNotificationBody(true, false, false, false, playing, level, true, "normal") != BackgroundNotificationBody.LOW_BATTERY)
    }
    for (thermal in listOf("hot", "critical")) {
      check(backgroundNotificationBody(false, true, true, false, playing, 5, false, thermal) == BackgroundNotificationBody.HEAT)
      check(backgroundNotificationBody(false, true, true, true, playing, 5, false, thermal) == BackgroundNotificationBody.RECOVERY)
    }
  }
  check(backgroundNotificationBody(true, false, false, false, false, 21, false, "warm") == BackgroundNotificationBody.PREPARED)
  check(backgroundNotificationBody(true, false, false, false, true, -1, false, null) == BackgroundNotificationBody.ACTIVE)
  check(backgroundNotificationBody(null, null, null, false, false, 20, false, "normal") == BackgroundNotificationBody.LOW_BATTERY)
  check(readBackgroundObservation { false } == false)
  check(backgroundSettingsTargets("playbackChannel", false) == listOf("notifications", "app"))
  check(backgroundSettingsTargets("playbackChannel", true) == listOf("playbackChannel", "notifications", "app"))
  check(backgroundSettingsTargets("battery", false) == listOf("battery", "app"))
  check(backgroundSettingsTargets("app", false) == listOf("app"))
  check(backgroundSettingsTargets("android.intent.action.CALL", true).isEmpty())
  println("Background lifecycle, advisory, unknown-observation and settings-fallback regressions passed")
}
