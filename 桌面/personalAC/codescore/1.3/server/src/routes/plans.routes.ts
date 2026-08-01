import { Router } from 'express'
import { create as createPlan, getActive as getActivePlan, listPlans } from '../services/plan.service'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'

const router = Router()
router.use(requireAuth)

router.post('/', async (req: AuthRequest, res) => {
  const { title, description, subjects } = req.body
  res.json(await createPlan(req.userId!, title, description, subjects))
})

router.get('/active', (req: AuthRequest, res) => {
  res.json(getActivePlan(req.userId!))
})

router.get('/', (req: AuthRequest, res) => {
  res.json(listPlans(req.userId!))
})

export default router
