package com.personalac.student

import android.content.Context
import androidx.work.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

class ReminderWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {

    override fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE)
        val serverUrl = prefs.getString(MainActivity.KEY_URL, null) ?: return Result.success()
        val token     = prefs.getString(MainActivity.KEY_TOKEN, null) ?: return Result.success()

        checkSrs(serverUrl, token)
        checkOverdueTodos(serverUrl, token)
        return Result.success()
    }

    private fun checkSrs(base: String, token: String) {
        val count = fetchInt("$base/api/srs/count", token, "count") ?: return
        if (count > 0) {
            NotificationHelper.showReminder(
                applicationContext, 1001,
                "复习提醒",
                "有 $count 个知识点待复习，趁热打铁效果更好！"
            )
        }
    }

    private fun checkOverdueTodos(base: String, token: String) {
        val json = fetchJson("$base/api/todo/overdue", token) ?: return
        val count = json.optJSONObject("data")?.optInt("count", 0) ?: 0
        if (count > 0) {
            val todos = json.optJSONObject("data")?.optJSONArray("todos")
            val first = (0 until minOf(count, 3)).joinToString("、") {
                todos?.optJSONObject(it)?.optString("title", "待办") ?: "待办"
            }
            val suffix = if (count > 3) " 等 $count 项" else ""
            NotificationHelper.showReminder(
                applicationContext, 1002,
                "待办逾期",
                "${first}${suffix}已超时，记得处理！"
            )
        }
    }

    private fun fetchJson(url: String, token: String): JSONObject? {
        return try {
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                setRequestProperty("x-sync-token", token)
                connectTimeout = 8000
                readTimeout = 8000
            }
            if (conn.responseCode != 200) return null
            val text = conn.inputStream.bufferedReader().readText()
            conn.disconnect()
            JSONObject(text)
        } catch (_: Exception) { null }
    }

    private fun fetchInt(url: String, token: String, key: String): Int? {
        val json = fetchJson(url, token) ?: return null
        return json.optJSONObject("data")?.optInt(key)
    }

    companion object {
        private const val WORK_TAG = "pac_reminder"

        fun schedule(ctx: Context) {
            val req = PeriodicWorkRequestBuilder<ReminderWorker>(30, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build())
                .addTag(WORK_TAG)
                .setInitialDelay(5, TimeUnit.MINUTES)
                .build()

            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                WORK_TAG,
                ExistingPeriodicWorkPolicy.KEEP,
                req
            )
        }

        fun cancel(ctx: Context) {
            WorkManager.getInstance(ctx).cancelAllWorkByTag(WORK_TAG)
        }
    }
}
