import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'

function getEncKey(): Buffer {
  return crypto.createHash('sha256')
    .update(process.env.ENCRYPT_SECRET || 'personalac-2.0-default')
    .digest()
}

export function encryptValue(plain: string): string {
  const key = getEncKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export function decryptValue(encoded: string): string {
  const key = getEncKey()
  const [ivHex, cipherHex] = encoded.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const ciphertext = Buffer.from(cipherHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}

export function getSetting(key: string): string | null {
  const db = getDB()
  const row = db.prepare(
    'SELECT value, encrypted FROM Settings WHERE key = ? AND delete_flag = 0'
  ).get(key) as { value: string; encrypted: number } | undefined
  if (!row) return null
  return row.encrypted ? decryptValue(row.value) : row.value
}

export function setSetting(key: string, value: string, encrypt: boolean = false): void {
  const db = getDB()
  const stored = encrypt ? encryptValue(value) : value
  const existing = db.prepare('SELECT id FROM Settings WHERE key = ? AND delete_flag = 0').get(key) as { id: string } | undefined
  if (existing) {
    db.prepare('UPDATE Settings SET value = ?, encrypted = ?, update_time = ? WHERE id = ?')
      .run(stored, encrypt ? 1 : 0, Date.now(), existing.id)
  } else {
    db.prepare('INSERT INTO Settings (id, key, value, encrypted) VALUES (?,?,?,?)')
      .run(uuidv4(), key, stored, encrypt ? 1 : 0)
  }
}

export interface AIConfig {
  provider: string
  modelId: string
  modelName: string
  apiKey: string
  baseUrl: string | null
}

export function getAIConfig(): AIConfig | null {
  const provider = getSetting('ai_provider')
  const modelId = getSetting('ai_model_id')
  if (!provider || !modelId) return null
  return {
    provider,
    modelId,
    modelName: getSetting('ai_model_name') || modelId,
    apiKey: getSetting('ai_api_key') || '',
    baseUrl: getSetting('ai_base_url'),
  }
}

export function saveAIConfig(config: AIConfig): void {
  setSetting('ai_provider', config.provider)
  setSetting('ai_model_id', config.modelId)
  setSetting('ai_model_name', config.modelName)
  setSetting('ai_api_key', config.apiKey, true)
  if (config.baseUrl) setSetting('ai_base_url', config.baseUrl)
}
