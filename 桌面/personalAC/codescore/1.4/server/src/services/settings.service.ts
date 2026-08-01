import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'

// 用环境变量做 AES 密钥，默认 fallback（本地部署够用）
const ENC_KEY = crypto.createHash('sha256')
  .update(process.env.ENCRYPT_SECRET || 'personalac-default-secret-key')
  .digest()

function encryptValue(value: string): { encrypted: string; isEncrypted: boolean } {
  try {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', ENC_KEY, iv)
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return { encrypted: iv.toString('hex') + ':' + encrypted.toString('hex'), isEncrypted: true }
  } catch {
    return { encrypted: value, isEncrypted: false }
  }
}

function decryptValue(value: string, isEncrypted: boolean): string {
  if (!isEncrypted) return value
  try {
    const [ivHex, encHex] = value.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENC_KEY, iv)
    return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8')
  } catch {
    return value
  }
}

function upsertSetting(key: string, value: string, encrypted: number): void {
  const db = getDB()
  const now = Date.now()
  const existing = db.prepare('SELECT id FROM Settings WHERE key = ? AND delete_flag = 0').get(key)
  if (existing) {
    db.prepare('UPDATE Settings SET value = ?, encrypted = ?, update_time = ? WHERE key = ? AND delete_flag = 0')
      .run(value, encrypted, now, key)
  } else {
    db.prepare('INSERT INTO Settings (id, key, value, encrypted, create_time, update_time, delete_flag) VALUES (?, ?, ?, ?, ?, ?, 0)')
      .run(uuidv4(), key, value, encrypted, now, now)
  }
}

export function getSetting(key: string): { value: string; encrypted: number } | undefined {
  return getDB()
    .prepare('SELECT value, encrypted FROM Settings WHERE key = ? AND delete_flag = 0')
    .get(key) as { value: string; encrypted: number } | undefined
}

export interface AIModel {
  id: string
  name: string
  provider: string
  baseUrl?: string
  contextLength?: number
  supportsImages: boolean
  supportsTools: boolean
}

export interface AIConfig {
  provider: string
  modelId: string
  modelName?: string
  apiKey: string
  apiKeyMasked?: string
  baseUrl?: string
}

export interface SettingsResult {
  success: boolean
  data?: unknown
  error?: string
}

const MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1'
const MINIMAX_API_KEY = 'sk-cp-z44kUacHhFLBppttmkoljtcTjU4P6cD9oWq3saQPY_QYPW66hVFN5137rgIYgzmG7ZGLCrNMvYjDH00ZzHlwaNyFwRZ9rg6RjvON7S0joOfotCDosPidGIg'

// 注意：MiniMax 系列均无原生视觉能力，图片识别需依赖 MiniCPM-V 预处理（vision.service.ts）
const MINIMAX_MODELS: AIModel[] = [
  { id: 'MiniMax-M2.7',            name: 'MiniMax M2.7',              provider: 'MiniMax', baseUrl: MINIMAX_BASE_URL, contextLength: 204800, supportsImages: false, supportsTools: true },
  { id: 'MiniMax-M2.7-highspeed',  name: 'MiniMax M2.7 High Speed',   provider: 'MiniMax', baseUrl: MINIMAX_BASE_URL, contextLength: 204800, supportsImages: false, supportsTools: true },
  { id: 'MiniMax-M2.5',            name: 'MiniMax M2.5',              provider: 'MiniMax', baseUrl: MINIMAX_BASE_URL, contextLength: 204800, supportsImages: false, supportsTools: true },
  { id: 'MiniMax-M2.5-highspeed',  name: 'MiniMax M2.5 High Speed',   provider: 'MiniMax', baseUrl: MINIMAX_BASE_URL, contextLength: 204800, supportsImages: false, supportsTools: true },
  { id: 'MiniMax-M2.1',            name: 'MiniMax M2.1',              provider: 'MiniMax', baseUrl: MINIMAX_BASE_URL, contextLength: 204800, supportsImages: false, supportsTools: true },
  { id: 'MiniMax-M2.1-highspeed',  name: 'MiniMax M2.1 High Speed',   provider: 'MiniMax', baseUrl: MINIMAX_BASE_URL, contextLength: 204800, supportsImages: false, supportsTools: true },
  { id: 'MiniMax-M2',              name: 'MiniMax M2',                provider: 'MiniMax', baseUrl: MINIMAX_BASE_URL, contextLength: 204800, supportsImages: false, supportsTools: true },
  { id: 'M2-her',                  name: 'MiniMax M2-Her',            provider: 'MiniMax', baseUrl: MINIMAX_BASE_URL, contextLength: 204800, supportsImages: false, supportsTools: true },
]

export function getModels(): SettingsResult {
  return { success: true, data: MINIMAX_MODELS }
}

export function ensureMinimaxConfig(): void {
  try {
    const existing = getSetting('ai_api_key')
    if (existing?.value) return
    const { encrypted: encKey, isEncrypted } = encryptValue(MINIMAX_API_KEY)
    upsertSetting('ai_provider', 'MiniMax', 0)
    upsertSetting('ai_model_id', 'MiniMax-M2.7', 0)
    upsertSetting('ai_model_name', 'MiniMax M2.7', 0)
    upsertSetting('ai_api_key', encKey, isEncrypted ? 1 : 0)
    upsertSetting('ai_base_url', MINIMAX_BASE_URL, 0)
    console.log('[Settings] MiniMax config initialized')
  } catch (err) {
    console.warn('[Settings] ensureMinimaxConfig failed:', err)
  }
}

