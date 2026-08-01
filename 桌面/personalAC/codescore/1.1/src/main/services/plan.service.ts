import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'
import { verifyToken } from './auth.service'
import log from 'electron-log'

export interface Plan {
  id: string
  student_id: string
  title: string
  description: string
  subjects: string[]
  status: 'active' | 'archived'
  create_time: number
  update_time: number
}

export interface PlanResult {
  success: boolean
  data?: Plan | Plan[] | { message: string }
  error?: string
}

export function create(
  token: string,
  studentId: string,
  title: string,
  description: string,
  subjects: string[]
): PlanResult {
  try {
    const db = getDB()
    const now = Date.now()

    const tokenResult = verifyToken(token)
    if (!tokenResult.valid || !tokenResult.user) {
      return { success: false, error: 'Token 无效或已过期' }
    }

    const user = tokenResult.user

    // Permission check: admin can manage any; guardian can manage bound students; student manages self
    if (user.role === 'student' && user.id !== studentId) {
      return { success: false, error: '无权为其他学生创建方向' }
    }

    if (user.role === 'guardian') {
      const binding = db
        .prepare(
          'SELECT id FROM GuardianStudentBinding WHERE guardian_id = ? AND student_id = ? AND delete_flag = 0'
        )
        .get(user.id, studentId)
      if (!binding) {
        return { success: false, error: '无权为该学生创建方向' }
      }
    }

    // Verify student exists
    const student = db
      .prepare("SELECT id FROM User WHERE id = ? AND role = 'student' AND delete_flag = 0")
      .get(studentId)
    if (!student) {
      return { success: false, error: '学生不存在' }
    }

    // Archive all active plans for this student
    db.prepare(`
      UPDATE Plan SET status = 'archived', update_user = ?, update_time = ?
      WHERE student_id = ? AND status = 'active' AND delete_flag = 0
    `).run(user.id, now, studentId)

    // Create new active plan
    const planId = uuidv4()
    const subjectsJson = JSON.stringify(subjects)

    db.prepare(`
      INSERT INTO Plan (id, student_id, title, description, subjects, status, create_user, update_user, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 0)
    `).run(planId, studentId, title, description || '', subjectsJson, user.id, user.id, now, now)

    log.info(`Plan created for student ${studentId}: ${title}`)

    try {
      const { getAgentEngine } = require('../agent')
      const engine = getAgentEngine()
      if (engine) {
        engine.handleEvent({ type: 'plan_changed', studentId, planId })
      }
    } catch {
      // Agent not initialized yet, skip
    }

    const newPlan: Plan = {
      id: planId,
      student_id: studentId,
      title,
      description: description || '',
      subjects,
      status: 'active',
      create_time: now,
      update_time: now
    }

    return { success: true, data: newPlan }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('Plan create error:', error)
    return { success: false, error }
  }
}

export function getActive(token: string, studentId: string): PlanResult {
  try {
    const db = getDB()

    const tokenResult = verifyToken(token)
    if (!tokenResult.valid || !tokenResult.user) {
      return { success: false, error: 'Token 无效或已过期' }
    }

    const user = tokenResult.user

    if (user.role === 'student' && user.id !== studentId) {
      return { success: false, error: '无权查看其他学生的方向' }
    }

    if (user.role === 'guardian') {
      const binding = db
        .prepare(
          'SELECT id FROM GuardianStudentBinding WHERE guardian_id = ? AND student_id = ? AND delete_flag = 0'
        )
        .get(user.id, studentId)
      if (!binding) {
        return { success: false, error: '无权查看该学生的方向' }
      }
    }

    const row = db
      .prepare(
        "SELECT * FROM Plan WHERE student_id = ? AND status = 'active' AND delete_flag = 0 ORDER BY create_time DESC LIMIT 1"
      )
      .get(studentId) as
      | {
          id: string
          student_id: string
          title: string
          description: string
          subjects: string
          status: 'active' | 'archived'
          create_time: number
          update_time: number
        }
      | undefined

    if (!row) {
      return { success: true, data: undefined as unknown as Plan }
    }

    const plan: Plan = {
      ...row,
      subjects: JSON.parse(row.subjects)
    }

    return { success: true, data: plan }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('Plan getActive error:', error)
    return { success: false, error }
  }
}

export function listPlans(token: string, studentId: string): PlanResult {
  try {
    const db = getDB()

    const tokenResult = verifyToken(token)
    if (!tokenResult.valid || !tokenResult.user) {
      return { success: false, error: 'Token 无效或已过期' }
    }

    const rows = db
      .prepare(
        'SELECT * FROM Plan WHERE student_id = ? AND delete_flag = 0 ORDER BY create_time DESC'
      )
      .all(studentId) as Array<{
      id: string
      student_id: string
      title: string
      description: string
      subjects: string
      status: 'active' | 'archived'
      create_time: number
      update_time: number
    }>

    const plans: Plan[] = rows.map((row) => ({
      ...row,
      subjects: JSON.parse(row.subjects)
    }))

    return { success: true, data: plans }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('Plan list error:', error)
    return { success: false, error }
  }
}
