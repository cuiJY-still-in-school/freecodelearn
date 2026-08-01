import express from 'express'
import cors from 'cors'
import path from 'path'
import rateLimit from 'express-rate-limit'
import { initDatabase, closeDatabase } from './database'
import { AgentEngine } from './agent'
import { ensureMinimaxConfig } from './services/settings.service'
import { probeAndEnableVision } from './services/vision.service'

import './tools/chat-tools' // 注册所有聊天工具

import authRoutes from './routes/auth.routes'
import adminRoutes from './routes/admin.routes'
import oauthRoutes from './routes/oauth.routes'
import settingsRoutes from './routes/settings.routes'
import plansRoutes from './routes/plans.routes'
import agentRoutes from './routes/agent.routes'
import chatRoutes from './routes/chat.routes'
import dataRoutes from './routes/data.routes'
import workspaceRoutes from './routes/workspace.routes'
import goalsRoutes from './routes/goals.routes'
import todoRoutes from './routes/todo.routes'
import relayRoutes from './routes/relay.routes'
import progressRoutes from './routes/progress.routes'
import clientRoutes from './routes/client.routes'
import downloadRoutes from './routes/download.routes'
import notifyRoutes from './routes/notify.routes'
import homeworkRoutes from './routes/homework.routes'
import srsRoutes from './routes/srs.routes'
import reportRoutes from './routes/report.routes'
import radarRoutes from './routes/radar.routes'
import feedbackRoutes from './routes/feedback.routes'
import scoresRoutes from './routes/scores.routes'
import driveRoutes from './routes/drive.routes'
import backupRoutes from './routes/backup.routes'
import redeemRoutes from './routes/redeem.routes'
import chatHistoryRoutes from './routes/chat-history.routes'
import mistakeRoutes from './routes/mistake.routes'

const PORT = Number(process.env.PORT) || 3000
const app = express()

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true }))

// 登录 / 注册：每 IP 每 15 分钟最多 20 次
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }))
app.use('/api/auth/register', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false }))
// OTP 验证：每 IP 每 15 分钟最多 10 次，防暴力枚举 6 位码
app.use('/api/auth/verify-otp', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false }))
app.use('/api/auth/send-otp', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false }))

// 截图上传：每 IP 每分钟最多 5 次
app.use('/api/client/screenshot', rateLimit({ windowMs: 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false }))

// 云盘同步：每 IP 每分钟最多 10 次
app.use('/api/drive/sync', rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false }))

// AI 对话流：每 IP 每分钟最多 20 次
app.use('/api/chat/stream', rateLimit({
  windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: '发送太频繁，请稍等片刻再试' }
}))

// ── CLI 下载（仅服务器模式提供；本地版跳过）────────────────────────────
const cliDir = process.env.CLI_DIR || path.join(__dirname, '../cli')
const cliEnabled = require('fs').existsSync(path.join(cliDir, 'pac.js'))

if (cliEnabled) {
  app.get('/cli/pac.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript')
    res.setHeader('Content-Disposition', 'attachment; filename="pac.js"')
    res.sendFile(path.join(cliDir, 'pac.js'), (err) => {
      if (err) res.status(404).send('CLI file not found')
    })
  })
}

if (cliEnabled) {
  app.get('/cli/install.sh', (req, res) => {
    const serverUrl = `${req.protocol}://${req.get('host')}`
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.send(`#!/bin/sh
# PersonalAC CLI 一键安装
# 使用: curl -fsSL ${serverUrl}/cli/install.sh | sh
set -e

BIN_DIR="\${HOME}/.local/bin"
BIN="\${BIN_DIR}/pac"

if ! command -v node >/dev/null 2>&1; then
  echo "错误: 需要 Node.js 18+，请先安装 Node.js" >&2
  exit 1
fi

mkdir -p "\${BIN_DIR}"
echo "==> 下载 PersonalAC CLI..."
curl -fsSL "${serverUrl}/cli/pac.js" -o "\${BIN}"
chmod +x "\${BIN}"

echo "==> 安装完成: \${BIN}"
echo ""

# 提示加入 PATH（如果 ~/.local/bin 不在 PATH 里）
case ":\${PATH}:" in
  *":\${BIN_DIR}:"*) ;;
  *)
    echo "提示: 将以下内容加入 ~/.bashrc 或 ~/.zshrc:"
    echo "  export PATH=\"\\\$HOME/.local/bin:\\\$PATH\""
    echo ""
  ;;
esac

echo "下一步:"
echo "  pac login ${serverUrl}"
`)
  })
}

