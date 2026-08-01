import cron from 'node-cron'
import { getDB } from '../database'
import { generateSobrietySnapshot } from '../services/sobriety.service'

interface CronJob {
  id: string
  studentId: string
  expression: string
  description: string
  task: cron.ScheduledTask
}

const jobs: Map<string, CronJob> = new Map()

export function initScheduler(): void {
  // 每小时刷新清醒快照
  cron.schedule('0 * * * *', () => {
    const db = getDB()
    const students = db.prepare(
      "SELECT id FROM User WHERE role = 'student' AND delete_flag = 0"
    ).all() as { id: string }[]

    for (const s of students) {
      try {
        generateSobrietySnapshot(s.id)
      } catch (err) {
        console.error(`Sobriety snapshot failed for ${s.id}:`, err)
      }
    }
  })

  // 每天 20:00 日常回顾
  cron.schedule('0 20 * * *', () => {
    console.log('[Scheduler] Daily review triggered')
    // 后续实现：触发每日回顾生成
  })

  console.log('  ✓ Scheduler initialized (sobriety hourly + daily review)')
}

export function createSchedule(studentId: string, expression: string, description: string): string {
  const db = getDB()
  const { v4: uuidv4 } = require('uuid')
  const id = uuidv4()
  const now = Date.now()

  db.prepare(
    'INSERT INTO ScheduleConfig (id, student_id, cron_expression, description, create_time, update_time) VALUES (?,?,?,?,?,?)'
  ).run(id, studentId, expression, description, now, now)

  const task = cron.schedule(expression, () => {
    console.log(`[Scheduler] Task: ${description} for student ${studentId}`)
    db.prepare('UPDATE ScheduleConfig SET last_run = ?, update_time = ? WHERE id = ?')
      .run(Date.now(), Date.now(), id)
  })

  jobs.set(id, { id, studentId, expression, description, task })
  return id
}

export function destroyScheduler(): void {
  for (const job of jobs.values()) {
    job.task.stop()
  }
  jobs.clear()
}
