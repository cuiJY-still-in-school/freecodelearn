import { safeStorage } from 'electron'
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'
import { verifyToken } from './auth.service'
import log from 'electron-log'

export interface AIModel {
  id: string
  name: string
  provider: string
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

// models.dev/api.json 实际结构：
// { [providerId]: { id, name, api (string), models: { [modelId]: ModelEntry } } }
interface ModelsDevModel {
  id: string
  name?: string
  attachment?: boolean
  reasoning?: boolean
  tool_call?: boolean
  modalities?: { input?: string[]; output?: string[] }
  cost?: { input?: number; output?: number }
  limit?: { context?: number; output?: number }
}
interface ModelsDevProvider {
  id?: string
  name?: string
  api?: string
  models?: Record<string, ModelsDevModel>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function encryptValue(value: string): { encrypted: string; isEncrypted: boolean } {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(value).toString('base64')
      return { encrypted, isEncrypted: true }
    }
  } catch (err) {
    log.warn('safeStorage encryption not available:', err)
  }
  return { encrypted: value, isEncrypted: false }
}

function decryptValue(value: string, isEncrypted: boolean): string {
  try {
    if (isEncrypted && safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(value, 'base64')
      return safeStorage.decryptString(buffer)
    }
  } catch (err) {
    log.warn('safeStorage decryption failed:', err)
  }
  return value
}

