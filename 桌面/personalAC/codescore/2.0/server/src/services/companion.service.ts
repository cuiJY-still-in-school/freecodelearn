import { getDB } from '../database'

export type CompanionState = 'idle' | 'watching' | 'thinking' | 'writing'

export interface CompanionConfig {
  student_id: string
  companion_name: string
  companion_style: 'friendly' | 'encouraging' | 'strict'
  current_state: CompanionState
  last_state_change: number | null
}

export function getOrCreateCompanion(studentId: string): CompanionConfig {
  const db = getDB()
  let config = db.prepare('SELECT * FROM CompanionConfig WHERE student_id = ?').get(studentId) as CompanionConfig | undefined
  if (!config) {
    const now = Date.now()
    db.prepare(
      "INSERT INTO CompanionConfig (student_id, companion_name, companion_style, current_state, create_time, update_time) VALUES (?, '小伴', 'friendly', 'idle', ?, ?)"
    ).run(studentId, now, now)
    config = { student_id: studentId, companion_name: '小伴', companion_style: 'friendly', current_state: 'idle', last_state_change: now }
  }
  return config
}

export function setCompanionState(studentId: string, state: CompanionState): void {
  const db = getDB()
  const now = Date.now()
  db.prepare('UPDATE CompanionConfig SET current_state = ?, last_state_change = ?, update_time = ? WHERE student_id = ?')
    .run(state, now, now, studentId)
}

export function updateCompanionConfig(studentId: string, updates: { companion_name?: string; companion_style?: string }): CompanionConfig {
  const db = getDB()
  const now = Date.now()
  if (updates.companion_name) {
    db.prepare('UPDATE CompanionConfig SET companion_name = ?, update_time = ? WHERE student_id = ?')
      .run(updates.companion_name, now, studentId)
  }
  if (updates.companion_style) {
    db.prepare('UPDATE CompanionConfig SET companion_style = ?, update_time = ? WHERE student_id = ?')
      .run(updates.companion_style, now, studentId)
  }
  return getOrCreateCompanion(studentId)
}
