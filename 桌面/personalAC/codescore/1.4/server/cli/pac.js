#!/usr/bin/env node
// PersonalAC CLI — pac.js  v1.3.0
// 安装:
//   curl -fsSL https://your-server.com/cli/pac.js -o pac && chmod +x pac
//   mv pac /usr/local/bin/pac
//
// 要求: Node.js 18+

'use strict'

const fs   = require('fs')
const os   = require('os')
const path = require('path')
const http = require('http')
const https = require('https')
const readline = require('readline')
const { execSync, spawn } = require('child_process')

// ─────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────
const VERSION       = '1.3.0'
const CONFIG_FILE   = path.join(os.homedir(), '.personalac.json')
const PID_FILE      = path.join(os.homedir(), '.personalac.pid')
const WORKSPACE_DIR = path.join(os.homedir(), 'personalac-workspace')
const PROXY_PORT    = 7474
const PROXY_INTERNAL_CMD = '__workspace_proxy__'

// ─────────────────────────────────────────────
// 配置文件
// ─────────────────────────────────────────────
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }
  catch { return null }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 })
}

// ─────────────────────────────────────────────
// HTTP（只用 Node 内置）
// ─────────────────────────────────────────────
function apiGet(url, token) {
  return new Promise((resolve, reject) => {
    let u
    try { u = new URL(url) } catch (e) { return reject(new Error(`无效 URL: ${url}`)) }

    const lib = u.protocol === 'https:' ? https : http
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'x-sync-token': token || '', 'Content-Type': 'application/json' },
      timeout: 8000
    }
    const req = lib.request(opts, res => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { reject(new Error('服务器返回非 JSON 响应')) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('连接超时')) })
    req.end()
  })
}

// ─────────────────────────────────────────────
// 交互式输入
// ─────────────────────────────────────────────
function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (ans) => { rl.close(); resolve(ans.trim()) })
  })
}

// ─────────────────────────────────────────────
// 跨平台浏览器启动
// ─────────────────────────────────────────────
function openBrowser(url) {
  try {
    const cmd =
      process.platform === 'win32' ? `start "" "${url}"` :
      process.platform === 'darwin' ? `open "${url}"` :
      `xdg-open "${url}" 2>/dev/null || sensible-browser "${url}" 2>/dev/null || true`
    execSync(cmd, { stdio: 'ignore', shell: true })
  } catch {
    console.log(`  请手动打开浏览器: ${url}`)
  }
}

// ─────────────────────────────────────────────
// Daemon 管理（PID 文件）
// ─────────────────────────────────────────────
function getDaemonPid() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10)
    if (!pid || isNaN(pid)) return null
    process.kill(pid, 0)   // 检查进程是否存在
    return pid
  } catch {
    return null
  }
}

function spawnDaemon() {
  const child = spawn(process.execPath, [__filename, PROXY_INTERNAL_CMD], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env }
  })
  child.unref()
  fs.writeFileSync(PID_FILE, String(child.pid), { mode: 0o600 })
  return child.pid
}

function killDaemon() {
  const pid = getDaemonPid()
  if (!pid) return false
  try { process.kill(pid, 'SIGTERM') } catch {}
  try { fs.unlinkSync(PID_FILE) } catch {}
  return true
}

