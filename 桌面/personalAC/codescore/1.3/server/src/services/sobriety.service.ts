// 自我清醒（Self-Sobriety）服务
//
// AI 不依赖外部触发；它持续维护一份对学生当前状态的"清醒认知"，
// 在每次会话开始前注入到 system prompt，使 AI 从第一句话就知道局势：
//   - 距考试还有多少天
//   - 哪些知识点已接近遗忘临界
//   - 近期学科分布是否偏离考试重心
//   - 哪些卡点持续未突破
// 这份快照既驱动对话方向，也作为"主动推送"的判据。

import { getDB } from '../database'

export type UrgencyLevel = 'idle' | 'normal' | 'attention' | 'urgent'

export interface SobrietySnapshot {
  generated_at: number
  days_since_active: number | null
  exam: { type: string; date: number; days_left: number } | null

  due_reviews: Array<{
    topic: string
    subject: string
    retention: number   // 0-1, Ebbinghaus 估计
    days_overdue: number
  }>

  persistent_blocks: Array<{
    topic: string
    subject: string
    root_cause: string | null
    attempts: number
  }>

  subject_drift: {
    recent_distribution: Record<string, number>  // subject → percentage
    primary_subject: string | null
    drift_warning: string | null
  }

  unresolved_from_last: string | null

  urgency: { level: UrgencyLevel; reasons: string[] }

  // 给 system prompt 注入的简洁摘要（一段中文，≤400字）
  today_priority: string
}

// ────────────────────────────────────────────────────────
// 生成 — 从 DB 状态推导，不调用 AI（保持快、确定）
// ────────────────────────────────────────────────────────

