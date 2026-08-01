import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'

export interface AgentThought {
  id: string
  student_id: string
  triggered_by: string
  summary: string
  actions_taken: string | null   // JSON array of action strings
  next_focus: string | null
  urgency: string
  created_at: number
}

export function recordThought(params: {
  student_id: string
  triggered_by: string
  summary: string
  actions_taken?: string[]
  next_focus?: string
  urgency?: string
}): AgentThought {
  const db = getDB()
  const id = uuidv4()
  const now = Date.now()
  db.prepare(`
    INSERT INTO AgentThought (id, student_id, triggered_by, summary, actions_taken, next_focus, urgency, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.student_id,
    params.triggered_by,
    params.summary,
    params.actions_taken ? JSON.stringify(params.actions_taken) : null,
    params.next_focus ?? null,
    params.urgency ?? 'normal',
    now
  )
  return db.prepare(`SELECT * FROM AgentThought WHERE id=?`).get(id) as AgentThought
}

export function getLastThought(studentId: string): AgentThought | null {
  const db = getDB()
  const row = db.prepare(
    `SELECT * FROM AgentThought WHERE student_id=? ORDER BY created_at DESC LIMIT 1`
  ).get(studentId) as AgentThought | undefined
  return row ?? null
}

export function listThoughts(studentId: string, limit = 20): AgentThought[] {
  const db = getDB()
  return db.prepare(
    `SELECT * FROM AgentThought WHERE student_id=? ORDER BY created_at DESC LIMIT ?`
  ).all(studentId, limit) as AgentThought[]
}
