import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import {
  loginByToken, resetSyncToken, getUserBySyncToken,
  setupGuardian, createStudent, listStudents, deleteStudent
} from '../services/auth.service'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { getDB } from '../database'

const router = Router()

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { syncToken } = req.body as { syncToken: string }
  if (!syncToken?.trim()) { res.status(400).json({ success: false, error: '请输入访问码' }); return }
  res.json(loginByToken(syncToken.trim()))
})

// GET /api/auth/me
router.get('/me', requireAuth, (req: AuthRequest, res) => {
  const user = getUserBySyncToken(req.headers['x-sync-token'] as string || '')
  res.json({ success: true, data: user })
})

// POST /api/auth/setup — 监护人初始配置（设置名字）
router.post('/setup', requireAuth, (req: AuthRequest, res) => {
  const { guardianName } = req.body as { guardianName: string }
  if (!guardianName?.trim()) { res.status(400).json({ success: false, error: '请填写称呼' }); return }
  setupGuardian(req.userId!, guardianName)
  res.json({ success: true })
})

// GET /api/auth/students — 列出名下学生
router.get('/students', requireAuth, (req: AuthRequest, res) => {
  const students = listStudents(req.userId!)
  res.json({ success: true, data: students })
})

// POST /api/auth/students — 创建学生账户
router.post('/students', requireAuth, (req: AuthRequest, res) => {
  const { name, grade, subjects } = req.body as { name: string; grade?: string; subjects?: string[] }
  if (!name?.trim()) { res.status(400).json({ success: false, error: '请填写学生姓名' }); return }

  const student = createStudent(req.userId!, name, grade)

  if (Array.isArray(subjects) && subjects.length > 0) {
    const db = getDB()
    const now = Date.now()
    db.prepare(`
      INSERT INTO Plan (id, student_id, title, description, subjects, status, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, '', ?, 'active', ?, ?, 0)
    `).run(uuidv4(), student.id, `${student.name}的学习计划`, JSON.stringify(subjects), now, now)
  }

  res.json({ success: true, data: student })
})

// DELETE /api/auth/students/:id
router.delete('/students/:id', requireAuth, (req: AuthRequest, res) => {
  const ok = deleteStudent(req.params.id, req.userId!)
  res.json({ success: ok, error: ok ? undefined : '操作失败或无权限' })
})

// POST /api/auth/reset-token
router.post('/reset-token', requireAuth, (req: AuthRequest, res) => {
  res.json(resetSyncToken(req.userId!))
})

export default router
