import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { getDB } from '../database'

export interface UserInfo {
  id: string
  username: string
  email: string | null
  displayName: string | null
  role: string
  studentName: string | null
  studentGrade: string | null
  guardianId: string | null
  hasSetPassword: boolean
}

export interface StudentRecord {
  id: string
  name: string
  grade: string | null
  token: string
  inviteCode: string | null
  hasSetPassword: boolean
}

export interface LoginResult {
  success: boolean
  user?: UserInfo
  syncToken?: string
  needsSetup?: boolean
  error?: string
}

function rowToUserInfo(row: {
  id: string; username: string; email?: string | null; display_name: string | null; role: string
  student_name: string | null; student_grade: string | null; guardian_id: string | null
  has_set_password: number | null
}): UserInfo {
  return {
    id: row.id,
    username: row.username,
    email: row.email ?? null,
    displayName: row.display_name ?? null,
    role: row.role ?? 'guardian',
    studentName: row.student_name ?? null,
    studentGrade: row.student_grade ?? null,
    guardianId: row.guardian_id ?? null,
    hasSetPassword: (row.has_set_password ?? 0) === 1
  }
}

// ── Email 登录 ────────────────────────────────────────────────────────────

export function loginWithEmail(email: string, password: string): LoginResult {
  const db = getDB()
  const user = db
    .prepare(`SELECT id, username, email, display_name, role, student_name, student_grade, guardian_id,
                     has_set_password, sync_token, password_hash
              FROM User WHERE email = ? AND delete_flag = 0`)
    .get(email.trim().toLowerCase()) as ({
      id: string; username: string; email: string; display_name: string | null; role: string
      student_name: string | null; student_grade: string | null; guardian_id: string | null
      has_set_password: number | null; sync_token: string; password_hash: string | null
    }) | undefined

  if (!user) return { success: false, error: '邮箱或密码错误' }

  if (!user.password_hash) {
    return { success: true, syncToken: user.sync_token, needsSetup: true, user: rowToUserInfo(user) }
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return { success: false, error: '邮箱或密码错误' }
  }

  return { success: true, syncToken: user.sync_token, needsSetup: false, user: rowToUserInfo(user) }
}

// ── 注册新用户 ────────────────────────────────────────────────────────────

export function registerUser(email: string, password: string, displayName: string): LoginResult {
  const db = getDB()
  const norm = email.trim().toLowerCase()

  if (!norm || !norm.includes('@')) return { success: false, error: '请输入有效的邮箱' }
  if (password.length < 6) return { success: false, error: '密码至少 6 位' }
  if (!displayName.trim()) return { success: false, error: '请输入昵称' }

  const existing = db.prepare('SELECT id FROM User WHERE email = ? AND delete_flag = 0').get(norm)
  if (existing) return { success: false, error: '该邮箱已注册' }

  const id = uuidv4()
  const syncToken = uuidv4()
  const hash = bcrypt.hashSync(password, 10)
  const now = Date.now()
  const trialExpires = now + 7 * 24 * 60 * 60 * 1000 // 7-day free trial

  db.prepare(`
    INSERT INTO User (id, username, email, sync_token, display_name, role, password_hash,
                      has_set_password, create_time, update_time, delete_flag, sub_expires_at)
    VALUES (?, ?, ?, ?, ?, 'guardian', ?, 1, ?, ?, 0, ?)
  `).run(id, `user_${id.slice(0, 8)}`, norm, syncToken, displayName.trim(), hash, now, now, trialExpires)

  const user = db.prepare(
    `SELECT id, username, email, display_name, role, student_name, student_grade, guardian_id, has_set_password
     FROM User WHERE id = ? AND delete_flag = 0`
  ).get(id) as Parameters<typeof rowToUserInfo>[0]

  return { success: true, syncToken, needsSetup: false, user: rowToUserInfo(user) }
}

// ── Admin 设置密码（首次）────────────────────────────────────────────────

