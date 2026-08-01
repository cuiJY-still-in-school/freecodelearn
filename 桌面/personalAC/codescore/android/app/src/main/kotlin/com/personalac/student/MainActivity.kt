package com.personalac.student

import android.Manifest
import android.annotation.SuppressLint
import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.*
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat

class MainActivity : AppCompatActivity() {

    companion object {
        const val PREFS     = "pac_prefs"
        const val KEY_URL   = "server_url"
        const val KEY_TOKEN = "sync_token"
    }

    private lateinit var webView: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingProjectionStart = false

    private val notifPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* 用户选择后继续，不强制要求 */ }

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val uris = if (result.resultCode == RESULT_OK) result.data?.data?.let { arrayOf(it) } else null
        filePathCallback?.onReceiveValue(uris)
        filePathCallback = null
    }

    private val projectionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK && result.data != null) {
            val intent = Intent(this, MonitorService::class.java).apply {
                action = MonitorService.ACTION_START
                putExtra(MonitorService.EXTRA_RESULT_CODE, result.resultCode)
                putExtra(MonitorService.EXTRA_RESULT_DATA, result.data)
            }
            startForegroundService(intent)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.parseColor("#1C1917")

        // 初始化通知渠道 + 请求通知权限（Android 13+）
        NotificationHelper.createChannels(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val url = prefs.getString(KEY_URL, null)
        if (url.isNullOrBlank()) {
            showSetup { u: String ->
                prefs.edit().putString(KEY_URL, u).apply()
                launchWebView(u)
                checkAndStartMonitor()
                ReminderWorker.schedule(this)
            }
        } else {
            launchWebView(url)
            checkAndStartMonitor()
            ReminderWorker.schedule(this)
        }
    }

    // ── 初始设置 ──────────────────────────────────────────────────────────────

    private fun showSetup(onDone: (String) -> Unit) {
        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(72, 48, 72, 24)
            setBackgroundColor(Color.parseColor("#F9F7F4"))
        }
        val hintLabel = android.widget.TextView(this).apply {
            text = "输入服务器地址，由家长/老师提供"
            textSize = 12f
            setTextColor(Color.parseColor("#9A9690"))
            setPadding(0, 0, 0, 12)
        }
        val input = android.widget.EditText(this).apply {
            setHint("http://192.168.x.x:7575")
            setSingleLine()
            textSize = 15f
            setTextColor(Color.parseColor("#1A1815"))
            setHintTextColor(Color.parseColor("#C8C5BF"))
            background = null
            setPadding(0, 8, 0, 8)
        }
        layout.addView(hintLabel)
        layout.addView(input)
        AlertDialog.Builder(this, R.style.SetupDialog)
            .setTitle("连接 PersonalAC")
            .setView(layout)
            .setCancelable(false)
            .setPositiveButton("连接") { _, _ ->
                val u = input.text.toString().trim().trimEnd('/')
                if (u.startsWith("http")) onDone(u) else showSetup(onDone)
            }
            .setNeutralButton("重置") { _, _ -> showSetup(onDone) }
            .show()
    }

    // ── 监控启动流程 ──────────────────────────────────────────────────────────

    private fun checkAndStartMonitor() {
        if (!hasUsageStatsPermission()) {
            showUsageStatsDialog()
            return
        }
        requestScreenCapture()
    }

    private fun hasUsageStatsPermission(): Boolean {
        val aom = getSystemService(APP_OPS_SERVICE) as AppOpsManager
        @Suppress("DEPRECATION")
        val mode = aom.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), packageName
        )
        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun showUsageStatsDialog() {
        AlertDialog.Builder(this, R.style.SetupDialog)
            .setTitle("需要使用情况权限")
            .setMessage("PersonalAC 需要「使用情况访问权限」来记录 App 使用时间。\n\n点击「去授权」后找到 PersonalAC 并开启。")
            .setCancelable(false)
            .setPositiveButton("去授权") { _, _ ->
                pendingProjectionStart = true
                startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
            }
            .setNegativeButton("跳过") { _, _ ->
                requestScreenCapture()
            }
            .show()
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) webView.onResume()
        if (pendingProjectionStart) {
            pendingProjectionStart = false
            requestScreenCapture()
        }
    }

    private fun requestScreenCapture() {
        val mgr = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        AlertDialog.Builder(this, R.style.SetupDialog)
            .setTitle("开启屏幕监控")
            .setMessage("PersonalAC 需要录制屏幕以定时截图，用于家长查看学习状态。\n\n点击「允许」后在系统弹窗中确认。")
            .setCancelable(false)
            .setPositiveButton("允许") { _, _ ->
                projectionLauncher.launch(mgr.createScreenCaptureIntent())
            }
            .setNegativeButton("跳过") { _, _ -> /* 不启动截图，只上报 activity */
                startForegroundService(Intent(this, MonitorService::class.java).apply {
                    action = MonitorService.ACTION_START
                })
            }
            .show()
    }

    // ── WebView ───────────────────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun launchWebView(serverUrl: String) {
        val wv = WebView(this).also { webView = it }
        setContentView(wv)

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(wv, true)
        }

        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            useWideViewPort = true
            loadWithOverviewMode = true
            allowFileAccess = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = false
        }

        wv.isLongClickable = false
        wv.isHapticFeedbackEnabled = false

        // JavaScript 桥：页面登录成功后把 syncToken 写入 SharedPreferences
        wv.addJavascriptInterface(object {
            @android.webkit.JavascriptInterface
            fun saveToken(token: String) {
                getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putString(KEY_TOKEN, token).apply()
            }
        }, "PACBridge")

        wv.webViewClient = object : WebViewClient() {
            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                // 只对私有网络地址（家庭自建服务器）放行自签名证书
                val host = Uri.parse(serverUrl).host ?: ""
                if (isPrivateHost(host)) { handler.proceed(); return }
                handler.cancel()
                AlertDialog.Builder(this@MainActivity, R.style.SetupDialog)
                    .setTitle("SSL 证书错误")
                    .setMessage("无法验证服务器证书，连接已被中断。\n\n如需连接本地服务器，请使用局域网 IP 地址。")
                    .setPositiveButton("确定") { _, _ -> }
                    .show()
            }

            private fun isPrivateHost(host: String): Boolean {
                if (host == "localhost" || host == "127.0.0.1" || host == "::1") return true
                val parts = host.split(".").mapNotNull { it.toIntOrNull() }
                if (parts.size != 4) return false
                return parts[0] == 10 ||
                    (parts[0] == 172 && parts[1] in 16..31) ||
                    (parts[0] == 192 && parts[1] == 168)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val reqHost = request.url.host ?: return false
                val svrHost = Uri.parse(serverUrl).host ?: return false
                return if (reqHost == svrHost) false
                else { startActivity(Intent(Intent.ACTION_VIEW, request.url)); true }
            }

            override fun onPageFinished(view: WebView, url: String) {
                // 每次页面加载后把 localStorage 里的 syncToken 传给原生层
                view.evaluateJavascript(
                    "(function(){ var t=localStorage.getItem('syncToken'); if(t) PACBridge.saveToken(t); })()",
                    null
                )
            }
        }

        wv.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                return try { fileChooserLauncher.launch(params.createIntent()); true }
                catch (_: Exception) { filePathCallback = null; false }
            }
        }

        wv.loadUrl(serverUrl)
    }

    // ── 生命周期 ──────────────────────────────────────────────────────────────

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack()
        else @Suppress("DEPRECATION") super.onBackPressed()
    }

    override fun onPause() {
        super.onPause()
        if (::webView.isInitialized) webView.onPause()
    }

    override fun onDestroy() {
        if (::webView.isInitialized) { webView.stopLoading(); webView.destroy() }
        super.onDestroy()
    }
}