function upsertSetting(
  key: string,
  value: string,
  encrypted: number,
  userId: string
): void {
  const db = getDB()
  const now = Date.now()
  const existing = db
    .prepare('SELECT id FROM Settings WHERE key = ? AND delete_flag = 0')
    .get(key)
  if (existing) {
    db.prepare(
      'UPDATE Settings SET value = ?, encrypted = ?, update_user = ?, update_time = ? WHERE key = ? AND delete_flag = 0'
    ).run(value, encrypted, userId, now, key)
  } else {
    db.prepare(`
      INSERT INTO Settings (id, key, value, encrypted, create_user, update_user, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(uuidv4(), key, value, encrypted, userId, userId, now, now)
  }
}

function getSetting(key: string): { value: string; encrypted: number } | undefined {
  const db = getDB()
  return db
    .prepare('SELECT value, encrypted FROM Settings WHERE key = ? AND delete_flag = 0')
    .get(key) as { value: string; encrypted: number } | undefined
}

// ---------------------------------------------------------------------------
// getModels — fetch from models.dev/api.json, cache in DB
// ---------------------------------------------------------------------------

export async function getModels(): Promise<SettingsResult> {
  const CACHE_KEY = 'last_model_json'

  try {
    const response = await axios.get('https://models.dev/api.json', { timeout: 12000 })
    // 顶层结构：{ [providerId]: { name, api, models: { [modelId]: {...} } } }
    const raw = response.data as Record<string, ModelsDevProvider>

    const formatted: AIModel[] = []

    for (const [providerId, provider] of Object.entries(raw)) {
      if (!provider.models) continue
      const providerName = provider.name || providerId
      for (const [modelId, model] of Object.entries(provider.models)) {
        const inputMods: string[] = model.modalities?.input || []
        if (!inputMods.includes('text')) continue
        formatted.push({
          id: `${providerId}/${modelId}`,
          name: model.name || modelId,
          provider: providerName,
          contextLength: model.limit?.context,
          supportsImages: inputMods.includes('image'),
          supportsTools: model.tool_call === true
        })
      }
    }

    // Cache raw JSON in DB
    try {
      const db = getDB()
      const rawJson = JSON.stringify(response.data)
      const existing = db
        .prepare("SELECT id FROM Settings WHERE key = ? AND delete_flag = 0")
        .get(CACHE_KEY)
      const now = Date.now()
      if (existing) {
        db.prepare(
          'UPDATE Settings SET value = ?, update_time = ? WHERE key = ? AND delete_flag = 0'
        ).run(rawJson, now, CACHE_KEY)
      } else {
        db.prepare(`
          INSERT INTO Settings (id, key, value, encrypted, create_time, update_time, delete_flag)
          VALUES (?, ?, ?, 0, ?, ?, 0)
        `).run(uuidv4(), CACHE_KEY, rawJson, now, now)
      }
    } catch (cacheErr) {
      log.warn('Failed to cache model list:', cacheErr)
    }

    return { success: true, data: formatted }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('getModels fetch error, trying cache:', error)

    // Attempt to return cached list
    try {
      const db = getDB()
      const cached = db
        .prepare('SELECT value FROM Settings WHERE key = ? AND delete_flag = 0')
        .get(CACHE_KEY) as { value: string } | undefined

      if (cached) {
        const cachedModels: ModelsDevEntry[] = JSON.parse(cached.value)
        const formatted: AIModel[] = []
        for (const model of cachedModels) {
          const inputMods: string[] = model.input_modalities || model.capabilities?.input || []
          if (!inputMods.includes('text')) continue
          const supportsImages =
            inputMods.includes('image') || inputMods.includes('vision') || inputMods.includes('multimodal')
          const supportsTools = model.capabilities?.tools === true
          formatted.push({
            id: model.id,
            name: model.name || model.id,
            provider: model.provider || model.api?.baseUrl || 'unknown',
            contextLength: model.context_length,
            supportsImages,
            supportsTools,
            cached: true
          } as AIModel & { cached: boolean })
        }
        log.info(`Returning ${formatted.length} models from cache`)
        return { success: true, data: formatted }
      }
    } catch (cacheErr) {
      log.error('Failed to read model cache:', cacheErr)
    }

    // Final fallback
    const fallback: AIModel[] = [
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', supportsImages: true, supportsTools: true },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', supportsImages: true, supportsTools: true },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', supportsImages: false, supportsTools: true },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', supportsImages: true, supportsTools: true },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic', supportsImages: true, supportsTools: true },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', supportsImages: true, supportsTools: true }
    ]
    return { success: true, data: fallback }
  }
}

// ---------------------------------------------------------------------------
// saveAIConfig — stores provider, modelId, modelName, apiKey (encrypted), baseUrl
// ---------------------------------------------------------------------------

export function saveAIConfig(
  token: string,
  provider: string,
  modelId: string,
  modelName: string,
  apiKey: string,
  baseUrl?: string
): SettingsResult {
  try {
    const tokenResult = verifyToken(token)
    if (!tokenResult.valid || !tokenResult.user) {
      return { success: false, error: 'Token 无效或已过期' }
    }
    const user = tokenResult.user
    if (user.role !== 'admin') {
      return { success: false, error: '只有管理员可以配置 AI' }
    }

    const { encrypted: encryptedKey, isEncrypted } = encryptValue(apiKey)

    upsertSetting('ai_provider', provider, 0, user.id)
    upsertSetting('ai_model_id', modelId, 0, user.id)
    upsertSetting('ai_model_name', modelName || modelId, 0, user.id)
    upsertSetting('ai_api_key', encryptedKey, isEncrypted ? 1 : 0, user.id)
    upsertSetting('ai_base_url', baseUrl || '', 0, user.id)

    log.info(`AI config saved: provider=${provider}, model=${modelId}`)
    return { success: true, data: { message: 'AI 配置已保存' } }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('saveAIConfig error:', error)
    return { success: false, error }
  }
}

// ---------------------------------------------------------------------------
// getAIConfig — returns config with masked API key
// ---------------------------------------------------------------------------

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
          result['ai_api_key_masked'] =
            decrypted.length > 8
              ? decrypted.slice(0, 4) + '****' + decrypted.slice(-4)
              : '****'
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
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('getAIConfig error:', error)
    return { success: false, error }
  }
}

// ---------------------------------------------------------------------------
// saveEmailConfig — stores email config as JSON (authCode encrypted)
// ---------------------------------------------------------------------------

export async function saveEmailConfig(
  token: string,
  email: string,
  authCode: string,
  imapHost: string,
  imapPort: number
): Promise<SettingsResult> {
  try {
    const tokenResult = verifyToken(token)
    if (!tokenResult.valid || !tokenResult.user) {
      return { success: false, error: 'Token 无效或已过期' }
    }
    const user = tokenResult.user
    if (user.role !== 'admin') {
      return { success: false, error: '只有管理员可以配置邮件' }
    }

    const { encrypted: encryptedAuthCode, isEncrypted } = encryptValue(authCode)

    const configJson = JSON.stringify({
      email,
      auth_code: encryptedAuthCode,
      auth_code_encrypted: isEncrypted,
      imap_host: imapHost,
      imap_port: imapPort
    })

    upsertSetting('email_api_config', configJson, 0, user.id)

    log.info(`Email config saved for: ${email}`)
    return { success: true, data: { message: '邮件配置已保存' } }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('saveEmailConfig error:', error)
    return { success: false, error }
  }
}

// ---------------------------------------------------------------------------
// getEmailConfig — returns desensitized config (no authCode)
// ---------------------------------------------------------------------------

export function getEmailConfig(token: string): SettingsResult {
  try {
    const tokenResult = verifyToken(token)
    if (!tokenResult.valid || !tokenResult.user) {
      return { success: false, error: 'Token 无效或已过期' }
    }

    const row = getSetting('email_api_config')
    if (!row) {
      return { success: true, data: { configured: false } }
    }

    const parsed = JSON.parse(row.value) as {
      email: string
      imap_host: string
      imap_port: number
    }

    return {
      success: true,
      data: {
        email: parsed.email,
        imapHost: parsed.imap_host,
        imapPort: parsed.imap_port,
        configured: true
      } as EmailConfig
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('getEmailConfig error:', error)
    return { success: false, error }
  }
}

// ---------------------------------------------------------------------------
// getRawEmailConfig — internal use only, returns decrypted authCode
// ---------------------------------------------------------------------------

export function getRawEmailConfig(): {
  email: string
  authCode: string
  imapHost: string
  imapPort: number
} | null {
  try {
    const row = getSetting('email_api_config')
    if (!row) return null

    const parsed = JSON.parse(row.value) as {
      email: string
      auth_code: string
      auth_code_encrypted: boolean
      imap_host: string
      imap_port: number
    }

    const authCode = decryptValue(parsed.auth_code, parsed.auth_code_encrypted === true)

    return {
      email: parsed.email,
      authCode,
      imapHost: parsed.imap_host,
      imapPort: parsed.imap_port
    }
  } catch (err) {
    log.error('getRawEmailConfig error:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// testEmailConnection — verifies IMAP connectivity
// ---------------------------------------------------------------------------

export async function testEmailConnection(token: string): Promise<SettingsResult> {
  try {
    const tokenResult = verifyToken(token)
    if (!tokenResult.valid || !tokenResult.user) {
      return { success: false, error: 'Token 无效或已过期' }
    }

    const config = getRawEmailConfig()
    if (!config) {
      return { success: false, error: '未配置邮件信息，请先保存邮件配置' }
    }

    // Dynamically import imapflow to test connection
    const { ImapFlow } = await import('imapflow')
    const client = new ImapFlow({
      host: config.imapHost,
      port: config.imapPort,
      secure: config.imapPort === 993,
      auth: { user: config.email, pass: config.authCode },
      logger: false
    })

    await client.connect()
    await client.logout()

    log.info('Email connection test successful')
    return { success: true, data: { message: '邮件连接测试成功' } }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('testEmailConnection error:', error)
    return { success: false, error: `连接失败: ${error}` }
  }
}
