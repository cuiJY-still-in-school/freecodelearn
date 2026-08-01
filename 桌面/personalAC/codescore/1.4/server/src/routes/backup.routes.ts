import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { performBackup, listBackups, getBackupPath } from '../services/backup.service'
import path from 'path'

const router = Router()
router.use(requireAuth)

// Only guardians and admins can access backup
function requireGuardianOrAdmin(req: AuthRequest, res: Parameters<typeof requireAuth>[1], next: Parameters<typeof requireAuth>[2]): void {
  const role = req.userRole
  if (role !== 'guardian' && role !== 'admin' && role !== 'superadmin') {
    res.status(403).json({ success: false, error: '无权限' }); return
  }
  next()
}

// GET /api/backup/list
router.get('/list', requireGuardianOrAdmin, (_req, res) => {
  res.json({ success: true, data: listBackups() })
})

// POST /api/backup/now
router.post('/now', requireGuardianOrAdmin, (_req, res) => {
  const result = performBackup()
  if (result.success) {
    res.json({ success: true, data: { filename: result.filename, backups: listBackups() } })
  } else {
    res.json({ success: false, error: result.error })
  }
})

// GET /api/backup/download/:filename
router.get('/download/:filename', requireGuardianOrAdmin, (req, res) => {
  const filePath = getBackupPath(req.params.filename)
  if (!filePath) {
    res.status(404).json({ success: false, error: '备份文件不存在' }); return
  }
  res.download(filePath, req.params.filename)
})

export default router
