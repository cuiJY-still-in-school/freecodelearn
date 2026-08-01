import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'

export interface HomeworkItem {
  id: string
  student_id: string
  subject: string
  title: string
  description: string | null
  status: 'pending' | 'in_progress' | 'submitted' | 'reviewed'
  assigned_by: 'ai' | 'guardian' | 'student'
  difficulty: 'easy' | 'medium' | 'hard'
  due_date: number | null
  score: number | null
  review_notes: string | null
  create_time: number
  update_time: number
}

export function listHomework(studentId: string, status?: string): HomeworkItem[] {
  const db = getDB()
  let query = 'SELECT * FROM Homework WHERE student_id = ? AND delete_flag = 0'
  const params: any[] = [studentId]
  if (status) {
    query += ' AND status = ?'
    params.push(status)
  }
  query += ' ORDER BY create_time DESC'
  return db.prepare(query).all(...params) as HomeworkItem[]
}

export function createHomework(
  studentId: string, subject: string, title: string,
  description?: string, assignedBy: string = 'ai',
  difficulty: string = 'medium', dueDate?: number
): HomeworkItem {
  const db = getDB()
  const id = uuidv4()
  const now = Date.now()
  db.prepare(
    'INSERT INTO Homework (id, student_id, subject, title, description, assigned_by, difficulty, due_date, create_time, update_time) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(id, studentId, subject, title, description || null, assignedBy, difficulty, dueDate || null, now, now)
  return { id, student_id: studentId, subject, title, description: description || null, status: 'pending', assigned_by: assignedBy as any, difficulty: difficulty as any, due_date: dueDate || null, score: null, review_notes: null, create_time: now, update_time: now }
}

export function updateHomeworkStatus(id: string, status: string, score?: number, reviewNotes?: string): void {
  const db = getDB()
  const now = Date.now()
  db.prepare('UPDATE Homework SET status = ?, score = ?, review_notes = ?, update_time = ? WHERE id = ?')
    .run(status, score ?? null, reviewNotes ?? null, now, id)
}
