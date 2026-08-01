import { Router } from 'express'
import { requireAuth, canAccessStudent, AuthRequest } from '../middleware/auth'
import { getOrCreateBoard, getBlocks, addBlock, updateBlock, deleteBlock, reorderBlocks } from '../services/board.service'

const router = Router()

// 获取白板状态
router.get('/', requireAuth, (req: AuthRequest, res) => {
  const studentId = (req.query.studentId as string) || req.userId!
  if (!canAccessStudent(req, studentId)) { res.status(403).json({ success: false, error: '无权限' }); return }

  const mode = (req.query.mode as 'study' | 'homework') || 'study'
  const board = getOrCreateBoard(studentId, mode)
  const blocks = getBlocks(board.id)
  res.json({ success: true, data: { board, blocks } })
})

// 添加 block
router.post('/blocks', requireAuth, (req: AuthRequest, res) => {
  const studentId = (req.body.studentId as string) || req.userId!
  if (!canAccessStudent(req, studentId)) { res.status(403).json({ success: false, error: '无权限' }); return }

  const { mode, blockType, content, position } = req.body
  if (!blockType || !content) { res.status(400).json({ success: false, error: '缺少 blockType 或 content' }); return }

  const board = getOrCreateBoard(studentId, mode || 'study')
  const block = addBlock(board.id, blockType, content, 'student', undefined, position)
  res.json({ success: true, data: block })
})

// 更新 block
router.patch('/blocks/:id', requireAuth, (req: AuthRequest, res) => {
  const { content, blockType } = req.body
  const block = updateBlock(req.params.id, { content, block_type: blockType })
  if (!block) { res.status(404).json({ success: false, error: 'block 不存在' }); return }
  res.json({ success: true, data: block })
})

// 删除 block
router.delete('/blocks/:id', requireAuth, (req: AuthRequest, res) => {
  const ok = deleteBlock(req.params.id)
  if (!ok) { res.status(404).json({ success: false, error: 'block 不存在' }); return }
  res.json({ success: true })
})

// 重排
router.post('/reorder', requireAuth, (req: AuthRequest, res) => {
  const studentId = (req.body.studentId as string) || req.userId!
  if (!canAccessStudent(req, studentId)) { res.status(403).json({ success: false, error: '无权限' }); return }

  const { mode, blockIds } = req.body
  if (!blockIds || !Array.isArray(blockIds)) { res.status(400).json({ success: false, error: '缺少 blockIds' }); return }

  const board = getOrCreateBoard(studentId, mode || 'study')
  reorderBlocks(board.id, blockIds)
  res.json({ success: true })
})

export default router
