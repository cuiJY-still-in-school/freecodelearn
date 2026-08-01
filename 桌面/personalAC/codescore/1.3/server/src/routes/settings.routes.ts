import { Router } from 'express'
import { getModels, saveAIConfig, getAIConfig, saveEmailConfig, getEmailConfig, testEmailConnection } from '../services/settings.service'
import { requireAuth } from '../middleware/auth.middleware'

const router = Router()
router.use(requireAuth)

router.get('/models', async (_req, res) => {
  res.json(await getModels())
})

router.post('/ai', async (req, res) => {
  const { provider, modelId, modelName, apiKey, baseUrl } = req.body
  res.json(saveAIConfig(provider, modelId, modelName, apiKey, baseUrl))
})

router.get('/ai', (_req, res) => {
  res.json(getAIConfig())
})

router.post('/email', async (req, res) => {
  const { email, authCode, imapHost, imapPort } = req.body
  res.json(await saveEmailConfig(email, authCode, imapHost, Number(imapPort)))
})

router.get('/email', (_req, res) => {
  res.json(getEmailConfig())
})

router.post('/email/test', async (_req, res) => {
  res.json(await testEmailConnection())
})

export default router
