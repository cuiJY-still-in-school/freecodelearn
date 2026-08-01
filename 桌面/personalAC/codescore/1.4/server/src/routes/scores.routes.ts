import { Router } from 'express'
import { getDB } from '../database'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { getPrimaryStudentId } from '../services/auth.service'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

function canAccessStudent(req: AuthRequest, studentId: string): boolean {
  if (req.userRole === 'student') return req.userId === studentId
  // guardian: must be linked to this student
  const db = getDB()
  const linked = db.prepare(
    `SELECT id FROM User WHERE id = ? AND guardian_id = ? AND delete_flag = 0`
  ).get(studentId, req.userId!) as { id: string } | undefined
  return !!linked
}

// GET /api/scores/:studentId
router.get('/:studentId', requireAuth, (req: AuthRequest, res) => {
  const { studentId } = req.params
  if (!canAccessStudent(req, studentId)) {
    res.status(403).json({ success: false, error: 'forbidden' }); return
  }
  const db = getDB()
  const rows = db.prepare(
    `SELECT id, subject, exam_name, score, full_score, exam_date, create_time
     FROM ExamScore WHERE student_id = ? AND delete_flag = 0
     ORDER BY exam_date DESC`
  ).all(studentId)
  res.json({ success: true, data: rows })
})

// POST /api/scores
router.post('/', requireAuth, (req: AuthRequest, res) => {
  const { student_id, subject, exam_name, score, full_score, exam_date } =
    req.body as { student_id: string; subject: string; exam_name: string; score: number; full_score: number; exam_date: number }
  if (!student_id || !subject?.trim() || !exam_name?.trim() || score == null || !exam_date) {
    res.status(400).json({ success: false, error: '参数不完整' }); return
  }
  if (!canAccessStudent(req, student_id)) {
    res.status(403).json({ success: false, error: 'forbidden' }); return
  }
  const db = getDB()
  const now = Date.now()
  const id = uuidv4()
  db.prepare(
    `INSERT INTO ExamScore (id, student_id, subject, exam_name, score, full_score, exam_date, create_time, update_time, delete_flag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(id, student_id, subject.trim(), exam_name.trim(), Number(score), Number(full_score ?? 100), Number(exam_date), now, now)
  res.json({ success: true, id })
})

// DELETE /api/scores/:id
router.delete('/:id', requireAuth, (req: AuthRequest, res) => {
  const db = getDB()
  const row = db.prepare('SELECT student_id FROM ExamScore WHERE id = ? AND delete_flag = 0').get(req.params.id) as { student_id: string } | undefined
  if (!row) { res.status(404).json({ success: false, error: '不存在' }); return }
  if (!canAccessStudent(req, row.student_id)) {
    res.status(403).json({ success: false, error: 'forbidden' }); return
  }
  db.prepare('UPDATE ExamScore SET delete_flag = 1, update_time = ? WHERE id = ?').run(Date.now(), req.params.id)
  res.json({ success: true })
})

export default router
