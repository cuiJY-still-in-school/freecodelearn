import { Router } from 'express'
import { getDB } from '../database'

const router = Router()
const startTime = Date.now()

router.get('/health', (_req, res) => {
  let dbOk = false
  try {
    const db = getDB()
    db.prepare('SELECT 1').get()
    dbOk = true
  } catch (_) {}

  res.json({
    success: true,
    data: {
      status: dbOk ? 'ok' : 'degraded',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: '2.0.0',
      db: dbOk ? 'connected' : 'disconnected',
    }
  })
})

export default router
