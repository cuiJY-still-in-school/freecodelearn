import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import {
  loginWithEmail, loginByToken, registerUser, setupAdminPassword, changePassword,
  resetSyncToken, getUserBySyncToken,
  setupGuardian, createStudent, listStudents, deleteStudent,
  getInviteInfo, acceptInvite, resetInviteCode
} from '../services/auth.service'
import { sendOtpEmail } from '../services/email.service'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { getDB } from '../database'
import bcrypt from 'bcryptjs'

const router = Router()

// ── 邮箱登录 ──────────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body as { email: string; password: string }
  if (!email?.trim()) { res.status(400).json({ success: false, error: '请输入邮箱' }); return }
  if (!password) { res.status(400).json({ success: false, error: '请输入密码' }); return }
  res.json(loginWithEmail(email, password))
})

// ── 注册 ──────────────────────────────────────────────────────────────────
router.post('/register', (req, res) => {
  const { email, password, displayName } = req.body as { email: string; password: string; displayName: string }
  if (!email?.trim() || !password || !displayName?.trim()) {
    res.status(400).json({ success: false, error: '请填写完整信息' }); return
  }
  res.json(registerUser(email, password, displayName))
})

// ── Admin 首次设置密码（用 sync token 验证身份）───────────────────────────
router.post('/setup-password', (req, res) => {
  const { syncToken, password } = req.body as { syncToken: string; password: string }
  if (!syncToken?.trim() || !password) {
    res.status(400).json({ success: false, error: '参数不完整' }); return
  }
  res.json(setupAdminPassword(syncToken.trim(), password))
})

// ── 发送 OTP 验证码 ───────────────────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  const { email } = req.body as { email: string }
  if (!email?.trim() || !email.includes('@')) {
    res.status(400).json({ success: false, error: '请输入有效的邮箱' }); return
  }
  const norm = email.trim().toLowerCase()
  const db = getDB()
  const now = Date.now()

  // 60 秒内不允许重复发送
  const recent = db.prepare(
    'SELECT create_time FROM OtpCode WHERE email = ? AND create_time > ? ORDER BY create_time DESC LIMIT 1'
  ).get(norm, now - 60_000) as { create_time: number } | undefined
  if (recent) {
    res.status(429).json({ success: false, error: '发送太频繁，请 60 秒后再试' }); return
  }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  db.prepare(
    'INSERT INTO OtpCode (id, email, code, expires_at, used, create_time) VALUES (?, ?, ?, ?, 0, ?)'
  ).run(uuidv4(), norm, code, now + 10 * 60_000, now)

  try {
    await sendOtpEmail(norm, code)
    res.json({ success: true })
  } catch (err) {
    console.error('[OTP] send failed:', err)
    res.status(500).json({ success: false, error: '邮件发送失败，请稍后重试' })
  }
})

