import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'

export interface RelayItem {
  id: string
  student_id: string
  from_role: string
  mime_type: string
  data: string
  caption: string | null
  status: string
  create_time: number
}

export function createRelay(
  studentId: string,
  fromRole: string,
  data: string,
  mimeType: string,
  caption?: string
): RelayItem {
  const db = getDB()
  const id = uuidv4()
  const now = Date.now()
  db.prepare(`
    INSERT INTO Relay (id, student_id, from_role, mime_type, data, caption, status, create_time)
    VALUES (?, ?, ?, ?, ?, ?, 'unread', ?)
  `).run(id, studentId, fromRole, mimeType, data, caption ?? null, now)
  return { id, student_id: studentId, from_role: fromRole, mime_type: mimeType, data, caption: caption ?? null, status: 'unread', create_time: now }
}

// forRole = 接收方角色，返回对方发给他的未读图片
export function listPendingRelays(studentId: string, forRole: string): RelayItem[] {
  const db = getDB()
  const fromRole = forRole === 'guardian' ? 'student' : 'guardian'
  return db.prepare(`
    SELECT id, student_id, from_role, mime_type, data, caption, status, create_time
    FROM Relay
    WHERE student_id = ? AND from_role = ? AND status = 'unread'
    ORDER BY create_time ASC
  `).all(studentId, fromRole) as RelayItem[]
}

export function markRelayRead(id: string): void {
  getDB().prepare("UPDATE Relay SET status = 'read' WHERE id = ?").run(id)
}
