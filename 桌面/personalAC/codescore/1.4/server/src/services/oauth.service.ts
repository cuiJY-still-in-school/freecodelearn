import crypto from 'crypto'
import { saveAIConfig } from './settings.service'

// ── In-memory state (short-lived, local app only) ─────────────────────────

interface AnthropicFlow {
  verifier: string
  createdAt: number
  status: 'pending' | 'complete' | 'failed'
  error?: string
}
interface OpenAIFlow {
  deviceAuthId: string
  userCode: string
  verificationUrl: string
  status: 'pending' | 'complete' | 'failed'
  error?: string
  createdAt: number
}

const anthropicFlows = new Map<string, AnthropicFlow>()
const openaiFlows = new Map<string, OpenAIFlow>()

setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000
  for (const [k, v] of anthropicFlows) if (v.createdAt < cutoff) anthropicFlows.delete(k)
  for (const [k, v] of openaiFlows) if (v.createdAt < cutoff) openaiFlows.delete(k)
}, 5 * 60 * 1000)

// ── PKCE helpers ──────────────────────────────────────────────────────────

function genVerifier(): string { return crypto.randomBytes(32).toString('base64url') }
function genChallenge(v: string): string {
  return crypto.createHash('sha256').update(v).digest('base64url')
}

// ── Anthropic OAuth (PKCE + browser redirect) ─────────────────────────────

const ANTHROPIC_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const ANTHROPIC_AUTHORIZE  = 'https://claude.ai/oauth/authorize'
const ANTHROPIC_TOKEN_URL  = 'https://claude.ai/v1/oauth/token'
const ANTHROPIC_KEY_URL    = 'https://api.anthropic.com/api/oauth/claude_cli/create_api_key'
const ANTHROPIC_SCOPES     = 'user:profile org:create_api_key'

export function startAnthropicOAuth(redirectUri: string): { url: string; state: string } {
  const state    = crypto.randomBytes(16).toString('hex')
  const verifier = genVerifier()
  anthropicFlows.set(state, { verifier, createdAt: Date.now(), status: 'pending' })

  const params = new URLSearchParams({
    client_id:             ANTHROPIC_CLIENT_ID,
    response_type:         'code',
    redirect_uri:          redirectUri,
    scope:                 ANTHROPIC_SCOPES,
    state,
    code_challenge:        genChallenge(verifier),
    code_challenge_method: 'S256'
  })
  return { url: `${ANTHROPIC_AUTHORIZE}?${params}`, state }
}

export async function handleAnthropicCallback(
  code: string, state: string, redirectUri: string
): Promise<{ success: boolean; error?: string }> {
  const flow = anthropicFlows.get(state)
  if (!flow) return { success: false, error: 'state 无效或已过期' }

  try {
    // 1. Exchange code → access token
    const tokenRes = await fetch(ANTHROPIC_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  redirectUri,
        client_id:     ANTHROPIC_CLIENT_ID,
        code_verifier: flow.verifier
      }),
      signal: AbortSignal.timeout(15000)
    })
    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      throw new Error(`Token exchange failed (${tokenRes.status}): ${err.slice(0, 200)}`)
    }
    const tokenData = await tokenRes.json() as { access_token?: string }
    const accessToken = tokenData.access_token
    if (!accessToken) throw new Error('响应中没有 access_token')

    // 2. Create API key from access token
    const keyRes = await fetch(ANTHROPIC_KEY_URL, {
      method:  'POST',
      headers: {
        'Authorization':     `Bearer ${accessToken}`,
        'Content-Type':      'application/json',
        'anthropic-version': '2023-06-01'
      },
      body:   JSON.stringify({ name: 'PersonalAC' }),
      signal: AbortSignal.timeout(15000)
    })
    if (!keyRes.ok) {
      const err = await keyRes.text()
      throw new Error(`API key creation failed (${keyRes.status}): ${err.slice(0, 200)}`)
    }
    const keyData = await keyRes.json() as { api_key?: string; key?: string; raw_key?: string }
    const apiKey = keyData.api_key || keyData.key || keyData.raw_key
    if (!apiKey) throw new Error('响应中没有 API key')

    // 3. Save as AI config (user can still change model in Config tab)
    saveAIConfig('anthropic', 'claude-sonnet-4-6', 'Claude Sonnet 4.6', apiKey, 'https://api.anthropic.com/v1')
    flow.status = 'complete'
    anthropicFlows.set(state, flow)
    return { success: true }
  } catch (err) {
    flow.status = 'failed'
    flow.error  = err instanceof Error ? err.message : String(err)
    anthropicFlows.set(state, flow)
    return { success: false, error: flow.error }
  }
}

