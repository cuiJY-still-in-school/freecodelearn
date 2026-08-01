import fs from 'fs'
import path from 'path'
import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { getDB } from '../database'
import { getBlackRoomState } from '../services/blackroom.service'

const router = Router()
const SCREENSHOT_DIR = path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'screenshots')
const SCREENSHOT_KEEP = 120  // per student

// ── GET /api/client/config ────────────────────────────────────────────────
// 学生端调用：拉取客户端配置 + 当前模式
router.get('/config', requireAuth, (req: AuthRequest, res) => {
  const db = getDB()
  const userId = req.userId!

  const user = db.prepare(
    `SELECT id, display_name, role, guardian_id FROM User WHERE id = ? AND delete_flag = 0`
  ).get(userId) as { id: string; display_name: string; role: string; guardian_id: string | null } | undefined

  if (!user) { res.status(404).json({ success: false, error: '用户不存在' }); return }

  // 拉取家长为该学生设置的客户端配置
  const configKey = `client_config_${userId}`
  const row = db.prepare(`SELECT value FROM Settings WHERE key = ? AND delete_flag = 0`).get(configKey) as { value: string } | undefined
  const clientCfg = row ? (JSON.parse(row.value) as { blocked_apps?: string[]; must_do_lock?: boolean; screenshot_interval_min?: number }) : {}

  // 判断是否有未完成的 must_do 任务
  const now = Date.now()
  const mustDoTodos = db.prepare(
    `SELECT id, status FROM Todo WHERE student_id = ? AND must_do = 1 AND delete_flag = 0`
  ).all(userId) as Array<{ id: string; status: string }>

  const pendingMustDo = mustDoTodos.filter(t => t.status !== 'done')
  const mode = (clientCfg.must_do_lock !== false && pendingMustDo.length > 0) ? 'locked' : 'pet'

  const focusModeState = getBlackRoomState(userId)

  res.json({
    success: true,
    data: {
      student_id: user.id,
      student_name: user.display_name,
      blocked_apps: clientCfg.blocked_apps ?? [],
      must_do_lock: clientCfg.must_do_lock ?? true,
      screenshot_interval_min: clientCfg.screenshot_interval_min ?? 10,
      mode,
      must_do_total: mustDoTodos.length,
      must_do_done: mustDoTodos.length - pendingMustDo.length,
      focus_mode: !!focusModeState,
    }
  })
})

// ── GET /api/client/config-admin/:studentId ───────────────────────────────
// 家长读取已保存的客户端配置
router.get('/config-admin/:studentId', requireAuth, (req: AuthRequest, res) => {
  const db = getDB()
  const guardianId = req.userId!
  const { studentId } = req.params

  const student = db.prepare(
    `SELECT id FROM User WHERE id = ? AND guardian_id = ? AND role = 'student' AND delete_flag = 0`
  ).get(studentId, guardianId) as { id: string } | undefined
  if (!student) { res.status(403).json({ success: false, error: '无权限或学生不存在' }); return }

  const row = db.prepare(`SELECT value FROM Settings WHERE key = ? AND delete_flag = 0`)
    .get(`client_config_${studentId}`) as { value: string } | undefined
  const data = row ? JSON.parse(row.value) : { blocked_apps: [], must_do_lock: true }
  res.json({ success: true, data })
})

