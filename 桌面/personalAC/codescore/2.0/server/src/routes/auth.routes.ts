import { Router } from 'express'
import { requireAuth, requireGuardian, AuthRequest } from '../middleware/auth'
import {
  loginByToken, getUserById, createStudent, listStudents, resetToken,
  loginByPassword, registerUser, setupPassword, changePassword,
  createOtp, verifyOtp, checkOtpCooldown, getUserByEmail,
  getJoinInfo, activateJoin, resetStudentAccess, bindEmail,
} from '../services/auth.service'
import { sendOtpEmail } from '../services/email.service'
import { getOrCreateCompanion } from '../services/companion.service'
import { getOrCreateBoard } from '../services/board.service'

const router = Router()

function initStudentServices(studentId: string) {
  getOrCreateBoard(studentId, 'study')
  getOrCreateBoard(studentId, 'homework')
  getOrCreateCompanion(studentId)
}

// ── Token 登录（向后兼容） ─────────────────────────
router.post('/login/token', (req: AuthRequest, res) => {
  const { syncToken } = req.body
  if (!syncToken) { res.status(400).json({ success: false, error: '缺少 syncToken' }); return }
  const user = loginByToken(syncToken)
  if (!user) { res.status(401).json({ success: false, error: '无效的访问令牌' }); return }
  if (user.role === 'student') initStudentServices(user.id)
  res.json({ success: true, syncToken: user.sync_token, needsSetup: !user.has_set_password, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } })
})

// ── 密码登录 ──────────────────────────────────────
router.post('/login', (req: AuthRequest, res) => {
  const { email, password } = req.body
  if (!email || !password) { res.status(400).json({ success: false, error: '缺少邮箱或密码' }); return }
  const { user, needsSetup } = loginByPassword(email, password)
  if (!user) { res.status(401).json({ success: false, error: '邮箱或密码错误' }); return }
  if (needsSetup) {
    res.json({ success: true, syncToken: user.sync_token, needsSetup: true, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } })
    return
  }
  if (user.role === 'student') initStudentServices(user.id)
  res.json({ success: true, syncToken: user.sync_token, needsSetup: false, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } })
})

// ── 注册 ──────────────────────────────────────────
router.post('/register', (req: AuthRequest, res) => {
  const { email, password, displayName } = req.body
  if (!email || !password || !displayName) { res.status(400).json({ success: false, error: '缺少必填字段' }); return }
  if (password.length < 6) { res.status(400).json({ success: false, error: '密码至少 6 位' }); return }
  const existing = getUserByEmail(email)
  if (existing) { res.status(409).json({ success: false, error: '该邮箱已注册' }); return }

  const user = registerUser(email, password, displayName)
  res.json({ success: true, syncToken: user.sync_token, needsSetup: false, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } })
})

// ── 设置密码（首次） ───────────────────────────────
router.post('/setup-password', (req: AuthRequest, res) => {
  const { syncToken, password } = req.body
  if (!syncToken || !password) { res.status(400).json({ success: false, error: '缺少参数' }); return }
  const user = setupPassword(syncToken, password)
  if (!user) { res.status(401).json({ success: false, error: '无效的令牌' }); return }
  res.json({ success: true, syncToken: user.sync_token, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } })
})

// ── OTP 发送 ──────────────────────────────────────
router.post('/send-otp', async (req: AuthRequest, res) => {
  const { email } = req.body
  if (!email) { res.status(400).json({ success: false, error: '请输入邮箱' }); return }
  const cooldown = checkOtpCooldown(email)
  if (cooldown > 0) { res.status(429).json({ success: false, error: `请 ${cooldown} 秒后再试` }); return }

  const code = createOtp(email)
  const sent = await sendOtpEmail(email, code)
  if (!sent) {
    console.log(`[OTP] Dev mode — code for ${email}: ${code}`)
  }
  res.json({ success: true })
})

// ── OTP 验证 ──────────────────────────────────────
router.post('/verify-otp', (req: AuthRequest, res) => {
  const { email, code, inviteCode } = req.body
  if (!email || !code) { res.status(400).json({ success: false, error: '缺少邮箱或验证码' }); return }

  const valid = verifyOtp(email, code)
  if (!valid) { res.status(401).json({ success: false, error: '验证码错误或已过期' }); return }

  let user = getUserByEmail(email)
  if (user) {
    if (user.role === 'student') initStudentServices(user.id)
    res.json({ success: true, syncToken: user.sync_token, needsSetup: !user.has_set_password, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } })
  } else if (inviteCode) {
    // 有邀请码 → 需要完善注册
    res.json({ success: true, syncToken: null, needsSetup: true, inviteCode, email })
  } else {
    res.status(404).json({ success: false, error: '该邮箱尚未注册，需要邀请码' })
  }
})

// ── 邀请码查询 ────────────────────────────────────
router.get('/join/:code', (req: AuthRequest, res) => {
  const info = getJoinInfo(req.params.code)
  if (!info) { res.status(404).json({ success: false, error: '邀请码无效' }); return }
  res.json({ success: true, data: info })
})

