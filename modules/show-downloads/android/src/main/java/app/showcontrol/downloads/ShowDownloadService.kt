package app.showcontrol.downloads

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import android.os.PowerManager

/** Main-thread ownership; stale workers never stop a newer transfer's service. */
internal class DownloadServiceOwnership {
  private var latestStartId = 0
  private var current: Any? = null
  fun noteStart(startId: Int) { latestStartId = startId }
  fun admit(): Any = Any().also { current = it }
  fun finish(token: Any): Int? {
    if (current !== token) return null
    current = null; return latestStartId
  }
  fun idleStopId(): Int? = if (current == null) latestStartId else null
  fun destroy() { current = null }
}

class ShowDownloadService : Service() {
  private val main = Handler(Looper.getMainLooper())
  private val ownership = DownloadServiceOwnership()
  private val wakeLocks = mutableSetOf<PowerManager.WakeLock>()
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    ownership.noteStart(startId)
    val id = intent?.getStringExtra("id")
    if (id == null) { ownership.idleStopId()?.let(::stopSelf); return START_NOT_STICKY }
    if (intent?.action == "cancel") {
      runCatching { DownloadRuntime.cancelActiveTransfer(applicationContext, id) }
      ownership.idleStopId()?.let(::stopSelf)
      return START_NOT_STICKY
    }
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel("showcontrol-downloads", getString(R.string.download_channel), NotificationManager.IMPORTANCE_LOW))
    val cancel = PendingIntent.getService(this, 1, Intent(this, ShowDownloadService::class.java).setAction("cancel").putExtra("id", id), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, "showcontrol-downloads") else Notification.Builder(this)
    builder.setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle(getString(R.string.download_channel)).setContentText(getString(R.string.download_running)).setOngoing(true).addAction(Notification.Action.Builder(null, getString(R.string.download_cancel), cancel).build())
    if (launch != null) builder.setContentIntent(PendingIntent.getActivity(this, 2, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    startForeground(7342, builder.build())
    val token = ownership.admit()
    val wakeLock = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ShowControl:Download").apply { acquire(1_260_000) }
    wakeLocks.add(wakeLock)
    DownloadRuntime.execute(applicationContext, id) {
      main.post {
        if (wakeLocks.remove(wakeLock) && wakeLock.isHeld) wakeLock.release()
        ownership.finish(token)?.let { stopId -> stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(stopId) }
      }
    }
    return START_NOT_STICKY
  }
  override fun onDestroy() {
    ownership.destroy()
    wakeLocks.forEach { if (it.isHeld) it.release() }; wakeLocks.clear()
    super.onDestroy()
  }
}
