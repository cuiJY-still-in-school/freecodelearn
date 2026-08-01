import { Router } from 'express'
import fs from 'fs'
import { getAgentEngine } from '../agent'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { ocrBase64 } from '../services/ocr.service'

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
  const { messages, sandbox } = req.body as {
    messages: Array<{ role: 'user' | 'assistant'; content: unknown }>
    sandbox?: boolean
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ success: false, error: '消息不能为空' }); return
  }
  const engine = getAgentEngine()
  if (!engine) { res.status(503).json({ success: false, error: 'AI 引擎未初始化' }); return }

  if (!sandbox) touchActivity()

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (obj: object): void => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`)
  }

  // 先设好 abort 控制器，client 断连立即信号
  const abortCtrl = new AbortController()
  req.on('close', () => { if (!res.writableEnded) abortCtrl.abort() })

  // OCR: 仅对最后一条含图片的用户消息提取文字（早期历史图片不重复 OCR）
  type Part = { type: string; text?: string; data?: string; mediaType?: string }
  let lastImgMsgIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && Array.isArray(messages[i].content) && (messages[i].content as Part[]).some(p => p.type === 'image')) {
      lastImgMsgIdx = i; break
    }
  }

  const processedMessages = await Promise.all(messages.map(async (m, idx) => {
    if (!Array.isArray(m.content)) return m
    const parts = m.content as Part[]
    if (!parts.some(p => p.type === 'image')) return m

    // 旧历史图片：用占位文字，不跑 OCR
    if (idx !== lastImgMsgIdx) {
      return { ...m, content: parts.map(p => p.type === 'image' ? { type: 'text', text: '[历史图片]' } : p) }
    }

    const newParts: Part[] = []
    for (const p of parts) {
      if (p.type === 'image' && p.data) {
        try {
          const txt = await ocrBase64(p.data, p.mediaType)
          newParts.push({ type: 'text', text: txt ? `[图片文字：${txt}]` : '[图片（无可识别文字）]' })
        } catch {
          newParts.push({ type: 'text', text: '[图片（OCR 失败）]' })
        }
      } else {
        newParts.push(p)
      }
    }
    const merged = newParts.map(p => p.text ?? '').join('\n').trim()
    return { ...m, content: merged }
  }))

  // Keep-Alive：每 15s 发一次 ping，防止 Cloudflare/nginx 因无数据超时断连
  const keepAlive = setInterval(() => {
    if (!res.writableEnded) res.write('data: {"ping":1}\n\n')
  }, 15_000)

  try {
    await engine.streamChatResponse(
      req.userId!,
      processedMessages,
      (token) => send({ token }),
      () => { if (!res.writableEnded) { res.write('data: [DONE]\n\n'); res.end() } },
      (err) => { send({ error: err }); if (!res.writableEnded) res.end() },
      (toolName, display) => {
        if (toolName === 'thinking') send({ thinking: display })
        else send({ tool: toolName, display })
      },
      abortCtrl.signal,
      { sandbox: !!sandbox }
    )
  } catch (err) {
    send({ error: err instanceof Error ? err.message : String(err) })
    if (!res.writableEnded) res.end()
  } finally {
    clearInterval(keepAlive)
  }
})

export default router
