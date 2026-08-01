import { Router } from 'express'
import { requireAdmin, AuthRequest } from '../middleware/auth.middleware'
import { getDB } from '../database'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'

const router = Router()
router.use(requireAdmin)

// ── 全部用户列表 ──────────────────────────────────────────────────────────
router.get('/users', (_req, res) => {
  const db = getDB()
  const users = db.prepare(`
    SELECT id, username, email, display_name, role, create_time, has_set_password,
           (SELECT COUNT(*) FROM MessageLog WHERE user_id = User.id AND delete_flag = 0) as msg_count
    FROM User WHERE delete_flag = 0 ORDER BY create_time DESC
  `).all() as Array<{
    id: string; username: string; email: string | null; display_name: string | null
    role: string; create_time: number; has_set_password: number; msg_count: number
  }>

  res.json({
    success: true,
    data: users.map(u => ({
      id: u.id,
      email: u.email,
      displayName: u.display_name || u.username,
      role: u.role,
      createdAt: u.create_time,
      hasSetPassword: u.has_set_password === 1,
      msgCount: u.msg_count,
      isAdmin: u.role === 'admin'
    }))
  })
})

// ── 创建用户 ──────────────────────────────────────────────────────────────
router.post('/users', (req: AuthRequest, res) => {
  const { email, password, displayName, role } = req.body as {
    email: string; password: string; displayName: string; role?: string
  }
  const norm = email?.trim().toLowerCase()
  if (!norm || !password || !displayName?.trim()) {
    res.status(400).json({ success: false, error: '请填写完整信息' }); return
  }
  const db = getDB()
  const existing = db.prepare('SELECT id FROM User WHERE email = ? AND delete_flag = 0').get(norm)
  if (existing) { res.json({ success: false, error: '该邮箱已注册' }); return }

  const id = uuidv4()
  const syncToken = uuidv4()
  const now = Date.now()
  db.prepare(`
    INSERT INTO User (id, username, email, sync_token, display_name, role, password_hash,
                      has_set_password, create_time, update_time, delete_flag)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0)
  `).run(id, `user_${id.slice(0, 8)}`, norm, syncToken, displayName.trim(),
    role || 'guardian', bcrypt.hashSync(password, 10), now, now)

  res.json({ success: true, data: { id, email: norm, displayName: displayName.trim() } })
})

// ── 删除用户 ──────────────────────────────────────────────────────────────
router.delete('/users/:id', (req: AuthRequest, res) => {
  const db = getDB()
  const user = db.prepare('SELECT email, role FROM User WHERE id = ? AND delete_flag = 0').get(req.params.id) as { email: string; role: string } | undefined
  if (!user) { res.json({ success: false, error: '用户不存在' }); return }
  if (user.role === 'admin') { res.json({ success: false, error: '不能删除 Admin 账户' }); return }
  db.prepare('UPDATE User SET delete_flag = 1, update_time = ? WHERE id = ?').run(Date.now(), req.params.id)
  res.json({ success: true })
})

// ── 重置用户密码 ──────────────────────────────────────────────────────────
router.post('/users/:id/reset-password', (req: AuthRequest, res) => {
  const { newPassword } = req.body as { newPassword: string }
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ success: false, error: '密码至少 6 位' }); return
  }
  const db = getDB()
  const user = db.prepare('SELECT id FROM User WHERE id = ? AND delete_flag = 0').get(req.params.id)
  if (!user) { res.json({ success: false, error: '用户不存在' }); return }
  db.prepare('UPDATE User SET password_hash = ?, has_set_password = 1, update_time = ? WHERE id = ?')
    .run(bcrypt.hashSync(newPassword, 10), Date.now(), req.params.id)
  res.json({ success: true })
})

// ── 站点统计 ──────────────────────────────────────────────────────────────
router.get('/stats', (_req, res) => {
  const db = getDB()
  const totalUsers = (db.prepare("SELECT COUNT(*) as c FROM User WHERE delete_flag = 0 AND role != 'student'").get() as { c: number }).c
  const totalMsgs = (db.prepare('SELECT COUNT(*) as c FROM MessageLog WHERE delete_flag = 0').get() as { c: number }).c
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const activeToday = (db.prepare(
    'SELECT COUNT(DISTINCT user_id) as c FROM MessageLog WHERE create_time >= ? AND delete_flag = 0'
  ).get(todayStart.getTime()) as { c: number }).c

  res.json({ success: true, data: { totalUsers, totalMsgs, activeToday } })
})

export default router
