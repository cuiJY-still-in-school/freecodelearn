import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'

export interface GuardianCommand {
  id: string
  guardian_id: string
  student_id: string
  instruction: string
  priority: 'high' | 'normal' | 'low'
  active: number
  acknowledged: number
  executed_count: number
  create_time: number
  update_time: number
}

export function listCommands(guardianId: string): GuardianCommand[] {
  const db = getDB()
  return db.prepare(
    'SELECT * FROM GuardianCommand WHERE guardian_id = ? AND delete_flag = 0 AND active = 1 ORDER BY priority DESC, create_time DESC'
  ).all(guardianId) as GuardianCommand[]
}

export function listCommandsForStudent(studentId: string): GuardianCommand[] {
  const db = getDB()
  return db.prepare(
    'SELECT * FROM GuardianCommand WHERE student_id = ? AND delete_flag = 0 AND active = 1 ORDER BY priority DESC, create_time DESC'
  ).all(studentId) as GuardianCommand[]
}

export function createCommand(guardianId: string, studentId: string, instruction: string, priority: string = 'normal'): GuardianCommand {
  const db = getDB()
  const id = uuidv4()
  const now = Date.now()
  db.prepare(
    'INSERT INTO GuardianCommand (id, guardian_id, student_id, instruction, priority, create_time, update_time) VALUES (?,?,?,?,?,?,?)'
  ).run(id, guardianId, studentId, instruction, priority, now, now)
  return { id, guardian_id: guardianId, student_id: studentId, instruction, priority: priority as any, active: 1, acknowledged: 0, executed_count: 0, create_time: now, update_time: now }
}

export function acknowledgeCommand(id: string): void {
  const db = getDB()
  db.prepare('UPDATE GuardianCommand SET acknowledged = 1, update_time = ? WHERE id = ?')
    .run(Date.now(), id)
}

export function incrementExecuted(id: string): void {
  const db = getDB()
  db.prepare('UPDATE GuardianCommand SET executed_count = executed_count + 1, update_time = ? WHERE id = ?')
    .run(Date.now(), id)
}

export function deleteCommand(id: string): void {
  const db = getDB()
  db.prepare('UPDATE GuardianCommand SET active = 0, delete_flag = 1, update_time = ? WHERE id = ?')
    .run(Date.now(), id)
}

export function getGuardianOverview(studentId: string): any {
  const db = getDB()
  const student = db.prepare(
    'SELECT id, display_name, student_grade, role FROM User WHERE id = ? AND delete_flag = 0'
  ).get(studentId) as any
  if (!student) return null

  const recordCount = (db.prepare(
    'SELECT COUNT(*) as c FROM LearningRecord WHERE student_id = ? AND delete_flag = 0'
  ).get(studentId) as any).c

  const lastRecord = db.prepare(
    'SELECT MAX(record_date) as max_date FROM LearningRecord WHERE student_id = ? AND delete_flag = 0'
  ).get(studentId) as any

  const weakPoints = db.prepare(
    'SELECT topic, subject, confidence FROM KnowledgePoint WHERE student_id = ? AND delete_flag = 0 AND confidence < 0.5 ORDER BY confidence ASC LIMIT 5'
  ).all(studentId) as any[]

  const snapshot = db.prepare(
    'SELECT * FROM SobrietySnapshot WHERE student_id = ?'
  ).get(studentId) as any

  const board = db.prepare(
    "SELECT * FROM Board WHERE student_id = ? AND mode = 'study' AND delete_flag = 0"
  ).get() as any

  const commands = listCommandsForStudent(studentId)

  return {
    student,
    totalRecords: recordCount,
    lastActiveAt: lastRecord?.max_date || null,
    weakPoints,
    urgency: snapshot ? JSON.parse(snapshot.snapshot || '{}').urgency : null,
    boardBlocks: board?.block_count || 0,
    activeCommands: commands,
  }
}
