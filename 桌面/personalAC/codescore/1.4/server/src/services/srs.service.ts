import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'

// SM-2 算法实现
// grade: 0=完全忘记 1=严重错误 2=错误但记得 3=勉强正确 4=正确稍慢 5=完美
export function sm2Review(
  grade: number,        // 0-5
  reps: number,         // 累计成功复习次数
  interval: number,     // 上次间隔天数
  ease: number          // 难度因子，初始 2.5
): { reps: number; interval: number; ease: number; dueAt: number } {
  let newReps = reps
  let newInterval = interval
  let newEase = ease

  if (grade >= 3) {
    if (reps === 0) newInterval = 1
    else if (reps === 1) newInterval = 6
    else newInterval = Math.round(interval * ease)
    newReps = reps + 1
  } else {
    newReps = 0
    newInterval = 1
  }

  // 调整难度因子
  newEase = Math.max(1.3, ease + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))

  return {
    reps: newReps,
    interval: newInterval,
    ease: parseFloat(newEase.toFixed(4)),
    dueAt: Date.now() + newInterval * 86400 * 1000
  }
}

export interface SRSItem {
  id: string
  topic: string
  subject: string
  confidence: number
  srsInterval: number
  srsEase: number
  srsReps: number
  srsDueAt: number | null
  lastPracticed: number | null
}

export function getDueItems(studentId: string): SRSItem[] {
  const db = getDB()
  const now = Date.now()
  return db.prepare(`
    SELECT id, topic, subject, confidence,
           COALESCE(srs_interval, 1) AS srsInterval,
           COALESCE(srs_ease, 2.5)   AS srsEase,
           COALESCE(srs_reps, 0)     AS srsReps,
           srs_due_at                AS srsDueAt,
           last_practiced            AS lastPracticed
    FROM KnowledgePoint
    WHERE student_id = ? AND delete_flag = 0
      AND (srs_due_at IS NULL OR srs_due_at <= ?)
    ORDER BY COALESCE(confidence, 0.5) ASC, srs_due_at ASC
    LIMIT 20
  `).all(studentId, now) as SRSItem[]
}

export function getDueCount(studentId: string): number {
  const db = getDB()
  const now = Date.now()
  const row = db.prepare(`
    SELECT COUNT(*) AS c FROM KnowledgePoint
    WHERE student_id = ? AND delete_flag = 0
      AND (srs_due_at IS NULL OR srs_due_at <= ?)
  `).get(studentId, now) as { c: number }
  return row.c
}

export function recordReview(
  kpId: string,
  grade: number, // 0-5
  studentId: string
): { success: boolean; dueAt: number } {
  const db = getDB()
  const kp = db.prepare(`
    SELECT COALESCE(srs_interval, 1) AS interval,
           COALESCE(srs_ease, 2.5)   AS ease,
           COALESCE(srs_reps, 0)     AS reps
    FROM KnowledgePoint WHERE id = ? AND student_id = ? AND delete_flag = 0
  `).get(kpId, studentId) as { interval: number; ease: number; reps: number } | undefined

  if (!kp) throw new Error('知识点不存在')

  const { reps, interval, ease, dueAt } = sm2Review(grade, kp.reps, kp.interval, kp.ease)

  // 更新 confidence：用新 ease（sm2Review 后），grade=0 时不会虚高
  const confidence = Math.min(1, Math.max(0.05, (grade / 5) * 0.3 + (ease - 1.3) / (3.0 - 1.3) * 0.7))

  db.prepare(`
    UPDATE KnowledgePoint
    SET srs_reps = ?, srs_interval = ?, srs_ease = ?, srs_due_at = ?,
        confidence = ?, last_practiced = ?, update_time = ?
    WHERE id = ?
  `).run(reps, interval, ease, dueAt, confidence, Date.now(), Date.now(), kpId)

  return { success: true, dueAt }
}

export function getStudentQuizQuestion(studentId: string): SRSItem | null {
  const db = getDB()
  const now = Date.now()
  return db.prepare(`
    SELECT id, topic, subject, confidence,
           COALESCE(srs_interval, 1) AS srsInterval,
           COALESCE(srs_ease, 2.5)   AS srsEase,
           COALESCE(srs_reps, 0)     AS srsReps,
           srs_due_at AS srsDueAt,
           last_practiced AS lastPracticed
    FROM KnowledgePoint
    WHERE student_id = ? AND delete_flag = 0
      AND (srs_due_at IS NULL OR srs_due_at <= ?)
    ORDER BY COALESCE(confidence, 0.5) ASC LIMIT 1
  `).get(studentId, now) as SRSItem | null
}
