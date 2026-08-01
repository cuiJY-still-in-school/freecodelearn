import cron from 'node-cron'
import { v4 as uuidv4 } from 'uuid'
import { powerMonitor } from 'electron'
import { getDB } from '../database'
import log from 'electron-log'

interface ScheduledTask {
  scheduleId: string
  studentId: string
  cronExpression: string
  description: string
  task: cron.ScheduledTask
}

export interface SchedulerResult {
  success: boolean
  data?: unknown
  error?: string
}

export class AgentScheduler {
  private scheduledTasks: Map<string, ScheduledTask> = new Map()
  private onTrigger: ((studentId: string, scheduleId: string, description: string) => void) | null =
    null

  constructor(onTrigger?: (studentId: string, scheduleId: string, description: string) => void) {
    if (onTrigger) {
      this.onTrigger = onTrigger
    }
  }

  init(): void {
    this.loadActiveSchedules()
    this.registerPowerMonitor()
    log.info('AgentScheduler initialized')
  }

  private loadActiveSchedules(): void {
    try {
      const db = getDB()
      const schedules = db
        .prepare(
          "SELECT id, student_id, cron_expression, description FROM ScheduleConfig WHERE status = 'active' AND delete_flag = 0"
        )
        .all() as Array<{
        id: string
        student_id: string
        cron_expression: string
        description: string
      }>

      for (const schedule of schedules) {
        this.registerCronJob(
          schedule.id,
          schedule.student_id,
          schedule.cron_expression,
          schedule.description
        )
      }

      log.info(`Loaded ${schedules.length} active schedules`)
    } catch (err) {
      log.error('Failed to load schedules:', err)
    }
  }

  private registerCronJob(
    scheduleId: string,
    studentId: string,
    cronExpression: string,
    description: string
  ): boolean {
    if (!cron.validate(cronExpression)) {
      log.warn(`Invalid cron expression: ${cronExpression}`)
      return false
    }

    // Stop existing if any
    const existing = this.scheduledTasks.get(scheduleId)
    if (existing) {
      existing.task.stop()
      this.scheduledTasks.delete(scheduleId)
    }

    const task = cron.schedule(cronExpression, () => {
      log.info(`Cron triggered: scheduleId=${scheduleId}, student=${studentId}`)
      this.onScheduleTrigger(scheduleId, studentId, description)
    })

    this.scheduledTasks.set(scheduleId, {
      scheduleId,
      studentId,
      cronExpression,
      description,
      task
    })

    return true
  }

  private onScheduleTrigger(scheduleId: string, studentId: string, description: string): void {
    try {
      const db = getDB()
      db.prepare(
        'UPDATE ScheduleConfig SET last_run = ?, update_time = ? WHERE id = ?'
      ).run(Date.now(), Date.now(), scheduleId)

      if (this.onTrigger) {
        this.onTrigger(studentId, scheduleId, description)
      }
    } catch (err) {
      log.error('Schedule trigger error:', err)
    }
  }

  private registerPowerMonitor(): void {
    powerMonitor.on('resume', () => {
      log.info('System resumed from sleep, running compensation...')
      this.compensateMissedTasks()
    })

    powerMonitor.on('unlock-screen', () => {
      log.info('Screen unlocked, running compensation...')
      this.compensateMissedTasks()
    })
  }

  createSchedule(
    studentId: string,
    cronExpression: string,
    description: string
  ): SchedulerResult {
    try {
      const db = getDB()
      const now = Date.now()

      if (!cron.validate(cronExpression)) {
        return { success: false, error: `无效的 cron 表达式: ${cronExpression}` }
      }

      const scheduleId = uuidv4()

      db.prepare(`
        INSERT INTO ScheduleConfig (id, student_id, cron_expression, description, status, create_user, update_user, create_time, update_time, delete_flag)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, 0)
      `).run(scheduleId, studentId, cronExpression, description, studentId, studentId, now, now)

      this.registerCronJob(scheduleId, studentId, cronExpression, description)

      log.info(`Schedule created: ${scheduleId} for student ${studentId}`)
      return {
        success: true,
        data: { scheduleId, cronExpression, description, status: 'active' }
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err)
      log.error('createSchedule error:', error)
      return { success: false, error }
    }
  }

  removeSchedule(scheduleId: string): SchedulerResult {
    try {
      const db = getDB()
      const now = Date.now()

      // Stop cron job
      const existing = this.scheduledTasks.get(scheduleId)
      if (existing) {
        existing.task.stop()
        this.scheduledTasks.delete(scheduleId)
      }

      // Update DB
      const result = db
        .prepare(
          "UPDATE ScheduleConfig SET status = 'deleted', update_time = ? WHERE id = ? AND delete_flag = 0"
        )
        .run(now, scheduleId)

      if (result.changes === 0) {
        return { success: false, error: '定时任务不存在' }
      }

      log.info(`Schedule removed: ${scheduleId}`)
      return { success: true, data: { message: '定时任务已停用' } }
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err)
      log.error('removeSchedule error:', error)
      return { success: false, error }
    }
  }

  compensateMissedTasks(): void {
    try {
      const db = getDB()
      const now = Date.now()
      const oneHourAgo = now - 60 * 60 * 1000

      // Find schedules that should have run but didn't (last_run is null or > 1 hour ago)
      const missedSchedules = db
        .prepare(
          `SELECT id, student_id, cron_expression, description, last_run
           FROM ScheduleConfig
           WHERE status = 'active' AND delete_flag = 0
           AND (last_run IS NULL OR last_run < ?)`
        )
        .all(oneHourAgo) as Array<{
        id: string
        student_id: string
        cron_expression: string
        description: string
        last_run: number | null
      }>

      log.info(`Compensating ${missedSchedules.length} potentially missed tasks`)

      for (const schedule of missedSchedules) {
        // Check if cron would have fired during missed period
        const lastRun = schedule.last_run || now - 24 * 60 * 60 * 1000

        if (this.shouldHaveFired(schedule.cron_expression, lastRun, now)) {
          log.info(`Compensating missed task: ${schedule.id} for student ${schedule.student_id}`)
          this.onScheduleTrigger(schedule.id, schedule.student_id, schedule.description + ' (补偿)')
        }
      }
    } catch (err) {
      log.error('compensateMissedTasks error:', err)
    }
  }

  private shouldHaveFired(cronExpression: string, fromTime: number, toTime: number): boolean {
    // Simple heuristic: if the gap is more than the cron interval estimate, it likely missed
    // For production, use a proper cron parser library
    const gapMinutes = (toTime - fromTime) / 60000

    // Parse common patterns
    if (cronExpression.includes('*/') || cronExpression.startsWith('0 ')) {
      // Hourly or daily — if gap > 60 min, likely missed
      return gapMinutes > 60
    }

    return gapMinutes > 30
  }

  getActiveSchedules(studentId: string): SchedulerResult {
    try {
      const db = getDB()
      const schedules = db
        .prepare(
          "SELECT id, student_id, cron_expression, description, last_run, status FROM ScheduleConfig WHERE student_id = ? AND status = 'active' AND delete_flag = 0"
        )
        .all(studentId)

      return { success: true, data: schedules }
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err)
      return { success: false, error }
    }
  }

  destroy(): void {
    for (const [, task] of this.scheduledTasks) {
      task.task.stop()
    }
    this.scheduledTasks.clear()
    log.info('AgentScheduler destroyed')
  }
}
