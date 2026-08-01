import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'
import log from 'electron-log'

const SUPERADMIN_ID = 'superadmin'

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
  studentId: string,
  title: string,
  description: string,
  subjects: string[]
): PlanResult {
  try {
    const db = getDB()
    const now = Date.now()
    const sid = studentId || SUPERADMIN_ID

    // Archive all active plans for this student
    db.prepare(`
      UPDATE Plan SET status = 'archived', update_user = ?, update_time = ?
      WHERE student_id = ? AND status = 'active' AND delete_flag = 0
    `).run(SUPERADMIN_ID, now, sid)

    // Create new active plan
    const planId = uuidv4()
    const subjectsJson = JSON.stringify(subjects)

    db.prepare(`
      INSERT INTO Plan (id, student_id, title, description, subjects, status, create_user, update_user, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 0)
    `).run(planId, sid, title, description || '', subjectsJson, SUPERADMIN_ID, SUPERADMIN_ID, now, now)

    log.info(`Plan created for student ${sid}: ${title}`)

    try {
      const { getAgentEngine } = require('../agent')
      const engine = getAgentEngine()
      if (engine) {
        engine.handleEvent({ type: 'plan_changed', studentId: sid, planId })
      }
    } catch {
      // Agent not initialized yet, skip
    }

    const newPlan: Plan = {
      id: planId,
      student_id: sid,
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

export function getActive(studentId: string): PlanResult {
  try {
    const db = getDB()
    const sid = studentId || SUPERADMIN_ID

    const row = db
      .prepare(
        "SELECT * FROM Plan WHERE student_id = ? AND status = 'active' AND delete_flag = 0 ORDER BY create_time DESC LIMIT 1"
      )
      .get(sid) as
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

export function listPlans(studentId: string): PlanResult {
  try {
    const db = getDB()
    const sid = studentId || SUPERADMIN_ID

    const rows = db
      .prepare(
        'SELECT * FROM Plan WHERE student_id = ? AND delete_flag = 0 ORDER BY create_time DESC'
      )
      .all(sid) as Array<{
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
