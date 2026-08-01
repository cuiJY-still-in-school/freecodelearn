import express from 'express'
import cors from 'cors'
import path from 'path'
import rateLimit from 'express-rate-limit'
import { initDatabase, closeDatabase } from './database'
import { ensureAdminAccount } from './services/auth.service'
import { initScheduler, destroyScheduler } from './agent/scheduler'

// ── 加载工具注册（模块副作用） ──────────────────────
import './tools/board-tools'

// ── 路由导入 ──────────────────────────────────────
import authRoutes from './routes/auth.routes'
import boardRoutes from './routes/board.routes'
import companionRoutes from './routes/companion.routes'
import homeworkRoutes from './routes/homework.routes'
import guardianRoutes from './routes/guardian.routes'
import chatRoutes from './routes/chat.routes'
import settingsRoutes from './routes/settings.routes'
import healthRoutes from './routes/health.routes'

const PORT = Number(process.env.PORT) || 3000
const app = express()

// ── 中间件 ────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true }))

// 速率限制
app.use('/api/chat/stream', rateLimit({
  windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: '发送太频繁，请稍等片刻再试' }
}))
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }))

// ── 路由挂载 ──────────────────────────────────────
app.use('/api/auth', authRoutes)
app.use('/api/board', boardRoutes)
app.use('/api/companion', companionRoutes)
app.use('/api/homework', homeworkRoutes)
app.use('/api/guardian', guardianRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api', healthRoutes)

// ── 静态文件（生产模式） ────────────────────────────
const frontendDist = process.env.FRONTEND_DIST || path.join(__dirname, '../../frontend/dist')
const fs = require('fs')
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'))
  })
}

// ── 启动 ──────────────────────────────────────────
async function start() {
  console.log('┌──────────────────────────────────────┐')
  console.log('│  PersonalAC 2.0 — AI 学伴 + 白板     │')
  console.log('│  Starting up...                      │')
  console.log('└──────────────────────────────────────┘')

  // 初始化数据库
  initDatabase()
  console.log('  ✓ SQLite initialized (WAL mode, FK ON, 20 tables)')

  // 初始化调度器
  initScheduler()

  // 确保管理员账户
  const { syncToken } = ensureAdminAccount()
  console.log(`  ✓ Admin account ready`)

  // 启动 HTTP
  app.listen(PORT, () => {
    console.log('┌──────────────────────────────────────┐')
    console.log(`│  PersonalAC 2.0                      │`)
    console.log(`│  http://localhost:${PORT}               │`)
    console.log(`│  Sync Token: ${syncToken.slice(0, 8)}... │`)
    console.log('└──────────────────────────────────────┘')
  })

  // 优雅关闭
  const shutdown = () => {
    console.log('\n  Shutting down...')
    destroyScheduler()
    closeDatabase()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

start().catch(err => {
  console.error('Failed to start:', err)
  process.exit(1)
})
