/**
 * MiniCPM-V 图片描述服务（本地 Ollama，OpenAI 兼容格式）
 */
import axios from 'axios'
import { getDB } from '../database'
import crypto from 'crypto'

// 内存 LRU 缓存：base64 的 SHA-256 → 描述文字，避免同一张图重复调用
const _visionCache = new Map<string, { text: string; ts: number }>()
const VISION_CACHE_MAX = 50
const VISION_CACHE_TTL = 2 * 60 * 60 * 1000  // 2小时

function cacheKey(base64: string): string {
  return crypto.createHash('sha256').update(base64.slice(0, 4096)).digest('hex')
}

function cacheGet(key: string): string | null {
  const entry = _visionCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > VISION_CACHE_TTL) { _visionCache.delete(key); return null }
  return entry.text
}

function cachePut(key: string, text: string): void {
  if (_visionCache.size >= VISION_CACHE_MAX) {
    // 淘汰最旧一条
    const oldest = [..._visionCache.entries()].reduce((a, b) => a[1].ts < b[1].ts ? a : b)
    _visionCache.delete(oldest[0])
  }
  _visionCache.set(key, { text, ts: Date.now() })
}

const ENC_KEY = crypto.createHash('sha256')
  .update(process.env.ENCRYPT_SECRET || 'personalac-default-secret-key')
  .digest()

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

function getSetting(key: string): { value: string; encrypted: number } | undefined {
  return (getDB().prepare('SELECT value, encrypted FROM Settings WHERE key = ?').get(key) as any)
}

export interface VisionConfig {
  apiKey: string
  baseUrl: string
  model: string
  enabled: boolean
}

const DEFAULTS = {
  baseUrl: 'http://localhost:11434/v1',  // Ollama 默认；vllm/其他改对应端口
  model: 'minicpm-v',
}

export function loadVisionConfig(): VisionConfig {
  const keyRow  = getSetting('vision_api_key')
  const urlRow  = getSetting('vision_base_url')
  const modRow  = getSetting('vision_model')
  const enaRow  = getSetting('vision_enabled')
  return {
    apiKey:  keyRow ? decryptValue(keyRow.value, keyRow.encrypted === 1) : '',
    baseUrl: urlRow?.value || DEFAULTS.baseUrl,
    model:   modRow?.value || DEFAULTS.model,
    // 默认启用：若用户未显式设置，视为开启；只有显式存 '0' 才禁用
    enabled: enaRow ? enaRow.value === '1' : true,
  }
}

/** 检测本地 Ollama 是否可用且指定模型已安装；并将结果写回 vision_enabled */
export async function probeAndEnableVision(): Promise<{ ok: boolean; reason: string }> {
  const cfg = loadVisionConfig()
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/models`, {
      signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) {
      persistVisionEnabled(false)
      return { ok: false, reason: `HTTP ${res.status}` }
    }
    const data = await res.json() as { data?: Array<{ id: string }> }
    const hasModel = Array.isArray(data.data) && data.data.some(m => m.id.startsWith(cfg.model.split(':')[0]))
    if (!hasModel) {
      persistVisionEnabled(false)
      return { ok: false, reason: `模型 ${cfg.model} 未安装，请运行 ollama pull ${cfg.model}` }
    }
    persistVisionEnabled(true)
    return { ok: true, reason: '视觉模型就绪' }
  } catch (err) {
    persistVisionEnabled(false)
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

function persistVisionEnabled(enabled: boolean): void {
  try {
    const db = getDB()
    const now = Date.now()
    const val = enabled ? '1' : '0'
    const existing = db.prepare('SELECT id FROM Settings WHERE key = ? AND delete_flag = 0').get('vision_enabled')
    if (existing) {
      db.prepare('UPDATE Settings SET value = ?, update_time = ? WHERE key = ? AND delete_flag = 0').run(val, now, 'vision_enabled')
    } else {
      const { v4: uuidv4 } = require('uuid')
      db.prepare('INSERT INTO Settings (id, key, value, encrypted, create_time, update_time, delete_flag) VALUES (?, ?, ?, 0, ?, ?, 0)').run(uuidv4(), 'vision_enabled', val, now, now)
    }
  } catch { /* 不阻断 */ }
}

const AUTO_PROMPT = `请仔细分析这张图片，提供以下信息（根据图片内容选择适用项）：
1. 整体内容概述
2. 所有可见文字（完整转录，包括印刷体和手写体）
3. 数学题/公式：完整抄写题目、算式、数字，标注题号
4. 图表/表格：说明结构和关键数据
5. 手写内容：尽量准确识别，不确定处用〔?〕标注
只输出识别结果，不要加说明性开场白。`

/**
 * 调用 MiniCPM-V 描述图片，返回文字描述。
 * base64 可含 data:image/... 前缀，也可不含。
 */
export async function describeImage(
  base64: string,
  mimeType = 'image/jpeg',
  prompt = AUTO_PROMPT
): Promise<string> {
  const cfg = loadVisionConfig()
  if (!cfg.enabled) {
    throw new Error('视觉模型未启用，请在设置→视觉模型中开启。')
  }

  const pureBase64 = base64.replace(/^data:[^;]+;base64,/, '')

  // 缓存命中直接返回
  const key = cacheKey(pureBase64)
  const cached = cacheGet(key)
  if (cached) return cached

  const payload = {
    model: cfg.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${pureBase64}` } },
          { type: 'text', text: prompt },
        ],
      },
    ],
    max_tokens: 1024,
    temperature: 0.1,
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`

  const resp = await axios.post(
    `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`,
    payload,
    { headers, timeout: 60_000 }
  )

  const choice = resp.data?.choices?.[0]
  const text: string = choice?.message?.content ?? choice?.delta?.content ?? ''
  if (!text) throw new Error('MiniCPM-V 返回内容为空')
  const result = text.trim()
  cachePut(key, result)
  return result
}
