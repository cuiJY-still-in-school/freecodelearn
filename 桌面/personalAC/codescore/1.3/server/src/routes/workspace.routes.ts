import { Router } from 'express'
import { workspaceService } from '../services/workspace.service'
import { requireAuth } from '../middleware/auth.middleware'

const router = Router()
router.use(requireAuth)

router.post('/write', async (req, res) => {
  const { relativePath, content } = req.body
  res.json(await workspaceService.write(relativePath, content))
})

router.get('/read', async (req, res) => {
  res.json(await workspaceService.read(req.query.path as string))
})

router.get('/list', async (req, res) => {
  res.json(await workspaceService.list(req.query.path as string || ''))
})

router.delete('/delete', async (req, res) => {
  res.json(await workspaceService.delete(req.query.path as string))
})

router.get('/stats', async (_req, res) => {
  res.json(await workspaceService.getStats())
})

router.post('/cleanup-temp', async (_req, res) => {
  res.json(await workspaceService.cleanupTemp())
})

export default router
