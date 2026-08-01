import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'
import type { Response } from 'express'

// ── SSE 连接池 ────────────────────────────────────────────────────────────────
const sseClients = new Map<string, Response>() // userId → res

export function addSSEClient(userId: string, res: Response): void {
  sseClients.set(userId, res)
}

export function removeSSEClient(userId: string): void {
  sseClients.delete(userId)
}

function pushSSE(userId: string, event: object): void {
  const res = sseClients.get(userId)
  if (res) {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    } catch { sseClients.delete(userId) }
  }
}

// ── 发消息（存 DB + 实时推送）────────────────────────────────────────────────
export async function sendMessage(userId: string, content: string): Promise<void> {
  try {
    const db = getDB()
    const now = Date.now()
    db.prepare(`
      INSERT INTO MessageLog (id, user_id, direction, message_type, content, status, create_time, update_time, delete_flag)
      VALUES (?, ?, 'outbound', 'text', ?, 'sent', ?, ?, 0)
    `).run(uuidv4(), userId, content, now, now)

    pushSSE(userId, { type: 'agent_message', content, ts: now })
    console.log(`[Notify] → ${userId}: ${content.slice(0, 60)}`)
  } catch (err) {
    console.error('[Notify] sendMessage error:', err)
  }
}

// ── 推送系统事件（不存 DB）────────────────────────────────────────────────────
export function pushEvent(userId: string, event: { type: string; [k: string]: unknown }): void {
  pushSSE(userId, event)
}

// ── 广播给所有在线用户 ────────────────────────────────────────────────────────
export function broadcastEvent(event: { type: string; [k: string]: unknown }): void {
  for (const [, res] of sseClients) {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`) } catch {}
  }
}
