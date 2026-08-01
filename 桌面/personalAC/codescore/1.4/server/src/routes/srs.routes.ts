import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { getDueItems, getDueCount, recordReview } from '../services/srs.service'
import { getPrimaryStudentId } from '../services/auth.service'
import { getDB } from '../database'
import { v4 as uuidv4 } from 'uuid'

const router = Router()
router.use(requireAuth)

function getStudentId(req: AuthRequest): string {
  const db = getDB()
  const user = db.prepare('SELECT role FROM User WHERE id = ? AND delete_flag = 0').get(req.userId!) as { role: string } | undefined
  return user?.role === 'student' ? req.userId! : (getPrimaryStudentId(req.userId!) ?? req.userId!)
}

// GET /api/srs/due — 获取今日待复习项目
router.get('/due', (req: AuthRequest, res) => {
  const studentId = getStudentId(req)
  res.json({ success: true, data: getDueItems(studentId) })
})

// GET /api/srs/count — 获取待复习数量（用于 badge）
router.get('/count', (req: AuthRequest, res) => {
  const studentId = getStudentId(req)
  res.json({ success: true, data: { count: getDueCount(studentId) } })
})

// POST /api/srs/:id/review — 提交复习结果
router.post('/:id/review', (req: AuthRequest, res) => {
  const { grade } = req.body as { grade: number }
  if (grade === undefined || grade < 0 || grade > 5) {
    res.status(400).json({ success: false, error: 'grade 需在 0-5 之间' }); return
  }
  const studentId = getStudentId(req)
  try {
    const result = recordReview(req.params.id, Math.round(grade), studentId)
    res.json({ success: true, data: result })
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : '更新失败' })
  }
})

// POST /api/srs/create — 从对话手动创建复习卡片
router.post('/create', (req: AuthRequest, res) => {
  const { topic, subject } = req.body as { topic?: string; subject?: string }
  if (!topic?.trim()) { res.status(400).json({ success: false, error: '请填写知识点名称' }); return }
  const studentId = getStudentId(req)
  const db = getDB()
  const now = Date.now()

  // Check if this topic already exists for student
  const existing = db.prepare(
    `SELECT id FROM KnowledgePoint WHERE student_id = ? AND topic = ? AND delete_flag = 0 LIMIT 1`
  ).get(studentId, topic.trim()) as { id: string } | undefined

  if (existing) {
    // Reset SRS so it's due now
    db.prepare(
      `UPDATE KnowledgePoint SET srs_due_at = ?, srs_reps = 0, update_time = ? WHERE id = ?`
    ).run(now, now, existing.id)
    res.json({ success: true, data: { id: existing.id, existing: true } })
    return
  }

  const id = uuidv4()
  db.prepare(`
    INSERT INTO KnowledgePoint
      (id, student_id, subject, topic, weakness_score, attempt_count, confidence, data_source,
       srs_interval, srs_ease, srs_reps, srs_due_at, create_time, update_time, delete_flag)
    VALUES (?, ?, ?, ?, 0.5, 0, 0.5, 'manual', 1, 2.5, 0, ?, ?, ?, 0)
  `).run(id, studentId, (subject || '通用').trim(), topic.trim(), now, now, now)

  res.json({ success: true, data: { id, existing: false } })
})

export default router