// ─────────────────────────────────────────────
// Workspace 代理服务器（daemon 模式下运行）
// ─────────────────────────────────────────────
function runWorkspaceProxy() {
  const cfg = loadConfig()
  if (!cfg) { process.exit(1) }

  if (!fs.existsSync(WORKSPACE_DIR)) {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true, mode: 0o700 })
  }

  // 允许的 CORS 来源：配置的服务器地址
  const allowedOrigin = cfg.server || '*'

  function setCORS(res) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-sync-token')
  }

  function sendJSON(res, code, body) {
    res.writeHead(code, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  function checkToken(req) {
    return req.headers['x-sync-token'] === cfg.syncToken
  }

  // 防止路径遍历：确保目标在 WORKSPACE_DIR 内
  function resolveSafe(rel) {
    const abs = path.resolve(WORKSPACE_DIR, rel || '')
    if (!abs.startsWith(WORKSPACE_DIR + path.sep) && abs !== WORKSPACE_DIR) {
      throw new Error('非法路径')
    }
    return abs
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let raw = ''
      req.on('data', c => { raw += c })
      req.on('end', () => {
        try { resolve(raw ? JSON.parse(raw) : {}) }
        catch { reject(new Error('请求体 JSON 解析失败')) }
      })
      req.on('error', reject)
    })
  }

  function dirSize(dir) {
    let size = 0, count = 0
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name)
        if (entry.isDirectory()) { const sub = dirSize(p); size += sub.size; count += sub.count }
        else { try { size += fs.statSync(p).size; count++ } catch {} }
      }
    } catch {}
    return { size, count }
  }

  const server = http.createServer(async (req, res) => {
    setCORS(res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (!checkToken(req)) {
      sendJSON(res, 401, { success: false, error: 'Unauthorized' })
      return
    }

    let u
    try { u = new URL(req.url, `http://127.0.0.1:${PROXY_PORT}`) }
    catch { sendJSON(res, 400, { success: false, error: 'Bad request' }); return }

    const route = u.pathname

    try {
      // ── 状态探测 ──────────────────────────────
      if (route === '/status' && req.method === 'GET') {
        sendJSON(res, 200, { success: true, data: { running: true, version: VERSION, workspace: WORKSPACE_DIR } })
        return
      }

      // ── Stats ─────────────────────────────────
      if (route === '/api/workspace/stats' && req.method === 'GET') {
        const { size, count } = dirSize(WORKSPACE_DIR)
        sendJSON(res, 200, { success: true, data: { fileCount: count, totalSize: size, diskFree: 0, diskTotal: 0, usage: size } })
        return
      }

      // ── Write ─────────────────────────────────
      if (route === '/api/workspace/write' && req.method === 'POST') {
        const body = await readBody(req)
        if (!body.relativePath) { sendJSON(res, 400, { success: false, error: 'relativePath 必填' }); return }
        const abs = resolveSafe(body.relativePath)
        fs.mkdirSync(path.dirname(abs), { recursive: true })
        fs.writeFileSync(abs, body.content ?? '')
        sendJSON(res, 200, { success: true })
        return
      }

      // ── Read ──────────────────────────────────
      if (route === '/api/workspace/read' && req.method === 'GET') {
        const rel = u.searchParams.get('path') || ''
        const abs = resolveSafe(rel)
        const content = fs.readFileSync(abs, 'utf8')
        sendJSON(res, 200, { success: true, data: content })
        return
      }

      // ── List ──────────────────────────────────
      if (route === '/api/workspace/list' && req.method === 'GET') {
        const rel = u.searchParams.get('path') || ''
        const abs = resolveSafe(rel)
        const entries = fs.readdirSync(abs, { withFileTypes: true }).map(e => ({
          name: e.name,
          isDirectory: e.isDirectory(),
          size: e.isFile() ? (fs.statSync(path.join(abs, e.name)).size) : 0,
          mtime: fs.statSync(path.join(abs, e.name)).mtimeMs
        }))
        sendJSON(res, 200, { success: true, data: entries })
        return
      }

      // ── Delete ────────────────────────────────
      if (route === '/api/workspace/delete' && req.method === 'DELETE') {
        const rel = u.searchParams.get('path') || ''
        const abs = resolveSafe(rel)
        fs.rmSync(abs, { recursive: true, force: true })
        sendJSON(res, 200, { success: true })
        return
      }

      // ── Cleanup temp ──────────────────────────
      if (route === '/api/workspace/cleanup-temp' && req.method === 'POST') {
        const tmpDir = path.join(WORKSPACE_DIR, 'temp')
        let deleted = 0, freedBytes = 0
        if (fs.existsSync(tmpDir)) {
          for (const name of fs.readdirSync(tmpDir)) {
            const p = path.join(tmpDir, name)
            try {
              freedBytes += fs.statSync(p).size
              fs.rmSync(p, { recursive: true })
              deleted++
            } catch {}
          }
        }
        sendJSON(res, 200, { success: true, data: { deleted, freedBytes } })
        return
      }

      sendJSON(res, 404, { success: false, error: 'Not found' })
    } catch (err) {
      sendJSON(res, 500, { success: false, error: err.message })
    }
  })

  server.listen(PROXY_PORT, '127.0.0.1', () => {
    // 静默运行，不输出任何内容（daemon）
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') process.exit(1)
    process.exit(1)
  })

  process.on('SIGTERM', () => { server.close(); process.exit(0) })
  process.on('SIGINT', () => { server.close(); process.exit(0) })
}

