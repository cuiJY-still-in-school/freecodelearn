import { Router } from 'express'
import { requireAuth, requireGuardian, AuthRequest } from '../middleware/auth'
import { listCommands, createCommand, deleteCommand, getGuardianOverview } from '../services/guardian.service'
import { getPrimaryStudentId } from '../middleware/auth'

const router = Router()

// 家长指令列表
router.get('/commands', requireAuth, requireGuardian, (req: AuthRequest, res) => {
  const commands = listCommands(req.userId!)
  res.json({ success: true, data: commands })
})

// 创建指令
router.post('/commands', requireAuth, requireGuardian, (req: AuthRequest, res) => {
  const { studentId, instruction, priority } = req.body
  if (!studentId || !instruction) { res.status(400).json({ success: false, error: '缺少 studentId 或 instruction' }); return }

  const cmd = createCommand(req.userId!, studentId, instruction, priority)
  res.json({ success: true, data: cmd })
})

// 删除指令
router.delete('/commands/:id', requireAuth, requireGuardian, (req: AuthRequest, res) => {
  deleteCommand(req.params.id)
  res.json({ success: true })
})

// 学生概览
router.get('/overview/:studentId', requireAuth, requireGuardian, (req: AuthRequest, res) => {
  const overview = getGuardianOverview(req.params.studentId)
  if (!overview) { res.status(404).json({ success: false, error: '学生不存在' }); return }
  res.json({ success: true, data: overview })
})

// 主学生概览
router.get('/overview', requireAuth, requireGuardian, (req: AuthRequest, res) => {
  const studentId = getPrimaryStudentId(req.userId!)
  if (!studentId) { res.json({ success: true, data: null }); return }
  const overview = getGuardianOverview(studentId)
  res.json({ success: true, data: overview })
})

export default router
