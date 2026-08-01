import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { getDB } from '../database'

const router = Router()
router.use(requireAuth)

function canAccessStudent(req: AuthRequest, studentId: string): boolean {
  if (req.userRole === 'student') return req.userId === studentId
  const db = getDB()
  const linked = db.prepare('SELECT id FROM User WHERE id = ? AND guardian_id = ? AND delete_flag = 0')
    .get(studentId, req.userId!) as { id: string } | undefined
  return !!linked
}

// ─── GET /api/mistakes/:studentId ─────────────────────────────────────────────
// query: status=all|unreviewed|reviewed, subject=<str>, limit=<n>
router.get('/:studentId', (req: AuthRequest, res) => {
  const { studentId } = req.params

  if (!canAccessStudent(req, studentId)) {
    return res.status(403).json({ success: false, error: 'forbidden' })
  }

  const db = getDB()
  const { status = 'unreviewed', subject, limit = '50' } = req.query as Record<string, string>
  const lim = Math.min(parseInt(limit) || 50, 200)

  let sql = `
    SELECT id, subject, topic, question, student_answer, correct_answer,
           error_type, root_cause, reviewed, review_count, create_time, last_review_at
    FROM MistakeBook
    WHERE student_id = ? AND delete_flag = 0`
  const args: (string | number)[] = [studentId]

  if (status === 'unreviewed') { sql += ` AND reviewed = 0` }
  else if (status === 'reviewed') { sql += ` AND reviewed = 1` }

  if (subject) { sql += ` AND subject = ?`; args.push(subject) }

  sql += ` ORDER BY reviewed ASC, create_time DESC LIMIT ?`
  args.push(lim)

  const rows = db.prepare(sql).all(...args)

  // 统计摘要
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN reviewed = 0 THEN 1 ELSE 0 END) AS unreviewed,
      SUM(CASE WHEN reviewed = 1 THEN 1 ELSE 0 END) AS reviewed_count
    FROM MistakeBook WHERE student_id = ? AND delete_flag = 0
  `).get(studentId) as { total: number; unreviewed: number; reviewed_count: number }

  // 科目列表（用于筛选器）
  const subjects = (db.prepare(`
    SELECT DISTINCT subject FROM MistakeBook
    WHERE student_id = ? AND delete_flag = 0 ORDER BY subject
  `).all(studentId) as Array<{ subject: string }>).map(r => r.subject)

  res.json({ success: true, data: rows, stats, subjects })
})

// ─── POST /api/mistakes/:id/review ───────────────────────────────────────────
router.post('/:id/review', (req: AuthRequest, res) => {
  const { id } = req.params
  const db = getDB()
  const now = Date.now()

  const row = db.prepare(
    `SELECT student_id FROM MistakeBook WHERE id = ? AND delete_flag = 0`
  ).get(id) as { student_id: string } | undefined

  if (!row) return res.status(404).json({ success: false, error: 'not found' })

  if (!canAccessStudent(req, row.student_id)) {
    return res.status(403).json({ success: false, error: 'forbidden' })
  }

  db.prepare(`
    UPDATE MistakeBook SET reviewed = 1, review_count = review_count + 1,
    last_review_at = ?, update_time = ? WHERE id = ?
  `).run(now, now, id)

  res.json({ success: true })
})

// ─── DELETE /api/mistakes/:id ────────────────────────────────────────────────
router.delete('/:id', (req: AuthRequest, res) => {
  const { id } = req.params
  const db = getDB()
  const now = Date.now()

  const row = db.prepare(
    `SELECT student_id FROM MistakeBook WHERE id = ? AND delete_flag = 0`
  ).get(id) as { student_id: string } | undefined

  if (!row) return res.status(404).json({ success: false, error: 'not found' })

  if (!canAccessStudent(req, row.student_id)) {
    return res.status(403).json({ success: false, error: 'forbidden' })
  }

  db.prepare(`UPDATE MistakeBook SET delete_flag = 1, update_time = ? WHERE id = ?`).run(now, id)
  res.json({ success: true })
})

export default router
