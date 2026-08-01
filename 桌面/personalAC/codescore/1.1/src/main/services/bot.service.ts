import { v4 as uuidv4 } from 'uuid'
import { safeStorage } from 'electron'
import { getDB } from '../database'
import { verifyToken } from './auth.service'
import log from 'electron-log'

export type BotType = 'telegram' | 'slack' | 'webhook' | 'email'

export interface BotConfig {
  id: string
  bot_type: BotType
  status: 'active' | 'inactive'
  installed_by: string
  create_time: number
}

export interface BotUserBinding {
  id: string
  user_id: string
  bot_config_id: string
  platform_user_id: string
  status: 'active' | 'inactive'
}

export interface BotResult {
  success: boolean
  data?: unknown
  error?: string
}

function encryptCredential(credential: string): { value: string; isEncrypted: boolean } {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(credential).toString('base64')
      return { value: encrypted, isEncrypted: true }
    }
  } catch (err) {
    log.warn('safeStorage not available for bot credential:', err)
  }
  return { value: credential, isEncrypted: false }
}

function decryptCredential(value: string, isEncrypted: boolean): string {
  try {
    if (isEncrypted && safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(value, 'base64')
      return safeStorage.decryptString(buffer)
    }
  } catch (err) {
    log.warn('Failed to decrypt bot credential:', err)
  }
  return value
}

export function install(token: string, botType: BotType, credential: string): BotResult {
  try {
    const db = getDB()
    const now = Date.now()

    const tokenResult = verifyToken(token)
    if (!tokenResult.valid || !tokenResult.user) {
      return { success: false, error: 'Token 无效或已过期' }
    }

    const user = tokenResult.user
    if (user.role !== 'admin') {
      return { success: false, error: '只有管理员可以安装 Bot' }
    }

    const validBotTypes: BotType[] = ['telegram', 'slack', 'webhook', 'email']
    if (!validBotTypes.includes(botType)) {
      return { success: false, error: `不支持的 Bot 类型: ${botType}` }
    }

    const { value: encryptedCred, isEncrypted } = encryptCredential(credential)

    const credentialPayload = JSON.stringify({
      data: encryptedCred,
      encrypted: isEncrypted
    })

    const botId = uuidv4()
    db.prepare(`
      INSERT INTO BotConfig (id, bot_type, credential_encrypted, status, installed_by, create_user, update_user, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, 0)
    `).run(botId, botType, credentialPayload, user.id, user.id, user.id, now, now)

    log.info(`Bot installed: type=${botType} by ${user.username}`)
    return { success: true, data: { id: botId, bot_type: botType, status: 'active' } }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('Bot install error:', error)
    return { success: false, error }
  }
}

export function uninstall(token: string, botConfigId: string): BotResult {
  try {
    const db = getDB()
    const now = Date.now()

    const tokenResult = verifyToken(token)
    if (!tokenResult.valid || !tokenResult.user) {
      return { success: false, error: 'Token 无效或已过期' }
    }

    const user = tokenResult.user
    if (user.role !== 'admin') {
      return { success: false, error: '只有管理员可以卸载 Bot' }
    }

    const bot = db
      .prepare('SELECT id FROM BotConfig WHERE id = ? AND delete_flag = 0')
      .get(botConfigId)
    if (!bot) {
      return { success: false, error: 'Bot 不存在' }
    }

    db.prepare(
      "UPDATE BotConfig SET status = 'inactive', update_user = ?, update_time = ? WHERE id = ?"
    ).run(user.id, now, botConfigId)

    db.prepare(
      "UPDATE BotUserBinding SET status = 'inactive', update_user = ?, update_time = ? WHERE bot_config_id = ? AND delete_flag = 0"
    ).run(user.id, now, botConfigId)

    log.info(`Bot uninstalled: ${botConfigId}`)
    return { success: true, data: { message: 'Bot 已停用' } }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('Bot uninstall error:', error)
    return { success: false, error }
  }
}

