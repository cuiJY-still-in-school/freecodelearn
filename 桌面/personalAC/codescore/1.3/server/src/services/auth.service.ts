import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'

export interface UserInfo {
  id: string
  displayName: string | null
  role: string
  studentName: string | null
  studentGrade: string | null
  guardianId: string | null
}

export interface StudentRecord {
  id: string
  name: string
  grade: string | null
  token: string
}

export interface LoginResult {
  success: boolean
  user?: UserInfo
  syncToken?: string
  error?: string
}

export function ensureAdminAccount(): { syncToken: string } {
  const db = getDB()
  const existing = db
    .prepare("SELECT id, sync_token FROM User WHERE username = 'admin' AND delete_flag = 0")
    .get() as { id: string; sync_token: string } | undefined

  if (existing) return { syncToken: existing.sync_token }

  const syncToken = uuidv4()
  const now = Date.now()
  db.prepare(`
    INSERT INTO User (id, username, sync_token, role, create_time, update_time, delete_flag)
    VALUES (?, 'admin', ?, 'guardian', ?, ?, 0)
  `).run(uuidv4(), syncToken, now, now)

  console.log('[Auth] Created admin account')
  return { syncToken }
}

export function loginByToken(syncToken: string): LoginResult {
  const db = getDB()
  const user = db
    .prepare('SELECT id, display_name, role, student_name, student_grade, guardian_id FROM User WHERE sync_token = ? AND delete_flag = 0')
    .get(syncToken) as {
      id: string; display_name: string | null; role: string
      student_name: string | null; student_grade: string | null; guardian_id: string | null
    } | undefined

  if (!user) return { success: false, error: '访问码错误' }

  return {
    success: true,
    syncToken,
    user: {
      id: user.id,
      displayName: user.display_name ?? null,
      role: user.role ?? 'guardian',
      studentName: user.student_name ?? null,
      studentGrade: user.student_grade ?? null,
      guardianId: user.guardian_id ?? null
    }
  }
}

export function getUserBySyncToken(syncToken: string): UserInfo | null {
  const db = getDB()
  const user = db
    .prepare('SELECT id, display_name, role, student_name, student_grade, guardian_id FROM User WHERE sync_token = ? AND delete_flag = 0')
    .get(syncToken) as {
      id: string; display_name: string | null; role: string
      student_name: string | null; student_grade: string | null; guardian_id: string | null
    } | undefined

  if (!user) return null
  return {
    id: user.id,
    displayName: user.display_name ?? null,
    role: user.role ?? 'guardian',
    studentName: user.student_name ?? null,
    studentGrade: user.student_grade ?? null,
    guardianId: user.guardian_id ?? null
  }
}

export function setupGuardian(userId: string, guardianName: string): void {
  const db = getDB()
  db.prepare('UPDATE User SET display_name = ?, update_time = ? WHERE id = ?')
    .run(guardianName.trim(), Date.now(), userId)
}

// 创建学生账户，绑定到监护人
export function createStudent(guardianId: string, name: string, grade?: string): StudentRecord {
  const db = getDB()
  const id = uuidv4()
  const token = uuidv4()
  const now = Date.now()
  db.prepare(`
    INSERT INTO User (id, username, sync_token, display_name, role, guardian_id, student_grade, create_time, update_time, delete_flag)
    VALUES (?, ?, ?, ?, 'student', ?, ?, ?, ?, 0)
  `).run(id, `student_${id.slice(0, 8)}`, token, name.trim(), guardianId, grade ?? null, now, now)
  return { id, name: name.trim(), grade: grade ?? null, token }
}

// 列出监护人名下所有学生
export function listStudents(guardianId: string): StudentRecord[] {
  const db = getDB()
  return (db.prepare(
    'SELECT id, display_name, student_grade, sync_token FROM User WHERE guardian_id = ? AND role = ? AND delete_flag = 0 ORDER BY create_time ASC'
  ).all(guardianId, 'student') as Array<{
    id: string; display_name: string; student_grade: string | null; sync_token: string
  }>).map(r => ({ id: r.id, name: r.display_name, grade: r.student_grade, token: r.sync_token }))
}

// 删除（软删）学生账户
export function deleteStudent(studentId: string, guardianId: string): boolean {
  const db = getDB()
  const result = db.prepare(
    'UPDATE User SET delete_flag = 1, update_time = ? WHERE id = ? AND guardian_id = ?'
  ).run(Date.now(), studentId, guardianId)
  return result.changes > 0
}

// 重置 syncToken
export function resetSyncToken(userId: string): LoginResult {
  const db = getDB()
  const user = db.prepare('SELECT id FROM User WHERE id = ? AND delete_flag = 0').get(userId) as { id: string } | undefined
  if (!user) return { success: false, error: '用户不存在' }
  const newToken = uuidv4()
  db.prepare('UPDATE User SET sync_token = ?, update_time = ? WHERE id = ?').run(newToken, Date.now(), user.id)
  return { success: true, syncToken: newToken }
}

// 获取监护人名下第一个学生的 ID（工具调用时用）
export function getPrimaryStudentId(guardianId: string): string | null {
  const db = getDB()
  const row = db.prepare(
    'SELECT id FROM User WHERE guardian_id = ? AND role = ? AND delete_flag = 0 ORDER BY create_time ASC LIMIT 1'
  ).get(guardianId, 'student') as { id: string } | undefined
  return row?.id ?? null
}
