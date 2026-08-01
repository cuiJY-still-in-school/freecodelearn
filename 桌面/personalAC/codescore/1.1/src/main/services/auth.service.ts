import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'
import log from 'electron-log'

export interface AuthResult {
  success: boolean
  data?: {
    token?: string
    userId?: string
    username?: string
    role?: string
    message?: string
  }
  error?: string
}

export interface UserInfo {
  id: string
  username: string
  role: string
}

const SESSION_EXPIRES_HOURS = 24
const MAX_LOGIN_FAIL = 5
const LOCK_DURATION_MINUTES = 10
const SALT_ROUNDS = 10

export function register(
  username: string,
  password: string,
  role: 'guardian' | 'student'
): AuthResult {
  try {
    const db = getDB()

    // Check if username already exists
    const existing = db
      .prepare('SELECT id FROM User WHERE username = ? AND delete_flag = 0')
      .get(username)
    if (existing) {
      return { success: false, error: '用户名已存在' }
    }

    // Check if this is the first guardian — becomes admin
    let finalRole: string = role
    if (role === 'guardian') {
      const guardianCount = db
        .prepare("SELECT COUNT(*) as cnt FROM User WHERE role IN ('guardian', 'admin') AND delete_flag = 0")
        .get() as { cnt: number }
      if (guardianCount.cnt === 0) {
        finalRole = 'admin'
      }
    }

    const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS)
    const id = uuidv4()
    const now = Date.now()

    db.prepare(`
      INSERT INTO User (id, username, password_hash, role, create_user, update_user, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, username, passwordHash, finalRole, id, id, now, now)

    log.info(`User registered: ${username}, role: ${finalRole}`)
    return {
      success: true,
      data: { userId: id, username, role: finalRole, message: '注册成功' }
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('Register error:', error)
    return { success: false, error }
  }
}

export function login(username: string, password: string): AuthResult {
  try {
    const db = getDB()
    const now = Date.now()

    const user = db
      .prepare(
        'SELECT id, username, password_hash, role, login_fail_count, locked_until FROM User WHERE username = ? AND delete_flag = 0'
      )
      .get(username) as
      | {
          id: string
          username: string
          password_hash: string
          role: string
          login_fail_count: number
          locked_until: number | null
        }
      | undefined

    if (!user) {
      return { success: false, error: '用户名或密码错误' }
    }

    // Check if account is locked
    if (user.locked_until && user.locked_until > now) {
      const remainMinutes = Math.ceil((user.locked_until - now) / 60000)
      return { success: false, error: `账户已锁定，请 ${remainMinutes} 分钟后再试` }
    }

    const passwordMatch = bcrypt.compareSync(password, user.password_hash)

    if (!passwordMatch) {
      const newFailCount = user.login_fail_count + 1
      if (newFailCount >= MAX_LOGIN_FAIL) {
        const lockedUntil = now + LOCK_DURATION_MINUTES * 60 * 1000
        db.prepare(
          'UPDATE User SET login_fail_count = ?, locked_until = ?, update_time = ? WHERE id = ?'
        ).run(newFailCount, lockedUntil, now, user.id)
        return { success: false, error: `密码错误次数过多，账户已锁定 ${LOCK_DURATION_MINUTES} 分钟` }
      } else {
        db.prepare(
          'UPDATE User SET login_fail_count = ?, update_time = ? WHERE id = ?'
        ).run(newFailCount, now, user.id)
        return {
          success: false,
          error: `用户名或密码错误，还有 ${MAX_LOGIN_FAIL - newFailCount} 次机会`
        }
      }
    }

    // Reset fail count on success
    db.prepare(
      'UPDATE User SET login_fail_count = 0, locked_until = NULL, update_time = ? WHERE id = ?'
    ).run(now, user.id)

    // Create session
    const token = uuidv4()
    const sessionId = uuidv4()
    const expiresAt = now + SESSION_EXPIRES_HOURS * 60 * 60 * 1000

    db.prepare(`
      INSERT INTO Session (id, user_id, token, expires_at, create_user, update_user, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(sessionId, user.id, token, expiresAt, user.id, user.id, now, now)

    log.info(`User logged in: ${username}`)
    return {
      success: true,
      data: { token, userId: user.id, username: user.username, role: user.role }
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('Login error:', error)
    return { success: false, error }
  }
}

export function logout(token: string): AuthResult {
  try {
    const db = getDB()
    const now = Date.now()

    const result = db
      .prepare(
        'UPDATE Session SET delete_flag = 1, update_time = ? WHERE token = ? AND delete_flag = 0'
      )
      .run(now, token)

    if (result.changes === 0) {
      return { success: false, error: 'Token 不存在或已失效' }
    }

    log.info('User logged out')
    return { success: true, data: { message: '已退出登录' } }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('Logout error:', error)
    return { success: false, error }
  }
}

export function verifyToken(token: string): { valid: boolean; user?: UserInfo } {
  try {
    const db = getDB()
    const now = Date.now()

    const session = db
      .prepare(`
        SELECT s.user_id, s.expires_at, u.username, u.role
        FROM Session s
        JOIN User u ON u.id = s.user_id
        WHERE s.token = ? AND s.delete_flag = 0 AND u.delete_flag = 0
      `)
      .get(token) as
      | { user_id: string; expires_at: number; username: string; role: string }
      | undefined

    if (!session) {
      return { valid: false }
    }

    if (session.expires_at < now) {
      // Expire the session
      db.prepare(
        'UPDATE Session SET delete_flag = 1, update_time = ? WHERE token = ?'
      ).run(now, token)
      return { valid: false }
    }

    return {
      valid: true,
      user: { id: session.user_id, username: session.username, role: session.role }
    }
  } catch (err: unknown) {
    log.error('VerifyToken error:', err)
    return { valid: false }
  }
}

export function bindGuardian(token: string, studentId: string): AuthResult {
  try {
    const db = getDB()
    const now = Date.now()

    const tokenResult = verifyToken(token)
    if (!tokenResult.valid || !tokenResult.user) {
      return { success: false, error: 'Token 无效或已过期' }
    }

    const user = tokenResult.user
    if (user.role !== 'guardian' && user.role !== 'admin') {
      return { success: false, error: '只有监护人角色可以绑定学生' }
    }

    // Check student exists
    const student = db
      .prepare(
        "SELECT id FROM User WHERE id = ? AND role = 'student' AND delete_flag = 0"
      )
      .get(studentId)
    if (!student) {
      return { success: false, error: '学生不存在' }
    }

    // Check already bound
    const existingBinding = db
      .prepare(
        'SELECT id FROM GuardianStudentBinding WHERE guardian_id = ? AND student_id = ? AND delete_flag = 0'
      )
      .get(user.id, studentId)
    if (existingBinding) {
      return { success: false, error: '已绑定该学生' }
    }

    const bindingId = uuidv4()
    db.prepare(`
      INSERT INTO GuardianStudentBinding (id, guardian_id, student_id, create_user, update_user, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(bindingId, user.id, studentId, user.id, user.id, now, now)

    log.info(`Guardian ${user.id} bound to student ${studentId}`)
    return { success: true, data: { message: '绑定成功' } }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('BindGuardian error:', error)
    return { success: false, error }
  }
}

export function listUsers(token: string): AuthResult {
  try {
    const db = getDB()

    const tokenResult = verifyToken(token)
    if (!tokenResult.valid || !tokenResult.user) {
      return { success: false, error: 'Token 无效或已过期' }
    }

    const user = tokenResult.user
    if (user.role !== 'admin') {
      return { success: false, error: '只有管理员可以查看用户列表' }
    }

    const users = db
      .prepare(
        "SELECT id, username, role, create_time FROM User WHERE role IN ('student', 'guardian', 'admin') AND delete_flag = 0 ORDER BY create_time ASC"
      )
      .all() as Array<{ id: string; username: string; role: string; create_time: number }>

    return { success: true, data: users }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('listUsers error:', error)
    return { success: false, error }
  }
}
