import { Router } from 'express'
import fs from 'fs'
import { getAgentEngine } from '../agent'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'

function touchActivity(): void {
  const f = process.env.NOTIFY_FILE
  if (!f) return
  try { fs.writeFileSync(f, JSON.stringify({ lastActivity: Date.now() })) } catch { /* ignore */ }
}

const router = Router()
router.use(requireAuth)

router.post('/send', async (req: AuthRequest, res) => {
  const { message } = req.body as { message: string }
  if (!message?.trim()) { res.status(400).json({ success: false, error: '消息不能为空' }); return }
  const engine = getAgentEngine()
  if (!engine) { res.json({ success: false, error: 'AI 引擎未初始化' }); return }
  try {
    const response = await engine.generateBotResponse(req.userId!, message.trim())
    res.json({ success: true, data: response || '（AI 暂无回复）' })
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

router.post('/stream', async (req: AuthRequest, res) => {
  const { messages } = req.body as {
    messages: Array<{ role: 'user' | 'assistant'; content: unknown }>
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ success: false, error: '消息不能为空' }); return
  }
  const engine = getAgentEngine()
  if (!engine) { res.status(503).json({ success: false, error: 'AI 引擎未初始化' }); return }

  touchActivity()

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (obj: object): void => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`)
  }

  try {
    await engine.streamChatResponse(
      req.userId!,
      messages,
      (token) => send({ token }),
      () => { if (!res.writableEnded) { res.write('data: [DONE]\n\n'); res.end() } },
      (err) => { send({ error: err }); if (!res.writableEnded) res.end() },
      (toolName, display) => {
        if (toolName === 'thinking') send({ thinking: display })   // reasoning model token
        else send({ tool: toolName, display })                      // tool call indicator
      }
    )
  } catch (err) {
    send({ error: err instanceof Error ? err.message : String(err) })
    if (!res.writableEnded) res.end()
  }
})

export default router