// ── PUT /api/client/config/:studentId ────────────────────────────────────
// 家长调用：设置学生的客户端配置
router.put('/config/:studentId', requireAuth, (req: AuthRequest, res) => {
  const db = getDB()
  const guardianId = req.userId!
  const { studentId } = req.params

  const student = db.prepare(
    `SELECT id FROM User WHERE id = ? AND guardian_id = ? AND role = 'student' AND delete_flag = 0`
  ).get(studentId, guardianId) as { id: string } | undefined
  if (!student) { res.status(403).json({ success: false, error: '无权限或学生不存在' }); return }

  const { blocked_apps, must_do_lock, screenshot_interval_min } = req.body as {
    blocked_apps?: string[]; must_do_lock?: boolean; screenshot_interval_min?: number
  }
  const intervalMin = Math.max(2, Math.min(60, Number(screenshot_interval_min) || 10))
  const value = JSON.stringify({
    blocked_apps: Array.isArray(blocked_apps) ? blocked_apps : [],
    must_do_lock: must_do_lock !== false,
    screenshot_interval_min: intervalMin,
  })

  const configKey = `client_config_${studentId}`
  const now = Date.now()
  db.prepare(`
    INSERT INTO Settings (id, key, value, encrypted, create_time, update_time, delete_flag)
    VALUES (?, ?, ?, 0, ?, ?, 0)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, update_time = excluded.update_time
  `).run(require('uuid').v4(), configKey, value, now, now)

  res.json({ success: true })
})

