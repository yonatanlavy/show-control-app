package app.showcontrol.audio

/** UI disposal is different from terminating the process or disarming a show. */
internal fun retainPreparedSessionAfterTaskRemoval(
  hasPreparedSession: Boolean,
  isPreview: Boolean,
  isShuttingDown: Boolean,
  isDestroyed: Boolean,
): Boolean = hasPreparedSession && !isPreview && !isShuttingDown && !isDestroyed

internal enum class PreparedSessionRead { ATTACHED, INITIALIZING, EMPTY }

internal fun preparedSessionRead(hasAttachedOwner: Boolean, hasStartingOwner: Boolean, hasPendingPreparation: Boolean): PreparedSessionRead = when {
  hasAttachedOwner -> PreparedSessionRead.ATTACHED
  hasStartingOwner || hasPendingPreparation -> PreparedSessionRead.INITIALIZING
  else -> PreparedSessionRead.EMPTY
}

internal enum class BackgroundNotificationBody { BATTERY_WARNING, SETTINGS_UNKNOWN, LOW_BATTERY, HEAT, MEMORY, RECOVERY, ACTIVE, PREPARED }

/** Both fields participate in update identity; a secondary risk can change alone. */
internal data class BackgroundNotificationCopy(val headline: String, val details: String)

/** Only the app's ten supported presentation languages enter resource lookup.
 * Older/invalid runtime envelopes retain the system resource fallback. */
internal fun backgroundPresentationLocale(value: String?): String? = value?.takeIf {
  it in setOf("en", "he", "es", "fr", "de", "it", "pt", "ru", "ja", "ar")
}

internal fun backgroundNotificationCopy(
  bodies: List<BackgroundNotificationBody>,
  localize: (BackgroundNotificationBody) -> String,
): BackgroundNotificationCopy {
  require(bodies.isNotEmpty())
  val messages = bodies.map(localize)
  return BackgroundNotificationCopy(messages.first(), messages.joinToString("\n"))
}

/** Restricted standby was introduced in Android 12; unknown buckets stay unknown. */
internal fun appStandbyRestricted(api: Int, bucket: Int?): Boolean? = if (api < 31) false else when (bucket) {
  45 -> true
  5, 10, 20, 30, 40 -> false // Exempted, active, working set, frequent, rare.
  else -> null
}

internal fun batteryLevelPercent(level: Int?, scale: Int?): Int? =
  if (level == null || scale == null || scale <= 0 || level !in 0..scale) null
  else kotlin.math.round(level.toDouble() * 100 / scale).toInt()

internal fun backgroundThermalState(status: Int?): String? = when (status) {
  0 -> "normal"
  1, 2 -> "warm"
  3 -> "hot"
  4, 5, 6 -> "critical"
  else -> null
}

internal fun backgroundNotificationBody(
  batteryOptimizationIgnored: Boolean?,
  backgroundRestricted: Boolean?,
  powerSaveMode: Boolean?,
  recoveryRequired: Boolean,
  hasActivePlayback: Boolean,
  batteryLevelPercent: Int? = null,
  batteryCharging: Boolean? = null,
  thermalState: String? = null,
  appStandbyRestricted: Boolean? = false,
  systemLowMemory: Boolean? = null,
): BackgroundNotificationBody = backgroundNotificationBodies(
  batteryOptimizationIgnored, backgroundRestricted, powerSaveMode, recoveryRequired, hasActivePlayback,
  batteryLevelPercent, batteryCharging, thermalState, appStandbyRestricted, systemLowMemory,
).first()

/** One notice, all independent risks, with recovery and urgent device pressure first. */
internal fun backgroundNotificationBodies(
  batteryOptimizationIgnored: Boolean?,
  backgroundRestricted: Boolean?,
  powerSaveMode: Boolean?,
  recoveryRequired: Boolean,
  hasActivePlayback: Boolean,
  batteryLevelPercent: Int? = null,
  batteryCharging: Boolean? = null,
  thermalState: String? = null,
  appStandbyRestricted: Boolean? = false,
  systemLowMemory: Boolean? = null,
): List<BackgroundNotificationBody> = buildList {
  if (recoveryRequired) add(BackgroundNotificationBody.RECOVERY)
  if (thermalState == "hot" || thermalState == "critical") add(BackgroundNotificationBody.HEAT)
  if (batteryLevelPercent != null && batteryLevelPercent in 0..20 && batteryCharging != true) add(BackgroundNotificationBody.LOW_BATTERY)
  if (systemLowMemory == true) add(BackgroundNotificationBody.MEMORY)
  if (backgroundRestricted == true || appStandbyRestricted == true && batteryOptimizationIgnored != true || batteryOptimizationIgnored == false || powerSaveMode == true) add(BackgroundNotificationBody.BATTERY_WARNING)
  if (batteryOptimizationIgnored == null || backgroundRestricted == null || appStandbyRestricted == null && batteryOptimizationIgnored != true || powerSaveMode == null) add(BackgroundNotificationBody.SETTINGS_UNKNOWN)
  if (isEmpty()) add(if (hasActivePlayback) BackgroundNotificationBody.ACTIVE else BackgroundNotificationBody.PREPARED)
}

/** An unavailable system observation must not turn into a reassuring false. */
internal inline fun <T> readBackgroundObservation(read: () -> T): T? = try { read() } catch (_: Exception) { null }

internal fun backgroundSettingsTargets(requested: String, channelCreated: Boolean): List<String> = when (requested) {
  "battery", "notifications", "powerSaver" -> listOf(requested, "app")
  "playbackChannel" -> if (channelCreated) listOf(requested, "notifications", "app") else listOf("notifications", "app")
  "app" -> listOf("app")
  else -> emptyList()
}

/** Public ApplicationExitInfo reason values. Never infer battery policy from a kill. */
internal fun previousProcessExitReason(reason: Int): String = when (reason) {
  3 -> "memory"
  4, 5, 7 -> "crash"
  6 -> "unresponsive"
  9 -> "resources"
  10, 11 -> "user"
  1 -> "normal"
  2, 8, 12, 13, 14, 15, 16 -> "system"
  else -> "unknown"
}

internal data class PreviousProcessExit(val reason: Int, val timestamp: Long, val mainProcess: Boolean, val currentProcess: Boolean)

/** Use the latest main-process record, including normal exits; never hunt for an old crash. */
internal fun latestPreviousProcessExit(records: List<PreviousProcessExit>, observedAt: Long): Map<String, Any>? =
  records.asSequence().filter { it.mainProcess && !it.currentProcess && it.timestamp in 1..observedAt }
    .maxByOrNull { it.timestamp }?.let { mapOf("reason" to previousProcessExitReason(it.reason), "timestampMs" to it.timestamp) }