// 静态前端（生产环境）— FRONTEND_DIST 环境变量允许本地 npm 包覆盖路径
const frontendDist = process.env.FRONTEND_DIST || path.join(__dirname, '../../frontend/dist')
// cacheControl:false 禁止 send 模块自动覆写 Cache-Control，由 setHeaders 统一控制
app.use(express.static(frontendDist, {
  cacheControl: false,
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      // 入口文件永不缓存：每次都拿最新，确保新 bundle hash 能被加载
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    } else if (/\.[a-f0-9]{6,}\.(js|css)$/.test(filePath)) {
      // Vite 带 hash 的 chunk：内容不变则 hash 不变，可永久缓存
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    } else {
      // 字体/图片等静态资源：缓存 7 天
      res.setHeader('Cache-Control', 'public, max-age=604800')
    }
  }
}))

// API 路由
app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/oauth', oauthRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/plans', plansRoutes)
app.use('/api/agent', agentRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/data', dataRoutes)
app.use('/api/workspace', workspaceRoutes)
app.use('/api/goals', goalsRoutes)
app.use('/api/todo', todoRoutes)
app.use('/api/relay', relayRoutes)
app.use('/api/progress', progressRoutes)
app.use('/api/client', clientRoutes)
app.use('/api/notify', notifyRoutes)
app.use('/api/homework', homeworkRoutes)
app.use('/api/srs', srsRoutes)
app.use('/api/report', reportRoutes)
app.use('/download', downloadRoutes)
app.use('/api/radar', radarRoutes)
app.use('/api/feedback', feedbackRoutes)
app.use('/api/scores', scoresRoutes)
app.use('/api/redeem', redeemRoutes)
app.use('/api/drive', driveRoutes)
app.use('/api/backup', backupRoutes)
app.use('/api/chat-history', chatHistoryRoutes)
app.use('/api/mistakes', mistakeRoutes)

// ── /api/health：服务状态一览（无需鉴权，监控/客户端诊断用）────────────────
app.get('/api/health', async (_req, res) => {
  const { getAIConfig } = await import('./services/settings.service')
  const { probeAndEnableVision } = await import('./services/vision.service')
  const { getDB } = await import('./database')

  let dbOk = false
  try { getDB().prepare('SELECT 1').get(); dbOk = true } catch { /* ignore */ }

  const aiCfg = getAIConfig().data as { provider?: string; modelId?: string; apiKey?: string } | undefined
  const aiConfigured = !!(aiCfg?.apiKey && aiCfg?.modelId)

  const visionProbe = await probeAndEnableVision().catch(() => ({ ok: false, reason: 'probe threw' }))

  res.json({
    ok: dbOk && aiConfigured,
    db: dbOk,
    ai: { configured: aiConfigured, provider: aiCfg?.provider, model: aiCfg?.modelId },
    vision: visionProbe,
    uptime: Math.floor(process.uptime()),
    ts: Date.now(),
  })
})

// 前端 SPA fallback
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) res.status(404).send('Frontend not built. Run: cd frontend && npm run build')
  })
})

async function start(): Promise<void> {
  // 初始化数据库
  initDatabase()

  // 确保 MiniMax 配置存在
  ensureMinimaxConfig()

  // 启动时探测视觉模型是否就绪（异步、非阻塞）
  probeAndEnableVision().then(({ ok, reason }) => {
    console.log(`[Vision] probe: ${ok ? '✓' : '✗'} ${reason}`)
  }).catch(err => console.warn('[Vision] probe error:', err))

  console.log(`\n====================================`)
  console.log(`  PersonalAC v1.5`)
  console.log(`  http://localhost:${PORT}`)
  console.log(`====================================\n`)

  // 启动 Agent
  const engine = new AgentEngine()
  engine.init()

  const server = app.listen(PORT, () => {
    console.log(`[Server] Listening on port ${PORT}`)
  })
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[错误] 端口 ${PORT} 已被占用。`)
      console.error(`  PersonalAC 可能已在运行，请访问 http://localhost:${PORT}`)
      console.error(`  若要停止旧实例，运行: pkill -f personalac\n`)
    } else {
      console.error('[Server] 启动失败:', err.message)
    }
    process.exit(1)
  })

  // 优雅关闭
  const shutdown = (): void => {
    engine.scheduler.destroy()
    closeDatabase()
    process.exit(0)
  }
  process.on('SIGINT', () => { console.log('\n[Server] Shutting down...'); shutdown() })
  process.on('SIGTERM', shutdown)
}

start().catch((err) => {
  console.error('[Server] Failed to start:', err)
  process.exit(1)
})
