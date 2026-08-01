import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { getDB } from '../database'

const router = Router()

// GET /api/chat-history?limit=60
router.get('/', requireAuth, (req, res) => {
  const db = getDB()
  const userId = (req as AuthRequest).userId!
  const limit = Math.min(200, parseInt(req.query.limit as string) || 60)
  const rows = db.prepare(
    `SELECT id, role, content, thinking, msg_time, create_time
     FROM ChatHistory
     WHERE user_id=? AND delete_flag=0
     ORDER BY create_time ASC
     LIMIT ?`
  ).all(userId, limit) as Array<{ id: string; role: string; content: string; thinking: string | null; msg_time: string | null; create_time: number }>
  res.json({ success: true, data: rows })
})

// POST /api/chat-history  body: { messages: [{id,role,content,thinking?,msg_time?}] }
router.post('/', requireAuth, (req, res) => {
  const db = getDB()
  const userId = (req as AuthRequest).userId!
  const messages = req.body?.messages as Array<{ id?: string; role: string; content: string; thinking?: string; msg_time?: string }> | undefined
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ success: false, error: '缺少 messages' }); return
  }
  const insert = db.prepare(
    `INSERT INTO ChatHistory (id, user_id, role, content, thinking, msg_time, create_time, delete_flag)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET content=excluded.content, thinking=excluded.thinking`
  )
  const batch = db.transaction(() => {
    for (const m of messages) {
      if (!m.role || !m.content) continue
      insert.run(m.id || uuidv4(), userId, m.role, m.content, m.thinking ?? null, m.msg_time ?? null, Date.now())
    }
  })
  batch()
  res.json({ success: true })
})

// DELETE /api/chat-history  — 清空当前用户历史
router.delete('/', requireAuth, (req, res) => {
  const db = getDB()
  const userId = (req as AuthRequest).userId!
  db.prepare(`UPDATE ChatHistory SET delete_flag=1 WHERE user_id=?`).run(userId)
  res.json({ success: true })
})

export default router
