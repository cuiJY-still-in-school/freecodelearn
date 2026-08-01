#!/usr/bin/env node
'use strict'

const os   = require('os')
const path = require('path')
const fs   = require('fs')
const http = require('http')
const { exec, execSync } = require('child_process')

const PKG   = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'))
const VER   = PKG.version

// ── 参数解析 ─────────────────────────────────────────────────────────
const argv = process.argv.slice(2)

function flag(name)  { return argv.includes(name) }
function opt(name, fallback) {
  const i = argv.indexOf(name)
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback
}

const cmd    = argv.find(a => !a.startsWith('-')) || 'start'
const PORT   = opt('--port', opt('-p', process.env.PORT || '7575'))
const DDIR   = opt('--data', opt('-d', process.env.PERSONALAC_DATA || path.join(os.homedir(), '.personalac')))
const NOOPEN = flag('--no-open')
const URL    = `http://localhost:${PORT}`

const PKG_ROOT   = path.join(__dirname, '..')
const DIST_DIR   = path.join(PKG_ROOT, 'dist')
const PUBLIC_DIR = path.join(PKG_ROOT, 'public')

// ── 帮助 ─────────────────────────────────────────────────────────────
const HELP = `
PersonalAC v${VER} — 个性化学习辅助系统

用法:
  personalac [command] [options]

命令:
  start          启动服务器（默认）
  token          显示登录 Token
  open           在浏览器中打开界面
  status         检查服务器是否运行中
  version        显示版本号

选项:
  --port, -p <n>    端口号（默认 7575）
  --data, -d <dir>  数据目录（默认 ~/.personalac）
  --no-open         启动时不自动打开浏览器
  --help, -h        显示此帮助
  --version, -v     显示版本号
`

// ── 工具函数 ─────────────────────────────────────────────────────────
function openBrowser() {
  const c = process.platform === 'darwin' ? `open "${URL}"` :
            process.platform === 'win32'  ? `start "" "${URL}"` : `xdg-open "${URL}"`
  exec(c, err => { if (err) console.log(`\n  请手动打开: ${URL}\n`) })
}

function ping(cb) {
  const req = http.get(`${URL}/api/auth/me`, { timeout: 1500 }, res => {
    cb(res.statusCode === 200 || res.statusCode === 401)
  })
  req.on('error', () => cb(false))
  req.on('timeout', () => { req.destroy(); cb(false) })
}

function getToken() {
  const dbPath = path.join(DDIR, 'personalac.db')
  if (!fs.existsSync(dbPath)) return null
  try {
    const Database = require('better-sqlite3')
    const db = new Database(dbPath, { readonly: true })
    // 取第一个 guardian 账号的 sync_token（兼容 superadmin / admin 等不同用户名）
    const row = db.prepare(
      "SELECT sync_token FROM User WHERE role='guardian' AND delete_flag=0 ORDER BY create_time ASC LIMIT 1"
    ).get()
    db.close()
    return row ? row.sync_token : null
  } catch { return null }
}

function checkBuilt() {
  if (!fs.existsSync(path.join(DIST_DIR, 'index.js'))) {
    console.error('\n[PersonalAC] 服务端未编译，请先运行:\n  npm run build\n')
    process.exit(1)
  }
  if (!fs.existsSync(path.join(PUBLIC_DIR, 'index.html'))) {
    console.error('\n[PersonalAC] 前端未编译，请先运行:\n  npm run build\n')
    process.exit(1)
  }
}

// ── 命令路由 ─────────────────────────────────────────────────────────
if (flag('--help') || flag('-h') || cmd === 'help') {
  console.log(HELP); process.exit(0)
}

if (flag('--version') || flag('-v') || cmd === 'version') {
  console.log(`PersonalAC v${VER}`); process.exit(0)
}

if (cmd === 'token') {
  const t = getToken()
  if (t) {
    console.log(`\nSync Token: ${t}\n`)
    console.log(`登录地址: ${URL}\n`)
  } else {
    console.log('\n尚未初始化，请先运行: personalac start\n')
  }
  process.exit(0)
}

