import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { getDB } from '../database'

export interface UserInfo {
  id: string
  username: string
  display_name: string | null
  role: 'guardian' | 'student'
  student_grade: string | null
  guardian_id: string | null
  sync_token: string
  has_set_password: number
  email: string | null
}

// ── 管理员 ────────────────────────────────────────

export function ensureAdminAccount(): { syncToken: string } {
  const db = getDB()
  const existing = db.prepare(
    "SELECT id, sync_token FROM User WHERE username = 'admin' AND delete_flag = 0"
  ).get() as { id: string; sync_token: string } | undefined
  if (existing) return { syncToken: existing.sync_token }

  const syncToken = uuidv4()
  const now = Date.now()
  db.prepare(
    "INSERT INTO User (id, username, sync_token, display_name, role, create_time, update_time) VALUES (?, 'admin', ?, '管理员', 'guardian', ?, ?)"
  ).run(uuidv4(), syncToken, now, now)
  return { syncToken }
}

// ── 查询 ──────────────────────────────────────────

export function loginByToken(syncToken: string): UserInfo | null {
  const db = getDB()
  const user = db.prepare(
    'SELECT id, username, sync_token, display_name, role, student_grade, guardian_id, has_set_password, email FROM User WHERE sync_token = ? AND delete_flag = 0'
  ).get(syncToken) as UserInfo | undefined
  return user ?? null
}

export function getUserById(id: string): UserInfo | null {
  const db = getDB()
  const user = db.prepare(
    'SELECT id, username, sync_token, display_name, role, student_grade, guardian_id, has_set_password, email FROM User WHERE id = ? AND delete_flag = 0'
  ).get(id) as UserInfo | undefined
  return user ?? null
}

export function getUserByEmail(email: string): UserInfo | null {
  const db = getDB()
  const user = db.prepare(
    "SELECT id, username, sync_token, display_name, role, student_grade, guardian_id, has_set_password, email FROM User WHERE LOWER(email) = LOWER(?) AND delete_flag = 0"
  ).get(email) as UserInfo | undefined
  return user ?? null
}

// ── 密码登录 ──────────────────────────────────────

export function loginByPassword(email: string, password: string): { user: UserInfo | null; needsSetup: boolean } {
  const user = getUserByEmail(email)
  if (!user) return { user: null, needsSetup: false }
  if (!user.has_set_password) return { user, needsSetup: true }

  const db = getDB()
  const row = db.prepare('SELECT password_hash FROM User WHERE id = ?').get(user.id) as { password_hash: string | null } | undefined
  if (!row?.password_hash) return { user: null, needsSetup: false }

  const valid = bcrypt.compareSync(password, row.password_hash)
  if (!valid) return { user: null, needsSetup: false }
  return { user, needsSetup: false }
}

// ── 注册 ──────────────────────────────────────────

