import { getDB } from '../database'

export interface AgentContextData {
  studentId: string
  studentName: string
  activePlan: { title: string; description: string | null; subjects: string[] } | null
  weakPoints: Array<{ topic: string; subject: string; confidence: number }>
  recentRecords: Array<{ subject: string; topic: string; score: number | null; duration_minutes: number; record_date: number }>
  resources: Array<{ file_name: string; subject: string | null }>
  recentSuggestions: string[]
  sobriety: any
}

export function buildContext(studentId: string): AgentContextData {
  const db = getDB()

  // 活跃计划
  const plan = db.prepare(
    "SELECT title, description, subjects FROM Plan WHERE student_id = ? AND status = 'active' AND delete_flag = 0 LIMIT 1"
  ).get(studentId) as any

  // 薄弱点
  const weakPoints = db.prepare(
    'SELECT topic, subject, confidence FROM KnowledgePoint WHERE student_id = ? AND delete_flag = 0 AND confidence < 0.5 ORDER BY confidence ASC LIMIT 10'
  ).all(studentId) as any[]

  // 最近学习记录
  const recentRecords = db.prepare(
    'SELECT subject, topic, score, duration_minutes, record_date FROM LearningRecord WHERE student_id = ? AND delete_flag = 0 ORDER BY record_date DESC LIMIT 20'
  ).all(studentId) as any[]

  // 资源
  const resources = db.prepare(
    'SELECT file_name, subject FROM Resource WHERE uploader_id = ? AND delete_flag = 0 ORDER BY create_time DESC LIMIT 20'
  ).all(studentId) as any[]

  // 最近 Agent 建议
  const recentLogs = db.prepare(
    "SELECT action_detail FROM AgentLog WHERE student_id = ? AND status = 'success' AND delete_flag = 0 ORDER BY create_time DESC LIMIT 5"
  ).all(studentId) as any[]

  // 清醒快照
  const snapshot = db.prepare(
    'SELECT snapshot FROM SobrietySnapshot WHERE student_id = ?'
  ).get(studentId) as any

  // 学生名
  const student = db.prepare(
    'SELECT display_name FROM User WHERE id = ? AND delete_flag = 0'
  ).get(studentId) as any

  return {
    studentId,
    studentName: student?.display_name || '学生',
    activePlan: plan ? { title: plan.title, description: plan.description, subjects: JSON.parse(plan.subjects || '[]') } : null,
    weakPoints: weakPoints || [],
    recentRecords: recentRecords || [],
    resources: resources || [],
    recentSuggestions: (recentLogs || []).map((l: any) => l.action_detail).filter(Boolean),
    sobriety: snapshot ? JSON.parse(snapshot.snapshot) : null,
  }
}