// ── POST /api/client/activity ─────────────────────────────────────────────
// 学生端上报行为记录
router.post('/activity', requireAuth, (req: AuthRequest, res) => {
  const db = getDB()
  const userId = req.userId!
  const records = req.body.records as Array<{
    app_name: string; window_title: string; duration_seconds: number; timestamp: number
  }>

  if (!Array.isArray(records) || records.length === 0) {
    res.status(400).json({ success: false, error: 'records 不能为空' }); return
  }

  const insert = db.prepare(`
    INSERT INTO ClientActivity (id, student_id, app_name, window_title, duration_seconds, recorded_at, create_time)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const insertMany = db.transaction((rows: typeof records) => {
    for (const r of rows) {
      insert.run(require('uuid').v4(), userId, r.app_name, r.window_title ?? '', r.duration_seconds ?? 0, r.timestamp ?? Date.now(), Date.now())
    }
  })
  insertMany(records)

  res.json({ success: true })
})

// ── GET /api/client/activity/:studentId ──────────────────────────────────
// 家长或学生本人查看行为报告
router.get('/activity/:studentId', requireAuth, (req: AuthRequest, res) => {
  const db = getDB()
  const guardianId = req.userId!
  const { studentId } = req.params
  const { dateFrom, dateTo } = req.query

  const isSelf = req.userRole === 'student' && req.userId === studentId
  const student = isSelf
    ? db.prepare(`SELECT id FROM User WHERE id = ? AND role = 'student' AND delete_flag = 0`).get(studentId) as { id: string } | undefined
    : db.prepare(`SELECT id FROM User WHERE id = ? AND guardian_id = ? AND role = 'student' AND delete_flag = 0`).get(studentId, guardianId) as { id: string } | undefined
  if (!student) { res.status(403).json({ success: false, error: '无权限或学生不存在' }); return }

  const from = dateFrom ? Number(dateFrom) : Date.now() - 7 * 86400_000
  const to = dateTo ? Number(dateTo) : Date.now()

  const rows = db.prepare(`
    SELECT app_name, window_title, duration_seconds, recorded_at
    FROM ClientActivity
    WHERE student_id = ? AND recorded_at BETWEEN ? AND ?
    ORDER BY recorded_at DESC
    LIMIT 500
  `).all(studentId, from, to)

  res.json({ success: true, data: rows })
})

// ── POST /api/client/screenshot ──────────────────────────────────────────
// 学生端上传截图（base64 JPEG）
router.post('/screenshot', requireAuth, (req: AuthRequest, res) => {
  const studentId = req.userId!
  const { data } = req.body as { data: string }
  if (!data || typeof data !== 'string') { res.status(400).json({ success: false, error: 'data required' }); return }

  const dir = path.join(SCREENSHOT_DIR, studentId)
  fs.mkdirSync(dir, { recursive: true })

  const filename = `${Date.now()}.jpg`
  fs.writeFileSync(path.join(dir, filename), Buffer.from(data, 'base64'))

  // Prune old files
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort()
    for (const f of files.slice(0, Math.max(0, files.length - SCREENSHOT_KEEP))) {
      fs.unlinkSync(path.join(dir, f))
    }
  } catch { /* ignore prune errors */ }

  res.json({ success: true })
})

// ── GET /api/client/screenshots/:studentId ────────────────────────────────
// 监护人查看截图列表（最新 N 张）
router.get('/screenshots/:studentId', requireAuth, (req: AuthRequest, res) => {
  const db = getDB()
  const guardianId = req.userId!
  const { studentId } = req.params
  const limit = Math.min(Number(req.query.limit) || 24, 60)

  const isSelf = req.userRole === 'student' && req.userId === studentId
  const student = isSelf
    ? db.prepare(`SELECT id FROM User WHERE id = ? AND role = 'student' AND delete_flag = 0`).get(studentId)
    : db.prepare(`SELECT id FROM User WHERE id = ? AND guardian_id = ? AND role = 'student' AND delete_flag = 0`).get(studentId, guardianId)
  if (!student) { res.status(403).json({ success: false, error: '无权限' }); return }

  const dir = path.join(SCREENSHOT_DIR, studentId)
  if (!fs.existsSync(dir)) { res.json({ success: true, data: [] }); return }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort().reverse().slice(0, limit)
  const data = files.map(f => ({
    timestamp: parseInt(f),
    url: `/api/client/screenshot-image/${studentId}/${f}`,
  }))
  res.json({ success: true, data })
})

// ── GET /api/client/screenshot-image/:studentId/:filename ─────────────────
router.get('/screenshot-image/:studentId/:filename', requireAuth, (req: AuthRequest, res) => {
  const db = getDB()
  const guardianId = req.userId!
  const { studentId, filename } = req.params

  const isSelf = req.userRole === 'student' && req.userId === studentId
  const student = isSelf
    ? db.prepare(`SELECT id FROM User WHERE id = ? AND role = 'student' AND delete_flag = 0`).get(studentId)
    : db.prepare(`SELECT id FROM User WHERE id = ? AND guardian_id = ? AND role = 'student' AND delete_flag = 0`).get(studentId, guardianId)
  if (!student) { res.status(403).end(); return }

  // sanitize filename
  if (!/^\d+\.jpg$/.test(filename)) { res.status(400).end(); return }
  const filepath = path.join(SCREENSHOT_DIR, studentId, filename)
  if (!fs.existsSync(filepath)) { res.status(404).end(); return }
  res.setHeader('Content-Type', 'image/jpeg')
  res.setHeader('Cache-Control', 'private, max-age=86400')
  res.sendFile(path.resolve(filepath))
})

// ── POST /api/client/guardian-verify ─────────────────────────────────────
// 学生端调用：验证监护人密码（用于退出客户端时的身份确认）
router.post('/guardian-verify', requireAuth, (req: AuthRequest, res) => {
  const db = getDB()
  const studentId = req.userId!
  const { email, password } = req.body as { email: string; password: string }
  if (!email?.trim() || !password) { res.json({ success: false, error: '请填写邮箱和密码' }); return }

  const student = db.prepare(
    `SELECT guardian_id FROM User WHERE id = ? AND role = 'student' AND delete_flag = 0`
  ).get(studentId) as { guardian_id: string | null } | undefined
  if (!student?.guardian_id) { res.json({ success: false, error: '找不到监护人' }); return }

  const guardian = db.prepare(
    `SELECT email, password_hash FROM User WHERE id = ? AND delete_flag = 0`
  ).get(student.guardian_id) as { email: string; password_hash: string | null } | undefined
  if (!guardian?.password_hash) { res.json({ success: false, error: '监护人未设置密码' }); return }

  if (guardian.email.toLowerCase() !== email.toLowerCase().trim()) {
    res.json({ success: false, error: '邮箱或密码错误' }); return
  }

  const bcrypt = require('bcryptjs')
  const ok = bcrypt.compareSync(password, guardian.password_hash)
  res.json({ success: ok, error: ok ? undefined : '邮箱或密码错误' })
})

export default router
