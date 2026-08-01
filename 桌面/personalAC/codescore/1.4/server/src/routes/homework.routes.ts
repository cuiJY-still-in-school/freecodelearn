import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { gradeHomework } from '../services/homework.service'
import { getPrimaryStudentId } from '../services/auth.service'
import { getDB } from '../database'

const router = Router()
router.use(requireAuth)

// POST /api/homework/grade — 上传作业图片批改
router.post('/grade', async (req: AuthRequest, res) => {
  const { image, mimeType, subject } = req.body as {
    image: string       // base64
    mimeType: string    // image/jpeg 等
    subject?: string
  }

  if (!image || !mimeType) {
    res.status(400).json({ success: false, error: '请提供图片数据' }); return
  }
  if (!mimeType.startsWith('image/')) {
    res.status(400).json({ success: false, error: '只支持图片文件' }); return
  }

  const db = getDB()
  const user = db.prepare('SELECT role FROM User WHERE id = ? AND delete_flag = 0').get(req.userId!) as { role: string } | undefined
  const studentId = user?.role === 'student'
    ? req.userId!
    : (getPrimaryStudentId(req.userId!) ?? req.userId!)

  try {
    const result = await gradeHomework(image, mimeType, subject || '', studentId)
    res.json({ success: true, data: result })
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : '批改失败' })
  }
})

export default router