export function bindUser(
  token: string,
  userId: string,
  botConfigId: string,
  platformUserId: string
): BotResult {
  try {
    const db = getDB()
    const now = Date.now()

    const tokenResult = verifyToken(token)
    if (!tokenResult.valid || !tokenResult.user) {
      return { success: false, error: 'Token 无效或已过期' }
    }

    const adminUser = tokenResult.user
    if (adminUser.role !== 'admin') {
      return { success: false, error: '只有管理员可以绑定用户到 Bot' }
    }

    const bot = db
      .prepare("SELECT id FROM BotConfig WHERE id = ? AND status = 'active' AND delete_flag = 0")
      .get(botConfigId)
    if (!bot) {
      return { success: false, error: 'Bot 不存在或已停用' }
    }

    const targetUser = db
      .prepare('SELECT id, role FROM User WHERE id = ? AND delete_flag = 0')
      .get(userId) as { id: string; role: string } | undefined
    if (!targetUser) {
      return { success: false, error: '目标用户不存在' }
    }

    // Only student and guardian roles can be bound
    if (targetUser.role !== 'student' && targetUser.role !== 'guardian') {
      return { success: false, error: '只有学生或监护人可以绑定 Bot' }
    }

    const existingBinding = db
      .prepare(
        'SELECT id FROM BotUserBinding WHERE user_id = ? AND bot_config_id = ? AND delete_flag = 0'
      )
      .get(userId, botConfigId)

    if (existingBinding) {
      db.prepare(
        'UPDATE BotUserBinding SET platform_user_id = ?, status = ?, update_user = ?, update_time = ? WHERE user_id = ? AND bot_config_id = ? AND delete_flag = 0'
      ).run(platformUserId, 'active', adminUser.id, now, userId, botConfigId)
      return { success: true, data: { message: '绑定已更新' } }
    }

    const bindingId = uuidv4()
    db.prepare(`
      INSERT INTO BotUserBinding (id, user_id, bot_config_id, platform_user_id, status, create_user, update_user, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, 0)
    `).run(bindingId, userId, botConfigId, platformUserId, adminUser.id, adminUser.id, now, now)

    log.info(`User ${userId} bound to bot ${botConfigId} with platform id ${platformUserId}`)
    return { success: true, data: { message: '绑定成功', bindingId } }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('Bot bindUser error:', error)
    return { success: false, error }
  }
}

export function listBots(token: string): BotResult {
  try {
    const db = getDB()

    const tokenResult = verifyToken(token)
    if (!tokenResult.valid || !tokenResult.user) {
      return { success: false, error: 'Token 无效或已过期' }
    }

    const user = tokenResult.user
    if (user.role !== 'admin') {
      return { success: false, error: '只有管理员可以查看 Bot 列表' }
    }

    const bots = db
      .prepare(
        `SELECT b.id, b.bot_type, b.status, b.installed_by, b.create_time,
                u.username as installed_by_name,
                (SELECT COUNT(*) FROM BotUserBinding bub WHERE bub.bot_config_id = b.id AND bub.status = 'active' AND bub.delete_flag = 0) as binding_count
         FROM BotConfig b
         LEFT JOIN User u ON u.id = b.installed_by
         WHERE b.delete_flag = 0
         ORDER BY b.create_time DESC`
      )
      .all() as Array<BotConfig & { installed_by_name: string; binding_count: number }>

    return { success: true, data: bots }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('listBots error:', error)
    return { success: false, error }
  }
}

export async function routeMessage(
  platformUserId: string,
  botConfigId: string,
  messageType: string,
  content: string,
  attachmentPath?: string
): Promise<BotResult> {
  try {
    const db = getDB()
    const now = Date.now()

    const binding = db
      .prepare(
        `SELECT bub.user_id, u.username, u.role
         FROM BotUserBinding bub
         JOIN User u ON u.id = bub.user_id
         WHERE bub.platform_user_id = ? AND bub.bot_config_id = ? AND bub.status = 'active' AND bub.delete_flag = 0`
      )
      .get(platformUserId, botConfigId) as
      | { user_id: string; username: string; role: string }
      | undefined

    if (!binding) {
      log.warn(`No binding found for platform user ${platformUserId} on bot ${botConfigId}`)
      return { success: false, error: '未找到绑定用户' }
    }

    // Log inbound message
    const msgId = uuidv4()
    db.prepare(`
      INSERT INTO MessageLog (id, user_id, bot_config_id, direction, message_type, content, attachment_path, platform_user_id, status, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, 'inbound', ?, ?, ?, ?, 'sent', ?, ?, 0)
    `).run(
      msgId,
      binding.user_id,
      botConfigId,
      messageType,
      content,
      attachmentPath || null,
      platformUserId,
      now,
      now
    )

    // Route to agent — handle student and guardian roles only
    try {
      const { getAgentEngine } = require('../agent')
      const engine = getAgentEngine()
      if (engine) {
        if (binding.role === 'student' || binding.role === 'guardian') {
          await engine.handleEvent({
            type: 'bot_message',
            userId: binding.user_id,
            username: binding.username,
            role: binding.role,
            messageType,
            content,
            attachmentPath,
            botConfigId
          })
        }
      }
    } catch (err) {
      log.warn('Agent routing failed:', err)
    }

    return { success: true, data: { message: '消息已路由', userId: binding.user_id } }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('routeMessage error:', error)
    return { success: false, error }
  }
}

