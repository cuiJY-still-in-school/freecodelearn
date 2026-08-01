import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { getDB } from '../database'
import {
  createTodo, listTodos, getTodoById, updateTodo, deleteTodo, getOverdueTodos
} from '../services/todo.service'

const router = Router()

function canAccessStudent(req: AuthRequest, studentId: string): boolean {
  if (req.userRole === 'student') return req.userId === studentId
  const db = getDB()
  const linked = db.prepare('SELECT id FROM User WHERE id = ? AND guardian_id = ? AND delete_flag = 0')
    .get(studentId, req.userId!) as { id: string } | undefined
  return !!linked
}

// GET /api/todo/overdue — 当前用户（学生）的逾期待办，供客户端通知使用
router.get('/overdue', requireAuth, (req: AuthRequest, res: Response) => {
  const overdue = getOverdueTodos(req.userId!)
  res.json({ success: true, data: { todos: overdue, count: overdue.length } })
})

// GET /api/todo/:studentId
router.get('/:studentId', requireAuth, (req: AuthRequest, res: Response) => {
  const { studentId } = req.params
  if (!canAccessStudent(req, studentId)) { res.status(403).json({ error: 'forbidden' }); return }
  const { status, priority, limit, offset } = req.query
  const todos = listTodos(studentId, {
    status: status as any,
    priority: priority as any,
    limit: limit ? parseInt(limit as string) : undefined,
    offset: offset ? parseInt(offset as string) : undefined
  })
  const overdue = getOverdueTodos(studentId)
  res.json({ todos, overdueCount: overdue.length })
})

// POST /api/todo
router.post('/', requireAuth, (req: AuthRequest, res: Response) => {
  const { student_id, title, content, priority, due_date, recurrence, related_kp_id } = req.body
  if (!student_id || !title) {
    res.status(400).json({ error: 'student_id and title are required' })
    return
  }
  if (!canAccessStudent(req, student_id)) { res.status(403).json({ error: 'forbidden' }); return }
  const todo = createTodo({ student_id, title, content, priority, due_date, recurrence, related_kp_id, agent_created: false })
  res.json(todo)
})

// PATCH /api/todo/:id
router.patch('/:id', requireAuth, (req: AuthRequest, res: Response) => {
  const { id } = req.params
  const existing = getTodoById(id)
  if (!existing) { res.status(404).json({ error: 'Todo not found' }); return }
  if (!canAccessStudent(req, existing.student_id)) { res.status(403).json({ error: 'forbidden' }); return }
  const updated = updateTodo(id, req.body)
  res.json(updated)
})

// DELETE /api/todo/:id
router.delete('/:id', requireAuth, (req: AuthRequest, res: Response) => {
  const existing = getTodoById(req.params.id)
  if (!existing) { res.status(404).json({ error: 'Todo not found' }); return }
  if (!canAccessStudent(req, existing.student_id)) { res.status(403).json({ error: 'forbidden' }); return }
  deleteTodo(req.params.id)
  res.json({ ok: true })
})

export default router
