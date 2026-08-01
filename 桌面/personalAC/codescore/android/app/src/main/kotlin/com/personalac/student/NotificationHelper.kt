package com.personalac.student

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object NotificationHelper {

    const val CHANNEL_REMINDER = "pac_reminder"
    const val CHANNEL_RELAY    = "pac_relay"

    fun createChannels(ctx: Context) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        nm.createNotificationChannel(NotificationChannel(
            CHANNEL_REMINDER,
            "学习提醒",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply { description = "SRS 复习和待办逾期提醒" })

        nm.createNotificationChannel(NotificationChannel(
            CHANNEL_RELAY,
            "家长消息",
            NotificationManager.IMPORTANCE_HIGH
        ).apply { description = "家长发来的图片和消息" })
    }

    fun showReminder(ctx: Context, id: Int, title: String, text: String) {
        val intent = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pi = PendingIntent.getActivity(ctx, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val n = NotificationCompat.Builder(ctx, CHANNEL_REMINDER)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        try {
            NotificationManagerCompat.from(ctx).notify(id, n)
        } catch (_: SecurityException) { /* 没有 POST_NOTIFICATIONS 权限时静默失败 */ }
    }
}