export function generateSobrietySnapshot(studentId: string): SobrietySnapshot {
  const db = getDB()
  const now = Date.now()

  // 上次活动
  const last = db.prepare(
    `SELECT MAX(record_date) AS last FROM LearningRecord WHERE student_id=? AND delete_flag=0`
  ).get(studentId) as { last: number | null }
  const days_since_active = last.last !== null
    ? Math.floor((now - last.last) / 86400000)
    : null

  // 考试目标
  const goal = db.prepare(
    `SELECT exam_type, exam_date FROM StudentGoal
     WHERE student_id=? AND delete_flag=0
     ORDER BY update_time DESC LIMIT 1`
  ).get(studentId) as { exam_type: string | null; exam_date: number | null } | undefined

  const exam = (goal?.exam_type && goal.exam_date)
    ? {
        type: goal.exam_type,
        date: goal.exam_date,
        days_left: Math.ceil((goal.exam_date - now) / 86400000)
      }
    : null

  // Ebbinghaus 待复习：retention = e^(-days / (stability×5))
  const kps = db.prepare(
    `SELECT topic, subject, last_practiced,
            COALESCE(stability, 1.0) AS stability,
            COALESCE(confidence, 1 - weakness_score) AS confidence
     FROM KnowledgePoint
     WHERE student_id=? AND delete_flag=0 AND last_practiced IS NOT NULL`
  ).all(studentId) as Array<{
    topic: string; subject: string; last_practiced: number
    stability: number; confidence: number
  }>

  const due_reviews = kps
    .map(k => {
      const days = (now - k.last_practiced) / 86400000
      const retention = Math.exp(-days / Math.max(k.stability * 5, 1))
      return { ...k, days, retention }
    })
    .filter(k => k.retention < 0.5)
    .sort((a, b) => a.retention - b.retention)
    .slice(0, 5)
    .map(k => ({
      topic: k.topic,
      subject: k.subject,
      retention: Math.round(k.retention * 100) / 100,
      days_overdue: Math.round(k.days)
    }))

  // 持续卡点
  const persistent_rows = db.prepare(
    `SELECT topic, subject, root_cause, attempt_count
     FROM KnowledgePoint
     WHERE student_id=? AND delete_flag=0
       AND attempt_count >= 3
       AND COALESCE(confidence, 1 - weakness_score) < 0.5
     ORDER BY attempt_count DESC, weakness_score DESC
     LIMIT 3`
  ).all(studentId) as Array<{
    topic: string; subject: string; root_cause: string | null; attempt_count: number
  }>
  const persistent_blocks = persistent_rows.map(r => ({
    topic: r.topic, subject: r.subject, root_cause: r.root_cause, attempts: r.attempt_count
  }))

  // 学科漂移：近14天分钟分布
  const fourteenDaysAgo = now - 14 * 86400000
  const subjectRows = db.prepare(
    `SELECT subject,
            COUNT(*) AS count,
            SUM(COALESCE(duration_minutes, 0)) AS minutes
     FROM LearningRecord
     WHERE student_id=? AND record_date >= ? AND delete_flag=0
     GROUP BY subject`
  ).all(studentId, fourteenDaysAgo) as Array<{
    subject: string; count: number; minutes: number
  }>

  const totalMin = subjectRows.reduce((s, r) => s + (r.minutes || 0), 0)
  const recent_distribution: Record<string, number> = {}
  for (const r of subjectRows) {
    recent_distribution[r.subject] = totalMin > 0
      ? Math.round((r.minutes / totalMin) * 100)
      : 0
  }
  const primary_subject = subjectRows.length > 0
    ? subjectRows.slice().sort((a, b) => (b.minutes || 0) - (a.minutes || 0))[0].subject
    : null

  // 漂移判定：考试 < 60 天，主修学科占比 > 60% 但学生学习总科目 ≥ 2
  let drift_warning: string | null = null
  if (exam && exam.days_left > 0 && exam.days_left < 60 && primary_subject && totalMin > 60) {
    const primaryPct = recent_distribution[primary_subject]
    if (primaryPct >= 60 && Object.keys(recent_distribution).length >= 2) {
      const others = Object.entries(recent_distribution)
        .filter(([s]) => s !== primary_subject)
        .map(([s, p]) => `${s}(${p}%)`)
        .join('、')
      drift_warning = `近14天 ${primary_subject} 占 ${primaryPct}%，其他：${others}；距 ${exam.type} 仅 ${exam.days_left} 天`
    }
  }

  // 上次未解决悬念：最近一次 explanation_log 中 understood=false 的项
  let unresolved_from_last: string | null = null
  try {
    const expRows = db.prepare(
      `SELECT topic, subject, explanation_log
       FROM KnowledgePoint
       WHERE student_id=? AND delete_flag=0 AND explanation_log IS NOT NULL
       ORDER BY update_time DESC LIMIT 5`
    ).all(studentId) as Array<{ topic: string; subject: string; explanation_log: string | null }>

    for (const row of expRows) {
      if (!row.explanation_log) continue
      try {
        const logs = JSON.parse(row.explanation_log) as Array<{
          method?: string; understood?: boolean; root_cause?: string; date?: number
        }>
        const lastEntry = logs[logs.length - 1]
        if (lastEntry && lastEntry.understood === false) {
          const cause = lastEntry.root_cause ? `（${lastEntry.root_cause}）` : ''
          unresolved_from_last = `${row.topic}${cause} — 上次未理清`
          break
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  // 紧迫度
  const reasons: string[] = []
  let level: UrgencyLevel = 'normal'

  if (exam && exam.days_left > 0) {
    if (exam.days_left < 30) { reasons.push(`距 ${exam.type} 仅 ${exam.days_left} 天`); level = 'urgent' }
    else if (exam.days_left < 90) { reasons.push(`距 ${exam.type} ${exam.days_left} 天`); level = 'attention' }
  }

  if (days_since_active !== null && days_since_active >= 3) {
    reasons.push(`已 ${days_since_active} 天未学习`)
    if (level === 'normal') level = 'attention'
  }

  if (due_reviews.length >= 3) {
    reasons.push(`${due_reviews.length} 个知识点接近遗忘临界`)
    if (level === 'normal') level = 'attention'
  }

  if (persistent_blocks.length >= 2) {
    reasons.push(`${persistent_blocks.length} 个持续卡点`)
  }

  if (drift_warning) reasons.push('学科分布漂移')

  if (reasons.length === 0 && days_since_active === null) level = 'idle'

  // 摘要（用于 prompt 注入）
  const lines: string[] = []
  if (exam) lines.push(`距 ${exam.type} ${exam.days_left} 天（${new Date(exam.date).toLocaleDateString('zh-CN')}）`)
  if (days_since_active !== null) {
    lines.push(days_since_active === 0 ? '今天已有学习记录' : `上次学习：${days_since_active} 天前`)
  }
  if (due_reviews.length > 0) {
    const head = due_reviews.slice(0, 3)
      .map(d => `${d.topic}（保留率${(d.retention * 100).toFixed(0)}%）`)
      .join('、')
    lines.push(`待复习：${head}`)
  }
  if (persistent_blocks.length > 0) {
    const head = persistent_blocks.slice(0, 3)
      .map(b => b.root_cause ? `${b.topic}（${b.root_cause}）` : b.topic)
      .join('、')
    lines.push(`持续卡点：${head}`)
  }
  if (unresolved_from_last) lines.push(`上次悬念：${unresolved_from_last}`)
  if (drift_warning) lines.push(`漂移：${drift_warning}`)

  const today_priority = lines.length > 0 ? lines.join('；') : '暂无紧迫事项'

  return {
    generated_at: now,
    days_since_active,
    exam,
    due_reviews,
    persistent_blocks,
    subject_drift: { recent_distribution, primary_subject, drift_warning },
    unresolved_from_last,
    urgency: { level, reasons },
    today_priority
  }
}

// ────────────────────────────────────────────────────────
// 持久化
// ────────────────────────────────────────────────────────

export function saveSobrietySnapshot(studentId: string, snap: SobrietySnapshot): void {
  const db = getDB()
  const json = JSON.stringify(snap)
  const existing = db.prepare(
    `SELECT student_id FROM SobrietySnapshot WHERE student_id=?`
  ).get(studentId)

  if (existing) {
    db.prepare(
      `UPDATE SobrietySnapshot SET snapshot=?, generated_at=?, last_urgency=? WHERE student_id=?`
    ).run(json, snap.generated_at, snap.urgency.level, studentId)
  } else {
    db.prepare(
      `INSERT INTO SobrietySnapshot (student_id, snapshot, generated_at, last_urgency) VALUES (?, ?, ?, ?)`
    ).run(studentId, json, snap.generated_at, snap.urgency.level)
  }
}

export function getSobrietySnapshot(studentId: string): SobrietySnapshot | null {
  const db = getDB()
  const row = db.prepare(
    `SELECT snapshot FROM SobrietySnapshot WHERE student_id=?`
  ).get(studentId) as { snapshot: string } | undefined
  if (!row) return null
  try { return JSON.parse(row.snapshot) as SobrietySnapshot } catch { return null }
}

export function refreshSobrietySnapshot(studentId: string): SobrietySnapshot {
  const snap = generateSobrietySnapshot(studentId)
  saveSobrietySnapshot(studentId, snap)
  return snap
}

// ────────────────────────────────────────────────────────
// 上次紧迫度 — 用于判断"是否新升级到 urgent"，避免重复推送
// ────────────────────────────────────────────────────────

export function getLastUrgency(studentId: string): UrgencyLevel | null {
  const db = getDB()
  const row = db.prepare(
    `SELECT last_urgency FROM SobrietySnapshot WHERE student_id=?`
  ).get(studentId) as { last_urgency: string | null } | undefined
  return (row?.last_urgency ?? null) as UrgencyLevel | null
}

export function markNotified(studentId: string): void {
  const db = getDB()
  db.prepare(
    `UPDATE SobrietySnapshot SET notified_at=? WHERE student_id=?`
  ).run(Date.now(), studentId)
}

// 缓存若超过 maxAgeMs 就强制刷新；否则返回缓存
export function getOrRefreshSnapshot(studentId: string, maxAgeMs = 30 * 60 * 1000): SobrietySnapshot {
  const cached = getSobrietySnapshot(studentId)
  if (cached && Date.now() - cached.generated_at < maxAgeMs) return cached
  return refreshSobrietySnapshot(studentId)
}
