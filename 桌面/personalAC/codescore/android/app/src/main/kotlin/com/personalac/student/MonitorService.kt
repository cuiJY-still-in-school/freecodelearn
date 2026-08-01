package com.personalac.student

import android.app.*
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.*
import android.util.Base64
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

class MonitorService : Service() {

    companion object {
        const val CHANNEL_ID       = "pac_monitor"
        const val NOTIF_ID         = 1001
        const val ACTION_START     = "PAC_START"
        const val ACTION_STOP      = "PAC_STOP"
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"

        private const val SCREENSHOT_MS = 10 * 60 * 1_000L  // 10 min
        private const val ACTIVITY_MS   = 5 * 60 * 1_000L   // 5 min
    }

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null

    private val handler = Handler(Looper.getMainLooper())
    private val screenshotRunnable = object : Runnable {
        override fun run() {
            Thread { captureAndUpload() }.start()
            handler.postDelayed(this, SCREENSHOT_MS)
        }
    }
    private val activityRunnable = object : Runnable {
        override fun run() {
            Thread { reportActivity() }.start()
            handler.postDelayed(this, ACTIVITY_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { stopSelf(); return START_NOT_STICKY }

        startForeground(NOTIF_ID, buildNotification())

        val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, -1) ?: -1
        @Suppress("DEPRECATION")
        val resultData = intent?.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)

        if (resultCode != -1 && resultData != null) {
            val mgr = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            mediaProjection = mgr.getMediaProjection(resultCode, resultData).also {
                it.registerCallback(object : MediaProjection.Callback() {
                    override fun onStop() { stopSelf() }
                }, handler)
            }
            setupVirtualDisplay()
            // first shot after 30 s, then every 2 min
            handler.postDelayed(screenshotRunnable, 30_000L)
        }

        handler.postDelayed(activityRunnable, ACTIVITY_MS)
        return START_STICKY
    }

    private fun setupVirtualDisplay() {
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        (getSystemService(WINDOW_SERVICE) as WindowManager).defaultDisplay.getMetrics(metrics)

        val maxSide = 1280
        val w = minOf(metrics.widthPixels, maxSide)
        val h = (w.toFloat() / metrics.widthPixels * metrics.heightPixels).toInt()

        imageReader = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2)
        virtualDisplay = mediaProjection?.createVirtualDisplay(
            "pac_cap", w, h, metrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader?.surface, null, null
        )
    }

    private fun captureAndUpload() {
        try {
            val image = imageReader?.acquireLatestImage() ?: return
            val plane = image.planes[0]
            // stride 宽度（含 padding）→ 复制整行 buffer → 再裁剪到实际宽度
            val strideWidth = plane.rowStride / plane.pixelStride
            val full = Bitmap.createBitmap(strideWidth, image.height, Bitmap.Config.ARGB_8888)
            full.copyPixelsFromBuffer(plane.buffer)
            image.close()
            val bmp = if (strideWidth != image.width)
                Bitmap.createBitmap(full, 0, 0, image.width, image.height).also { full.recycle() }
            else full

            val out = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, 45, out)
            bmp.recycle()

            val b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
            post("/api/client/screenshot", JSONObject().put("data", b64))
        } catch (_: Exception) {}
    }

    private fun reportActivity() {
        try {
            val usm = getSystemService(USAGE_STATS_SERVICE) as? UsageStatsManager ?: return
            val now = System.currentTimeMillis()
            val stats = usm.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY, now - ACTIVITY_MS * 6, now
            ) ?: return

            val records = JSONArray()
            for (s in stats) {
                if (s.totalTimeInForeground <= 0) continue
                records.put(
                    JSONObject()
                        .put("app_name", s.packageName.substringAfterLast('.'))
                        .put("window_title", s.packageName)
                        .put("duration_seconds", s.totalTimeInForeground / 1000)
                        .put("timestamp", s.lastTimeUsed.takeIf { it > 0 } ?: now)
                )
            }
            if (records.length() > 0)
                post("/api/client/activity", JSONObject().put("records", records))
        } catch (_: Exception) {}
    }

    private fun post(path: String, body: JSONObject) {
        val prefs = getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE)
        val serverUrl = prefs.getString(MainActivity.KEY_URL, "") ?: return
        val token     = prefs.getString(MainActivity.KEY_TOKEN, "") ?: ""
        if (serverUrl.isBlank()) return

        val conn = URL("$serverUrl$path").openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("x-sync-token", token)
            conn.doOutput = true
            conn.connectTimeout = 10_000
            conn.readTimeout    = 10_000
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            conn.responseCode
        } finally {
            conn.disconnect()
        }
    }

    private fun buildNotification(): Notification {
        val mainIntent = Intent(this, MainActivity::class.java)
        val mainPi = PendingIntent.getActivity(this, 0, mainIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("PersonalAC 监控运行中")
            .setContentText("屏幕记录与使用时间统计")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentIntent(mainPi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        val ch = NotificationChannel(CHANNEL_ID, "PersonalAC 监控",
            NotificationManager.IMPORTANCE_LOW).apply {
            description = "学习屏幕记录与使用时间统计"
            setShowBadge(false)
        }
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
    }

    override fun onBind(intent: Intent?) = null

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        virtualDisplay?.release()
        imageReader?.close()
        mediaProjection?.stop()
        super.onDestroy()
    }
}
