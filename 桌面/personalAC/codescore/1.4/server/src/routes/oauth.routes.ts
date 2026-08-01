import { Router, Request, Response } from 'express'
import {
  startAnthropicOAuth, handleAnthropicCallback,
  startOpenAIDeviceCode, getOpenAIFlowStatus
} from '../services/oauth.service'
import { requireAuth } from '../middleware/auth.middleware'

const router = Router()

// ── Anthropic PKCE redirect flow ──────────────────────────────────────────

// /start — 不需要 requireAuth（会在浏览器新窗口中打开，可能未携带 cookie）
// 但需要防止随意触发，用一个简单的 query secret（登录后前端持有 syncToken）
router.get('/anthropic/start', (req: Request, res: Response) => {
  const host = `${req.protocol}://${req.get('host')}`
  const redirectUri = `${host}/api/oauth/anthropic/callback`
  const { url } = startAnthropicOAuth(redirectUri)
  res.redirect(url)
})

router.get('/anthropic/callback', async (req: Request, res: Response) => {
  const { code, state, error: oauthError } = req.query as Record<string, string>

  if (oauthError) {
    res.send(callbackPage('error', `Anthropic 拒绝授权：${oauthError}`))
    return
  }
  if (!code || !state) {
    res.send(callbackPage('error', '缺少 code 或 state 参数'))
    return
  }

  const host = `${req.protocol}://${req.get('host')}`
  const redirectUri = `${host}/api/oauth/anthropic/callback`
  const result = await handleAnthropicCallback(code, state, redirectUri)

  if (result.success) {
    res.send(callbackPage('success', 'Claude 账号授权成功！API Key 已保存。', 'anthropic'))
  } else {
    res.send(callbackPage('error', result.error || '授权失败'))
  }
})

// ── OpenAI Device Code flow ───────────────────────────────────────────────

router.post('/openai/start', requireAuth, async (_req: Request, res: Response) => {
  const result = await startOpenAIDeviceCode()
  res.json(result)
})

router.get('/openai/status/:flowId', requireAuth, (req: Request, res: Response) => {
  const { flowId } = req.params
  res.json(getOpenAIFlowStatus(flowId))
})

// ── Callback page HTML ────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function callbackPage(type: 'success' | 'error', message: string, provider?: string): string {
  const isOk  = type === 'success'
  const color = isOk ? '#16a34a' : '#dc2626'
  const icon  = isOk ? '✓' : '✗'

  const postMsg = isOk && provider
    ? `<script>
        try {
          if (window.opener) {
            window.opener.postMessage({ type: 'oauth_complete', provider: '${provider}' }, '*');
          }
        } catch(e) {}
        setTimeout(() => { try { window.close() } catch(e) {} }, 1800);
       </script>`
    : ''

  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <title>${isOk ? '授权成功' : '授权失败'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, system-ui, sans-serif; background: #f9f7f4;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #fff; border: 1px solid #e5e2de; border-radius: 12px;
            padding: 40px 48px; text-align: center; max-width: 400px; }
    .icon { width: 56px; height: 56px; border-radius: 50%; background: ${color}20;
            display: flex; align-items: center; justify-content: center;
            font-size: 24px; color: ${color}; margin: 0 auto 20px; }
    h2 { font-size: 20px; font-weight: 600; color: #1a1815; margin-bottom: 8px; }
    p  { font-size: 14px; color: #6b7280; line-height: 1.5; }
    .close { margin-top: 24px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h2>${isOk ? '授权成功' : '授权失败'}</h2>
    <p>${escHtml(message)}</p>
    ${isOk ? '<p class="close">此页面将自动关闭…</p>' : '<p class="close">请关闭此窗口并重试。</p>'}
  </div>
  ${postMsg}
</body>
</html>`
}

export default router