if (cmd === 'open') {
  ping(running => {
    if (running) {
      openBrowser()
    } else {
      console.log(`\n服务器未运行，请先执行: personalac start\n`)
    }
  })
  return
}

if (cmd === 'status') {
  ping(running => {
    if (running) {
      console.log(`\n运行中  ${URL}`)
      const t = getToken()
      if (t) console.log(`Token   ${t}`)
      console.log()
    } else {
      console.log(`\n未运行 — 执行 personalac start 启动\n`)
    }
    process.exit(0)
  })
  return
}

// ── 自我唤醒通知 ─────────────────────────────────────────────────────
// 在 study hours 内、学生长时间没有活动时推送 OS 系统通知
const NOTIFY_FILE     = path.join(os.tmpdir(), 'personalac_notify.json')
const STUDY_HOUR_START = 8   // 08:00
const STUDY_HOUR_END   = 22  // 22:00
const MIN_IDLE_MINUTES = 90  // 超过 90 分钟未活动才提醒
const CHECK_INTERVAL   = 15 * 60 * 1000  // 每 15 分钟检查一次

function sendOsNotify(title, body) {
  const p = process.platform
  if (p === 'linux') {
    exec(`notify-send -u normal -t 8000 "${title}" "${body}"`, () => {})
  } else if (p === 'darwin') {
    exec(`osascript -e 'display notification "${body}" with title "${title}" sound name "Ping"'`, () => {})
  } else if (p === 'win32') {
    // PowerShell toast (Windows 10+)
    const ps = `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] > $null
$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$template.GetElementsByTagName('text')[0].AppendChild($template.CreateTextNode('${title}')) > $null
$template.GetElementsByTagName('text')[1].AppendChild($template.CreateTextNode('${body}')) > $null
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('PersonalAC').Show([Windows.UI.Notifications.ToastNotification]::new($template))`
    exec(`powershell -Command "${ps.replace(/\n/g, '; ')}"`, () => {})
  }
}

function recordActivity() {
  try { fs.writeFileSync(NOTIFY_FILE, JSON.stringify({ lastActivity: Date.now() })) } catch { /* ignore */ }
}

function getLastActivity() {
  try {
    const d = JSON.parse(fs.readFileSync(NOTIFY_FILE, 'utf8'))
    return d.lastActivity || 0
  } catch { return 0 }
}

const NUDGES = [
  '该学习了！',
  '知识不等人，打开 PersonalAC 看看今天的计划吧',
  '距离上次学习已经有一段时间了，继续加油！',
  '坚持每天学一点，进步看得见',
  '今天还没打开学习记录？来开始吧',
]

function startWakeupScheduler() {
  setInterval(() => {
    const h = new Date().getHours()
    if (h < STUDY_HOUR_START || h >= STUDY_HOUR_END) return  // 夜间不打扰

    const idleMs = Date.now() - getLastActivity()
    if (idleMs < MIN_IDLE_MINUTES * 60 * 1000) return  // 最近有活动，不打扰

    const msg = NUDGES[Math.floor(Math.random() * NUDGES.length)]
    sendOsNotify('PersonalAC 学习提醒', msg)
  }, CHECK_INTERVAL)

  // 监听来自服务器的活动心跳（每次 /api/chat/stream 调用都记录一次）
  // 这里只注册一个定时检查；服务器会通过写文件来刷新 lastActivity
}

