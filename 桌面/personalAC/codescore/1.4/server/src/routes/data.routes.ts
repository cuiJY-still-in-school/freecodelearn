import { Router } from 'express'
import { recordLearning, getSummary as getLearningData } from '../services/data.service'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'

const router = Router()
router.use(requireAuth)

router.post('/learning', async (req: AuthRequest, res) => {
  res.json(await recordLearning({ ...req.body, studentId: req.userId }))
})

router.get('/summary', (req: AuthRequest, res) => {
  const { dateFrom, dateTo, subject } = req.query as Record<string, string>
  res.json(getLearningData(req.userId!, Number(dateFrom), Number(dateTo), subject))
})

export default router
