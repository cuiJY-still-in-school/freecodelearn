import express from 'express'
import cors from 'cors'
import path from 'path'
import { initDatabase, closeDatabase } from './database'
import { ensureAdminAccount } from './services/auth.service'
import { AgentEngine } from './agent'
import { emailService } from './services/email.service'
import { getRawEmailConfig } from './services/settings.service'

import './tools/chat-tools' // 注册所有聊天工具

import authRoutes from './routes/auth.routes'
import settingsRoutes from './routes/settings.routes'
import plansRoutes from './routes/plans.routes'
import agentRoutes from './routes/agent.routes'
import emailRoutes from './routes/email.routes'
import chatRoutes from './routes/chat.routes'
import dataRoutes from './routes/data.routes'
import workspaceRoutes from './routes/workspace.routes'
import goalsRoutes from './routes/goals.routes'

const PORT = Number(process.env.PORT) || 3000
const app = express()

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true }))

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
app.use(express.static(frontendDist))

// API 路由
app.use('/api/auth', authRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/plans', plansRoutes)
app.use('/api/agent', agentRoutes)
app.use('/api/email', emailRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/data', dataRoutes)
app.use('/api/workspace', workspaceRoutes)
app.use('/api/goals', goalsRoutes)

// 前端 SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) res.status(404).send('Frontend not built. Run: cd frontend && npm run build')
  })
})

async function start(): Promise<void> {
  // 初始化数据库
  initDatabase()

  const { syncToken } = ensureAdminAccount()
  console.log(`\n====================================`)
  console.log(`  PersonalAC v1.3`)
  console.log(`  http://localhost:${PORT}`)
  console.log(`  Sync Token: ${syncToken}`)
  console.log(`====================================\n`)

  // 启动 Agent
  const engine = new AgentEngine()
  engine.init()

  // 恢复邮件轮询
  const emailConfig = getRawEmailConfig()
  if (emailConfig) {
    try { emailService.startPolling() } catch (err) {
      console.warn('[Email] Auto-start polling failed:', err)
    }
  }

  app.listen(PORT, () => {
    console.log(`[Server] Listening on port ${PORT}`)
  })

  // 优雅关闭
  const shutdown = (): void => {
    emailService.stopPolling()
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