// ── doctor ── 1.4新增：环境预检 ────────────────────────────────────
if (cmd === 'doctor') {
  console.log('\nPersonalAC 环境诊断\n' + '─'.repeat(40))
  let ok = true

  // Node.js 版本
  const nodeVer = process.versions.node
  const [nodeMaj] = nodeVer.split('.').map(Number)
  if (nodeMaj >= 18) {
    console.log(`✓  Node.js v${nodeVer}`)
  } else {
    console.log(`✗  Node.js v${nodeVer} — 需要 v18+（请升级 Node.js）`)
    ok = false
  }

  // better-sqlite3
  try {
    require('better-sqlite3')
    console.log('✓  better-sqlite3 native 模块可用')
  } catch (e) {
    console.log('✗  better-sqlite3 加载失败: ' + e.message)
    console.log('   修复方案: npm install --global node-gyp && npm rebuild better-sqlite3')
    ok = false
  }

  // 磁盘空间
  try {
    const { execSync } = require('child_process')
    const dfOut = execSync('df -k "' + (process.env.HOME || '/') + '"', { encoding: 'utf8' })
    const lines = dfOut.trim().split('\n')
    const parts = lines[lines.length - 1].trim().split(/\s+/)
    const freeKB = parseInt(parts[3] || parts[2], 10)
    const freeGB = (freeKB / 1024 / 1024).toFixed(1)
    if (freeKB > 500 * 1024) {
      console.log(`✓  磁盘剩余 ${freeGB} GB`)
    } else {
      console.log(`⚠  磁盘剩余仅 ${freeGB} GB（建议 500MB 以上）`)
    }
  } catch { console.log('?  磁盘空间检测跳过（df 不可用）') }

  // 数据目录可写
  try {
    fs.mkdirSync(DDIR, { recursive: true })
    const testFile = path.join(DDIR, '.doctor_write_test')
    fs.writeFileSync(testFile, 'ok')
    fs.unlinkSync(testFile)
    console.log(`✓  数据目录可写: ${DDIR}`)
  } catch (e) {
    console.log(`✗  数据目录不可写: ${DDIR} — ${e.message}`)
    ok = false
  }

  // 端口检测
  const net = require('net')
  const testServer = net.createServer()
  testServer.once('error', () => {
    console.log(`⚠  端口 ${PORT} 已被占用（可以用 --port 指定其他端口）`)
    done()
  })
  testServer.once('listening', () => {
    console.log(`✓  端口 ${PORT} 可用`)
    testServer.close(done)
  })
  testServer.listen(parseInt(PORT, 10))

  function done() {
    console.log('\n' + '─'.repeat(40))
    if (ok) {
      console.log('环境检测通过，可以运行: personalac start\n')
    } else {
      console.log('发现问题，请按上述提示修复后重试\n')
    }
    process.exit(ok ? 0 : 1)
  }
  return
}

// ── sync ── 1.4新增：手动触发 Agent 心跳 ───────────────────────────
if (cmd === 'sync') {
  ping(running => {
    if (!running) {
      console.log('\n服务器未运行，请先执行: personalac start\n')
      process.exit(1)
      return
    }
    const t = getToken()
    const options = {
      hostname: '127.0.0.1',
      port: parseInt(PORT, 10),
      path: '/api/agent/heartbeat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-token': t || '' }
    }
    const req = http.request(options, res => {
      let body = ''
      res.on('data', d => { body += d })
      res.on('end', () => {
        try {
          const d = JSON.parse(body)
          if (d.success) {
            const { scanned, actions } = d.data
            console.log(`\n心跳完成：扫描 ${scanned} 名学生，执行 ${actions.length} 项动作`)
            if (actions.length > 0) console.log('动作：' + actions.join(', '))
          } else {
            console.log('\n心跳失败：' + d.error)
          }
        } catch { console.log('\n响应解析失败') }
        console.log()
        process.exit(0)
      })
    })
    req.on('error', () => { console.log('\n无法连接服务器\n'); process.exit(1) })
    req.end()
  })
  return
}

// ── start（默认）────────────────────────────────────────────────────
if (cmd === 'start' || cmd === (argv.find(a => !a.startsWith('-')) || 'start')) {
  checkBuilt()
  fs.mkdirSync(DDIR, { recursive: true })

  process.env.DATA_DIR        = DDIR
  process.env.PORT            = PORT
  process.env.CORS_ORIGIN     = URL
  process.env.FRONTEND_DIST   = PUBLIC_DIR
  process.env.NOTIFY_FILE     = NOTIFY_FILE

  if (!NOOPEN) setTimeout(openBrowser, 1800)

  // 启动自我唤醒调度器
  startWakeupScheduler()

  require(path.join(DIST_DIR, 'index.js'))
}