export function setupAdminPassword(syncToken: string, password: string): LoginResult {
  const db = getDB()
  const user = db
    .prepare(`SELECT id, username, email, display_name, role, student_name, student_grade, guardian_id,
                     has_set_password, sync_token
              FROM User WHERE sync_token = ? AND delete_flag = 0`)
    .get(syncToken) as ({ id: string; username: string; email: string; display_name: string | null; role: string
      student_name: string | null; student_grade: string | null; guardian_id: string | null
      has_set_password: number | null; sync_token: string
    }) | undefined

  if (!user) return { success: false, error: '访问码无效' }
  if (password.length < 6) return { success: false, error: '密码至少 6 位' }

  db.prepare('UPDATE User SET password_hash = ?, has_set_password = 1, update_time = ? WHERE id = ?')
    .run(bcrypt.hashSync(password, 10), Date.now(), user.id)

  return { success: true, syncToken, user: rowToUserInfo(user) }
}

// ── 修改密码 ──────────────────────────────────────────────────────────────

export function changePassword(userId: string, oldPassword: string, newPassword: string): { success: boolean; error?: string } {
  const db = getDB()
  const user = db.prepare('SELECT password_hash FROM User WHERE id = ? AND delete_flag = 0').get(userId) as { password_hash: string | null } | undefined
  if (!user) return { success: false, error: '用户不存在' }
  if (user.password_hash && !bcrypt.compareSync(oldPassword, user.password_hash)) {
    return { success: false, error: '原密码错误' }
  }
  if (newPassword.length < 6) return { success: false, error: '新密码至少 6 位' }
  db.prepare('UPDATE User SET password_hash = ?, has_set_password = 1, update_time = ? WHERE id = ?')
    .run(bcrypt.hashSync(newPassword, 10), Date.now(), userId)
  return { success: true }
}

// ── Session ────────────────────────────────────────────────────────────────

export function getUserBySyncToken(syncToken: string): UserInfo | null {
  const db = getDB()
  const user = db
    .prepare(`SELECT id, username, email, display_name, role, student_name, student_grade, guardian_id, has_set_password
              FROM User WHERE sync_token = ? AND delete_flag = 0`)
    .get(syncToken) as Parameters<typeof rowToUserInfo>[0] | undefined
  if (!user) return null
  return rowToUserInfo(user)
}

export function resetSyncToken(userId: string): LoginResult {
  const db = getDB()
  const user = db.prepare('SELECT id FROM User WHERE id = ? AND delete_flag = 0').get(userId) as { id: string } | undefined
  if (!user) return { success: false, error: '用户不存在' }
  const newToken = uuidv4()
  db.prepare('UPDATE User SET sync_token = ?, update_time = ? WHERE id = ?').run(newToken, Date.now(), user.id)
  return { success: true, syncToken: newToken }
}

// ── Legacy (兼容旧 token 登录，给 admin 首次设置用) ───────────────────────

export function loginByToken(syncToken: string): LoginResult {
  const db = getDB()
  const user = db
    .prepare(`SELECT id, username, email, display_name, role, student_name, student_grade, guardian_id,
                     has_set_password, sync_token
              FROM User WHERE sync_token = ? AND delete_flag = 0`)
    .get(syncToken) as ({
      id: string; username: string; email: string | null; display_name: string | null; role: string
      student_name: string | null; student_grade: string | null; guardian_id: string | null
      has_set_password: number | null; sync_token: string
    }) | undefined

  if (!user) return { success: false, error: '访问码错误' }
  const needsSetup = (user.has_set_password ?? 0) === 0
  return { success: true, syncToken, needsSetup, user: rowToUserInfo(user) }
}

// ── 学生管理（保留兼容性）────────────────────────────────────────────────

export function setupGuardian(userId: string, guardianName: string): void {
  getDB().prepare('UPDATE User SET display_name = ?, update_time = ? WHERE id = ?')
    .run(guardianName.trim(), Date.now(), userId)
}

export function createStudent(guardianId: string, name: string, grade?: string): StudentRecord {
  const db = getDB()
  const id = uuidv4()
  const token = uuidv4()
  const inviteCode = generateInviteCode()
  const now = Date.now()
  db.prepare(`
    INSERT INTO User (id, username, sync_token, display_name, role, guardian_id, student_grade,
                      has_set_password, invite_code, create_time, update_time, delete_flag)
    VALUES (?, ?, ?, ?, 'student', ?, ?, 0, ?, ?, ?, 0)
  `).run(id, `student_${id.slice(0, 8)}`, token, name.trim(), guardianId, grade ?? null, inviteCode, now, now)
  return { id, name: name.trim(), grade: grade ?? null, token, inviteCode, hasSetPassword: false }
}