export function saveAIConfig(provider: string, modelId: string, modelName: string, apiKey: string, baseUrl?: string): SettingsResult {
  try {
    const { encrypted: encKey, isEncrypted } = encryptValue(apiKey)
    upsertSetting('ai_provider', provider, 0)
    upsertSetting('ai_model_id', modelId, 0)
    upsertSetting('ai_model_name', modelName || modelId, 0)
    upsertSetting('ai_api_key', encKey, isEncrypted ? 1 : 0)
    upsertSetting('ai_base_url', baseUrl || '', 0)
    return { success: true, data: { message: 'AI 配置已保存' } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function getAIConfig(): SettingsResult {
  try {
    const keys = ['ai_provider', 'ai_model_id', 'ai_model_name', 'ai_api_key', 'ai_base_url']
    const result: Record<string, string> = {}

    for (const key of keys) {
      const row = getSetting(key)
      if (row) {
        if (key === 'ai_api_key') {
          const decrypted = decryptValue(row.value, row.encrypted === 1)
          result[key] = decrypted
          result['ai_api_key_masked'] = decrypted.length > 8
            ? decrypted.slice(0, 4) + '****' + decrypted.slice(-4) : '****'
        } else {
          result[key] = row.value
        }
      } else {
        result[key] = ''
      }
    }

    return {
      success: true,
      data: {
        provider: result['ai_provider'],
        modelId: result['ai_model_id'],
        modelName: result['ai_model_name'],
        apiKey: result['ai_api_key'],
        apiKeyMasked: result['ai_api_key_masked'],
        baseUrl: result['ai_base_url']
      }
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── 视觉模型（MiniCPM-V）─────────────────────────────────────────────────────

export function saveVisionConfig(apiKey: string, baseUrl: string, model: string, enabled: boolean): SettingsResult {
  try {
    const { encrypted: encKey, isEncrypted } = encryptValue(apiKey)
    upsertSetting('vision_api_key', encKey, isEncrypted ? 1 : 0)
    upsertSetting('vision_base_url', baseUrl || 'http://localhost:11434/v1', 0)
    upsertSetting('vision_model', model || 'minicpm-v', 0)
    upsertSetting('vision_enabled', enabled ? '1' : '0', 0)
    return { success: true, data: { message: '视觉模型配置已保存' } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function getVisionConfig(): SettingsResult {
  try {
    const keyRow = getSetting('vision_api_key')
    const urlRow = getSetting('vision_base_url')
    const modRow = getSetting('vision_model')
    const enaRow = getSetting('vision_enabled')
    const apiKey = keyRow ? decryptValue(keyRow.value, keyRow.encrypted === 1) : ''
    return {
      success: true,
      data: {
        apiKey,
        apiKeyMasked: apiKey.length > 8 ? apiKey.slice(0, 4) + '****' + apiKey.slice(-4) : (apiKey ? '****' : ''),
        baseUrl: urlRow?.value || 'http://localhost:11434/v1',
        model:   modRow?.value || 'minicpm-v',
        enabled: enaRow?.value === '1',
      }
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── WolframAlpha ─────────────────────────────────────────────────────────────

export function saveWolframConfig(appId: string): SettingsResult {
  try {
    const { encrypted, isEncrypted } = encryptValue(appId)
    upsertSetting('wolfram_app_id', encrypted, isEncrypted ? 1 : 0)
    return { success: true, data: { message: 'WolframAlpha 配置已保存' } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function getWolframConfig(): SettingsResult {
  try {
    const row = getSetting('wolfram_app_id')
    if (!row || !row.value) return { success: true, data: { configured: false, appId: '' } }
    const appId = decryptValue(row.value, row.encrypted === 1)
    return {
      success: true,
      data: {
        configured: !!appId,
        appId,
        appIdMasked: appId.length > 6 ? appId.slice(0, 3) + '****' + appId.slice(-3) : '****'
      }
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function getRawWolframAppId(): string | null {
  try {
    const row = getSetting('wolfram_app_id')
    if (!row || !row.value) return null
    return decryptValue(row.value, row.encrypted === 1) || null
  } catch { return null }
}

// ── Serper Search API ────────────────────────────────────────────────────────

export function saveSerperConfig(apiKey: string): SettingsResult {
  try {
    const { encrypted, isEncrypted } = encryptValue(apiKey)
    upsertSetting('serper_api_key', encrypted, isEncrypted ? 1 : 0)
    return { success: true, data: { message: 'Serper 配置已保存' } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function getSerperConfig(): SettingsResult {
  try {
    const row = getSetting('serper_api_key')
    if (!row || !row.value) return { success: true, data: { configured: false, keyMasked: '' } }
    const key = decryptValue(row.value, row.encrypted === 1)
    return {
      success: true,
      data: {
        configured: !!key,
        keyMasked: key.length > 8 ? key.slice(0, 4) + '****' + key.slice(-4) : '****'
      }
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── WolframAlpha ─────────────────────────────────────────────────────────────

export async function testWolframConfig(appId: string): Promise<SettingsResult> {
  try {
    const url = `https://api.wolframalpha.com/v2/query?appid=${encodeURIComponent(appId)}&input=2%2B2&output=JSON&format=plaintext`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
    const data = await res.json() as { queryresult?: { success?: boolean } }
    if (!data.queryresult?.success) return { success: false, error: 'API Key 无效或查询失败' }
    return { success: true, data: { message: 'WolframAlpha 连接成功（2+2=4）' } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '连接超时' }
  }
}