// ── OTP 验证登录 ──────────────────────────────────────────────────────────
router.post('/verify-otp', (req, res) => {
  const { email, code, inviteCode } = req.body as { email: string; code: string; inviteCode?: string }
  if (!email?.trim() || !code?.trim()) {
    res.status(400).json({ success: false, error: '参数不完整' }); return
  }
  const norm = email.trim().toLowerCase()
  const db = getDB()
  const now = Date.now()

  const otp = db.prepare(
    'SELECT id, expires_at, used FROM OtpCode WHERE email = ? AND code = ? ORDER BY create_time DESC LIMIT 1'
  ).get(norm, code.trim()) as { id: string; expires_at: number; used: number } | undefined

  if (!otp) { res.json({ success: false, error: '验证码错误' }); return }
  if (otp.used) { res.json({ success: false, error: '验证码已使用' }); return }
  if (otp.expires_at < now) { res.json({ success: false, error: '验证码已过期' }); return }

  db.prepare('UPDATE OtpCode SET used = 1 WHERE id = ?').run(otp.id)

  // 查找或创建用户
  let user = db.prepare(
    `SELECT id, username, email, display_name, role, student_name, student_grade, guardian_id, has_set_password, sync_token
     FROM User WHERE email = ? AND delete_flag = 0`
  ).get(norm) as { id: string; username: string; email: string; display_name: string | null; role: string
    student_name: string | null; student_grade: string | null; guardian_id: string | null
    has_set_password: number | null; sync_token: string } | undefined

  if (!user) {
    // 邮箱未注册：监护人可选带邀请码自动注册，否则提示
    const ic = inviteCode?.trim().toUpperCase()
    if (!ic) {
      res.json({ success: false, error: '该邮箱尚未注册，请先通过邀请码激活账号，或联系管理员' }); return
    }
    // 带邀请码：自动注册为 guardian
    const id = uuidv4(); const syncToken = uuidv4(); const ts = Date.now()
    db.prepare(`
      INSERT INTO User (id, username, email, sync_token, display_name, role, has_set_password, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, ?, ?, 'guardian', 0, ?, ?, 0)
    `).run(id, `user_${id.slice(0,8)}`, norm, syncToken, norm.split('@')[0], ts, ts)

    user = db.prepare(
      `SELECT id, username, email, display_name, role, student_name, student_grade, guardian_id, has_set_password, sync_token
       FROM User WHERE id = ?`
    ).get(id) as typeof user

    res.json({
      success: true,
      syncToken: user!.sync_token,
      needsSetup: true,
      user: { id: user!.id, email: user!.email, displayName: user!.display_name, role: user!.role }
    })
    return
  }

  res.json({
    success: true,
    syncToken: user!.sync_token,
    needsSetup: !user!.has_set_password,
    user: {
      id: user!.id,
      email: user!.email,
      displayName: user!.display_name,
      role: user!.role,
    }
  })
})

// ── Legacy token 登录（向后兼容）─────────────────────────────────────────
router.post('/login/token', (req, res) => {
  const { syncToken } = req.body as { syncToken: string }
  if (!syncToken?.trim()) { res.status(400).json({ success: false, error: '请输入访问码' }); return }
  res.json(loginByToken(syncToken.trim()))
})

// ── 修改密码 ──────────────────────────────────────────────────────────────
router.post('/change-password', requireAuth, (req: AuthRequest, res) => {
  const { oldPassword, newPassword } = req.body as { oldPassword: string; newPassword: string }
  if (!newPassword) { res.status(400).json({ success: false, error: '请填写新密码' }); return }
  res.json(changePassword(req.userId!, oldPassword ?? '', newPassword))
})

// ── 当前用户信息 ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req: AuthRequest, res) => {
  const user = getUserBySyncToken(req.headers['x-sync-token'] as string || '')
  res.json({ success: true, data: user })
})

// ── 监护人配置 ────────────────────────────────────────────────────────────
router.post('/setup', requireAuth, (req: AuthRequest, res) => {
  const { guardianName } = req.body as { guardianName: string }
  if (!guardianName?.trim()) { res.status(400).json({ success: false, error: '请填写称呼' }); return }
  setupGuardian(req.userId!, guardianName)
  res.json({ success: true })
})

// ── 学生管理 ──────────────────────────────────────────────────────────────
router.get('/students', requireAuth, (req: AuthRequest, res) => {
  res.json({ success: true, data: listStudents(req.userId!) })
})

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

router.delete('/students/:id', requireAuth, (req: AuthRequest, res) => {
  const ok = deleteStudent(req.params.id, req.userId!)
  res.json({ success: ok, error: ok ? undefined : '操作失败或无权限' })
})

// ── 邀请码激活（公开，无需登录）──────────────────────────────────────────
router.get('/join/:code', (req, res) => {
  const info = getInviteInfo(req.params.code.toUpperCase())
  if (!info) { res.json({ success: false, error: '邀请码不存在' }); return }
  res.json({ success: true, data: info })
})

