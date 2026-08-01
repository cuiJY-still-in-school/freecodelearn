import { Router } from 'express'
import { getAgentEngine } from '../agent'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { getDB } from '../database'

const router = Router()
router.use(requireAuth)

router.get('/logs', (req: AuthRequest, res) => {
  try {
    const limit = Number(req.query.limit) || 50
    const db = getDB()
    const logs = db.prepare(`
      SELECT id, student_id, action_type, action_detail, trigger_type, model_used, status, error_message, create_time
      FROM AgentLog
      WHERE student_id = ? AND delete_flag = 0
      ORDER BY create_time DESC LIMIT ?
    `).all(req.userId, limit)
    res.json({ success: true, data: logs })
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

router.get('/tasks', (req: AuthRequest, res) => {
  try {
    const { status, page = '1', pageSize = '20' } = req.query as Record<string, string>
    const db = getDB()
    const offset = (Number(page) - 1) * Number(pageSize)
    const ALLOWED_STATUS = ['pending', 'running', 'completed', 'failed']
    const safeStatus = status && ALLOWED_STATUS.includes(status) ? status : null

    const whereStatus = safeStatus ? 'AND status = ?' : ''
    const params: unknown[] = safeStatus
      ? [req.userId, safeStatus, Number(pageSize), offset]
      : [req.userId, Number(pageSize), offset]
    const countParams: unknown[] = safeStatus ? [req.userId, safeStatus] : [req.userId]

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
    await engine.runAutonomousCycle(req.userId!)
    res.json({ success: true, data: { message: 'Agent 周期执行完毕' } })
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

router.post('/report', async (req: AuthRequest, res) => {
  const engine = getAgentEngine()
  if (!engine) { res.json({ success: false, error: 'Agent 引擎未初始化' }); return }
  try {
    await engine.generateDailyReview(req.userId!)
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

export default router
