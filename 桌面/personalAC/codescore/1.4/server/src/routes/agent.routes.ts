import { Router } from 'express'
import { getAgentEngine } from '../agent'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { getDB } from '../database'
import { getPrimaryStudentId } from '../services/auth.service'

const router = Router()
router.use(requireAuth)

function canAccessStudent(req: AuthRequest, studentId: string): boolean {
  if (req.userRole === 'student') return req.userId === studentId
  const db = getDB()
  const linked = db.prepare('SELECT id FROM User WHERE id = ? AND guardian_id = ? AND delete_flag = 0').get(studentId, req.userId!) as { id: string } | undefined
  return !!linked
}

// 解析请求方的有效学生 ID（学生本人 / 监护人主学生）
function resolveStudentId(req: AuthRequest): string {
  if (req.userRole === 'student') return req.userId!
  return getPrimaryStudentId(req.userId!) ?? req.userId!
}

router.get('/logs', (req: AuthRequest, res) => {
  try {
    const limit = Number(req.query.limit) || 50
    const studentId = resolveStudentId(req)
    const db = getDB()
    const logs = db.prepare(`
      SELECT id, student_id, action_type, action_detail, trigger_type, model_used, status, error_message, create_time
      FROM AgentLog
      WHERE student_id = ? AND delete_flag = 0
      ORDER BY create_time DESC LIMIT ?
    `).all(studentId, limit)
    res.json({ success: true, data: logs })
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

router.get('/tasks', (req: AuthRequest, res) => {
  try {
    const { status, page = '1', pageSize = '20' } = req.query as Record<string, string>
    const studentId = resolveStudentId(req)
    const db = getDB()
    const offset = (Number(page) - 1) * Number(pageSize)
    const ALLOWED_STATUS = ['pending', 'running', 'completed', 'failed']
    const safeStatus = status && ALLOWED_STATUS.includes(status) ? status : null

    const whereStatus = safeStatus ? 'AND status = ?' : ''
    const params: unknown[] = safeStatus
      ? [studentId, safeStatus, Number(pageSize), offset]
      : [studentId, Number(pageSize), offset]
    const countParams: unknown[] = safeStatus ? [studentId, safeStatus] : [studentId]

    const tasks = db.prepare(`
      SELECT id, task_type, student_id, status, trigger_type, input_summary, output, error, started_at, completed_at, create_time
      FROM AgentTask
      WHERE student_id = ? AND delete_flag = 0 ${whereStatus}
      ORDER BY create_time DESC LIMIT ? OFFSET ?
    `).all(...params)

    const { total } = db.prepare(`
      SELECT COUNT(*) AS total FROM AgentTask
      WHERE student_id = ? AND delete_flag = 0 ${whereStatus}
    `).get(...countParams) as { total: number }

    res.json({ success: true, data: { tasks, total, page: Number(page), pageSize: Number(pageSize) } })
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

router.post('/run', async (req: AuthRequest, res) => {
  const engine = getAgentEngine()
  if (!engine) { res.json({ success: false, error: 'Agent 引擎未初始化' }); return }
  try {
    await engine.runAutonomousCycle(resolveStudentId(req))
    res.json({ success: true, data: { message: 'Agent 周期执行完毕' } })
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

router.post('/report', async (req: AuthRequest, res) => {
  const engine = getAgentEngine()
  if (!engine) { res.json({ success: false, error: 'Agent 引擎未初始化' }); return }
  try {
    await engine.generateDailyReview(resolveStudentId(req))
    res.json({ success: true, data: { message: '日报已生成' } })
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

router.post('/dnd', (req: AuthRequest, res) => {
  const engine = getAgentEngine()
  if (!engine) { res.json({ success: false, error: 'Agent 未初始化' }); return }
  const { start, end } = req.body
  engine.setDoNotDisturb(start, end)
  res.json({ success: true, data: { message: '勿扰模式已设置' } })
})

router.delete('/dnd', (req: AuthRequest, res) => {
  const engine = getAgentEngine()
  if (!engine) { res.json({ success: false, error: 'Agent 未初始化' }); return }
  engine.clearDoNotDisturb()
  res.json({ success: true, data: { message: '勿扰模式已清除' } })
})

// 1.4 心跳接口：手动触发 Agent 思考扫描
router.post('/heartbeat', async (_req: AuthRequest, res) => {
  const engine = getAgentEngine()
  if (!engine) { res.json({ success: false, error: 'Agent 未初始化' }); return }
  try {
    const result = await engine.triggerHeartbeat()
    res.json({ success: true, data: result })
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

// GET /api/agent/digest — 获取最新监护人简报
router.get('/digest', (req: AuthRequest, res) => {
  const db = getDB()
  const studentId = (req.query.student_id as string) || req.userId!
  if (!canAccessStudent(req, studentId)) { res.status(403).json({ success: false, error: 'forbidden' }); return }
  const row = db.prepare(`
    SELECT action_detail, create_time FROM AgentLog
    WHERE student_id=? AND action_type='guardian_digest' AND status='success' AND delete_flag=0
    ORDER BY create_time DESC LIMIT 1
  `).get(studentId) as { action_detail: string; create_time: number } | undefined

  if (!row) { res.json({ success: true, data: null }); return }

  try {
    const parsed = JSON.parse(row.action_detail)
    res.json({ success: true, data: { ...parsed, create_time: row.create_time } })
  } catch {
    res.json({ success: true, data: { digest: row.action_detail, create_time: row.create_time } })
  }
})

// POST /api/agent/digest — 手动触发简报生成
router.post('/digest', async (req: AuthRequest, res) => {
  const engine = getAgentEngine()
  if (!engine) { res.json({ success: false, error: 'Agent 未初始化' }); return }
  const studentId = (req.body.student_id as string) || req.userId!
  if (!canAccessStudent(req, studentId)) { res.status(403).json({ success: false, error: 'forbidden' }); return }
  try {
    await engine.generateGuardianDigest(studentId)
    res.json({ success: true, data: { message: '简报已生成' } })
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

// 1.4 获取 Agent 思考记录
router.get('/thoughts', (req: AuthRequest, res) => {
  const { listThoughts } = require('../services/thought.service')
  const limit = Number(req.query.limit) || 20
  const studentId = (req.query.student_id as string) || req.userId!
  if (!canAccessStudent(req, studentId)) { res.status(403).json({ success: false, error: 'forbidden' }); return }
  const thoughts = listThoughts(studentId, limit)
  res.json({ success: true, data: thoughts })
})

// 特别辅导模式（小黑屋）— 监护人手动进出，UI 标注为"特别辅导模式"
router.post('/focus-mode', async (req: AuthRequest, res) => {
  const { studentId, action, reason } = req.body as { studentId?: string; action: 'enter' | 'exit'; reason?: string }
  const db = getDB()
  const userId = req.userId!
  const targetStudentId = studentId || userId
  // 验证监护人有权限操作此学生
  const student = db.prepare(
    `SELECT id FROM User WHERE id = ? AND (guardian_id = ? OR id = ?) AND delete_flag = 0`
  ).get(targetStudentId, userId, userId) as { id: string } | undefined
  if (!student) { res.status(403).json({ success: false, error: '无权限' }); return }
  try {
    const { enterBlackRoom, exitBlackRoom } = await import('../services/blackroom.service')
    if (action === 'enter') {
      const id = enterBlackRoom(targetStudentId, reason || '监护人手动启动特别辅导', 'guardian')
      res.json({ success: true, data: { id } })
    } else {
      const ok = exitBlackRoom(targetStudentId)
      res.json({ success: ok, data: { exited: ok } })
    }
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

// 查询特别辅导模式状态
router.get('/focus-mode', async (req: AuthRequest, res) => {
  const studentId = (req.query.student_id as string) || req.userId!
  if (!canAccessStudent(req, studentId)) { res.status(403).json({ success: false, error: 'forbidden' }); return }
  try {
    const { getBlackRoomState } = await import('../services/blackroom.service')
    const state = getBlackRoomState(studentId)
    res.json({ success: true, data: state ? { active: true, reason: state.triggered_by === 'guardian' ? '家长启动' : '自动检测', days: Math.floor((Date.now() - state.entered_at) / 86400000) } : { active: false } })
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

export default router
