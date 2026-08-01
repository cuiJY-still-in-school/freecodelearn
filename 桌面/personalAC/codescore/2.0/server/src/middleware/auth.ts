import { Request, Response, NextFunction } from 'express'
import { getDB } from '../database'

export interface AuthRequest extends Request {
  userId?: string
  userRole?: string
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = (req.headers['x-sync-token'] as string) || req.cookies?.syncToken
  if (!token) { res.status(401).json({ success: false, error: '未提供访问令牌' }); return }

  const db = getDB()
  const user = db.prepare(
    'SELECT id, role FROM User WHERE sync_token = ? AND delete_flag = 0'
  ).get(token) as { id: string; role: string } | undefined

  if (!user) { res.status(401).json({ success: false, error: '无效的访问令牌' }); return }

  req.userId = user.id
  req.userRole = user.role
  next()
}

export function requireGuardian(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.userRole !== 'guardian') {
    res.status(403).json({ success: false, error: '仅家长可访问' })
    return
  }
  next()
}

export function canAccessStudent(req: AuthRequest, studentId: string): boolean {
  if (!req.userId) return false
  if (req.userRole === 'student') return req.userId === studentId
  // guardian: check binding
  const db = getDB()
  const linked = db.prepare(
    'SELECT id FROM User WHERE id = ? AND guardian_id = ? AND delete_flag = 0'
  ).get(studentId, req.userId)
  return !!linked
}

export function getPrimaryStudentId(guardianId: string): string | null {
  const db = getDB()
  const student = db.prepare(
    "SELECT id FROM User WHERE guardian_id = ? AND role = 'student' AND delete_flag = 0 LIMIT 1"
  ).get(guardianId) as { id: string } | undefined
  return student?.id || null
}
