import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'

// 1.3 无 bot，消息记录到 MessageLog 表，后续可扩展 WebSocket 推送
export async function sendMessage(userId: string, content: string): Promise<void> {
  try {
    const db = getDB()
    const now = Date.now()
    db.prepare(`
      INSERT INTO MessageLog (id, user_id, direction, message_type, content, status, create_time, update_time, delete_flag)
      VALUES (?, ?, 'outbound', 'text', ?, 'sent', ?, ?, 0)
    `).run(uuidv4(), userId, content, now, now)
    console.log(`[Notify] → ${userId}: ${content.slice(0, 60)}...`)
  } catch (err) {
    console.error('[Notify] sendMessage error:', err)
  }
}