export function registerUser(email: string, password: string, displayName: string): UserInfo {
  const db = getDB()
  const id = uuidv4()
  const token = uuidv4()
  const now = Date.now()
  const hash = bcrypt.hashSync(password, 10)
  const username = `user_${id.slice(0, 8)}`

  db.prepare(
    "INSERT INTO User (id, username, sync_token, display_name, role, email, password_hash, has_set_password, sub_expires_at, create_time, update_time) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  ).run(id, username, token, displayName, 'guardian', email.toLowerCase().trim(), hash, 1, now + 7 * 86400000, now, now)

  return { id, username, sync_token: token, display_name: displayName, role: 'guardian', student_grade: null, guardian_id: null, has_set_password: 1, email }
}

// ── 设置密码 ──────────────────────────────────────

export function setupPassword(syncToken: string, password: string): UserInfo | null {
  const db = getDB()
  const user = db.prepare(
    'SELECT id FROM User WHERE sync_token = ? AND delete_flag = 0'
  ).get(syncToken) as { id: string } | undefined
  if (!user) return null

  const hash = bcrypt.hashSync(password, 10)
  db.prepare('UPDATE User SET password_hash = ?, has_set_password = 1, update_time = ? WHERE id = ?')
    .run(hash, Date.now(), user.id)
  return getUserById(user.id)
}

// ── OTP ──────────────────────────────────────────

export function createOtp(email: string): string {
  const db = getDB()
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const id = uuidv4()
  const now = Date.now()
  const expiresAt = now + 10 * 60_000

  db.prepare('INSERT INTO OtpCode (id, email, code, expires_at, create_time) VALUES (?,?,?,?,?)')
    .run(id, email.toLowerCase().trim(), code, expiresAt, now)
  return code
}

export function verifyOtp(email: string, code: string): boolean {
  const db = getDB()
  const now = Date.now()
  const row = db.prepare(
    'SELECT * FROM OtpCode WHERE LOWER(email) = LOWER(?) AND code = ? AND used = 0 AND expires_at > ? ORDER BY create_time DESC LIMIT 1'
  ).get(email, code, now) as any
  if (!row) return false
  db.prepare('UPDATE OtpCode SET used = 1 WHERE id = ?').run(row.id)
  return true
}

export function checkOtpCooldown(email: string): number {
  const db = getDB()
  const last = db.prepare(
    'SELECT MAX(create_time) as t FROM OtpCode WHERE LOWER(email) = LOWER(?)'
  ).get(email) as { t: number | null }
  if (!last?.t) return 0
  const elapsed = Date.now() - last.t
  const cooldown = 60_000
  return elapsed < cooldown ? Math.ceil((cooldown - elapsed) / 1000) : 0
}

// ── 学生管理 ──────────────────────────────────────

export function createStudent(guardianId: string, name: string, grade?: string): UserInfo & { inviteCode: string } {
  const db = getDB()
  const id = uuidv4()
  const token = uuidv4()
  const now = Date.now()
  const username = `student_${id.slice(0, 8)}`
  const inviteCode = generateInviteCode()

  db.prepare(
    "INSERT INTO User (id, username, sync_token, display_name, role, student_grade, guardian_id, invite_code, create_time, update_time) VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).run(id, username, token, name, 'student', grade || null, guardianId, inviteCode, now, now)

  return { id, username, sync_token: token, display_name: name, role: 'student', student_grade: grade || null, guardian_id: guardianId, has_set_password: 0, email: null, inviteCode }
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export function listStudents(guardianId: string): UserInfo[] {
  const db = getDB()
  return db.prepare(
    "SELECT id, username, sync_token, display_name, role, student_grade, guardian_id, has_set_password, email FROM User WHERE guardian_id = ? AND role = 'student' AND delete_flag = 0"
  ).all(guardianId) as UserInfo[]
}

export function getJoinInfo(code: string): { studentName: string; guardianName: string; isActivated: boolean } | null {
  const db = getDB()
  const student = db.prepare(
    'SELECT display_name, has_set_password, guardian_id FROM User WHERE invite_code = ? AND role = ? AND delete_flag = 0'
  ).get(code, 'student') as any
  if (!student) return null

  const guardian = db.prepare(
    'SELECT display_name FROM User WHERE id = ? AND delete_flag = 0'
  ).get(student.guardian_id) as any

  return {
    studentName: student.display_name,
    guardianName: guardian?.display_name || '家长',
    isActivated: student.has_set_password === 1,
  }
}

export function activateJoin(code: string, password: string, displayName?: string, email?: string): UserInfo | null {
  const db = getDB()
  const student = db.prepare(
    'SELECT id FROM User WHERE invite_code = ? AND role = ? AND delete_flag = 0'
  ).get(code, 'student') as any
  if (!student) return null

  const hash = bcrypt.hashSync(password, 10)
  const newToken = uuidv4()
  const now = Date.now()

  const updates: string[] = ['password_hash = ?', 'has_set_password = 1', 'sync_token = ?', 'update_time = ?']
  const params: any[] = [hash, newToken, now]

  if (displayName) { updates.push('display_name = ?'); params.push(displayName) }
  if (email) { updates.push('email = ?'); params.push(email.toLowerCase().trim()) }
  params.push(student.id)

  db.prepare(`UPDATE User SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  return getUserById(student.id)
}

// ── 重置 ──────────────────────────────────────────

export function resetToken(userId: string): string {
  const db = getDB()
  const newToken = uuidv4()
  db.prepare('UPDATE User SET sync_token = ?, update_time = ? WHERE id = ?')
    .run(newToken, Date.now(), userId)
  return newToken
}

export function resetStudentAccess(studentId: string): string {
  const db = getDB()
  const inviteCode = generateInviteCode()
  const newToken = uuidv4()
  db.prepare('UPDATE User SET invite_code = ?, sync_token = ?, password_hash = NULL, has_set_password = 0, update_time = ? WHERE id = ?')
    .run(inviteCode, newToken, Date.now(), studentId)
  return inviteCode
}

export function changePassword(userId: string, newPassword: string, oldPassword?: string): boolean {
  const db = getDB()
  const user = db.prepare('SELECT password_hash FROM User WHERE id = ?').get(userId) as any
  if (user?.password_hash && oldPassword) {
    const valid = bcrypt.compareSync(oldPassword, user.password_hash)
    if (!valid) return false
  }
  const hash = bcrypt.hashSync(newPassword, 10)
  db.prepare('UPDATE User SET password_hash = ?, has_set_password = 1, update_time = ? WHERE id = ?')
    .run(hash, Date.now(), userId)
  return true
}

export function bindEmail(userId: string, email: string): boolean {
  const db = getDB()
  const existing = db.prepare(
    'SELECT id FROM User WHERE LOWER(email) = LOWER(?) AND id != ? AND delete_flag = 0'
  ).get(email, userId)
  if (existing) return false
  db.prepare('UPDATE User SET email = ?, update_time = ? WHERE id = ?')
    .run(email.toLowerCase().trim(), Date.now(), userId)
  return true
}
