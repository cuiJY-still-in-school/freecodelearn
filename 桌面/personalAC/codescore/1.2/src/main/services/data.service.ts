import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'
import log from 'electron-log'

const SUPERADMIN_ID = 'superadmin'

export interface LearningRecordInput {
  studentId: string
  subject: string
  topic: string
  score?: number
  durationMinutes?: number
  note?: string
  recordDate?: number
}

export interface LearningRecord {
  id: string
  student_id: string
  subject: string
  topic: string
  score?: number
  duration_minutes: number
  note?: string
  record_date: number
  create_time: number
}

export interface SummaryData {
  totalSessions: number
  totalMinutes: number
  avgScore: number | null
  bySubject: Array<{
    subject: string
    sessions: number
    totalMinutes: number
    avgScore: number | null
  }>
  weakPoints: Array<{
    subject: string
    topic: string
    weakness_score: number
    attempt_count: number
  }>
}

export interface DataResult {
  success: boolean
  data?: LearningRecord | SummaryData | { message: string }
  error?: string
}

export function recordLearning(data: LearningRecordInput): DataResult {
  try {
    const db = getDB()
    const now = Date.now()
    const sid = data.studentId || SUPERADMIN_ID

    const recordId = uuidv4()
    const recordDate = data.recordDate || now

    db.prepare(`
      INSERT INTO LearningRecord (id, student_id, subject, topic, score, duration_minutes, note, record_date, create_user, update_user, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      recordId,
      sid,
      data.subject,
      data.topic,
      data.score ?? null,
      data.durationMinutes ?? 0,
      data.note ?? null,
      recordDate,
      SUPERADMIN_ID,
      SUPERADMIN_ID,
      now,
      now
    )

    // Update KnowledgePoint weakness score
    updateWeaknessScore(sid, data.subject, data.topic, data.score)

    log.info(`Learning recorded for student ${sid}: ${data.subject}/${data.topic}`)

    // Notify agent
    try {
      const { getAgentEngine } = require('../agent')
      const engine = getAgentEngine()
      if (engine) {
        engine.handleEvent({
          type: 'new_learning_data',
          studentId: sid,
          recordId,
          subject: data.subject,
          topic: data.topic,
          score: data.score
        })
      }
    } catch {
      // Agent not ready
    }

    const record: LearningRecord = {
      id: recordId,
      student_id: sid,
      subject: data.subject,
      topic: data.topic,
      score: data.score,
      duration_minutes: data.durationMinutes ?? 0,
      note: data.note,
      record_date: recordDate,
      create_time: now
    }

    return { success: true, data: record }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('RecordLearning error:', error)
    return { success: false, error }
  }
}

function updateWeaknessScore(
  studentId: string,
  subject: string,
  topic: string,
  score: number | undefined
): void {
  try {
    const db = getDB()
    const now = Date.now()

    const existing = db
      .prepare(
        'SELECT id, weakness_score, attempt_count FROM KnowledgePoint WHERE student_id = ? AND subject = ? AND topic = ? AND delete_flag = 0'
      )
      .get(studentId, subject, topic) as
      | { id: string; weakness_score: number; attempt_count: number }
      | undefined

    let weaknessAdjustment = 0
    if (score === undefined) {
      weaknessAdjustment = 0.05
    } else {
      const normalizedScore = Math.max(0, Math.min(100, score)) / 100
      weaknessAdjustment = (0.5 - normalizedScore) * 0.3
    }

    if (existing) {
      const newWeakness = Math.max(0, Math.min(1, existing.weakness_score + weaknessAdjustment))
      db.prepare(`
        UPDATE KnowledgePoint
        SET weakness_score = ?, attempt_count = ?, last_practiced = ?, update_user = ?, update_time = ?
        WHERE id = ?
      `).run(newWeakness, existing.attempt_count + 1, now, SUPERADMIN_ID, now, existing.id)
    } else {
      const initialWeakness = score === undefined ? 0.5 : Math.max(0, 1 - score / 100)
      db.prepare(`
        INSERT INTO KnowledgePoint (id, student_id, subject, topic, weakness_score, attempt_count, last_practiced, create_user, update_user, create_time, update_time, delete_flag)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 0)
      `).run(uuidv4(), studentId, subject, topic, initialWeakness, now, SUPERADMIN_ID, SUPERADMIN_ID, now, now)
    }
  } catch (err) {
    log.warn('updateWeaknessScore error:', err)
  }
}

export function getSummary(
  studentId: string,
  dateFrom: number,
  dateTo: number,
  subject?: string
): DataResult {
  try {
    const db = getDB()
    const sid = studentId || SUPERADMIN_ID

    const subjectFilter = subject ? 'AND subject = ?' : ''
    const subjectParams = subject ? [subject] : []

    const overall = db
      .prepare(
        `SELECT COUNT(*) as totalSessions,
                COALESCE(SUM(duration_minutes), 0) as totalMinutes,
                AVG(CASE WHEN score IS NOT NULL THEN score END) as avgScore
         FROM LearningRecord
         WHERE student_id = ? AND record_date >= ? AND record_date <= ? AND delete_flag = 0 ${subjectFilter}`
      )
      .get(sid, dateFrom, dateTo, ...subjectParams) as {
      totalSessions: number
      totalMinutes: number
      avgScore: number | null
    }

    const bySubjectRows = db
      .prepare(
        `SELECT subject,
                COUNT(*) as sessions,
                COALESCE(SUM(duration_minutes), 0) as totalMinutes,
                AVG(CASE WHEN score IS NOT NULL THEN score END) as avgScore
         FROM LearningRecord
         WHERE student_id = ? AND record_date >= ? AND record_date <= ? AND delete_flag = 0 ${subjectFilter}
         GROUP BY subject
         ORDER BY sessions DESC`
      )
      .all(sid, dateFrom, dateTo, ...subjectParams) as Array<{
      subject: string
      sessions: number
      totalMinutes: number
      avgScore: number | null
    }>

    const weakPoints = db
      .prepare(
        `SELECT subject, topic, weakness_score, attempt_count
         FROM KnowledgePoint
         WHERE student_id = ? AND delete_flag = 0 ${subject ? 'AND subject = ?' : ''}
         ORDER BY weakness_score DESC
         LIMIT 10`
      )
      .all(sid, ...subjectParams) as Array<{
      subject: string
      topic: string
      weakness_score: number
      attempt_count: number
    }>

    const summary: SummaryData = {
      totalSessions: overall.totalSessions,
      totalMinutes: overall.totalMinutes,
      avgScore: overall.avgScore,
      bySubject: bySubjectRows,
      weakPoints
    }

    return { success: true, data: summary }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('getSummary error:', error)
    return { success: false, error }
  }
}
