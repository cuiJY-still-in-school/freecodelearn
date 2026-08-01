import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'

export interface BlackRoomState {
  id: string
  student_id: string
  reason: string
  entered_at: number
  exit_condition: string | null
  triggered_by: string
}

export function getBlackRoomState(studentId: string): BlackRoomState | null {
  const db = getDB()
  return (db.prepare(
    `SELECT id, student_id, reason, entered_at, exit_condition, triggered_by
     FROM StudentBlackRoom
     WHERE student_id = ? AND exited_at IS NULL AND delete_flag = 0
     ORDER BY entered_at DESC LIMIT 1`
  ).get(studentId) ?? null) as BlackRoomState | null
}

export function isInBlackRoom(studentId: string): boolean {
  return getBlackRoomState(studentId) != null
}

export function enterBlackRoom(
  studentId: string,
  reason: string,
  triggeredBy: 'auto' | 'guardian' = 'auto',
  exitCondition?: string
): string {
  const db = getDB()
  if (isInBlackRoom(studentId)) return getBlackRoomState(studentId)!.id
  const id = uuidv4()
  db.prepare(
    `INSERT INTO StudentBlackRoom (id, student_id, reason, entered_at, exit_condition, triggered_by, delete_flag)
     VALUES (?, ?, ?, ?, ?, ?, 0)`
  ).run(id, studentId, reason, Date.now(), exitCondition ?? null, triggeredBy)
  console.log(`[BlackRoom] ${studentId} entered (${triggeredBy}): ${reason}`)
  return id
}

export function exitBlackRoom(studentId: string): boolean {
  const db = getDB()
  const state = getBlackRoomState(studentId)
  if (!state) return false
  db.prepare(`UPDATE StudentBlackRoom SET exited_at = ? WHERE id = ?`).run(Date.now(), state.id)
  console.log(`[BlackRoom] ${studentId} exited`)
  return true
}

// 心跳调用：urgency 持续 urgent 则自动进入，恢复 normal 则自动退出
export function autoCheckBlackRoom(
  studentId: string,
  urgencyLevel: string,
  urgencyReasons: string[]
): boolean {
  const db = getDB()

  if (isInBlackRoom(studentId)) {
    if (urgencyLevel === 'normal') {
      exitBlackRoom(studentId)
      return false
    }
    return true
  }

  if (urgencyLevel !== 'urgent') return false

  // 过去 24h 内 ≥2 次 urgent 思考记录 → 自动进入
  const recentUrgent = (db.prepare(
    `SELECT COUNT(*) AS c FROM AgentThought
     WHERE student_id = ? AND urgency = 'urgent' AND created_at > ? AND delete_flag = 0`
  ).get(studentId, Date.now() - 24 * 60 * 60 * 1000) as { c: number }).c

  if (recentUrgent >= 2) {
    const reason = urgencyReasons.slice(0, 3).join('；')
    enterBlackRoom(studentId, reason, 'auto', '学习状态持续改善（urgency 回落至 normal）')
    return true
  }

  return false
}
