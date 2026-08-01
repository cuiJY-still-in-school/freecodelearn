import { Router } from 'express'
import { requireAuth, canAccessStudent, AuthRequest } from '../middleware/auth'
import { getOrCreateCompanion, updateCompanionConfig } from '../services/companion.service'

const router = Router()

router.get('/state', requireAuth, (req: AuthRequest, res) => {
  const studentId = (req.query.studentId as string) || req.userId!
  if (!canAccessStudent(req, studentId)) { res.status(403).json({ success: false, error: '无权限' }); return }

  const config = getOrCreateCompanion(studentId)
  res.json({ success: true, data: config })
})

router.post('/config', requireAuth, (req: AuthRequest, res) => {
  const studentId = (req.body.studentId as string) || req.userId!
  if (!canAccessStudent(req, studentId)) { res.status(403).json({ success: false, error: '无权限' }); return }

  const { companionName, companionStyle } = req.body
  const config = updateCompanionConfig(studentId, { companion_name: companionName, companion_style: companionStyle })
  res.json({ success: true, data: config })
})

export default router