export async function sendMessage(
  userId: string,
  content: string,
  messageType: string = 'text'
): Promise<BotResult> {
  try {
    const db = getDB()
    const now = Date.now()

    const binding = db
      .prepare(
        `SELECT bub.bot_config_id, bub.platform_user_id, bc.bot_type, bc.credential_encrypted
         FROM BotUserBinding bub
         JOIN BotConfig bc ON bc.id = bub.bot_config_id
         WHERE bub.user_id = ? AND bub.status = 'active' AND bub.delete_flag = 0 AND bc.status = 'active'
         LIMIT 1`
      )
      .get(userId) as
      | {
          bot_config_id: string
          platform_user_id: string
          bot_type: BotType
          credential_encrypted: string
        }
      | undefined

    if (!binding) {
      return { success: false, error: '用户没有活跃的 Bot 绑定' }
    }

    let credentialData: { data: string; encrypted: boolean }
    try {
      credentialData = JSON.parse(binding.credential_encrypted)
    } catch {
      credentialData = { data: binding.credential_encrypted, encrypted: false }
    }

    const credential = decryptCredential(credentialData.data, credentialData.encrypted)

    const msgId = uuidv4()
    db.prepare(`
      INSERT INTO MessageLog (id, user_id, bot_config_id, direction, message_type, content, platform_user_id, status, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, 'outbound', ?, ?, ?, 'pending', ?, ?, 0)
    `).run(
      msgId,
      userId,
      binding.bot_config_id,
      messageType,
      content,
      binding.platform_user_id,
      now,
      now
    )

    let sent = false
    let sendError = ''

    try {
      sent = await dispatchBotMessage(
        binding.bot_type,
        credential,
        binding.platform_user_id,
        content,
        messageType
      )
    } catch (err) {
      sendError = err instanceof Error ? err.message : String(err)
      log.error(`Failed to send bot message via ${binding.bot_type}:`, sendError)
    }

    db.prepare(
      'UPDATE MessageLog SET status = ?, update_time = ? WHERE id = ?'
    ).run(sent ? 'sent' : 'failed', Date.now(), msgId)

    if (!sent) {
      return { success: false, error: `消息发送失败: ${sendError}` }
    }

    return { success: true, data: { message: '消息已发送', messageId: msgId } }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('sendMessage error:', error)
    return { success: false, error }
  }
}

async function dispatchBotMessage(
  botType: BotType,
  credential: string,
  platformUserId: string,
  content: string,
  messageType: string
): Promise<boolean> {
  const axios = require('axios')

  switch (botType) {
    case 'telegram': {
      const url = `https://api.telegram.org/bot${credential}/sendMessage`
      await axios.post(url, {
        chat_id: platformUserId,
        text: content,
        parse_mode: 'Markdown'
      })
      return true
    }

    case 'webhook': {
      await axios.post(credential, {
        user_id: platformUserId,
        message_type: messageType,
        content
      })
      return true
    }

    case 'slack': {
      await axios.post(
        'https://slack.com/api/chat.postMessage',
        { channel: platformUserId, text: content },
        { headers: { Authorization: `Bearer ${credential}` } }
      )
      return true
    }

    case 'email': {
      try {
        const nodemailer = require('nodemailer')
        const cred = JSON.parse(credential)
        const transporter = nodemailer.createTransport({
          host: cred.host,
          port: cred.port || 587,
          secure: cred.port === 465,
          auth: { user: cred.user, pass: cred.pass }
        })
        await transporter.sendMail({
          from: cred.from || cred.user,
          to: platformUserId,
          subject: 'PersonalAC 消息',
          text: content
        })
        return true
      } catch {
        log.warn('Email send failed or nodemailer not installed')
        return false
      }
    }

    default:
      log.warn(`Unknown bot type: ${botType}`)
      return false
  }
}