router.post('/join/:code', (req, res) => {
  const { displayName, password, email } = req.body as { displayName?: string; password: string; email?: string }
  if (!password) { res.status(400).json({ success: false, error: '请设置密码' }); return }
  const result = acceptInvite(req.params.code.toUpperCase(), displayName?.trim() ?? '', password, email)
  res.json(result)
})

router.post('/students/:id/reset-invite', requireAuth, (req: AuthRequest, res) => {
  const result = resetInviteCode(req.params.id, req.userId!)
  res.json(result)
})

router.post('/students/:id/reset-token', requireAuth, (req: AuthRequest, res) => {
  const db = getDB()
  const student = db.prepare(
    "SELECT id FROM User WHERE id = ? AND guardian_id = ? AND role = 'student' AND delete_flag = 0"
  ).get(req.params.id, req.userId!) as { id: string } | undefined
  if (!student) { res.json({ success: false, error: '无权限或学生不存在' }); return }
  const newToken = uuidv4()
  db.prepare('UPDATE User SET sync_token = ?, has_set_password = 0, password_hash = NULL, update_time = ? WHERE id = ?')
    .run(newToken, Date.now(), student.id)
  res.json({ success: true, data: { token: newToken } })
})

router.post('/reset-token', requireAuth, (req: AuthRequest, res) => {
  res.json(resetSyncToken(req.userId!))
})

// ── 绑定邮箱（已登录用户，用 OTP 验证邮箱所有权后绑定）─────────────────────
router.post('/bind-email', requireAuth, async (req: AuthRequest, res) => {
  const { email, code } = req.body as { email: string; code: string }
  if (!email?.trim() || !code?.trim()) {
    res.status(400).json({ success: false, error: '参数不完整' }); return
  }
  const norm = email.trim().toLowerCase()
  const db = getDB()
  const now = Date.now()

  // 校验 OTP
  const otp = db.prepare(
    'SELECT id, expires_at, used FROM OtpCode WHERE email = ? AND code = ? ORDER BY create_time DESC LIMIT 1'
  ).get(norm, code.trim()) as { id: string; expires_at: number; used: number } | undefined
  if (!otp) { res.json({ success: false, error: '验证码错误' }); return }
  if (otp.used) { res.json({ success: false, error: '验证码已使用' }); return }
  if (otp.expires_at < now) { res.json({ success: false, error: '验证码已过期' }); return }
  db.prepare('UPDATE OtpCode SET used = 1 WHERE id = ?').run(otp.id)

  // 检查邮箱未被其他账号使用
  const dup = db.prepare('SELECT id FROM User WHERE email = ? AND id != ? AND delete_flag = 0').get(norm, req.userId!)
  if (dup) { res.json({ success: false, error: '该邮箱已被其他账号使用' }); return }

  db.prepare('UPDATE User SET email = ?, update_time = ? WHERE id = ? AND delete_flag = 0')
    .run(norm, now, req.userId!)
  res.json({ success: true })
})

// ── 新用户完成引导（设置昵称 + 可选密码）────────────────────────────────────
router.post('/complete-setup', requireAuth, async (req: AuthRequest, res) => {
  const { displayName, password } = req.body as { displayName?: string; password?: string }
  const db = getDB()
  const now = Date.now()

  if (password && password.length >= 6) {
    const hash = await bcrypt.hash(password, 10)
    db.prepare(
      'UPDATE User SET display_name = ?, password_hash = ?, has_set_password = 1, update_time = ? WHERE id = ? AND delete_flag = 0'
    ).run(displayName?.trim() || null, hash, now, req.userId!)
  } else {
    db.prepare(
      'UPDATE User SET display_name = ?, has_set_password = 1, update_time = ? WHERE id = ? AND delete_flag = 0'
    ).run(displayName?.trim() || null, now, req.userId!)
  }

  const user = db.prepare(
    'SELECT id, email, display_name, role FROM User WHERE id = ? AND delete_flag = 0'
  ).get(req.userId!) as { id: string; email: string; display_name: string | null; role: string } | undefined

  res.json({ success: true, user })
})

export default router
