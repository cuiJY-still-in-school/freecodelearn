import { Router } from 'express'
import { emailService } from '../services/email.service'
import { requireAuth } from '../middleware/auth.middleware'

const router = Router()
router.use(requireAuth)

router.get('/status', (_req, res) => {
  res.json(emailService.getStatus())
})

router.post('/start', async (_req, res) => {
  res.json(await emailService.startPolling())
})

router.post('/stop', (_req, res) => {
  res.json(emailService.stopPolling())
})

export default router