// ─────────────────────────────────────────────
// 命令实现
// ─────────────────────────────────────────────
async function cmdLogin(args) {
  let server = args[0] || ''
  if (!server) server = await prompt('服务器地址 (例: https://pac.example.com): ')
  server = server.replace(/\/$/, '')
  if (!server.startsWith('http')) server = 'https://' + server

  const token = await prompt('Sync Token: ')
  if (!token) { console.error('  Token 不能为空'); process.exit(1) }

  process.stdout.write('  验证中...')
  try {
    const result = await apiGet(`${server}/api/auth/me`, token)
    if (!result.success) {
      console.log('')
      console.error(`  验证失败: ${result.error || 'Token 无效'}`)
      process.exit(1)
    }
    console.log(' 成功\n')
    const username = result.data?.username || 'superadmin'
    saveConfig({ server, syncToken: token, username })
    console.log(`  已登录:  ${username}`)
    console.log(`  服务器:  ${server}`)
    console.log(`\n  下一步: pac start    ← 启动本地 Workspace 并打开控制台`)
  } catch (err) {
    console.log('')
    console.error(`  连接失败: ${err.message}`)
    process.exit(1)
  }
}

async function cmdStart() {
  const cfg = loadConfig()
  if (!cfg) { console.error('  请先运行: pac login <服务器地址>'); process.exit(1) }

  const existing = getDaemonPid()
  if (existing) {
    console.log(`  Workspace 代理已在运行 (PID ${existing}, 端口 ${PROXY_PORT})`)
  } else {
    const pid = spawnDaemon()
    await new Promise(r => setTimeout(r, 700))  // 等待代理启动
    const running = getDaemonPid()
    if (running) {
      console.log(`  Workspace 代理已启动 (PID ${pid})`)
      console.log(`  文件目录: ${WORKSPACE_DIR}`)
      console.log(`  监听端口: ${PROXY_PORT} (仅本地)`)
    } else {
      console.warn('  代理启动可能失败，请检查 pac status')
    }
  }

  console.log(`\n  打开控制台: ${cfg.server}`)
  openBrowser(cfg.server)
}

function cmdStop() {
  if (killDaemon()) {
    console.log('  Workspace 代理已停止')
  } else {
    console.log('  代理未在运行')
  }
}

function cmdOpen() {
  const cfg = loadConfig()
  if (!cfg) { console.log('  请先运行: pac login'); return }
  console.log(`  打开: ${cfg.server}`)
  openBrowser(cfg.server)
}

function cmdStatus() {
  const cfg = loadConfig()
  if (!cfg) {
    console.log('  未登录。运行 pac login <服务器地址> 登录。')
    return
  }

  const pid = getDaemonPid()
  console.log(`\n  用户名:  ${cfg.username}`)
  console.log(`  服务器:  ${cfg.server}`)
  console.log(`  Token:   ${cfg.syncToken.slice(0, 8)}...${cfg.syncToken.slice(-4)}`)
  console.log(`  代理:    ${pid ? `运行中 (PID ${pid}, 端口 ${PROXY_PORT})` : '未运行 (pac start 启动)'}`)
  if (pid) {
    console.log(`  目录:    ${WORKSPACE_DIR}`)
  }
  console.log('')
}

function cmdLogout() {
  killDaemon()
  try {
    fs.unlinkSync(CONFIG_FILE)
    console.log('  已退出登录，代理已停止')
  } catch {
    console.log('  未登录')
  }
}

function printHelp() {
  console.log(`
PersonalAC CLI v${VERSION}

用法:
  pac login [server-url]   登录到 PersonalAC 服务器
  pac start                启动本地 Workspace 代理并打开控制台
  pac stop                 停止 Workspace 代理
  pac open                 在浏览器中打开控制台
  pac status               显示当前状态
  pac logout               退出登录（同时停止代理）
  pac version              显示版本号

工作流程:
  1. pac login https://pac.example.com   ← 首次配置
  2. pac start                           ← 每次使用前运行
  3. 在浏览器中使用控制台
  4. pac stop                            ← 使用完毕（可选）

说明:
  Workspace 代理将文件存储在本地 ~/personalac-workspace/
  服务器不保存任何文件，节省服务器磁盘空间。
  代理运行在 127.0.0.1:${PROXY_PORT}，仅本机可访问。
`)
}

// ─────────────────────────────────────────────
// 入口
// ─────────────────────────────────────────────
const [,, cmd, ...args] = process.argv

if (cmd === PROXY_INTERNAL_CMD) {
  runWorkspaceProxy()
} else {
  switch (cmd) {
    case 'login':   cmdLogin(args).catch(e => { console.error(`  错误: ${e.message}`); process.exit(1) }); break
    case 'start':   cmdStart().catch(e => { console.error(`  错误: ${e.message}`); process.exit(1) }); break
    case 'stop':    cmdStop(); break
    case 'open':    cmdOpen(); break
    case 'status':  cmdStatus(); break
    case 'logout':  cmdLogout(); break
    case 'version': console.log(`PersonalAC CLI v${VERSION}`); break
    default:        printHelp()
  }
}
