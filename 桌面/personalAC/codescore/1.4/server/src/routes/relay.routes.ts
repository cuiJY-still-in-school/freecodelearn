import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { listPendingRelays, markRelayRead } from '../services/relay.service'
import { getDB } from '../database'
import { getPrimaryStudentId } from '../services/auth.service'

const router = Router()
router.use(requireAuth)

// GET /api/relay/pending — 返回当前用户待接收的未读图片
router.get('/pending', (req: AuthRequest, res) => {
  const db = getDB()
  const user = db.prepare('SELECT role FROM User WHERE id = ? AND delete_flag = 0').get(req.userId!) as { role: string } | undefined
  if (!user) { res.json({ success: false, error: '用户不存在' }); return }

  let studentId: string
  if (user.role === 'guardian') {
    studentId = getPrimaryStudentId(req.userId!) ?? ''
  } else {
    studentId = req.userId!
  }

  if (!studentId) { res.json({ success: true, data: [] }); return }

  const items = listPendingRelays(studentId, user.role)
  // 不返回 data 字段（太大），只返回元信息 + 用单独接口取图片
  res.json({
    success: true,
    data: items.map(({ data: _data, ...rest }) => rest)
  })
})

// GET /api/relay/:id/image — 返回图片 base64（独立接口避免列表接口过大）
router.get('/:id/image', (req: AuthRequest, res) => {
  const db = getDB()
  const item = db.prepare('SELECT data, mime_type, student_id FROM Relay WHERE id = ?').get(req.params.id) as { data: string; mime_type: string; student_id: string } | undefined
  if (!item) { res.status(404).json({ success: false, error: '不存在' }); return }

  // 只有关联学生本人或其监护人可以访问
  const user = db.prepare('SELECT role FROM User WHERE id = ? AND delete_flag = 0').get(req.userId!) as { role: string } | undefined
  const effectiveStudentId = user?.role === 'guardian' ? (getPrimaryStudentId(req.userId!) ?? '') : req.userId!
  if (item.student_id !== effectiveStudentId) {
    res.status(403).json({ success: false, error: '无权访问' }); return
  }

  res.json({ success: true, data: { data: item.data, mimeType: item.mime_type } })
})

// POST /api/relay/:id/read — 标记已读
router.post('/:id/read', (req: AuthRequest, res) => {
  const db = getDB()
  const item = db.prepare('SELECT student_id FROM Relay WHERE id = ?').get(req.params.id) as { student_id: string } | undefined
  if (!item) { res.status(404).json({ success: false, error: '不存在' }); return }

  const user = db.prepare('SELECT role FROM User WHERE id = ? AND delete_flag = 0').get(req.userId!) as { role: string } | undefined
  const effectiveStudentId = user?.role === 'guardian' ? (getPrimaryStudentId(req.userId!) ?? '') : req.userId!
  if (item.student_id !== effectiveStudentId) {
    res.status(403).json({ success: false, error: '无权操作' }); return
  }

  markRelayRead(req.params.id)
  res.json({ success: true })
})

export default router
