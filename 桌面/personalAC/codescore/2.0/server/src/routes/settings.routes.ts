import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { getAIConfig, saveAIConfig } from '../services/settings.service'

const router = Router()

router.get('/ai', requireAuth, (req: AuthRequest, res) => {
  const config = getAIConfig()
  if (!config) { res.json({ success: true, data: null }); return }
  const { apiKey, ...safe } = config
  res.json({ success: true, data: safe })
})

router.post('/ai', requireAuth, (req: AuthRequest, res) => {
  const { provider, modelId, modelName, apiKey, baseUrl } = req.body
  if (!provider || !modelId || !apiKey) {
    res.status(400).json({ success: false, error: '缺少 provider/modelId/apiKey' })
    return
  }
  saveAIConfig({ provider, modelId, modelName: modelName || modelId, apiKey, baseUrl: baseUrl || null })
  res.json({ success: true })
})

export default router
