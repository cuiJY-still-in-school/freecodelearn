import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { addSSEClient, removeSSEClient } from '../services/notify.service'
import { getDB } from '../database'

const router = Router()

// GET /api/notify/stream — SSE 实时推送通道
router.get('/stream', requireAuth, (req: AuthRequest, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const userId = req.userId!
  addSSEClient(userId, res)
  res.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`)

  const heartbeat = setInterval(() => {
    try { res.write('data: {"type":"heartbeat"}\n\n') } catch {}
  }, 25000)

  req.on('close', () => {
    clearInterval(heartbeat)
    removeSSEClient(userId)
  })
})

// GET /api/notify/messages — 获取最近消息记录
router.get('/messages', requireAuth, (req: AuthRequest, res) => {
  const db = getDB()
  const limit = Math.min(Number(req.query.limit) || 30, 100)
  const msgs = db.prepare(`
    SELECT id, content, create_time FROM MessageLog
    WHERE user_id = ? AND direction = 'outbound' AND delete_flag = 0
    ORDER BY create_time DESC LIMIT ?
  `).all(req.userId!, limit) as Array<{ id: string; content: string; create_time: number }>
  res.json({ success: true, data: msgs.reverse() })
})

export default router
