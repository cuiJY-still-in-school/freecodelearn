import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { buildWeekReport, renderReportHTML } from '../services/report.service'
import { getPrimaryStudentId } from '../services/auth.service'
import { getDB } from '../database'

const router = Router()
router.use(requireAuth)

// GET /api/report/weekly — 返回学情周报 HTML（可打印为 PDF）
router.get('/weekly', (req: AuthRequest, res) => {
  const db = getDB()
  const user = db.prepare('SELECT role FROM User WHERE id = ? AND delete_flag = 0').get(req.userId!) as { role: string } | undefined
  const studentId = user?.role === 'student' ? req.userId! : (getPrimaryStudentId(req.userId!) ?? req.userId!)

  const report = buildWeekReport(studentId)
  const html = renderReportHTML(report)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(html)
})

// GET /api/report/weekly/json — 返回原始数据
router.get('/weekly/json', (req: AuthRequest, res) => {
  const db = getDB()
  const user = db.prepare('SELECT role FROM User WHERE id = ? AND delete_flag = 0').get(req.userId!) as { role: string } | undefined
  const studentId = user?.role === 'student' ? req.userId! : (getPrimaryStudentId(req.userId!) ?? req.userId!)

  res.json({ success: true, data: buildWeekReport(studentId) })
})

export default router
