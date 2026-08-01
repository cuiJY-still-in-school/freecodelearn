import crypto from 'crypto'
import axios from 'axios'
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

function getSetting(key: string): { value: string; encrypted: number } | undefined {
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

export interface EmailConfig {
  email: string
  imapHost: string
  imapPort: number
  configured: boolean
}

export interface SettingsResult {
  success: boolean
  data?: unknown
  error?: string
}

interface ModelsDevModel {
  id: string; name?: string; attachment?: boolean; reasoning?: boolean
  tool_call?: boolean; modalities?: { input?: string[]; output?: string[] }
  limit?: { context?: number; output?: number }
}
interface ModelsDevProvider {
  id?: string; name?: string; api?: string; models?: Record<string, ModelsDevModel>
}

export async function getModels(): Promise<SettingsResult> {
  try {
    const response = await axios.get('https://models.dev/api.json', { timeout: 12000 })
    const raw = response.data as Record<string, ModelsDevProvider>
    const formatted: AIModel[] = []

    for (const [providerId, provider] of Object.entries(raw)) {
      if (!provider.models) continue
      for (const [modelId, model] of Object.entries(provider.models)) {
        const inputMods: string[] = model.modalities?.input || []
        if (!inputMods.includes('text')) continue
        formatted.push({
          id: `${providerId}/${modelId}`,
          name: model.name || modelId,
          provider: provider.name || providerId,
          baseUrl: provider.api,
          contextLength: model.limit?.context,
          supportsImages: inputMods.includes('image'),
          supportsTools: model.tool_call === true
        })
      }
    }

    try {
      upsertSetting('last_model_json', JSON.stringify(response.data), 0)
    } catch { /* cache fail is ok */ }

    return { success: true, data: formatted }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.warn('[Settings] getModels fetch failed, using fallback:', error)
    return {
      success: true,
      data: [
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', supportsImages: true, supportsTools: true },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', supportsImages: true, supportsTools: true },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', supportsImages: true, supportsTools: true }
      ]
    }
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

export async function saveEmailConfig(email: string, authCode: string, imapHost: string, imapPort: number): Promise<SettingsResult> {
  try {
    const { encrypted: encCode, isEncrypted } = encryptValue(authCode)
    upsertSetting('email_api_config', JSON.stringify({
      email, auth_code: encCode, auth_code_encrypted: isEncrypted,
      imap_host: imapHost, imap_port: imapPort
    }), 0)
    return { success: true, data: { message: '邮件配置已保存' } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function getEmailConfig(): SettingsResult {
  try {
    const row = getSetting('email_api_config')
    if (!row) return { success: true, data: { configured: false } }

    const parsed = JSON.parse(row.value) as { email: string; imap_host: string; imap_port: number }
    return {
      success: true,
      data: { email: parsed.email, imapHost: parsed.imap_host, imapPort: parsed.imap_port, configured: true }
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function getRawEmailConfig(): { email: string; authCode: string; imapHost: string; imapPort: number } | null {
  try {
    const row = getSetting('email_api_config')
    if (!row) return null
    const parsed = JSON.parse(row.value) as {
      email: string; auth_code: string; auth_code_encrypted: boolean; imap_host: string; imap_port: number
    }
    return {
      email: parsed.email,
      authCode: decryptValue(parsed.auth_code, parsed.auth_code_encrypted === true),
      imapHost: parsed.imap_host,
      imapPort: parsed.imap_port
    }
  } catch {
    return null
  }
}

export async function testEmailConnection(): Promise<SettingsResult> {
  try {
    const config = getRawEmailConfig()
    if (!config) return { success: false, error: '未配置邮件信息' }

    const { ImapFlow } = await import('imapflow')
    const client = new ImapFlow({
      host: config.imapHost, port: config.imapPort,
      secure: config.imapPort === 993,
      auth: { user: config.email, pass: config.authCode },
      logger: false
    })
    await client.connect()
    await client.logout()
    return { success: true, data: { message: '邮件连接测试成功' } }
  } catch (err) {
    return { success: false, error: `连接失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