export function listStudents(guardianId: string): StudentRecord[] {
  return (getDB().prepare(
    `SELECT id, display_name, student_grade, sync_token, invite_code, has_set_password
     FROM User WHERE guardian_id = ? AND role = 'student' AND delete_flag = 0 ORDER BY create_time ASC`
  ).all(guardianId) as Array<{
    id: string; display_name: string; student_grade: string | null
    sync_token: string; invite_code: string | null; has_set_password: number | null
  }>).map(r => ({
    id: r.id, name: r.display_name, grade: r.student_grade,
    token: r.sync_token, inviteCode: r.invite_code,
    hasSetPassword: (r.has_set_password ?? 0) === 1
  }))
}

export function deleteStudent(studentId: string, guardianId: string): boolean {
  const result = getDB().prepare(
    'UPDATE User SET delete_flag = 1, update_time = ? WHERE id = ? AND guardian_id = ?'
  ).run(Date.now(), studentId, guardianId)
  return result.changes > 0
}

// ── 邀请码系统 ────────────────────────────────────────────────────────────

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateInviteCode(): string {
  const db = getDB()
  let code: string
  do {
    code = Array.from({ length: 8 }, () => INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)]).join('')
  } while (db.prepare('SELECT id FROM User WHERE invite_code = ?').get(code))
  return code
}

export interface InviteInfo {
  studentName: string
  guardianName: string
  isActivated: boolean
}

export function getInviteInfo(code: string): InviteInfo | null {
  const db = getDB()
  const row = db.prepare(`
    SELECT u.id, u.display_name, u.has_set_password, g.display_name AS guardian_name
    FROM User u
    LEFT JOIN User g ON g.id = u.guardian_id AND g.delete_flag = 0
    WHERE u.invite_code = ? AND u.role = 'student' AND u.delete_flag = 0
  `).get(code) as { id: string; display_name: string; has_set_password: number; guardian_name: string | null } | undefined
  if (!row) return null
  return {
    studentName: row.display_name,
    guardianName: row.guardian_name || '老师',
    isActivated: row.has_set_password === 1,
  }
}

export function acceptInvite(code: string, displayName: string, password: string, email?: string): { success: boolean; syncToken?: string; error?: string } {
  const db = getDB()
  const student = db.prepare(
    "SELECT id, has_set_password FROM User WHERE invite_code = ? AND role = 'student' AND delete_flag = 0"
  ).get(code) as { id: string; has_set_password: number } | undefined
  if (!student) return { success: false, error: '邀请码无效' }
  if (student.has_set_password) return { success: false, error: '此邀请码已被使用，账号已激活' }
  if (!password || password.length < 6) return { success: false, error: '密码至少 6 位' }

  const norm = email?.trim().toLowerCase() || null
  if (norm) {
    const dup = db.prepare('SELECT id FROM User WHERE email = ? AND delete_flag = 0').get(norm)
    if (dup) return { success: false, error: '该邮箱已被其他账号使用' }
  }

  const newSyncToken = uuidv4()
  db.prepare(`
    UPDATE User SET display_name = ?, email = COALESCE(?, email), password_hash = ?, has_set_password = 1,
      sync_token = ?, update_time = ? WHERE id = ?
  `).run(displayName.trim() || student.id, norm, bcrypt.hashSync(password, 10), newSyncToken, Date.now(), student.id)
  return { success: true, syncToken: newSyncToken }
}

export function resetInviteCode(studentId: string, guardianId: string): { success: boolean; inviteCode?: string } {
  const db = getDB()
  const student = db.prepare(
    "SELECT id FROM User WHERE id = ? AND guardian_id = ? AND role = 'student' AND delete_flag = 0"
  ).get(studentId, guardianId) as { id: string } | undefined
  if (!student) return { success: false }
  const newCode = generateInviteCode()
  db.prepare('UPDATE User SET invite_code = ?, has_set_password = 0, password_hash = NULL, sync_token = ?, update_time = ? WHERE id = ?')
    .run(newCode, uuidv4(), Date.now(), student.id)
  return { success: true, inviteCode: newCode }
}

export function getPrimaryStudentId(guardianId: string): string | null {
  const row = getDB().prepare(
    `SELECT id FROM User WHERE guardian_id = ? AND role = 'student' AND delete_flag = 0 ORDER BY create_time ASC LIMIT 1`
  ).get(guardianId) as { id: string } | undefined
  return row?.id ?? null
}
