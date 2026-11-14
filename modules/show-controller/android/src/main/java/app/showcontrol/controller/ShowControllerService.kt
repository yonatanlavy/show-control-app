package app.showcontrol.controller

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder

/** Owns the paired Flic connection whenever background listening is armed. */
class ShowControllerService : Service() {
  companion object {
    private const val ACTION_START = "app.showcontrol.controller.START"
    private const val EXTRA_STALE_MS = "stale_queue_max_age_ms"
    private const val PREFS = "show_controller_service"
    private const val PREF_ARMED = "armed"
    private const val PREF_STALE_MS = "stale_ms"
    private const val NOTIFICATION_ID = 4202
    private const val CHANNEL_ID = "show_controller_connection"

    fun start(context: Context, staleQueueMaxAgeMs: Long) {
      val app = context.applicationContext
      app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putBoolean(PREF_ARMED, true)
        .putLong(PREF_STALE_MS, staleQueueMaxAgeMs)
        .apply()
      val intent = Intent(app, ShowControllerService::class.java)
        .setAction(ACTION_START)
        .putExtra(EXTRA_STALE_MS, staleQueueMaxAgeMs)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) app.startForegroundService(intent)
      else app.startService(intent)
    }

    fun stop(context: Context) {
      val app = context.applicationContext
      app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putBoolean(PREF_ARMED, false)
        .apply()
      ShowControllerRuntime.stop()
      app.stopService(Intent(app, ShowControllerService::class.java))
    }
  }

  override fun onCreate() {
    super.onCreate()
    ShowControllerRuntime.setServiceOwnsLifecycle(true)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Show controller connection", NotificationManager.IMPORTANCE_LOW),
      )
    }
    val icon = applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.stat_notify_sync
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION") Notification.Builder(this)
    }
    startForeground(
      NOTIFICATION_ID,
      builder
        .setSmallIcon(icon)
        .setContentTitle("Show controller active")
        .setContentText("Maintaining assigned Bluetooth show-button connections")
        .setOngoing(true)
        .setCategory(Notification.CATEGORY_SERVICE)
        .build(),
    )
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val preferences = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (!preferences.getBoolean(PREF_ARMED, false)) {
      stopSelf()
      return START_NOT_STICKY
    }
    val staleMs = intent?.takeIf { it.action == ACTION_START }
      ?.getLongExtra(EXTRA_STALE_MS, 15_000L)
      ?: preferences.getLong(PREF_STALE_MS, 15_000L)
    ShowControllerRuntime.configure(applicationContext, staleMs, background = true)
    if (ShowControllerRuntime.hasBluetoothPermissions(applicationContext)) {
      ShowControllerRuntime.start(applicationContext)
    }
    return START_STICKY
  }

  override fun onDestroy() {
    ShowControllerRuntime.stop()
    ShowControllerRuntime.setServiceOwnsLifecycle(false)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
