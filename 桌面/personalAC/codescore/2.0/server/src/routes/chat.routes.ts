import { Router } from 'express'
import { requireAuth, canAccessStudent, getPrimaryStudentId, AuthRequest } from '../middleware/auth'
import { AgentEngine } from '../agent'

const router = Router()
const engine = new AgentEngine()

router.post('/stream', requireAuth, async (req: AuthRequest, res) => {
  const { messages, mode = 'study', studentId: reqStudentId, canvasImage } = req.body
  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ success: false, error: '缺少 messages' }); return
  }

  let studentId = req.userId!
  if (req.userRole === 'guardian') {
    studentId = reqStudentId || getPrimaryStudentId(req.userId!) || req.userId!
  }
  if (!canAccessStudent(req, studentId)) { res.status(403).json({ success: false, error: '无权限' }); return }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no',
  })

  const send = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    await engine.streamChatVL(studentId, req.userId!, messages, mode as 'study' | 'homework', canvasImage || null, {
      onToken: t => send({ token: t }),
      onBoardAction: a => send({ board_action: a }),
      onCompanion: s => send({ companion: s }),
      onError: e => send({ error: e }),
    })
    send('[DONE]')
  } catch (err: any) {
    send({ error: err.message || '服务器内部错误' })
  } finally {
    res.end()
  }
})

export default router
