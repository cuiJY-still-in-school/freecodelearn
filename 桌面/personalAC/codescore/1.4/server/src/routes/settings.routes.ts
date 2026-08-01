import { Router } from 'express'
import {
  getModels, saveAIConfig, getAIConfig,
  saveWolframConfig, getWolframConfig, testWolframConfig,
  saveSerperConfig, getSerperConfig,
  saveVisionConfig, getVisionConfig,
} from '../services/settings.service'
import { probeAndEnableVision } from '../services/vision.service'
import { requireAuth, requireAdminOrGuardian } from '../middleware/auth.middleware'

const router = Router()
router.use(requireAuth)

router.get('/models', (_req, res) => {
  res.json(getModels())
})

router.post('/ai', requireAdminOrGuardian, async (req, res) => {
  const { provider, modelId, modelName, apiKey, baseUrl } = req.body
  res.json(saveAIConfig(provider, modelId, modelName, apiKey, baseUrl))
})

router.get('/ai', (_req, res) => {
  res.json(getAIConfig())
})

router.post('/wolfram', requireAdminOrGuardian, (req, res) => {
  const { appId } = req.body as { appId: string }
  if (!appId?.trim()) { res.status(400).json({ success: false, error: 'appId 不能为空' }); return }
  res.json(saveWolframConfig(appId.trim()))
})

router.get('/wolfram', (_req, res) => {
  res.json(getWolframConfig())
})

router.post('/serper', requireAdminOrGuardian, (req, res) => {
  const { apiKey } = req.body as { apiKey: string }
  if (!apiKey?.trim()) { res.status(400).json({ success: false, error: 'apiKey 不能为空' }); return }
  res.json(saveSerperConfig(apiKey.trim()))
})

router.get('/serper', (_req, res) => {
  res.json(getSerperConfig())
})

router.get('/vision', (_req, res) => {
  res.json(getVisionConfig())
})

router.post('/vision', requireAdminOrGuardian, (req, res) => {
  const { apiKey, baseUrl, model, enabled } = req.body as {
    apiKey: string; baseUrl?: string; model?: string; enabled?: boolean
  }
  // 本地部署无需 API Key
  res.json(saveVisionConfig(apiKey?.trim() ?? '', baseUrl ?? '', model ?? '', !!enabled))
})

router.post('/wolfram/test', requireAdminOrGuardian, async (req, res) => {
  const { appId } = req.body as { appId: string }
  res.json(await testWolframConfig(appId?.trim() ?? ''))
})

router.post('/vision/probe', requireAdminOrGuardian, async (_req, res) => {
  res.json(await probeAndEnableVision())
})

export default router
