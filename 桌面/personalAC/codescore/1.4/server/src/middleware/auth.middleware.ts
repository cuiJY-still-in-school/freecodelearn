import { Request, Response, NextFunction } from 'express'
import { getUserBySyncToken } from '../services/auth.service'

export interface AuthRequest extends Request {
  userId?: string
  userRole?: string
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers['x-sync-token'] as string || req.query?.token as string || req.cookies?.syncToken
  if (!token) { res.status(401).json({ success: false, error: '未登录' }); return }
  const user = getUserBySyncToken(token)
  if (!user) { res.status(401).json({ success: false, error: '登录已过期，请重新登录' }); return }
  req.userId = user.id
  req.userRole = user.role
  next()
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers['x-sync-token'] as string || req.cookies?.syncToken
  if (!token) { res.status(401).json({ success: false, error: '未登录' }); return }
  const user = getUserBySyncToken(token)
  if (!user) { res.status(401).json({ success: false, error: '登录已过期' }); return }
  if (user.role !== 'admin') { res.status(403).json({ success: false, error: '无权限' }); return }
  req.userId = user.id
  req.userRole = 'admin'
  next()
}

// 系统配置操作：admin 或 guardian 均可（单家庭部署中 guardian 即系统管理员）
export function requireAdminOrGuardian(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers['x-sync-token'] as string || req.cookies?.syncToken
  if (!token) { res.status(401).json({ success: false, error: '未登录' }); return }
  const user = getUserBySyncToken(token)
  if (!user) { res.status(401).json({ success: false, error: '登录已过期' }); return }
  if (user.role !== 'admin' && user.role !== 'guardian') {
    res.status(403).json({ success: false, error: '无权限' }); return
  }
  req.userId = user.id
  req.userRole = user.role
  next()
}