// ── OpenAI Device Code flow ───────────────────────────────────────────────

const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const OPENAI_AUTH_BASE = 'https://auth.openai.com'
const OPENAI_CALLBACK  = `${OPENAI_AUTH_BASE}/deviceauth/callback`

export async function startOpenAIDeviceCode(): Promise<{
  success: boolean
  flowId?: string
  userCode?: string
  verificationUrl?: string
  error?: string
}> {
  try {
    const res = await fetch(`${OPENAI_AUTH_BASE}/api/accounts/deviceauth/usercode`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ client_id: OPENAI_CLIENT_ID }),
      signal:  AbortSignal.timeout(15000)
    })
    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`)
    }
    const data = await res.json() as {
      device_auth_id: string; user_code?: string; usercode?: string; interval?: number
    }
    const deviceAuthId = data.device_auth_id
    const userCode     = data.user_code || data.usercode
    if (!deviceAuthId || !userCode) throw new Error('响应缺少 device_auth_id 或 user_code')

    const flowId          = crypto.randomBytes(16).toString('hex')
    const verificationUrl = `${OPENAI_AUTH_BASE}/codex/device`
    const intervalSec     = typeof data.interval === 'number' ? Math.max(data.interval, 1) : 5

    openaiFlows.set(flowId, {
      deviceAuthId, userCode, verificationUrl,
      status: 'pending', createdAt: Date.now()
    })
    // Background polling
    pollOpenAIDeviceCode(flowId, deviceAuthId, userCode, intervalSec).catch(() => {})

    return { success: true, flowId, userCode, verificationUrl }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function pollOpenAIDeviceCode(
  flowId: string, deviceAuthId: string, userCode: string, intervalSec: number
): Promise<void> {
  const deadline   = Date.now() + 15 * 60 * 1000
  const intervalMs = intervalSec * 1000

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs))

    const flow = openaiFlows.get(flowId)
    if (!flow || flow.status !== 'pending') return

    try {
      const res = await fetch(`${OPENAI_AUTH_BASE}/api/accounts/deviceauth/token`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ device_auth_id: deviceAuthId, user_code: userCode }),
        signal:  AbortSignal.timeout(10000)
      })

      if (res.ok) {
        const data = await res.json() as { authorization_code?: string; code_verifier?: string }
        if (!data.authorization_code || !data.code_verifier) {
          flow.status = 'failed'; flow.error = '响应缺少 authorization_code 或 code_verifier'; return
        }

        // Exchange auth code for tokens
        const tokenRes = await fetch(`${OPENAI_AUTH_BASE}/oauth/token`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    new URLSearchParams({
            grant_type:    'authorization_code',
            code:          data.authorization_code,
            redirect_uri:  OPENAI_CALLBACK,
            client_id:     OPENAI_CLIENT_ID,
            code_verifier: data.code_verifier
          }),
          signal: AbortSignal.timeout(10000)
        })

        if (!tokenRes.ok) {
          const txt = await tokenRes.text()
          flow.status = 'failed'; flow.error = `Token exchange failed (${tokenRes.status}): ${txt.slice(0, 200)}`; return
        }

        const tokens = await tokenRes.json() as { access_token?: string; refresh_token?: string }
        if (!tokens.access_token) {
          flow.status = 'failed'; flow.error = '响应中没有 access_token'; return
        }

        saveAIConfig('openai', 'gpt-4o', 'GPT-4o', tokens.access_token, 'https://api.openai.com/v1')
        flow.status = 'complete'
        return
      }

      // 403/404 = still waiting, keep polling
      if (res.status !== 403 && res.status !== 404) {
        flow.status = 'failed'; flow.error = `轮询失败 HTTP ${res.status}`; return
      }
    } catch {
      // network error — retry next interval
    }
  }

  const flow = openaiFlows.get(flowId)
  if (flow?.status === 'pending') {
    flow.status = 'failed'; flow.error = '授权超时（15 分钟）'
  }
}

export function getOpenAIFlowStatus(flowId: string): {
  status: 'pending' | 'complete' | 'failed' | 'not_found'; error?: string
} {
  const flow = openaiFlows.get(flowId)
  if (!flow) return { status: 'not_found' }
  if (flow.status === 'complete') openaiFlows.delete(flowId)
  return { status: flow.status, error: flow.error }
}
