import { safeStorage } from 'electron'
import axios from 'axios'
import { getDB } from '../database'
import { verifyToken } from './auth.service'
import log from 'electron-log'

export interface AIModel {
  id: string
  name: string
  provider: string
  supportsVision: boolean
  contextLength?: number
  pricing?: {
    prompt: number
    completion: number
  }
}

export interface AIConfig {
  provider: string
  modelId: string
  apiKey: string
  apiKeyMasked?: string
}

export interface SettingsResult {
  success: boolean
  data?: unknown
  error?: string
}

// models.dev/api.json 实际结构：{ [providerId]: { name, api, models: { [modelId]: {...} } } }
interface ModelsDevModel {
  id: string
  name?: string
  tool_call?: boolean
  modalities?: { input?: string[]; output?: string[] }
  limit?: { context?: number; output?: number }
  cost?: { input?: number; output?: number }
}
interface ModelsDevProvider {
  name?: string
  api?: string
  models?: Record<string, ModelsDevModel>
}

export async function getModels(): Promise<SettingsResult> {
  try {
    const response = await axios.get('https://models.dev/api.json', { timeout: 10000 })
    const raw = response.data as Record<string, ModelsDevProvider>

    const multimodalModels: AIModel[] = []

    for (const [providerId, provider] of Object.entries(raw)) {
      if (!provider.models) continue
      const providerName = provider.name || providerId
      for (const [modelId, model] of Object.entries(provider.models)) {
        const inputMods: string[] = model.modalities?.input || []
        if (!inputMods.includes('text')) continue
        multimodalModels.push({
          id: `${providerId}/${modelId}`,
          name: model.name || modelId,
          provider: providerName,
          supportsVision: inputMods.includes('image'),
          contextLength: model.limit?.context
        })
      }
    }

    return { success: true, data: multimodalModels }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('getModels error:', error)
    // Return fallback list if API fails
    const fallback: AIModel[] = [
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', supportsVision: true },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', supportsVision: true },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', supportsVision: false },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        supportsVision: true
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        provider: 'anthropic',
        supportsVision: true
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        provider: 'google',
        supportsVision: true
      }
    ]
    return { success: true, data: fallback }
  }
}

function encryptValue(value: string): { encrypted: string; isEncrypted: boolean } {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(value).toString('base64')
      return { encrypted, isEncrypted: true }
    }
  } catch (err) {
    log.warn('safeStorage encryption not available:', err)
  }
  // Fallback: store as-is (not secure but functional)
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

export function saveAIConfig(
  token: string,
  provider: string,
  modelId: string,
  apiKey: string,
  baseUrl?: string
): SettingsResult {
  try {
    const db = getDB()
    const now = Date.now()

    const tokenResult = verifyToken(token)
    if (!tokenResult.valid || !tokenResult.user) {
      return { success: false, error: 'Token 无效或已过期' }
    }

    const user = tokenResult.user
    if (user.role !== 'admin') {
      return { success: false, error: '只有管理员可以配置 AI' }
    }

    const { encrypted: encryptedKey, isEncrypted } = encryptValue(apiKey)

    const configs = [
      { key: 'ai_provider', value: provider, encrypted: 0 },
      { key: 'ai_model_id', value: modelId, encrypted: 0 },
      { key: 'ai_api_key', value: encryptedKey, encrypted: isEncrypted ? 1 : 0 },
      { key: 'ai_base_url', value: baseUrl || '', encrypted: 0 }
    ]

    for (const config of configs) {
      const existing = db.prepare('SELECT id FROM Settings WHERE key = ? AND delete_flag = 0').get(config.key)
      if (existing) {
        db.prepare(
          'UPDATE Settings SET value = ?, encrypted = ?, update_user = ?, update_time = ? WHERE key = ? AND delete_flag = 0'
        ).run(config.value, config.encrypted, user.id, now, config.key)
      } else {
        const { v4: uuidv4 } = require('uuid')
        db.prepare(`
          INSERT INTO Settings (id, key, value, encrypted, create_user, update_user, create_time, update_time, delete_flag)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(uuidv4(), config.key, config.value, config.encrypted, user.id, user.id, now, now)
      }
    }

    log.info(`AI config saved: provider=${provider}, model=${modelId}`)
    return { success: true, data: { message: 'AI 配置已保存' } }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('saveAIConfig error:', error)
    return { success: false, error }
  }
}

export function getAIConfig(): SettingsResult {
  try {
    const db = getDB()

    const keys = ['ai_provider', 'ai_model_id', 'ai_api_key', 'ai_base_url']
    const result: Record<string, string> = {}

    for (const key of keys) {
      const row = db
        .prepare('SELECT value, encrypted FROM Settings WHERE key = ? AND delete_flag = 0')
        .get(key) as { value: string; encrypted: number } | undefined

      if (row) {
        if (key === 'ai_api_key') {
          const decrypted = decryptValue(row.value, row.encrypted === 1)
          // Mask API key for display
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