// ── 邀请码激活 ────────────────────────────────────
router.post('/join/:code', (req: AuthRequest, res) => {
  const { displayName, password, email } = req.body
  if (!password || password.length < 6) { res.status(400).json({ success: false, error: '密码至少 6 位' }); return }
  const user = activateJoin(req.params.code, password, displayName, email)
  if (!user) { res.status(404).json({ success: false, error: '邀请码无效' }); return }
  initStudentServices(user.id)
  res.json({ success: true, syncToken: user.sync_token, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } })
})

// ── 当前用户 ──────────────────────────────────────
router.get('/me', requireAuth, (req: AuthRequest, res) => {
  const user = getUserById(req.userId!)
  if (!user) { res.status(404).json({ success: false, error: '用户不存在' }); return }
  res.json({ success: true, data: user })
})

// ── 修改密码 ──────────────────────────────────────
router.post('/change-password', requireAuth, (req: AuthRequest, res) => {
  const { oldPassword, newPassword } = req.body
  if (!newPassword || newPassword.length < 6) { res.status(400).json({ success: false, error: '新密码至少 6 位' }); return }
  const ok = changePassword(req.userId!, newPassword, oldPassword)
  if (!ok) { res.status(401).json({ success: false, error: '旧密码错误' }); return }
  res.json({ success: true })
})

// ── 绑定邮箱 ──────────────────────────────────────
router.post('/bind-email', requireAuth, (req: AuthRequest, res) => {
  const { email, code } = req.body
  if (!email || !code) { res.status(400).json({ success: false, error: '缺少参数' }); return }
  const valid = verifyOtp(email, code)
  if (!valid) { res.status(401).json({ success: false, error: '验证码错误或已过期' }); return }
  const ok = bindEmail(req.userId!, email)
  if (!ok) { res.status(409).json({ success: false, error: '该邮箱已被其他账户绑定' }); return }
  res.json({ success: true })
})

// ── 监护人设置 ────────────────────────────────────
router.post('/setup', requireAuth, (req: AuthRequest, res) => {
  const { guardianName } = req.body
  if (!guardianName) { res.status(400).json({ success: false, error: '缺少名称' }); return }
  const db = require('../database').getDB()
  db.prepare('UPDATE User SET display_name = ?, update_time = ? WHERE id = ?')
    .run(guardianName, Date.now(), req.userId!)
  res.json({ success: true })
})

router.post('/complete-setup', requireAuth, (req: AuthRequest, res) => {
  const { displayName, password } = req.body
  const db = require('../database').getDB()
  const now = Date.now()
  if (displayName) {
    db.prepare('UPDATE User SET display_name = ?, has_set_password = 1, update_time = ? WHERE id = ?')
      .run(displayName, now, req.userId!)
  } else {
    db.prepare('UPDATE User SET has_set_password = 1, update_time = ? WHERE id = ?').run(now, req.userId!)
  }
  if (password && password.length >= 6) {
    const bcrypt = require('bcryptjs')
    const hash = bcrypt.hashSync(password, 10)
    db.prepare('UPDATE User SET password_hash = ?, update_time = ? WHERE id = ?').run(hash, now, req.userId!)
  }
  const user = getUserById(req.userId!)
  res.json({ success: true, user })
})

// ── 学生管理 ──────────────────────────────────────
router.get('/students', requireAuth, requireGuardian, (req: AuthRequest, res) => {
  const students = listStudents(req.userId!)
  res.json({ success: true, data: students })
})

router.post('/students', requireAuth, requireGuardian, (req: AuthRequest, res) => {
  const { name, grade } = req.body
  if (!name) { res.status(400).json({ success: false, error: '缺少学生姓名' }); return }
  const student = createStudent(req.userId!, name, grade)
  initStudentServices(student.id)
  res.json({ success: true, data: student })
})

router.delete('/students/:id', requireAuth, requireGuardian, (req: AuthRequest, res) => {
  const db = require('../database').getDB()
  db.prepare('UPDATE User SET delete_flag = 1, update_time = ? WHERE id = ? AND guardian_id = ?')
    .run(Date.now(), req.params.id, req.userId!)
  res.json({ success: true })
})

router.post('/students/:id/reset-invite', requireAuth, requireGuardian, (req: AuthRequest, res) => {
  const inviteCode = resetStudentAccess(req.params.id)
  res.json({ success: true, inviteCode })
})

router.post('/students/:id/reset-token', requireAuth, requireGuardian, (req: AuthRequest, res) => {
  const token = resetToken(req.params.id)
  res.json({ success: true, data: { token } })
})

// ── 重置当前用户 Token ────────────────────────────
router.post('/reset-token', requireAuth, (req: AuthRequest, res) => {
  const newToken = resetToken(req.userId!)
  res.json({ success: true, data: { syncToken: newToken } })
})

export default router
