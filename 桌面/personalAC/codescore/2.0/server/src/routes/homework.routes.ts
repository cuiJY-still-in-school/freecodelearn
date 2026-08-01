import { Router } from 'express'
import { requireAuth, canAccessStudent, AuthRequest } from '../middleware/auth'
import { listHomework, createHomework, updateHomeworkStatus } from '../services/homework.service'

const router = Router()

router.get('/', requireAuth, (req: AuthRequest, res) => {
  const studentId = (req.query.studentId as string) || req.userId!
  if (!canAccessStudent(req, studentId)) { res.status(403).json({ success: false, error: '无权限' }); return }

  const items = listHomework(studentId, req.query.status as string)
  res.json({ success: true, data: items })
})

router.post('/', requireAuth, (req: AuthRequest, res) => {
  const studentId = (req.body.studentId as string) || req.userId!
  if (!canAccessStudent(req, studentId)) { res.status(403).json({ success: false, error: '无权限' }); return }

  const { subject, title, description, difficulty, dueDate } = req.body
  if (!subject || !title) { res.status(400).json({ success: false, error: '缺少 subject 或 title' }); return }

  const item = createHomework(studentId, subject, title, description, 'ai', difficulty, dueDate)
  res.json({ success: true, data: item })
})

router.post('/:id/submit', requireAuth, (req: AuthRequest, res) => {
  const { score, reviewNotes } = req.body
  updateHomeworkStatus(req.params.id, 'submitted', score, reviewNotes)
  res.json({ success: true })
})

export default router
