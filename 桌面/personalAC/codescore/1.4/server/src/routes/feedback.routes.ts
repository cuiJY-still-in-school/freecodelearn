import { Router } from 'express'
import { getDB } from '../database'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

router.post('/', requireAuth, (req: AuthRequest, res) => {
  const { type, message } = req.body as { type: string; message: string }
  if (!message?.trim()) { res.status(400).json({ success: false, error: '内容不能为空' }); return }

  const db = getDB()
  const now = Date.now()
  const key = `fb_${now}_${uuidv4().slice(0, 8)}`
  const value = JSON.stringify({
    type: type || 'other',
    message: message.trim(),
    userId: req.userId,
    create_time: now,
  })
  db.prepare(
    'INSERT INTO Settings (id, key, value, encrypted, create_time, update_time, delete_flag) VALUES (?, ?, ?, 0, ?, ?, 0)'
  ).run(uuidv4(), key, value, now, now)

  res.json({ success: true })
})

router.get('/list', requireAuth, (req: AuthRequest, res) => {
  if (req.userRole !== 'guardian') { res.status(403).json({ success: false }); return }
  const db = getDB()
  const rows = db.prepare(
    "SELECT value, create_time FROM Settings WHERE key LIKE 'fb_%' AND delete_flag = 0 ORDER BY create_time DESC LIMIT 100"
  ).all() as Array<{ value: string; create_time: number }>
  res.json({ success: true, data: rows.map(r => { try { return JSON.parse(r.value) } catch { return null } }).filter(Boolean) })
})

export default router
