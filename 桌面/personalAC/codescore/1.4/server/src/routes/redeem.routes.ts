import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { getDB } from '../database'

const router = Router()

const WECHAT_ID = 'kaixin_jason'
const MONTH_MS = 30 * 24 * 60 * 60 * 1000

// ── 生成兑换码（仅监护人/管理员）──────────────────────────────────────────
router.post('/generate', requireAuth, (req: AuthRequest, res) => {
  if (req.userRole !== 'guardian' && req.userRole !== 'admin' && req.userRole !== 'superadmin') {
    res.status(403).json({ success: false, error: '无权限' }); return
  }
  const { count = 1, note } = req.body as { count?: number; note?: string }
  const db = getDB()
  const n = Math.min(Math.max(1, Number(count) || 1), 50)
  const codes: string[] = []
  const now = Date.now()

  for (let i = 0; i < n; i++) {
    const code = generateCode()
    db.prepare(
      `INSERT INTO RedeemCode (id, code, note, create_time) VALUES (?, ?, ?, ?)`
    ).run(uuidv4(), code, note ?? null, now)
    codes.push(code)
  }

  res.json({ success: true, data: { codes } })
})

// ── 列出所有兑换码（仅管理员查看）────────────────────────────────────────
router.get('/list', requireAuth, (req: AuthRequest, res) => {
  if (req.userRole !== 'admin' && req.userRole !== 'superadmin') {
    res.status(403).json({ success: false, error: '无权限' }); return
  }
  const db = getDB()
  const rows = db.prepare(
    `SELECT r.code, r.used_by, r.used_at, r.expires_at, r.note, r.create_time,
            u.display_name as used_by_name
     FROM RedeemCode r
     LEFT JOIN User u ON u.id = r.used_by
     ORDER BY r.create_time DESC LIMIT 200`
  ).all() as Array<{
    code: string; used_by: string | null; used_at: number | null
    expires_at: number | null; note: string | null; create_time: number
    used_by_name: string | null
  }>
  res.json({ success: true, data: rows })
})

// ── 兑换（已登录用户提交码）──────────────────────────────────────────────
router.post('/use', requireAuth, (req: AuthRequest, res) => {
  const { code } = req.body as { code: string }
  if (!code?.trim()) { res.status(400).json({ success: false, error: '请输入兑换码' }); return }

  const db = getDB()
  const row = db.prepare(
    `SELECT id, used_by FROM RedeemCode WHERE code = ?`
  ).get(code.trim().toUpperCase()) as { id: string; used_by: string | null } | undefined

  if (!row) { res.json({ success: false, error: '兑换码无效，请检查后重试' }); return }
  if (row.used_by) { res.json({ success: false, error: '此兑换码已被使用' }); return }

  const now = Date.now()
  const expiresAt = now + MONTH_MS

  db.prepare(
    `UPDATE RedeemCode SET used_by=?, used_at=?, expires_at=? WHERE id=?`
  ).run(req.userId!, now, expiresAt, row.id)

  db.prepare(
    `UPDATE User SET sub_expires_at=? WHERE id=?`
  ).run(expiresAt, req.userId!)

  const expireStr = new Date(expiresAt).toLocaleDateString('zh-CN')
  res.json({ success: true, data: { expiresAt, expireStr } })
})

// ── 查询当前订阅状态 ──────────────────────────────────────────────────────
router.get('/status', requireAuth, (req: AuthRequest, res) => {
  const db = getDB()
  const user = db.prepare(
    `SELECT sub_expires_at FROM User WHERE id=? AND delete_flag=0`
  ).get(req.userId!) as { sub_expires_at: number | null } | undefined

  const expiresAt = user?.sub_expires_at ?? null
  const active = expiresAt !== null && expiresAt > Date.now()
  const daysLeft = expiresAt ? Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)) : 0

  res.json({
    success: true,
    data: {
      active,
      expiresAt,
      daysLeft: active ? daysLeft : 0,
      wechatId: WECHAT_ID,
    }
  })
})

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const db = getDB()
  let code: string
  do {
    code = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    code = code.slice(0, 4) + '-' + code.slice(4, 8) + '-' + code.slice(8, 12)
  } while (db.prepare('SELECT id FROM RedeemCode WHERE code=?').get(code))
  return code
}

export default router
