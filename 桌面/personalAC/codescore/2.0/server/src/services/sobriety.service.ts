import { getDB } from '../database'

export interface SobrietySnapshot {
  generated_at: number
  days_since_active: number | null
  exam: { type: string; date: number; days_left: number } | null
  due_reviews: Array<{ topic: string; subject: string; retention: number; days_overdue: number }>
  persistent_blocks: Array<{ topic: string; subject: string; root_cause: string | null; attempts: number }>
  subject_drift: { recent_distribution: Record<string, number>; primary_subject: string | null; drift_warning: string | null }
  unresolved_from_last: string | null
  urgency: { level: 'idle' | 'normal' | 'attention' | 'urgent'; reasons: string[] }
  today_priority: string
  board_activity?: { blocks_today: number; ai_interactions: number; focus_topic: string | null }
}

export function generateSobrietySnapshot(studentId: string): SobrietySnapshot {
  const db = getDB()
  const now = Date.now()

  // 距上次学习天数
  const lastRecord = db.prepare(
    'SELECT MAX(record_date) as max_date FROM LearningRecord WHERE student_id = ? AND delete_flag = 0'
  ).get(studentId) as { max_date: number | null }
  const daysSinceActive = lastRecord?.max_date
    ? Math.floor((now - lastRecord.max_date) / 86400000)
    : null

  // 考试信息
  const goal = db.prepare(
    'SELECT * FROM StudentGoal WHERE student_id = ? AND delete_flag = 0 ORDER BY update_time DESC LIMIT 1'
  ).get(studentId) as any
  let exam: SobrietySnapshot['exam'] = null
  if (goal?.exam_date) {
    const daysLeft = Math.ceil((goal.exam_date - now) / 86400000)
    exam = { type: goal.exam_type || '考试', date: goal.exam_date, days_left: daysLeft }
  }

  // 到期复习 (retention < 0.5)
  const kps = db.prepare(
    'SELECT topic, subject, confidence, stability, last_practiced, attempt_count, root_cause FROM KnowledgePoint WHERE student_id = ? AND delete_flag = 0 AND last_practiced IS NOT NULL ORDER BY confidence ASC LIMIT 10'
  ).all(studentId) as any[]

  const dueReviews: SobrietySnapshot['due_reviews'] = []
  const persistentBlocks: SobrietySnapshot['persistent_blocks'] = []
  for (const kp of kps) {
    const days = kp.last_practiced ? (now - kp.last_practiced) / 86400000 : 999
    const retention = Math.exp(-days / ((kp.stability || 1) * 5))
    if (retention < 0.5) {
      dueReviews.push({
        topic: kp.topic, subject: kp.subject,
        retention: Math.round(retention * 100),
        days_overdue: Math.round(days),
      })
    }
    if (kp.attempt_count >= 3 && kp.confidence < 0.5) {
      persistentBlocks.push({
        topic: kp.topic, subject: kp.subject,
        root_cause: kp.root_cause,
        attempts: kp.attempt_count,
      })
    }
  }

  // 学科漂移
  const recentRecords = db.prepare(
    'SELECT subject, SUM(duration_minutes) as mins FROM LearningRecord WHERE student_id = ? AND delete_flag = 0 AND record_date > ? GROUP BY subject'
  ).all(studentId, now - 14 * 86400000) as any[]
  const dist: Record<string, number> = {}
  let totalMins = 0
  for (const r of recentRecords) { dist[r.subject] = r.mins; totalMins += r.mins }
  const recentDist: Record<string, number> = {}
  for (const [subj, mins] of Object.entries(dist)) {
    recentDist[subj] = totalMins > 0 ? Math.round((mins / totalMins) * 100) : 0
  }
  let primarySubject: string | null = null
  let maxMins = 0
  for (const [subj, mins] of Object.entries(dist)) {
    if (mins > maxMins) { maxMins = mins; primarySubject = subj }
  }

  // 紧迫度
  const reasons: string[] = []
  let level: SobrietySnapshot['urgency']['level'] = 'normal'
  if (daysSinceActive === null || daysSinceActive > 365) { level = 'idle'; reasons.push('无学习记录') }
  if (exam && exam.days_left < 30) { level = 'urgent'; reasons.push(`距${exam.type}仅${exam.days_left}天`) }
  else if (exam && exam.days_left < 90) { level = 'attention'; reasons.push(`距${exam.type}${exam.days_left}天`) }
  if (daysSinceActive && daysSinceActive >= 3) { level = level === 'urgent' ? 'urgent' : 'attention'; reasons.push(`${daysSinceActive}天未学习`) }
  if (dueReviews.length >= 3) { level = level === 'urgent' ? 'urgent' : 'attention'; reasons.push(`${dueReviews.length}个知识点待复习`) }

  // today_priority
  let priority = '暂无紧迫事项'
  if (exam && exam.days_left < 30) priority = `距${exam.type}仅${exam.days_left}天，需重点冲刺`
  if (dueReviews.length > 0) {
    const topics = dueReviews.slice(0, 3).map(r => `${r.topic}(${r.retention}%)`).join('、')
    priority = `待复习: ${topics}` + (exam ? `；距${exam.type}${exam.days_left}天` : '')
  }

  // 白板活跃度
  const todayStart = new Date().setHours(0, 0, 0, 0)
  const boardEvents = db.prepare(
    "SELECT COUNT(*) as c FROM BoardEvent WHERE board_id IN (SELECT id FROM Board WHERE student_id = ?) AND create_time > ? AND actor = 'student'"
  ).get(studentId, todayStart) as { c: number }
  const chatMsgs = db.prepare(
    "SELECT COUNT(*) as c FROM ChatMessage WHERE student_id = ? AND create_time > ? AND role = 'user'"
  ).get(studentId, todayStart) as { c: number }

  const snapshot: SobrietySnapshot = {
    generated_at: now,
    days_since_active: daysSinceActive,
    exam,
    due_reviews: dueReviews.slice(0, 5),
    persistent_blocks: persistentBlocks.slice(0, 3),
    subject_drift: { recent_distribution: recentDist, primary_subject: primarySubject, drift_warning: null },
    unresolved_from_last: null,
    urgency: { level, reasons },
    today_priority: priority,
    board_activity: { blocks_today: boardEvents?.c || 0, ai_interactions: chatMsgs?.c || 0, focus_topic: null },
  }

  // Upsert
  db.prepare(
    'INSERT INTO SobrietySnapshot (student_id, snapshot, generated_at, last_urgency, create_time, update_time) VALUES (?,?,?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET snapshot=excluded.snapshot, generated_at=excluded.generated_at, last_urgency=excluded.last_urgency, update_time=excluded.update_time'
  ).run(studentId, JSON.stringify(snapshot), now, level, now, now)

  return snapshot
}
