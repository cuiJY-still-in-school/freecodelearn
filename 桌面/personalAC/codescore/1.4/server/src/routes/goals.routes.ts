import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { getPrimaryStudentId } from '../services/auth.service'

const router = Router()
router.use(requireAuth)

function resolveStudentId(userId: string): string {
  const db = getDB()
  const user = db.prepare('SELECT role FROM User WHERE id=? AND delete_flag=0').get(userId) as { role: string } | undefined
  if (user?.role === 'guardian') return getPrimaryStudentId(userId) ?? userId
  return userId
}

// GET /api/goals — 获取当前学生目标
router.get('/', (req: AuthRequest, res) => {
  const studentId = resolveStudentId(req.userId!)
  const db = getDB()
  const goal = db.prepare(
    `SELECT * FROM StudentGoal WHERE student_id=? AND delete_flag=0 ORDER BY update_time DESC LIMIT 1`
  ).get(studentId) as Record<string, unknown> | undefined
  res.json({ success: true, data: goal ?? null })
})

// POST /api/goals — 创建或更新目标
router.post('/', (req: AuthRequest, res) => {
  const { examType, examDate, schoolProgress, guardianNotes } = req.body as {
    examType?: string; examDate?: number; schoolProgress?: string; guardianNotes?: string
  }
  const studentId = resolveStudentId(req.userId!)
  const db = getDB()
  const now = Date.now()

  const existing = db.prepare(
    `SELECT id FROM StudentGoal WHERE student_id=? AND delete_flag=0 ORDER BY update_time DESC LIMIT 1`
  ).get(studentId) as { id: string } | undefined

  if (existing) {
    db.prepare(`
      UPDATE StudentGoal SET exam_type=?, exam_date=?, school_progress=?, guardian_notes=?, update_time=? WHERE id=?
    `).run(examType ?? null, examDate ?? null, schoolProgress ?? null, guardianNotes ?? null, now, existing.id)
  } else {
    db.prepare(`
      INSERT INTO StudentGoal (id, student_id, exam_type, exam_date, school_progress, guardian_notes, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(uuidv4(), studentId, examType ?? null, examDate ?? null, schoolProgress ?? null, guardianNotes ?? null, now, now)
  }

  res.json({ success: true })
})

export default router
