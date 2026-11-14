@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package app.showcontrol.audio

import android.Manifest
import android.app.Activity
import android.app.ActivityManager
import android.app.NotificationManager
import android.app.Notification
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.BatteryManager
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.media3.session.DefaultMediaNotificationProvider

/** Best-effort public observations only. Nothing here starts audio or changes OS settings. */
internal object BackgroundReliability {
  private val exitLock = Any()
  private var exitRead = false
  private var previousExit: Map<String, Any>? = null

  private fun previousExit(context: Context): Map<String, Any>? = synchronized(exitLock) {
    if (!exitRead) {
      exitRead = true
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) previousExit = readBackgroundObservation {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        val observedAt = System.currentTimeMillis()
        latestPreviousProcessExit(manager?.getHistoricalProcessExitReasons(context.packageName, 0, 8).orEmpty().map { record ->
          PreviousProcessExit(record.reason, record.timestamp, record.processName == context.packageName, record.pid == android.os.Process.myPid())
        }, observedAt)
      }
    }
    previousExit
  }

  fun read(context: Context, serviceRunning: Boolean, foregroundServiceActive: Boolean?, preparedSessionActive: Boolean = false): Map<String, Any?> {
    val power = readBackgroundObservation { context.getSystemService(Context.POWER_SERVICE) as? PowerManager }
    val notifications = readBackgroundObservation { context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager }
    // Use Android's current flag, not a guessed RAM threshold, trim callback,
    // process list or historical exit. Unavailable observations stay unknown.
    val systemLowMemory = readBackgroundObservation {
      (context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager)?.let { manager ->
        ActivityManager.MemoryInfo().also(manager::getMemoryInfo).lowMemory
      }
    }
    val battery = readBackgroundObservation { context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) }
    val chargeState = battery?.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
    val channelStatus = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && notifications != null) readBackgroundObservation {
      val channel = notifications.getNotificationChannel(DefaultMediaNotificationProvider.DEFAULT_CHANNEL_ID)
      (channel != null) to channel?.let {
        val groupBlocked = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && it.group?.let { id -> notifications.getNotificationChannelGroup(id)?.isBlocked } == true
        it.importance == NotificationManager.IMPORTANCE_NONE || groupBlocked
      }
    } else null
    return mapOf(
      "platform" to "android",
      "checkedAtMonotonicMs" to SystemClock.elapsedRealtime(),
      "batteryOptimizationIgnored" to power?.let { readBackgroundObservation { it.isIgnoringBatteryOptimizations(context.packageName) } },
      "backgroundRestricted" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        readBackgroundObservation { (context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager)?.isBackgroundRestricted }
      } else false, // Android's background-restricted state was introduced in API 28; OEM controls remain unobservable.
      // Calling-app observation only. No permission to inspect other apps is needed.
      "appStandbyRestricted" to appStandbyRestricted(Build.VERSION.SDK_INT,
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) readBackgroundObservation {
          (context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager)?.appStandbyBucket
        } else null,
      ),
      "powerSaveMode" to power?.let { readBackgroundObservation { it.isPowerSaveMode } },
      "batteryLevelPercent" to batteryLevelPercent(
        battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), battery?.getIntExtra(BatteryManager.EXTRA_SCALE, -1),
      ),
      "batteryCharging" to when (chargeState) {
        BatteryManager.BATTERY_STATUS_CHARGING, BatteryManager.BATTERY_STATUS_FULL -> true
        BatteryManager.BATTERY_STATUS_DISCHARGING, BatteryManager.BATTERY_STATUS_NOT_CHARGING -> false
        else -> null
      },
      "thermalState" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        backgroundThermalState(power?.let { readBackgroundObservation { it.currentThermalStatus } })
      } else null,
      "systemLowMemory" to systemLowMemory,
      "notificationPermissionGranted" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        readBackgroundObservation { ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED }
      } else true,
      "notificationsEnabled" to readBackgroundObservation { NotificationManagerCompat.from(context).areNotificationsEnabled() },
      "playbackChannelCreated" to channelStatus?.first,
      "playbackChannelBlocked" to channelStatus?.second,
      "serviceRunning" to serviceRunning,
      "preparedSessionActive" to preparedSessionActive,
      "foregroundServiceActive" to foregroundServiceActive,
      // Cached once per process, at most eight public records, with no traces or descriptions.
      "previousProcessExit" to previousExit(context),
      // A posted record can still be hidden by permission, channel, lock-screen
      // or manufacturer policy. Never call this a visibility/survival guarantee.
      "playbackNotificationPresent" to notifications?.let { manager -> readBackgroundObservation {
        manager.activeNotifications.any { record ->
          record.id == DefaultMediaNotificationProvider.DEFAULT_NOTIFICATION_ID && record.tag == null &&
            (record.notification.flags and Notification.FLAG_FOREGROUND_SERVICE) != 0
        }
      } },
    )
  }

  fun openSettings(activity: Activity?, target: String): Map<String, Any?> {
    fun result(openedTarget: String?) = mapOf(
      "opened" to (openedTarget != null), "requestedTarget" to target,
      "openedTarget" to openedTarget, "usedFallback" to (openedTarget != null && openedTarget != target),
    )
    if (activity == null || activity.isFinishing || activity.isDestroyed) return result(null)
    val channelCreated = read(activity, false, null)["playbackChannelCreated"] == true
    for (candidate in backgroundSettingsTargets(target, channelCreated)) {
      val intent = when (candidate) {
        "battery" -> Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        "notifications" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
        } else continue
        "playbackChannel" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
            .putExtra(Settings.EXTRA_CHANNEL_ID, DefaultMediaNotificationProvider.DEFAULT_CHANNEL_ID)
        } else continue
        "powerSaver" -> Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS)
        "app" -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", activity.packageName, null))
        else -> continue
      }
      // Launch only after an explicit UI action. OEM settings may be absent or reject an intent.
      if (readBackgroundObservation { activity.startActivity(intent); true } == true) return result(candidate)
    }
    return result(null)
  }
}
