import { Request, Response, NextFunction } from 'express'
import { getUserBySyncToken } from '../services/auth.service'

export interface AuthRequest extends Request {
  userId?: string
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers['x-sync-token'] as string || req.cookies?.syncToken

  if (!token) {
    res.status(401).json({ success: false, error: '未登录，请先登录' })
    return
  }

  const user = getUserBySyncToken(token)
  if (!user) {
    res.status(401).json({ success: false, error: '访问码无效，请重新登录' })
    return
  }

  req.userId = user.id
  next()
}
