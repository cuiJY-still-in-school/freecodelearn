import { Router } from 'express'
import { getDB } from '../database'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

function upsertRadar(studentId: string, data: object): void {
  const db = getDB()
  const key = `radar_${studentId}`
  const val = JSON.stringify(data)
  const now = Date.now()
  const row = db.prepare('SELECT id FROM Settings WHERE key = ? AND delete_flag = 0').get(key)
  if (row) {
    db.prepare('UPDATE Settings SET value = ?, update_time = ? WHERE key = ? AND delete_flag = 0').run(val, now, key)
  } else {
    db.prepare('INSERT INTO Settings (id, key, value, encrypted, create_time, update_time, delete_flag) VALUES (?, ?, ?, 0, ?, ?, 0)').run(uuidv4(), key, val, now, now)
  }
}

function getRadar(studentId: string): object | null {
  const db = getDB()
  const row = db.prepare('SELECT value FROM Settings WHERE key = ? AND delete_flag = 0').get(`radar_${studentId}`) as { value: string } | undefined
  if (!row) return null
  try { return JSON.parse(row.value) } catch { return null }
}

// GET /api/radar/:studentId
router.get('/:studentId', requireAuth, (req: AuthRequest, res) => {
  const { studentId } = req.params
  // 学生只能查自己的，监护人只能查关联学生的
  if (req.userRole === 'student' && req.userId !== studentId) {
    res.status(403).json({ success: false, error: 'forbidden' }); return
  }
  if (req.userRole === 'guardian') {
    const db = getDB()
    const linked = db.prepare('SELECT id FROM User WHERE id = ? AND guardian_id = ? AND delete_flag = 0').get(studentId, req.userId!) as { id: string } | undefined
    if (!linked) { res.status(403).json({ success: false, error: 'forbidden' }); return }
  }
  const data = getRadar(studentId)
  res.json({ success: true, data })
})

// POST /api/radar/:studentId  (agent 内部调用或管理端调用)
router.post('/:studentId', requireAuth, (req: AuthRequest & { body: object }, res) => {
  const role = (req as AuthRequest).userRole
  if (role !== 'guardian' && role !== 'admin') {
    res.status(403).json({ success: false, error: '仅监护人可更新雷达图' }); return
  }
  if (role === 'guardian') {
    const db = getDB()
    const linked = db.prepare('SELECT id FROM User WHERE id = ? AND guardian_id = ? AND delete_flag = 0')
      .get(req.params.studentId, req.userId!) as { id: string } | undefined
    if (!linked) { res.status(403).json({ success: false, error: 'forbidden' }); return }
  }
  const body = req.body as Record<string, unknown>
  if (!body.dimensions) { res.status(400).json({ success: false, error: '缺少 dimensions' }); return }
  upsertRadar(req.params.studentId, { ...body, updated_at: Date.now() })
  res.json({ success: true })
})

export { upsertRadar, getRadar }
export default router
