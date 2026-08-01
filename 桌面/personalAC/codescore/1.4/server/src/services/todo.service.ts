import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'

export type TodoPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TodoStatus = 'pending' | 'done' | 'dropped'

export interface Todo {
  id: string
  student_id: string
  title: string
  content: string | null
  priority: TodoPriority
  status: TodoStatus
  due_date: number | null
  recurrence: string | null   // cron string，如 "0 9 * * 1" = 每周一9点
  agent_created: boolean
  must_do: number             // 1=必做项（监护人/AI 标记，学生首先完成）
  related_kp_id: string | null
  reminded_at: number | null
  create_time: number
  update_time: number
}

export interface CreateTodoInput {
  student_id: string
  title: string
  content?: string
  priority?: TodoPriority
  due_date?: number
  recurrence?: string
  agent_created?: boolean
  must_do?: boolean
  related_kp_id?: string
}

export function createTodo(input: CreateTodoInput): Todo {
  const db = getDB()
  const id = uuidv4()
  const now = Date.now()
  db.prepare(`
    INSERT INTO Todo (id, student_id, title, content, priority, status, due_date, recurrence, agent_created, must_do, related_kp_id, create_time, update_time)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.student_id,
    input.title,
    input.content ?? null,
    input.priority ?? 'normal',
    input.due_date ?? null,
    input.recurrence ?? null,
    input.agent_created ? 1 : 0,
    input.must_do ? 1 : 0,
    input.related_kp_id ?? null,
    now,
    now
  )
  return getTodoById(id)!
}

export function getTodoById(id: string): Todo | null {
  const db = getDB()
  const row = db.prepare(`SELECT * FROM Todo WHERE id=? AND delete_flag=0`).get(id) as Todo | undefined
  if (!row) return null
  return mapRow(row)
}

export function listTodos(studentId: string, opts: {
  status?: TodoStatus
  priority?: TodoPriority
  limit?: number
  offset?: number
} = {}): Todo[] {
  const db = getDB()
  const conditions = [`student_id=?`, `delete_flag=0`]
  const params: unknown[] = [studentId]
  if (opts.status) { conditions.push('status=?'); params.push(opts.status) }
  if (opts.priority) { conditions.push('priority=?'); params.push(opts.priority) }
  params.push(opts.limit ?? 50)
  params.push(opts.offset ?? 0)
  const rows = db.prepare(
    `SELECT * FROM Todo WHERE ${conditions.join(' AND ')} ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, due_date ASC NULLS LAST, create_time DESC LIMIT ? OFFSET ?`
  ).all(...params) as Todo[]
  return rows.map(mapRow)
}

const UPDATABLE_TODO_COLS = new Set(['title', 'content', 'priority', 'status', 'due_date', 'recurrence', 'must_do'])

export function updateTodo(id: string, patch: Partial<Pick<Todo, 'title' | 'content' | 'priority' | 'status' | 'due_date' | 'recurrence' | 'must_do'>>): Todo | null {
  const db = getDB()
  const fields: string[] = []
  const params: unknown[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (!UPDATABLE_TODO_COLS.has(k)) continue
    fields.push(`${k}=?`)
    params.push(v)
  }
  if (fields.length === 0) return getTodoById(id)
  fields.push('update_time=?')
  params.push(Date.now())
  params.push(id)
  db.prepare(`UPDATE Todo SET ${fields.join(', ')} WHERE id=? AND delete_flag=0`).run(...params)
  return getTodoById(id)
}

export function deleteTodo(id: string): void {
  const db = getDB()
  db.prepare(`UPDATE Todo SET delete_flag=1, update_time=? WHERE id=?`).run(Date.now(), id)
}

export function markReminded(id: string): void {
  const db = getDB()
  db.prepare(`UPDATE Todo SET reminded_at=?, update_time=? WHERE id=?`).run(Date.now(), Date.now(), id)
}

// 找出所有即将到期且尚未提醒的 pending todo（due_date 在 now ~ now+2h 内）
export function getDueSoonTodos(studentId: string): Todo[] {
  const db = getDB()
  const now = Date.now()
  const lookahead = now + 2 * 60 * 60 * 1000 // 2 hours
  const rows = db.prepare(`
    SELECT * FROM Todo
    WHERE student_id=? AND delete_flag=0 AND status='pending'
      AND due_date IS NOT NULL AND due_date <= ?
      AND (reminded_at IS NULL OR reminded_at < ?)
  `).all(studentId, lookahead, now - 60 * 60 * 1000) as Todo[] // 1h 静默期避免重复提醒
  return rows.map(mapRow)
}

// 找出今日到期的 pending todo（时间到今天末尾）
export function getTodayDueTodos(studentId: string): Todo[] {
  const db = getDB()
  const now = Date.now()
  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)
  const rows = db.prepare(`
    SELECT * FROM Todo
    WHERE student_id=? AND delete_flag=0 AND status='pending'
      AND due_date IS NOT NULL AND due_date <= ?
  `).all(studentId, endOfDay.getTime()) as Todo[]
  return rows.map(mapRow)
}

export function getOverdueTodos(studentId: string): Todo[] {
  const db = getDB()
  const now = Date.now()
  const rows = db.prepare(`
    SELECT * FROM Todo
    WHERE student_id=? AND delete_flag=0 AND status='pending'
      AND due_date IS NOT NULL AND due_date < ?
  `).all(studentId, now) as Todo[]
  return rows.map(mapRow)
}

function mapRow(row: Todo): Todo {
  return {
    ...row,
    agent_created: row.agent_created as unknown as number === 1
  }
}
